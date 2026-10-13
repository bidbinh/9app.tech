import { AppError } from './errors.js';
import { todayVN } from './time.js';

// Mặc định theo đặc tả; mọi giá trị đổi được bằng setSetting, không sửa mã.
export const DEFAULTS = {
  'booking.maxNights': 60,
  'booking.maxAdvanceDays': 540,
  'booking.holdMinutesStaff': 1440,
  'org.codePrefix': 'ST',
  'pricing.vatPct': 10,
  'pricing.extraAdultFee': 100000,
  'pricing.childFee': 50000,
  'pricing.childFreeMaxAge': 5,
  'pricing.childAdultMinAge': 12,
  'pricing.depositPct': 30,
  'pricing.quoteHours': 24,
  'pricing.roundTo': 1000,
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
