CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  rev bigint NOT NULL DEFAULT 0,
  created_by_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX families_creator ON families(created_by_hash, created_at);

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name text NOT NULL,
  relation text NOT NULL DEFAULT 'khac' CHECK (relation IN ('bo','me','ong','ba','nguoi_than','giup_viec','don_ho','khac')),
  role text NOT NULL DEFAULT 'thanh_vien' CHECK (role IN ('chu','quan_ly','thanh_vien')),
  external boolean NOT NULL DEFAULT false,
  phone text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  ics_token text UNIQUE,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX members_family ON members(family_id);

-- phiên ẩn danh trên thiết bị: chỉ lưu băm SHA-256 của token trong cookie
CREATE TABLE sessions (
  token_hash text NOT NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_hash, member_id)
);
CREATE INDEX sessions_member ON sessions(member_id);

-- link mời (7 ngày) và link liên kết thiết bị (10 phút), dùng một lần, chỉ lưu băm
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('moi','thiet_bi')),
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_member ON invites(member_id);

CREATE TABLE children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_year int,
  school text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'xanh',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX children_family ON children(family_id);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'khac',
  location text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  all_day boolean NOT NULL DEFAULT false,
  start_time text,
  end_time text,
  start_date date NOT NULL,
  until_date date,
  rec_type text NOT NULL DEFAULT 'none' CHECK (rec_type IN ('none','daily','weekly','yearly','yearly_lunar','monthly_lunar')),
  rec_days smallint[] NOT NULL DEFAULT '{}',
  lunar_month smallint,
  lunar_day smallint,
  notify_offsets int[] NOT NULL DEFAULT '{}',
  checklist jsonb NOT NULL DEFAULT '[]',
  child_ids uuid[] NOT NULL DEFAULT '{}',
  member_ids uuid[] NOT NULL DEFAULT '{}',
  source text,
  source_child uuid,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_family ON events(family_id);
CREATE INDEX events_tkb ON events(family_id, source_child) WHERE source = 'tkb';

CREATE TABLE event_exceptions (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day date NOT NULL,
  action text NOT NULL CHECK (action IN ('skip','edit')),
  title text, location text, note text, start_time text, end_time text,
  PRIMARY KEY (event_id, day)
);

-- mỗi lần nhắc sự kiện chỉ được phát đúng một lần (khóa chính chặn trùng khi khởi động lại hoặc chạy hai bản)
CREATE TABLE event_fires (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day date NOT NULL,
  offset_min int NOT NULL,
  fired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, day, offset_min)
);

CREATE TABLE rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  dir text NOT NULL CHECK (dir IN ('dua','don')),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  at_time text NOT NULL,
  place text NOT NULL DEFAULT '',
  p0 uuid REFERENCES members(id) ON DELETE SET NULL,
  p1 uuid REFERENCES members(id) ON DELETE SET NULL,
  p2 uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rides_family ON rides(family_id, weekday);

CREATE TABLE ride_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  ride_id uuid REFERENCES rides(id) ON DELETE SET NULL,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  dir text NOT NULL CHECK (dir IN ('dua','don')),
  day date NOT NULL,
  at_time text NOT NULL,
  at_ts timestamptz NOT NULL,
  place text NOT NULL DEFAULT '',
  p0 uuid REFERENCES members(id) ON DELETE SET NULL,
  p1 uuid REFERENCES members(id) ON DELETE SET NULL,
  p2 uuid REFERENCES members(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'cho' CHECK (state IN ('cho','da_nhan','dang_di','xong','khong_ai','bo_qua')),
  claimed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  done_by uuid REFERENCES members(id) ON DELETE SET NULL,
  done_at timestamptz,
  skip_by uuid REFERENCES members(id) ON DELETE SET NULL,
  skip_reason text NOT NULL DEFAULT '',
  override_by uuid REFERENCES members(id) ON DELETE SET NULL,
  override_reason text NOT NULL DEFAULT '',
  override_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ride_days_once ON ride_days(ride_id, day) WHERE ride_id IS NOT NULL;
CREATE INDEX ride_days_family_day ON ride_days(family_id, day);
CREATE INDEX ride_days_open ON ride_days(at_ts) WHERE state IN ('cho','da_nhan','dang_di','khong_ai');

CREATE TABLE ride_steps (
  ride_day_id uuid NOT NULL REFERENCES ride_days(id) ON DELETE CASCADE,
  step smallint NOT NULL,
  fired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_day_id, step)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title text NOT NULL,
  assignee_id uuid REFERENCES members(id) ON DELETE SET NULL,
  due_date date,
  done_at timestamptz,
  done_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  due_fired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_family ON tasks(family_id);

CREATE TABLE shopping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  text text NOT NULL,
  added_by uuid REFERENCES members(id) ON DELETE SET NULL,
  bought_at timestamptz,
  bought_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shopping_family ON shopping(family_id);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX notifications_member ON notifications(member_id, id DESC);
CREATE UNIQUE INDEX notifications_dedupe ON notifications(member_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE push_subs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  sid text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  types text[] NOT NULL DEFAULT '{ride,event,important,task,family}',
  fail_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, endpoint)
);
CREATE INDEX push_subs_sid ON push_subs(sid);

CREATE TABLE push_outbox (
  id bigserial PRIMARY KEY,
  sub_id uuid NOT NULL REFERENCES push_subs(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_outbox_open ON push_outbox(id) WHERE sent_at IS NULL;

CREATE TABLE ai_usage (
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  day date NOT NULL,
  n int NOT NULL DEFAULT 0,
  PRIMARY KEY (family_id, day)
);

CREATE TABLE idem (
  scope text NOT NULL,
  key text NOT NULL,
  status int,
  body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

-- thời khóa biểu nhập bằng lưới (để sửa lại được); các sự kiện lặp tuần được sinh từ đây
CREATE TABLE timetables (
  child_id uuid PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  periods jsonb NOT NULL,
  cells jsonb NOT NULL,
  start_date date NOT NULL,
  until_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
