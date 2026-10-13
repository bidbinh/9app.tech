// Tải nền các hình minh họa để dùng ngoại tuyến: chạy khi rảnh, nhẹ (2 luồng), có tiến độ, ngắt được, tiếp tục được.
export const IMG_CACHE = '9license-img-v1';

// Không tự tải khi bật chế độ tiết kiệm dữ liệu hoặc mạng 2G.
export function connectionOk(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const c = nav.connection;
  if (nav.onLine === false) return false;
  if (!c) return true;
  if (c.saveData) return false;
  return !['slow-2g', '2g'].includes(c.effectiveType);
}

export function imageUrls(questions) {
  return [...new Set(questions.filter((q) => q.img).map((q) => 'data/img/' + q.img))];
}

export async function cachedSet(urls, cachesApi = globalThis.caches) {
  if (!cachesApi) return new Set();
  const cache = await cachesApi.open(IMG_CACHE);
  const keys = await cache.keys();
  const have = new Set(keys.map((r) => new URL(r.url, 'http://x').pathname.replace(/^.*?(data\/img\/.+)$/, '$1')));
  return new Set(urls.filter((u) => have.has(u)));
}

export const progress = { running: false, done: 0, total: 0, failed: 0, finished: false };
const listeners = new Set();
let ctrl = null;
const emit = () => listeners.forEach((f) => { try { f({ ...progress }); } catch { /* bỏ qua */ } });
export const onProgress = (f) => { listeners.add(f); return () => listeners.delete(f); };

export function stop() { if (ctrl) ctrl.abort(); }

// deps để kiểm thử: { fetchFn, cachesApi }
export async function start(urls, { workers = 2, fetchFn = globalThis.fetch?.bind(globalThis), cachesApi = globalThis.caches } = {}) {
  if (progress.running || !cachesApi || !fetchFn) return { ...progress };
  ctrl = new AbortController();
  const signal = ctrl.signal;
  Object.assign(progress, { running: true, done: 0, total: urls.length, failed: 0, finished: false });
  emit();
  try {
    const cache = await cachesApi.open(IMG_CACHE);
    let idx = 0;
    const worker = async () => {
      while (idx < urls.length && !signal.aborted) {
        const u = urls[idx++];
        try {
          if (!(await cache.match(u))) {
            const r = await fetchFn(u, { signal });
            if (r.ok) await cache.put(u, r);
            else progress.failed++;
          }
          if (!signal.aborted) progress.done++;
        } catch {
          if (signal.aborted) break;
          progress.failed++;
        }
        emit();
      }
    };
    await Promise.all(Array.from({ length: workers }, worker));
    progress.finished = !signal.aborted && progress.failed === 0 && progress.done >= progress.total;
  } finally {
    progress.running = false;
    ctrl = null;
    emit();
  }
  return { ...progress };
}

// Tự khởi động khi rảnh nếu mạng tốt. Trả về hàm hủy hẹn giờ.
export function autoStart(urls, { enabled = true, idle = globalThis.requestIdleCallback, delay = 4000 } = {}) {
  if (!enabled || !connectionOk() || !globalThis.caches) return () => {};
  let cancelled = false;
  const run = () => { if (!cancelled && connectionOk()) start(urls); };
  const t = setTimeout(() => (idle ? idle(run, { timeout: 15000 }) : run()), delay);
  return () => { cancelled = true; clearTimeout(t); };
}
