import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, NOW } from './helper.js';
import { bookedWorld, settleNew } from './fixtures.js';
import { checkIn, checkOut } from '../src/stay.js';
import { createContract, createOwner, createUnit } from '../src/inventory.js';
import { createAgent } from '../src/agents.js';
import { accountBalance } from '../src/ledger.js';
import {
  ownerStatement, freezeOwnerStatement, recordOwnerPayout, agentStatement, freezeAgentStatement, recordAgentPayout, toCsv, statementCsv, custodyReport,
} from '../src/statements.js';

before(boot);
after(shutdown);
beforeEach(async () => { await db.resetForTests(); });

const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);
const bal = (w, account, partyId) => db.tx((c) => accountBalance(c, { orgId: w.orgId, account, partyId }));

// S1: 3 đêm trả 15/11 (chủ 1.365.000, dọn 150.000, hoa hồng 195.000). S2: 2 đêm trả 22/11. S3: 2 đêm trả 27/11 (chủ 910.000, dọn 150.000, hoa hồng 130.000 mỗi đơn).
async function world() {
  const w = await bookedWorld({ pay: 'full' });
  await db.tx((c) => checkIn(c, { orgId: w.orgId, bookingId: w.booking.id }));
  const out1 = await db.tx((c) => checkOut(c, { orgId: w.orgId, bookingId: w.booking.id }, { now: new Date('2026-11-15T05:00:00Z') }));
  const s2 = await settleNew(w, { checkin: '2026-11-20', checkout: '2026-11-22', outOn: '2026-11-22', agentId: w.agent.id, ref: 's2' });
  const s3 = await settleNew(w, { checkin: '2026-11-25', checkout: '2026-11-27', outOn: '2026-11-27', agentId: w.agent.id, ref: 's3' });
  return { ...w, s1Id: out1.settlementId, s2Id: s2.settlementId, s3Id: s3.settlementId };
}
const A = { from: '2026-11-01', to: '2026-11-25' };
const B = { from: '2026-11-25', to: '2026-12-01' };
const owner = (w, p) => ({ orgId: w.orgId, ownerId: w.ownerId, ...p });

test('xem trước kỳ A: hai quyết toán đầu, tổng đúng', async () => {
  const w = await world();
  const { lines, totals } = await db.tx((c) => ownerStatement(c, owner(w, A)));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => l.checkout_date), ['2026-11-15', '2026-11-22']);
  assert.deepEqual(totals, { room: 3250000, owner: 2275000, cleaning: 300000, carried: 0, payable: 1975000 });
  // xem trước không lưu gì
  assert.equal((await db.query('SELECT count(*)::int AS n FROM owner_statements'))[0].n, 0);
});

test('đóng băng kỳ A rồi kỳ B: mỗi quyết toán đúng một bản kê; tổng các bản kê bằng tổng quyết toán', async () => {
  const w = await world();
  const a = await db.tx((c) => freezeOwnerStatement(c, owner(w, A)));
  assert.equal(a.lineCount, 2);
  assert.equal(a.payable, 1975000);
  await fail(db.tx((c) => freezeOwnerStatement(c, owner(w, A))), 'empty_statement', 409);
  const b = await db.tx((c) => freezeOwnerStatement(c, owner(w, B)));
  assert.equal(b.lineCount, 1);
  const [t] = await db.query('SELECT SUM(room_revenue)::bigint AS room, SUM(owner_amount)::bigint AS owner FROM settlements');
  assert.equal(a.room + b.room, t.room);
  assert.equal(a.owner + b.owner, t.owner);
  const dup = await db.query('SELECT settlement_id FROM owner_statement_lines GROUP BY settlement_id HAVING count(*) > 1');
  assert.equal(dup.length, 0);
});

test('quyết toán đến sau khi đã đóng băng kỳ chồng lên thì vào bản kê kế tiếp, không lặp', async () => {
  const w = await world();
  await db.tx((c) => freezeOwnerStatement(c, owner(w, { from: '2026-11-01', to: '2026-12-01' })));
  const s4 = await settleNew(w, { checkin: '2026-11-28', checkout: '2026-11-29', outOn: '2026-11-29', ref: 's4' });
  const next = await db.tx((c) => freezeOwnerStatement(c, owner(w, { from: '2026-11-01', to: '2026-12-01' })));
  assert.equal(next.lineCount, 1);
  const lines = await db.query('SELECT settlement_id FROM owner_statement_lines WHERE statement_id=$1', [next.id]);
  assert.equal(lines[0].settlement_id, s4.settlementId);
});

test('kỳ không có quyết toán, chủ khác, org khác: không lẫn', async () => {
  const w = await world();
  await fail(db.tx((c) => freezeOwnerStatement(c, owner(w, { from: '2027-01-01', to: '2027-02-01' }))), 'empty_statement');
  const o2 = await db.tx((c) => createOwner(c, { orgId: w.orgId, name: 'Lan' }));
  await fail(db.tx((c) => freezeOwnerStatement(c, { orgId: w.orgId, ownerId: o2.id, ...A })), 'empty_statement');
  const other = (await db.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0].id;
  await fail(db.tx((c) => freezeOwnerStatement(c, { orgId: other, ownerId: w.ownerId, ...A })), 'owner_not_found', 404);
  await fail(db.tx((c) => freezeOwnerStatement(c, owner(w, { from: '2026-12-01', to: '2026-11-01' }))), 'bad_dates');
  await fail(db.tx((c) => freezeOwnerStatement(c, { orgId: w.orgId, ownerId: 'xxx', ...A })), 'bad_id');
});

test('ba lần đóng băng đồng thời cùng kỳ: đúng một bản kê, hai lần kia empty_statement', async () => {
  const w = await world();
  const rs = await Promise.allSettled(Array.from({ length: 3 }, () => db.tx((c) => freezeOwnerStatement(c, owner(w, A)))));
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of rs.filter((x) => x.status === 'rejected')) assert.equal(r.reason.code, 'empty_statement');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM owner_statements'))[0].n, 1);
});

test('bản kê đã đóng băng không sửa, không xóa', async () => {
  const w = await world();
  await db.tx((c) => freezeOwnerStatement(c, owner(w, A)));
  await assert.rejects(db.query('UPDATE owner_statements SET payable = 1'), (e) => e.code === '55000');
  await assert.rejects(db.query('DELETE FROM owner_statement_lines'), (e) => e.code === '55000');
});

test('chi trả chủ: nợ held_for_owner, có bank; chi lại (cùng hoặc khác ref) không chi hai lần', async () => {
  const w = await world();
  const st = await db.tx((c) => freezeOwnerStatement(c, owner(w, A)));
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), -(1215000 + 760000 + 760000));
  assert.equal(await bal(w, 'bank'), 2145000 + 1430000 + 1430000);
  const p = await db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-05', ref: 'p1' }));
  assert.deepEqual({ amount: p.amount, created: p.created }, { amount: 1975000, created: true });
  assert.equal(await bal(w, 'held_for_owner', w.ownerId), -760000); // còn đơn S3 chưa kê
  assert.equal(await bal(w, 'bank'), 5005000 - 1975000);
  const again = await db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-05', ref: 'p1' }));
  const other = await db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-06', ref: 'p2' }));
  assert.equal(again.created, false);
  assert.equal(other.created, false);
  assert.equal(await bal(w, 'bank'), 5005000 - 1975000);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM owner_payouts'))[0].n, 1);
});

test('chi trả đồng thời: đúng một lần', async () => {
  const w = await world();
  const st = await db.tx((c) => freezeOwnerStatement(c, owner(w, A)));
  const rs = await Promise.all(Array.from({ length: 4 }, (_, i) => db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-05', ref: 'dt' + i }))));
  assert.equal(rs.filter((r) => r.created).length, 1);
  assert.equal(await bal(w, 'bank'), 5005000 - 1975000);
});

test('bản kê âm (chủ nợ phí dọn) không chi được: nothing_to_pay; chi bản kê lạ: 404', async () => {
  const w = await world();
  // căn thứ hai thuộc chủ khác, hợp đồng thuê lại cố định: phần chủ 0, phí dọn chủ trả → bản kê âm
  const o2 = await db.tx((c) => createOwner(c, { orgId: w.orgId, name: 'Hải Âu', kind: 'to_chuc' }));
  const u3 = await db.tx((c) => createUnit(c, { orgId: w.orgId, buildingId: w.buildingId, ownerId: o2.id, roomTypeId: w.roomTypeId, code: 'B1' }));
  await db.query("INSERT INTO owner_releases(unit_id, night, kind) SELECT $1, d::date, 'open' FROM generate_series('2026-11-01'::date, '2026-11-30', '1 day') d", [u3.id]);
  await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: o2.id, unitId: u3.id, validFrom: '2026-01-01', kind: 'master_lease' }));
  await settleNew(w, { unitId: u3.id, checkin: '2026-11-10', checkout: '2026-11-11', outOn: '2026-11-11', ref: 'ml' });
  const st = await db.tx((c) => freezeOwnerStatement(c, { orgId: w.orgId, ownerId: o2.id, ...A }));
  assert.equal(st.payable, -150000);
  await assert.rejects(db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-05', ref: 'neg' })), (e) => e.code === 'nothing_to_pay' && e.detail.payable === -150000);
  await fail(db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: '00000000-0000-0000-0000-000000000000', paidOn: '2026-12-05', ref: 'x' })), 'statement_not_found', 404);
  await fail(db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-02-30', ref: 'x' })), 'bad_dates');
});

test('bản kê hoa hồng: chỉ đơn có sale/CTV, đóng băng một lần, chi đúng một lần', async () => {
  const w = await world();
  const { lines, totals } = await db.tx((c) => agentStatement(c, { orgId: w.orgId, agentId: w.agent.id, ...A }));
  assert.equal(lines.length, 2);
  assert.deepEqual(totals, { room: 3250000, payable: 325000 });
  const st = await db.tx((c) => freezeAgentStatement(c, { orgId: w.orgId, agentId: w.agent.id, ...A }));
  await fail(db.tx((c) => freezeAgentStatement(c, { orgId: w.orgId, agentId: w.agent.id, ...A })), 'empty_statement');
  assert.equal(await bal(w, 'agent_commission_payable', w.agent.id), -(195000 + 130000 + 130000));
  const p = await db.tx((c) => recordAgentPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-05', ref: 'h1' }));
  assert.equal(p.amount, 325000);
  assert.equal(await bal(w, 'agent_commission_payable', w.agent.id), -130000);
  assert.equal((await db.tx((c) => recordAgentPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-05', ref: 'h2' }))).created, false);
  const other = await db.tx((c) => createAgent(c, { orgId: w.orgId, name: 'Quân', kind: 'ctv', commissionPct: 5 }));
  await fail(db.tx((c) => freezeAgentStatement(c, { orgId: w.orgId, agentId: other.id, ...A })), 'empty_statement');
});

test('toCsv: thoát dấu phẩy, nháy kép, xuống dòng; chống công thức; null rỗng; số âm không bị thêm nháy; BOM tùy chọn', () => {
  const cols = [{ key: 'a', header: 'Mã' }, { key: 'b', header: 'Ghi chú' }];
  const csv = toCsv([
    { a: 'x,y', b: 'dòng 1\ndòng 2' }, { a: 'nói "ok"', b: null }, { a: '=SUM(A1)', b: '+84901' }, { a: '@cmd', b: -500 }, { a: '-5', b: 'Nguyễn Văn Ạ' },
  ], cols);
  assert.equal(csv, 'Mã,Ghi chú\r\n"x,y","dòng 1\ndòng 2"\r\n"nói ""ok""",\r\n\'=SUM(A1),\'+84901\r\n\'@cmd,-500\r\n\'-5,Nguyễn Văn Ạ\r\n');
  assert.ok(toCsv([], cols, { bom: true }).startsWith('﻿Mã,Ghi chú'));
  assert.equal(toCsv([], cols), 'Mã,Ghi chú\r\n');
});

test('statementCsv của bản kê chủ: tiêu đề, từng dòng và dòng TỔNG khớp bản kê', async () => {
  const w = await world();
  const st = await db.tx((c) => freezeOwnerStatement(c, owner(w, A)));
  const csv = await db.tx((c) => statementCsv(c, { orgId: w.orgId, kind: 'owner', statementId: st.id }));
  const rows = csv.trim().split('\r\n');
  assert.equal(rows[0], 'Mã đơn,Ngày trả phòng,Doanh thu phòng,Phần chủ,Phí dọn trừ,Thực nhận');
  assert.equal(rows.length, 1 + 2 + 1);
  assert.equal(rows[3], 'TỔNG,,3250000,2275000,300000,1975000');
  await fail(db.tx((c) => statementCsv(c, { orgId: w.orgId, kind: 'khac', statementId: st.id })), 'bad_kind');
  await fail(db.tx((c) => statementCsv(c, { orgId: w.orgId, kind: 'owner', statementId: '00000000-0000-0000-0000-000000000000' })), 'statement_not_found', 404);
  const a = await db.tx((c) => freezeAgentStatement(c, { orgId: w.orgId, agentId: w.agent.id, ...A }));
  const csv2 = await db.tx((c) => statementCsv(c, { orgId: w.orgId, kind: 'agent', statementId: a.id, bom: true }));
  assert.ok(csv2.startsWith('﻿Mã đơn,Ngày trả phòng,Doanh thu phòng,Hoa hồng'));
  assert.ok(csv2.trim().endsWith('TỔNG,,3250000,325000'));
});

test('báo cáo tiền giữ hộ khớp sổ: Anstay nợ chủ đúng số, tổng toàn sổ bằng 0', async () => {
  const w = await world();
  const st = await db.tx((c) => freezeOwnerStatement(c, owner(w, A)));
  await db.tx((c) => recordOwnerPayout(c, { orgId: w.orgId, statementId: st.id, paidOn: '2026-12-05', ref: 'p1' }));
  const r = await db.tx((c) => custodyReport(c, { orgId: w.orgId }));
  assert.equal(r.owners.find((o) => o.ownerId === w.ownerId).owed, 760000);
  assert.equal(r.owedToOwners, 760000);
  assert.equal(r.bank, 5005000 - 1975000);
  assert.equal(r.vatPayable, 195000 + 130000 + 130000);
  assert.equal(r.agentCommissionPayable, 455000);
  assert.equal(r.cleaningPayable, 450000);
  assert.equal(r.guestDeposits, 0);
  const [t] = await db.query('SELECT COALESCE(SUM(amount),0)::bigint AS t FROM ledger_entries');
  assert.equal(t.t, 0);
});
