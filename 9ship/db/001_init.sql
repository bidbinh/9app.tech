-- 9Ship: lược đồ ban đầu. Tiền là BIGINT đồng.

CREATE TABLE users (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL UNIQUE,
  name        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id        bigserial PRIMARY KEY,
  user_id   bigint NOT NULL REFERENCES users(id),
  label     text NOT NULL DEFAULT '',
  contact   text NOT NULL,
  phone     text NOT NULL,
  street    text NOT NULL,
  ward      text NOT NULL DEFAULT '',
  province  text NOT NULL,
  lat       double precision,
  lng       double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user ON addresses(user_id);

CREATE TABLE carrier_area_map (
  carrier       text NOT NULL,
  our_code      text NOT NULL,
  carrier_codes jsonb NOT NULL,
  PRIMARY KEY (carrier, our_code)
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    bigint REFERENCES users(id),
  role       text NOT NULL DEFAULT 'user',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otps (
  id         bigserial PRIMARY KEY,
  phone      text NOT NULL,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  tries      int NOT NULL DEFAULT 0,
  used       boolean NOT NULL DEFAULT false,
  ip         text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otps_phone ON otps(phone, created_at);
CREATE INDEX otps_ip ON otps(ip, created_at);

CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE quotes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    bigint REFERENCES users(id),
  request    jsonb NOT NULL,
  offers     jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shipments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            bigint NOT NULL REFERENCES users(id),
  quote_id           uuid REFERENCES quotes(id),
  idem_key           text NOT NULL,
  carrier            text NOT NULL,
  service            text NOT NULL,
  contract           text NOT NULL DEFAULT '',
  carrier_ref        text NOT NULL UNIQUE,
  carrier_code       text,
  tracking_code      text,
  handover           text NOT NULL,
  pickup_point_id    text,
  goods_type         text NOT NULL DEFAULT 'general',
  declared_value     bigint NOT NULL DEFAULT 0,
  weight_g           int NOT NULL,
  shipping_status    text NOT NULL DEFAULT 'pending_carrier',
  cancel_status      text NOT NULL DEFAULT 'none',
  payment_status     text NOT NULL DEFAULT 'held',
  price_book_version text NOT NULL DEFAULT '',
  cost_price         bigint NOT NULL,
  sell_price         bigint NOT NULL,
  list_price         bigint,
  hold_amount        bigint NOT NULL DEFAULT 0,
  buffer_amount      bigint NOT NULL DEFAULT 0,
  fee_confirmed      bigint,
  buffer_open        boolean NOT NULL DEFAULT false,
  needs_attention    text,
  sender             jsonb NOT NULL,
  receiver           jsonb NOT NULL,
  delivered_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idem_key)
);
CREATE INDEX shipments_user ON shipments(user_id, created_at DESC);
CREATE INDEX shipments_code ON shipments(carrier, carrier_code);

CREATE TABLE tracking_events (
  id               bigserial PRIMARY KEY,
  shipment_id      uuid NOT NULL REFERENCES shipments(id),
  carrier_event_id text NOT NULL,
  status           text NOT NULL,
  note             text NOT NULL DEFAULT '',
  event_at         timestamptz NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  raw              jsonb,
  UNIQUE (shipment_id, carrier_event_id)
);

CREATE TABLE accounts (
  id         bigserial PRIMARY KEY,
  owner_type text NOT NULL,
  owner_id   text NOT NULL,
  kind       text NOT NULL,
  UNIQUE (owner_type, owner_id, kind)
);

CREATE TABLE ledger_transactions (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,
  idem_scope   text NOT NULL,
  idem_key     text NOT NULL,
  payload_hash text NOT NULL,
  shipment_id  uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idem_scope, idem_key)
);

CREATE TABLE ledger_entries (
  id         bigserial PRIMARY KEY,
  tx_id      bigint NOT NULL REFERENCES ledger_transactions(id),
  account_id bigint NOT NULL REFERENCES accounts(id),
  amount     bigint NOT NULL CHECK (amount <> 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account ON ledger_entries(account_id);
CREATE INDEX ledger_entries_tx ON ledger_entries(tx_id);

-- Chỉ ghi thêm: chặn UPDATE/DELETE trên sổ cái.
CREATE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_entries_ro BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER ledger_tx_ro BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

CREATE TABLE pickup_points (
  id        text PRIMARY KEY,
  carrier   text NOT NULL,
  type      text NOT NULL DEFAULT 'carrier_office',
  name      text NOT NULL,
  address   text NOT NULL,
  lat       double precision NOT NULL,
  lng       double precision NOT NULL,
  hours     text NOT NULL DEFAULT '',
  source    text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pickup_points_carrier ON pickup_points(carrier);

CREATE TABLE pricing_rules (
  id          bigserial PRIMARY KEY,
  carrier     text NOT NULL DEFAULT '*',
  route       text NOT NULL DEFAULT '*',
  margin_pct  numeric NOT NULL DEFAULT 8,
  margin_min  bigint NOT NULL DEFAULT 1000,
  surcharge   bigint NOT NULL DEFAULT 0,
  rounding    int NOT NULL DEFAULT 500,
  allow_loss  boolean NOT NULL DEFAULT false,
  require_cap boolean NOT NULL DEFAULT true,
  active      boolean NOT NULL DEFAULT true,
  UNIQUE (carrier, route)
);

CREATE TABLE list_prices (
  id          bigserial PRIMARY KEY,
  carrier     text NOT NULL,
  service     text NOT NULL,
  route       text NOT NULL DEFAULT '*',
  max_weight_g int NOT NULL,
  price       bigint NOT NULL,
  vat_included boolean NOT NULL DEFAULT false,
  source      text NOT NULL DEFAULT '',
  owner       text NOT NULL DEFAULT '',
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (carrier, service, route, max_weight_g)
);

CREATE TABLE carrier_fee_versions (
  id              bigserial PRIMARY KEY,
  shipment_id     uuid NOT NULL REFERENCES shipments(id),
  version         int NOT NULL,
  total           bigint NOT NULL,
  breakdown       jsonb,
  source          text NOT NULL,
  source_event_id text,
  at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, version)
);
CREATE UNIQUE INDEX fee_versions_event ON carrier_fee_versions(shipment_id, source, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE TABLE adjustments (
  id           bigserial PRIMARY KEY,
  shipment_id  uuid NOT NULL REFERENCES shipments(id),
  kind         text NOT NULL,
  amount       bigint NOT NULL,
  reason       text NOT NULL DEFAULT '',
  ledger_tx_id bigint,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  id          bigserial PRIMARY KEY,
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  kind        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending',
  attempts    int NOT NULL DEFAULT 0,
  next_at     timestamptz NOT NULL DEFAULT now(),
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, kind)
);
CREATE INDEX outbox_due ON outbox(status, next_at);

CREATE TABLE topups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    bigint NOT NULL REFERENCES users(id),
  amount     bigint NOT NULL CHECK (amount > 0),
  code       text NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  bank_tx_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_inbox (
  bank_tx_id text PRIMARY KEY,
  amount     bigint NOT NULL,
  content    text NOT NULL DEFAULT '',
  raw        jsonb,
  status     text NOT NULL DEFAULT 'new',
  matched_topup_id uuid,
  note       text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE withdrawals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     bigint NOT NULL REFERENCES users(id),
  amount      bigint NOT NULL CHECK (amount > 0),
  bank_account jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'requested',
  payout_ref  text NOT NULL UNIQUE,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  id          bigserial PRIMARY KEY,
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  user_id     bigint NOT NULL REFERENCES users(id),
  kind        text NOT NULL,
  status      text NOT NULL DEFAULT 'received',
  description text NOT NULL DEFAULT '',
  deadline    timestamptz,
  evidence    jsonb NOT NULL DEFAULT '[]',
  partner_ref text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit (
  id         bigserial PRIMARY KEY,
  admin      text NOT NULL,
  action     text NOT NULL,
  target     text NOT NULL DEFAULT '',
  before     jsonb,
  after      jsonb,
  reason     text NOT NULL DEFAULT '',
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER admin_audit_ro BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

INSERT INTO pricing_rules(carrier, route, margin_pct, margin_min, surcharge, rounding, require_cap)
VALUES ('*', '*', 8, 1000, 0, 500, true);
