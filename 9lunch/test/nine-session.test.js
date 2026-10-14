import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, db, config } from './helper.js';
const query = (...a) => db.query(...a);
import { idEnabled, setIdClient, setNow, flushCaches, verifyToken, resolveUser } from '../src/nine-session.js';

before(async () => { await boot(); });
after(shutdown);

const T = 'A'.repeat(43);
const UID = '11111111-1111-4111-8111-111111111111';
let clock = 1_000_000;
beforeEach(() => { setIdClient(null); setNow(() => clock); config.nineIdSecret = ''; config.idBreakMs = 1500; flushCaches(); });

function fake(impl) {
  const calls = [];
  return { calls, async verify(token) { calls.push(token); return impl(token); } };
}
const ctxOf = (tok) => ({ cookies: tok === undefined ? {} : { nine_sid: tok } });

test('không có bí mật và không có máy khách: tích hợp tắt, không gọi gì', async () => {
  assert.equal(idEnabled(), false);
  const ctx = ctxOf(T);
  await resolveUser(ctx);
  assert.ok(!ctx.userId);
  assert.ok(!ctx.idDown);
  config.nineIdSecret = 'ngan';
  assert.equal(idEnabled(), false, 'bí mật ngắn hơn 32 ký tự coi như tắt');
  config.nineIdSecret = 'x'.repeat(32);
  assert.equal(idEnabled(), true);
});

test('token sai định dạng hoặc không có cookie: không gọi verify', async () => {
  const f = fake(() => ({ userId: UID, displayName: 'A' }));
  setIdClient(f);
  for (const bad of [undefined, '', 'abc', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '!', 'A'.repeat(42) + ' ']) {
    const ctx = ctxOf(bad);
    await resolveUser(ctx);
    assert.ok(!ctx.userId, String(bad));
  }
  assert.equal(f.calls.length, 0);
});

test('token hợp lệ: ctx.userId từ máy chủ 9id, đệm 60 giây', async () => {
  const f = fake(() => ({ userId: UID.toUpperCase(), displayName: 'Lan Anh' }));
  setIdClient(f);
  const a = ctxOf(T), b = ctxOf(T);
  await resolveUser(a); await resolveUser(b);
  assert.equal(a.userId, UID, 'chuẩn hóa chữ thường');
  assert.equal(a.userName, 'Lan Anh');
  assert.ok(!a.idDown);
  assert.equal(b.userId, UID);
  assert.equal(f.calls.length, 1, 'lần hai dùng đệm');
  clock += 61_000;
  await resolveUser(ctxOf(T));
  assert.equal(f.calls.length, 2, 'hết 60 giây thì hỏi lại');
});

test('verify trả null (phiên hết hạn/giả): ctx.userId rỗng, đệm âm 15 giây rồi hỏi lại', async () => {
  const f = fake(() => null);
  setIdClient(f);
  const a = ctxOf(T);
  await resolveUser(a);
  assert.ok(!a.userId && !a.idDown);
  await resolveUser(ctxOf(T));
  assert.equal(f.calls.length, 1, 'cookie giả không làm 9id bị gọi dồn');
  clock += 16_000;
  await resolveUser(ctxOf(T));
  assert.equal(f.calls.length, 2);
});

test('9id lỗi hạ tầng: app vẫn chạy ẩn danh (idDown), không ném; cầu dao trong idBreakMs', async () => {
  let fail = true;
  const f = fake(() => { if (fail) throw new Error('ECONNREFUSED'); return { userId: UID, displayName: 'A' }; });
  setIdClient(f);
  const a = ctxOf(T);
  await resolveUser(a);
  assert.equal(a.idDown, true);
  assert.ok(!a.userId);
  await resolveUser(ctxOf('B'.repeat(43)));
  assert.equal(f.calls.length, 1, 'đang trong cầu dao: không gọi lại 9id');
  clock += 2_000;
  fail = false;
  const c = ctxOf(T);
  await resolveUser(c);
  assert.equal(f.calls.length, 2);
  assert.equal(c.userId, UID);
  assert.ok(!c.idDown);
});

test('9id trả userId không phải UUID: coi như 9id lỗi', async () => {
  setIdClient(fake(() => ({ userId: 'khong-phai-uuid', displayName: 'A' })));
  const ctx = ctxOf(T);
  await resolveUser(ctx);
  assert.equal(ctx.idDown, true);
  assert.ok(!ctx.userId);
});

test('verifyToken ném lỗi khi 9id không đạt được (để route claim trả 503)', async () => {
  setIdClient(fake(() => { throw new Error('timeout'); }));
  await assert.rejects(verifyToken(T));
});

test('migration: members.user_id và chỉ mục duy nhất từng phần theo (team_id, user_id) cho thành viên còn hoạt động', async () => {
  const t = (await query("INSERT INTO teams(name, invite_code, created_by_hash) VALUES('T','CODE000001','h') RETURNING id"))[0].id;
  await query("INSERT INTO members(team_id, name, role, user_id) VALUES($1,'A','chu',$2)", [t, UID]);
  await assert.rejects(query("INSERT INTO members(team_id, name, role, user_id) VALUES($1,'B','thanh_vien',$2)", [t, UID]), /duplicate|unique/i);
  await query("INSERT INTO members(team_id, name, role) VALUES($1,'C','thanh_vien')", [t]);
  await query("INSERT INTO members(team_id, name, role) VALUES($1,'D','thanh_vien')", [t]);
  await query("UPDATE members SET left_at = now() WHERE name='A'");
  await query("INSERT INTO members(team_id, name, role, user_id) VALUES($1,'E','thanh_vien',$2)", [t, UID]);
});
