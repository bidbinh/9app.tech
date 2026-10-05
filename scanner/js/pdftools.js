// Thao tác PDF trên máy người dùng bằng pdf-lib (MIT, vendor/pdflib): gộp, tách, xóa, sắp xếp, xoay, nén ảnh bên trong, đóng dấu, đặt mật khẩu.
// pdf-lib nạp lười khi dùng lần đầu. Không có yêu cầu mạng nào ngoài tệp của chính ứng dụng.
import { encryptPdf } from './pdfcrypt.js';

let libPromise = null;
export function getPdfLib() {
  if (globalThis.PDFLib) return Promise.resolve(globalThis.PDFLib);
  if (typeof document === 'undefined') return Promise.reject(new Error('Thiếu pdf-lib'));
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/pdflib/pdf-lib.min.js', import.meta.url).href;
      s.onload = () => resolve(globalThis.PDFLib);
      s.onerror = () => { libPromise = null; reject(new Error('Không tải được bộ xử lý PDF. Hãy kết nối mạng ở lần dùng đầu tiên.')); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

const friendly = (e, name) => {
  const m = (e && e.message) || '';
  if (/encrypt/i.test(m)) return new Error(`${name ? '“' + name + '” ' : 'Tệp '}có mật khẩu nên chưa xử lý được. Hãy mở khóa tệp trước.`);
  if (/Không tải được/.test(m)) return e;
  return new Error(`Không đọc được ${name ? '“' + name + '”' : 'tệp PDF'}. Tệp có thể bị hỏng hoặc không phải PDF.`);
};

async function load(PDFLib, bytes, name) {
  try { return await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); } catch (e) { throw friendly(e, name); }
}

export async function pageCount(bytes, name) {
  const L = await getPdfLib();
  return (await load(L, bytes, name)).getPageCount();
}

/** Gộp nhiều PDF theo thứ tự. items: [{name, bytes}] */
export async function mergePdfs(items) {
  const L = await getPdfLib();
  const out = await L.PDFDocument.create();
  for (const it of items) {
    const src = await load(L, it.bytes, it.name);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  out.setProducer('9scanner'); out.setCreator('9scanner');
  return out.save({ useObjectStreams: true });
}

/** Tạo PDF mới từ một PDF nguồn: plan = [{index (từ 0), rotate (0/90/180/270, cộng thêm)}] theo thứ tự mong muốn. */
export async function arrangePdf(bytes, plan, name) {
  if (!plan.length) throw new Error('Chưa chọn trang nào.');
  const L = await getPdfLib();
  const src = await load(L, bytes, name);
  const out = await L.PDFDocument.create();
  const pages = await out.copyPages(src, plan.map((p) => p.index));
  pages.forEach((pg, i) => {
    const add = ((plan[i].rotate || 0) % 360 + 360) % 360;
    if (add) pg.setRotation(L.degrees((pg.getRotation().angle + add) % 360));
    out.addPage(pg);
  });
  out.setProducer('9scanner'); out.setCreator('9scanner');
  return out.save({ useObjectStreams: true });
}

/** Cú pháp "1-3, 5, 8-" -> mảng chỉ số trang (từ 0), không trùng, giữ thứ tự nhập. Ném lỗi tiếng Việt nếu sai. */
export function parseRanges(text, total) {
  const out = [];
  const seen = new Set();
  const parts = String(text || '').split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) throw new Error('Hãy nhập số trang, ví dụ 1-3, 5.');
  for (const p of parts) {
    const m = /^(\d*)(?:-(\d*))?$/.exec(p);
    if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) throw new Error(`“${p}” không phải số trang hợp lệ.`);
    const hasDash = p.includes('-');
    const a = m[1] === '' ? 1 : parseInt(m[1], 10);
    const b = hasDash ? (m[2] === '' || m[2] === undefined ? total : parseInt(m[2], 10)) : a;
    if (a < 1 || b < 1 || a > total || b > total) throw new Error(`Trang “${p}” nằm ngoài tệp (tệp có ${total} trang).`);
    const step = a <= b ? 1 : -1;
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) { if (!seen.has(i)) { seen.add(i); out.push(i - 1); } }
  }
  return out;
}

/** Tách: groups = [[chỉ số...], ...] -> mảng bytes, mỗi nhóm là một tệp. */
export async function splitPdf(bytes, groups, name) {
  const res = [];
  for (const g of groups) res.push(await arrangePdf(bytes, g.map((index) => ({ index })), name));
  return res;
}

/**
 * Nén ảnh JPEG nhúng trong PDF (giữ nguyên chữ và hình vẽ). recode(bytes, {maxEdge, quality}) -> {bytes, width, height} | null
 * level: 'light' | 'medium' | 'strong'
 */
export const COMPRESS_LEVELS = {
  light: { maxEdge: 2400, quality: 0.78 },
  medium: { maxEdge: 1700, quality: 0.62 },
  strong: { maxEdge: 1200, quality: 0.45 },
};
export async function compressPdf(bytes, level, recode, { onProgress, name } = {}) {
  const L = await getPdfLib();
  const { PDFName, PDFRawStream, PDFDict, PDFNumber, PDFArray } = L;
  const doc = await load(L, bytes, name);
  const ctx = doc.context;
  const cfg = COMPRESS_LEVELS[level] || COMPRESS_LEVELS.medium;
  const nm = (s) => PDFName.of(s);
  const items = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(nm('Subtype')) === nm('Image'));
  let done = 0, replaced = 0, saved = 0;
  for (const [ref, obj] of items) {
    if (onProgress) onProgress({ i: done, n: items.length });
    done++;
    const d = obj.dict;
    const f = d.get(nm('Filter'));
    const isDct = f === nm('DCTDecode') || (f instanceof PDFArray && f.size() === 1 && f.get(0) === nm('DCTDecode'));
    if (!isDct) continue;
    if (d.get(nm('ImageMask')) || d.get(nm('Mask')) || d.get(nm('Decode')) || d.get(nm('SMaskInData'))) continue;
    const cs = d.get(nm('ColorSpace'));
    const okCs = cs === nm('DeviceRGB') || cs === nm('DeviceGray') || (cs instanceof PDFArray && cs.get(0) === nm('ICCBased'));
    if (!okCs) continue;
    const w = d.get(nm('Width')), h = d.get(nm('Height'));
    if (!(w instanceof PDFNumber) || !(h instanceof PDFNumber)) continue;
    if (Math.max(w.asNumber(), h.asNumber()) <= cfg.maxEdge * 0.7 && obj.contents.length < 50000) continue;
    let r = null;
    try { r = await recode(obj.contents, cfg); } catch (e) { r = null; }
    if (!r || r.bytes.length >= obj.contents.length * 0.92) continue;
    const nd = PDFDict.withContext(ctx);
    for (const [k, v] of d.entries()) nd.set(k, v);
    nd.set(nm('Width'), PDFNumber.of(r.width)); nd.set(nm('Height'), PDFNumber.of(r.height));
    nd.set(nm('ColorSpace'), nm('DeviceRGB')); nd.set(nm('BitsPerComponent'), PDFNumber.of(8)); nd.set(nm('Filter'), nm('DCTDecode'));
    nd.set(nm('Length'), PDFNumber.of(r.bytes.length));
    saved += obj.contents.length - r.bytes.length;
    ctx.assign(ref, PDFRawStream.of(nd, r.bytes));
    replaced++;
  }
  doc.setProducer('9scanner');
  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, images: items.length, replaced, saved };
}

/**
 * Đóng dấu ảnh PNG (đã vẽ chữ trên canvas để có tiếng Việt) lên mọi trang (hoặc các chỉ số trong pages).
 * opts: { png: Uint8Array, aspect: w/h của ảnh, position: 'center'|'top'|'bottom', widthFrac (0..1 so với bề rộng trang), opacity, pages? }
 */
export async function stampPdf(bytes, opts, name) {
  const L = await getPdfLib();
  const doc = await load(L, bytes, name);
  const img = await doc.embedPng(opts.png);
  const sel = opts.pages ? new Set(opts.pages) : null;
  doc.getPages().forEach((pg, i) => {
    if (sel && !sel.has(i)) return;
    const { width, height } = pg.getSize();
    let w = width * (opts.widthFrac || 0.7), hh = w / opts.aspect;
    if (hh > height * 0.9) { hh = height * 0.9; w = hh * opts.aspect; }
    const x = (width - w) / 2;
    const y = opts.position === 'top' ? height - hh - 18 : opts.position === 'bottom' ? 18 : (height - hh) / 2;
    pg.drawImage(img, { x, y, width: w, height: hh, opacity: opts.opacity ?? 0.35 });
  });
  doc.setProducer('9scanner');
  return doc.save({ useObjectStreams: true });
}

/** Đặt mật khẩu mở tệp (AES-128). */
export async function protectPdf(bytes, password, name) {
  if (!/^[ -~]{1,32}$/.test(password || '')) throw new Error('Mật khẩu chỉ gồm chữ không dấu, số, ký hiệu (tối đa 32 ký tự) để mọi phần mềm đọc PDF đều mở được.');
  const L = await getPdfLib();
  try { return await encryptPdf(L, bytes, password); } catch (e) { throw /encrypted|đã có mật khẩu/i.test(e.message) ? new Error(`${name ? '“' + name + '” ' : 'Tệp '}đã có mật khẩu rồi.`) : e; }
}
