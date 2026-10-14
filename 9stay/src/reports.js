import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { isDate, nightsBetween } from './time.js';

// Công suất, ADR, RevPAR theo loại phòng trong [from, to).
// - Đêm bán được (available): đêm chủ đã mở bán (owner_releases.open). Đêm chủ dùng/chặn không tính vào mẫu số.
// - Đêm đã bán (sold): đêm có đơn đã cọc/đang ở/đã trả. Đơn giữ chỗ chưa cọc không tính doanh thu.
// - Doanh thu phòng là tiền đêm TRƯỚC VAT (price_lines kind=night, đã trừ ưu đãi).
// ADR = doanh thu / đêm đã bán; RevPAR = doanh thu / đêm bán được. Chia 0 thì trả null.
export async function occupancyReport(c, { orgId, from, to }) {
  assertUuid(orgId, 'org');
  if (!isDate(from) || !isDate(to)) throw new AppError('bad_dates', 'Ngày không hợp lệ');
  const days = nightsBetween(from, to).length;
  if (days > 366) throw new AppError('too_long', 'Báo cáo tối đa 366 đêm');
  const rows = await c.query(
    `SELECT rt.id AS room_type_id, rt.name,
            COALESCE(av.n, 0)::int AS available, COALESCE(sd.n, 0)::int AS sold, COALESCE(sd.rev, 0)::bigint AS revenue
       FROM room_types rt
       LEFT JOIN (SELECT u.room_type_id, count(*) AS n FROM owner_releases r JOIN units u ON u.id = r.unit_id
                   WHERE u.org_id = $1 AND r.kind = 'open' AND r.night >= $2::date AND r.night < $3::date GROUP BY u.room_type_id) av ON av.room_type_id = rt.id
       LEFT JOIN (SELECT u.room_type_id, count(*) AS n,
                         SUM((SELECT COALESCE(SUM(pl.amount), 0) FROM price_lines pl WHERE pl.booking_id = rn.booking_id AND pl.kind = 'night' AND pl.night = rn.night)) AS rev
                    FROM room_nights rn JOIN bookings b ON b.id = rn.booking_id JOIN units u ON u.id = rn.unit_id
                   WHERE rn.org_id = $1 AND rn.active AND b.status IN ('da_coc', 'da_nhan', 'da_tra') AND rn.night >= $2::date AND rn.night < $3::date
                   GROUP BY u.room_type_id) sd ON sd.room_type_id = rt.id
      WHERE rt.org_id = $1 ORDER BY rt.name`,
    [orgId, from, to],
  );
  const shape = (name, roomTypeId, available, sold, revenue) => ({
    roomTypeId, name, available, sold, revenue,
    occupancyPct: available > 0 ? Math.round((sold * 1000) / available) / 10 : null,
    adr: sold > 0 ? Math.round(revenue / sold) : null,
    revpar: available > 0 ? Math.round(revenue / available) : null,
  });
  const byType = rows.map((r) => shape(r.name, r.room_type_id, r.available, r.sold, r.revenue));
  const tot = byType.reduce((a, r) => ({ available: a.available + r.available, sold: a.sold + r.sold, revenue: a.revenue + r.revenue }), { available: 0, sold: 0, revenue: 0 });
  return { from, to, days, total: shape('Tất cả', null, tot.available, tot.sold, tot.revenue), byType };
}
