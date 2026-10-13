-- 030: Sức khỏe gia đình + Tiền gia đình. CHỈ CỘNG THÊM (bảng/cột/chỉ mục mới, IF NOT EXISTS), không đụng dữ liệu cũ.

-- ===== Sức khỏe: mỗi "đối tượng" là một đứa con (children) hoặc một người lớn (members) =====
CREATE TABLE IF NOT EXISTS health_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  sex text CHECK (sex IN ('nam','nu')),
  birth_date date,
  -- thành viên được xem: người lớn tự chọn chia sẻ hồ sơ của mình; với con là người phụ trách do chủ/quản lý chọn
  shared_with uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(child_id, member_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS health_subjects_child ON health_subjects(child_id) WHERE child_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS health_subjects_member ON health_subjects(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS health_subjects_family ON health_subjects(family_id);

-- số đo: weight (kg), height (cm), head (cm), bp (v1 tâm thu, v2 tâm trương, v3 mạch), glucose (mmol/L, ctx doi|sau_an|khac)
CREATE TABLE IF NOT EXISTS health_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES health_subjects(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('weight','height','head','bp','glucose')),
  v1 numeric(7,2) NOT NULL,
  v2 numeric(7,2),
  v3 numeric(7,2),
  ctx text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_measures_subject ON health_measures(subject_id, kind, day);

CREATE TABLE IF NOT EXISTS health_vaccines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES health_subjects(id) ON DELETE CASCADE,
  code text,                 -- mã mũi trong lịch TCMR (null = mũi tự thêm)
  name text NOT NULL,
  dose_no int NOT NULL DEFAULT 1,
  due_date date,
  done_on date,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS health_vaccines_code ON health_vaccines(subject_id, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS health_vaccines_subject ON health_vaccines(subject_id);

CREATE TABLE IF NOT EXISTS health_meds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES health_subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  dose text NOT NULL DEFAULT '',        -- ghi theo đơn của bác sĩ, app không tính liều
  times text[] NOT NULL DEFAULT '{}',   -- giờ uống HH:MM (giờ Việt Nam)
  start_date date NOT NULL,
  end_date date,
  stock int,                            -- số liều còn lại (tùy chọn)
  remind boolean NOT NULL DEFAULT true,
  notify_ids uuid[] NOT NULL DEFAULT '{}',
  note text NOT NULL DEFAULT '',
  stopped_at timestamptz,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_meds_subject ON health_meds(subject_id);

CREATE TABLE IF NOT EXISTS health_med_logs (
  med_id uuid NOT NULL REFERENCES health_meds(id) ON DELETE CASCADE,
  day date NOT NULL,
  time text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  taken_by uuid REFERENCES members(id) ON DELETE SET NULL,
  PRIMARY KEY (med_id, day, time)
);

CREATE TABLE IF NOT EXISTS health_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES health_subjects(id) ON DELETE CASCADE,
  day date NOT NULL,
  place text NOT NULL DEFAULT '',
  doctor text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  conclusion text NOT NULL DEFAULT '',
  prescription text NOT NULL DEFAULT '',
  recheck_date date,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_visits_subject ON health_visits(subject_id, day);

-- ===== Tiền: sổ nhẹ, không xử lý thanh toán =====
CREATE TABLE IF NOT EXISTS money_dues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  paid_on date,
  paid_by uuid REFERENCES members(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'thu_cong',  -- thu_cong | truong (nhập từ thông báo trường) | ...
  ext_key text,                             -- khóa chống nhập trùng của nơi gọi createDueItem
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS money_dues_ext ON money_dues(family_id, ext_key) WHERE ext_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS money_dues_family ON money_dues(family_id, due_date);

CREATE TABLE IF NOT EXISTS money_allowance (
  child_id uuid PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount bigint NOT NULL DEFAULT 0 CHECK (amount >= 0),
  period text NOT NULL DEFAULT 'tuan' CHECK (period IN ('tuan','thang')),
  goal_name text NOT NULL DEFAULT '',
  goal_amount bigint NOT NULL DEFAULT 0 CHECK (goal_amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- sổ tiêu vặt: dua (+ cha mẹ đưa), chi (- con tiêu), dieu_chinh (± sửa số dư)
CREATE TABLE IF NOT EXISTS money_allowance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dua','chi','dieu_chinh')),
  amount bigint NOT NULL,
  period_key text,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS money_allow_period ON money_allowance_log(child_id, period_key) WHERE period_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS money_allow_child ON money_allowance_log(child_id, day);

CREATE TABLE IF NOT EXISTS money_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  day date NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  category text NOT NULL DEFAULT 'khac' CHECK (category IN ('an_uong','di_cho','dien_nuoc','hoc_hanh','y_te','khac')),
  who uuid REFERENCES members(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS money_expenses_family ON money_expenses(family_id, day);

CREATE TABLE IF NOT EXISTS money_settings (
  family_id uuid PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  budget bigint NOT NULL DEFAULT 0 CHECK (budget >= 0),     -- ngân sách tháng, 0 = không đặt
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- mỗi lần nhắc chỉ phát đúng một lần (khóa chính chặn trùng khi khởi động lại hoặc chạy hai bản)
CREATE TABLE IF NOT EXISTS hm_fires (
  key text PRIMARY KEY,
  fired_at timestamptz NOT NULL DEFAULT now()
);

-- thêm loại thông báo health/money cho thiết bị đã đăng ký (chạy lại nhiều lần vẫn đúng)
ALTER TABLE push_subs ALTER COLUMN types SET DEFAULT '{ride,event,important,task,family,health,money}';
UPDATE push_subs SET types = types || '{health}'::text[] WHERE NOT ('health' = ANY(types));
UPDATE push_subs SET types = types || '{money}'::text[] WHERE NOT ('money' = ANY(types));
