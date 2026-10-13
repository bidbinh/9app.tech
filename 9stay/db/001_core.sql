-- 9stay: lược đồ cốt lõi (lát 1A). Mọi bảng thuộc một org. Đêm là kiểu date.
-- Khóa ngoại ghép (org_id, id) bảo đảm các thực thể liên quan cùng thuộc một org ngay ở tầng CSDL.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_counters (
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  value bigint NOT NULL,
  PRIMARY KEY (org_id, name)
);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  legal_type text NOT NULL DEFAULT 'can_ho_du_lich' CHECK (legal_type IN ('can_ho_du_lich', 'nha_o', 'khac')),
  rules_note text NOT NULL DEFAULT '',
  declared_by_default text NOT NULL DEFAULT 'anstay' CHECK (declared_by_default IN ('anstay', 'owner', 'bql')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ca_nhan', 'to_chuc')),
  name text NOT NULL,
  tax_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity_std int NOT NULL DEFAULT 2 CHECK (capacity_std > 0),
  capacity_max int NOT NULL DEFAULT 4,
  CHECK (capacity_max >= capacity_std),
  UNIQUE (org_id, id)
);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  building_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  code text NOT NULL,
  floor int,
  capacity_std int NOT NULL CHECK (capacity_std > 0),
  capacity_max int NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, code),
  UNIQUE (org_id, id),
  UNIQUE (id, owner_id),
  CHECK (capacity_max >= capacity_std),
  FOREIGN KEY (org_id, building_id) REFERENCES buildings (org_id, id),
  FOREIGN KEY (org_id, owner_id) REFERENCES owners (org_id, id),
  FOREIGN KEY (org_id, room_type_id) REFERENCES room_types (org_id, id)
);

-- valid_to là ngày KẾT THÚC KHÔNG BAO GỒM (nửa mở, như mọi khoảng đêm khác); NULL = không thời hạn.
CREATE TABLE owner_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('revenue_share', 'master_lease')),
  valid_from date NOT NULL,
  valid_to date,
  owner_share_pct int NOT NULL DEFAULT 70 CHECK (owner_share_pct BETWEEN 0 AND 100),
  owner_net_floor bigint NOT NULL DEFAULT 0 CHECK (owner_net_floor >= 0),
  fixed_rent bigint NOT NULL DEFAULT 0 CHECK (fixed_rent >= 0),
  cleaning_payer text NOT NULL DEFAULT 'owner' CHECK (cleaning_payer IN ('owner', 'anstay', 'guest')),
  cancel_penalty_pct int NOT NULL DEFAULT 20 CHECK (cancel_penalty_pct BETWEEN 0 AND 100),
  statement_cycle text NOT NULL DEFAULT 'month' CHECK (statement_cycle IN ('month', 'half')),
  payout_delay_days int NOT NULL DEFAULT 3 CHECK (payout_delay_days >= 0),
  tax_withhold boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  FOREIGN KEY (org_id, unit_id) REFERENCES units (org_id, id),
  FOREIGN KEY (unit_id, owner_id) REFERENCES units (id, owner_id),
  EXCLUDE USING gist (unit_id WITH =, daterange(valid_from, valid_to) WITH &&)
);

-- Chủ mở bán hoặc chặn từng đêm. Không có dòng = chưa mở bán.
CREATE TABLE owner_releases (
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  night date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('open', 'owner_use', 'blocked_by_owner', 'blocked_by_anstay')),
  source text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'ical', 'manual')),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, night)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  guest_name text NOT NULL,
  guest_phone text,
  adults int NOT NULL CHECK (adults >= 1),
  children int NOT NULL DEFAULT 0 CHECK (children >= 0),
  source text NOT NULL DEFAULT 'direct',
  agent_id uuid,
  created_by uuid,
  status text NOT NULL CHECK (status IN ('giu', 'da_coc', 'da_nhan', 'da_tra', 'huy', 'khong_den', 'het_han')),
  hold_until timestamptz,
  cancel_reason text,
  cancel_policy jsonb NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code),
  UNIQUE (org_id, id)
);

-- Nguồn chống trùng duy nhất: mỗi (căn, đêm) tối đa một dòng hoạt động.
CREATE TABLE room_nights (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  night date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (org_id, booking_id) REFERENCES bookings (org_id, id),
  FOREIGN KEY (org_id, unit_id) REFERENCES units (org_id, id)
);
CREATE UNIQUE INDEX room_nights_active_unit_night ON room_nights (unit_id, night) WHERE active;
CREATE INDEX room_nights_booking ON room_nights (booking_id);

CREATE TABLE booking_events (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  kind text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('org', 'building', 'owner', 'unit')),
  scope_id uuid,
  key text NOT NULL,
  value jsonb NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'org') = (scope_id IS NULL))
);
CREATE INDEX settings_lookup ON settings (org_id, key, scope_type, scope_id, effective_from DESC);
