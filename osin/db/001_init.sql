-- Osin: lịch sử hội thoại, hành động chờ xác nhận, bộ đếm sử dụng, cài đặt.
CREATE TABLE messages (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  cards       jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_user_idx ON messages (user_id, id DESC);
CREATE INDEX messages_created_idx ON messages (created_at);

CREATE TABLE pending_actions (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  app_id      text NOT NULL,
  tool        text NOT NULL,
  args        jsonb NOT NULL,
  family_id   text,
  title       text NOT NULL,
  summary     text NOT NULL,
  integrity   text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled', 'expired')),
  result_text text,
  error_text  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  decided_at  timestamptz
);
CREATE INDEX pending_user_idx ON pending_actions (user_id, created_at DESC);

-- user_key = HMAC(OSIN_SECRET, userId): không chứa định danh thật, xóa dữ liệu không đặt lại được hạn mức
CREATE TABLE usage_daily (
  day        date NOT NULL,
  user_key   text NOT NULL,
  tokens     bigint NOT NULL DEFAULT 0,
  msgs       int NOT NULL DEFAULT 0,
  tool_calls int NOT NULL DEFAULT 0,
  errors     int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_key)
);

CREATE TABLE user_prefs (
  user_id    text PRIMARY KEY,
  family_id  text,
  consent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
