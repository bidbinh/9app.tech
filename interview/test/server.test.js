import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const SID = 'abcdefghijklmnop1234';
const goodFeedback = {
  overall: 7, summary: 'Ổn.', star: { situation: true, task: false, action: true, result: true },
  criteria: [{ key: 'cau_truc', score: 7, comment: 'Có mở và kết.' }, { key: 'so_lieu', score: 4, comment: 'Thiếu số.' }],
  strengths: ['Có ví dụ thật'], improvements: ['Thêm số liệu'], rewrite_hint: 'Mở bằng bối cảnh rồi nêu kết quả.',
};
const ANSWER = 'Tôi đã chuyển quy trình theo dõi hợp đồng sang bảng tính chung, nhờ đó cả phòng tìm hồ sơ nhanh hơn.';

function mockFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    return handler(calls.length, url, init);
  };
  f.calls = calls;
  return f;
}
const geminiOk = (obj) => ({ status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] }) });

async function boot(env = {}, opts = {}) {
  const logs = [];
  const cfg = { ...loadConfig({ BASE_PATH: '/interview', INTERVIEW_AI_RETRY_MS: '0', ...env }) };
  const app = createServer(cfg, { log: (l) => logs.push(l), ...opts });
  const port = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  return { app, base, logs, cfg, close: () => app.close() };
}
const post = (base, path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': SID, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const fb = (extra = {}) => ({ question: 'Hãy giới thiệu về bản thân.', answer: ANSWER, group: 'vanphong', type: 'gioithieu', ...extra });

test('chế độ không có khóa AI: config báo tắt, API AI trả 503 gọn, phần tĩnh vẫn chạy', async () => {
  const s = await boot({ INTERVIEW_AI_KEY: '' });
  try {
    const c = await (await fetch(s.base + '/interview/api/config')).json();
    assert.equal(c.ai, false);
    const r = await post(s.base, '/interview/api/feedback', fb());
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'ai_disabled');
    const r2 = await post(s.base, '/interview/api/rewrite', { experience: 'Làm hành chính ba năm tại công ty.' });
    assert.equal(r2.status, 503);
    const page = await fetch(s.base + '/interview/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<base href="\/interview\/">/);
    assert.ok(!html.includes('__BASE__'));
    assert.equal((await fetch(s.base + '/healthz')).status, 200);
    assert.equal((await fetch(s.base + '/interview/js/data/index.js')).status, 200);
  } finally { await s.close(); }
});

test('có khóa AI: chấm điểm hợp lệ, khóa chỉ gửi tới Gemini qua header, không lộ ra phản hồi', async () => {
  const f = mockFetch(() => geminiOk(goodFeedback));
  const KEY = 'khoa-thu-nghiem-123456';
  const s = await boot({ INTERVIEW_AI_KEY: KEY }, { fetchImpl: f });
  try {
    assert.equal((await (await fetch(s.base + '/interview/api/config')).json()).ai, true);
    const r = await post(s.base, '/interview/api/feedback', fb());
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.ok(!text.includes(KEY));
    const j = JSON.parse(text);
    assert.equal(j.feedback.overall, 7);
    assert.equal(j.feedback.criteria.length, 2);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].init.headers['x-goog-api-key'], KEY);
    assert.ok(!f.calls[0].url.includes(KEY), 'khóa không nằm trong URL');
    assert.match(f.calls[0].url, /gemini-flash-latest:generateContent$/);
    const sent = JSON.parse(f.calls[0].init.body);
    assert.ok(JSON.stringify(sent).includes('Tôi đã chuyển quy trình'));
  } finally { await s.close(); }
});

test('nhật ký không chứa nội dung người dùng, khóa hay IP', async () => {
  const f = mockFetch(() => geminiOk(goodFeedback));
  const s = await boot({ INTERVIEW_AI_KEY: 'khoa-bi-mat-xyz' }, { fetchImpl: f });
  try {
    await post(s.base, '/interview/api/feedback', fb());
    await post(s.base, '/interview/api/feedback', { question: 'x', answer: 'BÍ MẬT CÁ NHÂN 0909123456 quá ngắn' });
    const all = s.logs.join('\n');
    assert.ok(s.logs.length >= 1);
    assert.ok(!all.includes('chuyển quy trình') && !all.includes('0909123456') && !all.includes('khoa-bi-mat') && !all.includes('127.0.0.1'));
    assert.match(all, /POST \/interview\/api\/feedback 200/);
  } finally { await s.close(); }
});

test('kiểm tra đầu vào: phiên, loại nội dung, JSON hỏng, câu trả lời ngắn, quá lớn, sai nguồn gốc', async () => {
  const f = mockFetch(() => geminiOk(goodFeedback));
  const s = await boot({ INTERVIEW_AI_KEY: 'k', INTERVIEW_MAX_BODY: '4096', INTERVIEW_IP_PER_MIN: '500', INTERVIEW_SESSION_PER_MIN: '500', INTERVIEW_IP_PER_DAY: '500' }, { fetchImpl: f });
  try {
    assert.equal((await post(s.base, '/interview/api/feedback', fb(), { 'x-session': 'ngan' })).status, 400);
    assert.equal((await fetch(s.base + '/interview/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fb()) })).status, 400);
    assert.equal((await fetch(s.base + '/interview/api/feedback', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-session': SID }, body: 'x' })).status, 415);
    assert.equal((await post(s.base, '/interview/api/feedback', '{khong phai json')).status, 400);
    const short = await post(s.base, '/interview/api/feedback', fb({ answer: 'ngắn quá' }));
    assert.equal(short.status, 400);
    assert.equal((await short.json()).error, 'invalid_input');
    assert.equal((await post(s.base, '/interview/api/feedback', fb({ question: '' }))).status, 400);
    assert.equal((await post(s.base, '/interview/api/feedback', [1, 2])).status, 400);
    assert.equal((await post(s.base, '/interview/api/feedback', fb({ answer: 'a'.repeat(6000) }))).status, 413);
    assert.equal((await post(s.base, '/interview/api/feedback', fb({ answer: 'b'.repeat(9000) }))).status, 413);
    const o = await post(s.base, '/interview/api/feedback', fb(), { origin: 'https://ke-xau.example' });
    assert.equal(o.status, 403);
    assert.equal(f.calls.length, 0, 'đầu vào xấu không bao giờ tới AI');
    assert.equal((await fetch(s.base + '/interview/api/feedback')).status, 405);
    assert.equal((await fetch(s.base + '/interview/api/khong-co')).status, 404);
  } finally { await s.close(); }
});

test('giới hạn tốc độ: theo phiên, theo IP, theo ngày, rồi mở lại khi qua cửa sổ', async () => {
  let t = 1_700_000_000_000;
  const f = mockFetch(() => geminiOk(goodFeedback));
  const s = await boot({ INTERVIEW_AI_KEY: 'k', INTERVIEW_SESSION_PER_MIN: '3', INTERVIEW_IP_PER_MIN: '5', INTERVIEW_IP_PER_DAY: '9', INTERVIEW_GLOBAL_PER_DAY: '100' }, { fetchImpl: f, now: () => t });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await post(s.base, '/interview/api/feedback', fb())).status, 200);
    const blocked = await post(s.base, '/interview/api/feedback', fb());
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
    assert.equal((await blocked.json()).error, 'rate_limited');
    assert.equal(f.calls.length, 3, 'lượt bị chặn không tốn lượt gọi AI');
    // phiên khác cùng IP: tới giới hạn IP/phút (5) thì chặn
    assert.equal((await post(s.base, '/interview/api/feedback', fb(), { 'x-session': 'phien-khac-0000000001' })).status, 200);
    assert.equal((await post(s.base, '/interview/api/feedback', fb(), { 'x-session': 'phien-khac-0000000001' })).status, 200);
    assert.equal((await post(s.base, '/interview/api/feedback', fb(), { 'x-session': 'phien-khac-0000000002' })).status, 429);
    // sang phút kế tiếp: mở lại
    t += 61_000;
    assert.equal((await post(s.base, '/interview/api/feedback', fb())).status, 200);
    // cạn giới hạn ngày của IP (9)
    let day = 0;
    for (let i = 0; i < 12 && day === 0; i++) {
      t += 61_000;
      const r = await post(s.base, '/interview/api/feedback', fb({ answer: ANSWER + ' ' + i }));
      if (r.status === 429) day = i;
    }
    assert.ok(day > 0, 'phải bị chặn theo ngày');
    t += 86_400_000 + 1000;
    assert.equal((await post(s.base, '/interview/api/feedback', fb())).status, 200);
  } finally { await s.close(); }
});

test('giới hạn toàn hệ thống mỗi ngày', async () => {
  const f = mockFetch(() => geminiOk(goodFeedback));
  const s = await boot({ INTERVIEW_AI_KEY: 'k', INTERVIEW_GLOBAL_PER_DAY: '2', INTERVIEW_IP_PER_MIN: '50', INTERVIEW_SESSION_PER_MIN: '50' }, { fetchImpl: f });
  try {
    assert.equal((await post(s.base, '/interview/api/feedback', fb())).status, 200);
    assert.equal((await post(s.base, '/interview/api/feedback', fb())).status, 200);
    assert.equal((await post(s.base, '/interview/api/feedback', fb())).status, 429);
  } finally { await s.close(); }
});

test('X-Forwarded-For chỉ được tin khi TRUST_PROXY=1', async () => {
  const f = mockFetch(() => geminiOk(goodFeedback));
  const a = await boot({ INTERVIEW_AI_KEY: 'k', INTERVIEW_IP_PER_MIN: '1', INTERVIEW_SESSION_PER_MIN: '50' }, { fetchImpl: f });
  try {
    assert.equal((await post(a.base, '/interview/api/feedback', fb(), { 'x-forwarded-for': '1.1.1.1' })).status, 200);
    assert.equal((await post(a.base, '/interview/api/feedback', fb(), { 'x-forwarded-for': '2.2.2.2' })).status, 429, 'không tin header khi chưa bật proxy');
  } finally { await a.close(); }
  const b = await boot({ INTERVIEW_AI_KEY: 'k', INTERVIEW_IP_PER_MIN: '1', INTERVIEW_SESSION_PER_MIN: '50', TRUST_PROXY: '1' }, { fetchImpl: f });
  try {
    assert.equal((await post(b.base, '/interview/api/feedback', fb(), { 'x-forwarded-for': '1.1.1.1' })).status, 200);
    assert.equal((await post(b.base, '/interview/api/feedback', fb(), { 'x-forwarded-for': '2.2.2.2' })).status, 200);
    assert.equal((await post(b.base, '/interview/api/feedback', fb(), { 'x-forwarded-for': '2.2.2.2' })).status, 429);
  } finally { await b.close(); }
});

test('đầu ra AI xấu: trả 502 gọn, không rò nội dung thô; 503 được thử lại', async () => {
  const bads = ['xin lỗi, tôi không thể giúp', '{"overall": "cao", "criteria": []}', '```json\n{"overall": 5,', '[]', '', '{"overall":5,"criteria":"x"}'];
  for (const bad of bads) {
    const s = await boot({ INTERVIEW_AI_KEY: 'k' }, { fetchImpl: mockFetch(() => geminiOk(bad)) });
    try {
      const r = await post(s.base, '/interview/api/feedback', fb());
      assert.equal(r.status, 502, `đầu ra: ${bad}`);
      const j = await r.json();
      assert.equal(j.error, 'ai_bad_output');
      assert.ok(!JSON.stringify(j).includes('xin lỗi'));
    } finally { await s.close(); }
  }
  // 503 hai lần rồi thành công
  const f = mockFetch((n) => (n < 3 ? { status: 503, ok: false, json: async () => ({}) } : geminiOk(goodFeedback)));
  const s = await boot({ INTERVIEW_AI_KEY: 'k' }, { fetchImpl: f });
  try {
    assert.equal((await post(s.base, '/interview/api/feedback', fb())).status, 200);
    assert.equal(f.calls.length, 3);
  } finally { await s.close(); }
  // 503 mãi: báo bận
  const g = mockFetch(() => ({ status: 503, ok: false, json: async () => ({}) }));
  const s2 = await boot({ INTERVIEW_AI_KEY: 'k' }, { fetchImpl: g });
  try {
    const r = await post(s2.base, '/interview/api/feedback', fb());
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'ai_busy');
    assert.equal(g.calls.length, 3);
  } finally { await s2.close(); }
  // lỗi mạng
  const h2 = mockFetch(() => { throw new Error('ECONNRESET'); });
  const s3 = await boot({ INTERVIEW_AI_KEY: 'k' }, { fetchImpl: h2 });
  try { assert.equal((await post(s3.base, '/interview/api/feedback', fb())).status, 502); } finally { await s3.close(); }
});

test('rewrite CV: bỏ dòng chứa con số bịa', async () => {
  const exp = 'Phụ trách đối chiếu công nợ hằng tháng cho 40 khách hàng, lập báo cáo tuần.';
  const f = mockFetch(() => geminiOk({ bullets: ['Đối chiếu công nợ hằng tháng cho 40 khách hàng', 'Giảm 85% thời gian lập báo cáo', 'Lập báo cáo tuần cho trưởng phòng'], keywords: ['công nợ'], missing: ['SAP'], note: 'ok' }));
  const s = await boot({ INTERVIEW_AI_KEY: 'k' }, { fetchImpl: f });
  try {
    const r = await post(s.base, '/interview/api/rewrite', { experience: exp, job: 'Cần kế toán công nợ biết SAP', role: 'Kế toán' });
    assert.equal(r.status, 200);
    const j = (await r.json()).rewrite;
    assert.equal(j.bullets.length, 2);
    assert.ok(j.bullets.every((b) => !b.includes('85')));
    assert.equal(j.droppedUngrounded, 1);
    assert.equal((await post(s.base, '/interview/api/rewrite', { experience: 'ngắn' })).status, 400);
  } finally { await s.close(); }
});

test('không đọc được tệp ngoài thư mục public, kể cả dùng mã hóa đường dẫn', async () => {
  const s = await boot();
  try {
    for (const p of ['/interview/../package.json', '/interview/%2e%2e/package.json', '/interview/..%2fsrc/server.js', '/interview/js/../../src/ai.js', '/interview/%5c..%5cpackage.json', '/interview/sw.js%00.png']) {
      const r = await fetch(s.base + p);
      assert.ok([400, 404].includes(r.status), `${p} -> ${r.status}`);
      const body = await r.text();
      assert.ok(!body.includes('createServer') && !body.includes('"name": "9interview"'));
    }
    assert.equal((await fetch(s.base + '/khac/index.html')).status, 404);
    const h = (await fetch(s.base + '/interview/')).headers;
    assert.match(h.get('content-security-policy'), /script-src 'self'/);
  } finally { await s.close(); }
});
