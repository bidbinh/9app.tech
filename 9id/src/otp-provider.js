// Cổng gửi OTP: giao diện thay được `send(phone, code)`. phone là E.164 (+84...).
// Không bao giờ ghi mã OTP hay số điện thoại vào log (trừ provider "console" khi phát triển, tự chịu trách nhiệm).
import { config } from './config.js';

// ---- mock: cho test, giữ tin đã "gửi" trong bộ nhớ ----
export const sent = [];
function record(phone, code) {
  sent.push({ phone, code });
  if (sent.length > 500) sent.splice(0, sent.length - 500); // không phình mãi khi chạy lâu
}
export function lastOtp(phoneE164) {
  for (let i = sent.length - 1; i >= 0; i--) if (sent[i].phone === phoneE164) return sent[i].code;
  return null;
}
export function resetSent() { sent.length = 0; }
export let failNext = 0;
export function setFailNext(n) { failNext = n; }

export const mockSend = async (phone, code) => {
  if (failNext > 0) { failNext -= 1; throw new Error('mock: cố ý lỗi'); }
  record(phone, code);
};

// ---- console: chỉ khi phát triển ----
const consoleProvider = async (phone, code) => {
  if (config.production) throw new Error('provider console không dùng ở production');
  console.log(`[otp] ${phone} -> ${code}`);
  record(phone, code);
};

// ---- eSMS: Zalo ZNS (mẫu đã duyệt) rồi SMS brandname, như cách 9Ship/9Sport gửi OTP ----
const hasZalo = () => Boolean(config.esmsApiKey && config.esmsSecret && config.esmsZaloOa && config.esmsZaloTemp);
const hasSms = () => Boolean(config.esmsApiKey && config.esmsSecret && config.esmsBrandname);

async function esmsPost(path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.esmsTimeoutMs);
  try {
    const res = await fetch(config.esmsBase + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error('eSMS HTTP ' + res.status);
    const j = await res.json().catch(() => ({}));
    if (String(j.CodeResult) !== '100') throw new Error('eSMS mã ' + j.CodeResult);
  } finally { clearTimeout(timer); }
}
// eSMS nhận số dạng 0xxxxxxxxx
const localPhone = (e164) => '0' + e164.slice(3);
const fill = (t, code) => String(t).split('{ma}').join(code).split('{phut}').join(String(Math.round(config.otpTtlSec / 60)));

const channels = {
  async zalo(phone, code) {
    if (!hasZalo()) throw new Error('chưa cấu hình Zalo qua eSMS');
    const tempData = {};
    for (const [k, v] of Object.entries(JSON.parse(config.esmsZaloData))) tempData[k] = fill(v, code);
    const body = { ApiKey: config.esmsApiKey, SecretKey: config.esmsSecret, OAID: config.esmsZaloOa, TempID: config.esmsZaloTemp, Phone: localPhone(phone), TempData: tempData, SendingMode: '1', campaignid: 'OTP 9id' };
    if (config.esmsSandbox) body.Sandbox = '1';
    await esmsPost('/MainService.svc/json/SendZaloMessage_V6/', body);
  },
  async sms(phone, code) {
    if (!hasSms()) throw new Error('chưa cấu hình SMS brandname');
    const body = { ApiKey: config.esmsApiKey, SecretKey: config.esmsSecret, Brandname: config.esmsBrandname, Phone: localPhone(phone), Content: fill(config.esmsSmsTemplate, code), SmsType: '2', IsUnicode: '0' };
    if (config.esmsSandbox) body.Sandbox = '1';
    await esmsPost('/MainService.svc/json/SendMultipleMessage_V4_post_json/', body);
  },
};
const esms = async (phone, code) => {
  let last = null;
  for (const ch of config.esmsChannels) {
    if (!channels[ch]) continue;
    try { await channels[ch](phone, code); return; } catch (e) { last = e; console.error('[otp] kênh', ch, 'lỗi:', e.message); }
  }
  throw last || new Error('không có kênh OTP nào được cấu hình');
};

const providers = { mock: mockSend, console: consoleProvider, esms };
export function getProvider() {
  const p = providers[config.otpProvider];
  if (!p) throw new Error(`OTP_PROVIDER không hợp lệ: ${config.otpProvider}`);
  return p;
}
