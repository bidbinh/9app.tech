const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const route = require('../js/route.js');
const dialogs = require('../data/dialogs.js');
const listening = require('../data/listening.js');
const placement = require('../data/placement.js');
const streak = require('../js/streak.js');
const { vocab } = require('./_load.js');
const templates = require('../data/templates.js');
const root = path.join(__dirname, '..');

test('route: hash bình thường', () => {
  assert.deepEqual(route.parseHash('#/learn/s/email'), { section: 'learn', parts: ['s', 'email'], query: {} });
  assert.equal(route.parseHash('').section, 'home');
  assert.equal(route.parseHash('#/').section, 'home');
});
test('route: mã hóa sai ("%") không làm vỡ', () => {
  assert.equal(route.parseHash('#/%').section, '%');
  assert.deepEqual(route.parseHash('#/learn?x=%'), { section: 'learn', parts: [], query: { x: '%' } });
  assert.deepEqual(route.parseHash('#/talk/c/%E0%A4%A').parts, ['c', '%E0%A4%A']);
  assert.deepEqual(route.parseHash('#/learn/s/caf%C3%A9').parts, ['s', 'café']);
});

test('placement: p5 chỉ còn một đáp án đúng (tell)', () => {
  const q = placement.questions.find((x) => x.id === 'p5');
  assert.ok(/where the meeting room is/.test(q.q));
  assert.equal(q.options[q.a], 'tell');
});
test('placement: đáp án đúng phân bố đều, không dồn một vị trí', () => {
  const c = [0, 0, 0, 0]; placement.questions.forEach((q) => c[q.a]++);
  assert.ok(Math.max(...c) <= 12, c.join());
});

// Duyệt mọi đường đi của mọi kịch bản
function paths(d) {
  const out = [];
  (function walk(id, acc) {
    d.nodes[id].choices.forEach((c) => {
      const next = acc.concat(c.tone);
      if (c.end) out.push({ path: next, end: c.end.result }); else walk(c.next, next);
    });
  })(d.start, []);
  return out;
}
test('đóng vai: kết quả tính từ cả đường đi trên mọi nhánh', () => {
  dialogs.list.forEach((d) => {
    const ps = paths(d);
    assert.ok(ps.length >= 3, d.id);
    ps.forEach(({ path: p }) => {
      const g = dialogs.grade(p), poor = p.filter((t) => t === 'poor').length, best = p.filter((t) => t === 'best').length;
      if (poor >= 2) assert.equal(g, 'bad', d.id + ' ' + p);
      if (poor >= 1) assert.notEqual(g, 'good', d.id + ' ' + p);
      if (poor === 0 && best / p.length >= 2 / 3) assert.equal(g, 'good', d.id + ' ' + p);
    });
    assert.ok(ps.some((x) => x.path.every((t) => t === 'best') && dialogs.grade(x.path) === 'good'), d.id + ' phải có đường toàn tốt');
    assert.ok(ps.some((x) => dialogs.grade(x.path) === 'bad'), d.id + ' phải có đường xấu');
  });
});
test('đóng vai: grade ví dụ', () => {
  assert.equal(dialogs.grade(['best', 'best', 'ok']), 'good');
  assert.equal(dialogs.grade(['ok', 'ok', 'best']), 'ok');
  assert.equal(dialogs.grade(['poor', 'best', 'best']), 'ok');   // từng chọn poor -> không quá "ok"
  assert.equal(dialogs.grade(['poor', 'ok', 'best']), 'bad');
  assert.equal(dialogs.grade(['poor', 'best', 'poor']), 'bad');
  assert.equal(dialogs.grade([]), 'bad');
});
test('đóng vai: đường đầu "best" rồi chọn poor ở lượt cuối không còn "good"', () => {
  const d = dialogs.list.find((x) => x.id === 'extension');
  const bad = paths(d).filter((x) => x.end === 'bad' && x.path.slice(0, -1).every((t) => t === 'best'));
  assert.ok(bad.length >= 1);
  bad.forEach((x) => assert.notEqual(dialogs.grade(x.path), 'good'));
});

test('ICS: tiêu đề và mô tả theo số phút mục tiêu', () => {
  [5, 15, 20].forEach((m) => {
    const ics = streak.buildIcs({ time: '08:00', minutes: m });
    assert.ok(ics.includes('SUMMARY:Học tiếng Anh ' + m + ' phút'), m);
    assert.ok(ics.includes('Mỗi ngày ' + m + ' phút') && ics.includes('DURATION:PT' + m + 'M'));
    assert.ok(!/ 10 phút/.test(ics));
  });
  assert.ok(streak.buildIcs({ time: '08:00' }).includes('Học tiếng Anh 10 phút'));
});

test('bài nghe: đáp án đúng không thường xuyên là lựa chọn dài nhất', () => {
  let n = 0, t = 0;
  listening.list.forEach((l) => l.questions.forEach((q) => {
    t++; const len = q.options.map((o) => o.length);
    if (len[q.a] > Math.max(...len.filter((_, i) => i !== q.a))) n++;
  }));
  assert.ok(n / t <= 0.4, n + '/' + t);
});
test('bài nghe office-move: câu hỏi về ngày chuyển rõ ràng', () => {
  const l = listening.list.find((x) => x.id === 'office-move');
  assert.ok(/date/.test(l.questions[0].q));
  assert.equal(l.questions[0].options[l.questions[0].a], 'March 1');
});

test('chính tả Anh-Mỹ nhất quán trong dữ liệu', () => {
  const files = fs.readdirSync(path.join(root, 'data')).map((f) => fs.readFileSync(path.join(root, 'data', f), 'utf8')).join('\n');
  // Bỏ phần ghi chú tiếng Việt nói về Anh-Anh (có chữ "Anh-Anh")
  const en = files.split('\n').filter((l) => !/Anh-Anh|Yours sincerely|return ticket/.test(l)).join('\n');
  assert.ok(!/\b(travelling|autumn|colour|organis|programme|favour|centre|behaviour|on holiday|licence)\w*/i.test(en), en.match(/\b(travelling|autumn|colour|organis|programme|favour|centre|behaviour|on holiday|licence)\w*/i));
  // ngày tháng kiểu Mỹ: không còn "12 May", "5 June"
  assert.ok(!/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(en));
  assert.ok(!/\bthe first of March|twenty-seventh of February/.test(en));
});
test('vocab: ví dụ time zone tự nhiên', () => {
  const w = vocab.find((x) => x.word === 'time zone');
  assert.ok(!/behind Vietnam/.test(w.ex));
});

test('mẫu email: ví dụ mặc định dùng ngày kiểu Mỹ', () => {
  templates.list.forEach((t) => t.fields.forEach((f) => assert.ok(!/\b\d{1,2} (May|June|August)\b/.test(f.def), t.id + ' ' + f.def)));
});

test('mã nguồn: không dùng lookbehind (Safari cũ) và không lẫn ký tự điều khiển', () => {
  fs.readdirSync(path.join(root, 'js')).forEach((f) => {
    const s = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    assert.ok(!/\(\?<[=!]/.test(s), f + ' có lookbehind');
    assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s), f + ' có ký tự điều khiển');
  });
});

// store.js cần self/localStorage giả
test('store.merge: dữ liệu hỏng rơi về mặc định', () => {
  const mem = {};
  global.self = global; global.window = global;
  global.localStorage = { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  global.addEventListener = () => {}; global.document = { visibilityState: 'visible' };
  global.E9 = { sm2: require('../js/sm2.js') };
  delete require.cache[require.resolve('../js/store.js')];
  require('../js/store.js');
  const S = global.E9.store;
  const D = S.defaults, M = S.merge;
  assert.deepEqual(M(D(), null), D());
  assert.deepEqual(M(D(), []).cards, {});
  const bad = M(D(), { cards: null, settings: [], secByDay: 'x', daily: 5, listen: [], placement: 7, roles: null });
  assert.deepEqual([bad.cards, bad.secByDay, bad.daily, bad.listen, bad.placement, bad.roles], [{}, {}, {}, {}, null, {}]);
  assert.equal(bad.settings.dailyMin, 10);
  const mixed = M(D(), { cards: { a: { ef: 2.5, interval: 3, reps: 2, due: 5 }, b: null, c: { ef: 'x' }, d: [] }, settings: { levels: 'B1', theme: 'neon', dailyMin: -3, rate: 'fast', accent: 'fr-FR', remindTime: '7pm' } });
  assert.deepEqual(Object.keys(mixed.cards), ['a']);
  assert.deepEqual([mixed.settings.levels, mixed.settings.theme, mixed.settings.dailyMin, mixed.settings.rate, mixed.settings.accent, mixed.settings.remindTime], [[], 'auto', 10, 0.95, 'en-US', '19:30']);
  const good = M(D(), { settings: { levels: ['B1', 'Z9'], dailyMin: 15 }, created: 20000 });
  assert.deepEqual(good.settings.levels, ['B1']); assert.equal(good.settings.dailyMin, 15); assert.equal(good.created, 20000);
  // load() với JSON hỏng trong localStorage
  mem[S.KEY] = '{"cards": null, "settings": 5}';
  assert.deepEqual(S.load().cards, {});
  mem[S.KEY] = 'không phải json';
  assert.equal(S.load().settings.dailyMin, 10);
});
