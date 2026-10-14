import { tx } from '../db.js';
import { can } from '../access.js';
import { AppError } from '../errors.js';

// Danh mục cho các ô chọn của giao diện, lọc theo vai: CTV chỉ thấy loại phòng; lễ tân thêm danh sách căn;
// quản lý thêm chủ phòng và sale/CTV (có tỉ lệ hoa hồng); chủ phòng chỉ thấy căn của mình.
export function catalogRoutes(app) {
  app.route('GET', '/api/catalog', async (ctx) => {
    const m = ctx.member;
    const seesTypes = can(m.role, 'availability.search') || can(m.role, 'calendar.read.all');
    const seesUnits = can(m.role, 'calendar.read.all');
    const seesOwnUnits = can(m.role, 'calendar.read.own');
    if (!seesTypes && !seesOwnUnits) throw new AppError('forbidden', 'Bạn không có quyền thực hiện việc này', 403);
    return tx(async (c) => {
      const out = {};
      if (seesTypes) {
        const rt = await c.query('SELECT id, name, capacity_std, capacity_max FROM room_types WHERE org_id = $1 ORDER BY name', [m.orgId]);
        out.roomTypes = rt.map((r) => ({ id: r.id, name: r.name, capacityStd: r.capacity_std, capacityMax: r.capacity_max }));
      }
      if (seesUnits || seesOwnUnits) {
        const rows = await c.query(
          `SELECT u.id, u.code, u.status, u.owner_id, u.room_type_id, b.name AS building_name, rt.name AS room_type_name
             FROM units u JOIN buildings b ON b.id = u.building_id JOIN room_types rt ON rt.id = u.room_type_id
            WHERE u.org_id = $1 AND ($2::uuid IS NULL OR u.owner_id = $2::uuid) ORDER BY b.name, u.code`,
          [m.orgId, seesUnits ? null : m.ownerId],
        );
        out.units = rows.map((r) => ({ id: r.id, code: r.code, status: r.status, ownerId: r.owner_id, roomTypeId: r.room_type_id, buildingName: r.building_name, roomTypeName: r.room_type_name }));
      }
      if (can(m.role, 'statement.owner.read.all')) {
        out.owners = (await c.query('SELECT id, name, kind FROM owners WHERE org_id = $1 ORDER BY name', [m.orgId])).map((r) => ({ id: r.id, name: r.name, kind: r.kind }));
      }
      if (can(m.role, 'agent.manage')) {
        out.agents = (await c.query('SELECT id, name, kind, commission_pct, status FROM agents WHERE org_id = $1 ORDER BY name', [m.orgId])).map((r) => ({ id: r.id, name: r.name, kind: r.kind, commissionPct: r.commission_pct, status: r.status }));
      }
      return out;
    });
  });
}
