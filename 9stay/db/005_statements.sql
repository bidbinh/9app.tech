-- Bản kê chủ phòng và hoa hồng: đóng băng (bất biến), chi trả ghi riêng (lát 1B).
-- Mỗi quyết toán chỉ nằm trong tối đa một bản kê chủ và một bản kê hoa hồng (UNIQUE settlement_id).

CREATE TABLE owner_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_room bigint NOT NULL,
  total_owner bigint NOT NULL,
  total_cleaning bigint NOT NULL,
  total_carried bigint NOT NULL DEFAULT 0,
  payable bigint NOT NULL,
  line_count int NOT NULL CHECK (line_count > 0),
  frozen_by uuid,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, owner_id) REFERENCES owners (org_id, id)
);

-- Bản kê âm (chủ còn nợ) được mang sang bản kê kế tiếp đúng một lần.
CREATE TABLE owner_statement_carries (
  from_statement_id uuid PRIMARY KEY REFERENCES owner_statements(id),
  into_statement_id uuid NOT NULL REFERENCES owner_statements(id),
  amount bigint NOT NULL CHECK (amount < 0)
);
CREATE TRIGGER owner_statement_carries_append_only BEFORE UPDATE OR DELETE ON owner_statement_carries FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER owner_statements_append_only BEFORE UPDATE OR DELETE ON owner_statements FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE owner_statement_lines (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  statement_id uuid NOT NULL,
  settlement_id uuid NOT NULL UNIQUE,
  booking_code text NOT NULL,
  checkout_date date NOT NULL,
  room_revenue bigint NOT NULL,
  owner_amount bigint NOT NULL,
  cleaning_fee bigint NOT NULL,
  amount bigint NOT NULL,
  FOREIGN KEY (org_id, statement_id) REFERENCES owner_statements (org_id, id),
  FOREIGN KEY (org_id, settlement_id) REFERENCES settlements (org_id, id)
);
CREATE TRIGGER owner_statement_lines_append_only BEFORE UPDATE OR DELETE ON owner_statement_lines FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE owner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  statement_id uuid NOT NULL UNIQUE,
  amount bigint NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  paid_by uuid,
  ledger_tx_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, statement_id) REFERENCES owner_statements (org_id, id),
  FOREIGN KEY (org_id, ledger_tx_id) REFERENCES ledger_transactions (org_id, id)
);
CREATE TRIGGER owner_payouts_append_only BEFORE UPDATE OR DELETE ON owner_payouts FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE agent_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_room bigint NOT NULL,
  payable bigint NOT NULL,
  line_count int NOT NULL CHECK (line_count > 0),
  frozen_by uuid,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, agent_id) REFERENCES agents (org_id, id)
);
CREATE TRIGGER agent_statements_append_only BEFORE UPDATE OR DELETE ON agent_statements FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE agent_statement_lines (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  statement_id uuid NOT NULL,
  settlement_id uuid NOT NULL UNIQUE,
  booking_code text NOT NULL,
  checkout_date date NOT NULL,
  room_revenue bigint NOT NULL,
  amount bigint NOT NULL,
  FOREIGN KEY (org_id, statement_id) REFERENCES agent_statements (org_id, id),
  FOREIGN KEY (org_id, settlement_id) REFERENCES settlements (org_id, id)
);
CREATE TRIGGER agent_statement_lines_append_only BEFORE UPDATE OR DELETE ON agent_statement_lines FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE agent_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  statement_id uuid NOT NULL UNIQUE,
  amount bigint NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  paid_by uuid,
  ledger_tx_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, statement_id) REFERENCES agent_statements (org_id, id),
  FOREIGN KEY (org_id, ledger_tx_id) REFERENCES ledger_transactions (org_id, id)
);
CREATE TRIGGER agent_payouts_append_only BEFORE UPDATE OR DELETE ON agent_payouts FOR EACH ROW EXECUTE FUNCTION forbid_change();
