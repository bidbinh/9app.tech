// "Giải của tôi": lưu localStorage (bọc try/catch, rơi về bộ nhớ tạm), xuất/nhập JSON sao lưu.
export const STATUSES = ['interested', 'registered', 'ran'];
export const STATUS_LABEL = { interested: 'Quan tâm', registered: 'Đã đăng ký', ran: 'Đã chạy' };
export const KEY = '9race.mine.v1';

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Chuẩn hóa PB dạng H:MM:SS hoặc MM:SS; rỗng nếu không hợp lệ. */
export function normalizePb(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return '';
  const m = /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/.exec(t);
  if (!m) return null;
  const h = m[1] != null ? String(+m[1]) : '';
  const mm = m[1] != null ? m[2].padStart(2, '0') : String(+m[2]);
  return h !== '' ? `${h}:${mm}:${m[3]}` : `${mm}:${m[3]}`;
}

export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!STATUSES.includes(raw.status)) return null;
  const pb = normalizePb(raw.pb);
  return {
    status: raw.status,
    pb: pb == null ? '' : pb,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 2000) : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 30) : '',
  };
}

export function cleanItems(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(raw)) {
    if (!ID_RE.test(id)) continue;
    const it = cleanItem(raw[id]);
    if (it) out[id] = it;
  }
  return out;
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

export function createStore(storage, nowFn = () => new Date().toISOString()) {
  let backend = storage;
  let persistent = true;
  const mem = memoryStorage();
  const guard = (fn, fallback) => {
    try { return fn(backend); } catch {
      persistent = false;
      backend = mem;
      try { return fn(backend); } catch { return fallback; }
    }
  };
  if (!backend) { backend = mem; persistent = false; }

  let items = {};
  const raw = guard((b) => b.getItem(KEY), null);
  if (raw) {
    try { items = cleanItems(JSON.parse(raw).items); } catch { items = {}; }
  }

  function save() {
    guard((b) => b.setItem(KEY, JSON.stringify({ version: 1, items })), null);
  }

  return {
    get persistent() { return persistent; },
    all: () => ({ ...items }),
    get: (id) => items[id] || null,
    count: () => Object.keys(items).length,
    setStatus(id, status) {
      if (!ID_RE.test(id)) return;
      if (status == null) { delete items[id]; save(); return; }
      if (!STATUSES.includes(status)) return;
      const prev = items[id];
      items[id] = { status, pb: prev ? prev.pb : '', note: prev ? prev.note : '', updatedAt: nowFn() };
      save();
    },
    /** Trả về false nếu PB sai định dạng (không lưu). */
    setPb(id, value) {
      if (!items[id]) return false;
      const pb = normalizePb(value);
      if (pb == null) return false;
      items[id] = { ...items[id], pb, updatedAt: nowFn() };
      save();
      return true;
    },
    setNote(id, note) {
      if (!items[id]) return;
      items[id] = { ...items[id], note: String(note).slice(0, 2000), updatedAt: nowFn() };
      save();
    },
    exportJSON() {
      return JSON.stringify({ app: '9race', version: 1, exportedAt: nowFn(), items }, null, 2);
    },
    /** mode: 'merge' (giữ bản mới hơn theo updatedAt) hoặc 'replace'. */
    importJSON(text, mode = 'merge') {
      let data;
      try { data = JSON.parse(text); } catch { return { ok: false, error: 'Tệp không phải JSON hợp lệ.' }; }
      if (!data || data.app !== '9race' || typeof data.items !== 'object' || data.items === null) {
        return { ok: false, error: 'Đây không phải tệp sao lưu của 9race.' };
      }
      if (data.version !== 1) return { ok: false, error: 'Phiên bản tệp sao lưu chưa được hỗ trợ.' };
      const incoming = cleanItems(data.items);
      const n = Object.keys(incoming).length;
      if (mode === 'replace') {
        items = incoming;
      } else {
        for (const id of Object.keys(incoming)) {
          const cur = items[id];
          if (!cur || (incoming[id].updatedAt || '') >= (cur.updatedAt || '')) items[id] = incoming[id];
        }
      }
      save();
      return { ok: true, count: n };
    },
  };
}
