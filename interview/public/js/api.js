// Gọi máy chủ 9interview. Máy chủ không lưu nội dung. Khi AI tắt, mọi hàm báo rõ để giao diện ẩn gọn.
import { sessionId } from './store.js';

const TIMEOUT_MS = 70_000; // lớn hơn tổng thời gian tối đa phía máy chủ (60 giây)

let cfgPromise = null;
export function getConfig() {
  if (!cfgPromise) {
    cfgPromise = fetch('api/config', { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined })
      .then((r) => (r.ok ? r.json() : { ai: false }))
      .catch(() => ({ ai: false, offline: true }));
  }
  return cfgPromise;
}

async function post(path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': sessionId() }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'AI trả lời quá lâu. Bạn thử lại sau nhé.' : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  } finally { clearTimeout(timer); }
  let j = null;
  try { j = await r.json(); } catch { /* không phải JSON */ }
  if (!r.ok) {
    const e = new Error((j && j.message) || 'Có lỗi xảy ra. Bạn thử lại sau nhé.');
    e.code = j && j.error; e.status = r.status;
    throw e;
  }
  return j;
}

export const requestFeedback = (payload) => post('api/feedback', payload).then((j) => j.feedback);
export const requestRewrite = (payload) => post('api/rewrite', payload).then((j) => j.rewrite);
