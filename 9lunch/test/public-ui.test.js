// Kiểm cấu trúc giao diện tĩnh (không chạy trình duyệt): cú pháp, thẻ tài khoản 9id gọi đúng API, không innerHTML.
// Hành vi thật được kiểm bằng e2e trong Chrome (scripts/e2e-account.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');
const files = fs.readdirSync(pub).filter((f) => f.endsWith('.js'));

test('mọi tệp JS trong public/ đều đúng cú pháp', () => {
  for (const f of files) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
});

test('trang chủ có thẻ tài khoản 9id: gọi api/account, nhận nhóm, đăng xuất, liên kết đăng nhập cùng nguồn gốc', () => {
  const s = read('home.js');
  assert.ok(s.includes("'api/account'"), 'đọc trạng thái tài khoản');
  assert.ok(s.includes("'api/account/claim'"), 'nhận nhóm ẩn danh');
  assert.ok(s.includes("'?next='"), 'liên kết đăng nhập có next');
  assert.ok(s.includes("'dang-nhap'") && s.includes("'dang-ky'") && s.includes("'#/' + mode"));
  assert.ok(s.includes('api/logout'), 'đăng xuất 9id');
  assert.ok(s.includes('x-requested-with'), 'đăng xuất kèm header chống CSRF của 9id');
  assert.ok(s.includes('Gắn vào tài khoản'));
});

test('không gán innerHTML/outerHTML/insertAdjacentHTML/document.write (tên hiển thị chỉ qua textContent)', () => {
  for (const f of files) assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(read(f)), f);
});

test('không thêm script ngoài vào index.html (CSP chặt giữ nguyên)', () => {
  const html = read('index.html');
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.every((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('/id/')), srcs.join());
});

test('đăng xuất ở giao diện chỉ tải lại khi 9id trả thành công (không báo đã đăng xuất khi 9id lỗi)', () => {
  const s = read('home.js');
  assert.ok(/if \(!r\.ok\)/.test(s), 'kiểm r.ok trước khi tải lại');
});
