-- Idempotency-Key gắn với băm nội dung yêu cầu; slot tạm dừng không cần cột mới (học sinh lưu trữ thì lịch tự tạm dừng)
ALTER TABLE idem ADD COLUMN req_hash text;
