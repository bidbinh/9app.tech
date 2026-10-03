-- 9app Console: quản trị viên, danh sách app, kho đồng bộ (người dùng, dòng tiền), nhật ký.
CREATE TABLE admins (
  id            bigserial PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  totp_secret   text NOT NULL,
  role          text NOT NULL DEFAULT 'super',
  apps          text[] NOT NULL DEFAULT '{}',   -- khung phân quyền theo app (siêu quản trị thấy tất cả)
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  admin_id   bigint NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_failures (
  key          text PRIMARY KEY,
  fails        int NOT NULL DEFAULT 0,
  first_at     timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

CREATE TABLE apps (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]{2,30}$'),
  name        text NOT NULL,
  base_url    text NOT NULL,
  key_id      text NOT NULL,
  secret_enc  text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  sort        int NOT NULL DEFAULT 100,
  note        text NOT NULL DEFAULT '',
  manifest    jsonb,
  panels      jsonb,
  admin_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_state (
  app_id       text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  stream       text NOT NULL,
  cursor       text,
  last_ok_at   timestamptz,
  last_full_at timestamptz,
  last_error   text,
  last_count   int NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, stream)
);

CREATE TABLE app_status (
  app_id     text PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
  ok         boolean NOT NULL DEFAULT false,
  detail     text NOT NULL DEFAULT '',
  checked_at timestamptz,
  summary    jsonb,
  summary_at timestamptz
);

CREATE TABLE users_index (
  app_id       text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  app_user_id  text NOT NULL,
  phone        text NOT NULL DEFAULT '',
  name         text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz,
  last_seen_at timestamptz,
  extra        jsonb NOT NULL DEFAULT '{}',
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, app_user_id)
);
CREATE INDEX users_index_phone ON users_index(phone);

CREATE TABLE cash_entries (
  app_id      text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  entry_id    text NOT NULL,
  at          timestamptz NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('cash_in','cash_out','revenue','expense')),
  amount      bigint NOT NULL CHECK (amount > 0),
  category    text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  ref         text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  synced_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, entry_id)
);
CREATE INDEX cash_entries_at ON cash_entries(at DESC);
CREATE INDEX cash_entries_phone ON cash_entries(phone) WHERE phone <> '';

CREATE TABLE balances (
  app_id  text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  label   text NOT NULL,
  amount  bigint NOT NULL,
  kind    text NOT NULL CHECK (kind IN ('cash','customer_funds','receivable')),
  at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, item_id)
);

CREATE TABLE audit_log (
  id     bigserial PRIMARY KEY,
  admin  text NOT NULL,
  action text NOT NULL,
  app_id text NOT NULL DEFAULT '',
  detail jsonb,
  at     timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION audit_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_ro BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_immutable();
