-- Tích hợp 9id (tài khoản dùng chung): thành viên có thể gắn với một người dùng 9id. user_id không có khóa ngoại (id của dịch vụ khác).
-- Mỗi người dùng chỉ có MỘT thành viên đang hoạt động (kể cả đang bị khóa) ở mỗi cộng đồng.
ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS members_community_user ON members(community_id, user_id) WHERE user_id IS NOT NULL AND left_at IS NULL;
CREATE INDEX IF NOT EXISTS members_user ON members(user_id) WHERE user_id IS NOT NULL;
