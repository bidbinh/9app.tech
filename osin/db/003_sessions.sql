-- Phiên đăng nhập riêng của Osin (tên miền riêng): chỉ lưu băm token, trượt tối đa 7 ngày, kèm mã phiên 9id để kiểm lại định kỳ.
CREATE TABLE osin_sessions (
  id              bigserial PRIMARY KEY,
  token_hash      text NOT NULL UNIQUE,
  user_id         text NOT NULL,
  display_name    text NOT NULL,
  session9id      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX osin_sessions_user_idx ON osin_sessions (user_id);
CREATE INDEX osin_sessions_session9id_idx ON osin_sessions (session9id);
