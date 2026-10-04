const test = require('node:test');
const assert = require('node:assert/strict');
const { vocab, topics } = require('./_load.js');
const phrases = require('../data/phrases.js');
const templates = require('../data/templates.js');
const dialogs = require('../data/dialogs.js');
const listening = require('../data/listening.js');
const placement = require('../data/placement.js');

const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const POS = ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'phr', 'phr v', 'idiom'];
// Các ký tự IPA được phép (giọng Mỹ, ký hiệu từ điển)
const IPA_OK = /^\/[abdefhijklmnoprstuvwzæɑɔəɛɜɪʊʌɡŋθðʃʒˈˌ \-().]+\/$/;
const IRREGULAR = new Set(['rise', 'fall', 'grow', 'hire', 'book', 'miss']);

test('có ít nhất 400 từ và cụm từ, 7 chủ đề', () => {
  assert.ok(vocab.length >= 400, 'chỉ có ' + vocab.length);
  assert.equal(topics.length, 7);
  topics.forEach((t) => assert.ok(vocab.filter((w) => w.topic === t.id).length >= 50, t.id));
});

test('id duy nhất, từ không trùng nhau giữa các chủ đề', () => {
  const ids = new Set(), words = new Set();
  vocab.forEach((w) => {
    assert.ok(!ids.has(w.id), 'trùng id ' + w.id); ids.add(w.id);
    const k = w.word.toLowerCase();
    assert.ok(!words.has(k), 'trùng từ ' + w.word); words.add(k);
  });
});

test('mọi từ đủ trường bắt buộc', () => {
  vocab.forEach((w) => {
    ['word', 'pos', 'ipa', 'vi', 'ex', 'level'].forEach((f) => assert.ok(w[f] && w[f].length, w.id + ' thiếu ' + f));
    assert.ok(LEVELS.includes(w.level), w.id + ' mức sai: ' + w.level);
    assert.ok(POS.includes(w.pos), w.id + ' loại từ sai: ' + w.pos);
  });
});

test('IPA có mặt, đúng khuôn dạng /.../, chỉ dùng ký hiệu IPA hợp lệ và có dấu nhấn khi từ nhiều âm tiết', () => {
  vocab.forEach((w) => {
    assert.match(w.ipa, IPA_OK, w.id + ' IPA lạ: ' + w.ipa);
    const vowelGroups = (w.ipa.replace(/[\/ˈˌ\s\-]/g, '').match(/[aeiouæɑɔəɛɜɪʊʌ]+/g) || []).length;
    if (vowelGroups >= 2 && !w.word.includes(' ')) assert.ok(/[ˈˌ]/.test(w.ipa), w.id + ' thiếu dấu nhấn: ' + w.ipa);
    assert.ok(!/ˈ.*ˈ.*ˈ/.test(w.ipa) || w.word.split(/[\s-]+/).length >= 3, w.id + ' nhiều dấu nhấn chính');
  });
});

test('số từ trong IPA khớp số từ của mục (cụm từ)', () => {
  vocab.forEach((w) => {
    const nw = w.word.trim().split(/\s+/).length;
    const ni = w.ipa.slice(1, -1).trim().split(/\s+/).length;
    if (/^[A-Z]{2,}$/i.test(w.word) && w.word === w.word.toUpperCase() || w.word === 'cc' || w.word === 'bcc') return;
    if (/^[A-Za-z]+$/.test(w.word)) assert.equal(ni, 1, w.id + ': từ đơn nhưng IPA nhiều khối');
    else if (!/-/.test(w.word) && !/[A-Z]{2,}/.test(w.word) && !/\s(a|the|to)\s/.test(w.word)) assert.ok(Math.abs(ni - nw) <= 1, w.id + ' ' + w.ipa);
  });
});

test('ví dụ là câu hoàn chỉnh, có chứa từ (hoặc dạng biến đổi) đang học', () => {
  const bad = [];
  vocab.forEach((w) => {
    assert.ok(w.ex.length >= 18, w.id + ' ví dụ quá ngắn');
    assert.match(w.ex, /[.?!"]$/, w.id + ' ví dụ không kết thúc bằng dấu câu');
    assert.match(w.ex, /^[A-Z"]/, w.id + ' ví dụ không viết hoa đầu câu');
    const ex = w.ex.toLowerCase();
    const parts = w.word.toLowerCase().split(/[\s-]+/).filter((p) => !['a', 'the', 'to', 'of', 'in', 'on', 'for', 'as', 'out', 'up', 'off', 'at', 'by', 'it', 'me', 'we', 'you', 'your', 'is', 'do'].includes(p));
    const hit = parts.every((p) => ex.includes(p.length > 5 ? p.slice(0, p.length - 2) : p.length > 3 ? p.slice(0, p.length - 1) : p));
    if (!hit && !IRREGULAR.has(w.word)) bad.push(w.id + ': ' + w.ex);
  });
  // Cho phép một ít ngoại lệ có chủ đích (từ nối, dạng biến đổi bất quy tắc)
  assert.ok(bad.length <= 12, 'Ví dụ không chứa từ:\n' + bad.join('\n'));
});

test('nghĩa tiếng Việt: có chữ Việt, không để lẫn dấu "|" hay thừa khoảng trắng', () => {
  vocab.forEach((w) => {
    assert.ok(w.vi.length >= 2 && w.vi === w.vi.trim(), w.id);
    assert.ok(!/[|]/.test(w.vi + w.ex + w.note), w.id);
    assert.ok(!/  /.test(w.ex), w.id + ' có hai dấu cách liền');
  });
});

test('ví dụ không trùng nhau, phân bố mức độ đủ rộng', () => {
  const seen = new Set();
  vocab.forEach((w) => { assert.ok(!seen.has(w.ex), 'ví dụ trùng ' + w.ex); seen.add(w.ex); });
  LEVELS.forEach((l) => assert.ok(vocab.filter((w) => w.level === l).length >= 40, l + ' quá ít'));
});

test('mẫu câu: đủ trường, nhóm hợp lệ, id duy nhất, có ít nhất 4 nhóm yêu cầu', () => {
  const cats = phrases.cats.map((c) => c.id);
  ['email', 'meeting', 'help', 'decline'].forEach((c) => assert.ok(cats.includes(c)));
  const ids = new Set();
  assert.ok(phrases.phrases.length >= 80, 'chỉ có ' + phrases.phrases.length);
  phrases.phrases.forEach((p) => {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(cats.includes(p.cat)); assert.ok(p.en.length > 5 && p.vi.length > 5, p.id);
    assert.ok(['f', 'n', 'c'].includes(p.reg), p.id + ' mức trang trọng');
  });
  phrases.cats.forEach((c) => assert.ok(phrases.phrases.filter((p) => p.cat === c.id).length >= 10, c.id));
});

test('email mẫu: mọi {khóa} trong tiêu đề/nội dung đều có ô nhập, và ngược lại', () => {
  assert.ok(templates.list.length >= 8);
  const ids = new Set();
  templates.list.forEach((t) => {
    assert.ok(!ids.has(t.id)); ids.add(t.id);
    const used = new Set(((t.subject + t.body).match(/\{(\w+)\}/g) || []).map((s) => s.slice(1, -1)));
    const defined = new Set(t.fields.map((f) => f.k));
    used.forEach((k) => assert.ok(defined.has(k), t.id + ' dùng {' + k + '} nhưng không có ô nhập'));
    defined.forEach((k) => assert.ok(used.has(k), t.id + ' ô nhập ' + k + ' không được dùng'));
    t.fields.forEach((f) => assert.ok(f.label && f.ph && f.def, t.id + '/' + f.k));
  });
});

test('email mẫu: render thay đủ, ô trống giữ [khóa]', () => {
  const t = templates.list[0];
  const v = {}; t.fields.forEach((f) => { v[f.k] = f.def; });
  const r = templates.render(t, v);
  assert.ok(!/[{}]/.test(r.subject + r.body) && !/\[\w+\]/.test(r.subject + r.body));
  assert.ok(r.body.includes('Ms. Lan'));
  const empty = templates.render(t, { to: '   ' });
  assert.ok(empty.body.includes('[to]') && empty.body.includes('[topic]'));
});

test('email mẫu với giá trị mặc định đọc thành câu tiếng Anh trôi chảy (kiểm bằng mắt qua log)', () => {
  templates.list.forEach((t) => {
    const v = {}; t.fields.forEach((f) => { v[f.k] = f.def; });
    const r = templates.render(t, v);
    assert.ok(r.body.length > 150, t.id);
    assert.ok(!/\s{3,}/.test(r.body.replace(/\n/g, ' ')), t.id);
  });
});

test('kịch bản đóng vai: cấu trúc nhánh hợp lệ, không có nút mồ côi, mọi đường đi đều kết thúc', () => {
  assert.ok(dialogs.list.length >= 6);
  dialogs.list.forEach((d) => {
    assert.deepEqual(dialogs.validate(d), []);
    // nút mồ côi
    const reach = new Set([d.start]);
    let grew = true;
    while (grew) {
      grew = false;
      reach.forEach((id) => d.nodes[id].choices.forEach((c) => { if (c.next && !reach.has(c.next)) { reach.add(c.next); grew = true; } }));
    }
    Object.keys(d.nodes).forEach((id) => assert.ok(reach.has(id), d.id + ' nút mồ côi ' + id));
    // không vòng lặp vô hạn: duyệt DFS phát hiện chu trình
    const state = {};
    const dfs = (id) => {
      assert.notEqual(state[id], 1, d.id + ' có vòng lặp tại ' + id);
      if (state[id] === 2) return;
      state[id] = 1;
      d.nodes[id].choices.forEach((c) => { if (c.next) dfs(c.next); });
      state[id] = 2;
    };
    dfs(d.start);
    // có cả đường tốt và đường xấu
    const results = new Set();
    Object.values(d.nodes).forEach((n) => n.choices.forEach((c) => { if (c.end) results.add(c.end.result); }));
    assert.ok(results.has('good') && results.has('bad'), d.id + ' thiếu kết thúc tốt hoặc xấu');
    // mỗi nút có đúng một lựa chọn tốt nhất ở nút có ≥2 lựa chọn
    Object.entries(d.nodes).forEach(([id, n]) => {
      if (n.choices.length > 1) assert.equal(n.choices.filter((c) => c.tone === 'best').length, 1, d.id + '/' + id);
      n.choices.forEach((c) => assert.ok(['best', 'ok', 'poor'].includes(c.tone)));
    });
  });
});

test('bài nghe: đủ câu hỏi, đáp án hợp lệ, giải thích có mặt', () => {
  assert.ok(listening.list.length >= 8);
  const ids = new Set();
  listening.list.forEach((l) => {
    assert.ok(!ids.has(l.id)); ids.add(l.id);
    assert.ok(l.lines.length >= 1 && l.questions.length === 3, l.id);
    assert.ok(LEVELS.includes(l.level));
    l.questions.forEach((q) => {
      assert.equal(q.options.length, 4);
      assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < 4);
      assert.equal(new Set(q.options).size, 4, l.id + ' lựa chọn trùng');
      assert.ok(q.why && q.vi);
    });
  });
});

test('bài kiểm tra trình độ: 20 câu, 5 câu mỗi mức, đáp án hợp lệ', () => {
  assert.equal(placement.questions.length, 20);
  LEVELS.forEach((l) => assert.equal(placement.questions.filter((q) => q.level === l).length, 5));
  const ids = new Set();
  placement.questions.forEach((q) => {
    assert.ok(!ids.has(q.id)); ids.add(q.id);
    assert.equal(q.options.length, 4); assert.equal(new Set(q.options).size, 4);
    assert.ok(q.a >= 0 && q.a < 4 && q.why);
  });
});

test('ước lượng trình độ', () => {
  const all = (fn) => { const a = {}; placement.questions.forEach((q) => { a[q.id] = fn(q); }); return a; };
  assert.equal(placement.estimate(all((q) => q.a)).level, 'C1');
  assert.equal(placement.estimate(all((q) => (q.a + 1) % 4)).level, 'A1');
  assert.equal(placement.estimate(all((q) => (q.level === 'A2' || q.level === 'B1') ? q.a : (q.a + 1) % 4)).level, 'B1');
  assert.equal(placement.estimate(all((q) => q.level === 'A2' ? q.a : (q.a + 1) % 4)).level, 'A2');
  // đúng B2 nhưng sai B1: dừng ở A2 (không "nhảy cóc")
  assert.equal(placement.estimate(all((q) => (q.level === 'A2' || q.level === 'B2') ? q.a : (q.a + 1) % 4)).level, 'A2');
  assert.equal(placement.estimate({}).level, 'A1');
  const r = placement.estimate(all((q) => q.a));
  assert.equal(r.total, 20);
  ['A1', 'A2', 'B1', 'B2', 'C1'].forEach((l) => assert.ok(placement.plans[l] && placement.plans[l].levels.length));
});
