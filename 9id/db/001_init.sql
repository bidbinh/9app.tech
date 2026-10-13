CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  phone text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  password_weak boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT '9id',
  phone_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ua text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id, created_at);

CREATE TABLE otps (
  id bigserial PRIMARY KEY,
  phone_hash text NOT NULL,
  code_hash text NOT NULL,
  salt text NOT NULL,
  tries int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otps_phone ON otps(phone_hash, created_at DESC);
CREATE INDEX otps_ip ON otps(ip_key, created_at);
CREATE INDEX otps_created ON otps(created_at);

CREATE TABLE tickets (
  token_hash text PRIMARY KEY,
  phone text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE throttle (
  key text PRIMARY KEY,
  n int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  level int NOT NULL DEFAULT 0
);

CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('chu','quan_ly','thanh_vien','con')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);
CREATE UNIQUE INDEX memberships_active ON memberships(family_id, user_id) WHERE left_at IS NULL;
CREATE UNIQUE INDEX memberships_one_owner ON memberships(family_id) WHERE left_at IS NULL AND role = 'chu';
CREATE INDEX memberships_user ON memberships(user_id) WHERE left_at IS NULL;

CREATE TABLE child_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_year int,
  linked_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX child_family ON child_profiles(family_id);
CREATE INDEX child_linked ON child_profiles(linked_user_id) WHERE linked_user_id IS NOT NULL;

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('nguoi_lon','con')),
  role text NOT NULL CHECK (role IN ('quan_ly','thanh_vien','con')),
  child_id uuid REFERENCES child_profiles(id) ON DELETE CASCADE,
  phone_hash text NOT NULL,
  label text NOT NULL DEFAULT '',
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX invitations_pending ON invitations(family_id, phone_hash) WHERE status = 'pending';
CREATE INDEX invitations_phone ON invitations(phone_hash) WHERE status = 'pending';
CREATE INDEX invitations_family ON invitations(family_id);
CREATE INDEX invitations_by ON invitations(invited_by, created_at);

CREATE TABLE internal_nonces (
  kid text NOT NULL,
  nonce text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kid, nonce)
);

CREATE TABLE idem (
  scope text NOT NULL,
  key text NOT NULL,
  req_hash text,
  status int,
  body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE TABLE audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  detail text NOT NULL DEFAULT ''
);
CREATE INDEX audit_at ON audit(at);
