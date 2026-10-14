# 9stay Lát 1A: nền dữ liệu và động cơ đặt phòng chống trùng

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng thư mục `9stay/` với lược đồ PostgreSQL, cài đặt theo phạm vi, tòa/căn/chủ/hợp đồng, quyền chặn ngày của chủ, và động cơ đặt/hủy/dời phòng không thể đặt trùng, tất cả kiểm thử được bằng PostgreSQL thật. Chưa có HTTP, đăng nhập, giao diện, tiền.

**Architecture:** Thư viện ES module thuần. Mọi hàm nghiệp vụ nhận `c` (giao dịch từ `db.tx`) làm tham số đầu và phải chạy trong giao dịch. Chống trùng có hai lớp: khóa dòng `owner_releases` (`SELECT ... FOR UPDATE`) để tuần tự hóa, và chỉ mục duy nhất từng phần `room_nights(unit_id, night) WHERE active` làm hàng rào cuối. Đồng hồ được tiêm vào (`now`) để test được.

**Tech Stack:** Node >= 20 (ESM), `pg`, `embedded-postgres` (dev), `node:test`. Theo đúng quy ước của `9lunch/` (cấu trúc thư mục, `db.js`, `scripts/test.js`, `scripts/embedded-pg.js`).

**Spec:** `docs/superpowers/specs/2026-10-13-9stay-design.md` (v3, mục 4, 5, 6, 14). Lát 1A thực hiện phần: nền, tòa/căn/chủ/hợp đồng, `owner_releases`, `room_nights`, `bookings` (giữ chỗ nội bộ), `settings`.

## Global Constraints

- Tiền là số nguyên VND (chưa dùng ở lát này). Đêm là kiểu `date`, truyền dưới dạng chuỗi `YYYY-MM-DD`; không bao giờ để `pg` đổi sang `Date`.
- Đặt 12→14 là hai đêm (12 và 13); đêm 14 bán lại được. Khoảng đêm luôn nửa mở `[checkin, checkout)`.
- Múi giờ cố định `Asia/Ho_Chi_Minh`; "hôm nay" tính bằng `todayVN(now)`.
- Chống trùng là nguồn duy nhất: `room_nights` với `UNIQUE (unit_id, night) WHERE active`.
- Sự kiện (`booking_events`) chỉ chứa id và ngày, không chứa tên hay SĐT.
- Thông báo lỗi cho người dùng bằng tiếng Việt; mã lỗi (`code`) bằng tiếng Anh snake_case.
- Mọi hàm đổi dữ liệu phải chạy trong `db.tx`; lỗi nghiệp vụ ném `AppError(code, message, status, detail)`.
- Không đụng các tệp ngoài `9stay/` và `docs/` (repo đang có thay đổi chưa commit ở `9family/`, `scanner/`).

## Review Focus

1. Trả phòng và đặt lại cùng ngày: 12→14 rồi 14→16 cùng căn phải thành công (Task 4).
2. Đặt đêm chưa mở bán hoặc đang chủ tự dùng/chặn: phải từ chối với `not_released`/`unit_blocked`, nêu đêm nào (Task 4).
3. Chủ chặn đêm đã có khách, và chủ chặn đồng thời với lễ tân đặt: không bao giờ cả hai thành công (Task 5).
4. Đầu vào lạ: ngày không tồn tại (2026-02-30), ngày đi trước ngày đến, hơn 366 đêm, số khách 0, tên rỗng, số điện thoại có chữ, vượt sức chứa (Task 2, 4).
5. Hủy hai lần không lỗi; hủy đơn đã nhận phòng bị từ chối; đặt ngày đến là "hôm nay" theo giờ Việt Nam khi UTC còn là hôm qua (Task 2, 4, 5).

---

### Task 1: Khung dự án, lược đồ và kiểm thử chạy được

**Files:**
- Create: `9stay/package.json`
- Create: `9stay/scripts/embedded-pg.js`
- Create: `9stay/scripts/test.js`
- Create: `9stay/src/config.js`
- Create: `9stay/src/errors.js`
- Create: `9stay/src/db.js`
- Create: `9stay/db/001_core.sql`
- Test: `9stay/test/schema.test.js`

**Interfaces:**
- Produces: `db.js` xuất `query(sql, params)`, `tx(fn)` (fn nhận `c` có `c.query(sql, params) -> rows`), `migrate()`, `resetForTests()`, `close()`. `errors.js` xuất `class AppError(code, message, status = 400, detail = undefined)`. `config.js` xuất `config.databaseUrl`.

- [ ] **Step 1: Tạo nhánh làm việc và thư mục**

```bash
cd /d/9app.tech
git checkout -b feat/9stay
mkdir -p 9stay/scripts 9stay/src 9stay/db 9stay/test
```

- [ ] **Step 2: Tạo `9stay/package.json`**

```json
{
  "name": "9stay",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "9stay: phân phối phòng của nhiều chủ qua sale và cộng tác viên.",
  "scripts": {
    "test": "node scripts/test.js"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "embedded-postgres": "^18.4.0-beta.17"
  }
}
```

- [ ] **Step 3: Tạo `9stay/scripts/embedded-pg.js`**

```js
// Dựng PostgreSQL thật (embedded-postgres) ở cổng ngẫu nhiên trong thư mục tạm, dùng cho phát triển và kiểm thử.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

// dir: thư mục dữ liệu cố định (dev); bỏ trống = thư mục tạm, xóa khi dừng.
export async function startEmbedded({ dir, database = 'stay' } = {}) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const temp = !dir;
  const dataDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), '9stay-pg-'));
  const port = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dataDir, 'data'), user: 'postgres', password: 'stay', port, persistent: !temp, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  if (!fs.existsSync(path.join(dataDir, 'data', 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase(database); } catch { /* đã có */ }
  return {
    url: `postgres://postgres:stay@127.0.0.1:${port}/${database}`,
    async stop() {
      try { await pg.stop(); } catch { /* bỏ qua */ }
      if (temp) { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* Windows có thể còn khóa tệp */ } }
    },
  };
}
```

- [ ] **Step 4: Tạo `9stay/scripts/test.js`**

```js
// `npm test`: không có DATABASE_URL thì dựng PostgreSQL thật tạm thời, chạy node:test rồi dọn.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { startEmbedded } from './embedded-pg.js';

let pg = null;
const env = { ...process.env, NODE_ENV: 'test' };
if (!env.DATABASE_URL) {
  console.log('Không có DATABASE_URL: dựng PostgreSQL tạm bằng embedded-postgres...');
  pg = await startEmbedded({ database: 'stay_test' });
  env.DATABASE_URL = pg.url;
}
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...fs.readdirSync('test').filter((f) => f.endsWith('.test.js')).map((f) => 'test/' + f)], { stdio: 'inherit', env });
const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c ?? 1)));
if (pg) await pg.stop();
process.exit(code);
```

- [ ] **Step 5: Tạo `9stay/src/config.js`, `9stay/src/errors.js`**

`9stay/src/config.js`:

```js
const env = process.env;

export const config = {
  production: env.NODE_ENV === 'production',
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:stay@localhost:5441/stay',
};
```

`9stay/src/errors.js`:

```js
// Lỗi nghiệp vụ: code (snake_case, tiếng Anh) cho máy, message (tiếng Việt) cho người, detail cho thông tin thêm (chỉ id và ngày).
export class AppError extends Error {
  constructor(code, message, status = 400, detail = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
```

- [ ] **Step 6: Tạo `9stay/src/db.js`**

```js
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// BIGINT -> Number (tiền VND nằm trong vùng số nguyên an toàn)
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
// DATE -> chuỗi YYYY-MM-DD (không để pg đổi sang Date theo múi giờ máy)
pg.types.setTypeParser(1082, (v) => v);

const here = path.dirname(fileURLToPath(import.meta.url));
let pool = null;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (e) => console.error('[pg] lỗi kết nối nhàn rỗi:', e && e.message));
  }
  return pool;
}

export async function query(sql, params) {
  const r = await getPool().query(sql, params);
  return r.rows;
}

// fn(c) với c.query(sql, params) -> rows. Lỗi bất kỳ thì ROLLBACK.
export async function tx(fn) {
  const client = await getPool().connect();
  const c = {
    client,
    query: async (sql, params) => (await client.query(sql, params)).rows,
  };
  try {
    await client.query('BEGIN');
    const out = await fn(c);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* bỏ qua */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const dir = path.join(here, '..', 'db');
  const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  // một khóa tư vấn cho cả phiên: hai bản khởi động đồng thời chạy lần lượt
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock(9201)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
    for (const f of files) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f])).rows.length) continue;
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(9201)').catch(() => {});
    client.release();
  }
}

export async function resetForTests() {
  await query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations' LOOP
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    END LOOP; END $$`);
}

export async function close() {
  if (pool) { await pool.end(); pool = null; }
}
```

- [ ] **Step 7: Viết test lược đồ (sẽ thất bại vì chưa có migration)**

`9stay/test/schema.test.js`:

```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL).');

before(async () => { await db.migrate(); await db.resetForTests(); });
after(async () => { await db.close(); });

// Dựng tối thiểu bằng SQL thô để kiểm tra riêng lớp lược đồ
async function minimal() {
  const [org] = await db.query("INSERT INTO orgs(name) VALUES('Anstay') RETURNING id");
  const [b] = await db.query("INSERT INTO buildings(org_id,name) VALUES($1,'Sunrise') RETURNING id", [org.id]);
  const [o] = await db.query("INSERT INTO owners(org_id,kind,name) VALUES($1,'ca_nhan','Minh') RETURNING id", [org.id]);
  const [rt] = await db.query("INSERT INTO room_types(org_id,name) VALUES($1,'Deluxe') RETURNING id", [org.id]);
  const [u] = await db.query("INSERT INTO units(org_id,building_id,owner_id,room_type_id,code,capacity_std,capacity_max) VALUES($1,$2,$3,$4,'A1',2,4) RETURNING id", [org.id, b.id, o.id, rt.id]);
  const [bk] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'ST1','Lan',2,'giu') RETURNING id", [org.id]);
  return { org, unit: u, booking: bk };
}

test('migrate tạo đủ bảng cốt lõi', async () => {
  const rows = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  const names = rows.map((r) => r.tablename);
  for (const t of ['orgs', 'buildings', 'owners', 'room_types', 'units', 'owner_contracts', 'owner_releases', 'bookings', 'room_nights', 'booking_events', 'settings', 'org_counters']) {
    assert.ok(names.includes(t), 'thiếu bảng ' + t);
  }
});

test('chỉ mục duy nhất từng phần: hai dòng room_nights hoạt động cùng căn cùng đêm bị từ chối', async () => {
  const { unit, booking } = await minimal();
  await db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-05')", [booking.id, unit.id]);
  await assert.rejects(
    db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-05')", [booking.id, unit.id]),
    (e) => e.code === '23505' && e.constraint === 'room_nights_active_unit_night',
  );
});

test('dòng room_nights đã vô hiệu (active=false) không chiếm đêm', async () => {
  await db.resetForTests();
  const { unit, booking } = await minimal();
  await db.query("INSERT INTO room_nights(booking_id,unit_id,night,active) VALUES($1,$2,'2026-11-05',false)", [booking.id, unit.id]);
  await db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-05')", [booking.id, unit.id]);
  const rows = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE active');
  assert.equal(rows[0].n, 1);
});

test('ràng buộc CHECK: sức chứa tối đa nhỏ hơn chuẩn bị từ chối; phần chủ ngoài 0..100 bị từ chối', async () => {
  await db.resetForTests();
  const [org] = await db.query("INSERT INTO orgs(name) VALUES('A') RETURNING id");
  await assert.rejects(db.query("INSERT INTO room_types(org_id,name,capacity_std,capacity_max) VALUES($1,'X',4,2)", [org.id]), (e) => e.code === '23514');
  const { unit } = await minimal();
  const [o] = await db.query('SELECT owner_id FROM units WHERE id=$1', [unit.id]);
  await assert.rejects(
    db.query("INSERT INTO owner_contracts(org_id,owner_id,unit_id,kind,valid_from,owner_share_pct) VALUES((SELECT org_id FROM units WHERE id=$1),$2,$1,'revenue_share','2026-11-01',150)", [unit.id, o.owner_id]),
    (e) => e.code === '23514',
  );
});
```

- [ ] **Step 8: Cài phụ thuộc và chạy test để thấy thất bại**

Run: `cd /d/9app.tech/9stay && npm install && npm test`
Expected: FAIL — `migrate` không tìm thấy migration nào nên các bảng không tồn tại (lỗi `relation "orgs" does not exist`).

- [ ] **Step 9: Viết migration `9stay/db/001_core.sql`**

```sql
-- 9stay: lược đồ cốt lõi (lát 1A). Mọi bảng thuộc một org. Đêm là kiểu date.

CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_counters (
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  value bigint NOT NULL,
  PRIMARY KEY (org_id, name)
);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  legal_type text NOT NULL DEFAULT 'can_ho_du_lich' CHECK (legal_type IN ('can_ho_du_lich', 'nha_o', 'khac')),
  rules_note text NOT NULL DEFAULT '',
  declared_by_default text NOT NULL DEFAULT 'anstay' CHECK (declared_by_default IN ('anstay', 'owner', 'bql')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ca_nhan', 'to_chuc')),
  name text NOT NULL,
  tax_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity_std int NOT NULL DEFAULT 2 CHECK (capacity_std > 0),
  capacity_max int NOT NULL DEFAULT 4,
  CHECK (capacity_max >= capacity_std)
);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES buildings(id),
  owner_id uuid NOT NULL REFERENCES owners(id),
  room_type_id uuid NOT NULL REFERENCES room_types(id),
  code text NOT NULL,
  floor int,
  capacity_std int NOT NULL CHECK (capacity_std > 0),
  capacity_max int NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, code),
  CHECK (capacity_max >= capacity_std)
);

CREATE TABLE owner_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  kind text NOT NULL CHECK (kind IN ('revenue_share', 'master_lease')),
  valid_from date NOT NULL,
  valid_to date,
  owner_share_pct int NOT NULL DEFAULT 70 CHECK (owner_share_pct BETWEEN 0 AND 100),
  owner_net_floor bigint NOT NULL DEFAULT 0 CHECK (owner_net_floor >= 0),
  fixed_rent bigint NOT NULL DEFAULT 0 CHECK (fixed_rent >= 0),
  cleaning_payer text NOT NULL DEFAULT 'owner' CHECK (cleaning_payer IN ('owner', 'anstay', 'guest')),
  cancel_penalty_pct int NOT NULL DEFAULT 20 CHECK (cancel_penalty_pct BETWEEN 0 AND 100),
  statement_cycle text NOT NULL DEFAULT 'month' CHECK (statement_cycle IN ('month', 'half')),
  payout_delay_days int NOT NULL DEFAULT 3 CHECK (payout_delay_days >= 0),
  tax_withhold boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Chủ mở bán hoặc chặn từng đêm. Không có dòng = chưa mở bán.
CREATE TABLE owner_releases (
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  night date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('open', 'owner_use', 'blocked_by_owner', 'blocked_by_anstay')),
  source text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'ical', 'manual')),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, night)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  guest_name text NOT NULL,
  guest_phone text,
  adults int NOT NULL CHECK (adults >= 1),
  children int NOT NULL DEFAULT 0 CHECK (children >= 0),
  source text NOT NULL DEFAULT 'direct',
  agent_id uuid,
  created_by uuid,
  status text NOT NULL CHECK (status IN ('giu', 'da_coc', 'da_nhan', 'da_tra', 'huy', 'khong_den', 'het_han')),
  hold_until timestamptz,
  cancel_policy jsonb NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

-- Nguồn chống trùng duy nhất: mỗi (căn, đêm) tối đa một dòng hoạt động.
CREATE TABLE room_nights (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id),
  night date NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX room_nights_active_unit_night ON room_nights (unit_id, night) WHERE active;
CREATE INDEX room_nights_booking ON room_nights (booking_id);

CREATE TABLE booking_events (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('org', 'building', 'owner', 'unit')),
  scope_id uuid,
  key text NOT NULL,
  value jsonb NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'org') = (scope_id IS NULL))
);
CREATE INDEX settings_lookup ON settings (org_id, key, scope_type, scope_id, effective_from DESC);
```

- [ ] **Step 10: Chạy test để thấy pass**

Run: `cd /d/9app.tech/9stay && npm test`
Expected: PASS (4 test). Nếu `embedded-postgres` không tải được binary, dừng và báo lỗi.

- [ ] **Step 11: Commit**

```bash
cd /d/9app.tech
git add 9stay/package.json 9stay/package-lock.json 9stay/scripts 9stay/src 9stay/db 9stay/test
git commit -m "9stay: khung dự án, lược đồ lõi và chỉ mục chống trùng đêm

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Thời gian (đêm, hôm nay giờ Việt Nam) và cài đặt theo phạm vi

**Files:**
- Create: `9stay/src/time.js`
- Create: `9stay/src/settings.js`
- Test: `9stay/test/time.test.js`
- Test: `9stay/test/settings.test.js`

**Interfaces:**
- Consumes: `AppError` từ `errors.js`; `db.tx`, `db.migrate`, `db.resetForTests`, `db.close`.
- Produces:
  - `time.js`: `isDate(s): boolean`, `addDays(s, n): string`, `nightsBetween(checkin, checkout): string[]` (ném `AppError('bad_dates')` khi sai; tối đa 366 đêm), `todayVN(now = new Date()): string`.
  - `settings.js`: `DEFAULTS` (đối tượng khóa → giá trị), `setSetting(c, { orgId, scopeType, scopeId = null, key, value, effectiveFrom }): Promise<void>`, `getSetting(c, { orgId, key, unitId = null, asOf }): Promise<any>`. Thứ tự ưu tiên: căn > chủ > tòa > org > mặc định; trong cùng phạm vi lấy dòng có `effective_from` lớn nhất không vượt `asOf`, hòa thì dòng mới hơn.

- [ ] **Step 1: Viết test thời gian (thất bại)**

`9stay/test/time.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isDate, addDays, nightsBetween, todayVN } from '../src/time.js';

test('nightsBetween: 12→14 là hai đêm 12 và 13', () => {
  assert.deepEqual(nightsBetween('2026-11-12', '2026-11-14'), ['2026-11-12', '2026-11-13']);
});

test('nightsBetween: vắt tháng, vắt năm, năm nhuận', () => {
  assert.deepEqual(nightsBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(nightsBetween('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29']);
});

test('nightsBetween: ngày đi không sau ngày đến thì lỗi bad_dates', () => {
  for (const [a, b] of [['2026-11-12', '2026-11-12'], ['2026-11-14', '2026-11-12']]) {
    assert.throws(() => nightsBetween(a, b), (e) => e.code === 'bad_dates');
  }
});

test('nightsBetween: quá 366 đêm thì lỗi bad_dates', () => {
  assert.throws(() => nightsBetween('2026-01-01', '2028-01-01'), (e) => e.code === 'bad_dates');
});

test('isDate: từ chối ngày không tồn tại và định dạng sai', () => {
  assert.equal(isDate('2026-02-28'), true);
  for (const s of ['2026-02-30', '2026-13-01', '26-01-01', '2026/01/01', '', null, undefined, 20260101]) assert.equal(isDate(s), false, String(s));
});

test('addDays: cộng trừ ngày qua ranh giới tháng', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('todayVN: 20:00 UTC ngày 13/10 đã là 03:00 ngày 14/10 giờ Việt Nam', () => {
  assert.equal(todayVN(new Date('2026-10-13T20:00:00Z')), '2026-10-14');
  assert.equal(todayVN(new Date('2026-10-13T16:59:00Z')), '2026-10-13');
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `cd /d/9app.tech/9stay && node --test test/time.test.js`
Expected: FAIL — `Cannot find module '../src/time.js'`.

- [ ] **Step 3: Viết `9stay/src/time.js`**

```js
import { AppError } from './errors.js';

const RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 366;

export function isDate(s) {
  if (typeof s !== 'string' || !RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Các đêm của khoảng nửa mở [checkin, checkout): 12→14 gồm đêm 12 và 13.
export function nightsBetween(checkin, checkout) {
  if (!isDate(checkin) || !isDate(checkout)) throw new AppError('bad_dates', 'Ngày không hợp lệ');
  if (checkout <= checkin) throw new AppError('bad_dates', 'Ngày đi phải sau ngày đến');
  const out = [];
  for (let d = checkin; d < checkout; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > MAX_NIGHTS) throw new AppError('bad_dates', 'Khoảng ngày quá dài');
  }
  return out;
}

// "Hôm nay" theo giờ Việt Nam, dạng YYYY-MM-DD (en-CA cho đúng định dạng này).
export function todayVN(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
```

- [ ] **Step 4: Chạy để thấy pass**

Run: `cd /d/9app.tech/9stay && node --test test/time.test.js`
Expected: PASS (7 test).

- [ ] **Step 5: Viết test cài đặt (thất bại)**

`9stay/test/settings.test.js`:

```js
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db.js';
import { DEFAULTS, setSetting, getSetting } from '../src/settings.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test`.');

before(async () => { await db.migrate(); await db.resetForTests(); });
after(async () => { await db.close(); });

async function world() {
  await db.resetForTests();
  const [org] = await db.query("INSERT INTO orgs(name) VALUES('Anstay') RETURNING id");
  const [b] = await db.query("INSERT INTO buildings(org_id,name) VALUES($1,'S') RETURNING id", [org.id]);
  const [o] = await db.query("INSERT INTO owners(org_id,kind,name) VALUES($1,'ca_nhan','M') RETURNING id", [org.id]);
  const [rt] = await db.query("INSERT INTO room_types(org_id,name) VALUES($1,'D') RETURNING id", [org.id]);
  const [u] = await db.query("INSERT INTO units(org_id,building_id,owner_id,room_type_id,code,capacity_std,capacity_max) VALUES($1,$2,$3,$4,'A1',2,4) RETURNING id", [org.id, b.id, o.id, rt.id]);
  return { orgId: org.id, buildingId: b.id, ownerId: o.id, unitId: u.id };
}

test('không có dòng nào thì trả mặc định', async () => {
  const w = await world();
  const v = await db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'booking.maxNights', unitId: w.unitId, asOf: '2026-11-01' }));
  assert.equal(v, DEFAULTS['booking.maxNights']);
});

test('thứ tự ưu tiên: căn > chủ > tòa > org', async () => {
  const w = await world();
  const set = (scopeType, scopeId, value) => db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType, scopeId, key: 'booking.maxNights', value, effectiveFrom: '2026-01-01' }));
  const get = () => db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'booking.maxNights', unitId: w.unitId, asOf: '2026-11-01' }));
  await set('org', null, 30);
  assert.equal(await get(), 30);
  await set('building', w.buildingId, 20);
  assert.equal(await get(), 20);
  await set('owner', w.ownerId, 10);
  assert.equal(await get(), 10);
  await set('unit', w.unitId, 5);
  assert.equal(await get(), 5);
});

test('hiệu lực theo ngày: đổi cài đặt không áp ngược về trước effectiveFrom', async () => {
  const w = await world();
  await db.tx(async (c) => {
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'booking.maxNights', value: 30, effectiveFrom: '2026-01-01' });
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'booking.maxNights', value: 14, effectiveFrom: '2026-12-01' });
  });
  const at = (asOf) => db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'booking.maxNights', asOf }));
  assert.equal(await at('2026-11-30'), 30);
  assert.equal(await at('2026-12-01'), 14);
  assert.equal(await at('2026-12-31'), 14);
});

test('cùng phạm vi, cùng ngày hiệu lực: dòng ghi sau thắng', async () => {
  const w = await world();
  await db.tx(async (c) => {
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'org.codePrefix', value: 'AA', effectiveFrom: '2026-01-01' });
    await setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'org.codePrefix', value: 'BB', effectiveFrom: '2026-01-01' });
  });
  assert.equal(await db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'org.codePrefix', asOf: '2026-02-01' })), 'BB');
});

test('khóa lạ bị từ chối cả khi ghi lẫn khi đọc; phạm vi không hợp lệ bị từ chối', async () => {
  const w = await world();
  await assert.rejects(db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'khong.co', value: 1, effectiveFrom: '2026-01-01' })), (e) => e.code === 'unknown_setting');
  await assert.rejects(db.tx((c) => getSetting(c, { orgId: w.orgId, key: 'khong.co', asOf: '2026-01-01' })), (e) => e.code === 'unknown_setting');
  await assert.rejects(db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'planet', key: 'booking.maxNights', value: 1, effectiveFrom: '2026-01-01' })), (e) => e.code === 'bad_scope');
  await assert.rejects(db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'building', scopeId: null, key: 'booking.maxNights', value: 1, effectiveFrom: '2026-01-01' })), (e) => e.code === 'bad_scope');
});
```

- [ ] **Step 6: Chạy để thấy thất bại**

Run: `cd /d/9app.tech/9stay && DATABASE_URL= npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../src/settings.js'` trong settings.test.js.

- [ ] **Step 7: Viết `9stay/src/settings.js`**

```js
import { AppError } from './errors.js';
import { todayVN } from './time.js';

// Mặc định theo đặc tả; mọi giá trị đổi được bằng setSetting, không sửa mã.
export const DEFAULTS = {
  'booking.maxNights': 60,
  'booking.maxAdvanceDays': 540,
  'booking.holdMinutesStaff': 1440,
  'org.codePrefix': 'ST',
};

const SCOPES = ['unit', 'owner', 'building', 'org'];

export async function setSetting(c, { orgId, scopeType, scopeId = null, key, value, effectiveFrom }) {
  if (!SCOPES.includes(scopeType) || (scopeType === 'org') !== (scopeId === null)) {
    throw new AppError('bad_scope', 'Phạm vi cài đặt không hợp lệ');
  }
  if (!(key in DEFAULTS)) throw new AppError('unknown_setting', 'Cài đặt không tồn tại: ' + key);
  await c.query(
    'INSERT INTO settings(org_id, scope_type, scope_id, key, value, effective_from) VALUES($1, $2, $3, $4, $5::jsonb, $6::date)',
    [orgId, scopeType, scopeId, key, JSON.stringify(value), effectiveFrom],
  );
}

export async function getSetting(c, { orgId, key, unitId = null, asOf }) {
  if (!(key in DEFAULTS)) throw new AppError('unknown_setting', 'Cài đặt không tồn tại: ' + key);
  const date = asOf || todayVN();
  let scopes = [['org', null]];
  if (unitId) {
    const [u] = await c.query('SELECT owner_id, building_id FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
    if (u) scopes = [['unit', unitId], ['owner', u.owner_id], ['building', u.building_id], ['org', null]];
  }
  for (const [type, id] of scopes) {
    const rows = await c.query(
      `SELECT value FROM settings
        WHERE org_id = $1 AND key = $2 AND scope_type = $3 AND scope_id IS NOT DISTINCT FROM $4::uuid AND effective_from <= $5::date
        ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [orgId, key, type, id, date],
    );
    if (rows.length) return rows[0].value;
  }
  return DEFAULTS[key];
}
```

- [ ] **Step 8: Chạy toàn bộ test để thấy pass**

Run: `cd /d/9app.tech/9stay && npm test`
Expected: PASS (schema 4 + time 7 + settings 5).

- [ ] **Step 9: Commit**

```bash
cd /d/9app.tech
git add 9stay/src/time.js 9stay/src/settings.js 9stay/test/time.test.js 9stay/test/settings.test.js
git commit -m "9stay: đêm, hôm nay giờ Việt Nam và cài đặt theo phạm vi có hiệu lực theo ngày

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tòa, căn, chủ, hợp đồng và quyền chặn ngày của chủ

**Files:**
- Create: `9stay/src/inventory.js`
- Create: `9stay/test/helper.js`
- Test: `9stay/test/inventory.test.js`

**Interfaces:**
- Consumes: `AppError`, `nightsBetween`, `isDate`, `db.tx`.
- Produces (`inventory.js`, mọi hàm nhận `c` đầu tiên và trả `{ id }` khi tạo mới):
  - `createOrg(c, { name })`
  - `createBuilding(c, { orgId, name, address = '', legalType = 'can_ho_du_lich', rulesNote = '', declaredByDefault = 'anstay' })`
  - `createOwner(c, { orgId, name, kind = 'ca_nhan', taxId = null })`
  - `createRoomType(c, { orgId, name, capacityStd = 2, capacityMax = 4 })`
  - `createUnit(c, { orgId, buildingId, ownerId, roomTypeId, code, floor = null, capacityStd = 2, capacityMax = 4 })`
  - `createContract(c, { orgId, ownerId, unitId, validFrom, kind = 'revenue_share', ownerSharePct = 70, ownerNetFloor = 0, fixedRent = 0, cleaningPayer = 'owner', cancelPenaltyPct = 20, statementCycle = 'month', payoutDelayDays = 3, taxWithhold = false, validTo = null })`
  - `openNights(c, { unitId, from, to, source = 'app', by = null }): Promise<number>` mở các đêm trong `[from, to)`, trả số đêm.
  - `blockNights(c, { unitId, nights, kind = 'blocked_by_owner', source = 'app', by = null }): Promise<void>` ném `AppError('night_booked', ..., 409, { nights })` nếu có đêm đã có khách (phải chạy trong `db.tx` để hoàn tác).
- Produces (`test/helper.js`): `NOW` (Date `2026-10-14T03:00:00Z`, tức 10:00 ngày 14/10 giờ Việt Nam), `db`, `boot()`, `shutdown()`, `seed({ from = '2026-11-01', to = '2026-12-01' } = {})` trả `{ orgId, buildingId, ownerId, roomTypeId, unitId, unit2Id }` với hai căn A1205 và A1206 đã mở bán `[from, to)`.

- [ ] **Step 1: Viết test (thất bại)**

`9stay/test/inventory.test.js`:

```js
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed } from './helper.js';
import { createContract, createUnit, openNights, blockNights } from '../src/inventory.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const kindsOf = async (unitId, from, to) =>
  Object.fromEntries((await db.query('SELECT night, kind FROM owner_releases WHERE unit_id=$1 AND night >= $2 AND night < $3 ORDER BY night', [unitId, from, to])).map((r) => [r.night, r.kind]));

test('openNights mở [from, to): 5→8 là ba đêm 5, 6, 7', async () => {
  const n = await db.tx((c) => openNights(c, { unitId: w.unitId, from: '2027-01-05', to: '2027-01-08' }));
  assert.equal(n, 3);
  assert.deepEqual(await kindsOf(w.unitId, '2027-01-01', '2027-02-01'), { '2027-01-05': 'open', '2027-01-06': 'open', '2027-01-07': 'open' });
});

test('openNights mở lại đêm chủ tự dùng thì thành open (chủ nhả ngày)', async () => {
  await db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-10'], kind: 'owner_use' }));
  assert.equal((await kindsOf(w.unitId, '2026-11-10', '2026-11-11'))['2026-11-10'], 'owner_use');
  await db.tx((c) => openNights(c, { unitId: w.unitId, from: '2026-11-10', to: '2026-11-11' }));
  assert.equal((await kindsOf(w.unitId, '2026-11-10', '2026-11-11'))['2026-11-10'], 'open');
});

test('blockNights ghi loại chặn, chấp nhận danh sách đêm trùng lặp', async () => {
  await db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-10', '2026-11-10', '2026-11-11'], kind: 'blocked_by_owner' }));
  assert.deepEqual(await kindsOf(w.unitId, '2026-11-10', '2026-11-12'), { '2026-11-10': 'blocked_by_owner', '2026-11-11': 'blocked_by_owner' });
});

test('blockNights từ chối loại lạ và danh sách đêm sai', async () => {
  await assert.rejects(db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-10'], kind: 'open' })), (e) => e.code === 'bad_kind');
  await assert.rejects(db.tx((c) => blockNights(c, { unitId: w.unitId, nights: [], kind: 'owner_use' })), (e) => e.code === 'bad_dates');
  await assert.rejects(db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-02-30'], kind: 'owner_use' })), (e) => e.code === 'bad_dates');
});

test('blockNights từ chối đêm đã có khách và hoàn tác toàn bộ giao dịch', async () => {
  const [bk] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'ST1','Lan',2,'giu') RETURNING id", [w.orgId]);
  await db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-11')", [bk.id, w.unitId]);
  await assert.rejects(
    db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-10', '2026-11-11'], kind: 'owner_use' })),
    (e) => e.code === 'night_booked' && e.status === 409 && e.detail.nights.includes('2026-11-11'),
  );
  // đêm 10 không bị chặn vì cả giao dịch đã hoàn tác
  assert.equal((await kindsOf(w.unitId, '2026-11-10', '2026-11-11'))['2026-11-10'], 'open');
});

test('createUnit trùng mã trong cùng tòa bị từ chối; hợp đồng mặc định theo đặc tả', async () => {
  await assert.rejects(
    db.tx((c) => createUnit(c, { orgId: w.orgId, buildingId: w.buildingId, ownerId: w.ownerId, roomTypeId: w.roomTypeId, code: 'A1205' })),
    (e) => e.code === '23505',
  );
  const k = await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId: w.ownerId, unitId: w.unitId, validFrom: '2026-11-01' }));
  const [row] = await db.query('SELECT kind, owner_share_pct, cleaning_payer, payout_delay_days, statement_cycle FROM owner_contracts WHERE id=$1', [k.id]);
  assert.deepEqual({ ...row }, { kind: 'revenue_share', owner_share_pct: 70, cleaning_payer: 'owner', payout_delay_days: 3, statement_cycle: 'month' });
});
```

- [ ] **Step 2: Tạo `9stay/test/helper.js`**

```js
// Dùng chung cho kiểm thử tích hợp: PostgreSQL thật (DATABASE_URL do scripts/test.js dựng).
import * as db from '../src/db.js';
import { createOrg, createBuilding, createOwner, createRoomType, createUnit, openNights } from '../src/inventory.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL: chạy bằng `npm test` (tự dựng PostgreSQL) hoặc đặt DATABASE_URL tới CSDL thử nghiệm.');

export { db };
// 03:00 UTC = 10:00 giờ Việt Nam, ngày 14/10/2026
export const NOW = new Date('2026-10-14T03:00:00Z');

export async function boot() {
  await db.migrate();
  await db.resetForTests();
}
export async function shutdown() {
  await db.close();
}

// Một org, một tòa, một chủ, hai căn (A1205, A1206) đã mở bán [from, to)
export async function seed({ from = '2026-11-01', to = '2026-12-01' } = {}) {
  return db.tx(async (c) => {
    const org = await createOrg(c, { name: 'Anstay' });
    const building = await createBuilding(c, { orgId: org.id, name: 'Sunrise' });
    const owner = await createOwner(c, { orgId: org.id, name: 'Minh' });
    const roomType = await createRoomType(c, { orgId: org.id, name: 'Deluxe' });
    const mk = (code) => createUnit(c, { orgId: org.id, buildingId: building.id, ownerId: owner.id, roomTypeId: roomType.id, code });
    const unit = await mk('A1205');
    const unit2 = await mk('A1206');
    await openNights(c, { unitId: unit.id, from, to });
    await openNights(c, { unitId: unit2.id, from, to });
    return { orgId: org.id, buildingId: building.id, ownerId: owner.id, roomTypeId: roomType.id, unitId: unit.id, unit2Id: unit2.id };
  });
}
```

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `cd /d/9app.tech/9stay && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../src/inventory.js'`.

- [ ] **Step 4: Viết `9stay/src/inventory.js`**

```js
import { AppError } from './errors.js';
import { isDate, nightsBetween } from './time.js';

const one = async (c, sql, params) => (await c.query(sql, params))[0];

export const createOrg = (c, { name }) =>
  one(c, 'INSERT INTO orgs(name) VALUES($1) RETURNING id', [name]);

export const createBuilding = (c, { orgId, name, address = '', legalType = 'can_ho_du_lich', rulesNote = '', declaredByDefault = 'anstay' }) =>
  one(c, 'INSERT INTO buildings(org_id, name, address, legal_type, rules_note, declared_by_default) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
    [orgId, name, address, legalType, rulesNote, declaredByDefault]);

export const createOwner = (c, { orgId, name, kind = 'ca_nhan', taxId = null }) =>
  one(c, 'INSERT INTO owners(org_id, kind, name, tax_id) VALUES($1, $2, $3, $4) RETURNING id', [orgId, kind, name, taxId]);

export const createRoomType = (c, { orgId, name, capacityStd = 2, capacityMax = 4 }) =>
  one(c, 'INSERT INTO room_types(org_id, name, capacity_std, capacity_max) VALUES($1, $2, $3, $4) RETURNING id', [orgId, name, capacityStd, capacityMax]);

export const createUnit = (c, { orgId, buildingId, ownerId, roomTypeId, code, floor = null, capacityStd = 2, capacityMax = 4 }) =>
  one(c, 'INSERT INTO units(org_id, building_id, owner_id, room_type_id, code, floor, capacity_std, capacity_max) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [orgId, buildingId, ownerId, roomTypeId, code, floor, capacityStd, capacityMax]);

export const createContract = (c, {
  orgId, ownerId, unitId, validFrom, validTo = null, kind = 'revenue_share', ownerSharePct = 70, ownerNetFloor = 0, fixedRent = 0,
  cleaningPayer = 'owner', cancelPenaltyPct = 20, statementCycle = 'month', payoutDelayDays = 3, taxWithhold = false,
}) =>
  one(c, `INSERT INTO owner_contracts(org_id, owner_id, unit_id, kind, valid_from, valid_to, owner_share_pct, owner_net_floor, fixed_rent,
            cleaning_payer, cancel_penalty_pct, statement_cycle, payout_delay_days, tax_withhold)
          VALUES($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
  [orgId, ownerId, unitId, kind, validFrom, validTo, ownerSharePct, ownerNetFloor, fixedRent, cleaningPayer, cancelPenaltyPct, statementCycle, payoutDelayDays, taxWithhold]);

// Mở bán các đêm trong [from, to). Nếu đêm đang bị chặn thì thành mở (chủ nhả ngày).
export async function openNights(c, { unitId, from, to, source = 'app', by = null }) {
  const nights = nightsBetween(from, to);
  await c.query(
    `INSERT INTO owner_releases(unit_id, night, kind, source, created_by)
     SELECT $1::uuid, n, 'open', $3::text, $4::uuid FROM unnest($2::date[]) AS n
     ON CONFLICT (unit_id, night) DO UPDATE SET kind = 'open', source = EXCLUDED.source, created_by = EXCLUDED.created_by, updated_at = now()`,
    [unitId, nights, source, by],
  );
  return nights.length;
}

const BLOCK_KINDS = ['owner_use', 'blocked_by_owner', 'blocked_by_anstay'];

// Chặn các đêm. Phải chạy trong db.tx: ghi dòng chặn trước (giữ khóa dòng) rồi mới kiểm đêm đã có khách,
// nên một đặt phòng chạy đồng thời hoặc thấy đêm đã bị chặn, hoặc bị chặn lại ở đây. Có khách thì ném lỗi để hoàn tác.
export async function blockNights(c, { unitId, nights, kind = 'blocked_by_owner', source = 'app', by = null }) {
  if (!BLOCK_KINDS.includes(kind)) throw new AppError('bad_kind', 'Loại chặn không hợp lệ');
  if (!Array.isArray(nights) || !nights.length || !nights.every(isDate)) throw new AppError('bad_dates', 'Danh sách đêm không hợp lệ');
  const list = [...new Set(nights)].sort();
  await c.query(
    `INSERT INTO owner_releases(unit_id, night, kind, source, created_by)
     SELECT $1::uuid, n, $3::text, $4::text, $5::uuid FROM unnest($2::date[]) AS n
     ON CONFLICT (unit_id, night) DO UPDATE SET kind = EXCLUDED.kind, source = EXCLUDED.source, created_by = EXCLUDED.created_by, updated_at = now()`,
    [unitId, list, kind, source, by],
  );
  const booked = await c.query('SELECT night FROM room_nights WHERE unit_id = $1 AND active AND night = ANY($2::date[]) ORDER BY night', [unitId, list]);
  if (booked.length) throw new AppError('night_booked', 'Đêm đã có khách, không chặn được', 409, { nights: booked.map((r) => r.night) });
}
```

- [ ] **Step 5: Chạy để thấy pass**

Run: `cd /d/9app.tech/9stay && npm test`
Expected: PASS toàn bộ (schema, time, settings, inventory).

- [ ] **Step 6: Commit**

```bash
cd /d/9app.tech
git add 9stay/src/inventory.js 9stay/test/helper.js 9stay/test/inventory.test.js
git commit -m "9stay: tòa, căn, chủ, hợp đồng và quyền chặn/mở ngày của chủ

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Đặt phòng chống trùng và xem tình trạng căn

**Files:**
- Create: `9stay/src/bookings.js`
- Test: `9stay/test/bookings.test.js`

**Interfaces:**
- Consumes: `AppError`; `nightsBetween`, `todayVN`, `addDays` từ `time.js`; `getSetting` từ `settings.js`; seed từ `helper.js`.
- Produces (`bookings.js`):
  - `createBooking(c, input, { now = new Date() } = {})` với `input = { orgId, unitId, checkin, checkout, guestName, guestPhone = null, adults = 1, children = 0, source = 'direct', agentId = null, createdBy = null, status = 'giu' }` → `{ id, code, status, version, holdUntil, checkin, checkout, nights }`. `status` chỉ nhận `'giu'` (có `hold_until` = now + `booking.holdMinutesStaff` phút) hoặc `'da_coc'` (không hạn).
  - `unitAvailability(c, { orgId, unitId, from, to })` → mảng `{ night, state, bookingId? }` với `state ∈ 'open' | 'booked' | 'owner_use' | 'blocked_by_owner' | 'blocked_by_anstay' | 'closed'` (`closed` = chưa mở bán).
  - Hàm nội bộ dùng lại ở Task 5 (xuất ra để Task 5 import): `validateStay(c, args, now)`, `claimNights(c, { bookingId, unitId, nights })`, `addEvent(c, bookingId, kind, data)`.
- Mã lỗi: `bad_dates`, `bad_guest`, `bad_phone`, `bad_status`, `unit_not_found` (404), `unit_inactive` (409), `past_date`, `too_long`, `too_far`, `over_capacity`, `not_released` (409), `unit_blocked` (409), `unit_taken` (409).

- [ ] **Step 1: Viết test (thất bại)**

`9stay/test/bookings.test.js`:

```js
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createBooking, unitAvailability } from '../src/bookings.js';
import { blockNights, openNights } from '../src/inventory.js';
import { setSetting } from '../src/settings.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const book = (over = {}) => db.tx((c) => createBooking(c, {
  orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Nguyễn Lan', guestPhone: '0901 234 567', adults: 2, ...over,
}, { now: NOW }));
const fail = (p, code) => assert.rejects(p, (e) => e.code === code, 'mong đợi lỗi ' + code);

test('đặt thành công: mã đơn, hai đêm, hạn giữ theo cài đặt', async () => {
  const b = await book();
  assert.match(b.code, /^ST1000$/);
  assert.equal(b.status, 'giu');
  assert.equal(b.version, 1);
  assert.deepEqual(b.nights, ['2026-11-12', '2026-11-13']);
  assert.equal(new Date(b.holdUntil).getTime(), NOW.getTime() + 1440 * 60 * 1000);
  const rn = await db.query('SELECT night FROM room_nights WHERE booking_id=$1 AND active ORDER BY night', [b.id]);
  assert.deepEqual(rn.map((r) => r.night), ['2026-11-12', '2026-11-13']);
  const ev = await db.query('SELECT kind, data FROM booking_events WHERE booking_id=$1', [b.id]);
  assert.equal(ev[0].kind, 'created');
  assert.ok(!JSON.stringify(ev[0].data).includes('Lan') && !JSON.stringify(ev[0].data).includes('0901'), 'sự kiện không được chứa tên hay SĐT');
});

test('mã đơn tăng dần theo org và theo tiền tố cài đặt', async () => {
  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'org.codePrefix', value: 'AN', effectiveFrom: '2026-01-01' }));
  const a = await book();
  const b = await book({ checkin: '2026-11-20', checkout: '2026-11-21' });
  assert.equal(a.code, 'AN1000');
  assert.equal(b.code, 'AN1001');
});

test('trả phòng rồi đặt lại cùng ngày: 12→14 và 14→16 cùng căn đều thành công', async () => {
  await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  const b2 = await book({ checkin: '2026-11-14', checkout: '2026-11-16', guestName: 'Trần Hà' });
  assert.deepEqual(b2.nights, ['2026-11-14', '2026-11-15']);
});

test('đặt chồng một đêm bị từ chối unit_taken (409), căn khác cùng ngày vẫn đặt được', async () => {
  await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  await fail(book({ checkin: '2026-11-13', checkout: '2026-11-15' }), 'unit_taken');
  const other = await book({ unitId: w.unit2Id, checkin: '2026-11-13', checkout: '2026-11-15' });
  assert.equal(other.status, 'giu');
});

test('đêm chưa mở bán: not_released, nêu đêm nào; đêm chủ tự dùng hoặc chặn: unit_blocked', async () => {
  await assert.rejects(book({ checkin: '2026-12-01', checkout: '2026-12-03' }), (e) => e.code === 'not_released' && e.status === 409 && e.detail.night === '2026-12-01');
  await db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-21'], kind: 'owner_use' }));
  await assert.rejects(book({ checkin: '2026-11-20', checkout: '2026-11-23' }), (e) => e.code === 'unit_blocked' && e.detail.night === '2026-11-21' && e.detail.kind === 'owner_use');
  await db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-25'], kind: 'blocked_by_anstay' }));
  await fail(book({ checkin: '2026-11-25', checkout: '2026-11-26' }), 'unit_blocked');
});

test('chủ nhả ngày rồi thì đặt được', async () => {
  await db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-21'], kind: 'owner_use' }));
  await db.tx((c) => openNights(c, { unitId: w.unitId, from: '2026-11-21', to: '2026-11-22' }));
  const b = await book({ checkin: '2026-11-21', checkout: '2026-11-22' });
  assert.equal(b.status, 'giu');
});

test('ngày không hợp lệ: sai định dạng, không tồn tại, đảo ngược, bằng nhau, quá dài', async () => {
  for (const [a, z] of [['2026-02-30', '2026-03-02'], ['12/11/2026', '14/11/2026'], ['2026-11-14', '2026-11-12'], ['2026-11-12', '2026-11-12'], [null, '2026-11-12']]) {
    await fail(book({ checkin: a, checkout: z }), 'bad_dates');
  }
  await fail(book({ checkin: '2026-11-01', checkout: '2027-11-30' }), 'bad_dates');
});

test('too_long theo cài đặt của căn', async () => {
  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'unit', scopeId: w.unitId, key: 'booking.maxNights', value: 3, effectiveFrom: '2026-01-01' }));
  await fail(book({ checkin: '2026-11-01', checkout: '2026-11-05' }), 'too_long');
  const ok = await book({ checkin: '2026-11-01', checkout: '2026-11-04' });
  assert.equal(ok.nights.length, 3);
});

test('too_far: ngày đến vượt maxAdvanceDays', async () => {
  await db.tx((c) => setSetting(c, { orgId: w.orgId, scopeType: 'org', key: 'booking.maxAdvanceDays', value: 30, effectiveFrom: '2026-01-01' }));
  await fail(book({ checkin: '2026-12-01', checkout: '2026-12-02' }), 'too_far');
});

test('ngày đến trong quá khứ bị từ chối; hôm nay theo giờ Việt Nam thì được', async () => {
  await db.tx((c) => openNights(c, { unitId: w.unitId, from: '2026-10-10', to: '2026-10-20' }));
  await fail(book({ checkin: '2026-10-13', checkout: '2026-10-15' }), 'past_date');
  const b = await book({ checkin: '2026-10-14', checkout: '2026-10-15' });
  assert.equal(b.status, 'giu');
});

test('hôm nay theo giờ Việt Nam khi UTC còn là hôm qua: 20:00 UTC ngày 13 là ngày 14', async () => {
  await db.tx((c) => openNights(c, { unitId: w.unitId, from: '2026-10-10', to: '2026-10-20' }));
  const late = new Date('2026-10-13T20:00:00Z');
  const mk = (checkin) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin, checkout: '2026-10-16', guestName: 'K', adults: 1 }, { now: late }));
  await assert.rejects(mk('2026-10-13'), (e) => e.code === 'past_date');
  assert.equal((await mk('2026-10-14')).nights[0], '2026-10-14');
});

test('khách: tên rỗng/quá dài, số khách 0 hoặc âm hoặc không nguyên, vượt sức chứa tối đa', async () => {
  await fail(book({ guestName: '   ' }), 'bad_guest');
  await fail(book({ guestName: 'x'.repeat(121) }), 'bad_guest');
  await fail(book({ adults: 0 }), 'bad_guest');
  await fail(book({ adults: 1.5 }), 'bad_guest');
  await fail(book({ children: -1 }), 'bad_guest');
  await fail(book({ adults: 3, children: 2 }), 'over_capacity'); // sức chứa tối đa 4
  const b = await book({ adults: 2, children: 2 });
  assert.equal(b.status, 'giu');
});

test('số điện thoại: chuẩn hóa dấu cách, chấp nhận +84, từ chối có chữ; để trống được', async () => {
  const a = await book({ guestPhone: '+84 901-234.567' });
  const [row] = await db.query('SELECT guest_phone FROM bookings WHERE id=$1', [a.id]);
  assert.equal(row.guest_phone, '+84901234567');
  await fail(book({ guestPhone: '09o1234567', checkin: '2026-11-20', checkout: '2026-11-21' }), 'bad_phone');
  const b = await book({ guestPhone: null, checkin: '2026-11-22', checkout: '2026-11-23' });
  assert.ok(b.id);
});

test('trạng thái đầu: chỉ giu hoặc da_coc; da_coc không có hạn giữ', async () => {
  await fail(book({ status: 'da_nhan' }), 'bad_status');
  const b = await book({ status: 'da_coc' });
  assert.equal(b.holdUntil, null);
});

test('căn không tồn tại, căn của org khác, căn ngừng hoạt động', async () => {
  await fail(book({ unitId: '00000000-0000-0000-0000-000000000000' }), 'unit_not_found');
  const other = await db.tx(async (c) => (await c.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0]);
  await fail(book({ orgId: other.id }), 'unit_not_found');
  await db.query("UPDATE units SET status='inactive' WHERE id=$1", [w.unitId]);
  await fail(book(), 'unit_inactive');
});

test('lỗi giữa chừng không để lại dữ liệu nửa vời: đặt trùng không tạo đơn, không đốt số mã', async () => {
  await book();
  await fail(book({ checkin: '2026-11-13', checkout: '2026-11-15' }), 'unit_taken');
  const n = await db.query('SELECT count(*)::int AS n FROM bookings');
  assert.equal(n[0].n, 1);
  const next = await book({ checkin: '2026-11-20', checkout: '2026-11-21' });
  assert.equal(next.code, 'ST1001');
});

test('unitAvailability: open, booked, chủ tự dùng, chặn, chưa mở bán', async () => {
  const b = await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  await db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-14'], kind: 'owner_use' }));
  await db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-15'], kind: 'blocked_by_anstay' }));
  const av = await db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-11', to: '2026-11-17' }));
  assert.deepEqual(av.map((a) => a.state), ['open', 'booked', 'booked', 'owner_use', 'blocked_by_anstay', 'open']);
  assert.equal(av[1].bookingId, b.id);
  const edge = await db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-30', to: '2026-12-02' }));
  assert.deepEqual(edge.map((a) => a.state), ['open', 'closed']);
  await assert.rejects(db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: '00000000-0000-0000-0000-000000000000', from: '2026-11-11', to: '2026-11-12' })), (e) => e.code === 'unit_not_found');
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `cd /d/9app.tech/9stay && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../src/bookings.js'`.

- [ ] **Step 3: Viết `9stay/src/bookings.js`**

```js
import { AppError } from './errors.js';
import { nightsBetween, todayVN, addDays } from './time.js';
import { getSetting } from './settings.js';

const GUEST_NAME_MAX = 120;
const SOURCE_MAX = 40;

function normalizePhone(p) {
  if (p === null || p === undefined || p === '') return null;
  const s = String(p).replace(/[\s.\-()]/g, '');
  if (!/^\+?\d{8,15}$/.test(s)) throw new AppError('bad_phone', 'Số điện thoại không hợp lệ');
  return s;
}

function validateGuest({ guestName, adults, children, source }) {
  const name = typeof guestName === 'string' ? guestName.trim() : '';
  if (!name || name.length > GUEST_NAME_MAX) throw new AppError('bad_guest', 'Tên khách không hợp lệ');
  if (!Number.isInteger(adults) || adults < 1) throw new AppError('bad_guest', 'Cần ít nhất 1 người lớn');
  if (!Number.isInteger(children) || children < 0) throw new AppError('bad_guest', 'Số trẻ em không hợp lệ');
  if (typeof source !== 'string' || !source || source.length > SOURCE_MAX) throw new AppError('bad_guest', 'Nguồn đơn không hợp lệ');
  return name;
}

// Kiểm đầu vào của một kỳ ở: ngày, căn, giới hạn cài đặt, sức chứa. Trả { unit, nights }.
export async function validateStay(c, { orgId, unitId, checkin, checkout, adults, children }, now = new Date()) {
  const nights = nightsBetween(checkin, checkout);
  const today = todayVN(now);
  if (checkin < today) throw new AppError('past_date', 'Ngày đến đã qua');
  const [unit] = await c.query('SELECT id, capacity_max, status FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!unit) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  if (unit.status !== 'active') throw new AppError('unit_inactive', 'Căn đang ngừng hoạt động', 409);
  const maxNights = await getSetting(c, { orgId, key: 'booking.maxNights', unitId, asOf: today });
  if (nights.length > maxNights) throw new AppError('too_long', `Tối đa ${maxNights} đêm`);
  const maxAdvance = await getSetting(c, { orgId, key: 'booking.maxAdvanceDays', unitId, asOf: today });
  if (checkin > addDays(today, maxAdvance)) throw new AppError('too_far', `Chỉ nhận đặt trước tối đa ${maxAdvance} ngày`);
  if (adults + children > unit.capacity_max) throw new AppError('over_capacity', `Căn chứa tối đa ${unit.capacity_max} người`);
  return { unit, nights };
}

// Giữ các đêm cho đơn: khóa dòng owner_releases (tuần tự hóa với đặt khác và với chủ chặn ngày), kiểm mở bán,
// rồi chèn room_nights. Chỉ mục duy nhất từng phần là hàng rào cuối.
export async function claimNights(c, { bookingId, unitId, nights }) {
  const rel = await c.query('SELECT night, kind FROM owner_releases WHERE unit_id = $1 AND night = ANY($2::date[]) ORDER BY night FOR UPDATE', [unitId, nights]);
  const byNight = new Map(rel.map((r) => [r.night, r.kind]));
  for (const night of nights) {
    const kind = byNight.get(night);
    if (kind === undefined) throw new AppError('not_released', `Đêm ${night} chưa mở bán`, 409, { night });
    if (kind !== 'open') throw new AppError('unit_blocked', `Đêm ${night} không bán được (${kind})`, 409, { night, kind });
  }
  try {
    await c.query('INSERT INTO room_nights(booking_id, unit_id, night) SELECT $1::uuid, $2::uuid, n FROM unnest($3::date[]) AS n', [bookingId, unitId, nights]);
  } catch (e) {
    if (e.code === '23505' && e.constraint === 'room_nights_active_unit_night') throw new AppError('unit_taken', 'Căn đã có khách trong khoảng ngày này', 409);
    throw e;
  }
}

// Sự kiện chỉ chứa id và ngày, không chứa tên hay SĐT.
export async function addEvent(c, bookingId, kind, data = {}) {
  await c.query('INSERT INTO booking_events(booking_id, kind, data) VALUES($1, $2, $3::jsonb)', [bookingId, kind, JSON.stringify(data)]);
}

async function nextBookingCode(c, orgId, today) {
  const [row] = await c.query(
    `INSERT INTO org_counters(org_id, name, value) VALUES($1, 'booking', 1000)
     ON CONFLICT (org_id, name) DO UPDATE SET value = org_counters.value + 1 RETURNING value`,
    [orgId],
  );
  const prefix = await getSetting(c, { orgId, key: 'org.codePrefix', asOf: today });
  return `${prefix}${row.value}`;
}

export async function createBooking(c, input, { now = new Date() } = {}) {
  const { orgId, unitId, checkin, checkout, guestPhone = null, adults = 1, children = 0, source = 'direct', agentId = null, createdBy = null, status = 'giu' } = input;
  if (!['giu', 'da_coc'].includes(status)) throw new AppError('bad_status', 'Trạng thái đầu không hợp lệ');
  const name = validateGuest({ guestName: input.guestName, adults, children, source });
  const phone = normalizePhone(guestPhone);
  const { nights } = await validateStay(c, { orgId, unitId, checkin, checkout, adults, children }, now);
  const today = todayVN(now);

  let holdUntil = null;
  if (status === 'giu') {
    const minutes = await getSetting(c, { orgId, key: 'booking.holdMinutesStaff', unitId, asOf: today });
    holdUntil = new Date(now.getTime() + minutes * 60 * 1000);
  }
  const code = await nextBookingCode(c, orgId, today);
  const [row] = await c.query(
    `INSERT INTO bookings(org_id, code, guest_name, guest_phone, adults, children, source, agent_id, created_by, status, hold_until)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, version`,
    [orgId, code, name, phone, adults, children, source, agentId, createdBy, status, holdUntil],
  );
  await claimNights(c, { bookingId: row.id, unitId, nights });
  await addEvent(c, row.id, 'created', { unitId, checkin, checkout, status });
  return { id: row.id, code, status, version: row.version, holdUntil, checkin, checkout, nights };
}

// Tình trạng từng đêm của một căn trong [from, to).
export async function unitAvailability(c, { orgId, unitId, from, to }) {
  const nights = nightsBetween(from, to);
  const [unit] = await c.query('SELECT id FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!unit) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  const rel = await c.query('SELECT night, kind FROM owner_releases WHERE unit_id = $1 AND night = ANY($2::date[])', [unitId, nights]);
  const rn = await c.query('SELECT night, booking_id FROM room_nights WHERE unit_id = $1 AND active AND night = ANY($2::date[])', [unitId, nights]);
  const kinds = new Map(rel.map((r) => [r.night, r.kind]));
  const booked = new Map(rn.map((r) => [r.night, r.booking_id]));
  return nights.map((night) => {
    if (booked.has(night)) return { night, state: 'booked', bookingId: booked.get(night) };
    return { night, state: kinds.get(night) || 'closed' };
  });
}
```

- [ ] **Step 4: Chạy để thấy pass**

Run: `cd /d/9app.tech/9stay && npm test`
Expected: PASS toàn bộ. Nếu test "ngày đến trong quá khứ" thất bại vì `openNights` mở ngày quá khứ: `openNights` không kiểm quá khứ, đúng thiết kế, không phải lỗi.

- [ ] **Step 5: Commit**

```bash
cd /d/9app.tech
git add 9stay/src/bookings.js 9stay/test/bookings.test.js
git commit -m "9stay: đặt phòng chống trùng, mã đơn, xem tình trạng căn

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hủy, dời đơn và kiểm thử đua dữ liệu

**Files:**
- Modify: `9stay/src/bookings.js` (thêm `cancelBooking`, `moveBooking` ở cuối tệp)
- Test: `9stay/test/booking-ops.test.js`
- Test: `9stay/test/race.test.js`

**Interfaces:**
- Consumes: `validateStay`, `claimNights`, `addEvent`, `createBooking`, `blockNights`, `AppError`, seed/NOW.
- Produces:
  - `cancelBooking(c, { orgId, bookingId, reason = null })` → `{ id, status: 'huy' }`. Idempotent khi đã `huy`; ném `cannot_cancel` (409) nếu trạng thái là `da_nhan`, `da_tra`; ném `booking_closed` (409) nếu `khong_den`/`het_han`; `booking_not_found` (404). Vô hiệu hóa `room_nights` của đơn (`active=false`).
  - `moveBooking(c, { orgId, bookingId, unitId, checkin, checkout, expectedVersion = null }, { now })` → `{ id, version, nights }`. Chỉ cho trạng thái `giu`/`da_coc` (`cannot_move` 409), kiểm `expectedVersion` (`stale` 409), `booking_not_found` (404). Vô hiệu đêm cũ rồi giữ đêm mới trong cùng giao dịch; lỗi thì hoàn tác toàn bộ.

- [ ] **Step 1: Viết test hủy và dời (thất bại)**

`9stay/test/booking-ops.test.js`:

```js
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createBooking, cancelBooking, moveBooking, unitAvailability } from '../src/bookings.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const book = (over = {}) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'Lan', adults: 2, ...over }, { now: NOW }));
const activeNights = async (bookingId) => (await db.query('SELECT unit_id, night FROM room_nights WHERE booking_id=$1 AND active ORDER BY night', [bookingId])).map((r) => `${r.unit_id === w.unitId ? 'A' : 'B'}:${r.night}`);
const fail = (p, code, status) => assert.rejects(p, (e) => e.code === code && (status === undefined || e.status === status), 'mong đợi lỗi ' + code);

test('hủy đơn: trả đêm về bán lại được, đặt lại cùng đêm thành công', async () => {
  const b = await book();
  const r = await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id, reason: 'khách đổi ý' }));
  assert.deepEqual(r, { id: b.id, status: 'huy' });
  assert.deepEqual(await activeNights(b.id), []);
  const again = await book({ guestName: 'Hà' });
  assert.deepEqual(again.nights, ['2026-11-12', '2026-11-13']);
  const [row] = await db.query('SELECT status, version FROM bookings WHERE id=$1', [b.id]);
  assert.equal(row.status, 'huy');
  assert.equal(row.version, 2);
});

test('hủy hai lần không lỗi và không tăng version lần hai', async () => {
  const b = await book();
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id }));
  const r2 = await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id }));
  assert.equal(r2.status, 'huy');
  const [row] = await db.query('SELECT version FROM bookings WHERE id=$1', [b.id]);
  assert.equal(row.version, 2);
  const ev = await db.query("SELECT count(*)::int AS n FROM booking_events WHERE booking_id=$1 AND kind='cancelled'", [b.id]);
  assert.equal(ev[0].n, 1);
});

test('không hủy được đơn đã nhận phòng hoặc đã trả; đơn lạ/org khác: 404', async () => {
  const b = await book();
  await db.query("UPDATE bookings SET status='da_nhan' WHERE id=$1", [b.id]);
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id })), 'cannot_cancel', 409);
  await db.query("UPDATE bookings SET status='het_han' WHERE id=$1", [b.id]);
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id })), 'booking_closed', 409);
  await fail(db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: '00000000-0000-0000-0000-000000000000' })), 'booking_not_found', 404);
  const other = (await db.query("INSERT INTO orgs(name) VALUES('Khác') RETURNING id"))[0];
  await fail(db.tx((c) => cancelBooking(c, { orgId: other.id, bookingId: b.id })), 'booking_not_found', 404);
});

test('dời sang ngày khác cùng căn, gồm dời gối lên chính đêm cũ của mình', async () => {
  const b = await book({ checkin: '2026-11-12', checkout: '2026-11-14' });
  const r = await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-13', checkout: '2026-11-16', expectedVersion: 1 }, { now: NOW }));
  assert.equal(r.version, 2);
  assert.deepEqual(r.nights, ['2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(await activeNights(b.id), ['A:2026-11-13', 'A:2026-11-14', 'A:2026-11-15']);
  const av = await db.tx((c) => unitAvailability(c, { orgId: w.orgId, unitId: w.unitId, from: '2026-11-12', to: '2026-11-13' }));
  assert.equal(av[0].state, 'open'); // đêm 12 đã được trả lại
});

test('dời sang căn khác', async () => {
  const b = await book();
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unit2Id, checkin: '2026-11-12', checkout: '2026-11-14' }, { now: NOW }));
  assert.deepEqual(await activeNights(b.id), ['B:2026-11-12', 'B:2026-11-13']);
  const again = await book({ guestName: 'Hà' }); // căn A trống lại
  assert.equal(again.status, 'giu');
});

test('dời bị trùng thì hoàn tác nguyên trạng: đêm cũ còn, version không đổi', async () => {
  const a = await book({ checkin: '2026-11-05', checkout: '2026-11-07' });
  await book({ checkin: '2026-11-07', checkout: '2026-11-09', guestName: 'Hà' });
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: a.id, unitId: w.unitId, checkin: '2026-11-06', checkout: '2026-11-08' }, { now: NOW })), 'unit_taken', 409);
  assert.deepEqual(await activeNights(a.id), ['A:2026-11-05', 'A:2026-11-06']);
  const [row] = await db.query('SELECT version FROM bookings WHERE id=$1', [a.id]);
  assert.equal(row.version, 1);
});

test('dời với version cũ: stale; đơn đã hủy hoặc đã nhận: cannot_move; đêm chưa mở bán: not_released', async () => {
  const b = await book();
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-15', checkout: '2026-11-16', expectedVersion: 1 }, { now: NOW }));
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-17', checkout: '2026-11-18', expectedVersion: 1 }, { now: NOW })), 'stale', 409);
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-12-01', checkout: '2026-12-02' }, { now: NOW })), 'not_released', 409);
  await db.query("UPDATE bookings SET status='da_nhan' WHERE id=$1", [b.id]);
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-17', checkout: '2026-11-18' }, { now: NOW })), 'cannot_move', 409);
});

test('dời kiểm lại sức chứa và ngày quá khứ như đặt mới', async () => {
  const b = await book({ adults: 4 });
  await db.query('UPDATE units SET capacity_max=3 WHERE id=$1', [w.unit2Id]);
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unit2Id, checkin: '2026-11-12', checkout: '2026-11-14' }, { now: NOW })), 'over_capacity');
  await fail(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-10-01', checkout: '2026-10-03' }, { now: NOW })), 'past_date');
});

test('sự kiện hủy/dời chỉ chứa id và ngày, không chứa tên hay SĐT', async () => {
  const b = await book({ guestName: 'Nguyễn Văn Bí Mật', guestPhone: '0912345678' });
  await db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-15', checkout: '2026-11-16' }, { now: NOW }));
  await db.tx((c) => cancelBooking(c, { orgId: w.orgId, bookingId: b.id, reason: 'đổi ý' }));
  const all = JSON.stringify(await db.query('SELECT kind, data FROM booking_events WHERE booking_id=$1', [b.id]));
  assert.ok(!all.includes('Bí Mật') && !all.includes('0912345678'), 'sự kiện lộ dữ liệu cá nhân');
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `cd /d/9app.tech/9stay && npm test 2>&1 | tail -20`
Expected: FAIL — `cancelBooking` / `moveBooking` chưa được export từ `bookings.js`.

- [ ] **Step 3: Thêm `cancelBooking` và `moveBooking` vào cuối `9stay/src/bookings.js`**

```js
async function lockBooking(c, orgId, bookingId) {
  const [b] = await c.query('SELECT id, status, version FROM bookings WHERE id = $1 AND org_id = $2 FOR UPDATE', [bookingId, orgId]);
  if (!b) throw new AppError('booking_not_found', 'Không tìm thấy đơn', 404);
  return b;
}

export async function cancelBooking(c, { orgId, bookingId, reason = null }) {
  const b = await lockBooking(c, orgId, bookingId);
  if (b.status === 'huy') return { id: b.id, status: 'huy' };
  if (['da_nhan', 'da_tra'].includes(b.status)) throw new AppError('cannot_cancel', 'Đơn đã nhận phòng, không hủy được', 409);
  if (['khong_den', 'het_han'].includes(b.status)) throw new AppError('booking_closed', 'Đơn đã đóng', 409);
  await c.query('UPDATE room_nights SET active = false WHERE booking_id = $1 AND active', [b.id]);
  await c.query("UPDATE bookings SET status = 'huy', version = version + 1 WHERE id = $1", [b.id]);
  await addEvent(c, b.id, 'cancelled', { reasonGiven: reason !== null && reason !== '' });
  return { id: b.id, status: 'huy' };
}

export async function moveBooking(c, { orgId, bookingId, unitId, checkin, checkout, expectedVersion = null }, { now = new Date() } = {}) {
  const b = await lockBooking(c, orgId, bookingId);
  if (!['giu', 'da_coc'].includes(b.status)) throw new AppError('cannot_move', 'Chỉ dời được đơn đang giữ chỗ hoặc đã cọc', 409);
  if (expectedVersion !== null && expectedVersion !== b.version) throw new AppError('stale', 'Đơn vừa được người khác sửa, hãy tải lại', 409);
  const [g] = await c.query('SELECT adults, children FROM bookings WHERE id = $1', [b.id]);
  const { nights } = await validateStay(c, { orgId, unitId, checkin, checkout, adults: g.adults, children: g.children }, now);
  const before = await c.query('SELECT unit_id, min(night) AS first, max(night) AS last FROM room_nights WHERE booking_id = $1 AND active GROUP BY unit_id', [b.id]);
  await c.query('UPDATE room_nights SET active = false WHERE booking_id = $1 AND active', [b.id]);
  await claimNights(c, { bookingId: b.id, unitId, nights });
  const [row] = await c.query('UPDATE bookings SET version = version + 1 WHERE id = $1 RETURNING version', [b.id]);
  await addEvent(c, b.id, 'moved', { from: before[0] ? { unitId: before[0].unit_id, first: before[0].first, last: before[0].last } : null, to: { unitId, checkin, checkout } });
  return { id: b.id, version: row.version, nights };
}
```

- [ ] **Step 4: Chạy để thấy pass**

Run: `cd /d/9app.tech/9stay && npm test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Viết test đua dữ liệu (đây là phần quan trọng nhất của lát)**

`9stay/test/race.test.js`:

```js
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createBooking, moveBooking } from '../src/bookings.js';
import { blockNights } from '../src/inventory.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const book = (over = {}) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1, ...over }, { now: NOW }));

test('năm đặt đồng thời cùng căn cùng đêm: đúng một thành công, bốn còn lại unit_taken', async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => book({ guestName: 'K' + i })));
  const okRes = results.filter((r) => r.status === 'fulfilled');
  const bad = results.filter((r) => r.status === 'rejected');
  assert.equal(okRes.length, 1);
  assert.equal(bad.length, 4);
  for (const r of bad) assert.equal(r.reason.code, 'unit_taken');
  const n = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE unit_id=$1 AND active', [w.unitId]);
  assert.equal(n[0].n, 2);
});

test('đặt đồng thời gối nhau một phần (12→14 và 13→15): đúng một thành công', async () => {
  const results = await Promise.allSettled([book({ checkin: '2026-11-12', checkout: '2026-11-14' }), book({ checkin: '2026-11-13', checkout: '2026-11-15' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('đặt đồng thời hai căn khác nhau không cản nhau: cả hai thành công, mã đơn khác nhau', async () => {
  const [a, b] = await Promise.all([book({ unitId: w.unitId }), book({ unitId: w.unit2Id })]);
  assert.notEqual(a.code, b.code);
});

test('chủ chặn đêm đồng thời với đặt phòng: không bao giờ cả hai cùng thành công', async () => {
  for (let i = 0; i < 12; i++) {
    const night = `2026-11-${String(10 + i).padStart(2, '0')}`;
    const next = `2026-11-${String(11 + i).padStart(2, '0')}`;
    const [bk, bl] = await Promise.allSettled([
      book({ checkin: night, checkout: next }),
      db.tx((c) => blockNights(c, { unitId: w.unitId, nights: [night], kind: 'owner_use' })),
    ]);
    assert.ok(!(bk.status === 'fulfilled' && bl.status === 'fulfilled'), `vòng ${i}: đặt và chặn cùng thành công ở đêm ${night}`);
    assert.ok(bk.status === 'fulfilled' || bl.status === 'fulfilled', `vòng ${i}: cả hai cùng thất bại`);
    const [rel] = await db.query('SELECT kind FROM owner_releases WHERE unit_id=$1 AND night=$2', [w.unitId, night]);
    const [rn] = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE unit_id=$1 AND night=$2 AND active', [w.unitId, night]);
    if (bk.status === 'fulfilled') { assert.equal(rel.kind, 'open'); assert.equal(rn.n, 1); }
    else { assert.equal(rel.kind, 'owner_use'); assert.equal(rn.n, 0); }
  }
});

test('đổi chéo: hai đơn dời đồng thời vào đêm của nhau không bị kẹt (deadlock) và không tạo trùng', async () => {
  const a = await book({ unitId: w.unitId, checkin: '2026-11-05', checkout: '2026-11-07' });
  const b = await book({ unitId: w.unit2Id, checkin: '2026-11-05', checkout: '2026-11-07' });
  const results = await Promise.allSettled([
    db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: a.id, unitId: w.unit2Id, checkin: '2026-11-05', checkout: '2026-11-07' }, { now: NOW })),
    db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-05', checkout: '2026-11-07' }, { now: NOW })),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') assert.ok(['unit_taken', '40P01'].includes(r.reason.code), 'lỗi bất ngờ: ' + r.reason.code);
  }
  const dup = await db.query('SELECT unit_id, night, count(*)::int AS n FROM room_nights WHERE active GROUP BY unit_id, night HAVING count(*) > 1');
  assert.equal(dup.length, 0);
});

test('hàng rào cuối: dù bỏ qua khóa dòng, chèn trực tiếp hai dòng hoạt động cùng căn cùng đêm vẫn bị DB từ chối', async () => {
  const a = await book();
  const [bk2] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'X1','K',1,'giu') RETURNING id", [w.orgId]);
  await assert.rejects(
    db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-12')", [bk2.id, w.unitId]),
    (e) => e.code === '23505',
  );
  assert.ok(a.id);
});
```

- [ ] **Step 6: Chạy toàn bộ test**

Run: `cd /d/9app.tech/9stay && npm test`
Expected: PASS. Nếu bài "đổi chéo" cho `40P01` (deadlock) được chấp nhận trong test nhưng cho thấy thiết kế khóa còn rủi ro: ghi vào báo cáo, đừng sửa test để che. Nếu bài "chủ chặn đồng thời với đặt phòng" thất bại ở bất kỳ vòng nào: **dừng lại**, đó là lỗi nghiêm trọng về thứ tự khóa trong `claimNights`/`blockNights`, báo cáo trước khi sửa.

- [ ] **Step 7: Commit**

```bash
cd /d/9app.tech
git add 9stay/src/bookings.js 9stay/test/booking-ops.test.js 9stay/test/race.test.js
git commit -m "9stay: hủy, dời đơn và kiểm thử đua dữ liệu

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tài liệu, backlog và kiểm chứng cuối

**Files:**
- Create: `9stay/README.md`
- Modify: `docs/BACKLOG.md` (mục 9stay)
- Create: `9stay/.gitignore`

**Interfaces:** không có.

- [ ] **Step 1: Tạo `9stay/.gitignore`**

```
node_modules/
.env
*.log
```

- [ ] **Step 2: Tạo `9stay/README.md`**

```markdown
# 9stay

Phân phối phòng của nhiều chủ qua sale và cộng tác viên (khách đầu tiên: Anstay). Đặc tả: `docs/superpowers/specs/2026-10-13-9stay-design.md`. Bản phác giao diện: `docs/9stay-mockup.html`.

## Trạng thái

Lát 1A (nền dữ liệu và động cơ đặt phòng chống trùng) xong. Chưa có HTTP, đăng nhập 9id, giao diện, tiền, báo giá. Các lát tiếp theo xem mục 14 của đặc tả.

## Chạy kiểm thử

```
npm install
npm test
```

`npm test` tự dựng PostgreSQL thật tạm thời (embedded-postgres) nếu không có `DATABASE_URL`.

## Cấu trúc

- `db/001_core.sql`: lược đồ. `room_nights` có chỉ mục duy nhất từng phần là nguồn chống trùng.
- `src/time.js`: đêm nửa mở `[checkin, checkout)`, "hôm nay" theo giờ Việt Nam.
- `src/settings.js`: cài đặt theo phạm vi căn > chủ > tòa > org, có hiệu lực theo ngày.
- `src/inventory.js`: tòa, căn, chủ, hợp đồng, mở/chặn đêm của chủ.
- `src/bookings.js`: đặt, hủy, dời, tình trạng căn.

## Quy ước

Mọi hàm nghiệp vụ nhận `c` (từ `db.tx`) và phải chạy trong giao dịch. Đồng hồ được tiêm qua tham số `now`. Sự kiện chỉ chứa id và ngày.
```

- [ ] **Step 3: Cập nhật backlog**

Trong `docs/BACKLOG.md`, ở mục 9stay, thêm vào cuối đoạn: ` **Lát 1A xong (nền dữ liệu + đặt phòng chống trùng, ` + số test + `), nhánh feat/9stay, chưa merge, chưa deploy.** Tiếp theo: 1B (bảng giá, báo giá, cọc ghi tay, sổ, bản kê CSV), 1C (API + 9id), 1D (giao diện lịch).`

- [ ] **Step 4: Kiểm chứng cuối**

Run: `cd /d/9app.tech/9stay && npm test 2>&1 | tail -30`
Expected: tất cả PASS; ghi lại số test chạy và số pass vào báo cáo.

- [ ] **Step 5: Commit**

```bash
cd /d/9app.tech
git add 9stay/.gitignore 9stay/README.md docs/BACKLOG.md
git commit -m "9stay: README và cập nhật backlog cho lát 1A

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
