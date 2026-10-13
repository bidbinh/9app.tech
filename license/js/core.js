// Logic thuần (không DOM): trộn đề, chấm điểm, lặp lại ngắt quãng, thống kê.
import { HANGS, examSpec } from './rules.js';

// ---------- ngẫu nhiên có hạt giống ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function indexQuestions(list) {
  const m = new Map();
  for (const q of list) m.set(q.id, q);
  return m;
}

// Tập câu của một hạng: { pool: [id], crit: [id] }
export function poolFor(hang, sets) {
  const key = HANGS[hang]?.pool;
  if (!key || !sets[key]) throw new Error('không có tập câu cho hạng ' + hang);
  return sets[key];
}

// ---------- dựng đề thi ----------
// Không bao giờ xáo thứ tự đáp án: nhiều câu có ý "Cả hai ý trên", "Ý 1 và ý 2" phụ thuộc thứ tự.
export function buildExam({ hang, profile, questions, sets, rng = Math.random }) {
  const spec = examSpec(profile, hang);
  const { pool, crit } = poolFor(hang, sets);
  const byId = questions instanceof Map ? questions : indexQuestions(questions);
  const inPool = new Set(pool);
  const critSet = new Set(crit);
  const chap = (c) => pool.filter((id) => !critSet.has(id) && byId.get(id)?.ch === c);
  const groupPool = {
    rules: chap(1),
    crit: crit.slice(),
    culture: chap(2),
    tech: HANGS[hang].loai === 'xemay' ? [...chap(3), ...chap(4)] : chap(3),
    build: chap(4),
    signs: chap(5),
    sahinh: chap(6),
  };
  const ids = [];
  for (const [g, count] of Object.entries(spec.groups)) {
    const p = groupPool[g];
    if (!p) throw new Error('nhóm không biết: ' + g);
    if (p.length < count) throw new Error(`nhóm ${g} chỉ có ${p.length} câu, cần ${count}`);
    ids.push(...shuffle(p, rng).slice(0, count));
  }
  if (ids.length !== spec.n) throw new Error(`đề có ${ids.length} câu, cần ${spec.n}`);
  if (new Set(ids).size !== ids.length) throw new Error('đề có câu trùng');
  if (!ids.every((id) => inPool.has(id))) throw new Error('đề có câu ngoài tập của hạng');
  return {
    hang,
    profile,
    ids: shuffle(ids, rng),
    minutes: spec.min,
    passMark: spec.pass,
    total: spec.n,
    critIds: ids.filter((id) => critSet.has(id)),
  };
}

// ---------- chấm điểm ----------
// answers: { [id]: chỉ số đáp án (0-based) }. Câu bỏ trống tính là sai. Sai câu điểm liệt = trượt.
export function gradeExam(exam, answers, questions) {
  const byId = questions instanceof Map ? questions : indexQuestions(questions);
  const critSet = new Set(exam.critIds || exam.ids.filter((id) => byId.get(id)?.crit));
  let correct = 0;
  let unanswered = 0;
  const wrong = [];
  const critWrong = [];
  for (const id of exam.ids) {
    const q = byId.get(id);
    if (!q) throw new Error('thiếu câu ' + id);
    const given = answers[id];
    if (given === undefined || given === null) unanswered++;
    if (given === q.a) correct++;
    else {
      wrong.push(id);
      // Điểm liệt tính theo tập của hạng (vd hạng A1/A chỉ có 20 trong 60 câu), không theo cờ chung của câu.
      if (critSet.has(id)) critWrong.push(id);
    }
  }
  const passedScore = correct >= exam.passMark;
  return {
    correct,
    total: exam.ids.length,
    unanswered,
    wrong,
    critWrong,
    passedScore,
    pass: passedScore && critWrong.length === 0,
    failReason: critWrong.length ? 'diem-liet' : passedScore ? null : 'thieu-diem',
  };
}

// Các câu của bài thi được ghi vào lặp lại ngắt quãng: chỉ câu đã trả lời; bỏ trống không tính là "sai".
export function srsUpdates(exam, answers, questions) {
  const byId = questions instanceof Map ? questions : indexQuestions(questions);
  return exam.ids.filter((id) => answers[id] !== undefined && answers[id] !== null).map((id) => ({ id, correct: answers[id] === byId.get(id).a }));
}

// ---------- lặp lại ngắt quãng (Leitner 6 hộp) ----------
export const DAY = 86400000;
export const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30];
export const MASTERED_BOX = 4;

export function newState() {
  return { b: 0, d: 0, s: 0, c: 0, w: 0, l: -1, t: 0 };
}

// Sai: về hộp 0, đến hạn ngay. Đúng: chỉ lên hộp khi câu đã đến hạn ôn (hoặc mới học lần đầu);
// làm lại đúng trong lúc chưa đến hạn thì chỉ cập nhật thống kê, giữ nguyên hộp và hạn.
export function nextState(prev, correct, now = Date.now()) {
  const p = prev ? { ...prev } : newState();
  const wasDue = !prev || !(prev.s > 0) || prev.d <= now;
  p.s += 1;
  p.t = now;
  if (correct) {
    p.c += 1;
    p.l = 1;
    if (wasDue) {
      p.b = Math.min(INTERVALS_DAYS.length - 1, p.b + 1);
      p.d = now + INTERVALS_DAYS[p.b] * DAY;
    }
  } else {
    p.w += 1;
    p.l = 0;
    p.b = 0;
    p.d = now;
  }
  return p;
}

export function isDue(st, now = Date.now()) {
  return !!st && st.s > 0 && st.d <= now;
}

export function isMastered(st) {
  return !!st && st.b >= MASTERED_BOX && st.l === 1;
}

// Danh sách câu đến hạn ôn trong một tập, sai gần đây và hộp thấp lên trước.
export function dueList(states, ids, now = Date.now()) {
  return ids
    .filter((id) => isDue(states[id], now))
    .sort((a, b) => states[a].b - states[b].b || states[a].d - states[b].d || a - b);
}

// Câu còn "sai": lần trả lời gần nhất sai, hoặc đã từng sai và chưa vững.
export function wrongList(states, ids) {
  return ids
    .filter((id) => {
      const st = states[id];
      return st && st.w > 0 && (st.l === 0 || !isMastered(st));
    })
    .sort((a, b) => (states[b].l === 0) - (states[a].l === 0) || states[b].w - states[a].w || a - b);
}

// ---------- thống kê ----------
export function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function streak(days, now = Date.now()) {
  let n = 0;
  let t = now;
  if (!days[dayKey(t)]) t -= DAY; // hôm nay chưa học vẫn giữ chuỗi nếu hôm qua có học
  while (days[dayKey(t)]) { n++; t -= DAY; }
  return n;
}

export function chapterStats(states, questions) {
  const out = {};
  for (const q of questions) {
    const c = (out[q.ch] ||= { total: 0, seen: 0, mastered: 0, correct: 0, answers: 0 });
    c.total++;
    const st = states[q.id];
    if (st && st.s > 0) {
      c.seen++;
      c.correct += st.c;
      c.answers += st.s;
      if (isMastered(st)) c.mastered++;
    }
  }
  return out;
}

export function daysUntil(dateStr, now = new Date()) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / DAY);
}
