-- Đồng bộ dữ liệu app chỉ lưu ở máy: một tài liệu JSON cho mỗi (người dùng, app), có số phiên bản để ghi có điều kiện.
CREATE TABLE sync_docs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app text NOT NULL,
  epoch uuid NOT NULL DEFAULT gen_random_uuid(),   -- đổi mỗi khi tài liệu được tạo lại (sau khi bị xóa): máy khác biết ảnh chụp cũ không còn giá trị
  version int NOT NULL,
  data jsonb NOT NULL,
  bytes int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app)
);
