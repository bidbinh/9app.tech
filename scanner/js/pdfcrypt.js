// Đặt mật khẩu mở PDF: mã hóa chuẩn "Standard security handler" V4/R4, AES-128 (AESV2), tự viết MD5 + RC4,
// AES-CBC dùng WebCrypto của trình duyệt. Tương thích Acrobat, Chrome, Firefox, pdf.js.
// Làm việc trên đối tượng của pdf-lib (PDFLib truyền vào), mã hóa chuỗi và luồng trước khi lưu.

/* ---------- MD5 ---------- */
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

export function md5(msg) {
  const len = msg.length;
  const padLen = (((len + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(msg); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 8, (len << 3) >>> 0, true);
  dv.setUint32(padLen - 4, Math.floor(len / 536870912), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; } else { F = C ^ (B | ~D); g = (7 * i) & 15; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const od = new DataView(out.buffer);
  od.setUint32(0, a0, true); od.setUint32(4, b0, true); od.setUint32(8, c0, true); od.setUint32(12, d0, true);
  return out;
}

export function rc4(key, data) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
  const out = new Uint8Array(data.length);
  let a = 0, b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 255; b = (b + s[a]) & 255; [s[a], s[b]] = [s[b], s[a]];
    out[k] = data[k] ^ s[(s[a] + s[b]) & 255];
  }
  return out;
}

const PAD = Uint8Array.from([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a]);
const cat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0); const o = new Uint8Array(n); let p = 0; for (const x of arrs) { o.set(x, p); p += x.length; } return o; };
const padPw = (pw) => { const b = new TextEncoder().encode(pw).slice(0, 32); return cat(b, PAD.subarray(0, 32 - b.length)); };
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

/** Tính O, U và khóa mã hóa (Algorithm 2, 3, 5 của ISO 32000-1). */
export function deriveKeys(userPw, ownerPw, id0, P) {
  const u = padPw(userPw), o = padPw(ownerPw || userPw);
  let h = md5(o);
  for (let i = 0; i < 50; i++) h = md5(h);
  const okey = h.subarray(0, 16);
  let O = rc4(okey, u);
  for (let i = 1; i <= 19; i++) O = rc4(okey.map((b) => b ^ i), O);
  const p = new Uint8Array(4); new DataView(p.buffer).setInt32(0, P, true);
  let k = md5(cat(u, O, p, id0));
  for (let i = 0; i < 50; i++) k = md5(k.subarray(0, 16));
  const key = k.subarray(0, 16).slice();
  let U = rc4(key, md5(cat(PAD, id0)));
  for (let i = 1; i <= 19; i++) U = rc4(key.map((b) => b ^ i), U);
  const U32 = new Uint8Array(32); U32.set(U);
  return { O, U: U32, key };
}

async function aesCbc(rawKey, iv, data) {
  const subtle = (globalThis.crypto || {}).subtle;
  if (!subtle) throw new Error('Trình duyệt này chưa hỗ trợ mã hóa (cần kết nối https).');
  const k = await subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['encrypt']);
  return new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, k, data));
}

function objKey(key, num, gen) {
  const ext = new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255, 0x73, 0x41, 0x6c, 0x54]);
  return md5(cat(key, ext)).subarray(0, Math.min(key.length + 5, 16));
}

/**
 * Mã hóa PDF: nhận bytes, trả về bytes PDF đã đặt mật khẩu mở. ownerPw mặc định ngẫu nhiên khác userPw
 * (người dùng không biết mật khẩu chủ thì vẫn mở được bằng mật khẩu mở; in/sao chép vẫn cho phép).
 */
export async function encryptPdf(PDFLib, bytes, userPw, { ownerPw } = {}) {
  if (!userPw) throw new Error('Hãy nhập mật khẩu.');
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFRawStream, PDFRef } = PDFLib;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.isEncrypted) throw new Error('Tệp này đã có mật khẩu.');
  const ctx = doc.context;
  const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
  const id0 = rnd(16);
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(hex(id0)), PDFHexString.of(hex(id0))]);
  const P = -4;
  const { O, U, key } = deriveKeys(userPw, ownerPw || hex(rnd(12)), id0, P);

  const tasks = [];
  const encBytes = async (num, gen, data) => {
    const iv = rnd(16);
    const body = await aesCbc(objKey(key, num, gen), iv, data);
    return cat(iv, body);
  };
  const walk = (node, num, gen) => {
    if (node instanceof PDFString || node instanceof PDFHexString) {
      return { str: node };
    }
    if (node instanceof PDFDict) {
      for (const [k, v] of node.entries()) {
        const r = walk(v, num, gen);
        if (r && r.str) tasks.push((async () => { node.set(k, PDFHexString.of(hex(await encBytes(num, gen, r.str.asBytes())))); })());
      }
    } else if (node instanceof PDFArray) {
      for (let i = 0; i < node.size(); i++) {
        const v = node.get(i);
        const r = walk(v, num, gen);
        if (r && r.str) tasks.push((async () => { node.set(i, PDFHexString.of(hex(await encBytes(num, gen, r.str.asBytes())))); })());
      }
    }
    return null;
  };
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const num = ref.objectNumber, gen = ref.generationNumber;
    if (obj instanceof PDFRawStream) {
      walk(obj.dict, num, gen);
      tasks.push((async () => { ctx.assign(ref, PDFRawStream.of(obj.dict, await encBytes(num, gen, obj.contents))); })());
    } else walk(obj, num, gen);
  }
  await Promise.all(tasks);
  const enc = ctx.obj({
    Filter: 'Standard', V: 4, R: 4, Length: 128,
    CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV2', Length: 16 } },
    StmF: 'StdCF', StrF: 'StdCF',
    O: PDFHexString.of(hex(O)), U: PDFHexString.of(hex(U)), P,
  });
  ctx.trailerInfo.Encrypt = ctx.register(enc);
  void PDFName; void PDFRef;
  return doc.save({ useObjectStreams: false });
}
