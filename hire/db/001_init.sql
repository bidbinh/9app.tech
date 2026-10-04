-- Nhà tuyển dụng: ẩn danh, vào lại bằng mã khôi phục (chỉ lưu băm SHA-256)
CREATE TABLE employers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  name text NOT NULL,
  recovery_hash text NOT NULL UNIQUE,
  created_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- phiên: chỉ lưu băm SHA-256 của token trong cookie
CREATE TABLE phien (
  token_hash text PRIMARY KEY,
  employer_id uuid NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phien_employer ON phien(employer_id, created_at);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  employer_id uuid NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lam_them','ban_tg','toan_tg','thoi_vu','van_phong')),
  category text NOT NULL CHECK (category IN ('phuc_vu','bep','ban_hang','kho','giao_hang','tap_vu','san_xuat','van_phong','khac')),
  description text NOT NULL,
  requirements text NOT NULL DEFAULT '',
  pay_type text NOT NULL CHECK (pay_type IN ('gio','ngay','ca','thang','thoa_thuan')),
  pay_min bigint CHECK (pay_min IS NULL OR pay_min >= 0),
  pay_max bigint CHECK (pay_max IS NULL OR pay_max >= 0),
  shifts text[] NOT NULL DEFAULT '{}',
  shift_note text NOT NULL DEFAULT '',
  city text NOT NULL CHECK (city IN ('hcm','hn','dn','hp','ct','khac')),
  district text NOT NULL,
  district_key text NOT NULL,
  address text NOT NULL DEFAULT '',
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  start_now boolean NOT NULL DEFAULT false,
  slots int NOT NULL DEFAULT 1 CHECK (slots BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'dang' CHECK (status IN ('dang','dong','an')),
  hidden_reason text,
  risk smallint NOT NULL DEFAULT 0,
  risk_notes text[] NOT NULL DEFAULT '{}',
  content_hash text NOT NULL,
  search_key text NOT NULL,
  renew_count int NOT NULL DEFAULT 0,
  created_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz
);
CREATE INDEX jobs_feed ON jobs(seq DESC) WHERE status = 'dang';
CREATE INDEX jobs_employer ON jobs(employer_id, seq DESC);
CREATE INDEX jobs_hash ON jobs(content_hash, created_at);
CREATE INDEX jobs_ip ON jobs(created_ip, created_at);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_hash text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  message text NOT NULL DEFAULT '',
  start_now boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'moi' CHECK (status IN ('moi','da_lien_he','nhan','loai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, applicant_hash),
  UNIQUE (job_id, phone)
);
CREATE INDEX applications_job ON applications(job_id, seq DESC);

-- báo cáo tin: mỗi phiên một báo cáo, mỗi IP một báo cáo cho mỗi tin
CREATE TABLE reports (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reporter_hash text NOT NULL,
  ip text NOT NULL,
  reason text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, reporter_hash),
  UNIQUE (job_id, ip)
);

-- người đã xem liên hệ (sau khi xác nhận cảnh báo): đếm cho nhà tuyển dụng, không lưu danh tính
CREATE TABLE reveals (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  viewer_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, viewer_hash)
);

-- hạn mức theo khóa (ngày/giờ): tăng nguyên tử, không có điều kiện chạy đua
CREATE TABLE quota (
  key text PRIMARY KEY,
  n int NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
