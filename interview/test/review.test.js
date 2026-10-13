// Test cho các lỗi do phản biện độc lập tìm ra. Mỗi nhóm test phải FAIL trước khi sửa.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { callGemini, numbersGrounded, validateFeedback, validateRewrite, feedbackPrompt } from '../src/ai.js';
import { countWords, countFillers, quickCheck, analyzeAnswer, paceLabel } from '../public/js/analysis.js';
import { cvChecks, findPlaceholders } from '../public/js/cv.js';
import { emptyCv } from '../public/js/store.js';
import { fillLetter, LETTER_TEMPLATES } from '../public/js/data/guides.js';
import { QUESTIONS } from '../public/js/data/index.js';

const SID = 'abcdefghijklmnop1234';
const ANSWER = 'Tôi đã chuyển quy trình theo dõi hợp đồng sang bảng tính chung, nhờ đó cả phòng tìm hồ sơ nhanh hơn.';
const good = { overall: 7, summary: 'Ổn.', star: {}, criteria: [{ key: 'cau_truc', score: 7, comment: 'ok' }], strengths: [], improvements: [], rewrite_hint: '' };
const ok = (obj) => ({ status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] }) });
async function boot(env = {}, opts = {}) {
  const cfg = loadConfig({ BASE_PATH: '/interview', INTERVIEW_AI_RETRY_MS: '0', INTERVIEW_AI_KEY: 'k', ...env });
  const app = createServer(cfg, { log: () => {}, fetchImpl: async () => ok(good), ...opts });
  const port = await app.listen(0, '127.0.0.1');
  return { app, base: `http://127.0.0.1:${port}`, close: () => app.close() };
}
const post = (base, body, headers = {}, path = '/interview/api/feedback') => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': SID, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const fb = (extra = {}) => ({ question: 'Hãy giới thiệu về bản thân.', answer: ANSWER, ...extra });

/* ---- 1. X-Forwarded-For giả mạo ---- */
test('XFF: lấy phần tử CUỐI (do nginx thêm), giả mạo phần tử đầu không vượt được hạn mức', async () => {
  const s = await boot({ TRUST_PROXY: '1', INTERVIEW_IP_PER_MIN: '1', INTERVIEW_SESSION_PER_MIN: '50' });
  try {
    assert.equal((await post(s.base, fb(), { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' })).status, 200);
    assert.equal((await post(s.base, fb(), { 'x-forwarded-for': '7.7.7.7, 203.0.113.9' })).status, 429, 'cùng IP thật, đổi IP giả ở đầu');
    assert.equal((await post(s.base, fb(), { 'x-forwarded-for': '203.0.113.10' })).status, 200, 'IP thật khác thì được');
  } finally { await s.close(); }
});

/* ---- 2. Hạn mức chỉ trừ cho yêu cầu hợp lệ; ngày theo giờ Việt Nam ---- */
test('yêu cầu hỏng không tiêu hạn mức AI, nhưng bị giới hạn nhẹ riêng', async () => {
  const t = await boot({ INTERVIEW_IP_PER_MIN: '2', INTERVIEW_SESSION_PER_MIN: '2', INTERVIEW_BAD_PER_MIN: '20' });
  try {
    for (let i = 0; i < 6; i++) assert.equal((await post(t.base, fb({ answer: 'ngắn' }))).status, 400);
    assert.equal((await post(t.base, fb())).status, 200, 'yêu cầu hợp lệ vẫn còn đủ hạn mức');
    assert.equal((await post(t.base, fb())).status, 200);
    assert.equal((await post(t.base, fb())).status, 429);
  } finally { await t.close(); }
  const u = await boot({ INTERVIEW_BAD_PER_MIN: '3' });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await post(u.base, fb({ answer: 'ngắn' }))).status);
    assert.deepEqual(codes, [400, 400, 400, 429, 429]);
  } finally { await u.close(); }
});

test('hạn mức ngày đổi lúc 0 giờ giờ Việt Nam (UTC+7), thông báo nói rõ', async () => {
  let t = Date.UTC(2026, 9, 4, 16, 59, 0); // 23:59 giờ VN
  const s = await boot({ INTERVIEW_IP_PER_DAY: '1', INTERVIEW_IP_PER_MIN: '50', INTERVIEW_SESSION_PER_MIN: '50' }, { now: () => t });
  try {
    assert.equal((await post(s.base, fb())).status, 200);
    const blocked = await post(s.base, fb());
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).message, /giờ Việt Nam/);
    t = Date.UTC(2026, 9, 4, 17, 1, 0); // 00:01 ngày mới giờ VN
    assert.equal((await post(s.base, fb())).status, 200, 'sang ngày mới theo giờ VN');
  } finally { await s.close(); }
});

test('tổng thời gian gọi Gemini bị chặn (không thử lại vượt hạn)', async () => {
  let n = 0;
  const cfg = loadConfig({ INTERVIEW_AI_KEY: 'k', INTERVIEW_AI_RETRY_MS: '30', INTERVIEW_AI_TOTAL_MS: '50' });
  const f = async () => { n++; return { status: 503, ok: false, json: async () => ({}) }; };
  await assert.rejects(callGemini(cfg, { system: 's', user: 'u' }, f), (e) => e.code === 'ai_busy');
  assert.ok(n < 3, `thử ${n} lần, phải dừng sớm`);
});

/* ---- 3. Chống bịa số mở rộng ---- */
test('numbersGrounded: giữ dấu thập phân, bắt số viết bằng chữ', () => {
  assert.ok(!numbersGrounded('tăng 1.5 lần', 'tăng 15 lần'));
  assert.ok(!numbersGrounded('tăng 15 lần', 'tăng 1,5 lần'));
  assert.ok(numbersGrounded('tăng 1,5 lần', 'tăng 1.5 lần'), 'dấu , và . thập phân tương đương');
  assert.ok(numbersGrounded('1.500.000 đồng', 'có 1,500,000 đồng'));
  assert.ok(!numbersGrounded('giảm ba mươi phần trăm chi phí', 'tôi giảm chi phí'));
  assert.ok(numbersGrounded('giảm ba mươi phần trăm chi phí', 'tôi giảm ba mươi phần trăm chi phí'));
  assert.ok(!numbersGrounded('hiệu suất gấp đôi', 'hiệu suất tăng'));
  assert.ok(!numbersGrounded('tăng gấp ba lần', 'tăng nhanh'));
  assert.ok(!numbersGrounded('giảm một nửa thời gian', 'giảm thời gian'));
  assert.ok(numbersGrounded('Hơi ngắn, nên khoảng 150 đến 300 chữ', 'x'), 'gợi ý độ dài không phải số bịa');
  assert.ok(numbersGrounded('làm ba năm ở công ty', 'ba năm kinh nghiệm'));
  assert.ok(numbersGrounded('Bạn trả lời có một ví dụ', 'x'), '"một" đơn lẻ không bị coi là số liệu');
});
test('validateFeedback: lọc số bịa trên MỌI trường chữ và đối chiếu điểm tổng', () => {
  const r = validateFeedback({
    overall: 9, summary: 'Bạn giảm 45% chi phí, rất tốt.',
    criteria: [{ key: 'cau_truc', score: 3, comment: 'Ổn' }, { key: 'so_lieu', score: 2, comment: 'Bạn nói tăng gấp đôi doanh thu' }, { key: 'cu_the', score: 4, comment: 'Có ví dụ' }],
    strengths: ['Nêu 99 khách'], improvements: ['Nên nêu số như 30% chẳng hạn', 'Thêm bối cảnh'], rewrite_hint: '',
  }, ANSWER, 'Giới thiệu bản thân');
  assert.equal(r.summary, '');
  assert.equal(r.criteria[1].comment, '');
  assert.equal(r.criteria[0].comment, 'Ổn');
  assert.deepEqual(r.strengths, []);
  assert.deepEqual(r.improvements, ['Thêm bối cảnh']);
  assert.equal(r.overall, 3, 'điểm tổng lệch >3 so với trung bình tiêu chí thì dùng trung bình');
  assert.ok(r.droppedFields >= 4);
  assert.equal(validateFeedback({ ...good, overall: 6, criteria: [{ key: 'cau_truc', score: 8 }, { key: 'cu_the', score: 6 }] }, '').overall, 6, 'lệch nhỏ giữ nguyên');
});
test('validateRewrite: lọc số bịa ở từ khóa, ghi chú', () => {
  const r = validateRewrite({ bullets: ['Đối chiếu công nợ hằng tháng'], keywords: ['công nợ', 'top 10%'], missing: ['SAP 3 năm'], note: 'Đã tăng 50% hiệu quả' }, 'Đối chiếu công nợ hằng tháng', 'Cần SAP 3 năm');
  assert.deepEqual(r.keywords, ['công nợ']);
  assert.deepEqual(r.missing, ['SAP 3 năm'], 'số từ tin tuyển dụng là hợp lệ');
  assert.equal(r.note, '');
});

/* ---- 4. Chỗ trống [...] ---- */
test('cvChecks và thư cảnh báo chỗ trống [...] chưa điền', () => {
  const cv = { ...emptyCv(), hoTen: 'A', email: 'a@b.vn', chucDanh: 'x', tomTat: 'y', kyNang: 'z', kinhNghiem: [{ congTy: 'C', chucVu: 'V', tu: '', den: '', mota: 'Lập báo cáo [số liệu thật của bạn]' }] };
  assert.ok(cvChecks(cv).some((c) => /\[/.test(c) || /chỗ trống/i.test(c)));
  assert.deepEqual(findPlaceholders('a [số liệu thật của bạn] b [x]'), ['[số liệu thật của bạn]', '[x]']);
  assert.deepEqual(findPlaceholders('không có'), []);
  const out = fillLetter(LETTER_TEMPLATES[0].body, {});
  assert.ok(findPlaceholders(out).length >= 5);
  assert.equal(findPlaceholders(fillLetter('{{hoTen}}', { hoTen: 'Lan' })).length, 0);
});

/* ---- 5. Tốc độ nói ---- */
test('tốc độ nói chỉ đo trên phần văn bản đến từ giọng nói', () => {
  const text = 'từ '.repeat(100);
  const mostlyTyped = analyzeAnswer({ text, durationSec: 60, spoken: true, voiceWords: 10 });
  assert.equal(mostlyTyped.pace, null);
  assert.equal(mostlyTyped.paceSkipped, true);
  const mostlyVoice = analyzeAnswer({ text, durationSec: 60, spoken: true, voiceWords: 90 });
  assert.equal(mostlyVoice.pace, 90, 'tính theo số tiếng đến từ giọng nói');
  assert.equal(analyzeAnswer({ text, durationSec: 60, spoken: true }).pace, 100, 'tương thích ngược');
  assert.equal(paceLabel(215).level, 'vua', 'ngưỡng nhanh nới cho tiếng Việt');
  assert.ok(/tham khảo/.test(paceLabel(300).text) || /tham khảo/.test(paceLabel(50).text));
});

/* ---- 6. Từ vựng ---- */
test('quickCheck "chúng tôi": dùng ranh giới từ, không nhầm "em" trong "chúng em"', () => {
  const body = ' công việc rất nhiều và cần nhiều người tham gia vào dự án lớn của công ty hằng năm.'.repeat(2);
  assert.ok(quickCheck('Chúng tôi làm dự án. Chúng tôi chia việc.' + body).tips.some((t) => /chúng tôi/i.test(t)));
  assert.ok(!quickCheck('Chúng tôi làm dự án. Tôi phụ trách báo cáo và tôi đã lập bảng. Em đã kiểm tra.' + body).tips.some((t) => /chúng tôi/i.test(t)));
  assert.ok(quickCheck('Chúng em làm dự án, chúng em chia việc.' + body).tips.some((t) => /chúng tôi/i.test(t)), '"chúng em" không được coi là có "em" riêng');
});
test('đếm từ độn: "thì là" rau và "nói chung là" không bị nhận nhầm', () => {
  assert.equal(countFillers('Canh cá nấu rau thì là rất thơm').total, 0);
  assert.equal(countFillers('Em đến thì là em làm ngay').total, 1);
  assert.equal(countFillers('Nói chung là hệ thống ổn định').total, 0);
});
test('countWords: số có dấu ngăn cách và từ ghép gạch nối là một từ', () => {
  assert.equal(countWords('Lương 1.500.000 đồng'), 3);
  assert.equal(countWords('Gửi e-mail cho khách'), 4);
  assert.equal(countWords('giá 2,5 triệu'), 3);
});

/* ---- 7. Gemini ---- */
test('Gemini: cấu hình chống cắt cụt, báo rõ khi bị chặn hoặc hết token', async () => {
  const cfg = loadConfig({ INTERVIEW_AI_KEY: 'k', INTERVIEW_AI_RETRY_MS: '0' });
  let sent;
  await callGemini(cfg, { system: 's', user: 'u' }, async (u, init) => { sent = JSON.parse(init.body); return ok(good); });
  assert.ok(sent.generationConfig.maxOutputTokens >= 4096);
  assert.ok(sent.generationConfig.thinkingConfig && sent.generationConfig.thinkingConfig.thinkingBudget <= 1024);
  const resp = (j) => async () => ({ status: 200, ok: true, json: async () => j });
  await assert.rejects(callGemini(cfg, { system: 's', user: 'u' }, resp({ promptFeedback: { blockReason: 'SAFETY' } })), (e) => e.code === 'ai_blocked');
  await assert.rejects(callGemini(cfg, { system: 's', user: 'u' }, resp({ candidates: [{ finishReason: 'SAFETY' }] })), (e) => e.code === 'ai_blocked');
  await assert.rejects(callGemini(cfg, { system: 's', user: 'u' }, resp({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a":' }] } }] })), (e) => e.code === 'ai_truncated');
  // 400 vì thinkingConfig không được hỗ trợ -> thử lại không có thinkingConfig
  let calls = 0;
  const r = await callGemini(cfg, { system: 's', user: 'u' }, async (u, init) => { calls++; if (JSON.parse(init.body).generationConfig.thinkingConfig) return { status: 400, ok: false, json: async () => ({}) }; return ok(good); });
  assert.equal(calls, 2); assert.ok(r.includes('overall'));
});
test('client: api.js có timeout phía trình duyệt', () => {
  assert.match(fs.readFileSync(new URL('../public/js/api.js', import.meta.url), 'utf8'), /AbortController/);
});

/* ---- 8. Docker ---- */
test('Dockerfile: healthcheck theo PORT; có .dockerignore', () => {
  const d = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.ok(/HEALTHCHECK[^\n]*\$\{?PORT\}?/.test(d), 'healthcheck dùng $PORT');
  assert.ok(!/127\.0\.0\.1:8098/.test(d));
  const ig = fs.readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8');
  for (const x of ['node_modules', '.env', 'shots', 'test']) assert.ok(ig.includes(x), x);
});

/* ---- 9. Câu hỏi nhạy cảm ---- */
test('có câu hỏi nhạy cảm (tuổi, hôn nhân/sinh con, ngoại hình, gia cảnh) với cách chuyển hướng và lưu ý pháp lý chung', () => {
  const sens = QUESTIONS.filter((q) => q.sensitive);
  assert.ok(sens.length >= 4);
  const blob = JSON.stringify(sens);
  for (const kw of ['tuổi', 'sinh con', 'ngoại hình', 'gia đình']) assert.ok(blob.toLowerCase().includes(kw), kw);
  assert.ok(sens.every((q) => /không nên hỏi|không liên quan/.test(q.intent + q.tips.join(' '))));
  assert.ok(sens.every((q) => /kiểm chứng/.test(q.tips.join(' '))), 'có nhắc kiểm chứng pháp lý');
  assert.ok(!/Điều \d+/.test(blob), 'không dẫn số điều luật cụ thể');
});
