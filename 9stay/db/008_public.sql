-- Trang đặt phòng công khai (lát 5): định danh org theo slug, OTP số điện thoại, phiên xác thực, biên nhận bằng token ngẫu nhiên.
ALTER TABLE orgs ADD COLUMN slug text UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$');
ALTER TABLE orgs ADD COLUMN public_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone ON otp_codes (org_id, phone, created_at DESC);

CREATE TABLE otp_sessions (
  token_hash text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  phone text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings ADD COLUMN public_token_hash text UNIQUE;
ALTER TABLE bookings ADD COLUMN phone_verified boolean NOT NULL DEFAULT false;
