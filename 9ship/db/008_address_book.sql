-- Sổ địa chỉ: dùng chung cho người gửi và người nhận, tự lưu sau mỗi đơn.
ALTER TABLE addresses ADD COLUMN use_count int NOT NULL DEFAULT 0;
ALTER TABLE addresses ADD COLUMN last_used_at timestamptz;
ALTER TABLE addresses ADD COLUMN is_default_sender boolean NOT NULL DEFAULT false;
ALTER TABLE addresses ADD COLUMN province_name text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX addresses_one_default ON addresses(user_id) WHERE is_default_sender;
