-- hồ sơ đã được nhà tuyển dụng xem (trần hồ sơ chưa xem chỉ tính hồ sơ chưa mở)
ALTER TABLE applications ADD COLUMN seen_at timestamptz;
-- khiếu nại khi tin bị ẩn
ALTER TABLE jobs ADD COLUMN appeal_note text;
ALTER TABLE jobs ADD COLUMN appealed_at timestamptz;
-- băm nội dung và SĐT liên hệ của tin đã bị ẩn/xóa do vi phạm: chặn đăng lại
CREATE TABLE blocked (
  kind text NOT NULL CHECK (kind IN ('hash','phone')),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, value)
);
