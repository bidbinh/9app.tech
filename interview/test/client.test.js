import test from 'node:test';
import assert from 'node:assert/strict';
import { countFillers, countWords, pacePerMin, paceLabel, durationLabel, analyzeAnswer, quickCheck, fmtTime } from '../public/js/analysis.js';
import { QUESTIONS, GROUPS, TYPES, questionsFor, pickSession } from '../public/js/data/index.js';
import { CHECKLIST, ASK_BACK, SALARY, SALARY_SCRIPTS, LETTER_TEMPLATES, LETTER_FIELDS, fillLetter } from '../public/js/data/guides.js';
import { renderCv, bullets, skillList, period, cvChecks, cvIsEmpty, esc, CV_TEMPLATES } from '../public/js/cv.js';
import { emptyCv, normalize } from '../public/js/store.js';
import { filterQuestions } from '../public/js/views/bank.js';

/* ---------- Từ độn ---------- */
test('đếm từ độn: từ đơn, cụm, không phân biệt hoa thường và dấu câu', () => {
  const f = countFillers('Ờ, em nghĩ là... à, kiểu như là em làm hành chính. Ừm thì là em rất thích. KIỂU NHƯ vậy.');
  assert.equal(f.byWord['ờ'], 1);
  assert.equal(f.byWord['à'], 1);
  assert.equal(f.byWord['kiểu như là'], 1);
  assert.equal(f.byWord['ừm'], 1);
  assert.equal(f.byWord['thì là'], 1);
  assert.equal(f.byWord['kiểu như'], 1);
  assert.equal(f.total, 6);
});
test('đếm từ độn: cụm dài nhất được ưu tiên, không đếm đôi', () => {
  const f = countFillers('kiểu như là kiểu như là');
  assert.equal(f.total, 2); assert.deepEqual(f.byWord, { 'kiểu như là': 2 });
});
test('đếm từ độn: không đếm nhầm từ có chứa "à", "ờ" như một phần của từ khác', () => {
  const f = countFillers('Tôi đã làm việc ở công ty, thà chậm còn hơn sai, bà và mờ');
  assert.equal(f.total, 0);
});
test('đếm từ độn: đầu vào rỗng hoặc lạ', () => {
  assert.equal(countFillers('').total, 0);
  assert.equal(countFillers(null).total, 0);
  assert.equal(countFillers(undefined).total, 0);
  assert.equal(countFillers('   ...  ').total, 0);
  assert.equal(countWords('  Xin   chào,  các bạn! '), 4);
  assert.equal(countWords(''), 0);
});
test('đếm từ độn: chuỗi Unicode dạng tổ hợp (NFD) vẫn nhận ra', () => {
  assert.equal(countFillers('ờ em nghĩ'.normalize('NFD')).total, 1, 'ờ viết kiểu tổ hợp');
  assert.equal(countFillers('Ừm vâng'.normalize('NFD')).total, 1);
});

/* ---------- Tốc độ, thời lượng ---------- */
test('tốc độ nói và nhãn', () => {
  assert.equal(pacePerMin(150, 60), 150);
  assert.equal(pacePerMin(75, 30), 150);
  assert.equal(pacePerMin(10, 3), null, 'quá ngắn không đo');
  assert.equal(pacePerMin(0, 60), null);
  assert.equal(paceLabel(null), null);
  assert.equal(paceLabel(80).level, 'cham'); assert.equal(paceLabel(150).level, 'vua'); assert.equal(paceLabel(260).level, 'nhanh');
  assert.equal(durationLabel(10).level, 'ngan'); assert.equal(durationLabel(90).level, 'vua'); assert.equal(durationLabel(200).level, 'dai');
  assert.equal(fmtTime(75), '1:15'); assert.equal(fmtTime(-3), '0:00'); assert.equal(fmtTime(NaN), '0:00');
});
test('analyzeAnswer: gõ chữ thì không có tốc độ, nói thì có', () => {
  const text = 'ờ em đã làm ba năm ở công ty ABC '.repeat(10);
  const typed = analyzeAnswer({ text, spoken: false });
  assert.equal(typed.pace, null); assert.equal(typed.durationLabel, null);
  assert.equal(typed.fillers, 10);
  const said = analyzeAnswer({ text, durationSec: 60, spoken: true });
  assert.equal(said.pace, said.words); assert.ok(said.durationLabel);
  assert.ok(said.fillerPer100 > 0);
});
test('quickCheck: nhắc thiếu số liệu và thiếu phần STAR', () => {
  const weak = quickCheck('Em thấy mình là người chăm chỉ và có trách nhiệm trong công việc hằng ngày của công ty cũ nên em nghĩ mình hợp.'.repeat(2), { star: true });
  assert.equal(weak.numbers, false);
  assert.ok(weak.tips.some((t) => /số liệu|con số/.test(t)));
  assert.ok(weak.tips.some((t) => /Kết quả/.test(t)));
  const strong = quickCheck('Có lần tại công ty ABC em được giao phụ trách đối chiếu 120 hồ sơ. Em đã lập bảng theo dõi chung và em liên hệ từng phòng. Kết quả là thời gian giảm từ 3 ngày xuống 1 ngày, nhờ đó cả phòng tìm hồ sơ nhanh hơn rất nhiều so với trước đây.', { star: true });
  assert.deepEqual(strong.star, { situation: true, task: true, action: true, result: true });
  assert.equal(strong.numbers, true);
  assert.equal(quickCheck('', { star: false }).words, 0);
});

/* ---------- Dữ liệu câu hỏi ---------- */
test('ngân hàng câu hỏi: đủ số lượng, id duy nhất, trường bắt buộc', () => {
  assert.ok(QUESTIONS.length >= 80, `chỉ có ${QUESTIONS.length} câu`);
  const ids = new Set();
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), `trùng id ${q.id}`); ids.add(q.id);
    assert.ok(GROUPS.some((g) => g.id === q.g), `nhóm lạ ${q.id}`);
    assert.ok(TYPES[q.t], `dạng lạ ${q.id}: ${q.t}`);
    assert.ok(q.q.length >= 15 && /[?.]$/.test(q.q), `câu hỏi ${q.id}`);
    assert.ok(q.intent.length >= 30, `ý đồ ${q.id}`);
    assert.ok(Array.isArray(q.tips) && q.tips.length >= 2 && q.tips.every((t) => t.length > 10), `gợi ý ${q.id}`);
    assert.ok(q.sample.length >= 120, `mẫu ${q.id} quá ngắn`);
    assert.ok(q.sample.length <= 1200, `mẫu ${q.id} quá dài`);
  }
  assert.equal(new Set(QUESTIONS.map((q) => q.q)).size, QUESTIONS.length, 'câu hỏi trùng nội dung');
});
test('ngân hàng câu hỏi: mỗi nhóm nghề có đủ câu và có đủ các dạng bắt buộc ở nhóm chung', () => {
  for (const g of GROUPS) assert.ok(questionsFor(g.id).length >= (g.id === 'chung' ? 30 : 9), `nhóm ${g.id}`);
  const chung = questionsFor('chung');
  assert.ok(chung.some((q) => q.t === 'hanhvi' && q.star), 'có câu STAR');
  assert.ok(chung.some((q) => /điểm yếu/i.test(q.q)), 'có câu điểm yếu');
  assert.ok(chung.some((q) => q.t === 'luong' && /lương/i.test(q.q)), 'có câu hỏi lương');
  assert.ok(chung.filter((q) => q.t === 'hanhvi').length >= 8);
  for (const g of GROUPS.filter((x) => x.id !== 'chung')) assert.ok(questionsFor(g.id).some((q) => q.star), `nhóm ${g.id} có câu STAR`);
  assert.ok(QUESTIONS.filter((q) => q.star).every((q) => q.t === 'hanhvi'), 'star chỉ ở dạng hành vi');
});
test('ngân hàng câu hỏi: không có số liệu lương/thị trường', () => {
  const blob = JSON.stringify([QUESTIONS, SALARY, SALARY_SCRIPTS]);
  assert.ok(!/\d[\d.,]*\s*(triệu|tr\b|vnđ|vnd|đồng|usd|\$|k\/)/i.test(blob), 'không được có con số lương cụ thể');
  assert.ok(!/(trung bình|mặt bằng)\s+(lương|thu nhập)[^.]*\d/i.test(blob));
});
test('lọc và tìm kiếm câu hỏi (cả khi gõ không dấu hoa thường)', () => {
  assert.equal(filterQuestions({ group: 'all', type: 'all', q: '' }).length, QUESTIONS.length);
  const ke = filterQuestions({ group: 'ketoan', type: 'all', q: '' });
  assert.ok(ke.length >= 9 && ke.every((q) => q.g === 'ketoan'));
  assert.ok(filterQuestions({ group: 'all', type: 'all', q: 'ĐIỂM YẾU' }).length >= 1);
  assert.equal(filterQuestions({ group: 'all', type: 'all', q: 'zzzzkhongco' }).length, 0);
  assert.ok(filterQuestions({ group: 'all', type: 'luong', q: '' }).every((q) => q.t === 'luong'));
});
test('pickSession: đúng số lượng, không trùng, có hạt giống ngẫu nhiên xác định', () => {
  let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const a = pickSession('it', 5, rnd);
  assert.equal(a.length, 5); assert.equal(new Set(a.map((q) => q.id)).size, 5);
  assert.ok(a.every((q) => q.g === 'it' || q.g === 'chung'));
  assert.equal(pickSession('chung', 500).length, questionsFor('chung').length);
  assert.equal(pickSession('khong-co', 3).length, 3);
});

/* ---------- Hướng dẫn và thư ---------- */
test('hướng dẫn: checklist, hỏi lại, lương có nội dung', () => {
  assert.ok(CHECKLIST.length >= 4 && CHECKLIST.every((g) => g.items.length >= 4));
  assert.ok(ASK_BACK.length >= 4); assert.ok(SALARY.length >= 3); assert.ok(SALARY_SCRIPTS.length >= 3);
  const ids = CHECKLIST.map((g) => g.id); assert.equal(new Set(ids).size, ids.length);
});
test('thư xin việc: điền trường, giữ chỗ cho ô trống, không chèn mã', () => {
  assert.ok(LETTER_TEMPLATES.length >= 3);
  for (const t of LETTER_TEMPLATES) {
    for (const m of t.body.matchAll(/\{\{(\w+)\}\}/g)) assert.ok(LETTER_FIELDS.some((f) => f.k === m[1]), `${t.id} dùng trường lạ ${m[1]}`);
  }
  const out = fillLetter(LETTER_TEMPLATES[0].body, { hoTen: 'Lan', congTy: 'ABC <b>x</b>' });
  assert.match(out, /Lan/); assert.match(out, /ABC <b>x<\/b>/);
  assert.match(out, /\[vị trí ứng tuyển\]/, 'ô trống hiện nhãn dễ đọc');
  assert.ok(!out.includes('{{'));
  assert.ok(!fillLetter('{{__proto__}} {{constructor}}', { }).includes('function'));
});

/* ---------- CV ---------- */
const sample = () => ({
  ...emptyCv(), hoTen: 'Nguyễn <img src=x onerror=alert(1)> Lan', chucDanh: 'Chuyên viên', email: 'a@b.vn', sdt: '0901', tomTat: 'Tóm tắt\ndòng hai',
  kinhNghiem: [{ congTy: 'ABC & Co', chucVu: 'Nhân viên', tu: '01/2020', den: '', mota: '- Làm một\n• Làm hai\n\nLàm ba' }],
  hocVan: [{ truong: 'ĐH Kinh tế', nganh: 'Kế toán', tu: '2016', den: '2020', ghiChu: '' }], kyNang: 'Excel, Giao tiếp; Tiếng Anh', chungChi: 'TOEIC 700\nIELTS 6.0',
});
test('CV: mọi nội dung người dùng được escape, không chèn được thẻ', () => {
  const html = renderCv(sample());
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /ABC &amp; Co/);
  assert.equal(esc('<>"\'&'), '&lt;&gt;&quot;&#39;&amp;');
});
test('CV: cấu trúc ATS (một cột, chữ thật, không bảng, không ảnh trừ mẫu Nổi bật)', () => {
  for (const t of CV_TEMPLATES) {
    const html = renderCv({ ...sample(), tpl: t.id, anh: 'data:image/jpeg;base64,AAAA' });
    assert.ok(!/<table|<canvas|<svg/.test(html), `${t.id} không dùng bảng/canvas`);
    assert.match(html, new RegExp(`tpl-${t.id}`));
    assert.match(html, /<h1>/); assert.match(html, /Kinh nghiệm làm việc/); assert.match(html, /Học vấn/); assert.match(html, /Kỹ năng/);
    assert.equal(/<img/.test(html), t.id === 'noibat', `${t.id}: ảnh chỉ ở mẫu Nổi bật`);
    assert.ok(html.indexOf('<h1>') < html.indexOf('Kinh nghiệm') && html.indexOf('Kinh nghiệm') < html.indexOf('Học vấn'), 'thứ tự đọc: tên, kinh nghiệm, học vấn');
  }
  assert.equal(CV_TEMPLATES.length, 4);
});
test('CV: tách gạch đầu dòng, kỹ năng, khoảng thời gian', () => {
  assert.deepEqual(bullets('- Một\n• Hai\n\n  Ba  \n* Bốn'), ['Một', 'Hai', 'Ba', 'Bốn']);
  assert.deepEqual(skillList('Excel, Giao tiếp; Tiếng Anh\n,'), ['Excel', 'Giao tiếp', 'Tiếng Anh']);
  assert.equal(period('01/2020', ''), '01/2020 – Hiện tại');
  assert.equal(period('', ''), '');
  assert.equal(period('', '2020'), '... – 2020');
  const html = renderCv(sample());
  assert.equal((html.match(/<li>Làm /g) || []).length, 3);
});
test('CV: kiểm tra thiếu sót và trạng thái rỗng', () => {
  assert.equal(cvIsEmpty(emptyCv()), true);
  assert.equal(cvIsEmpty(sample()), false);
  const checks = cvChecks(emptyCv());
  assert.ok(checks.length >= 4 && checks.some((c) => /họ tên/.test(c)));
  assert.deepEqual(cvChecks(sample()), []);
  assert.ok(cvChecks({ ...sample(), email: 'khong-hop-le' }).some((c) => /Email/.test(c)));
  const html = renderCv(emptyCv());
  assert.match(html, /Họ và tên/);
});
test('lưu trữ: normalize chịu được dữ liệu hỏng và giới hạn kích thước', () => {
  assert.equal(normalize(null).cv.tpl, 'codien');
  assert.equal(normalize('rác').history.length, 0);
  const n = normalize({ cv: { kinhNghiem: new Array(50).fill({ congTy: 'x' }), hocVan: 'x' }, history: new Array(100).fill({}), settings: 5 });
  assert.equal(n.cv.kinhNghiem.length, 12); assert.deepEqual(n.cv.hocVan, []);
  assert.equal(n.history.length, 40);
  assert.equal(n.settings.group, 'vanphong');
  assert.equal(n.cv.kinhNghiem[0].mota, '');
});
