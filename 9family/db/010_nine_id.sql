-- 010: chuyển sang tài khoản 9app dùng chung (9id). CHỈ CỘNG THÊM, chạy lại được nhiều lần, không xóa/đổi dữ liệu có sẵn.
--  * families.id và children.id nay là id của 9id (giữ nguyên uuid cũ của gia đình đã nhập); các bảng nghiệp vụ không đổi.
--  * members.user_id = id người dùng của 9id (rỗng với người đón hộ và với thành viên cũ chưa nối tài khoản).
--  * Các cột tên/năm sinh/vai trò của gia đình, con, thành viên là BẢN SAO đọc từ 9id (nguồn đúng nằm ở 9id), làm mới mỗi khi có người mở gia đình.

ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS members_user ON members(user_id) WHERE user_id IS NOT NULL;
-- mỗi tài khoản chỉ là MỘT thành viên đang hoạt động trong một gia đình (chặn đua khi đồng bộ)
CREATE UNIQUE INDEX IF NOT EXISTS members_family_user ON members(family_id, user_id) WHERE user_id IS NOT NULL AND left_at IS NULL;

-- thêm vai trò 'con' (tài khoản của con nối vào hồ sơ con); bỏ ràng buộc cũ về vai trò rồi tạo lại rộng hơn
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'members'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%role%' LOOP
    EXECUTE format('ALTER TABLE members DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK (role IN ('chu','quan_ly','thanh_vien','con'));

-- hồ sơ con bị lưu trữ/xóa ở 9id: giữ lịch sử, ẩn khỏi danh sách
ALTER TABLE children ADD COLUMN IF NOT EXISTS archived_at timestamptz;
-- tài khoản (của con) đã nối vào hồ sơ này ở 9id: bản sao để lọc dữ liệu theo vai trò 'con' và gửi nhắc, không cần gọi 9id
ALTER TABLE children ADD COLUMN IF NOT EXISTS linked_user_id uuid;
CREATE INDEX IF NOT EXISTS children_linked ON children(linked_user_id) WHERE linked_user_id IS NOT NULL;

-- đăng ký đẩy gắn với người dùng 9id (cùng một thiết bị có thể ở nhiều gia đình)
ALTER TABLE push_subs ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id) WHERE user_id IS NOT NULL;

-- gia đình đã xuất sang 9id bằng scripts/export-to-9id.js (KHÔNG lưu mã nhận; 9id chỉ giữ băm)
CREATE TABLE IF NOT EXISTS id_import (
  family_id uuid PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  claim_id uuid,
  exported_at timestamptz NOT NULL DEFAULT now(),
  reissued_at timestamptz
);
