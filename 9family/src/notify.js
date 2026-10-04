// Tạo thông báo trong app + xếp hàng đẩy Web Push, trong cùng một giao dịch (c.query) để không mất, không trùng.
export const NOTIFY_TYPES = ['ride', 'event', 'important', 'task', 'family'];
export const TYPE_LABEL = { ride: 'Đưa đón', event: 'Sự kiện', important: 'Ngày quan trọng', task: 'Việc chung', family: 'Gia đình' };

const short = (s, n) => { const a = [...String(s ?? '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };

// memberIds: danh sách thành viên nhận. dedupe: khóa chống trùng theo từng người (tùy chọn).
// Nội dung đẩy chỉ gồm tiêu đề và dòng ngắn, không bao giờ kèm ghi chú, checklist hay ghi chú của con.
export async function notifyMembers(c, { familyId, memberIds, type, title, body = '', link = '', dedupe = null }) {
  const ids = [...new Set(memberIds)].filter(Boolean);
  if (!ids.length) return 0;
  const t = short(title, 80); const b = short(body, 140);
  const rows = await c.query(
    `INSERT INTO notifications(family_id, member_id, type, title, body, link, dedupe_key)
     SELECT $1, m.id, $3, $4, $5, $6, $7 FROM members m
      WHERE m.id = ANY($2::uuid[]) AND m.family_id = $1 AND m.left_at IS NULL AND m.external = false
     ON CONFLICT DO NOTHING RETURNING id, member_id`, [familyId, ids, type, t, b, link, dedupe]);
  if (!rows.length) return 0;
  const payload = JSON.stringify({ title: t, body: b, url: link, type, tag: dedupe || `n${rows[0].id}` });
  await c.query(
    `INSERT INTO push_outbox(sub_id, payload)
     SELECT s.id, $2::jsonb FROM push_subs s WHERE s.member_id = ANY($1::uuid[]) AND $3 = ANY(s.types)`,
    [rows.map((r) => r.member_id), payload, type]);
  return rows.length;
}

export async function activeMemberIds(c, familyId) {
  return (await c.query('SELECT id FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL', [familyId])).map((r) => r.id);
}

export async function bump(q, familyId) {
  await q('UPDATE families SET rev = rev + 1 WHERE id = $1', [familyId]);
}
