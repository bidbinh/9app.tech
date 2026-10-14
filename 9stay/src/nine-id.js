// Máy khách nhỏ cho các app gọi API nội bộ của 9id (Node 18+, không phụ thuộc gì). Sao chép tệp này vào app, hoặc import từ đây.
//
//   import { createNineId } from './nine-id.js';
//   const id = createNineId({ baseUrl: 'http://9id:8102/id', keyId: 'family', secret: process.env.NINE_ID_SECRET });
//   const who = await id.verify(cookies.nine_sid);          // { userId, displayName } hoặc null
//   const { families } = await id.userFamilies(who.userId);
//   const { role, members } = await id.members(familyId, who.userId);   // gia đình người này không thuộc về -> ném lỗi status 404
//
// Chữ ký: HMAC-SHA256(secret, ts \n nonce \n METHOD \n đường-dẫn-và-query \n sha256(body)); mỗi yêu cầu một nonce mới.
import crypto from 'node:crypto';

export class NineIdError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function createNineId({ baseUrl, keyId, secret, timeoutMs = 5000, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  async function call(method, path, body, userToken) {
    const pathq = basePath + path;
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${nonce}\n${method}\n${pathq}\n${crypto.createHash('sha256').update(raw).digest('hex')}`).digest('hex');
    const headers = { 'x-9id-key': keyId, 'x-9id-ts': ts, 'x-9id-nonce': nonce, 'x-9id-sig': sig };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (userToken) headers['x-9id-token'] = userToken; // token phiên của chính người dùng (không nằm trong chữ ký)
    const res = await fetchImpl(base.origin + pathq, { method, headers, body: body === undefined ? undefined : raw, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* không phải JSON */ }
    if (!res.ok) throw new NineIdError(res.status, json && json.error && json.error.code, (json && json.error && json.error.message) || `9id trả ${res.status}`);
    return json;
  }
  return {
    // token = giá trị cookie nine_sid. Không hợp lệ -> null (không ném lỗi). 9id không đạt được -> ném lỗi (đừng coi là đăng xuất).
    async verify(token, { fields } = {}) {
      if (typeof token !== 'string' || !token) return null;
      try { return await call('POST', '/internal/v1/verify', { token, ...(fields ? { fields } : {}) }); } catch (e) {
        if (e instanceof NineIdError && e.status === 401 && e.code === 'invalid_session') return null;
        throw e;
      }
    },
    // Đăng nhập cho app ở tên miền con: đổi mã (từ ?code= sau khi 9id chuyển hướng) lấy phiên; kiểm lại phiên định kỳ (<= 5 phút)
    exchange: (code, client, redirectUri) => call('POST', '/internal/v1/exchange', { code, client, redirect_uri: redirectUri }),
    sessionValid: (sessionId9id) => call('POST', '/internal/v1/session-valid', { sessionId9id }),
    sessionEnd: (sessionId9id) => call('POST', '/internal/v1/session-end', { sessionId9id }),
    // OTP xác minh số điện thoại cho khách (app phải nằm trong INTERNAL_OTP_APPS của 9id). ip = IP khách. Ném NineIdError (429 otp_too_soon/otp_limit, 400 otp_invalid...).
    otpSend: (phone, ip) => call('POST', '/internal/v1/otp/send', { phone, ip }),
    otpVerify: (phone, code, ip) => call('POST', '/internal/v1/otp/verify', { phone, code, ip }),
    userFamilies: (userId, token) => call('GET', `/internal/v1/users/${encodeURIComponent(userId)}/families`, undefined, token),
    members: (familyId, asUserId, token) => call('GET', `/internal/v1/families/${encodeURIComponent(familyId)}/members?as=${encodeURIComponent(asUserId)}`, undefined, token),
    children: (familyId, asUserId, token) => call('GET', `/internal/v1/families/${encodeURIComponent(familyId)}/children?as=${encodeURIComponent(asUserId)}`, undefined, token),
  };
}
