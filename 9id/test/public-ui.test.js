// Kiểm cấu trúc giao diện tĩnh (không chạy trình duyệt): cú pháp, các điểm gắn API mới, không innerHTML với dữ liệu người dùng.
// Hành vi thật được kiểm bằng e2e trong Chrome (scripts/e2e-shared.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');
const files = fs.readdirSync(pub).filter((f) => f.endsWith('.js'));

test('mọi tệp JS trong public/ đều đúng cú pháp (kể cả nine.js khi đã có)', () => {
  assert.ok(files.length >= 6);
  for (const f of files) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
});

test('trang Tài khoản có thẻ đổi số điện thoại gọi đúng API, ô số và ô mã có autocomplete đúng', () => {
  const s = read('account.js');
  assert.ok(s.includes("'Đổi số điện thoại'"), 'có nút Đổi số điện thoại');
  assert.ok(s.includes("purpose: 'phone_change'"));
  assert.ok(s.includes('api/phone/change'));
  assert.ok(s.includes("autocomplete: 'tel'"));
  assert.ok(s.includes("autocomplete: 'one-time-code'"));
});

test('màn quên mật khẩu có lựa chọn hoàn tác đổi số khi OTP cho biết số vừa được đổi', () => {
  const s = read('auth.js');
  assert.ok(s.includes('phoneChangeUndoable'));
  assert.ok(s.includes('api/phone/undo'));
  assert.ok(s.includes('Đăng ký một lần, dùng cho mọi app 9app cần đăng nhập'));
});

test('thông báo dùng chung hiện đủ các loại, ở cả trang Gia đình lẫn Tài khoản', () => {
  const ui = read('ui.js');
  for (const k of ['password_reset', 'new_device', 'phone_changed', 'phone_change_undone']) assert.ok(ui.includes(k), k);
  assert.ok(ui.includes('N.noticeCards'));
  assert.ok(read('family.js').includes('N.noticeCards'));
  assert.ok(read('account.js').includes('N.noticeCards'));
});

test('không gán innerHTML/outerHTML/insertAdjacentHTML trong giao diện (dữ liệu người dùng chỉ qua textContent)', () => {
  for (const f of files) assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(read(f)), f);
});
