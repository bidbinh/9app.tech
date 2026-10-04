// Lưu cục bộ trên máy người dùng (localStorage). Không gửi đi đâu. Mọi thao tác bọc try/catch vì có thể bị chặn.
const KEY = 'n9interview.v1';
const SID_KEY = 'n9interview.sid';

export const emptyCv = () => ({
  tpl: 'codien',
  hoTen: '', chucDanh: '', email: '', sdt: '', diaChi: '', web: '', anh: '',
  tomTat: '',
  kinhNghiem: [],
  hocVan: [],
  kyNang: '',
  chungChi: '',
});

export const emptyExp = () => ({ congTy: '', chucVu: '', tu: '', den: '', mota: '' });
export const emptyEdu = () => ({ truong: '', nganh: '', tu: '', den: '', ghiChu: '' });

const defaults = () => ({
  v: 1,
  cv: emptyCv(),
  letter: { tpl: 'chuan', data: {} },
  checklist: {},
  history: [],
  settings: { group: 'vanphong', consentAi: false, consentCv: false, tts: true },
});

let mem = null;
let memoryOnly = false;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const j = JSON.parse(raw);
    return normalize(j);
  } catch { memoryOnly = true; return defaults(); }
}

export function normalize(j) {
  const d = defaults();
  if (!j || typeof j !== 'object') return d;
  const cv = { ...d.cv, ...(j.cv && typeof j.cv === 'object' ? j.cv : {}) };
  cv.kinhNghiem = Array.isArray(cv.kinhNghiem) ? cv.kinhNghiem.slice(0, 12).map((e) => ({ ...emptyExp(), ...(e || {}) })) : [];
  cv.hocVan = Array.isArray(cv.hocVan) ? cv.hocVan.slice(0, 8).map((e) => ({ ...emptyEdu(), ...(e || {}) })) : [];
  return {
    v: 1, cv,
    letter: { tpl: 'chuan', data: {}, ...(j.letter && typeof j.letter === 'object' ? j.letter : {}) },
    checklist: j.checklist && typeof j.checklist === 'object' ? j.checklist : {},
    history: Array.isArray(j.history) ? j.history.slice(-40) : [],
    settings: { ...d.settings, ...(j.settings && typeof j.settings === 'object' ? j.settings : {}) },
  };
}

export function get() { if (!mem) mem = read(); return mem; }

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
export function flush() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(mem || defaults())); memoryOnly = false; } catch { memoryOnly = true; }
}
export const isMemoryOnly = () => memoryOnly;

export function addHistory(entry) {
  const s = get();
  s.history.push(entry);
  if (s.history.length > 40) s.history = s.history.slice(-40);
  flush();
}

export function exportJson() { return JSON.stringify(get(), null, 2); }

export function importJson(text) {
  const j = JSON.parse(text);
  if (!j || typeof j !== 'object' || j.v !== 1) throw new Error('Tệp không đúng định dạng 9interview');
  mem = normalize(j);
  flush();
}

export function clearAll() {
  mem = defaults();
  try { localStorage.removeItem(KEY); localStorage.removeItem(SID_KEY); } catch { /* bỏ qua */ }
}

// Mã phiên ẩn danh để giới hạn tốc độ, không gắn với danh tính.
export function sessionId() {
  try {
    let s = localStorage.getItem(SID_KEY);
    if (s && /^[A-Za-z0-9_-]{16,64}$/.test(s)) return s;
    s = randomId();
    localStorage.setItem(SID_KEY, s);
    return s;
  } catch { return sessionId.fallback || (sessionId.fallback = randomId()); }
}
function randomId() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
