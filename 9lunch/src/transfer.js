// VietQR (NAPAS 247, EMVCo) — dùng cùng cách với 9ship/src/topup.js
import QRCode from 'qrcode';
import { stripAccents } from './util.js';

export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;

export function vietQrPayload({ bin, account, amount, content }) {
  const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', account)) + tlv('02', 'QRIBFTTA');
  const body = tlv('00', '01') + tlv('01', '12') + tlv('38', merchant) + tlv('53', '704')
    + (amount ? tlv('54', String(amount)) : '') + tlv('58', 'VN') + tlv('62', tlv('08', content)) + '6304';
  return body + crc16(body);
}

export const MAX_CONTENT = 25;

// Nội dung chuyển khoản: prefix ("9L" cho bữa ăn, "9N" cho bù trừ) + mã + số thứ tự (2 chữ số).
// Không dùng tên người (tên đổi được) nên QR đã phát hành luôn hợp lệ. Không dấu, chữ hoa/số, tối đa 25 ký tự.
export function transferContent({ mealCode, seq, prefix = '9L' }) {
  const clean = stripAccents(String(mealCode)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${prefix}${clean}${String(seq).padStart(2, '0')}`.slice(0, MAX_CONTENT);
}

export const qrSvg = (payload) => QRCode.toString(payload, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
export const qrPng = (payload) => QRCode.toBuffer(payload, { type: 'png', margin: 2, width: 480, errorCorrectionLevel: 'M' });
