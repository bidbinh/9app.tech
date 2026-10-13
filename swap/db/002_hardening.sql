-- gia hạn cookie phiên khi hoạt động
ALTER TABLE phien ADD COLUMN seen_at timestamptz NOT NULL DEFAULT now();
-- tác giả đóng luồng quan tâm
ALTER TABLE threads ADD COLUMN closed_at timestamptz;
CREATE INDEX threads_member ON threads(member_id);
CREATE INDEX listings_recipient ON listings(recipient_id) WHERE recipient_id IS NOT NULL;
CREATE INDEX board_replies_author ON board_replies(author_id, created_at);
CREATE INDEX board_posts_author ON board_posts(author_id, created_at);
