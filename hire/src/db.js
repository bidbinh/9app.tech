import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// BIGINT -> Number (tiền VND nằm trong vùng số nguyên an toàn)
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

const here = path.dirname(fileURLToPath(import.meta.url));
let pool = null;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    // kết nối nhàn rỗi bị ngắt (khởi động lại CSDL, mạng): ghi log, không để sập tiến trình
    pool.on('error', (e) => console.error('[pg] lỗi kết nối nhàn rỗi:', e && e.message));
  }
  return pool;
}

export async function query(sql, params) {
  const r = await getPool().query(sql, params);
  return r.rows;
}

// fn(c) với c.query(sql, params) -> rows. Lỗi bất kỳ thì ROLLBACK.
export async function tx(fn) {
  const client = await getPool().connect();
  const c = { client, query: async (sql, params) => (await client.query(sql, params)).rows };
  try {
    await client.query('BEGIN');
    const out = await fn(c);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* bỏ qua */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const dir = path.join(here, '..', 'db');
  const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  // một khóa tư vấn cho cả phiên: hai bản khởi động đồng thời chạy lần lượt, bản sau thấy bản trước đã làm xong
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
  // TUYỆT ĐỐI không xóa CSDL thật: chỉ chạy khi tên CSDL có 'test' / 'e2e' / 'embedded'
  let name = '';
  try { name = decodeURIComponent(new URL(config.databaseUrl).pathname.slice(1)); } catch { /* sai URL */ }
  if (!/test|e2e|embedded/i.test(name)) throw new Error(`Từ chối xóa dữ liệu: CSDL "${name}" không phải CSDL thử nghiệm (tên phải chứa test, e2e hoặc embedded).`);
  await query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations' LOOP
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    END LOOP; END $$`);
}

export async function close() {
  if (pool) { await pool.end(); pool = null; }
}
