CREATE TABLE communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'toa_nha' CHECK (kind IN ('cong_ty','toa_nha','khu_pho')),
  invite_code text NOT NULL UNIQUE,
  created_by_hash text NOT NULL,
  created_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX communities_creator ON communities(created_by_hash, created_at);
CREATE INDEX communities_ip ON communities(created_ip, created_at);

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('chu','thanh_vien')),
  banned_at timestamptz,
  left_at timestamptz,
  rules_ack_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX members_community ON members(community_id);

-- phiên ẩn danh: chỉ lưu băm SHA-256 của token trong cookie
CREATE TABLE phien (
  token_hash text NOT NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_hash, member_id)
);
CREATE INDEX phien_member ON phien(member_id);

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tang','doi','ban')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  condition text NOT NULL,
  price bigint CHECK (price IS NULL OR (price >= 0 AND price <= 1000000000)),
  swap_wish text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  pickup_time text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'mo' CHECK (status IN ('mo','giu','xong','huy','go','het_han')),
  recipient_id uuid REFERENCES members(id) ON DELETE SET NULL,
  search text NOT NULL DEFAULT '',
  removed_reason text,
  renew_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  closed_at timestamptz,
  CHECK (kind <> 'ban' OR price IS NOT NULL),
  CHECK (category <> 'thuc_pham' OR kind = 'tang')
);
CREATE INDEX listings_feed ON listings(community_id, status, created_at DESC);
CREATE INDEX listings_author ON listings(author_id, created_at DESC);

CREATE TABLE listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  pos smallint NOT NULL CHECK (pos BETWEEN 0 AND 3),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  bytes int NOT NULL CHECK (bytes > 0),
  data bytea NOT NULL,
  thumb bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, pos)
);
CREATE INDEX photos_community ON listing_photos(community_id);

CREATE TABLE threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_msg_at timestamptz NOT NULL DEFAULT now(),
  author_read_at timestamptz NOT NULL DEFAULT now(),
  member_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, member_id)
);

CREATE TABLE messages (
  id bigserial PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_thread ON messages(thread_id, id);
CREATE INDEX messages_sender ON messages(sender_id, created_at);

CREATE TABLE board_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('that_lac','nhat_duoc','can_tim')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'mo' CHECK (status IN ('mo','xong','go','het_han')),
  removed_reason text,
  search text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX board_feed ON board_posts(community_id, status, created_at DESC);

CREATE TABLE board_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX board_replies_post ON board_replies(post_id, created_at);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('listing','message','board','reply')),
  target_id text NOT NULL,
  target_member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  reason text NOT NULL,
  snapshot text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'cho' CHECK (status IN ('cho','da_xu_ly','bo_qua')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX reports_queue ON reports(community_id, status, created_at);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type text NOT NULL,
  listing_id uuid,
  thread_id uuid,
  board_id uuid,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX notifications_member ON notifications(member_id, id DESC);
CREATE INDEX notifications_unread ON notifications(member_id) WHERE read_at IS NULL;

CREATE TABLE idem (
  scope text NOT NULL,
  key text NOT NULL,
  status int,
  body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
