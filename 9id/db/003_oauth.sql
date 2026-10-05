-- Cấp phiên cho app ở TÊN MIỀN CON RIÊNG (ví dụ osin.9app.tech) bằng mã dùng một lần: cookie nine_sid không gửi sang đó.
CREATE TABLE auth_codes (
  code_hash text PRIMARY KEY,
  client text NOT NULL,
  redirect_uri text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  state text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_codes_expires ON auth_codes(expires_at);

-- phiên con của app: mất phiên 9id cha (đăng xuất, đổi mật khẩu, đăng xuất tất cả, xóa tài khoản) thì mất theo
CREATE TABLE app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client text NOT NULL,
  parent_session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_checked_at timestamptz
);
CREATE INDEX app_sessions_user ON app_sessions(user_id, client);

-- người dùng đã bấm "Cho phép" app nào
CREATE TABLE oauth_consents (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client)
);
