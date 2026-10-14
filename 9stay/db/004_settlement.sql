-- Sale/CTV và quyết toán khi trả phòng (lát 1B).

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sale', 'ctv')),
  commission_pct int NOT NULL CHECK (commission_pct BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

ALTER TABLE bookings ADD CONSTRAINT bookings_agent_fk FOREIGN KEY (org_id, agent_id) REFERENCES agents (org_id, id);
-- Tỉ lệ hoa hồng chụp lúc đặt: đổi tỉ lệ hoặc khóa sale sau đó không ảnh hưởng đơn đã đặt.
ALTER TABLE bookings ADD COLUMN commission_pct int CHECK (commission_pct BETWEEN 0 AND 100);

-- Mỗi đơn đúng một quyết toán, bất biến. Mọi bản kê tính từ bảng này.
CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  booking_id uuid NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'stay' CHECK (kind IN ('stay', 'cancel')),
  owner_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  agent_id uuid,
  checkout_date date NOT NULL,
  room_revenue bigint NOT NULL CHECK (room_revenue >= 0),
  vat bigint NOT NULL CHECK (vat >= 0),
  owner_amount bigint NOT NULL CHECK (owner_amount >= 0),
  anstay_amount bigint NOT NULL,
  commission bigint NOT NULL CHECK (commission >= 0),
  cleaning_fee bigint NOT NULL CHECK (cleaning_fee >= 0),
  cleaning_payer text NOT NULL CHECK (cleaning_payer IN ('owner', 'anstay', 'guest')),
  ledger_tx_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, booking_id) REFERENCES bookings (org_id, id),
  FOREIGN KEY (org_id, owner_id) REFERENCES owners (org_id, id),
  FOREIGN KEY (org_id, unit_id) REFERENCES units (org_id, id),
  FOREIGN KEY (org_id, agent_id) REFERENCES agents (org_id, id),
  FOREIGN KEY (org_id, ledger_tx_id) REFERENCES ledger_transactions (org_id, id)
);
CREATE INDEX settlements_owner ON settlements (org_id, owner_id, checkout_date);
CREATE INDEX settlements_agent ON settlements (org_id, agent_id, checkout_date);
CREATE TRIGGER settlements_append_only BEFORE UPDATE OR DELETE ON settlements FOR EACH ROW EXECUTE FUNCTION forbid_change();
