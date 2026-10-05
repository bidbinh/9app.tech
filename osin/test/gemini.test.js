// Gemini REST: header khóa, function calling, thử lại 429/503, lỗi thân thiện, giữ nguyên parts (thoughtSignature), khóa không lọt ra ngoài. Không cần CSDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../src/llm/gemini.js';
import { createLlm } from '../src/llm/index.js';
import { ApiError } from '../src/errors.js';

const KEY = 'AIzaSyTEST_KEY_0123456789_abcdefghijk';
const cfg = { aiKey: KEY, aiBase: 'https://gemini.test', aiModel: 'gemini-flash-latest', aiTimeoutMs: 500, aiRetryDelayMs: 1, aiMaxOutputTokens: 1000 };
const resp = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json });
const good = (parts, extra = {}) => resp(200, { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 12, totalTokenCount: 42 }, ...extra });
const tools = [{ name: 'family__lich', description: 'Lấy lịch', parameters: { type: 'object', additionalProperties: false, properties: { ngay: { type: 'string', format: 'date', description: 'ngày' } } } }];
const args = { system: 'Bạn là Osin', contents: [{ role: 'user', parts: [{ text: 'chào' }] }], tools };

test('gửi đúng URL, header khóa, systemInstruction, functionDeclarations đã làm sạch; đọc text và token', async () => {
  let seen;
  const p = createGeminiProvider(cfg, async (url, init) => { seen = { url: String(url), init }; return good([{ text: 'Chào bạn' }]); });
  const r = await p.generate(args);
  assert.equal(seen.url, 'https://gemini.test/v1beta/models/gemini-flash-latest:generateContent');
  assert.equal(seen.init.headers['x-goog-api-key'], KEY);
  assert.ok(!seen.url.includes(KEY), 'khóa không nằm trên URL');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.systemInstruction.parts[0].text, 'Bạn là Osin');
  assert.deepEqual(body.tools[0].functionDeclarations[0].parameters, { type: 'object', properties: { ngay: { type: 'string', description: 'ngày' } } });
  assert.equal(body.toolConfig.functionCallingConfig.mode, 'AUTO');
  assert.equal(body.generationConfig.maxOutputTokens, 1000);
  assert.equal(r.text, 'Chào bạn'); assert.equal(r.tokens, 42); assert.deepEqual(r.calls, []);
});

test('allowTools=false gửi mode NONE; không có công cụ thì không gửi tools', async () => {
  const bodies = [];
  const p = createGeminiProvider(cfg, async (_u, init) => { bodies.push(JSON.parse(init.body)); return good([{ text: 'x' }]); });
  await p.generate({ ...args, allowTools: false });
  await p.generate({ ...args, tools: [] });
  assert.equal(bodies[0].toolConfig.functionCallingConfig.mode, 'NONE');
  assert.equal(bodies[1].tools, undefined); assert.equal(bodies[1].toolConfig, undefined);
});

test('function calling: parse functionCall và giữ nguyên parts gốc (kể cả thoughtSignature) để gửi lại vòng sau', async () => {
  const parts = [{ functionCall: { name: 'family__lich', args: { ngay: '2026-10-05' } }, thoughtSignature: 'SIG123' }];
  const p = createGeminiProvider(cfg, async () => good(parts));
  const r = await p.generate(args);
  assert.deepEqual(r.calls, [{ name: 'family__lich', args: { ngay: '2026-10-05' } }]);
  assert.deepEqual(r.content, { role: 'model', parts });
  assert.equal(r.content.parts[0].thoughtSignature, 'SIG123');
});

test('bỏ phần "suy nghĩ" (thought) khỏi câu trả lời', async () => {
  const p = createGeminiProvider(cfg, async () => good([{ text: 'đang nghĩ…', thought: true }, { text: 'Kết quả.' }]));
  assert.equal((await p.generate(args)).text, 'Kết quả.');
});

test('thử lại khi 429/503 rồi thành công; hết 3 lần thì báo bận thân thiện', async () => {
  let n = 0;
  const p = createGeminiProvider(cfg, async () => { n++; return n < 3 ? resp(n === 1 ? 429 : 503, {}) : good([{ text: 'được rồi' }]); });
  assert.equal((await p.generate(args)).text, 'được rồi'); assert.equal(n, 3);
  n = 0;
  const busy = createGeminiProvider(cfg, async () => { n++; return resp(429, {}); });
  await assert.rejects(busy.generate(args), (e) => e instanceof ApiError && e.code === 'ai_busy' && e.status === 503);
  assert.equal(n, 3);
});

test('lỗi mạng được thử lại; lỗi 400/500 báo ai_failed ngay; khóa không lọt vào thông báo', async () => {
  let n = 0;
  const net = createGeminiProvider(cfg, async () => { n++; throw new Error('ECONNRESET ' + KEY); });
  await assert.rejects(net.generate(args), (e) => e.code === 'ai_failed' && !e.message.includes(KEY));
  assert.equal(n, 3);
  n = 0;
  const bad = createGeminiProvider(cfg, async () => { n++; return resp(400, { error: { message: 'API key ' + KEY } }); });
  await assert.rejects(bad.generate(args), (e) => e.code === 'ai_failed' && !e.message.includes(KEY));
  assert.equal(n, 1);
});

test('bị chặn an toàn (promptFeedback hoặc finishReason) báo ai_blocked 422', async () => {
  const a = createGeminiProvider(cfg, async () => resp(200, { promptFeedback: { blockReason: 'SAFETY' } }));
  await assert.rejects(a.generate(args), (e) => e.code === 'ai_blocked' && e.status === 422);
  const b = createGeminiProvider(cfg, async () => resp(200, { candidates: [{ finishReason: 'SAFETY' }] }));
  await assert.rejects(b.generate(args), (e) => e.code === 'ai_blocked');
});

test('không có khóa: ai_disabled; quá hạn tổng: không gọi mạng thêm; createLlm chọn đúng chế độ', async () => {
  const p = createGeminiProvider({ ...cfg, aiKey: '' }, async () => { throw new Error('không được gọi'); });
  await assert.rejects(p.generate(args), (e) => e.code === 'ai_disabled');
  let n = 0;
  const q = createGeminiProvider(cfg, async () => { n++; return good([{ text: 'x' }]); });
  await assert.rejects(q.generate({ ...args, deadline: Date.now() - 1 }), (e) => e.code === 'ai_failed');
  assert.equal(n, 0);
  assert.equal(createLlm({ aiKey: '', aiProvider: '' }).kind, 'offline');
  assert.equal(createLlm({ aiKey: 'k', aiProvider: '' }).kind, 'gemini');
  assert.throws(() => createLlm({ aiKey: 'k', aiProvider: 'mock' }), /mock/);
});

test('hủy giữa chừng (signal) dừng thử lại', async () => {
  const ctl = new AbortController();
  let n = 0;
  const p = createGeminiProvider(cfg, async (_u, init) => { n++; ctl.abort(); throw new Error('aborted'); });
  await assert.rejects(p.generate({ ...args, signal: ctl.signal }), (e) => e instanceof ApiError);
  assert.equal(n, 1);
});
