import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown } from './helper.js';
import { startServer, apiWorld, as } from './helper-http.js';
import { accountBalance } from '../src/ledger.js';

before(boot);
after(shutdown);
let srv, w;
beforeEach(async () => {
  await db.resetForTests();
  w = await apiWorld();
  srv = await startServer();
});
test.afterEach(async () => { if (srv) await srv.close(); srv = null; });

const bal = (account, partyId) => db.tx((c) => accountBalance(c, { orgId: w.orgId, account, partyId }));
const ok = (r, label) => { assert.equal(r.status, 200, `${label}: ${r.status} ${r.text}`); return r.json; };

test('một đơn của CTV từ báo giá tới bản kê: CTV báo giá và đặt, lễ tân thu cọc/nhận/trả phòng, quản lý chốt bản kê và chi trả, chủ xem bản kê của mình', async () => {
  const ctv = as(srv, w, 'ctv1');
  const letan = as(srv, w, 'letan');
  const quanly = as(srv, w, 'quanly');

  // 1. CTV: tìm phòng, báo giá, đặt theo loại phòng
  const av = ok(await ctv.get('/api/availability?checkin=2026-11-12&checkout=2026-11-14&adults=2'), 'availability');
  assert.equal(av.roomTypes[0].free, 3);
  const quote = ok(await ctv.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', adults: 2 }), 'quote');
  assert.deepEqual({ subtotal: quote.subtotal, vat: quote.vat, total: quote.total, deposit: quote.deposit, commission: quote.commission }, { subtotal: 1300000, vat: 130000, total: 1430000, deposit: 429000, commission: 130000 });
  const made = ok(await ctv.post('/api/bookings', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Nguyễn Văn Lan', guestPhone: '0901234567', adults: 2, quoteId: quote.id }), 'book').booking;
  assert.equal(made.status, 'giu');
  assert.equal(made.depositRequired, 429000);
  assert.equal(made.due, 1430000);

  // 2. Lễ tân: thấy căn được gán, thu cọc → da_coc
  const seen = ok(await letan.get(`/api/bookings/${made.id}`), 'staff get');
  assert.equal(seen.booking.unitCode, 'A1205');
  assert.equal(seen.lines.length, 3);
  const dep = ok(await letan.post(`/api/bookings/${made.id}/payments`, { kind: 'deposit', amount: 429000, receivedOn: '2026-10-14', ref: 'ck-001' }), 'deposit');
  assert.equal(dep.bookingStatus, 'da_coc');
  // gửi lại cùng ref (mất mạng, bấm lại): không cộng hai lần
  const dup = ok(await letan.post(`/api/bookings/${made.id}/payments`, { kind: 'deposit', amount: 429000, receivedOn: '2026-10-14', ref: 'ck-001' }), 'deposit again');
  assert.equal(dup.created, false);
  assert.equal(ok(await letan.get(`/api/bookings/${made.id}/balance`), 'balance').paid, 429000);

  // 3. Còn nợ thì chưa trả phòng được; thu nốt rồi mới được
  ok(await letan.post(`/api/bookings/${made.id}/checkin`), 'checkin');
  const blocked = await letan.post(`/api/bookings/${made.id}/checkout`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.error.code, 'balance_due');
  assert.equal(blocked.json.error.detail.due, 1001000);
  ok(await letan.post(`/api/bookings/${made.id}/payments`, { kind: 'payment', amount: 1001000, receivedOn: '2026-11-14', ref: 'ck-002' }), 'rest');
  const out = ok(await letan.post(`/api/bookings/${made.id}/checkout`), 'checkout');
  assert.equal(out.status, 'da_tra');

  // 4. Sổ: tiền khách chuyển thành phần chủ / Anstay / VAT / hoa hồng / phí dọn
  assert.equal(await bal('bank'), 1430000);
  assert.equal(await bal('guest_deposit_liability'), 0);
  assert.equal(await bal('held_for_owner', w.ownerId), -760000); // 910.000 trừ phí dọn 150.000
  assert.equal(await bal('anstay_revenue'), -390000);
  assert.equal(await bal('vat_payable'), -130000);
  assert.equal(await bal('agent_commission_payable', w.ag1), -130000);

  // 5. Quản lý: xem trước, đóng băng, chi trả, CSV, báo cáo tiền giữ hộ
  const period = 'from=2026-10-01&to=2026-11-01';
  const preview = ok(await quanly.get(`/api/statements/owner?ownerId=${w.ownerId}&${period}`), 'preview');
  assert.deepEqual(preview.totals, { room: 1300000, owner: 910000, cleaning: 150000, carried: 0, payable: 760000 });
  const st = ok(await quanly.post('/api/statements/owner/freeze', { ownerId: w.ownerId, from: '2026-10-01', to: '2026-11-01' }), 'freeze');
  assert.equal(st.payable, 760000);
  assert.equal((await quanly.post('/api/statements/owner/freeze', { ownerId: w.ownerId, from: '2026-10-01', to: '2026-11-01' })).json.error.code, 'empty_statement');
  const pay = ok(await quanly.post(`/api/statements/owner/${st.id}/payout`, { paidOn: '2026-11-05', ref: 'chi-chu-001' }), 'payout');
  assert.equal(pay.amount, 760000);
  assert.equal(ok(await quanly.post(`/api/statements/owner/${st.id}/payout`, { paidOn: '2026-11-05', ref: 'chi-chu-001' }), 'payout again').created, false);
  assert.equal(await bal('held_for_owner', w.ownerId), 0);
  assert.equal(await bal('bank'), 1430000 - 760000);

  // 6. Chủ phòng: thấy bản kê của mình (CSV có BOM, mã đơn, tổng), chủ khác không thấy
  const chu1 = as(srv, w, 'chu1');
  const list = ok(await chu1.get('/api/statements/owner/list'), 'owner list');
  assert.equal(list.statements.length, 1);
  assert.equal(list.statements[0].paid, true);
  const csv = await chu1.get(`/api/statements/owner/${st.id}/csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  assert.ok(csv.text.startsWith('﻿Mã đơn,'));
  assert.ok(csv.text.includes('TỔNG,,1300000,910000,150000,760000'));
  assert.equal((await as(srv, w, 'chu2').get(`/api/statements/owner/${st.id}/csv`)).status, 404);
  assert.equal((await as(srv, w, 'ctv1').get(`/api/statements/owner/${st.id}/csv`)).status, 403);
  assert.equal((await as(srv, w, 'chu2').get('/api/statements/owner/list')).json.statements.length, 0);

  // 7. Hoa hồng: CTV xem bản kê của mình; quản lý chốt và chi
  const mine = ok(await ctv.get('/api/statements/agent?from=2026-10-01&to=2026-11-01'), 'agent preview');
  assert.equal(mine.totals.payable, 130000);
  assert.equal((await as(srv, w, 'ctv2').get(`/api/statements/agent?agentId=${w.ag1}&from=2026-10-01&to=2026-11-01`)).status, 404);
  const ast = ok(await quanly.post('/api/statements/agent/freeze', { agentId: w.ag1, from: '2026-10-01', to: '2026-11-01' }), 'agent freeze');
  ok(await quanly.post(`/api/statements/agent/${ast.id}/payout`, { paidOn: '2026-11-05', ref: 'chi-ctv-001' }), 'agent payout');
  assert.equal(await bal('agent_commission_payable', w.ag1), 0);

  // 8. Báo cáo tiền giữ hộ khớp sổ
  const rep = ok(await quanly.get('/api/reports/custody'), 'custody');
  assert.equal(rep.owedToOwners, 0);
  assert.equal(rep.bank, 1430000 - 760000 - 130000);
  assert.equal(rep.vatPayable, 130000);
  assert.equal(rep.cleaningPayable, 150000);
  const [t] = await db.query('SELECT COALESCE(SUM(amount),0)::bigint AS t FROM ledger_entries');
  assert.equal(t.t, 0);
});

test('hai CTV tranh nhau căn cuối cùng cùng đêm: đúng một người đặt được, người kia nhận lỗi hết phòng', async () => {
  const qm = as(srv, w, 'quanly');
  // chặn bớt để chỉ còn đúng một căn Deluxe trống đêm 20/11
  ok(await qm.post(`/api/units/${w.unitId}/release`, { action: 'block', from: '2026-11-20', to: '2026-11-21', kind: 'blocked_by_anstay' }), 'block 1');
  ok(await qm.post(`/api/units/${w.unit2Id}/release`, { action: 'block', from: '2026-11-20', to: '2026-11-21', kind: 'blocked_by_anstay' }), 'block 2');
  const body = (name) => ({ roomTypeId: w.roomTypeId, checkin: '2026-11-20', checkout: '2026-11-21', guestName: name, adults: 1 });
  const rs = await Promise.all([as(srv, w, 'ctv1').post('/api/bookings', body('A')), as(srv, w, 'ctv2').post('/api/bookings', body('B')), as(srv, w, 'letan').post('/api/bookings', body('C'))]);
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  for (const r of rs.filter((x) => x.status !== 200)) {
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'no_availability');
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM room_nights WHERE night='2026-11-20' AND active"))[0].n, 1);
});

test('lỗi nghiệp vụ qua HTTP có mã trạng thái đúng: ngày quá khứ 400, hết hạn báo giá 409, báo giá dùng lại 409', async () => {
  const ctv = as(srv, w, 'ctv1');
  const past = await ctv.post('/api/bookings', { roomTypeId: w.roomTypeId, checkin: '2026-10-01', checkout: '2026-10-03', guestName: 'K', adults: 1 });
  assert.equal(past.status, 400);
  assert.equal(past.json.error.code, 'past_date');
  const quote = ok(await ctv.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', adults: 2 }), 'quote');
  const body = { roomTypeId: w.roomTypeId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 2, quoteId: quote.id };
  ok(await ctv.post('/api/bookings', body), 'first');
  const again = await ctv.post('/api/bookings', body);
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, 'quote_used');
  const miss = await ctv.post('/api/quotes', { roomTypeId: w.roomTypeId, checkin: '2026-12-05', checkout: '2026-12-07', adults: 2 });
  assert.equal(miss.status, 200);
  assert.equal(miss.json.ok, false);
  assert.equal(miss.json.warnings[0].code, 'missing_price');
});
