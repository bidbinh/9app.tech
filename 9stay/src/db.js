import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { AppError } from './errors.js';

// BIGINT -> Number (tiền VND nằm trong vùng số nguyên an toàn)
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
// DATE -> chuỗi YYYY-MM-DD (không để pg đổi sang Date theo múi giờ máy)
pg.types.setTypeParser(1082, (v) => v);

const here = path.dirname(fileURLToPath(import.meta.url));
let pool = null;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (e) => console.error('[pg] lỗi kết nối nhàn rỗi:', e && e.message));
  }
  return pool;
}

export async function query(sql, params) {
  const r = await getPool().query(sql, params);
  return r.rows;
}

// Deadlock (40P01) và lỗi tuần tự hóa (40001) là lỗi tạm thời: dịch thành AppError('busy', 409) để lớp trên thử lại.
export function translateError(e) {
  if (e && (e.code === '40P01' || e.code === '40001')) return new AppError('busy', 'Hệ thống đang bận, hãy thử lại', 409);
  return e;
}

// fn(c) với c.query(sql, params) -> rows. Lỗi bất kỳ thì ROLLBACK.
export async function tx(fn) {
  const client = await getPool().connect();
  const c = {
    client,
    query: async (sql, params) => (await client.query(sql, params)).rows,
  };
  try {
    await client.query('BEGIN');
    const out = await fn(c);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* bỏ qua */ }
    throw translateError(e);
  } finally {
    client.release();
  }
}

export async function migrate() {
  const dir = path.join(here, '..', 'db');
  const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  // một khóa tư vấn cho cả phiên: hai bản khởi động đồng thời chạy lần lượt
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock(9201)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
    for (const f of files) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f])).rows.length) continue;
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(9201)').catch(() => {});
    client.release();
  }
}

export async function resetForTests() {
  await query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations' LOOP
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    END LOOP; END $$`);
}

export async function close() {
  if (pool) { await pool.end(); pool = null; }
}
