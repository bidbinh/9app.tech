-- Sổ kép bất biến và ghi nhận thu/hoàn tiền (lát 1B). Ghi nợ dương, ghi có âm; tổng mỗi giao dịch bằng 0.

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  booking_id uuid,
  ref text NOT NULL,
  memo text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, ref),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, booking_id) REFERENCES bookings (org_id, id)
);
CREATE TRIGGER ledger_transactions_append_only BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE ledger_entries (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  tx_id uuid NOT NULL,
  account text NOT NULL CHECK (account IN (
    'bank', 'guest_deposit_liability', 'held_for_owner', 'anstay_revenue', 'vat_payable',
    'commission_expense', 'agent_commission_payable', 'cleaning_payable', 'cleaning_expense', 'receivable'
  )),
  party_id uuid,
  amount bigint NOT NULL CHECK (amount <> 0),
  FOREIGN KEY (org_id, tx_id) REFERENCES ledger_transactions (org_id, id)
);
CREATE INDEX ledger_entries_account ON ledger_entries (org_id, account, party_id);
CREATE INDEX ledger_entries_tx ON ledger_entries (tx_id);
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Ràng buộc hoãn tới lúc COMMIT: mọi giao dịch sổ phải cân bằng, kể cả khi ghi trực tiếp bằng SQL.
CREATE FUNCTION ledger_check_balance() RETURNS trigger AS $$
DECLARE s bigint;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO s FROM ledger_entries WHERE tx_id = NEW.tx_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'giao dịch sổ % không cân bằng (tổng %)', NEW.tx_id, s USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balance();

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deposit', 'payment', 'refund')),
  method text NOT NULL DEFAULT 'manual_bank' CHECK (method IN ('manual_bank', 'vietqr_webhook')),
  amount bigint NOT NULL CHECK (amount > 0),
  received_on date NOT NULL,
  note text NOT NULL DEFAULT '',
  recorded_by uuid,
  ledger_tx_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, booking_id) REFERENCES bookings (org_id, id),
  FOREIGN KEY (org_id, ledger_tx_id) REFERENCES ledger_transactions (org_id, id)
);
CREATE INDEX payments_booking ON payments (booking_id);
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION forbid_change();
