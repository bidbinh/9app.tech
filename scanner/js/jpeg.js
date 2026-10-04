// Ghi mật độ ảnh (DPI) vào JPEG bằng đoạn JFIF APP0, để tiệm in/Word hiểu đúng kích thước vật lý.

const isJfif = (b) => b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46;

/** Trả về bản sao JPEG có JFIF units=1 (dpi) và density X/Y = dpi. */
export function setJfifDpi(bytes, dpi = 300) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Không phải JPEG');
  const hi = (dpi >> 8) & 255, lo = dpi & 255;
  if (isJfif(bytes)) {
    const out = bytes.slice();
    out[13] = 1; out[14] = hi; out[15] = lo; out[16] = hi; out[17] = lo;
    return out;
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, hi, lo, hi, lo, 0, 0]);
  const out = new Uint8Array(bytes.length + app0.length);
  out.set(bytes.subarray(0, 2), 0); out.set(app0, 2); out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}

/** Đọc density từ JFIF: {units, x, y} hoặc null. */
export function readJfifDensity(bytes) {
  if (!isJfif(bytes)) return null;
  return { units: bytes[13], x: (bytes[14] << 8) | bytes[15], y: (bytes[16] << 8) | bytes[17] };
}
