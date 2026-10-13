// Trạng thái dùng chung: dữ liệu câu hỏi đã nạp, cài đặt, ghi nhận kết quả từng câu.
import { store } from './store.js';
import { HANGS, defaultProfile, examSpec } from './rules.js';
import { indexQuestions, nextState, dayKey, dueList, wrongList, isMastered } from './core.js';

export const D = { questions: [], byId: new Map(), sets: null, meta: null, tips: null, tipByQ: new Map(), ready: false };

async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function loadData() {
  const [questions, sets, meta, tips] = await Promise.all([
    getJSON('data/questions.json'),
    getJSON('data/sets.json'),
    getJSON('data/meta.json'),
    getJSON('data/tips.json'),
  ]);
  D.questions = questions;
  D.byId = indexQuestions(questions);
  D.sets = sets;
  D.meta = meta;
  D.tips = tips;
  D.tipByQ = new Map();
  for (const t of tips.chu_de) for (const id of t.ids) if (!D.tipByQ.has(id)) D.tipByQ.set(id, t);
  store.setValidIds(new Set(questions.map((q) => q.id)));
  D.ready = true;
}

export const cfg = () => store.get().settings;
export const hang = () => (HANGS[cfg().hang] ? cfg().hang : 'B');
export const poolSet = (h = hang()) => D.sets[HANGS[h].pool];
export const poolIds = (h = hang()) => poolSet(h).pool;
export const critIds = (h = hang()) => poolSet(h).crit;
export const isCrit = (id, h = hang()) => poolSet(h).crit.includes(id);
// Tự động: theo ngày thi nếu đã đặt (và chưa qua), nếu không thì theo hôm nay.
export function profileId() {
  const p = cfg().profile;
  if (p === 'hien-hanh' || p === 'moi') return p;
  const now = new Date();
  const ex = cfg().examDate ? new Date(cfg().examDate + 'T00:00:00') : null;
  return defaultProfile(ex && ex > now ? ex : now);
}
export const spec = (h = hang()) => examSpec(profileId(), h);
export const states = () => store.get().q;

export function record(id, correct, now = Date.now()) {
  const d = store.get();
  d.q[id] = nextState(d.q[id], correct, now);
  const k = dayKey(now);
  d.days[k] = (d.days[k] || 0) + 1;
  store.saveSoon();
}

export function counts(h = hang()) {
  const ids = poolIds(h);
  const st = states();
  const due = dueList(st, ids);
  const wrong = wrongList(st, ids);
  let seen = 0;
  let mastered = 0;
  for (const id of ids) {
    if (st[id] && st[id].s > 0) seen++;
    if (isMastered(st[id])) mastered++;
  }
  return { total: ids.length, seen, mastered, due, wrong };
}

export function applyTheme() {
  const t = cfg().theme;
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t);
  else r.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0a1311' : '#0d9488');
}

export const CHAPTERS = {
  1: 'Quy định chung và quy tắc giao thông',
  2: 'Văn hóa giao thông, đạo đức người lái xe, phòng cháy chữa cháy, cứu hộ',
  3: 'Kỹ thuật lái xe',
  4: 'Cấu tạo và sửa chữa',
  5: 'Báo hiệu đường bộ (biển báo)',
  6: 'Giải thế sa hình và xử lý tình huống',
};
export const CHAPTER_SHORT = { 1: 'Quy tắc giao thông', 2: 'Văn hóa, đạo đức', 3: 'Kỹ thuật lái xe', 4: 'Cấu tạo, sửa chữa', 5: 'Biển báo', 6: 'Sa hình' };
