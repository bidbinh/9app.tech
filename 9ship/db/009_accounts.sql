-- Tài khoản có mật khẩu: OTP chỉ dùng lần đầu (đăng ký) và khi quên mật khẩu.
-- Mật khẩu băm cùng định dạng với 9Sport (pbkdf2$vòng$muối$hash) để dùng chung tài khoản giữa các app 9app.tech.
ALTER TABLE users ADD COLUMN password_hash text;
ALTER TABLE users ADD COLUMN verified_at timestamptz;
ALTER TABLE users ADD COLUMN source text NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN last_login_at timestamptz;

-- Đếm lần nhập sai để khóa tạm (chống dò mật khẩu).
CREATE TABLE auth_failures (
  key          text PRIMARY KEY,
  fails        int NOT NULL DEFAULT 0,
  first_at     timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);
