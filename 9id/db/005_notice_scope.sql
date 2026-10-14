-- Thông báo "thiết bị mới" không hiện trên chính phiên vừa đăng nhập: ghi phiên bị loại trừ.
ALTER TABLE notices ADD COLUMN except_session uuid;
