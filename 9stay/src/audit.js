import { assertUuid } from './ids.js';

// Nhật ký chỉ thêm cho thao tác nhạy cảm. data chỉ chứa id, số liệu và ngày; không đưa tên, SĐT hay ghi chú tự do vào đây.
export async function audit(c, { orgId, actor = null, action, target = null, data = {} }) {
  assertUuid(orgId, 'org');
  await c.query('INSERT INTO audit_log(org_id, actor, action, target, data) VALUES($1, $2, $3, $4, $5::jsonb)', [orgId, actor, action, target, JSON.stringify(data)]);
}
