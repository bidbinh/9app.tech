// Giới hạn tốc độ, ngân sách token (theo người, toàn hệ, theo lượt), một lượt đồng thời, timeout, lỗi mô hình.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, Client, ok, createMockProvider, ApiError, db, config, resetChatRate } from './helper.js';
import { userKey } from '../src/usage.js';

const llm = createMockProvider([]);
const saved = {};
before(async () => {
  for (const k of ['userTokensPerDay', 'globalTokensPerDay', 'userMsgsPerDay', 'chatPerMin', 'turnTimeoutMs', 'turnReserveTokens']) saved[k] = config[k];
  await boot({ llm, apps: [] });
});
after(async () => { Object.assign(config, saved); await shutdown(); });
beforeEach(() => { Object.assign(config, saved); resetChatRate(); });
const fresh = async (name) => { const c = new Client(name); await c.consent(); return c; };
const row = async (c) => (await db.query('SELECT tokens, msgs, errors FROM usage_daily WHERE user_key=$1', [userKey(c.userId)]))[0];

test('token/ngày theo người: vượt thì 429 với thông báo thân thiện; token ghi theo số thật (hoàn lại phần ước lượng thừa)', async () => {
  config.userTokensPerDay = 1000;
  const c = await fresh('tok');
  llm.reset(() => ({ text: 'ok', tokens: 600 }));
  await ok(c.chat('một'));
  assert.equal((await row(c)).tokens, 600);
  await ok(c.chat('hai'));
  assert.equal((await row(c)).tokens, 1200);
  const r = await c.chat('ba');
  assert.equal(r.status, 429); assert.equal(r.json.error.code, 'daily_tokens'); assert.match(r.json.error.message, /hạn mức/);
  assert.equal(llm.log.length, 2, 'vượt hạn mức thì không gọi mô hình');
  assert.equal((await row(c)).tokens, 1200);
  assert.equal((await ok(c.get('/api/history'))).messages.length, 4);
  const other = await fresh('tok-khac');
  assert.equal((await c.chat('x')).status, 429);
  assert.equal((await other.chat('vẫn dùng được')).status, 200, 'hạn mức tính riêng từng người');
});

test('tin nhắn/ngày theo người', async () => {
  config.userMsgsPerDay = 2;
  const c = await fresh('msgs');
  llm.reset(() => ({ text: 'ok', tokens: 10 }));
  await ok(c.chat('1')); await ok(c.chat('2'));
  const r = await c.chat('3');
  assert.equal(r.status, 429); assert.equal(r.json.error.code, 'daily_msgs');
});

test('trần toàn hệ chống đua: nhiều người gửi đồng thời không vượt trần nhờ đặt trước hạn mức', async () => {
  config.globalTokensPerDay = 20000; config.turnReserveTokens = 8000;
  await db.query('DELETE FROM usage_daily');
  const users = await Promise.all([1, 2, 3, 4, 5].map((i) => fresh('gl' + i)));
  llm.reset(() => ({ text: 'ok', tokens: 50, delayMs: 300 }));
  const rs = await Promise.all(users.map((u) => u.chat('xin chào')));
  const good = rs.filter((r) => r.status === 200).length; const bad = rs.filter((r) => r.status === 503);
  assert.equal(good, 2, rs.map((r) => r.status).join());
  assert.equal(bad.length, 3); assert.equal(bad[0].json.error.code, 'global_budget');
  // xong lượt thì phần đặt trước được hoàn lại: người sau dùng được
  llm.reset(() => ({ text: 'ok', tokens: 50 }));
  assert.equal((await users[2].chat('thử lại')).status, 200);
  const total = (await db.query('SELECT sum(tokens)::int AS t FROM usage_daily'))[0].t;
  assert.equal(total, 150);
});

test('giới hạn lượt/phút theo người dùng', async () => {
  config.chatPerMin = 2;
  const c = await fresh('phut'); const d = await fresh('phut2');
  llm.reset(() => ({ text: 'ok', tokens: 10 }));
  await ok(c.chat('1')); await ok(c.chat('2'));
  const r = await c.chat('3');
  assert.equal(r.status, 429); assert.equal(r.json.error.code, 'rate_limited');
  assert.equal((await d.chat('khác')).status, 200);
});

test('mỗi người một lượt đồng thời: gửi chồng lên nhau thì lượt sau bị từ chối nhẹ nhàng, lượt đầu không hỏng', async () => {
  const c = await fresh('chong');
  llm.reset(() => ({ text: 'ok', tokens: 10, delayMs: 250 }));
  const [a, b, d] = await Promise.all([c.chat('một'), c.chat('hai'), c.chat('ba')]);
  const st = [a, b, d].map((r) => r.status).sort();
  assert.deepEqual(st, [200, 429, 429]);
  assert.equal([a, b, d].find((r) => r.status === 429).json.error.code, 'busy');
  assert.equal((await ok(c.get('/api/history'))).messages.length, 2);
  assert.equal((await ok(c.get('/api/me'))).busy, false);
});

test('timeout tổng của lượt: trả 504, không lưu gì, hạn mức tính theo thực tế', async () => {
  config.turnTimeoutMs = 200;
  const c = await fresh('tre');
  llm.reset(() => ({ text: 'ok', tokens: 10, delayMs: 3000 }));
  const t0 = Date.now();
  const r = await c.chat('chậm quá');
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(r.status, 504); assert.equal(r.json.error.code, 'timeout');
  assert.equal((await ok(c.get('/api/history'))).messages.length, 0);
  assert.equal((await row(c)).errors, 1);
  assert.equal((await ok(c.get('/api/me'))).busy, false, 'nhả khóa lượt đồng thời');
});

test('lỗi mô hình (bận, bị chặn, hỏng): thông báo thân thiện, không lưu, không lộ chi tiết nội bộ', async () => {
  const c = await fresh('loi');
  for (const [err, status, code] of [[new ApiError(503, 'ai_busy', 'Dịch vụ AI đang bận. Thử lại sau ít phút nhé.'), 503, 'ai_busy'], [new ApiError(422, 'ai_blocked', 'AI từ chối trả lời nội dung này.'), 422, 'ai_blocked'], [new Error('ECONNRESET 10.0.0.5:443 khóa=AIzaSyAAAAAAAAAAAAAAAAAAAAAAAA'), 500, 'internal']]) {
    llm.reset([{ error: err }]);
    const r = await c.chat('xin chào');
    assert.equal(r.status, status); assert.equal(r.json.error.code, code);
    assert.ok(!JSON.stringify(r.json).includes('10.0.0.5') && !JSON.stringify(r.json).includes('AIza'));
  }
  assert.equal((await ok(c.get('/api/history'))).messages.length, 0);
});

test('trần token trong một lượt: dùng quá nhiều ở vòng đầu thì vòng sau bị buộc trả lời, không gọi thêm công cụ', async () => {
  const c = await fresh('lon');
  llm.reset(() => ({ calls: [{ name: 'osin__may_tinh', args: { bieu_thuc: '1+1' } }], tokens: 20000 }));
  const r = await ok(c.chat('tính hoài'));
  assert.equal(llm.log.length, 2);
  assert.equal(llm.log[1].allowTools, false);
  assert.ok(r.message.content);
});

test('chế độ không AI (offline): không cần đồng ý, chạy lệnh đơn giản bằng công cụ nội bộ, câu khác được hướng dẫn', async () => {
  const { createOfflineProvider } = await import('../src/llm/offline.js');
  await boot({ llm: createOfflineProvider(), apps: [] });
  const c = new Client('offl');
  const me = await ok(c.get('/api/me'));
  assert.equal(me.ai.enabled, false); assert.equal(me.needConsent, false);
  const cases = [['đổi 3 chỉ vàng ra gram', /11,25 g/], ['tính 12*(3+4)', /= 84/], ['12*(3+4)', /= 84/], ['hôm nay âm lịch ngày mấy', /Âm lịch/], ['đổi 17/02/2026 sang âm lịch', /Bính Ngọ/], ['mở văn khấn', /Vạn Niên/], ['kể chuyện cười đi', /chưa bật AI/], ['tính process.exit()', /không được hỗ trợ|hỗ trợ/]];
  for (const [q, re] of cases) {
    const r = await ok(c.chat(q));
    assert.match(r.message.content, re, q);
  }
  assert.equal((await row(c)).tokens, 0, 'offline không tốn token');
});
