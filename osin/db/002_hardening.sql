-- Phản biện lần 2: cảnh báo trên thẻ xác nhận, tin bị đánh dấu có chỉ dẫn lạ, chống trùng khi thử lại, phiên bản đồng ý, thời điểm thấy lần đầu.
ALTER TABLE pending_actions ADD COLUMN warning text;
ALTER TABLE messages ADD COLUMN flagged boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN client_id text;
CREATE UNIQUE INDEX messages_client_idx ON messages (user_id, client_id) WHERE client_id IS NOT NULL AND role = 'user';
ALTER TABLE user_prefs ADD COLUMN consent_version int NOT NULL DEFAULT 0;
ALTER TABLE user_prefs ADD COLUMN first_seen_at timestamptz NOT NULL DEFAULT now();
