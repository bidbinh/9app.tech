import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, boot, shutdown, seed } from './helper.js';
import { bootstrapOrg, createInvite, redeemInvite, getMemberByUser, setMemberStatus, can, ROLES } from '../src/access.js';
import { createAgent } from '../src/agents.js';
import { createOrg } from '../src/inventory.js';

before(boot);
after(shutdown);
let w;
const uid = () => crypto.randomUUID();
const NOW = new Date('2026-10-14T03:00:00Z');
const DAY = 24 * 3600 * 1000;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);
const invite = (over = {}) => db.tx((c) => createInvite(c, { orgId: w.orgId, role: 'letan', createdBy: null, ...over }, { now: NOW }));
const redeem = (code, userId = uid(), now = NOW) => db.tx((c) => redeemInvite(c, { code, userId, displayName: 'Người dùng' }, { now }));

test('bootstrapOrg tạo tổ chức và quản lý đầu tiên', async () => {
  const u = uid();
  const r = await db.tx((c) => bootstrapOrg(c, { name: 'Anstay mới', userId: u, displayName: 'Chủ Anstay' }));
  const m = await db.tx((c) => getMemberByUser(c, u));
  assert.deepEqual({ role: m.role, orgId: m.orgId, name: m.displayName }, { role: 'quanly', orgId: r.orgId, name: 'Chủ Anstay' });
});

test('mã mời dùng được một lần, tạo thành viên đúng vai; mã chỉ lưu băm', async () => {
  const inv = await invite({ role: 'letan' });
  assert.match(inv.code, /^[A-Z2-7-]{19,}$/);
  const stored = await db.query('SELECT code_hash FROM invites');
  assert.notEqual(stored[0].code_hash, inv.code);
  assert.equal(stored[0].code_hash, crypto.createHash('sha256').update(inv.code.replace(/-/g, '')).digest('hex'));
  const u = uid();
  const m = await redeem(inv.code, u);
  assert.equal(m.role, 'letan');
  assert.equal((await db.tx((c) => getMemberByUser(c, u))).orgId, w.orgId);
  await fail(redeem(inv.code), 'invite_invalid', 400); // lần hai
});

test('mã nhập thường/hoa, có hoặc không dấu gạch, có khoảng trắng đều được', async () => {
  const inv = await invite();
  const messy = '  ' + inv.code.toLowerCase().replace(/-/g, ' ') + ' ';
  const m = await redeem(messy);
  assert.equal(m.role, 'letan');
});

test('mã sai, hết hạn: cùng một lỗi invite_invalid, không phân biệt', async () => {
  const inv = await invite({ ttlDays: 1 });
  await fail(redeem('SAI-MA-HOAN-TOAN'), 'invite_invalid', 400);
  await fail(redeem(inv.code, uid(), new Date(NOW.getTime() + 2 * DAY)), 'invite_invalid', 400);
  await fail(redeem('', uid()), 'invite_invalid', 400);
  await fail(redeem(undefined, uid()), 'invite_invalid', 400);
});

test('hai người dùng cùng một mã đồng thời: đúng một người vào được', async () => {
  const inv = await invite();
  const rs = await Promise.allSettled([redeem(inv.code), redeem(inv.code), redeem(inv.code), redeem(inv.code)]);
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of rs.filter((x) => x.status === 'rejected')) assert.equal(r.reason.code, 'invite_invalid');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM members'))[0].n, 1);
});

test('một người dùng chỉ thuộc một tổ chức: nhập mã thứ hai bị already_member và mã không bị đốt', async () => {
  const u = uid();
  await redeem((await invite()).code, u);
  const second = await invite({ role: 'buongphong' });
  await fail(redeem(second.code, u), 'already_member', 409);
  const other = uid();
  assert.equal((await redeem(second.code, other)).role, 'buongphong'); // mã vẫn dùng được cho người khác
});

test('vai chu cần ownerId cùng org; ctv/sale cần agentId cùng org; vai khác không được kèm', async () => {
  const agent = await db.tx((c) => createAgent(c, { orgId: w.orgId, name: 'Hoa', kind: 'ctv', commissionPct: 10 }));
  const otherOrg = await db.tx((c) => createOrg(c, { name: 'Khác' }));
  const otherAgent = await db.tx((c) => createAgent(c, { orgId: otherOrg.id, name: 'X', kind: 'ctv', commissionPct: 5 }));
  await fail(invite({ role: 'chu' }), 'bad_invite');
  await fail(invite({ role: 'chu', ownerId: w.ownerId, agentId: agent.id }), 'bad_invite');
  await fail(invite({ role: 'ctv' }), 'bad_invite');
  await fail(invite({ role: 'letan', ownerId: w.ownerId }), 'bad_invite');
  await fail(invite({ role: 'ctv', agentId: otherAgent.id }), 'bad_invite'); // sale của org khác
  await fail(invite({ role: 'vua' }), 'bad_invite');
  const chu = await redeem((await invite({ role: 'chu', ownerId: w.ownerId })).code);
  assert.equal(chu.ownerId, w.ownerId);
  const ctv = await redeem((await invite({ role: 'ctv', agentId: agent.id })).code);
  assert.equal(ctv.agentId, agent.id);
});

test('thành viên bị khóa không còn được nhận diện', async () => {
  const u = uid();
  const m = await redeem((await invite()).code, u);
  await db.tx((c) => setMemberStatus(c, { orgId: w.orgId, memberId: m.id, status: 'disabled' }));
  assert.equal(await db.tx((c) => getMemberByUser(c, u)), null);
  await db.tx((c) => setMemberStatus(c, { orgId: w.orgId, memberId: m.id, status: 'active' }));
  assert.notEqual(await db.tx((c) => getMemberByUser(c, u)), null);
  await fail(db.tx((c) => setMemberStatus(c, { orgId: w.orgId, memberId: m.id, status: 'xoa' })), 'bad_status');
  const otherOrg = await db.tx((c) => createOrg(c, { name: 'Khác' }));
  await fail(db.tx((c) => setMemberStatus(c, { orgId: otherOrg.id, memberId: m.id, status: 'disabled' })), 'member_not_found', 404);
});

test('getMemberByUser: người lạ trả null; id không phải uuid bị bad_id', async () => {
  assert.equal(await db.tx((c) => getMemberByUser(c, uid())), null);
  await fail(db.tx((c) => getMemberByUser(c, 'xxx')), 'bad_id');
});

test('ma trận quyền theo vai', () => {
  assert.deepEqual([...ROLES].sort(), ['buongphong', 'chu', 'ctv', 'letan', 'quanly', 'sale']);
  // quản lý làm được mọi việc
  for (const a of ['rates.write', 'statement.freeze', 'statement.payout', 'payment.refund', 'invite.create', 'release.any', 'report.custody']) assert.equal(can('quanly', a), true, a);
  // lễ tân: vận hành nhưng không hoàn tiền, không sửa giá, không bản kê, không mời
  for (const a of ['calendar.read.all', 'booking.create', 'booking.cancel', 'booking.move', 'booking.checkin', 'booking.checkout', 'payment.record']) assert.equal(can('letan', a), true, a);
  for (const a of ['payment.refund', 'rates.write', 'statement.freeze', 'statement.payout', 'invite.create', 'release.any', 'report.custody', 'statement.owner.read.all']) assert.equal(can('letan', a), false, a);
  // CTV/sale: chỉ bán và xem của mình
  for (const r of ['ctv', 'sale']) {
    for (const a of ['availability.search', 'quote.create', 'booking.create', 'booking.read.own', 'statement.agent.read.own']) assert.equal(can(r, a), true, r + ' ' + a);
    for (const a of ['calendar.read.all', 'booking.read.all', 'payment.record', 'payment.refund', 'booking.checkin', 'statement.owner.read.own', 'release.own', 'rates.write']) assert.equal(can(r, a), false, r + ' ' + a);
  }
  // chủ phòng: căn của mình
  for (const a of ['release.own', 'calendar.read.own', 'statement.owner.read.own']) assert.equal(can('chu', a), true, a);
  for (const a of ['booking.create', 'booking.read.all', 'payment.record', 'release.any', 'statement.freeze', 'availability.search']) assert.equal(can('chu', a), false, a);
  // buồng phòng: chưa có quyền nghiệp vụ nào ở lát này
  for (const a of ['booking.read.all', 'booking.read.own', 'payment.record', 'calendar.read.all', 'quote.create']) assert.equal(can('buongphong', a), false, a);
  assert.equal(can('khong_co', 'booking.create'), false);
  assert.equal(can('quanly', 'hanh_dong_la'), false);
});
