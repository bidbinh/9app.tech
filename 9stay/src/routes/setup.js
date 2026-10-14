import { tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { reassignUnitOwner, getSetup, addBuilding, addRoomType, addOwner, addUnits, setUnitStatus, addContracts, openUnitNights } from '../setup.js';

// Dữ liệu nền (chỉ quản lý): tòa nhà, loại phòng, chủ phòng, căn, hợp đồng chủ, mở bán đêm.
export function setupRoutes(app) {
  const W = (path, perm, fn, action) => app.route('POST', path, async (ctx) => {
    requirePerm(ctx, perm);
    return tx(async (c) => {
      const out = await fn(c, ctx);
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action, target: out && out.id ? out.id : null, data: {} });
      return out;
    });
  });

  app.route('GET', '/api/setup', async (ctx) => {
    requirePerm(ctx, 'setup.write');
    return tx((c) => getSetup(c, { orgId: ctx.member.orgId }));
  });
  W('/api/setup/buildings', 'setup.write', (c, ctx) => addBuilding(c, { orgId: ctx.member.orgId, ...ctx.body }), 'setup.building.add');
  W('/api/setup/room-types', 'setup.write', (c, ctx) => addRoomType(c, { orgId: ctx.member.orgId, ...ctx.body }), 'setup.roomtype.add');
  W('/api/setup/owners', 'setup.write', (c, ctx) => addOwner(c, { orgId: ctx.member.orgId, ...ctx.body }), 'setup.owner.add');
  W('/api/setup/units', 'setup.write', (c, ctx) => addUnits(c, { orgId: ctx.member.orgId, ...ctx.body }), 'setup.unit.add');
  W('/api/setup/units/:id/status', 'setup.write', async (c, ctx) => { await setUnitStatus(c, { orgId: ctx.member.orgId, unitId: ctx.params.id, status: ctx.body.status }); return { ok: true }; }, 'setup.unit.status');
  W('/api/setup/units/:id/owner', 'setup.write', (c, ctx) => reassignUnitOwner(c, { orgId: ctx.member.orgId, unitId: ctx.params.id, ownerId: ctx.body.ownerId }), 'setup.unit.owner');
  W('/api/setup/contracts', 'setup.write', (c, ctx) => addContracts(c, { orgId: ctx.member.orgId, ...ctx.body }), 'setup.contract.add');
  W('/api/setup/open-nights', 'setup.write', (c, ctx) => openUnitNights(c, { orgId: ctx.member.orgId, unitIds: ctx.body.unitIds, from: ctx.body.from, to: ctx.body.to, by: ctx.member.id }), 'setup.nights.open');
}
