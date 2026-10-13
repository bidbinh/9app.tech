// Luồng chính end-to-end trên PostgreSQL thật
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeTeam, mealToPayment, ok, db, Client, bankFor } from './helper.js';

before(boot);
after(shutdown);

test('luồng đầy đủ: nhóm, bình chọn, gom món, chia tiền, QR, đã chuyển, đã nhận, sổ nợ', async () => {
  const team = await makeTeam(['Chủ', 'An', 'Bình']);
  const [chu, an, binh] = team.clients;
  const m = await ok(chu.post(`/api/teams/${team.teamId}/meals`, {}));
  const id = m.mealId;
  const p1 = (await ok(chu.post(`/api/meals/${id}/proposals`, { name: 'Phở Thìn', url: 'https://example.com/pho' }))).proposalId;
  const p2 = (await ok(an.post(`/api/meals/${id}/proposals`, { name: 'Cơm Tấm' }))).proposalId;
  await ok(chu.post(`/api/meals/${id}/vote`, { proposalId: p1 }));
  await ok(an.post(`/api/meals/${id}/vote`, { proposalId: p2 }));
  await ok(binh.post(`/api/meals/${id}/vote`, { proposalId: p2 }));
  await ok(chu.post(`/api/meals/${id}/vote`, { proposalId: p2 })); // đổi phiếu
  let v = (await ok(an.get(`/api/meals/${id}`))).meal;
  assert.equal(v.proposals.find((p) => p.id === p2).votes, 3);
  assert.equal(v.proposals.find((p) => p.id === p1).votes, 0);
  v = (await ok(chu.post(`/api/meals/${id}/status`, { to: 'dat_mon' }))).meal;
  assert.equal(v.venue.name, 'Cơm Tấm');
  await ok(chu.post(`/api/meals/${id}/items`, { name: 'Sườn', price: 45000, qty: 1 }));
  await ok(an.post(`/api/meals/${id}/items`, { name: 'Sườn bì', price: 50000, qty: 2, note: 'ít cay' }));
  await ok(binh.post(`/api/meals/${id}/items`, { name: 'Canh', price: 15000, qty: 1 }));
  await ok(chu.post(`/api/meals/${id}/settings`, { payerId: team.ids['Chủ'], fees: { ship: 20000, service: 5000, discount: 10000 } }));
  v = (await ok(chu.post(`/api/meals/${id}/status`, { to: 'thanh_toan' }))).meal;
  const total = 45000 + 100000 + 15000 + 20000 + 5000 - 10000;
  assert.equal(v.charges.reduce((s, c) => s + c.amount, 0), total);
  const ca = v.charges.find((c) => c.memberName === 'An');
  assert.equal(ca.status, 'chua_tra');
  const anView = (await ok(an.get(`/api/meals/${id}`))).meal;
  const mine = anView.charges.find((c) => c.mine);
  assert.ok(mine.pay && mine.pay.account === bankFor(0).account);
  const qr = await an.get('/' + 'api/charges/' + mine.id + '/qr.png?v=1', { raw: true });
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  await ok(an.post(`/api/charges/${mine.id}/paid`));
  await ok(an.post(`/api/charges/${mine.id}/paid`)); // bấm hai lần
  await ok(chu.post(`/api/charges/${mine.id}/received`));
  const debts = await ok(chu.get(`/api/teams/${team.teamId}/debts`));
  assert.equal(debts.items.length, 1); // chỉ còn Bình
  assert.equal(debts.items[0].fromName, 'Bình');
  await ok(chu.post(`/api/meals/${id}/status`, { to: 'xong' }));
  const stats = await ok(chu.get(`/api/teams/${team.teamId}/stats`));
  assert.equal(stats.meals[0].venueName, 'Cơm Tấm');
  const me = await ok(binh.get('/api/me'));
  assert.equal(me.teams[0].owe, debts.items[0].amount);
  assert.ok(await db.query('SELECT 1 FROM charge_events WHERE action=$1', ['da_nhan']));
});
