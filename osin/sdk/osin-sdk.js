// osin-sdk.js: thêm điểm cuối công cụ của Osin vào một app Node (node:http) chỉ với vài dòng.
// Không phụ thuộc gói ngoài. Giao thức đầy đủ: osin/docs/OSIN-TOOL-PROTOCOL.md
//
//   import { createOsinApi } from '../osin/sdk/osin-sdk.js';
//   const osin = createOsinApi({
//     appId: 'family', prefix: '/family/osin-api/v1',
//     keys: { osin: process.env.OSIN_KEY_SECRET },
//     tools: [{ name: 'lich_hom_nay', description: '...', parameters: {...}, readOnly: true,
//               async run(args, ctx) { return { ... }; } }],
//   });
//   // trong bộ định tuyến: if (osin.matches(req.url)) return osin.handle(req, res);
import crypto from 'node:crypto';

export const PROTOCOL = 1;
export const MAX_SKEW_SEC = 120;
export const NONCE_TTL_SEC = 300;
export const MAX_BODY = 64 * 1024;
export const MAX_RESULT_BYTES = 100 * 1024;

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const KEYID_RE = /^[a-z0-9_-]{1,30}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TOOL_RE = /^[a-z][a-z0-9_]{1,40}$/;
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

export class OsinError extends Error {
  constructor(code, message, status = 200) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

// ---------- chữ ký ----------
export function canonicalString({ keyId, ts, nonce, method, pathWithQuery, body = '' }) {
  return `OSIN1\n${keyId}\n${ts}\n${nonce}\n${String(method).toUpperCase()}\n${pathWithQuery}\n${sha256hex(body)}`;
}
export const sign = (secret, parts) => crypto.createHmac('sha256', secret).update(canonicalString(parts)).digest('hex');

/** Tạo bộ header ký sẵn (dùng ở phía Osin hoặc trong test). */
export function signRequest({ keyId, secret, method, pathWithQuery, body = '', ts = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(16).toString('base64url') }) {
  return {
    'x-osin-key': keyId,
    'x-osin-ts': String(ts),
    'x-osin-nonce': nonce,
    'x-osin-sig': sign(secret, { keyId, ts: String(ts), nonce, method, pathWithQuery, body }),
  };
}

/** Kho nonce trong bộ nhớ. Có trần: đầy thì TỪ CHỐI (không bỏ kiểm). Nhiều bản app: tự cài cùng giao diện bằng CSDL. */
export function createNonceStore({ ttlSec = NONCE_TTL_SEC, max = 200000, now = () => Date.now(), initial = [], persist = null } = {}) {
  // initial: [[key, hạn(ms)]] nạp lại sau khi khởi động; persist(key, hạn(ms)): hàm lưu bền (CSDL/tệp) gọi mỗi lần nhận nonce mới
  const m = new Map(initial.filter(([, exp]) => exp > now()));
  return {
    /** true nếu nonce mới (đã ghi nhận); false nếu đã thấy; ném lỗi nếu kho đầy. */
    async claim(key) {
      const t = now();
      if (m.size >= max) { for (const [k, exp] of m) if (exp <= t) m.delete(k); }
      if (m.has(key) && m.get(key) > t) return false;
      if (m.size >= max) throw new OsinError('busy', 'Máy chủ đang quá tải, thử lại sau', 503);
      m.set(key, t + ttlSec * 1000);
      if (persist) await persist(key, t + ttlSec * 1000);
      return true;
    },
    get size() { return m.size; },
  };
}

/** Kho kết quả theo requestId cho tool ghi: cùng requestId chỉ chạy một lần. */
export function createResultStore({ ttlSec = 3600, max = 20000, now = () => Date.now() } = {}) {
  const m = new Map(); // key -> { exp, fp, promise }
  return {
    /** Chạy fn một lần cho key; gọi lại cùng key (và cùng dấu vân tay) trả lại kết quả cũ. */
    async once(key, fingerprint, fn) {
      const t = now();
      if (m.size >= max) for (const [k, v] of m) if (v.exp <= t) m.delete(k);
      const cur = m.get(key);
      if (cur && cur.exp > t) {
        if (cur.fp !== fingerprint) throw new OsinError('request_mismatch', 'requestId này đã dùng cho một yêu cầu khác', 409);
        return cur.promise;
      }
      if (m.size >= max) throw new OsinError('busy', 'Máy chủ đang quá tải, thử lại sau', 503);
      const promise = Promise.resolve().then(fn);
      m.set(key, { exp: t + ttlSec * 1000, fp: fingerprint, promise });
      try { return await promise; } catch (e) { m.delete(key); throw e; } // lỗi thì cho phép thử lại
    },
  };
}

/** Kiểm chữ ký + thời gian + nonce. Ném OsinError(401) nếu sai. Trả { keyId }. */
export async function verifyRequest({ keys, method, pathWithQuery, headers, body = '', nonces, now = () => Date.now(), maxSkewSec = MAX_SKEW_SEC, notBefore = 0 }) {
  const deny = (code, msg) => new OsinError(code, msg, 401);
  const h = (n) => String(headers[n] ?? '');
  const keyId = h('x-osin-key'); const ts = h('x-osin-ts'); const nonce = h('x-osin-nonce'); const sig = h('x-osin-sig');
  if (!KEYID_RE.test(keyId) || !/^\d{9,12}$/.test(ts) || !NONCE_RE.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) throw deny('bad_signature', 'Thiếu hoặc sai header xác thực');
  const secret = keys instanceof Map ? keys.get(keyId) : (Object.prototype.hasOwnProperty.call(keys, keyId) ? keys[keyId] : undefined);
  if (!secret) throw deny('bad_signature', 'Khóa không hợp lệ');
  const want = Buffer.from(sign(secret, { keyId, ts, nonce, method, pathWithQuery, body }));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw deny('bad_signature', 'Chữ ký không hợp lệ');
  if (Math.abs(now() / 1000 - Number(ts)) > maxSkewSec) throw deny('expired_ts', 'Đồng hồ lệch quá ' + maxSkewSec + ' giây');
  // Kho nonce trong bộ nhớ mất khi khởi động lại: từ chối mọi yêu cầu ký TRƯỚC lúc tiến trình khởi động, đóng cửa sổ phát lại 120 giây
  if (notBefore && Number(ts) < notBefore) throw deny('expired_ts', 'Yêu cầu được ký trước khi máy chủ khởi động');
  // chữ ký đúng mới ghi nonce (kẻ lạ không làm đầy kho)
  if (!(await nonces.claim(`${keyId}:${nonce}`))) throw deny('replay', 'Yêu cầu bị phát lại');
  return { keyId, ts: Number(ts), nonce };
}

// ---------- biên nhận xác nhận (receipt) ----------
// Osin chỉ cấp biên nhận SAU khi người dùng bấm Xác nhận. Ký bằng khóa RIÊNG (khác khóa HMAC thường của kênh gọi), sống tối đa 2 phút,
// gắn userId + tool + băm tham số + requestId. Thiết kế để sau này 9id ký (Ed25519) và app kiểm bằng khóa công khai: truyền receipt.verify.
export const RECEIPT_MAX_SEC = 120;
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
}
export const argsHash = (args) => sha256hex(canonicalJson(args ?? {}));
export function signReceipt(secret, { userId, tool, argsHash: h, requestId, exp }) {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: tool, h, r: requestId, x: exp })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret).update('OSINRCPT1\n' + payload).digest('hex');
}
/** Kiểm biên nhận HMAC. Trả true/false (không ném lỗi). */
export function verifyReceiptHmac(secrets, receipt, expected, nowSec = Math.floor(Date.now() / 1000)) {
  try {
    const [payload, sig] = String(receipt || '').split('.');
    if (!payload || !/^[0-9a-f]{64}$/.test(sig || '')) return false;
    const list = Array.isArray(secrets) ? secrets : [secrets];
    const okSig = list.some((s) => { const want = crypto.createHmac('sha256', s).update('OSINRCPT1\n' + payload).digest('hex'); return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig)); });
    if (!okSig) return false;
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return p.u === expected.userId && p.t === expected.tool && p.h === expected.argsHash && p.r === expected.requestId
      && Number.isFinite(p.x) && p.x > nowSec && p.x - nowSec <= RECEIPT_MAX_SEC + 5;
  } catch { return false; }
}

// ---------- kiểm tham số theo JSON Schema (tập con, chặt) ----------
/** Trả mảng lỗi (rỗng = hợp lệ). Không nhận thuộc tính lạ, không nhận kiểu sai. */
export function validateArgs(schema, value, path = 'args', depth = 0) {
  const errs = [];
  if (depth > 6) return [`${path}: lồng quá sâu`];
  const s = schema || {};
  const t = s.type;
  const typeOk = (v) => {
    if (t === 'string') return typeof v === 'string';
    if (t === 'integer') return Number.isSafeInteger(v);
    if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
    if (t === 'boolean') return typeof v === 'boolean';
    if (t === 'array') return Array.isArray(v);
    if (t === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
    return true;
  };
  if (value === null || value === undefined) { if (s.nullable) return errs; return [`${path}: thiếu giá trị`]; }
  if (!typeOk(value)) return [`${path}: sai kiểu (cần ${t})`];
  if (Array.isArray(s.enum) && !s.enum.includes(value)) errs.push(`${path}: không thuộc ${s.enum.join('|')}`);
  if (t === 'string') {
    if (s.maxLength !== undefined && [...value].length > s.maxLength) errs.push(`${path}: dài quá ${s.maxLength} ký tự`);
    if (s.minLength !== undefined && [...value].length < s.minLength) errs.push(`${path}: ngắn hơn ${s.minLength} ký tự`);
    if (s.pattern) { try { if (!new RegExp(s.pattern).test(value)) errs.push(`${path}: sai định dạng`); } catch { errs.push(`${path}: mẫu kiểm không hợp lệ`); } }
    if (s.maxLength === undefined && value.length > 2000) errs.push(`${path}: dài quá 2000 ký tự`);
  }
  if ((t === 'integer' || t === 'number')) {
    if (s.minimum !== undefined && value < s.minimum) errs.push(`${path}: nhỏ hơn ${s.minimum}`);
    if (s.maximum !== undefined && value > s.maximum) errs.push(`${path}: lớn hơn ${s.maximum}`);
  }
  if (t === 'array') {
    if (s.maxItems !== undefined && value.length > s.maxItems) errs.push(`${path}: quá ${s.maxItems} phần tử`);
    if (s.minItems !== undefined && value.length < s.minItems) errs.push(`${path}: ít hơn ${s.minItems} phần tử`);
    if (value.length > 200) errs.push(`${path}: quá 200 phần tử`);
    else if (s.items) value.forEach((v, i) => errs.push(...validateArgs(s.items, v, `${path}[${i}]`, depth + 1)));
  }
  if (t === 'object') {
    const props = s.properties || {};
    for (const k of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) errs.push(`${path}.${k}: tham số không có trong khai báo`);
    }
    for (const r of s.required || []) if (value[r] === undefined || value[r] === null) errs.push(`${path}.${r}: bắt buộc`);
    for (const [k, sub] of Object.entries(props)) if (value[k] !== undefined) errs.push(...validateArgs(sub, value[k], `${path}.${k}`, depth + 1));
  }
  return errs;
}

/** Điền summaryTemplate: {ten} -> giá trị tham số (đã làm sạch, cắt ngắn). Dùng hàm thay thế, không dùng chuỗi thay thế. */
export function renderTemplate(template, args) {
  return String(template || '').replace(/\{([a-z][a-z0-9_]*)\}/g, (_, k) => {
    const v = args && Object.prototype.hasOwnProperty.call(args, k) ? args[k] : '';
    const s = typeof v === 'string' ? v : JSON.stringify(v ?? '');
    return s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  });
}

// ---------- khai báo công cụ ----------
const SCHEMA_TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];
function checkSchema(schema, path, depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${path}: schema phải là đối tượng`);
  if (depth > 5) throw new Error(`${path}: schema lồng quá sâu`);
  if (!SCHEMA_TYPES.includes(schema.type)) throw new Error(`${path}: type phải thuộc ${SCHEMA_TYPES.join('|')}`);
  if (schema.type === 'object') {
    for (const [k, v] of Object.entries(schema.properties || {})) checkSchema(v, `${path}.${k}`, depth + 1);
    for (const r of schema.required || []) if (!(schema.properties || {})[r]) throw new Error(`${path}: required "${r}" không có trong properties`);
  }
  if (schema.type === 'array') checkSchema(schema.items || { type: 'string' }, `${path}[]`, depth + 1);
}

/** Kiểm định nghĩa công cụ lúc khởi động (sai thì ném lỗi ngay, không để lọt ra production). */
export function defineTool(def) {
  const bad = (m) => { throw new Error(`Công cụ "${def && def.name}": ${m}`); };
  if (!def || typeof def !== 'object') throw new Error('Định nghĩa công cụ phải là đối tượng');
  if (!TOOL_RE.test(def.name || '')) bad('tên phải dạng [a-z][a-z0-9_]{1,40}');
  if (typeof def.description !== 'string' || def.description.length < 10 || def.description.length > 500) bad('description (tiếng Việt, cho mô hình) dài 10..500 ký tự');
  const parameters = def.parameters || { type: 'object', properties: {} };
  if (parameters.type !== 'object') bad('parameters phải có type object');
  try { checkSchema(parameters, 'parameters'); } catch (e) { bad(e.message); }
  if (typeof def.readOnly !== 'boolean') bad('readOnly phải khai rõ true/false');
  if (typeof def.run !== 'function') bad('thiếu hàm run(args, ctx)');
  const confirm = def.confirm === undefined ? !def.readOnly : !!def.confirm;
  if (!def.readOnly && !confirm) bad('công cụ ghi (readOnly:false) phải có confirm:true');
  if (!def.readOnly && !(def.summaryTemplate || def.preview)) bad('công cụ ghi cần summaryTemplate hoặc hàm preview để người dùng thấy mình sắp làm gì');
  return {
    name: def.name, description: def.description, parameters, readOnly: def.readOnly, confirm,
    sensitive: !!def.sensitive, summaryTemplate: def.summaryTemplate || '', run: def.run, preview: def.preview || null, authorize: typeof def.authorize === 'function' ? def.authorize : null,
  };
}

const publicManifestTool = (t) => ({ name: t.name, description: t.description, parameters: t.parameters, readOnly: t.readOnly, confirm: t.confirm, sensitive: t.sensitive, summaryTemplate: t.summaryTemplate });

function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let big = false;
    req.on('data', (c) => { size += c.length; if (size > max) { big = true; return; } chunks.push(c); });
    req.on('end', () => (big ? reject(new OsinError('too_large', 'Nội dung quá lớn', 413)) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

/**
 * Tạo bộ xử lý cho app.
 * opts: appId, prefix (đường dẫn đầy đủ app nhìn thấy, ví dụ '/family/osin-api/v1'), keys ({keyId: secret}),
 *       tools [] (mỗi công cụ có thể có authorize(args, ctx) để kiểm quyền), nonceStore?, resultStore?, now?, log?(sự kiện không chứa nội dung)
 */
export function createOsinApi(opts) {
  const { appId, prefix = '/osin-api/v1', keys, tools: defs = [] } = opts;
  if (!/^[a-z0-9]{2,20}$/.test(appId || '')) throw new Error('appId phải dạng [a-z0-9]{2,20}');
  const keyMap = keys instanceof Map ? keys : new Map(Object.entries(keys || {}));
  if (!keyMap.size) throw new Error('Cần ít nhất một khóa (keys)');
  for (const [k, v] of keyMap) {
    if (!KEYID_RE.test(k)) throw new Error(`keyId "${k}" không hợp lệ`);
    if (typeof v !== 'string' || v.length < 32) throw new Error(`Bí mật của khóa "${k}" quá ngắn (cần ít nhất 32 ký tự)`);
  }
  const tools = new Map();
  for (const d of defs) { const t = defineTool(d); if (tools.has(t.name)) throw new Error(`Trùng tên công cụ ${t.name}`); tools.set(t.name, t); }
  if (tools.size > 40) throw new Error('Tối đa 40 công cụ mỗi app');
  const nonces = opts.nonceStore || createNonceStore({ now: opts.now });
  const results = opts.resultStore || createResultStore({ now: opts.now });
  const now = opts.now || (() => Date.now());
  const log = opts.log || (() => {});
  // Biên nhận: PHẢI quyết định rõ. { secret } hoặc { secrets:[...] } (HMAC, khóa KHÁC khóa kênh), { verify(receipt, expected) } (ví dụ Ed25519 của 9id), hoặc false (tắt, chỉ để thử nghiệm).
  if (opts.receipt === undefined) throw new Error('Phải cấu hình receipt: { secret } (khóa biên nhận riêng, khác khóa kênh), { verify } hoặc false (tắt rõ ràng)');
  const rc = opts.receipt;
  if (rc) {
    const secs = rc.secrets || (rc.secret ? [rc.secret] : []);
    if (!rc.verify && !secs.length) throw new Error('receipt cần secret, secrets hoặc verify');
    for (const sec of secs) {
      if (typeof sec !== 'string' || sec.length < 32) throw new Error('Khóa biên nhận quá ngắn (cần ít nhất 32 ký tự)');
      for (const k of keyMap.values()) if (k === sec) throw new Error('Khóa biên nhận phải KHÁC khóa HMAC của kênh gọi');
    }
  }
  const verifyReceipt = async (receipt, expected) => {
    if (!rc) return true;
    if (typeof receipt !== 'string' || receipt.length > 1024) return false;
    if (rc.verify) return !!(await rc.verify(receipt, expected));
    return verifyReceiptHmac(rc.secrets || [rc.secret], receipt, expected, Math.floor(now() / 1000));
  };
  // Trước khi khởi động xong: từ chối yêu cầu ký trước lúc tiến trình khởi động (kho nonce trong bộ nhớ). Kho bền thì đặt persistent:true.
  const notBefore = opts.persistent ? 0 : Math.floor(now() / 1000) - 2;
  // Giới hạn tần suất theo người dùng cho mọi execute (chống Osin bị chiếm quét hàng loạt) và nhật ký kiểm toán (không có tham số/kết quả)
  const rate = opts.userRate || { max: 120, windowSec: 60 };
  const hits = new Map();
  const userLimited = (u) => {
    const t = now(); const w = rate.windowSec * 1000;
    const a = (hits.get(u) || []).filter((x) => t - x < w);
    if (a.length >= rate.max) { hits.set(u, a); return true; }
    a.push(t); hits.set(u, a);
    if (hits.size > 50000) for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] > w) hits.delete(k);
    return false;
  };
  const audit = opts.audit || ((e) => console.log('[osin-audit]', JSON.stringify(e)));

  const fail = (status, code, message) => ({ status, body: { ok: false, error: { code, message } } });

  /** Xử lý thuần: nhận { method, url, headers, body (chuỗi) }, trả { status, body }. */
  async function handleRequest({ method, url, headers, body = '' }) {
    try {
      const pathname = String(url).split('?')[0];
      const route = pathname === prefix + '/tools' ? 'tools' : pathname === prefix + '/call' ? 'call' : null;
      if (!route) return fail(404, 'not_found', 'Không tìm thấy');
      if ((route === 'tools' && method !== 'GET') || (route === 'call' && method !== 'POST')) return fail(405, 'method_not_allowed', 'Phương thức không được hỗ trợ');
      const auth = await verifyRequest({ keys: keyMap, method, pathWithQuery: url, headers, body, nonces, now, notBefore });
      if (route === 'tools') return { status: 200, body: { protocol: PROTOCOL, app: appId, tools: [...tools.values()].map(publicManifestTool) } };

      let req;
      try { req = JSON.parse(body); } catch { return fail(400, 'bad_json', 'Thân yêu cầu không phải JSON'); }
      if (!req || typeof req !== 'object' || Array.isArray(req)) return fail(400, 'bad_json', 'Thân yêu cầu không hợp lệ');
      // ts và nonce trong thân phải trùng header (đã được chữ ký bảo vệ qua băm thân)
      if (String(req.ts) !== String(headers['x-osin-ts']) || req.nonce !== headers['x-osin-nonce']) return fail(401, 'bad_signature', 'ts/nonce trong thân không khớp header');
      const mode = req.mode === undefined ? 'execute' : req.mode;
      if (mode !== 'execute' && mode !== 'preview') return fail(400, 'bad_request', 'mode phải là execute hoặc preview');
      if (typeof req.actingUserId !== 'string' || !ID_RE.test(req.actingUserId)) return fail(400, 'no_user', 'Thiếu hoặc sai actingUserId');
      if (req.familyId !== undefined && req.familyId !== null && (typeof req.familyId !== 'string' || !ID_RE.test(req.familyId))) return fail(400, 'bad_request', 'familyId không hợp lệ');
      if (typeof req.requestId !== 'string' || !ID_RE.test(req.requestId)) return fail(400, 'bad_request', 'Thiếu hoặc sai requestId');
      const tool = typeof req.tool === 'string' ? tools.get(req.tool) : undefined;
      if (!tool) return fail(200, 'unknown_tool', 'Công cụ không tồn tại');
      const args = req.args === undefined ? {} : req.args;
      const errs = validateArgs(tool.parameters, args);
      if (errs.length) return { status: 200, body: { ok: false, error: { code: 'invalid_args', message: 'Tham số chưa hợp lệ: ' + errs.slice(0, 4).join('; ') } } };

      const ctx = Object.freeze({ userId: req.actingUserId, familyId: req.familyId || null, requestId: req.requestId, mode, keyId: auth.keyId, appId });
      // quyền: app kiểm THEO ctx.userId/familyId ở cả xem trước lẫn thực hiện (ném lỗi có osinCode:'forbidden' nếu không được phép)
      if (tool.authorize) await tool.authorize(args, ctx);
      if (mode === 'preview') {
        // chỉ kiểm tra và mô tả, không ghi gì
        let summary = '';
        if (tool.preview) { const p = await tool.preview(args, ctx); summary = typeof p === 'string' ? p : (p && p.summary) || ''; }
        if (!summary) summary = renderTemplate(tool.summaryTemplate, args);
        log({ event: 'call', tool: tool.name, mode: 'preview', ok: true });
        return { status: 200, body: { ok: true, preview: { summary: String(summary).slice(0, 300) } } };
      }
      // execute: giới hạn theo người dùng; công cụ ghi phải có biên nhận hợp lệ; mọi execute để lại nhật ký kiểm toán
      const aud = { at: new Date(now()).toISOString(), app: appId, tool: tool.name, userId: ctx.userId, familyId: ctx.familyId, requestId: ctx.requestId, argsHash: argsHash(args), write: !tool.readOnly };
      if (userLimited(ctx.userId)) { audit({ ...aud, ok: false, code: 'rate_limited' }); return fail(429, 'rate_limited', 'Quá nhiều yêu cầu cho người dùng này, thử lại sau'); }
      if (!tool.readOnly && !(await verifyReceipt(req.receipt, { userId: ctx.userId, tool: tool.name, argsHash: aud.argsHash, requestId: ctx.requestId }))) {
        audit({ ...aud, ok: false, code: 'receipt_required' });
        return { status: 200, body: { ok: false, error: { code: 'receipt_required', message: 'Thiếu hoặc sai biên nhận xác nhận của người dùng, không thực hiện.' } } };
      }
      const exec = async () => { try { const r = await tool.run(args, ctx); audit({ ...aud, ok: true }); return r; } catch (e) { audit({ ...aud, ok: false, code: (e && e.osinCode) || 'internal' }); throw e; } };
      const out = tool.readOnly
        ? await exec()
        : await results.once(`${auth.keyId}:${req.requestId}`, sha256hex(JSON.stringify([req.tool, args, req.actingUserId, req.familyId || null])), exec);
      const json = JSON.stringify(out === undefined ? null : out);
      if (Buffer.byteLength(json) > MAX_RESULT_BYTES) return fail(200, 'result_too_large', 'Kết quả quá lớn, hãy thu hẹp yêu cầu');
      log({ event: 'call', tool: tool.name, mode, ok: true });
      return { status: 200, body: { ok: true, result: out === undefined ? null : out } };
    } catch (e) {
      if (e instanceof OsinError) { log({ event: 'error', code: e.code }); return fail(e.status, e.code, e.message); }
      // lỗi nghiệp vụ có chủ đích của app: throw Object.assign(new Error('...'), { osinCode: 'forbidden' })
      if (e && e.osinCode) { log({ event: 'tool_error', code: e.osinCode }); return fail(200, String(e.osinCode), String(e.message || e.osinCode).slice(0, 300)); }
      log({ event: 'internal', code: 'internal' });
      return fail(200, 'internal', 'Công cụ gặp lỗi, thử lại sau');
    }
  }

  return {
    appId, prefix, tools: () => [...tools.values()].map(publicManifestTool),
    matches: (url) => String(url).split('?')[0].startsWith(prefix + '/'),
    handleRequest,
    /** Dùng trực tiếp với node:http: await osin.handle(req, res) */
    async handle(req, res) {
      let body = '';
      try { if (req.method !== 'GET' && req.method !== 'HEAD') body = await readBody(req); } catch (e) {
        const r = fail(e.status || 400, e.code || 'bad_request', e.message);
        res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(r.body)); return;
      }
      const r = await handleRequest({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(r.body));
    },
  };
}
