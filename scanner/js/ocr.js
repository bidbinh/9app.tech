// OCR tiếng Việt bằng Tesseract.js (đã vendor hóa trong /vendor/tesseract, tải lười khi dùng lần đầu).
const BASE = new URL('../vendor/tesseract/', import.meta.url).href;

let loading = null;
let worker = null;
let progressCb = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Không tải được bộ đọc chữ. Hãy kết nối mạng ở lần dùng đầu tiên.'));
    document.head.appendChild(s);
  });
}

function simdSupported() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch (e) { return false; }
}

const STATUS_VI = {
  'loading tesseract core': 'Đang tải bộ đọc chữ',
  'initializing tesseract': 'Đang khởi động',
  'loading language traineddata': 'Đang tải dữ liệu tiếng Việt',
  'loaded language traineddata': 'Đã tải dữ liệu tiếng Việt',
  'initializing api': 'Đang khởi động',
  'initialized api': 'Sẵn sàng',
  'recognizing text': 'Đang đọc chữ',
};

async function getWorker() {
  if (worker) return worker;
  if (loading) return loading;
  loading = (async () => {
    await loadScript(BASE + 'tesseract.min.js');
    const corePath = BASE + (simdSupported() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js');
    const w = await window.Tesseract.createWorker('vie', 1, {
      workerPath: BASE + 'worker.min.js',
      corePath,
      langPath: BASE,
      gzip: true,
      workerBlobURL: false,
      cacheMethod: 'none',
      logger: (m) => { if (progressCb) progressCb({ status: STATUS_VI[m.status] || m.status, progress: m.progress || 0, raw: m.status }); },
    });
    worker = w;
    return w;
  })();
  try { return await loading; } finally { loading = null; }
}

const IDLE_MS = 60000;
let idleTimer = null;
let chain = Promise.resolve(); // chỉ một lượt đọc chữ chạy tại một thời điểm (không chồng OCR lên OCR)

const friendly = (e) => {
  const m = (e && e.message) || '';
  if (/Không tải được bộ đọc chữ/.test(m)) return m;
  if (/fetch|network|Failed|load|404|NetworkError/i.test(m)) return 'Không tải được dữ liệu đọc chữ tiếng Việt. Hãy kết nối mạng ở lần dùng đầu tiên rồi thử lại.';
  return 'Không đọc được chữ trên trang này. Hãy thử lại, hoặc chụp rõ và thẳng hơn.';
};

/**
 * Đọc chữ từ canvas. Trả về { text, words: [{text,x0,y0,x1,y1,conf}], width, height, confidence }.
 * onProgress({status, progress}) với progress 0..1 của riêng bước đọc chữ. Lỗi được đổi sang tiếng Việt dễ hiểu.
 */
export function recognizeCanvas(canvas, onProgress) {
  const run = async () => {
    clearTimeout(idleTimer);
    progressCb = onProgress || null;
    try {
      const w = await getWorker();
      const res = await w.recognize(canvas, {}, { text: true, blocks: true });
      const d = res.data;
      const words = [], lines = [];
      for (const b of d.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
        const lw = [];
        for (const wd of l.words || []) {
          if (!wd.text || !wd.text.trim()) continue;
          const w = { text: wd.text.trim(), x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, conf: wd.confidence };
          words.push(w); lw.push(w);
        }
        if (lw.length) lines.push({ words: lw });
      }
      return { text: (d.text || '').trim(), words, lines, width: canvas.width, height: canvas.height, confidence: d.confidence };
    } catch (e) {
      await disposeOcr(); // worker có thể đã hỏng: lần sau dựng lại
      const err = new Error(friendly(e));
      err.cause = e;
      throw err;
    } finally {
      progressCb = null;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { disposeOcr(); }, IDLE_MS); // nhàn rỗi thì giải phóng bộ nhớ của worker
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

export async function disposeOcr() {
  clearTimeout(idleTimer);
  const w = worker; worker = null;
  if (w) { try { await w.terminate(); } catch (e) { /* bỏ qua */ } }
}

/** Ghép văn bản của nhiều trang. */
export function joinPages(texts) {
  return texts.map((t, i) => (texts.length > 1 ? `--- Trang ${i + 1} ---\n${t}` : t)).join('\n\n');
}
