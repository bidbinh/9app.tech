// Cầu nối tới pdf.js (vendor/pdfjs, Apache-2.0): mở PDF, dựng trang ra canvas, lấy chữ có tọa độ.
// Nạp lười: chỉ tải ~1,7 MB khi người dùng mở công cụ PDF lần đầu. Mọi xử lý chạy trên máy.
import { makeCanvas } from './render.js';

const BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
let lib = null;

export async function loadPdfJs() {
  if (lib) return lib;
  lib = await import(BASE + 'pdf.min.js');
  lib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
  return lib;
}

/** Mở PDF từ Uint8Array. Ném lỗi có code: 'PASSWORD' (cần mật khẩu), 'BADPASSWORD', 'INVALID'. */
export async function openPdf(bytes, password) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), password, wasmUrl: BASE + 'wasm/', isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    return doc;
  } catch (e) {
    const err = new Error(e && e.name === 'PasswordException' ? (e.code === 2 ? 'Mật khẩu chưa đúng.' : 'Tệp PDF này có mật khẩu.') : 'Không mở được tệp PDF. Tệp có thể bị hỏng hoặc không phải PDF.');
    err.code = e && e.name === 'PasswordException' ? (e.code === 2 ? 'BADPASSWORD' : 'PASSWORD') : 'INVALID';
    throw err;
  }
}

/** Dựng trang n (1..) ra canvas với cạnh dài tối đa maxEdge điểm ảnh (hoặc scale cố định). */
export async function renderPdfPage(doc, n, { maxEdge = 1600, scale } = {}) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const s = scale || Math.min(4, maxEdge / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale: s });
  const canvas = makeCanvas(vp.width, vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  page.cleanup();
  return canvas;
}

/**
 * Chữ của trang n dưới dạng danh sách "từ" có hộp (điểm ảnh theo scale 1 = điểm PDF, gốc trên-trái).
 * Trả về { words, width, height, chars } — chars là tổng số ký tự (để biết PDF có chữ hay là bản quét).
 */
export async function pdfPageWords(doc, n) {
  const pdfjs = await loadPdfJs();
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const words = [];
  let chars = 0;
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const tx = pdfjs.Util.transform(vp.transform, it.transform);
    const fh = Math.hypot(tx[2], tx[3]) || it.height || 10;
    const x = tx[4], y = tx[5];
    const w = Math.abs(it.width * vp.scale) || fh * 0.5 * it.str.length;
    chars += it.str.length;
    // tách theo khoảng trắng lớn để dò bảng tốt hơn: giữ nguyên một mục nếu không có khoảng trắng kép
    const parts = it.str.split(/\s{3,}/);
    if (parts.length === 1) words.push({ text: it.str.trim(), x0: x, x1: x + w, y0: y - fh * 0.85, y1: y + fh * 0.2 });
    else {
      let off = 0;
      for (const p of parts) {
        const at = it.str.indexOf(p, off); off = at + p.length;
        if (!p.trim()) continue;
        const x0 = x + (at / it.str.length) * w, x1 = x + ((at + p.length) / it.str.length) * w;
        words.push({ text: p.trim(), x0, x1, y0: y - fh * 0.85, y1: y + fh * 0.2 });
      }
    }
  }
  page.cleanup();
  return { words, width: vp.width, height: vp.height, chars };
}
