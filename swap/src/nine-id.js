// Máy khách nhỏ gọi API nội bộ của 9id (Node 18+, không phụ thuộc gì). BẢN RÚT GỌN của 9id/client/nine-id.js: chỉ cần `verify`
// (Dockerfile của 9lunch chỉ build từ thư mục này).
//
//   const id = createNineId({ baseUrl: 'http://9id:8102/id', keyId: 'lunch', secret: process.env.NINE_ID_SECRET });
//   const who = await id.verify(cookies.nine_sid);   // { userId, displayName } hoặc null (phiên không hợp lệ); 9id không đạt được -> ném lỗi
//
// Chữ ký: HMAC-SHA256(secret, ts \n nonce \n METHOD \n đường-dẫn-và-query \n sha256(body)); mỗi yêu cầu một nonce mới.
import crypto from 'node:crypto';

export class NineIdError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function createNineId({ baseUrl, keyId, secret, timeoutMs = 3000, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  async function call(method, path, body) {
    const pathq = basePath + path;
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${nonce}\n${method}\n${pathq}\n${crypto.createHash('sha256').update(raw).digest('hex')}`).digest('hex');
    const headers = { 'x-9id-key': keyId, 'x-9id-ts': ts, 'x-9id-nonce': nonce, 'x-9id-sig': sig };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetchImpl(base.origin + pathq, { method, headers, body: body === undefined ? undefined : raw, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* không phải JSON */ }
    if (!res.ok) throw new NineIdError(res.status, json && json.error && json.error.code, (json && json.error && json.error.message) || `9id trả ${res.status}`);
    return json;
  }
  return {
    // token = giá trị cookie nine_sid. Không hợp lệ -> null (không ném lỗi). 9id không đạt được -> ném lỗi (đừng coi là đăng xuất).
    async verify(token) {
      if (typeof token !== 'string' || !token) return null;
      try { return await call('POST', '/internal/v1/verify', { token }); } catch (e) {
        if (e instanceof NineIdError && e.status === 401 && e.code === 'invalid_session') return null;
        throw e;
      }
    },
  };
}
