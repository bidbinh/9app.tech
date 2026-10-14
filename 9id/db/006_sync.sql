-- Đồng bộ dữ liệu app chỉ lưu ở máy: một tài liệu JSON cho mỗi (người dùng, app), có số phiên bản để ghi có điều kiện.
CREATE TABLE sync_docs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app text NOT NULL,
  version int NOT NULL,
  data jsonb NOT NULL,
  bytes int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app)
);
