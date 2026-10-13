// Nạp pdf-lib và pdf.js đã vendor hóa vào Node để kiểm thử (cùng tệp mà trình duyệt dùng).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadPdfLibNode() {
  if (globalThis.PDFLib) return globalThis.PDFLib;
  const src = fs.readFileSync(path.join(ROOT, 'vendor/pdflib/pdf-lib.min.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'self', src).call(globalThis, mod, mod.exports, globalThis);
  globalThis.PDFLib = mod.exports;
  return globalThis.PDFLib;
}

let pdfjs = null;
export async function loadPdfJsNode() {
  if (pdfjs) return pdfjs;
  // chỉ đọc chữ/cấu trúc nên không cần canvas: thay thế tối thiểu các lớp đồ họa mà pdf.js tham chiếu khi khởi động
  globalThis.DOMMatrix ||= class DOMMatrix { constructor() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; } };
  globalThis.ImageData ||= class ImageData {};
  globalThis.Path2D ||= class Path2D {};
  pdfjs = await import(pathToFileURL(path.join(ROOT, 'vendor/pdfjs/pdf.min.js')).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(ROOT, 'vendor/pdfjs/pdf.worker.min.js')).href;
  return pdfjs;
}

export async function pdfTexts(bytes, password) {
  const lib = await loadPdfJsNode();
  const doc = await lib.getDocument({ data: bytes.slice(), password, verbosity: 0, isEvalSupported: false, useSystemFonts: false }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((x) => x.str).join(' ').trim());
  }
  await doc.destroy();
  return out;
}
