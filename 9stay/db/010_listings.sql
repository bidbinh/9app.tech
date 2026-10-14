-- Chợ phòng (đặc tả 2026-10-14-9stay-cho-phong-design.md): tin đăng, ảnh, duyệt tòa/tin/giá. Động cơ đặt phòng giữ nguyên:
-- mỗi tin có một loại phòng riêng (room_type_id) nên giá, tìm trống, đặt và chia tiền chủ chạy như cũ.

ALTER TABLE buildings ADD COLUMN status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE buildings ADD COLUMN multi_owner boolean NOT NULL DEFAULT false;
ALTER TABLE buildings ADD COLUMN province text NOT NULL DEFAULT '' CHECK (length(province) <= 60);
ALTER TABLE buildings ADD COLUMN district text NOT NULL DEFAULT '' CHECK (length(district) <= 60);
ALTER TABLE buildings ADD COLUMN created_by_member uuid;
ALTER TABLE buildings ADD COLUMN reject_reason text NOT NULL DEFAULT '';

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  building_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  amenities text[] NOT NULL DEFAULT '{}',
  house_rules text NOT NULL DEFAULT '' CHECK (length(house_rules) <= 1500),
  cancel_policy text NOT NULL DEFAULT 'trung_binh' CHECK (cancel_policy IN ('linh_hoat', 'trung_binh', 'nghiem_ngat')),
  bedrooms int NOT NULL DEFAULT 1 CHECK (bedrooms BETWEEN 0 AND 20),
  beds int NOT NULL DEFAULT 1 CHECK (beds BETWEEN 1 AND 40),
  bathrooms int NOT NULL DEFAULT 1 CHECK (bathrooms BETWEEN 0 AND 20),
  capacity_std int NOT NULL DEFAULT 2 CHECK (capacity_std BETWEEN 1 AND 30),
  capacity_max int NOT NULL DEFAULT 4 CHECK (capacity_max BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  reject_reason text NOT NULL DEFAULT '',
  proposed_price bigint NOT NULL DEFAULT 0 CHECK (proposed_price >= 0),
  proposed_weekend_price bigint NOT NULL DEFAULT 0 CHECK (proposed_weekend_price >= 0),
  live_price bigint NOT NULL DEFAULT 0 CHECK (live_price >= 0),
  live_weekend_price bigint NOT NULL DEFAULT 0 CHECK (live_weekend_price >= 0),
  attest_building_allows boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  created_by uuid,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (capacity_max >= capacity_std),
  FOREIGN KEY (org_id, building_id) REFERENCES buildings (org_id, id),
  FOREIGN KEY (org_id, owner_id) REFERENCES owners (org_id, id),
  FOREIGN KEY (org_id, room_type_id) REFERENCES room_types (org_id, id),
  UNIQUE (id, owner_id),
  UNIQUE (room_type_id),
  UNIQUE (org_id, id)
);
CREATE INDEX listings_status ON listings (org_id, status);

-- Mỗi căn thuộc tối đa một tin; chủ của căn bắt buộc trùng chủ của tin (khóa ngoại ghép, CSDL giữ chứ không chỉ mã).
CREATE TABLE listing_units (
  listing_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  unit_id uuid NOT NULL UNIQUE,
  -- Trạng thái của căn TRƯỚC khi gắn vào tin (để gỡ thì khôi phục). NULL = căn do chính tin này tạo ra (gỡ/xóa tin thì xóa căn).
  prev_room_type_id uuid,
  prev_status text,
  prev_capacity_std int,
  prev_capacity_max int,
  PRIMARY KEY (listing_id, unit_id),
  FOREIGN KEY (listing_id, owner_id) REFERENCES listings (id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id, owner_id) REFERENCES units (id, owner_id)
);

CREATE TABLE listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  bytes int NOT NULL CHECK (bytes > 0),
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_photos_listing ON listing_photos (listing_id, position);

-- Đổi giá sau khi tin đã duyệt cũng phải duyệt; giá đang chạy giữ nguyên cho tới khi duyệt.
CREATE TABLE price_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  proposed_price bigint NOT NULL CHECK (proposed_price > 0),
  proposed_weekend_price bigint NOT NULL CHECK (proposed_weekend_price > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason text NOT NULL DEFAULT '',
  proposed_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- tối đa một đề xuất đang chờ cho mỗi tin
CREATE UNIQUE INDEX price_changes_one_pending ON price_changes (listing_id) WHERE status = 'pending';
