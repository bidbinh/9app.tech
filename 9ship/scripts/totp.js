// In mã TOTP hiện tại từ ADMIN_TOTP_SECRET (dùng khi chưa có ứng dụng xác thực). Chạy: npm run totp
import { totp } from '../src/auth.js';
const secret = process.env.ADMIN_TOTP_SECRET;
if (!secret) { console.error('Thiếu ADMIN_TOTP_SECRET'); process.exit(1); }
const t = Date.now();
console.log(totp(secret, t), `(còn hiệu lực ~${30 - Math.floor(t / 1000) % 30}s)`);
