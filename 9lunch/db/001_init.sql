CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  round500 boolean NOT NULL DEFAULT false,
  created_by_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teams_creator ON teams(created_by_hash, created_at);

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('chu','thanh_vien')),
  bank_bin text, bank_account text, bank_holder text,
  left_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX members_team ON members(team_id);

-- phiên ẩn danh: chỉ lưu băm SHA-256 của token trong cookie
CREATE TABLE phien (
  token_hash text NOT NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_hash, member_id)
);
CREATE INDEX phien_member ON phien(member_id);

CREATE TABLE meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  day date NOT NULL,
  status text NOT NULL DEFAULT 'binh_chon' CHECK (status IN ('binh_chon','dat_mon','thanh_toan','xong','huy')),
  kind text NOT NULL DEFAULT 'trua' CHECK (kind IN ('trua','cafe','sang','tiec')),
  code text NOT NULL UNIQUE,
  order_url text NOT NULL DEFAULT '',
  locked_at timestamptz,
  orderer_id uuid REFERENCES members(id),
  vote_deadline timestamptz,
  order_deadline timestamptz,
  payer_id uuid REFERENCES members(id),
  venue_id uuid,
  venue_name text,
  fee_ship bigint NOT NULL DEFAULT 0 CHECK (fee_ship >= 0),
  fee_service bigint NOT NULL DEFAULT 0 CHECK (fee_service >= 0),
  fee_tip bigint NOT NULL DEFAULT 0 CHECK (fee_tip >= 0),
  discount bigint NOT NULL DEFAULT 0 CHECK (discount >= 0),
  split_mode text NOT NULL DEFAULT 'ty_le' CHECK (split_mode IN ('ty_le','chia_deu')),
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  payment_at timestamptz,
  done_at timestamptz
);
CREATE INDEX meals_team_day ON meals(team_id, day DESC);
CREATE UNIQUE INDEX meals_one_active_per_day ON meals(team_id, day, kind) WHERE status IN ('binh_chon','dat_mon');

CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_key text NOT NULL,
  kind text NOT NULL DEFAULT 'trua',
  url text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_id, name_key)
);
CREATE INDEX proposals_team ON proposals(team_id);
ALTER TABLE meals ADD CONSTRAINT meals_venue_fk FOREIGN KEY (venue_id) REFERENCES proposals(id) ON DELETE SET NULL;

CREATE TABLE votes (
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  PRIMARY KEY (meal_id, member_id)
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial,
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name text NOT NULL,
  price bigint NOT NULL CHECK (price >= 0),
  qty int NOT NULL CHECK (qty BETWEEN 1 AND 99),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_meal ON items(meal_id);

CREATE TABLE nettings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'cho' CHECK (status IN ('cho','xong','huy')),
  created_by uuid NOT NULL REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE UNIQUE INDEX nettings_one_open ON nettings(team_id) WHERE status = 'cho';

-- khoản thu: member_id nợ payee_id. member_id = payee_id là phần của chính người ứng tiền (tự thanh toán).
CREATE TABLE charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id),
  payee_id uuid NOT NULL REFERENCES members(id),
  seq int NOT NULL,
  food bigint NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'chua_tra' CHECK (status IN ('chua_tra','da_chuyen','da_nhan')),
  content text NOT NULL DEFAULT '',
  payee_bin text, payee_account text, payee_holder text,
  qr_gen int NOT NULL DEFAULT 1,
  payee_changed_at timestamptz,
  netting_id uuid REFERENCES nettings(id) ON DELETE SET NULL,
  settled_by_netting boolean NOT NULL DEFAULT false,
  marked_at timestamptz,
  received_at timestamptz,
  UNIQUE (meal_id, member_id)
);
CREATE INDEX charges_payee ON charges(payee_id);
CREATE INDEX charges_member ON charges(member_id);

CREATE TABLE netting_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  netting_id uuid NOT NULL REFERENCES nettings(id) ON DELETE CASCADE,
  seq int NOT NULL,
  from_id uuid NOT NULL REFERENCES members(id),
  to_id uuid NOT NULL REFERENCES members(id),
  amount bigint NOT NULL CHECK (amount > 0),
  content text NOT NULL,
  bin text NOT NULL, account text NOT NULL, holder text NOT NULL,
  status text NOT NULL DEFAULT 'chua_tra' CHECK (status IN ('chua_tra','da_chuyen','da_nhan')),
  marked_at timestamptz,
  received_at timestamptz,
  UNIQUE (netting_id, seq)
);

-- dấu vết kiểm toán, không bao giờ xóa (trừ khi xóa cả nhóm)
CREATE TABLE charge_events (
  id bigserial PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  meal_id uuid,
  charge_id uuid,
  actor_id uuid,
  action text NOT NULL,
  detail jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX charge_events_team ON charge_events(team_id, id);

CREATE TABLE meal_ratings (
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (meal_id, member_id)
);

CREATE TABLE idem (
  scope text NOT NULL,
  key text NOT NULL,
  status int,
  body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);
