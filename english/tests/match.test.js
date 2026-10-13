const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../js/match.js');

test('chuẩn hóa: bỏ dấu câu, hạ chữ thường, mở rộng viết tắt, số thành chữ', () => {
  assert.deepEqual(m.tokens("I'm sorry, but I can't attend!"), ['i', 'am', 'sorry', 'but', 'i', 'can', 'not', 'attend']);
  assert.deepEqual(m.tokens('Call me at 3 p.m.'), ['call', 'me', 'at', 'three', 'pm']);
  assert.deepEqual(m.tokens('  '), []);
  assert.deepEqual(m.tokens(null), []);
});

test('dấu nháy cong được hiểu như dấu nháy thẳng', () => {
  assert.equal(m.compare("I'm here", 'I’m here').score, 100);
});

test('khớp hoàn toàn cho 100 điểm, kể cả khác hoa thường và dấu câu', () => {
  const r = m.compare('Could you send me the report?', 'could you send me the report');
  assert.equal(r.score, 100); assert.equal(r.verdict, 'tot');
  assert.ok(r.words.every((w) => w.status === 'ok'));
});

test('viết tắt hai cách đều khớp', () => {
  assert.equal(m.compare("I'm afraid I can't make it.", 'I am afraid I cannot make it').score, 100);
});

test('thiếu từ: đánh dấu miss và điểm giảm tương ứng', () => {
  const r = m.compare('Please send me the report today', 'please send the report today');
  assert.equal(r.words.find((w) => w.ref === 'me').status, 'miss');
  assert.equal(r.score, 83); // 5/6
});

test('từ gần giống: near, tính 0.5 điểm, không thành "Rất tốt" khi còn từ gần đúng và có gợi ý', () => {
  const r = m.compare('Please check the schedule', 'please check the shedule');
  assert.equal(r.words[3].status, 'near');
  assert.equal(r.score, 88); // (3 + 0.5) / 4 = 87.5
  assert.equal(r.verdict, 'kha');
  assert.ok(m.hints(r)[0].includes('schedule'));
});

test('từ nghe sai hoàn toàn: miss kèm từ nghe được', () => {
  const r = m.compare('We need a new budget', 'we need a new bridge');
  const w = r.words[4];
  assert.equal(w.ref, 'budget'); assert.equal(w.status, 'miss'); assert.equal(w.heard, 'bridge');
  assert.ok(m.hints(r).some((h) => h.includes('bridge')));
});

test('nói thừa từ: bị trừ nhẹ và ghi nhận extra', () => {
  const r = m.compare('Thank you for your help', 'well thank you for your help');
  assert.deepEqual(r.extra, ['well']); assert.equal(r.score, 95); assert.equal(r.verdict, 'tot');
});

test('không nói gì hoặc nói lạc đề: điểm thấp', () => {
  assert.equal(m.compare('Nice to meet you', '').score, 0);
  assert.ok(m.compare('Nice to meet you', 'the weather is hot today').score < 30);
  assert.equal(m.compare('Nice to meet you', '').verdict, 'chua');
});

test('câu mẫu rỗng không làm hỏng', () => {
  const r = m.compare('', 'anything');
  assert.equal(r.score, 0);
});

test('thứ tự từ bị đảo không được điểm tuyệt đối', () => {
  assert.ok(m.compare('send me the report', 'the report send me').score < 100);
});

test('chọn kết quả tốt nhất trong nhiều giả thuyết', () => {
  const r = m.best('I would like a single room', ['i would like a simple room', 'i would like a single room']);
  assert.equal(r.score, 100);
  assert.equal(m.best('hello', []).score, 0);
});

test('"colleague" và "college" không bị coi là khớp hoàn toàn', () => {
  assert.notEqual(m.compare('my colleague', 'my college').words[1].status, 'ok');
});

test('ngưỡng nhận xét', () => {
  const ref = 'one two three four five six seven';
  assert.equal(m.compare(ref, ref).verdict, 'tot');
  assert.equal(m.compare(ref, 'one two three four five').verdict, 'kha');
  assert.equal(m.compare(ref, 'one two three').verdict, 'chua');
});

test('một từ sai trong câu dài không còn được "Rất tốt"', () => {
  const r = m.compare('I look forward to hearing from you', 'I look forward to hear from you');
  assert.notEqual(r.verdict, 'tot'); assert.ok(r.score < 90);
});
test('nói thừa nhiều từ bị phạt nặng hơn và hết "Rất tốt"', () => {
  const r = m.compare('Thank you for your help', 'well thank you very much for your kind help');
  assert.notEqual(r.verdict, 'tot'); assert.ok(r.score <= 80, String(r.score));
});
test('chuẩn hóa giờ giấc và số: 3 pm = 3 p.m., twenty five = 25, twenty-five = 25', () => {
  assert.equal(m.compare('See you at 3 p.m.', 'see you at three pm').score, 100);
  assert.equal(m.compare('See you at 3 pm', 'See you at 3 p.m.').score, 100);
  assert.equal(m.compare('We need 25 chairs', 'we need twenty five chairs').score, 100);
  assert.equal(m.compare('We need twenty-five chairs', 'we need 25 chairs').score, 100);
  assert.equal(m.compare('Call me at 10:30 a.m.', 'call me at ten thirty am').score, 100);
});
