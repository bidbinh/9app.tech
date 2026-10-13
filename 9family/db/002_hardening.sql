-- Mỗi gia đình chỉ có một chủ đang hoạt động (chặn chuyển quyền song song tạo hai chủ)
CREATE UNIQUE INDEX members_one_owner ON members(family_id) WHERE role = 'chu' AND left_at IS NULL;
-- Mã khôi phục của chủ gia đình (chỉ lưu băm)
ALTER TABLE members ADD COLUMN recovery_hash text;
CREATE UNIQUE INDEX members_recovery ON members(recovery_hash) WHERE recovery_hash IS NOT NULL;
-- Giới hạn tạo gia đình theo IP
ALTER TABLE families ADD COLUMN created_ip text NOT NULL DEFAULT '';
CREATE INDEX families_ip ON families(created_ip, created_at);
-- Ẩn tên con/địa điểm trong nội dung đẩy (mặc định ẩn)
ALTER TABLE push_subs ADD COLUMN hide boolean NOT NULL DEFAULT true;
-- Hạn mức AI: toàn hệ, theo IP, theo gia đình; chỉ tính khi gọi thành công
CREATE TABLE ai_quota (
  scope text NOT NULL,
  day date NOT NULL,
  n int NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, day)
);
