// Tạo quản trị viên đầu tiên: npm run admin:create -- <tên đăng nhập>
// Mật khẩu lấy từ biến CONSOLE_ADMIN_PASSWORD (không gõ trên dòng lệnh để khỏi lưu vào lịch sử). In bí mật TOTP để thêm vào Authenticator.
import { migrate, close } from '../src/db.js';
import { createAdmin } from '../src/auth.js';

const user = process.argv[2];
const pass = process.env.CONSOLE_ADMIN_PASSWORD;
if (!user || !pass) {
  console.error('Cách dùng: CONSOLE_ADMIN_PASSWORD=... npm run admin:create -- <tên đăng nhập>');
  process.exit(1);
}
await migrate();
try {
  const r = await createAdmin(user, pass);
  console.log(`Đã tạo quản trị viên "${r.username}".\nBí mật TOTP (thêm vào Google Authenticator/Authy): ${r.totpSecret}\nURI: ${r.otpauth}`);
} catch (e) {
  console.error('Không tạo được:', e.message);
  process.exitCode = 1;
}
await close();
