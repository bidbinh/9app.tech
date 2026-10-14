-- Đổi số điện thoại: lịch sử đổi (phục vụ hạn mức 30 ngày, giữ chỗ số cũ và hoàn tác 7 ngày).
-- old_phone được xóa về NULL sau 8 ngày và cả dòng bị xóa sau 90 ngày (maintenance).
CREATE TABLE phone_changes (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_phone text,
  new_phone_hash text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);
CREATE INDEX phone_changes_user ON phone_changes(user_id, changed_at DESC);
CREATE INDEX phone_changes_old ON phone_changes(old_phone) WHERE undone_at IS NULL AND old_phone IS NOT NULL;
