-- Vận hành: buồng phòng (việc dọn), đồng bộ iCal hai chiều.

CREATE TABLE housekeeping_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL,
  booking_id uuid,
  kind text NOT NULL DEFAULT 'checkout_clean' CHECK (kind IN ('checkout_clean', 'manual')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  due_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  updated_by uuid,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, unit_id) REFERENCES units (org_id, id),
  FOREIGN KEY (org_id, booking_id) REFERENCES bookings (org_id, id)
);
-- mỗi đơn chỉ sinh một việc dọn khi trả phòng
CREATE UNIQUE INDEX housekeeping_one_per_booking ON housekeeping_tasks (booking_id) WHERE kind = 'checkout_clean';
CREATE INDEX housekeeping_open ON housekeeping_tasks (org_id, status, due_date);

-- Nguồn iCal nhập vào (lịch của căn trên Booking.com/Airbnb...): các đêm trong nguồn bị chặn ở 9stay.
CREATE TABLE ical_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  url text NOT NULL CHECK (length(url) <= 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_sync_at timestamptz,
  last_error text,
  last_conflicts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, unit_id) REFERENCES units (org_id, id),
  UNIQUE (org_id, id)
);

-- Các đêm đã chặn nhờ nguồn này; prev_kind là trạng thái trước đó (NULL = chưa có dòng) để hoàn lại khi nguồn bỏ đêm.
CREATE TABLE ical_nights (
  feed_id uuid NOT NULL REFERENCES ical_feeds(id) ON DELETE CASCADE,
  night date NOT NULL,
  prev_kind text,
  PRIMARY KEY (feed_id, night)
);

-- Lịch xuất ra cho OTA đọc: một mã bí mật cho mỗi căn.
CREATE TABLE ical_exports (
  unit_id uuid PRIMARY KEY REFERENCES units(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
