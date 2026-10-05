-- Thiết bị quen (cookie nine_dev, chỉ lưu băm): được miễn khóa đăng nhập theo số
CREATE TABLE devices (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user ON devices(user_id);

-- OTP: đếm lần sai theo (OTP, IP); mục đích; ngân sách dành riêng cho đặt lại mật khẩu
ALTER TABLE otps ADD COLUMN purpose text NOT NULL DEFAULT 'register';
ALTER TABLE otps ADD COLUMN reserved boolean NOT NULL DEFAULT false;
CREATE TABLE otp_fails (
  otp_id bigint NOT NULL REFERENCES otps(id) ON DELETE CASCADE,
  ip_key text NOT NULL,
  n int NOT NULL DEFAULT 0,
  PRIMARY KEY (otp_id, ip_key)
);

-- proof-of-work: mỗi thử thách chỉ dùng một lần
CREATE TABLE pow_used (
  hash text PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
);

-- vé xác minh chỉ lưu băm số điện thoại
DELETE FROM tickets;
ALTER TABLE tickets DROP COLUMN phone;
ALTER TABLE tickets ADD COLUMN phone_hash text NOT NULL;

-- chặn và báo cáo người mời
CREATE TABLE invite_blocks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_user_id)
);
CREATE TABLE invite_reports (
  id bigserial PRIMARY KEY,
  reporter uuid REFERENCES users(id) ON DELETE SET NULL,
  reported uuid REFERENCES users(id) ON DELETE SET NULL,
  family_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- bước duyệt của người mời: người nhận bấm chấp nhận thì 'awaiting' cho tới khi chủ/quản lý duyệt
ALTER TABLE invitations DROP CONSTRAINT invitations_status_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_status_check CHECK (status IN ('pending','awaiting','accepted','declined','expired','revoked'));
ALTER TABLE invitations ADD COLUMN accepted_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invitations ADD COLUMN accepted_at timestamptz;
ALTER TABLE invitations ADD COLUMN phone_last4 text NOT NULL DEFAULT '';
DROP INDEX invitations_pending;
CREATE UNIQUE INDEX invitations_pending ON invitations(family_id, phone_hash) WHERE status IN ('pending','awaiting');
ALTER TABLE families ADD COLUMN require_approval boolean NOT NULL DEFAULT true;
ALTER TABLE families ADD COLUMN notes_for_new boolean NOT NULL DEFAULT false;

-- thông báo bảo mật cho người dùng (ví dụ mật khẩu vừa được đặt lại bằng OTP)
CREATE TABLE notices (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz
);
CREATE INDEX notices_user ON notices(user_id, seen_at);

-- nhập gia đình hiện có từ app khác: mã nhận dùng một lần, chỉ lưu băm
CREATE TABLE family_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','used','revoked','expired')),
  expires_at timestamptz NOT NULL,
  claimed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_app text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX family_claims_family ON family_claims(family_id);
