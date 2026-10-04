// Kiểm tra ảnh tải lên bằng byte thật (magic bytes) và đọc kích thước từ tiêu đề. Không tin Content-Type, không tin tên tệp.
// Chỉ nhận JPEG, PNG, WebP. Không nhận SVG/GIF (SVG chạy được script, GIF động nặng).
import { ApiError } from './errors.js';
import { config } from './config.js';

const bad = (msg = 'Tệp không phải ảnh JPEG, PNG hoặc WebP hợp lệ') => new ApiError(400, 'bad_image', msg);

function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) throw bad('Ảnh JPEG bị cắt dở, hãy chọn lại');
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw bad();
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; } // byte đệm
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) break; // hết tiêu đề mà chưa thấy SOF
    const len = b.readUInt16BE(i + 2);
    if (len < 2) throw bad();
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (i + 9 > b.length) throw bad();
      return { mime: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw bad();
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
function png(b) {
  if (b.length < 33 || !b.subarray(0, 8).equals(PNG_SIG)) return null;
  if (b.toString('latin1', 12, 16) !== 'IHDR' || b.readUInt32BE(8) !== 13) throw bad();
  if (!b.subarray(b.length - 12).equals(PNG_END)) throw bad('Ảnh PNG bị cắt dở, hãy chọn lại');
  return { mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function webp(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  if (b.readUInt32LE(4) + 8 !== b.length) throw bad('Ảnh WebP bị cắt dở, hãy chọn lại');
  const t = b.toString('latin1', 12, 16);
  if (t === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw bad();
    return { mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (t === 'VP8L') {
    if (b[20] !== 0x2f) throw bad();
    const v = b.readUInt32LE(21);
    return { mime: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
  }
  if (t === 'VP8X') return { mime: 'image/webp', width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
  throw bad();
}

// Trả { mime, width, height } hoặc ném ApiError(400)
export function inspectImage(buf, { maxBytes } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw bad('Chưa có ảnh');
  if (maxBytes && buf.length > maxBytes) throw new ApiError(413, 'too_large', 'Ảnh quá lớn, hãy chọn ảnh nhỏ hơn');
  const info = jpeg(buf) || png(buf) || webp(buf);
  if (!info) throw bad();
  if (!(info.width >= 1 && info.height >= 1)) throw bad();
  if (info.width > config.maxPhotoSide || info.height > config.maxPhotoSide || info.width * info.height > config.maxPhotoPixels) {
    throw new ApiError(400, 'bad_image', 'Kích thước ảnh quá lớn');
  }
  return info;
}
