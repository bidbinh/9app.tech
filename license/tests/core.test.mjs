import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, sets } from './helpers.mjs';
import { srsUpdates, mulberry32, shuffle, indexQuestions, buildExam, gradeExam, nextState, newState, isDue, isMastered, dueList, wrongList, streak, dayKey, chapterStats, daysUntil, DAY, INTERVALS_DAYS } from '../js/core.js';
import { HANG_LIST, HANGS, PROFILES, examSpec, scaleGroups, defaultProfile } from '../js/rules.js';

const byId = indexQuestions(questions);

test('shuffle: giữ nguyên tập phần tử, lặp lại được theo hạt giống, không sửa mảng gốc', () => {
  const a = Array.from({ length: 50 }, (_, i) => i);
  const copy = a.slice();
  const s1 = shuffle(a, mulberry32(7));
  const s2 = shuffle(a, mulberry32(7));
  const s3 = shuffle(a, mulberry32(8));
  assert.deepEqual(a, copy);
  assert.deepEqual(s1, s2);
  assert.notDeepEqual(s1, s3);
  assert.deepEqual(s1.slice().sort((x, y) => x - y), a);
  assert.notDeepEqual(s1, a);
});

test('shuffle: phân bố vị trí xấp xỉ đều (kiểm tra thô)', () => {
  const rng = mulberry32(123);
  const cnt = [0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) cnt[shuffle([0, 1, 2, 3], rng).indexOf(0)]++;
  for (const c of cnt) assert.ok(c > 850 && c < 1150, 'lệch: ' + cnt);
});

test('cấu trúc đề hiện hành đúng số câu, thời gian, điểm đạt của từng hạng (Thông tư 12/2025/TT-BCA)', () => {
  const exp = { A1: [25, 19, 21], A: [25, 19, 23], B1: [25, 19, 23], B: [30, 20, 27], C1: [35, 22, 32], C: [40, 24, 36], D1: [45, 26, 41], D2: [45, 26, 41], D: [45, 26, 41] };
  for (const h of HANG_LIST) {
    const s = examSpec('hien-hanh', h);
    assert.deepEqual([s.n, s.min, s.pass], exp[h], h);
    assert.equal(Object.values(s.groups).reduce((x, y) => x + y, 0), s.n, 'tổng nhóm ' + h);
    assert.equal(s.groups.crit, 1);
  }
});

test('cấu trúc đề mới từ 01/3/2027 (Thông tư 108/2026/TT-BCA)', () => {
  const exp = { A1: [40, 27, 36], A: [40, 27, 36], B: [50, 33, 45], C1: [60, 40, 54], C: [70, 47, 63], D: [80, 53, 72] };
  for (const [h, v] of Object.entries(exp)) {
    const s = examSpec('moi', h);
    assert.deepEqual([s.n, s.min, s.pass], v, h);
    assert.equal(Object.values(s.groups).reduce((x, y) => x + y, 0), s.n);
    assert.equal(s.groups.crit, 1);
  }
});

test('scaleGroups luôn cộng đủ n và giữ 1 câu điểm liệt', () => {
  for (const n of [25, 30, 40, 50, 60, 70, 80, 90]) {
    const g = scaleGroups(PROFILES['hien-hanh'].exams.B.groups, n);
    assert.equal(Object.values(g).reduce((x, y) => x + y, 0), n);
    assert.equal(g.crit, 1);
    for (const v of Object.values(g)) assert.ok(v >= 1);
  }
});

test('defaultProfile đổi đúng ngày 01/3/2027', () => {
  assert.equal(defaultProfile(new Date(2026, 9, 4)), 'hien-hanh');
  assert.equal(defaultProfile(new Date(2027, 1, 28)), 'hien-hanh');
  assert.equal(defaultProfile(new Date(2027, 2, 1)), 'moi');
});

test('buildExam: mọi hạng, cả hai quy định, đúng cơ cấu theo chương, không trùng, đúng 1 câu điểm liệt, đúng tập của hạng', () => {
  const rng = mulberry32(2026);
  for (const profile of ['hien-hanh', 'moi']) {
    for (const h of HANG_LIST) {
      for (let k = 0; k < 15; k++) {
        const e = buildExam({ hang: h, profile, questions, sets, rng });
        const spec = examSpec(profile, h);
        assert.equal(e.ids.length, spec.n);
        assert.equal(new Set(e.ids).size, spec.n, 'trùng câu');
        assert.equal(e.passMark, spec.pass);
        assert.equal(e.minutes, spec.min);
        const pool = new Set(sets[HANGS[h].pool].pool);
        assert.ok(e.ids.every((id) => pool.has(id)), 'câu ngoài tập hạng ' + h);
        const crit = e.ids.filter((id) => sets[HANGS[h].pool].crit.includes(id));
        assert.equal(crit.length, 1, `hạng ${h}: số câu điểm liệt`);
        assert.ok(sets[HANGS[h].pool].crit.includes(crit[0]));
        const cnt = {};
        for (const id of e.ids) if (!sets[HANGS[h].pool].crit.includes(id)) cnt[byId.get(id).ch] = (cnt[byId.get(id).ch] || 0) + 1;
        const g = spec.groups;
        if (HANGS[h].loai === 'xemay') {
          assert.equal(cnt[1], g.rules);
          assert.equal(cnt[5], g.signs);
          assert.equal(cnt[6], g.sahinh);
          assert.equal(cnt[2], g.culture);
          assert.equal((cnt[3] || 0) + (cnt[4] || 0), g.tech);
        } else {
          assert.equal(cnt[1] || 0, g.rules);
          assert.equal(cnt[2] || 0, g.culture);
          assert.equal(cnt[3] || 0, g.tech);
          assert.equal(cnt[4] || 0, g.build);
          assert.equal(cnt[5] || 0, g.signs);
          assert.equal(cnt[6] || 0, g.sahinh);
        }
      }
    }
  }
});

test('buildExam không làm thay đổi dữ liệu câu hỏi (không đảo thứ tự đáp án)', () => {
  const before = JSON.stringify(questions);
  for (let i = 0; i < 10; i++) buildExam({ hang: 'B', profile: 'hien-hanh', questions, sets });
  assert.equal(JSON.stringify(questions), before);
});

test('tập câu theo hạng: A1/A 250 câu (20 điểm liệt), B1 300 câu (30 điểm liệt), B trở lên 600 câu (60 điểm liệt)', () => {
  assert.equal(sets.A.pool.length, 250);
  assert.equal(sets.B1.pool.length, 300);
  assert.equal(sets.all.pool.length, 600);
  assert.equal(sets.A.crit.length, 20);
  assert.equal(sets.B1.crit.length, 30);
  assert.equal(sets.all.crit.length, 60);
});

test('buildExam báo lỗi khi bộ câu hỏi không đủ cho cơ cấu', () => {
  const small = questions.filter((q) => q.id <= 30);
  const smallSets = { A: { pool: small.map((q) => q.id), crit: [] }, B1: { pool: [], crit: [] }, all: { pool: small.map((q) => q.id), crit: [] } };
  assert.throws(() => buildExam({ hang: 'B', profile: 'hien-hanh', questions: small, sets: smallSets }));
});

function mkExam(ids, passMark) { return { ids, passMark, hang: 'B', profile: 'hien-hanh', critIds: ids.filter((id) => byId.get(id).crit) }; }
const nonCrit = questions.filter((q) => !q.crit).slice(0, 40).map((q) => q.id);
const aCrit = questions.find((q) => q.crit);
const wrongOf = (q) => (q.a + 1) % q.opts.length;

test('chấm điểm: đạt khi đủ điểm và không sai điểm liệt', () => {
  const ids = nonCrit.slice(0, 10);
  const ex = mkExam(ids, 9);
  const ans = {};
  ids.forEach((id) => (ans[id] = byId.get(id).a));
  assert.equal(gradeExam(ex, ans, byId).pass, true);
  assert.equal(gradeExam(ex, ans, byId).correct, 10);
});

test('chấm điểm: ranh giới đúng bằng điểm đạt là đạt, thiếu 1 là trượt', () => {
  const ids = nonCrit.slice(0, 10);
  const ex = mkExam(ids, 9);
  const ans = {};
  ids.forEach((id) => (ans[id] = byId.get(id).a));
  ans[ids[0]] = wrongOf(byId.get(ids[0]));
  let r = gradeExam(ex, ans, byId);
  assert.equal(r.correct, 9);
  assert.equal(r.pass, true);
  ans[ids[1]] = wrongOf(byId.get(ids[1]));
  r = gradeExam(ex, ans, byId);
  assert.equal(r.correct, 8);
  assert.equal(r.pass, false);
  assert.equal(r.failReason, 'thieu-diem');
});

test('chấm điểm: sai câu điểm liệt là trượt dù đủ điểm', () => {
  const ids = [aCrit.id, ...nonCrit.slice(0, 9)];
  const ex = mkExam(ids, 5);
  const ans = {};
  ids.forEach((id) => (ans[id] = byId.get(id).a));
  assert.equal(gradeExam(ex, ans, byId).pass, true);
  ans[aCrit.id] = wrongOf(aCrit);
  const r = gradeExam(ex, ans, byId);
  assert.equal(r.correct, 9);
  assert.ok(r.correct >= 5);
  assert.equal(r.pass, false);
  assert.deepEqual(r.critWrong, [aCrit.id]);
  assert.equal(r.failReason, 'diem-liet');
});

test('chấm điểm: bỏ trống câu điểm liệt cũng là trượt; bỏ trống tính là sai', () => {
  const ids = [aCrit.id, ...nonCrit.slice(0, 9)];
  const ex = mkExam(ids, 5);
  const ans = {};
  ids.slice(1).forEach((id) => (ans[id] = byId.get(id).a));
  const r = gradeExam(ex, ans, byId);
  assert.equal(r.unanswered, 1);
  assert.equal(r.pass, false);
  assert.equal(r.failReason, 'diem-liet');
});

test('chấm điểm: đề dựng từ buildExam, toàn đúng thì đạt, toàn sai thì trượt', () => {
  for (const h of ['A1', 'B1', 'B', 'D']) {
    const e = buildExam({ hang: h, profile: 'hien-hanh', questions, sets, rng: mulberry32(5) });
    const good = {};
    const bad = {};
    for (const id of e.ids) { good[id] = byId.get(id).a; bad[id] = wrongOf(byId.get(id)); }
    assert.equal(gradeExam(e, good, byId).pass, true);
    assert.equal(gradeExam(e, good, byId).correct, e.total);
    assert.equal(gradeExam(e, bad, byId).pass, false);
  }
});

test('lặp lại ngắt quãng: đúng lên hộp và hẹn theo khoảng ngày, sai về hộp 0 và đến hạn ngay', () => {
  const t0 = 1_000_000_000_000;
  let s = nextState(null, true, t0);
  assert.equal(s.b, 1);
  assert.equal(s.d, t0 + INTERVALS_DAYS[1] * DAY);
  s = nextState(s, true, t0 + DAY);
  assert.equal(s.b, 2);
  assert.equal(s.d, t0 + DAY + 3 * DAY);
  let tt = t0 + DAY;
  for (let i = 0; i < 10; i++) { tt = s.d; s = nextState(s, true, tt); }
  assert.equal(s.b, INTERVALS_DAYS.length - 1, 'không vượt hộp cuối');
  assert.ok(isMastered(s));
  s = nextState(s, false, t0 + 50 * DAY);
  assert.equal(s.b, 0);
  assert.equal(s.d, t0 + 50 * DAY);
  assert.equal(s.l, 0);
  assert.ok(!isMastered(s));
  assert.equal(s.w, 1);
});

test('lặp lại ngắt quãng: không sửa trạng thái cũ, chưa học thì không "đến hạn"', () => {
  const a = newState();
  const b = nextState(a, true, 5);
  assert.equal(a.s, 0);
  assert.equal(b.s, 1);
  assert.equal(isDue(undefined), false);
  assert.equal(isDue(a), false);
});

test('dueList chỉ lấy câu đã học và đã đến hạn, hộp thấp trước', () => {
  const now = 10 * DAY;
  const states = {
    1: { ...newState(), s: 1, b: 3, d: now - 1, l: 1 },
    2: { ...newState(), s: 1, b: 0, d: now - 5, l: 0, w: 1 },
    3: { ...newState(), s: 1, b: 2, d: now + DAY, l: 1 },
    4: newState(),
  };
  assert.deepEqual(dueList(states, [1, 2, 3, 4, 5], now), [2, 1]);
});

test('wrongList: câu sai gần nhất lên đầu, câu đã vững thì bỏ', () => {
  const states = {
    1: { ...newState(), s: 3, w: 1, b: 5, l: 1 },
    2: { ...newState(), s: 2, w: 2, b: 0, l: 0 },
    3: { ...newState(), s: 4, w: 1, b: 2, l: 1 },
    4: { ...newState(), s: 1, w: 0, b: 1, l: 1 },
  };
  assert.deepEqual(wrongList(states, [1, 2, 3, 4]), [2, 3]);
});

test('chuỗi ngày học và đếm ngược ngày thi', () => {
  const now = new Date(2026, 9, 4, 10).getTime();
  const days = { [dayKey(now)]: 5, [dayKey(now - DAY)]: 3, [dayKey(now - 2 * DAY)]: 1, [dayKey(now - 4 * DAY)]: 9 };
  assert.equal(streak(days, now), 3);
  const days2 = { [dayKey(now - DAY)]: 3 };
  assert.equal(streak(days2, now), 1, 'hôm nay chưa học vẫn giữ chuỗi của hôm qua');
  assert.equal(streak({}, now), 0);
  assert.equal(daysUntil('2026-10-14', new Date(2026, 9, 4, 23, 59)), 10);
  assert.equal(daysUntil('2026-10-04', new Date(2026, 9, 4, 1)), 0);
  assert.equal(daysUntil('2026-10-01', new Date(2026, 9, 4)), -3);
});

test('thống kê theo chương', () => {
  const states = { 1: { ...newState(), s: 2, c: 2, b: 5, l: 1 }, 2: { ...newState(), s: 1, w: 1, l: 0 } };
  const cs = chapterStats(states, questions);
  assert.equal(cs[1].total, 180);
  assert.equal(cs[1].seen, 2);
  assert.equal(cs[1].mastered, 1);
  assert.equal(cs[5].total, 185);
});

test('điểm liệt tính theo hạng: câu chung là điểm liệt nhưng không thuộc 20 câu của A1 thì sai không bị trượt vì điểm liệt', () => {
  const onlyB = sets.all.crit.filter((id) => !sets.A.crit.includes(id) && sets.A.pool.includes(id));
  assert.ok(onlyB.length > 0, 'cần có câu như vậy trong dữ liệu');
  for (let i = 0; i < 40; i++) {
    const e = buildExam({ hang: 'A1', profile: 'hien-hanh', questions, sets, rng: mulberry32(i) });
    assert.ok(e.critIds.length === 1 && sets.A.crit.includes(e.critIds[0]));
  }
  const ids = [onlyB[0], ...nonCrit.slice(0, 9)];
  const ex = { ids, passMark: 5, hang: 'A1', profile: 'hien-hanh', critIds: [] };
  const ans = {};
  ids.forEach((id) => (ans[id] = byId.get(id).a));
  ans[onlyB[0]] = wrongOf(byId.get(onlyB[0]));
  const r = gradeExam(ex, ans, byId);
  assert.equal(r.critWrong.length, 0);
  assert.equal(r.pass, true);
});

test('lặp lại ngắt quãng: làm đúng nhiều lần cùng ngày không tăng hộp (chỉ tăng khi đến hạn)', () => {
  const t0 = 5_000_000_000_000;
  let s = nextState(null, true, t0);
  assert.equal(s.b, 1);
  const due = s.d;
  for (let i = 1; i <= 5; i++) s = nextState(s, true, t0 + i * 1000);
  assert.equal(s.b, 1, 'chưa đến hạn thì giữ hộp');
  assert.equal(s.d, due, 'giữ nguyên hạn');
  assert.equal(s.s, 6);
  assert.equal(s.c, 6);
  assert.ok(!isMastered(s));
  s = nextState(s, true, due + 1);
  assert.equal(s.b, 2, 'đến hạn thì lên hộp');
  // làm sai khi chưa đến hạn vẫn về hộp 0
  const w = nextState(s, false, due + 2);
  assert.equal(w.b, 0);
});

test('thi thử: câu bỏ trống không được ghi vào lặp lại ngắt quãng, câu đã trả lời được ghi đúng/sai', () => {
  const ids = nonCrit.slice(0, 5);
  const ex = mkExam(ids, 3);
  const ans = { [ids[0]]: byId.get(ids[0]).a, [ids[1]]: wrongOf(byId.get(ids[1])) };
  const up = srsUpdates(ex, ans, byId);
  assert.deepEqual(up, [{ id: ids[0], correct: true }, { id: ids[1], correct: false }]);
  assert.equal(srsUpdates(ex, {}, byId).length, 0);
});
