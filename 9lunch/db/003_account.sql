-- Tích hợp 9id (tài khoản dùng chung): thành viên có thể gắn với một người dùng 9id. user_id không có khóa ngoại (id của dịch vụ khác).
-- Mỗi người dùng chỉ có MỘT thành viên đang hoạt động ở mỗi nhóm.
ALTER TABLE members ADD COLUMN user_id uuid;
CREATE UNIQUE INDEX members_team_user ON members(team_id, user_id) WHERE user_id IS NOT NULL AND left_at IS NULL;
CREATE INDEX members_user ON members(user_id) WHERE user_id IS NOT NULL;
