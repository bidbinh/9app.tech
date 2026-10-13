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
  if (!pool) pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  return pool;
}

export async function query(sql, params) {
  const r = await getPool().query(sql, params);
  return r.rows;
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
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const dir = path.join(here, '..', 'db');
  const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  await query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
  for (const f of files) {
    const done = await query('SELECT 1 FROM schema_migrations WHERE name=$1', [f]);
    if (done.length) continue;
    await tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(9001)');
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
    });
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
