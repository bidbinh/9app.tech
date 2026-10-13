import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, tx, query, close } from '../src/db.js';

after(close);

test('migrate chạy hai lần không lỗi', async () => {
  await migrate();
  await migrate();
  const r = await query('SELECT count(*)::int AS n FROM schema_migrations');
  assert.ok(r[0].n >= 1);
});

test('tx rollback khi ném lỗi', async () => {
  await migrate();
  const phone = 'rollback-' + Date.now();
  await assert.rejects(tx(async (c) => {
    await c.query('INSERT INTO users(phone) VALUES($1)', [phone]);
    throw new Error('boom');
  }), /boom/);
  const r = await query('SELECT 1 FROM users WHERE phone=$1', [phone]);
  assert.equal(r.length, 0);
});

test('sổ cái không cho sửa hoặc xóa', async () => {
  await migrate();
  const [t] = await query(
    "INSERT INTO ledger_transactions(kind, idem_scope, idem_key, payload_hash) VALUES('x','t',$1,'h') RETURNING id",
    ['k' + Date.now()],
  );
  await assert.rejects(query('DELETE FROM ledger_transactions WHERE id=$1', [t.id]), /append-only/);
});
