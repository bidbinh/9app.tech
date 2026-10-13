import { AppError } from './errors.js';
import { assertUuid } from './ids.js';

export async function createAgent(c, { orgId, name, kind, commissionPct }) {
  assertUuid(orgId, 'org');
  if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new AppError('bad_agent', 'Tên sale/CTV không hợp lệ');
  if (!['sale', 'ctv'].includes(kind)) throw new AppError('bad_agent', 'Loại sale/CTV không hợp lệ');
  if (!Number.isInteger(commissionPct) || commissionPct < 0 || commissionPct > 100) throw new AppError('bad_agent', 'Tỉ lệ hoa hồng phải từ 0 đến 100');
  const [row] = await c.query('INSERT INTO agents(org_id, name, kind, commission_pct) VALUES($1, $2, $3, $4) RETURNING id', [orgId, name.trim(), kind, commissionPct]);
  return row;
}
