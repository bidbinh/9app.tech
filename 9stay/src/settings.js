import { AppError } from './errors.js';
import { todayVN, isDate } from './time.js';
import { assertUuid } from './ids.js';

// Mặc định theo đặc tả; mọi giá trị đổi được bằng setSetting, không sửa mã.
export const DEFAULTS = {
  'booking.maxNights': 60,
  'booking.maxAdvanceDays': 540,
  'booking.holdMinutesStaff': 1440,
  'booking.holdMinutesAgent': 120,
  'booking.maxHeldPerAgent': 5,
  'org.codePrefix': 'ST',
  'pricing.vatPct': 10,
  'pricing.extraAdultFee': 100000,
  'pricing.childFee': 50000,
  'pricing.childFreeMaxAge': 5,
  'pricing.childAdultMinAge': 12,
  'pricing.depositPct': 30,
  'pricing.quoteHours': 24,
  'pricing.roundTo': 1000,
  'ops.cleaningFee': 150000,
};

const SCOPES = ['unit', 'owner', 'building', 'org'];

// Kiểm kiểu và khoảng giá trị khi ghi: giá trị sai (chuỗi thay vì số, 0 làm bước làm tròn, % ngoài 0..100) bị từ chối ngay.
const int = (min, max = Number.MAX_SAFE_INTEGER) => (v) => Number.isSafeInteger(v) && v >= min && v <= max;
const VALID = {
  'booking.maxNights': int(1, 366),
  'booking.maxAdvanceDays': int(0, 3650),
  'booking.holdMinutesStaff': int(0, 525600),
  'booking.holdMinutesAgent': int(0, 525600),
  'booking.maxHeldPerAgent': int(1, 1000),
  'org.codePrefix': (v) => typeof v === 'string' && /^[A-Za-z]{1,6}$/.test(v),
  'pricing.vatPct': int(0, 100),
  'pricing.extraAdultFee': int(0),
  'pricing.childFee': int(0),
  'pricing.childFreeMaxAge': int(0, 17),
  'pricing.childAdultMinAge': int(1, 18),
  'pricing.depositPct': int(0, 100),
  'pricing.quoteHours': int(1, 720),
  'pricing.roundTo': int(1, 1000000),
  'ops.cleaningFee': int(0),
};

export async function setSetting(c, { orgId, scopeType, scopeId = null, key, value, effectiveFrom }) {
  if (!SCOPES.includes(scopeType) || (scopeType === 'org') !== (scopeId === null)) {
    throw new AppError('bad_scope', 'Phạm vi cài đặt không hợp lệ');
  }
  if (!(key in DEFAULTS)) throw new AppError('unknown_setting', 'Cài đặt không tồn tại: ' + key);
  if (!VALID[key](value)) throw new AppError('bad_setting', 'Giá trị không hợp lệ cho cài đặt ' + key);
  if (!isDate(effectiveFrom)) throw new AppError('bad_dates', 'Ngày hiệu lực không hợp lệ');
  assertUuid(orgId, 'org');
  if (scopeId !== null) {
    assertUuid(scopeId, 'phạm vi');
    const table = { building: 'buildings', owner: 'owners', unit: 'units' }[scopeType];
    if (!(await c.query(`SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2`, [scopeId, orgId])).length) throw new AppError('scope_not_found', 'Không tìm thấy đối tượng của phạm vi cài đặt', 404);
  }
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
