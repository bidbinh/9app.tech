-- Đổi số điện thoại: lịch sử đổi (phục vụ hạn mức 30 ngày, giữ chỗ số cũ và hoàn tác 7 ngày).
-- Chỉ lưu BĂM số (không lưu số dạng rõ): hoàn tác luôn kèm số cũ đã xác minh OTP nên chỉ cần so băm.
-- closed_at: chủ tài khoản chọn "khóa hoàn tác" (số cũ không còn do mình giữ) -> hết giữ chỗ, không hoàn tác được nữa.
CREATE TABLE phone_changes (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_phone_hash text NOT NULL,
  new_phone_hash text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX phone_changes_user ON phone_changes(user_id, changed_at DESC);
CREATE INDEX phone_changes_old ON phone_changes(old_phone_hash) WHERE undone_at IS NULL AND closed_at IS NULL;
