const test = require('node:test');
const assert = require('node:assert/strict');

// speech.js chạy trên trình duyệt; ở đây chỉ kiểm hàm thuần tách câu (không có speechSynthesis).
global.self = global; global.window = global; global.E9 = {};
require('../js/speech.js');
const S = global.E9.speech;

test('tách câu theo dấu chấm, hỏi, than', () => {
  assert.deepEqual(S.sentences('Hello there. How are you? Fine!'), ['Hello there.', 'How are you?', 'Fine!']);
});
test('không tách sau Mr., Ms., a.m., p.m.', () => {
  assert.deepEqual(S.sentences('Dear Mr. Pham, we meet at 3 p.m. tomorrow. Thanks.'), ['Dear Mr. Pham, we meet at 3 p.m. tomorrow.', 'Thanks.']);
  assert.equal(S.sentences('Ms. Lan will chair the meeting.').length, 1);
});
test('đoạn quá dài được tách ở dấu phẩy', () => {
  const long = ('word '.repeat(20) + 'one, ').repeat(4).trim();
  const parts = S.sentences(long);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 230), parts.map((p) => p.length).join());
});
test('chuỗi rỗng và khoảng trắng', () => {
  assert.deepEqual(S.sentences('   '), []);
  assert.deepEqual(S.sentences('\n\nHi.\n'), ['Hi.']);
});
test('không hỗ trợ nhận giọng/phát âm khi chạy ngoài trình duyệt', () => {
  assert.equal(S.ttsSupported(), false); assert.equal(S.recSupported(), false);
});
