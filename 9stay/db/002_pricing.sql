-- Bảng giá, ưu đãi, báo giá, dòng giá bất biến (lát 1B).

-- Dùng chung cho các bảng chỉ được thêm (dòng giá, sổ, quyết toán, bản kê đã đóng băng).
CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bảng % chỉ được thêm, không sửa hoặc xóa', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TABLE rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('public', 'ctv')),
  name text NOT NULL,
  UNIQUE (org_id, code),
  UNIQUE (org_id, id)
);

CREATE TABLE rate_calendar (
  org_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  night date NOT NULL,
  price bigint NOT NULL CHECK (price >= 0),
  min_stay int NOT NULL DEFAULT 1 CHECK (min_stay >= 1),
  closed boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_type_id, plan_id, night),
  FOREIGN KEY (org_id, room_type_id) REFERENCES room_types (org_id, id),
  FOREIGN KEY (org_id, plan_id) REFERENCES rate_plans (org_id, id)
);

CREATE TABLE rate_calendar_history (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  night date NOT NULL,
  old_price bigint,
  new_price bigint NOT NULL,
  old_closed boolean,
  new_closed boolean NOT NULL,
  source text NOT NULL,
  changed_by uuid,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER rate_calendar_history_append_only BEFORE UPDATE OR DELETE ON rate_calendar_history FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pct', 'amount_per_night')),
  value bigint NOT NULL CHECK (value > 0),
  min_nights int NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  stay_from date NOT NULL,
  stay_to date NOT NULL,
  plan_id uuid,
  room_type_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stay_to > stay_from),
  CHECK (kind <> 'pct' OR value <= 100),
  FOREIGN KEY (org_id, plan_id) REFERENCES rate_plans (org_id, id),
  FOREIGN KEY (org_id, room_type_id) REFERENCES room_types (org_id, id)
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  checkin date NOT NULL,
  checkout date NOT NULL,
  adults int NOT NULL CHECK (adults >= 1),
  child_ages jsonb NOT NULL DEFAULT '[]',
  promotion_id uuid REFERENCES promotions(id),
  lines jsonb NOT NULL,
  subtotal bigint NOT NULL,
  vat bigint NOT NULL,
  total bigint NOT NULL,
  deposit bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, room_type_id) REFERENCES room_types (org_id, id),
  FOREIGN KEY (org_id, plan_id) REFERENCES rate_plans (org_id, id)
);

-- Mỗi báo giá chỉ được dùng một lần trong đời (đặt mới hoặc dời đơn), kể cả khi đơn đã chuyển sang báo giá khác.
CREATE TABLE quote_uses (
  quote_id uuid PRIMARY KEY REFERENCES quotes(id),
  booking_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings ADD COLUMN deposit_required bigint NOT NULL DEFAULT 0 CHECK (deposit_required >= 0);
ALTER TABLE bookings ADD COLUMN quote_id uuid REFERENCES quotes(id);
CREATE UNIQUE INDEX bookings_quote_unique ON bookings (quote_id) WHERE quote_id IS NOT NULL;

-- Dòng giá của đơn: bất biến, sửa đơn bằng dòng điều chỉnh (có thể âm).
CREATE TABLE price_lines (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('night', 'vat', 'adjust')),
  night date,
  label text NOT NULL,
  amount bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, booking_id) REFERENCES bookings (org_id, id)
);
CREATE INDEX price_lines_booking ON price_lines (booking_id);
CREATE TRIGGER price_lines_append_only BEFORE UPDATE OR DELETE ON price_lines FOR EACH ROW EXECUTE FUNCTION forbid_change();
