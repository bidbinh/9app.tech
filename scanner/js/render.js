// Cầu nối canvas <-> thuật toán thuần: nạp ảnh, nắn phẳng, lọc, xoay, chèn chữ ký, xuất JPEG.
import { warpPerspective, rotateRGBA, quadSize, fitEdge, toPixels } from './geom.js';
import { applyFilter, looksLikePhoto } from './filters.js';
import { detectDocument } from './edges.js';
import { detectOrientation } from './orient.js';
import { applyFixes } from './fixes.js';

export const SRC_MAX_EDGE = 2600;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), type, quality);
  });
}

export async function blobToBitmap(blob) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* thử cách khác */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

const dimsOf = (b) => ({ w: b.width || b.naturalWidth, h: b.height || b.naturalHeight });

/** Nhập ảnh (File/Blob hoặc canvas): thu nhỏ về tối đa SRC_MAX_EDGE, trả về {blob, w, h}. */
export async function importImage(input) {
  let canvas;
  if (input instanceof HTMLCanvasElement) {
    const s = Math.min(1, SRC_MAX_EDGE / Math.max(input.width, input.height));
    canvas = s < 1 ? makeCanvas(input.width * s, input.height * s) : makeCanvas(input.width, input.height);
    canvas.getContext('2d').drawImage(input, 0, 0, canvas.width, canvas.height);
  } else {
    const bmp = await blobToBitmap(input);
    const { w, h } = dimsOf(bmp);
    const s = Math.min(1, SRC_MAX_EDGE / Math.max(w, h));
    canvas = makeCanvas(w * s, h * s);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
  }
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  return { blob, w: canvas.width, h: canvas.height, canvas };
}

// Bộ nhớ đệm ảnh nguồn đã giải mã (một vài mục gần nhất) để kéo góc/đổi lọc mượt
const srcCache = new Map();
async function getSourceData(page, maxEdge) {
  const key = `${page.id}:${maxEdge}`;
  if (srcCache.has(key)) { const v = srcCache.get(key); srcCache.delete(key); srcCache.set(key, v); return v; }
  const bmp = await blobToBitmap(page.src);
  const { w, h } = dimsOf(bmp);
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const c = makeCanvas(w * s, h * s);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  const data = ctx.getImageData(0, 0, c.width, c.height);
  srcCache.set(key, data);
  while (srcCache.size > 3) srcCache.delete(srcCache.keys().next().value);
  return data;
}
export function dropSourceCache(pageId) {
  for (const k of [...srcCache.keys()]) if (!pageId || k.startsWith(pageId + ':')) srcCache.delete(k);
}

/** Tự nhận cạnh cho một ảnh nguồn (blob). Trả về {corners chuẩn hóa 0..1, found, score}. */
export async function autoDetect(page) {
  const data = await getSourceData(page, 800);
  const r = detectDocument(data);
  return {
    corners: r.corners.map((p) => ({ x: p.x / data.width, y: p.y / data.height })),
    found: r.found, score: r.score,
  };
}

/** Ảnh nguồn thu nhỏ để hiển thị trong màn hình chỉnh góc. */
export async function sourceCanvas(page, maxEdge = 1400) {
  const d = await getSourceData(page, maxEdge);
  const c = makeCanvas(d.width, d.height);
  c.getContext('2d').putImageData(d, 0, 0);
  return c;
}

/**
 * Dựng kết quả của một trang: nắn phẳng -> lọc -> xoay -> chữ ký.
 * opts: { srcEdge (cạnh dài ảnh nguồn dùng để xử lý), maxEdge (cạnh dài kết quả), sigImages: Map(id -> canvas/bitmap), filter (ghi đè) }
 */
export async function renderPage(page, opts = {}) {
  const srcEdge = opts.srcEdge || SRC_MAX_EDGE;
  const maxEdge = opts.maxEdge || 1600;
  const src = await getSourceData(page, srcEdge);
  const quad = toPixels(page.corners, src.width, src.height);
  const qs = quadSize(quad);
  const o = fitEdge(qs.w, qs.h, maxEdge);
  const outData = warpPerspective(src, quad, o.w, o.h);
  let img = { data: outData, width: o.w, height: o.h };
  const photoLike = opts.analyze ? looksLikePhoto(img) : false;
  if (page.rot) img = rotateRGBA(img, page.rot);
  let fixInfo = null;
  if (!opts.noFix) { const r = applyFixes(img, page); img = r.img; fixInfo = r.info; }
  applyFilter(img, opts.filter || page.filter || 'original');
  const canvas = makeCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  if (!opts.noSigns) drawSigns(ctx, canvas.width, canvas.height, page.signs, opts.sigImages);
  canvas.photoLike = photoLike;
  canvas.fixInfo = fixInfo;
  return canvas;
}

export function drawSigns(ctx, W, H, signs, sigImages) {
  if (!signs || !signs.length || !sigImages) return;
  for (const s of signs) {
    const im = sigImages.get(s.sigId);
    if (!im) continue;
    const w = s.w * W, h = w * (im.height / im.width);
    ctx.drawImage(im, s.cx * W - w / 2, s.cy * H - h / 2, w, h);
  }
}

export async function thumbOf(canvas, edge = 360) {
  const s = Math.min(1, edge / Math.max(canvas.width, canvas.height));
  const c = makeCanvas(canvas.width * s, canvas.height * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', 0.8);
}

/** Thu nhỏ canvas về tỉ lệ scale (<=1). */
export function scaleCanvas(canvas, scale) {
  if (scale >= 0.999) return canvas;
  const c = makeCanvas(canvas.width * scale, canvas.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

export function pickFiles({ accept = 'image/*', multiple = true, capture } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    if (capture) inp.setAttribute('capture', capture);
    inp.style.display = 'none';
    document.body.appendChild(inp);
    let done = false;
    const finish = (files) => { if (done) return; done = true; inp.remove(); resolve(files); };
    inp.addEventListener('change', () => finish([...inp.files]));
    inp.addEventListener('cancel', () => finish([]));
    inp.click();
  });
}

/** Dò hướng chữ của trang (đã nắn phẳng, chưa xoay): { axisRot, rot, conf, ratio, horizontal }. */
export async function pageOrientation(page) {
  const canvas = await renderPage({ ...page, rot: 0, signs: [] }, { srcEdge: 1400, maxEdge: 1000, filter: 'auto', noSigns: true, noFix: true });
  const id = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  return detectOrientation(id);
}

/** Xoay canvas theo bội số 90 độ (chiều kim đồng hồ). */
export function rotateCanvas(canvas, deg) {
  const d = ((deg % 360) + 360) % 360;
  if (!d) return canvas;
  const swap = d % 180 !== 0;
  const c = makeCanvas(swap ? canvas.height : canvas.width, swap ? canvas.width : canvas.height);
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate((d * Math.PI) / 180);
  x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
}
