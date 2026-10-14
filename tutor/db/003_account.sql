-- Tích hợp 9id (tài khoản dùng chung): gia sư có thể gắn với một người dùng 9id. user_id không có khóa ngoại (id của dịch vụ khác).
-- Mỗi người dùng chỉ có MỘT gia sư.
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS tutors_user ON tutors(user_id) WHERE user_id IS NOT NULL;
