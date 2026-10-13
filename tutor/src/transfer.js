// VietQR (NAPAS 247, EMVCo): cùng cách với 9lunch/9ship (payload + CRC16, ảnh QR bằng thư viện qrcode)
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
  const body = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', merchant) + tlv('53', '704')
    + (amount ? tlv('54', String(amount)) : '') + tlv('58', 'VN') + (content ? tlv('62', tlv('08', content)) : '') + '6304';
  return body + crc16(body);
}

export const MAX_CONTENT = 25;

// Nội dung chuyển khoản học phí: '9T' + mã học sinh. Không chứa tên (tên đổi được và không lộ tên trẻ em trong sao kê).
export function transferContent(studentCode) {
  const clean = stripAccents(String(studentCode)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ('9T' + clean).slice(0, MAX_CONTENT);
}

export const qrSvg = (payload) => QRCode.toString(payload, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
export const qrPng = (payload) => QRCode.toBuffer(payload, { type: 'png', margin: 2, width: 480, errorCorrectionLevel: 'M' });
