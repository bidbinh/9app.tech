import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed } from './helper.js';
import { postTransaction, accountBalance } from '../src/ledger.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const post = (over = {}) => db.tx((c) => postTransaction(c, {
  orgId: w.orgId, kind: 'test', ref: 'r1', entries: [{ account: 'bank', amount: 100000 }, { account: 'guest_deposit_liability', amount: -100000 }], ...over,
}));
const fail = (p, code) => assert.rejects(p, (e) => e.code === code, 'mong đợi lỗi ' + code);

test('giao dịch cân bằng được ghi, số dư có dấu: nợ dương, có âm', async () => {
  const r = await post();
  assert.equal(r.created, true);
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'bank' })), 100000);
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'guest_deposit_liability' })), -100000);
});

test('giao dịch lệch, thiếu dòng, tài khoản lạ, số tiền 0 hoặc lẻ bị từ chối', async () => {
  await fail(post({ entries: [{ account: 'bank', amount: 100 }, { account: 'guest_deposit_liability', amount: -99 }] }), 'unbalanced');
  await fail(post({ entries: [{ account: 'bank', amount: 0 }, { account: 'guest_deposit_liability', amount: 0 }] }), 'bad_ledger');
  await fail(post({ entries: [{ account: 'bank', amount: 1.5 }, { account: 'guest_deposit_liability', amount: -1.5 }] }), 'bad_ledger');
  await fail(post({ entries: [{ account: 'bank', amount: 100 }] }), 'bad_ledger');
  await fail(post({ entries: [{ account: 'quy_den', amount: 100 }, { account: 'bank', amount: -100 }] }), 'bad_ledger');
  await fail(post({ ref: '' }), 'bad_ledger');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ledger_transactions'))[0].n, 0);
});

test('idempotent theo ref: ghi lại cùng ref không thêm dòng nào và trả giao dịch cũ', async () => {
  const a = await post();
  const b = await post();
  assert.equal(b.created, false);
  assert.equal(b.id, a.id);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ledger_entries'))[0].n, 2);
});

test('hai giao dịch đồng thời cùng ref: đúng một cái được ghi', async () => {
  const rs = await Promise.all(Array.from({ length: 5 }, () => post({ ref: 'dong-thoi' })));
  assert.equal(rs.filter((r) => r.created).length, 1);
  assert.equal(new Set(rs.map((r) => r.id)).size, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ledger_entries'))[0].n, 2);
});

test('CSDL từ chối giao dịch lệch ghi thẳng bằng SQL (ràng buộc hoãn tới COMMIT)', async () => {
  await assert.rejects(
    db.tx(async (c) => {
      const [t] = await c.query("INSERT INTO ledger_transactions(org_id, kind, ref) VALUES($1, 'x', 'sql-lech') RETURNING id", [w.orgId]);
      await c.query("INSERT INTO ledger_entries(org_id, tx_id, account, amount) VALUES($1, $2, 'bank', 500)", [w.orgId, t.id]);
    }),
    (e) => e.code === '23514',
  );
  assert.equal((await db.query('SELECT count(*)::int AS n FROM ledger_transactions'))[0].n, 0);
});

test('sổ chỉ thêm: không sửa, không xóa', async () => {
  await post();
  await assert.rejects(db.query('UPDATE ledger_entries SET amount = amount + 1'), (e) => e.code === '55000');
  await assert.rejects(db.query('DELETE FROM ledger_entries'), (e) => e.code === '55000');
  await assert.rejects(db.query("UPDATE ledger_transactions SET memo = 'sua'"), (e) => e.code === '55000');
  await assert.rejects(db.query('DELETE FROM ledger_transactions'), (e) => e.code === '55000');
});

test('accountBalance theo đối tượng và tổng hợp mọi đối tượng', async () => {
  const o1 = w.ownerId;
  const o2 = (await db.query("INSERT INTO owners(org_id,kind,name) VALUES($1,'ca_nhan','Lan') RETURNING id", [w.orgId]))[0].id;
  await post({ ref: 'a', entries: [{ account: 'bank', amount: -300 }, { account: 'held_for_owner', partyId: o1, amount: 300 }] });
  await post({ ref: 'b', entries: [{ account: 'bank', amount: -200 }, { account: 'held_for_owner', partyId: o2, amount: 200 }] });
  const bal = (partyId) => db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'held_for_owner', partyId }));
  assert.equal(await bal(o1), 300);
  assert.equal(await bal(o2), 200);
  assert.equal(await bal(undefined), 500);
  await assert.rejects(db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'held_for_owner', partyId: 'x' })), (e) => e.code === 'bad_id');
  await assert.rejects(db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'khong_co' })), (e) => e.code === 'bad_ledger');
});

test('sổ không lẫn giữa các org', async () => {
  await post();
  const other = (await db.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0].id;
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: other, account: 'bank' })), 0);
  await db.tx((c) => postTransaction(c, { orgId: other, kind: 't', ref: 'r1', entries: [{ account: 'bank', amount: 5 }, { account: 'receivable', amount: -5 }] })); // cùng ref khác org vẫn ghi được
  assert.equal(await db.tx((c) => accountBalance(c, { orgId: w.orgId, account: 'bank' })), 100000);
});
