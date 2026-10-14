-- Tài khoản nhận tiền và hộp thư giao dịch ngân hàng (lát 2: VietQR + webhook). Tiền khách vào tài khoản công ty của Anstay;
-- 9app không bao giờ giữ tiền. Mọi giao dịch nhận được đều ghi vào bank_inbox TRƯỚC khi ghép với đơn.

CREATE TABLE org_bank_accounts (
  org_id uuid PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  bank_bin text NOT NULL CHECK (bank_bin ~ '^[0-9]{6}$'),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{6,20}$'),
  account_holder text NOT NULL CHECK (length(account_holder) BETWEEN 1 AND 120),
  -- mã bí mật nằm trong đường dẫn webhook (cùng với chữ ký của nhà cung cấp)
  webhook_token text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  bank_tx_id text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  content text NOT NULL DEFAULT '',
  occurred_at timestamptz,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'matched', 'needs_review', 'unmatched', 'resolved', 'dismissed')),
  booking_id uuid,
  payment_id uuid,
  note text NOT NULL DEFAULT '',
  raw jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider, bank_tx_id),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, booking_id) REFERENCES bookings (org_id, id)
);
CREATE INDEX bank_inbox_status ON bank_inbox (org_id, status, received_at DESC);
