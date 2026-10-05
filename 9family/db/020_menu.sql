-- Thực đơn tuần và đi chợ nâng cao. Chỉ CỘNG THÊM (bảng mới, cột mới có mặc định), chạy lại nhiều lần vẫn an toàn.

-- Hồ sơ ăn uống của gia đình (một dòng mỗi gia đình) và món đã ẩn vĩnh viễn
CREATE TABLE IF NOT EXISTS menu_profiles (
  family_id uuid PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  hidden_dishes text[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES members(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Thực đơn theo tuần (week_start = thứ hai). status: nhap | chot
CREATE TABLE IF NOT EXISTS menu_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  plan jsonb NOT NULL,
  locks text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'nhap',
  gen int NOT NULL DEFAULT 1,
  shop_synced_at timestamptz,
  shop_stale boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS menu_plans_week ON menu_plans(family_id, week_start);

-- Danh sách đi chợ: thêm số lượng, đơn vị, khu quầy, nguồn (tay / giọng nói / thực đơn / Osin)
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS qty numeric(10,2);
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS aisle text;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS ingredient_id text;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tay';
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS plan_week date;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS from_dishes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS have boolean NOT NULL DEFAULT false;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS norm_key text;
ALTER TABLE shopping ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- mỗi nguyên liệu của một tuần thực đơn chỉ có đúng một dòng (chặn tạo trùng khi hai người bấm cùng lúc)
CREATE UNIQUE INDEX IF NOT EXISTS shopping_menu_line ON shopping(family_id, plan_week, ingredient_id) WHERE source = 'thuc_don';
CREATE INDEX IF NOT EXISTS shopping_open ON shopping(family_id) WHERE bought_at IS NULL;
