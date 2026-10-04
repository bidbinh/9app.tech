-- 9tutor: sổ dạy kèm cho gia sư. Mọi bảng dữ liệu đều có tutor_id; mọi truy vấn lọc theo tutor_id của phiên.

CREATE TABLE tutors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'chua_khai' CHECK (status IN ('chua_khai','sinh_vien','giao_vien_cong','giao_vien_khac','khac')),
  status_at timestamptz,
  bank_bin text, bank_account text, bank_holder text,
  recovery_hash text UNIQUE,
  recovery_at timestamptz,
  created_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutors_ip ON tutors(created_ip, created_at);

-- phiên ẩn danh: chỉ lưu băm SHA-256 của token trong cookie
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  ua text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_tutor ON sessions(tutor_id, created_at);

-- mã ghép thiết bị dùng một lần
CREATE TABLE pair_codes (
  code_hash text PRIMARY KEY,
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pair_codes_tutor ON pair_codes(tutor_id);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  grade text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  parent_name text NOT NULL DEFAULT '',
  parent_phone text NOT NULL DEFAULT '',
  parent_zalo text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  fee_model text NOT NULL DEFAULT 'buoi' CHECK (fee_model IN ('buoi','thang','goi')),
  fee_amount bigint NOT NULL DEFAULT 0 CHECK (fee_amount >= 0 AND fee_amount <= 100000000),
  package_sessions int NOT NULL DEFAULT 0 CHECK (package_sessions >= 0 AND package_sessions <= 200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tutor_id, code)
);
CREATE INDEX students_tutor ON students(tutor_id, active);

-- lịch dạy tuần lặp lại
CREATE TABLE slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_min smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  duration_min smallint NOT NULL CHECK (duration_min BETWEEN 15 AND 480),
  location text NOT NULL DEFAULT '',
  valid_from date NOT NULL,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slots_tutor ON slots(tutor_id, weekday);
CREATE INDEX slots_student ON slots(student_id);

-- buổi học cụ thể
CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES slots(id) ON DELETE SET NULL,
  slot_day date,
  day date NOT NULL,
  start_min smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  duration_min smallint NOT NULL CHECK (duration_min BETWEEN 15 AND 480),
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'du_kien' CHECK (status IN ('du_kien','da_day','hs_nghi','gs_huy')),
  billable boolean NOT NULL DEFAULT true,
  billing text NOT NULL DEFAULT '' CHECK (billing IN ('','buoi','thang','goi')),
  fee bigint NOT NULL DEFAULT 0 CHECK (fee >= 0 AND fee <= 100000000),
  makeup_of uuid REFERENCES lessons(id) ON DELETE SET NULL,
  topic text NOT NULL DEFAULT '',
  homework text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  private_note text NOT NULL DEFAULT '',
  marked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lessons_tutor_day ON lessons(tutor_id, day);
CREATE INDEX lessons_student_day ON lessons(student_id, day);
CREATE UNIQUE INDEX lessons_slot_occurrence ON lessons(slot_id, slot_day) WHERE slot_id IS NOT NULL;
CREATE UNIQUE INDEX lessons_one_makeup ON lessons(makeup_of) WHERE makeup_of IS NOT NULL;

-- khoản phải thu thêm (học phí tháng, bán gói, khác)
CREATE TABLE charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('thang','goi','khac')),
  period text CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount bigint NOT NULL CHECK (amount >= 0 AND amount <= 1000000000),
  sessions int NOT NULL DEFAULT 0 CHECK (sessions >= 0 AND sessions <= 200),
  on_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX charges_student ON charges(student_id, on_date);
CREATE INDEX charges_tutor ON charges(tutor_id, on_date);
CREATE UNIQUE INDEX charges_one_month ON charges(student_id, period) WHERE kind = 'thang';

-- tiền đã thu
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 1000000000),
  paid_on date NOT NULL,
  method text NOT NULL DEFAULT 'ck' CHECK (method IN ('ck','tm')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_student ON payments(student_id, paid_on);
CREATE INDEX payments_tutor ON payments(tutor_id, paid_on);

-- liên kết "Báo cáo cho phụ huynh": mã ngẫu nhiên 128 bit, thu hồi được
CREATE TABLE share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  show_comments boolean NOT NULL DEFAULT true,
  show_fee boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  views int NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX share_links_one_active ON share_links(student_id) WHERE revoked_at IS NULL;
CREATE INDEX share_links_tutor ON share_links(tutor_id);

-- trang giới thiệu gia sư công khai (tùy chọn)
CREATE TABLE profiles (
  tutor_id uuid PRIMARY KEY REFERENCES tutors(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  headline text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  subjects text NOT NULL DEFAULT '',
  levels text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  price_from int CHECK (price_from >= 0 AND price_from <= 100000000),
  price_to int CHECK (price_to >= 0 AND price_to <= 100000000),
  mode text NOT NULL DEFAULT 'ca_hai' CHECK (mode IN ('tai_nha','online','ca_hai')),
  contact text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idem (
  scope text NOT NULL,
  key text NOT NULL,
  status int,
  body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
