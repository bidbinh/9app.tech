// Nhắc khoản phải đóng (học phí...). Chạy trong bộ lập lịch. Mỗi mốc nhắc chỉ phát một lần nhờ khóa chính hm_fires.
// Mốc: 3 ngày trước hạn, đúng ngày hạn, 1 ngày sau hạn nếu chưa đóng; lúc 08:00 giờ Việt Nam. Người nhận: chủ/quản lý.
import { query, tx } from '../db.js';
import { dayOfMs, addDays, atMs } from '../vn.js';
import { notifyMembers } from '../notify.js';
import { fmtVnd } from './calc.js';

export async function dueStage(nowMs) {
  const today = dayOfMs(nowMs);
  const rows = await query(
    `SELECT id, family_id, title, amount, due_date FROM money_dues WHERE paid_on IS NULL AND due_date BETWEEN $1 AND $2`, [addDays(today, -1), addDays(today, 3)]);
  let n = 0;
  for (const d of rows) {
    for (const [slot, offset] of [['3', 3], ['0', 0], ['over', -1]]) {
      const fireDay = addDays(d.due_date, -offset);
      if (today !== fireDay && !(slot === '3' && today > fireDay && today < d.due_date)) continue;
      if (nowMs < atMs(fireDay, '08:00') && today === fireDay) continue;
      try {
        n += await tx(async (c) => {
          if (!(await c.query('INSERT INTO hm_fires(key) VALUES($1) ON CONFLICT DO NOTHING RETURNING 1', [`due:${d.id}:${slot}`])).length) return 0;
          const to = (await c.query("SELECT id FROM members WHERE family_id=$1 AND role IN ('chu','quan_ly') AND left_at IS NULL AND external=false AND joined_at IS NOT NULL", [d.family_id])).map((r) => r.id);
          const when = slot === 'over' ? 'Đã quá hạn' : slot === '0' ? 'Hạn là hôm nay' : 'Còn 3 ngày nữa là đến hạn';
          return notifyMembers(c, { familyId: d.family_id, memberIds: to, type: 'money', title: `Khoản phải đóng: ${d.title}`, body: `${when} · ${fmtVnd(Number(d.amount))}`, link: `#/f/${d.family_id}/money`, dedupe: `due:${d.id}:${slot}` });
        });
      } catch (e) { console.error('[scheduler:due]', e && e.code ? `code=${e.code}` : 'lỗi'); }
    }
  }
  return n;
}
