// Ghi tệp ZIP tối giản, tự viết (docx, xlsx và gói ảnh JPG đều là ZIP). Chạy trong trình duyệt và Node.
// Mặc định lưu không nén (STORE) cho dữ liệu đã nén như JPEG; văn bản XML được nén DEFLATE nếu môi trường có CompressionStream.

const te = new TextEncoder();

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Nén DEFLATE thô; trả về null nếu môi trường không hỗ trợ. */
export async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(bytes); w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) { return null; }
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * files: [{ name: 'a/b.xml', data: Uint8Array | string, store?: boolean }]
 * Tên tệp ghi UTF-8 (cờ bit 11), nên tên tiếng Việt trong gói ảnh vẫn đúng.
 * Trả về Uint8Array.
 */
export async function buildZip(files, { compress = true, date = new Date() } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, date: ddate } = dosDateTime(date);
  const push = (u8) => { parts.push(u8); offset += u8.length; };
  for (const f of files) {
    const nameB = te.encode(f.name);
    const raw = typeof f.data === 'string' ? te.encode(f.data) : f.data;
    const crc = crc32(raw);
    let method = 0, body = raw;
    if (compress && !f.store && raw.length > 64) {
      const z = await deflateRaw(raw);
      if (z && z.length < raw.length) { method = 8; body = z; }
    }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, method, true); lh.setUint16(10, time, true); lh.setUint16(12, ddate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    const localOffset = offset;
    push(new Uint8Array(lh.buffer)); push(nameB); push(body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, method, true); ch.setUint16(12, time, true); ch.setUint16(14, ddate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint32(42, localOffset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
  }
  const cdStart = offset;
  for (const c of central) push(c);
  const cdSize = offset - cdStart;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, cdStart, true);
  push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset);
  let p = 0;
  for (const u of parts) { out.set(u, p); p += u.length; }
  return out;
}

/** Đọc ZIP (STORE/DEFLATE) — dùng để kiểm thử và để mở lại tệp do chính app tạo. Cần DecompressionStream cho DEFLATE. */
export async function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Không phải tệp ZIP');
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const td = new TextDecoder();
  const out = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnl + lel;
    const body = bytes.subarray(start, start + csize);
    let data;
    if (method === 0) data = body.slice();
    else if (method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter(); w.write(body); w.close();
      data = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    } else throw new Error('Phương thức nén không hỗ trợ: ' + method);
    if (data.length !== usize) throw new Error('Sai kích thước: ' + name);
    out.push({ name, data });
    p += 46 + nl + el + cl;
  }
  return out;
}
