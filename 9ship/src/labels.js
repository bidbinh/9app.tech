import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from './config.js';

// ---- Code 128 (bộ B: ASCII 32..127) ----
const PATTERNS = ('212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,'
  + '122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,'
  + '212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,'
  + '113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,'
  + '431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,'
  + '241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,'
  + '131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232,2331112').split(',');
const START_B = 104;
const STOP = 106;

export function code128Widths(text) {
  const s = String(text);
  const codes = [START_B];
  let sum = START_B;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c > 126) throw new Error('ký tự không mã hóa được bằng Code128B');
    const v = c - 32;
    codes.push(v);
    sum += v * (i + 1);
  }
  codes.push(sum % 103);
  codes.push(STOP);
  return codes.map((c) => PATTERNS[c]).join('');
}

export function barcodeSvg(text, { height = 60, module = 2 } = {}) {
  const widths = code128Widths(text);
  let x = 10 * module; // vùng yên tĩnh
  let bars = '';
  let bar = true;
  for (const ch of widths) {
    const w = Number(ch) * module;
    if (bar) bars += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`;
    x += w;
    bar = !bar;
  }
  const total = x + 10 * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" class="bar"><g fill="#000">${bars}</g></svg>`;
}

// ---- ký link nhãn ----
const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signLabel(shipmentId, ttlSec = 3600, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSec;
  const body = `${shipmentId}.${exp}`;
  const sig = crypto.createHmac('sha256', config.signSecret).update(body).digest();
  return b64u(body) + '.' + b64u(sig);
}

export function verifyLabel(token, now = Date.now()) {
  const [b, s] = String(token || '').split('.');
  if (!b || !s) return null;
  let body;
  try { body = Buffer.from(b, 'base64url').toString('utf8'); } catch { return null; }
  const want = crypto.createHmac('sha256', config.signSecret).update(body).digest();
  let got;
  try { got = Buffer.from(s, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const [id, exp] = body.split('.');
  if (!id || Number(exp) < Math.floor(now / 1000)) return null;
  return id;
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GOODS = {
  general: 'Hàng thông thường', document: 'Tài liệu', clothes: 'Quần áo, giày dép', electronics: 'Đồ điện tử',
  food_dry: 'Thực phẩm khô', cosmetics: 'Mỹ phẩm', fragile: 'Hàng dễ vỡ',
};

function party(p) {
  return `<b>${esc(p.contact)}</b> · ${esc(p.phone)}<br>${esc(p.street)}${p.ward ? ', ' + esc(p.ward) : ''}, ${esc(p.provinceName || p.province)}`;
}

// Nhãn dán HTML khổ 100x150mm (hoặc A6). In trực tiếp hoặc lưu PDF từ trình duyệt.
export async function render(shipment, { size = '100x150', carrierName = '', pickupPoint = null } = {}) {
  const code = shipment.tracking_code || shipment.carrier_code;
  if (!code) throw new Error('đơn chưa có mã vận đơn');
  const qr = await QRCode.toString(code, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  const page = size === 'a6' ? '105mm 148mm' : '100mm 150mm';
  const goods = GOODS[shipment.goods_type] || shipment.goods_type;
  const created = new Date(shipment.created_at).toLocaleDateString('vi-VN');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nhãn ${esc(code)}</title>
<style>
@page { size: ${page}; margin: 0; }
*{box-sizing:border-box} body{margin:0;font:12px/1.35 Arial,Helvetica,sans-serif;color:#000;background:#eee}
.label{width:${page.split(' ')[0]};min-height:${page.split(' ')[1]};margin:0 auto;background:#fff;padding:4mm;border:1px solid #000}
.row{display:flex;gap:3mm;align-items:center;justify-content:space-between}
.carrier{font-size:16px;font-weight:700}
.code{font:700 18px/1.2 "Courier New",monospace;text-align:center;letter-spacing:1px;margin:1mm 0}
.bar{display:block;width:100%;height:16mm}
.qr{width:22mm;height:22mm}.qr svg{width:100%;height:100%}
.box{border:1px solid #000;padding:2mm;margin-top:2mm}.box h4{margin:0 0 1mm;font-size:10px;text-transform:uppercase}
.big{font-size:13px}.meta{display:flex;gap:4mm;font-size:11px;margin-top:2mm;flex-wrap:wrap}
.note{font-size:10px;margin-top:2mm}
.tools{max-width:420px;margin:8px auto;text-align:center}.tools button{padding:10px 18px;font-size:15px}
@media print{body{background:#fff}.label{border:0}.tools{display:none}}
</style></head><body>
<div class="tools"><button id="print">In nhãn</button></div>
<div class="label">
  <div class="row"><div class="carrier">${esc(carrierName || shipment.carrier)}</div><div class="qr">${qr}</div></div>
  ${barcodeSvg(code)}
  <div class="code">${esc(code)}</div>
  <div class="box big"><h4>Người nhận</h4>${party(shipment.receiver)}</div>
  <div class="box"><h4>Người gửi</h4>${party(shipment.sender)}</div>
  <div class="meta"><span>Khối lượng: <b>${(shipment.weight_g / 1000).toFixed(2)} kg</b></span><span>Hàng: <b>${esc(goods)}</b></span><span>Ngày: <b>${esc(created)}</b></span></div>
  ${pickupPoint ? `<div class="note">Điểm gửi: <b>${esc(pickupPoint.name)}</b> — ${esc(pickupPoint.address)}</div>` : ''}
  <div class="note">Mã đơn 9Ship: ${esc(String(shipment.id).slice(0, 8))} · Không gửi hàng cấm. Kiểm tra hàng trước khi nhận.</div>
</div>
<script src="${config.basePath}/label.js"></script>
</body></html>`;
}
