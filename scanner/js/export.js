// Xuất tài liệu: PDF (A4 / giữ tỉ lệ, chất lượng hoặc giới hạn dung lượng, tùy chọn lớp chữ OCR), ảnh JPG, văn bản.
//
// Bộ nhớ: với mức Cao/Chuẩn/Nhỏ, mỗi trang được dựng, mã hóa JPEG rồi canvas bị bỏ ngay (chỉ giữ byte JPEG),
// nên bộ nhớ không tăng theo số trang. Chế độ "giới hạn dung lượng" cần thử nhiều mức nên giữ canvas của các trang
// ở cạnh dài giới hạn bởi memoryEdge (tổng ~36 triệu điểm ảnh).
// Hủy: mọi hàm nhận `signal` (AbortSignal); lượt cũ dừng ở ranh giới trang kế tiếp.
// Dựng lại: kết quả mã hóa từng trang được nhớ theo (nội dung trang, cạnh dài, chất lượng) nên đổi khổ giấy/bật OCR không dựng lại.
import { buildPdf, pageBox } from './pdf.js';
import { fitToBudget, budgetTarget, QUALITY_PRESETS, MIN_QUALITY } from './compress.js';
import { renderPage, canvasToBlob, scaleCanvas, makeCanvas, pageOrientation, rotateCanvas } from './render.js';
import { rotateSigns, quadSize, toPixels } from './geom.js';
import { recognizeCanvas, joinPages } from './ocr.js';
import { safeName, filterWords } from './textutil.js';
import { removeRuling } from './ocrprep.js';
import { layoutPage, tablesForSheet } from './layout.js';
import { buildDocx, DOCX_MIME } from './docx.js';
import { buildXlsx, XLSX_MIME } from './xlsx.js';

export { safeName };

const OCR_EDGE = 2000;
const MEMORY_PIXELS = 36e6;
const CACHE_BYTES = 40e6;
export const stats = { renders: 0, cacheHits: 0, ocrRuns: 0 };

export const geomKey = (p) => JSON.stringify([p.corners.map((c) => [Math.round(c.x * 1e4), Math.round(c.y * 1e4)]), p.rot || 0, p.clean || 'auto', p.dewarp || 'auto']);
const pageKey = (p) => `${p.id}|${p.src && p.src.size}|${geomKey(p)}|${p.filter}|${JSON.stringify(p.signs || [])}`;

function checkAbort(signal) {
  if (signal && signal.aborted) throw Object.assign(new Error('Đã hủy'), { name: 'AbortError' });
}

/* ---------- bộ nhớ đệm ---------- */
const enc = new Map(); // key -> {bytes,w,h}
let encBytes = 0;
let limitCache = null; // {key, canvases}
export function clearExportCache() { enc.clear(); encBytes = 0; limitCache = null; }
function encPut(key, v) {
  enc.set(key, v); encBytes += v.bytes.length;
  while (encBytes > CACHE_BYTES && enc.size > 1) { const k = enc.keys().next().value; encBytes -= enc.get(k).bytes.length; enc.delete(k); }
}

function prepForOcr(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rules = removeRuling(id);
  ctx.putImageData(id, 0, 0);
  return rules;
}
function flip180(canvas) {
  const c = makeCanvas(canvas.width, canvas.height);
  const x = c.getContext('2d');
  x.translate(c.width, c.height); x.rotate(Math.PI); x.drawImage(canvas, 0, 0);
  return c;
}
const OCR_FLIP_BELOW = 62; // độ tin cậy dưới mức này thì thử lật 180 độ (trang bị úp ngược đọc ra rác)

/**
 * Đọc chữ từ canvas: xóa đường kẻ bảng rồi OCR; nếu độ tin cậy thấp thì thử lật 180 độ và lấy bản tốt hơn.
 * Trả về { r (kết quả OCR), rules, flipped }.
 */
export async function ocrCanvasSmart(canvas, onProgress, signal) {
  let rules = prepForOcr(canvas);
  stats.ocrRuns++;
  let r = await recognizeCanvas(canvas, onProgress);
  let flipped = false;
  if (r.confidence < OCR_FLIP_BELOW) {
    checkAbort(signal);
    const alt = flip180(canvas);
    stats.ocrRuns++;
    const r2 = await recognizeCanvas(alt, onProgress);
    if (r2.confidence > r.confidence + 8) { r = r2; rules = flipRules(rules, canvas.width, canvas.height); flipped = true; }
  }
  return { r, rules, flipped };
}

/**
 * Đọc chữ của một trang (có nhớ kết quả cho đến khi đổi góc/xoay). Chạy trên ảnh "Màu tự động" đã xóa đường kẻ bảng.
 * Nếu trang bị úp ngược (độ tin cậy thấp, lật 180 độ đọc tốt hơn rõ rệt) thì xoay trang luôn (page.rot) để chữ đúng chiều.
 */
export async function ocrPage(page, onProgress, signal) {
  const key = geomKey(page) + '|v2';
  if (page.ocr && page.ocr.key === key) return page.ocr;
  checkAbort(signal);
  const canvas = await renderPage(page, { srcEdge: 2600, maxEdge: OCR_EDGE, filter: 'auto', noSigns: true });
  checkAbort(signal);
  const { r, rules, flipped } = await ocrCanvasSmart(canvas, onProgress, signal);
  if (flipped) {
    page.rot = ((page.rot || 0) + 180) % 360;
    page.signs = rotateSigns(page.signs, 180, 1);
    page.thumb = null;
    page.autoFlipped = true;
  }
  page.ocr = { key: geomKey(page) + '|v2', text: r.text, words: r.words, width: r.width, height: r.height, confidence: r.confidence, rules };
  return page.ocr;
}
function flipRules(r, W, H) {
  return {
    hLines: r.hLines.map((l) => ({ y: H - l.y, x0: W - l.x1, x1: W - l.x0 })),
    vLines: r.vLines.map((l) => ({ x: W - l.x, y0: H - l.y1, y1: H - l.y0 })),
  };
}

export async function ocrAll(pages, onProgress, signal) {
  const texts = [];
  for (let i = 0; i < pages.length; i++) {
    const o = await ocrPage(pages[i], (p) => onProgress && onProgress({ ...p, page: i, pages: pages.length }), signal);
    texts.push(o.text);
  }
  return { texts, text: joinPages(texts) };
}

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

/** Dựng + mã hóa một trang, có nhớ; canvas được giải phóng ngay. */
async function encodedPage(page, edge, q, sigImages, signal) {
  const key = `${pageKey(page)}|${edge}|${q}`;
  const hit = enc.get(key);
  if (hit) { stats.cacheHits++; enc.delete(key); enc.set(key, hit); return hit; }
  checkAbort(signal);
  stats.renders++;
  const canvas = await renderPage(page, { srcEdge: 2600, maxEdge: edge, sigImages });
  checkAbort(signal);
  const bytes = await bytesOf(await canvasToBlob(canvas, 'image/jpeg', q));
  const v = { bytes, w: canvas.width, h: canvas.height };
  encPut(key, v);
  canvas.width = canvas.height = 1; // trả bộ nhớ canvas sớm
  return v;
}

async function limitCanvases(pages, edge, sigImages, onProgress, signal) {
  const key = pages.map(pageKey).join('#') + '@' + edge;
  if (limitCache && limitCache.key === key) { stats.cacheHits++; return limitCache.canvases; }
  limitCache = null;
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    checkAbort(signal);
    if (onProgress) onProgress({ stage: 'render', i, n: pages.length });
    stats.renders++;
    out.push(await renderPage(pages[i], { srcEdge: 2600, maxEdge: edge, sigImages }));
  }
  limitCache = { key, canvases: out };
  return out;
}

function scaleWords(words, fromW, toW) {
  const k = toW / fromW;
  return filterWords(words, 40).map((w) => ({ text: w.text, x0: w.x0 * k, y0: w.y0 * k, x1: w.x1 * k, y1: w.y1 * k }));
}

/** Tìm (scale, quality) để tổng dung lượng JPEG của các canvas + overhead nằm trong mục tiêu. */
async function fitCanvases(canvases, target, overhead, onProgress, signal) {
  let cacheScale = null, cache = null;
  const getScaled = (s) => {
    if (cacheScale !== s) { cache = canvases.map((c) => scaleCanvas(c, s)); cacheScale = s; }
    return cache;
  };
  const measure = async (s, q) => {
    checkAbort(signal);
    const cs = getScaled(s);
    let sum = overhead;
    for (const c of cs) sum += (await canvasToBlob(c, 'image/jpeg', q)).size;
    return sum;
  };
  const fit = await fitToBudget(measure, target, { onProgress: (p) => onProgress && onProgress({ stage: 'fit', tries: p.tries }) });
  return { fit, getScaled };
}

export function memoryEdge(n, maxEdge = QUALITY_PRESETS.high.maxEdge) {
  const per = MEMORY_PIXELS / Math.max(1, n);
  return Math.max(900, Math.min(maxEdge, Math.round(Math.sqrt(per / 0.7))));
}

/**
 * Xuất PDF. opts: { paper, quality, limitBytes, withText, title, sigImages, onProgress, signal }
 * Trả về { blob, size, info: {scale, quality, ok, limit}, bytes }
 */
export async function exportPdf(pages, opts) {
  const { paper = 'a4', quality = 'normal', limitBytes, withText, title, sigImages, onProgress, signal } = opts;
  if (!pages.length) throw new Error('Chưa có trang nào');
  const ocrs = [];
  if (withText) {
    for (let i = 0; i < pages.length; i++) {
      checkAbort(signal);
      if (onProgress) onProgress({ stage: 'ocr', i, n: pages.length });
      ocrs.push(await ocrPage(pages[i], (p) => onProgress && onProgress({ stage: 'ocr', i, n: pages.length, sub: p }), signal));
    }
  }
  const limited = quality === 'limit' && limitBytes;
  const assemble = (items) => buildPdf(items.map((it, i) => {
    const box = pageBox(it.w, it.h, paper, 0);
    return { jpeg: it.bytes, imgW: it.w, imgH: it.h, ...box, words: withText ? scaleWords(ocrs[i].words, ocrs[i].width, it.w) : undefined };
  }), { title, lang: 'vi' });

  let info, pdf;
  if (!limited) {
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.normal;
    const items = [];
    for (let i = 0; i < pages.length; i++) {
      checkAbort(signal);
      if (onProgress) onProgress({ stage: 'render', i, n: pages.length });
      items.push(await encodedPage(pages[i], preset.maxEdge, preset.quality, sigImages, signal));
    }
    pdf = assemble(items);
    info = { scale: 1, quality: preset.quality, ok: true, limit: null };
  } else {
    const edge = memoryEdge(pages.length);
    const canvases = await limitCanvases(pages, edge, sigImages, onProgress, signal);
    const target = budgetTarget(limitBytes);
    const dummy = canvases.map((c) => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: c.width, h: c.height }));
    const overhead = assemble(dummy).length;
    if (onProgress) onProgress({ stage: 'fit', tries: 0 });
    const { fit, getScaled } = await fitCanvases(canvases, target, overhead, onProgress, signal);
    const used = getScaled(fit.scale);
    let q = fit.quality;
    for (let attempt = 0; attempt < 8; attempt++) {
      const items = [];
      for (let i = 0; i < used.length; i++) {
        checkAbort(signal);
        if (onProgress) onProgress({ stage: 'encode', i, n: used.length });
        items.push({ bytes: await bytesOf(await canvasToBlob(used[i], 'image/jpeg', q)), w: used[i].width, h: used[i].height });
      }
      pdf = assemble(items);
      if (pdf.length <= target || q <= MIN_QUALITY + 1e-9) break;
      q = Math.max(MIN_QUALITY, q - 0.05);
    }
    info = { scale: fit.scale, quality: q, ok: pdf.length <= limitBytes, limit: limitBytes };
  }
  return { blob: new Blob([pdf], { type: 'application/pdf' }), size: pdf.length, info, bytes: pdf };
}

/** Xuất ảnh JPG từng trang. Trả về { files: [{name, blob}], size, info }. */
export async function exportJpgs(pages, opts) {
  const { quality = 'normal', limitBytes, baseName = 'tai-lieu', sigImages, onProgress, signal } = opts;
  const limited = quality === 'limit' && limitBytes;
  const name = (i, n) => `${baseName}${n > 1 ? '-trang' + (i + 1) : ''}.jpg`;
  const files = [];
  let size = 0, info;
  if (!limited) {
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.normal;
    for (let i = 0; i < pages.length; i++) {
      if (onProgress) onProgress({ stage: 'render', i, n: pages.length });
      const e = await encodedPage(pages[i], preset.maxEdge, preset.quality, sigImages, signal);
      size += e.bytes.length;
      files.push({ name: name(i, pages.length), blob: new Blob([e.bytes], { type: 'image/jpeg' }) });
    }
    info = { scale: 1, quality: preset.quality, ok: true };
  } else {
    const canvases = await limitCanvases(pages, memoryEdge(pages.length), sigImages, onProgress, signal);
    const { fit, getScaled } = await fitCanvases(canvases, budgetTarget(limitBytes), 0, onProgress, signal);
    const use = getScaled(fit.scale);
    for (let i = 0; i < use.length; i++) {
      checkAbort(signal);
      const blob = await canvasToBlob(use[i], 'image/jpeg', fit.quality);
      size += blob.size;
      files.push({ name: name(i, use.length), blob });
    }
    info = { scale: fit.scale, quality: fit.quality, ok: size <= limitBytes };
  }
  return { files, size, info };
}

/** Chia sẻ tệp qua Web Share (Zalo...) nếu có; trả về 'shared' | 'cancelled' | 'unsupported'. */
export async function shareFiles(files, title) {
  const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
  try {
    if (navigator.canShare && navigator.canShare({ files: list })) {
      await navigator.share({ files: list, title });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
  return 'unsupported';
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Bố cục (đoạn, tiêu đề, bảng) của một trang đã OCR. */
export function pageLayout(page) {
  const o = page.ocr;
  return layoutPage({ words: o.words, width: o.width, height: o.height }, { rules: o.rules });
}

/**
 * Xuất Word. opts: { title, withImages (kèm ảnh trang đã xử lý ở cuối), onProgress, signal, sigImages }
 * Trả về { blob, size, layouts }
 */
export async function exportDocx(pages, opts) {
  const { title, withImages, onProgress, signal, sigImages } = opts;
  if (!pages.length) throw new Error('Chưa có trang nào');
  const layouts = [];
  for (let i = 0; i < pages.length; i++) {
    checkAbort(signal);
    if (onProgress) onProgress({ stage: 'ocr', i, n: pages.length });
    await ocrPage(pages[i], (p) => onProgress && onProgress({ stage: 'ocr', i, n: pages.length, sub: p }), signal);
    layouts.push(pageLayout(pages[i]));
  }
  const images = [];
  if (withImages) {
    for (let i = 0; i < pages.length; i++) {
      if (onProgress) onProgress({ stage: 'render', i, n: pages.length });
      const e = await encodedPage(pages[i], 1600, 0.82, sigImages, signal);
      images.push({ bytes: e.bytes, w: e.w, h: e.h });
    }
  }
  const bytes = await buildDocx(layouts, { title, images });
  return { blob: new Blob([bytes], { type: DOCX_MIME }), size: bytes.length, layouts };
}

/** Các bảng (có thể sửa) cho Excel: [{name, rows, approx}] — mỗi bảng một trang tính; không có bảng thì từng dòng chữ là một hàng. */
export async function sheetsForPages(pages, { onProgress, signal } = {}) {
  const sheets = [];
  for (let i = 0; i < pages.length; i++) {
    checkAbort(signal);
    if (onProgress) onProgress({ stage: 'ocr', i, n: pages.length });
    await ocrPage(pages[i], (p) => onProgress && onProgress({ stage: 'ocr', i, n: pages.length, sub: p }), signal);
    const tabs = tablesForSheet(pageLayout(pages[i]));
    tabs.forEach((t, k) => sheets.push({ name: pages.length > 1 ? `Trang ${i + 1}${tabs.length > 1 ? ' - Bảng ' + (k + 1) : ''}` : tabs.length > 1 ? `Bảng ${k + 1}` : 'Bảng 1', rows: t.rows, approx: t.approx, page: i }));
  }
  return sheets;
}

export async function exportXlsx(sheets, title) {
  const bytes = await buildXlsx(sheets.map((s) => ({ name: s.name, rows: s.rows, headerRow: !s.approx })), { title });
  return { blob: new Blob([bytes], { type: XLSX_MIME }), size: bytes.length };
}

function pageAspect(page) {
  const q = quadSize(toPixels(page.corners, page.srcW || 1, page.srcH || 1));
  const a = q.w / (q.h || 1);
  return (page.rot || 0) % 180 === 0 ? a : 1 / a;
}

/**
 * Tự xoay đúng chiều chữ: dò dọc/ngang bằng hình ảnh, rồi dùng OCR so sánh hai chiều (thẳng / lộn ngược) và chọn chiều đọc tốt hơn.
 * Trả về { rot (mới), changed, confidence } và cập nhật page.rot, page.signs. Nếu OCR không chạy được thì chỉ sửa dọc/ngang.
 */
export async function autoOrientPage(page, onProgress) {
  const o = await pageOrientation(page);
  const base = o.ratio >= 1.6 ? (o.horizontal ? 0 : 90) : 0;
  const canvas = await renderPage({ ...page, rot: 0, signs: [] }, { srcEdge: 2000, maxEdge: 1400, filter: 'auto', noSigns: true, noFix: true });
  let best = base, bestConf = -1;
  try {
    for (const cand of [base, (base + 180) % 360]) {
      const c = rotateCanvas(canvas, cand);
      prepForOcr(c);
      const r = await recognizeCanvas(c, onProgress);
      if (r.confidence > bestConf + 6) { bestConf = r.confidence; best = cand; }
    }
  } catch (e) { best = base; bestConf = -1; }
  const before = page.rot || 0;
  if (best !== before) {
    const aspect = pageAspect(page);
    const delta = ((best - before) % 360 + 360) % 360;
    page.signs = rotateSigns(page.signs, delta, aspect);
    page.rot = best; page.thumb = null; page.ocr = null;
  }
  return { rot: best, changed: best !== before, confidence: bestConf };
}
