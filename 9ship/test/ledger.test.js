import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tx, query } from '../src/db.js';
import * as ledger from '../src/ledger.js';
import { setup, makeUser, close } from './helpers.js';

after(close);
before(setup);

async function fund(userId, amount, key) {
  return tx(async (c) => {
    const w = await ledger.lockWallet(c, userId);
    const bank = await ledger.systemAccount(c, 'bank');
    return ledger.post(c, {
      kind: 'topup', idemScope: 'test-fund', idemKey: key,
      entries: [{ accountId: bank, amount }, { accountId: w, amount: -amount }],
    });
  });
}

async function hold(userId, amount, key) {
  return tx(async (c) => {
    const w = await ledger.lockWallet(c, userId);
    const h = await ledger.userAccount(c, userId, 'user_hold');
    return ledger.post(c, {
      kind: 'hold', idemScope: 'test-hold', idemKey: key,
      entries: [{ accountId: w, amount }, { accountId: h, amount: -amount }],
    });
  });
}

test('tổng khác 0 bị từ chối', async () => {
  const u = await makeUser('0911000001');
  await assert.rejects(tx(async (c) => {
    const w = await ledger.userAccount(c, u, 'user_wallet');
    const b = await ledger.systemAccount(c, 'bank');
    return ledger.post(c, { kind: 'topup', idemScope: 's', idemKey: 'k1', entries: [{ accountId: b, amount: 100 }, { accountId: w, amount: -90 }] });
  }), /tổng giao dịch/);
});

test('số tiền không phải số nguyên bị từ chối', async () => {
  const u = await makeUser('0911000002');
  await assert.rejects(tx(async (c) => {
    const w = await ledger.userAccount(c, u, 'user_wallet');
    const b = await ledger.systemAccount(c, 'bank');
    return ledger.post(c, { kind: 'topup', idemScope: 's', idemKey: 'k2', entries: [{ accountId: b, amount: 10.5 }, { accountId: w, amount: -10.5 }] });
  }), /số nguyên/);
});

test('nạp tiền tăng số dư; lặp cùng khóa không ghi thêm', async () => {
  const u = await makeUser('0911000003');
  const a = await fund(u, 100000, 'f1');
  const b = await fund(u, 100000, 'f1');
  assert.equal(a.replay, false);
  assert.equal(b.replay, true);
  assert.equal(a.txId, b.txId);
  const bal = await tx((c) => ledger.walletBalance(c, u));
  assert.equal(bal, 100000);
});

test('cùng khóa khác nội dung trả 409', async () => {
  const u = await makeUser('0911000004');
  await fund(u, 5000, 'f2');
  await assert.rejects(fund(u, 6000, 'f2'), (e) => e.status === 409 && e.code === 'idempotency_conflict');
});

test('ví không âm: giữ quá số dư bị từ chối (402)', async () => {
  const u = await makeUser('0911000005');
  await fund(u, 1000, 'f3');
  await assert.rejects(hold(u, 1500, 'h3'), (e) => e.status === 402);
  const bal = await tx((c) => ledger.walletBalance(c, u));
  assert.equal(bal, 1000);
});

test('hai yêu cầu giữ tiền song song, chỉ đủ cho một: đúng một thành công', async () => {
  const u = await makeUser('0911000006');
  await fund(u, 100000, 'f4');
  const results = await Promise.allSettled([hold(u, 60000, 'p1'), hold(u, 60000, 'p2')]);
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const bad = results.filter((r) => r.status === 'rejected');
  assert.equal(ok, 1);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason.status, 402);
  const bal = await tx((c) => ledger.walletBalance(c, u));
  assert.equal(bal, 40000);
});

test('20 yêu cầu song song không bao giờ làm ví âm', async () => {
  const u = await makeUser('0911000007');
  await fund(u, 50000, 'f5');
  const rs = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => hold(u, 7000, 'many' + i)));
  const ok = rs.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, 7); // 7 x 7000 = 49000 <= 50000
  const bal = await tx((c) => ledger.walletBalance(c, u));
  assert.equal(bal, 50000 - 7 * 7000);
});

test('adjustment được phép đẩy ví âm tới trần, vượt trần thì chặn', async () => {
  const u = await makeUser('0911000008');
  await fund(u, 1000, 'f6');
  const adj = (amount, key) => tx(async (c) => {
    const w = await ledger.lockWallet(c, u);
    const cost = await ledger.systemAccount(c, 'carrier_cost');
    return ledger.post(c, { kind: 'adjustment', idemScope: 'adj', idemKey: key, entries: [{ accountId: w, amount }, { accountId: cost, amount: -amount }] });
  });
  // tăng nợ ví: ví là tài khoản có, ghi NỢ ví làm giảm số dư
  await adj(30000, 'a1');
  assert.equal(await tx((c) => ledger.walletBalance(c, u)), 1000 - 30000);
  await assert.rejects(adj(30000, 'a2'), (e) => e.status === 402);
});

test('audit: mọi giao dịch cân bằng và tổng sổ bằng 0', async () => {
  const r = await tx((c) => ledger.audit(c));
  assert.deepEqual(r.unbalanced, []);
  assert.equal(r.total, 0);
});
