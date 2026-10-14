-- Thành viên (người dùng 9id gắn vai trong một tổ chức) và mã mời (lát 1C). Một người dùng chỉ thuộc một tổ chức.

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('quanly', 'letan', 'buongphong', 'ctv', 'sale', 'chu')),
  owner_id uuid,
  agent_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  CHECK ((role = 'chu') = (owner_id IS NOT NULL)),
  CHECK ((role IN ('ctv', 'sale')) = (agent_id IS NOT NULL)),
  FOREIGN KEY (org_id, owner_id) REFERENCES owners (org_id, id),
  FOREIGN KEY (org_id, agent_id) REFERENCES agents (org_id, id)
);

-- Nhật ký thao tác nhạy cảm (mời, chi trả, mở/chặn ngày, đổi giá, đổi cài đặt...): chỉ thêm, chỉ chứa id.
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  actor uuid,
  action text NOT NULL,
  target text,
  data jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org ON audit_log (org_id, at DESC);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Mã mời chỉ lưu băm SHA-256; dùng một lần, có hạn.
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('quanly', 'letan', 'buongphong', 'ctv', 'sale', 'chu')),
  owner_id uuid,
  agent_id uuid,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'chu') = (owner_id IS NOT NULL)),
  CHECK ((role IN ('ctv', 'sale')) = (agent_id IS NOT NULL)),
  FOREIGN KEY (org_id, owner_id) REFERENCES owners (org_id, id),
  FOREIGN KEY (org_id, agent_id) REFERENCES agents (org_id, id)
);
