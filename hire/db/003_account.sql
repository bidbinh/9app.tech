-- Tích hợp 9id (tài khoản dùng chung): nhà tuyển dụng có thể gắn với một người dùng 9id. user_id không có khóa ngoại (id của dịch vụ khác).
-- Mỗi người dùng chỉ có MỘT nhà tuyển dụng.
ALTER TABLE employers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS employers_user ON employers(user_id) WHERE user_id IS NOT NULL;
