ALTER TABLE withdrawals ADD COLUMN idem_key text;
ALTER TABLE withdrawals ADD COLUMN not_before timestamptz NOT NULL DEFAULT now();
ALTER TABLE withdrawals ADD COLUMN bank_ref text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX withdrawals_idem ON withdrawals(user_id, idem_key) WHERE idem_key IS NOT NULL;
CREATE INDEX withdrawals_status ON withdrawals(status);
