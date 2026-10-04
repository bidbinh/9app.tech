// Lưu tiến độ học trên máy (localStorage). Mọi truy cập bọc try/catch; nếu bị chặn thì dùng bộ nhớ tạm của phiên.
import { HANG_LIST } from './rules.js';

const KEY = '9license:v1';

export const DEFAULTS = () => ({
  v: 1,
  q: {}, // trạng thái lặp lại ngắt quãng theo id câu
  exams: [], // lịch sử thi thử
  days: {}, // số câu đã làm mỗi ngày
  settings: { hang: 'B', examDate: '', theme: 'auto', profile: 'auto', remind: '20:00', gplxExpiry: '', goal: 20, autoImg: true },
  cur: null, // bài thi thử đang làm dở
  reports: [], // câu đã báo sai (lưu máy)
});

let data = null;
let persistent = true;
let timer = null;
let dirty = false;
let validIds = null;
let lastErrAt = 0;
const handlers = { onError: null };

function fail(kind) {
  persistent = false;
  const now = Date.now();
  if (handlers.onError && now - lastErrAt > 8000) { lastErrAt = now; try { handlers.onError(kind); } catch { /* bỏ qua */ } }
}
function safeGet() {
  try { return window.localStorage.getItem(KEY); } catch { persistent = false; return null; }
}
function safeSet(v) {
  try { window.localStorage.setItem(KEY, v); persistent = true; return true; } catch (e) { fail(e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'quota' : 'blocked'); return false; }
}

const isInt = (x) => Number.isInteger(x);
const okId = (id) => isInt(id) && id > 0 && (!validIds || validIds.has(id));
const PROFILES_OK = ['hien-hanh', 'moi'];

function sanitizeCur(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.ids) || !c.ids.length || c.ids.length > 200) return null;
  if (!c.ids.every(okId) || new Set(c.ids).size !== c.ids.length) return null;
  if (!HANG_LIST.includes(c.hang) || !PROFILES_OK.includes(c.profile)) return null;
  if (![c.minutes, c.passMark, c.startedAt].every(Number.isFinite) || c.minutes <= 0 || c.minutes > 300 || c.passMark < 0 || c.passMark > c.ids.length) return null;
  const set = new Set(c.ids);
  const answers = {};
  for (const [k, v] of Object.entries(c.answers && typeof c.answers === 'object' ? c.answers : {})) if (set.has(+k) && isInt(v) && v >= 0 && v <= 3) answers[k] = v;
  const flags = {};
  for (const [k, v] of Object.entries(c.flags && typeof c.flags === 'object' ? c.flags : {})) if (set.has(+k) && v === true) flags[k] = true;
  const critIds = Array.isArray(c.critIds) ? c.critIds.filter((x) => set.has(x)) : [];
  return { hang: c.hang, profile: c.profile, ids: c.ids.slice(), minutes: c.minutes, passMark: c.passMark, total: c.ids.length, critIds, startedAt: c.startedAt, answers, flags, i: isInt(c.i) && c.i >= 0 && c.i < c.ids.length ? c.i : 0 };
}

function sanitizeExam(e) {
  if (!e || typeof e !== 'object' || !Number.isFinite(e.t) || !isInt(e.score)) return null;
  if (!Array.isArray(e.ids) || !e.ids.length || e.ids.length > 200 || !e.ids.every(okId)) return null;
  if (!Array.isArray(e.ans) || e.ans.length !== e.ids.length || !e.ans.every((v) => isInt(v) && v >= -1 && v <= 3)) return null;
  if (!HANG_LIST.includes(e.hang) || !PROFILES_OK.includes(e.profile)) return null;
  if (e.total !== e.ids.length || e.score < 0 || e.score > e.total || !Number.isFinite(e.passMark)) return null;
  const set = new Set(e.ids);
  return {
    t: e.t, hang: e.hang, profile: e.profile, score: e.score, total: e.total, passMark: e.passMark, pass: e.pass === true,
    failReason: e.failReason === 'diem-liet' || e.failReason === 'thieu-diem' ? e.failReason : null,
    critWrong: Array.isArray(e.critWrong) ? e.critWrong.filter((x) => set.has(x)) : [],
    used: Number.isFinite(e.used) ? e.used : 0, auto: e.auto === true, ids: e.ids.slice(), ans: e.ans.slice(),
  };
}

export function sanitize(obj, ids) {
  validIds = ids !== undefined ? ids : validIds;
  const d = DEFAULTS();
  if (!obj || typeof obj !== 'object') return d;
  if (obj.q && typeof obj.q === 'object') {
    for (const [k, s] of Object.entries(obj.q)) {
      if (/^\d+$/.test(k) && okId(+k) && s && Number.isFinite(s.b) && Number.isFinite(s.d)) {
        d.q[k] = { b: Math.max(0, Math.min(5, s.b | 0)), d: +s.d, s: Math.max(0, s.s | 0), c: Math.max(0, s.c | 0), w: Math.max(0, s.w | 0), l: s.l === 1 ? 1 : s.l === 0 ? 0 : -1, t: +s.t || 0 };
      }
    }
  }
  if (Array.isArray(obj.exams)) d.exams = obj.exams.map(sanitizeExam).filter(Boolean).slice(-200);
  if (obj.days && typeof obj.days === 'object') for (const [k, n] of Object.entries(obj.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(n)) d.days[k] = n | 0;
  if (obj.settings && typeof obj.settings === 'object') {
    Object.assign(d.settings, pick(obj.settings, Object.keys(d.settings)));
    const st = d.settings;
    if (!HANG_LIST.includes(st.hang)) st.hang = 'B';
    if (!['auto', 'hien-hanh', 'moi'].includes(st.profile)) st.profile = 'auto';
    if (!['auto', 'light', 'dark'].includes(st.theme)) st.theme = 'auto';
    if (st.examDate && !/^\d{4}-\d{2}-\d{2}$/.test(st.examDate)) st.examDate = '';
    if (st.gplxExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(st.gplxExpiry)) st.gplxExpiry = '';
    if (!/^\d{1,2}:\d{2}$/.test(st.remind || '')) st.remind = '20:00';
    if (![10, 20, 30, 50].includes(+st.goal)) st.goal = 20;
    st.goal = +st.goal;
    st.autoImg = st.autoImg !== false;
  }
  d.cur = sanitizeCur(obj.cur);
  if (Array.isArray(obj.reports)) d.reports = obj.reports.filter((r) => r && isInt(r.id) && Number.isFinite(r.t)).map((r) => ({ t: r.t, id: r.id, note: String(r.note || '').slice(0, 500) })).slice(-100);
  return d;
}
function pick(o, keys) {
  const r = {};
  for (const k of keys) if (k in o) r[k] = o[k];
  return r;
}

export const store = {
  get() {
    if (!data) {
      const raw = safeGet();
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
      data = sanitize(parsed);
    }
    return data;
  },
  save() {
    if (!data) return;
    clearTimeout(timer);
    dirty = false;
    safeSet(JSON.stringify(data));
  },
  saveSoon() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => this.flush(), 200);
  },
  // Ghi ngay nếu còn dữ liệu chưa ghi (gọi khi ẩn tab/đóng trang).
  flush() {
    if (dirty) this.save();
  },
  set onError(fn) { handlers.onError = fn; },
  // Sau khi nạp dữ liệu câu hỏi: loại bỏ mọi id không tồn tại khỏi tiến độ/bài thi đã lưu.
  setValidIds(ids) {
    validIds = ids;
    data = sanitize(this.get(), ids);
  },
  update(fn) {
    const d = this.get();
    fn(d);
    this.save();
    return d;
  },
  get persistent() { return persistent; },
  exportJSON() { return JSON.stringify({ app: '9license', exportedAt: new Date().toISOString(), data: this.get() }); },
  importJSON(text) {
    const o = JSON.parse(text);
    if (!o || o.app !== '9license' || !o.data) throw new Error('Không phải file sao lưu 9license');
    data = sanitize(o.data);
    if (!this.save2()) throw new Error('Không ghi được vào bộ nhớ trình duyệt');
  },
  save2() { if (!data) return false; clearTimeout(timer); dirty = false; return safeSet(JSON.stringify(data)); },
  reset() {
    data = DEFAULTS();
    try { window.localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
  },
  _resetMemory() { data = null; validIds = null; },
};

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });
}
