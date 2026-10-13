// Gia đình trong 9family. Gia đình, thành viên, vai trò, hồ sơ con và lời mời nằm ở 9id (tài khoản 9app dùng chung);
// ở đây chỉ còn: danh sách gia đình của tôi (đọc từ 9id), trang chính, thiết lập leo thang, người đón hộ (không có tài khoản),
// quan hệ trong nhà của từng người và việc gộp thành viên cũ (chưa nối tài khoản) vào tài khoản mới.
import { config, DEFAULT_ESC } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireSession, requireManager, forbidden, touch, legacyFamilies } from '../auth.js';
import { clock } from '../clock.js';
import { cleanText, cleanPhone, cleanNote, normKey, uuidParam, intIn } from '../util.js';
import { dayOfMs } from '../vn.js';
import { solarToLunar, canChiYear } from '../lunar.js';
import { pushEnabled } from '../push.js';
import { detachMember, mergeMembers } from '../members.js';
import { userFamilies, familyContext, invalidateFamily } from '../id.js';
import { famRoutes, memberOut, childOut } from './common.js';

export { detachMember };
export const RELATIONS = ['bo', 'me', 'ong', 'ba', 'nguoi_than', 'giup_viec', 'khac'];

function relationOf(v, { external = false } = {}) {
  if (external) return 'don_ho';
  if (!RELATIONS.includes(v)) throw new ApiError(400, 'invalid_input', 'Vai trò không hợp lệ', { field: 'Vai trò' });
  return v;
}

// Khóa hàng gia đình rồi đọc lại người gọi (vai trò có thể đã đổi bởi một yêu cầu song song)
async function lockMe(c, fid, meId) {
  await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
  const m = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL AND external=false', [meId, fid]))[0];
  if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy gia đình này, hoặc bạn không ở trong gia đình');
  return m;
}

const idLinks = (fid) => ({ base: config.nineIdPublicPath, family: `${config.nineIdPublicPath}#/gia-dinh/${fid}`, invitations: `${config.nineIdPublicPath}#/loi-moi`, account: `${config.nineIdPublicPath}#/tai-khoan` });

export function familyRoutes(app) {
  const F = famRoutes(app);

  // ---------- tôi ở những gia đình nào (đọc từ 9id) ----------
  app.route('GET', '/api/me', async (ctx) => {
    if (!ctx.user) {
      requireSession(ctx); // 401 nếu cũng không có phiên cũ
      const fams = await legacyFamilies(ctx.legacy);
      return { user: null, legacy: true, login: config.nineIdPublicPath, pendingInvitations: 0, pendingApprovals: 0,
        families: fams.map((r) => ({ id: r.id, name: r.name, memberId: r.member_id, myName: r.my_name, role: r.role, unread: 0, legacy: true })) };
    }
    await touch(ctx);
    const uf = await userFamilies(ctx, { force: true }); // luôn đọc mới: người dùng vừa tạo/nhận gia đình ở 9id rồi quay lại
    const ids = uf.families.map((f) => f.id);
    let mine = ids.length ? await query(
      `SELECT m.family_id, m.id, m.name, (SELECT count(*)::int FROM notifications n WHERE n.member_id = m.id AND n.read_at IS NULL) AS unread
         FROM members m WHERE m.user_id = $1 AND m.left_at IS NULL AND m.family_id = ANY($2::uuid[])`, [ctx.user.userId, ids]) : [];
    // gia đình đã nhập từ phiên bản ẩn danh: lần đầu chủ mở sau khi nhận mã thì nối thành viên "chu" cũ với tài khoản này
    const known = new Set(mine.map((r) => r.family_id));
    const unlinked = ids.filter((id) => !known.has(id));
    if (unlinked.length) {
      const existing = (await query('SELECT id FROM families WHERE id = ANY($1::uuid[])', [unlinked])).map((r) => r.id).slice(0, 5);
      let any = false;
      for (const fid of existing) { try { await familyContext(ctx, fid, { force: true }); any = true; } catch { /* mở sau */ } }
      if (any) mine = await query(
        `SELECT m.family_id, m.id, m.name, (SELECT count(*)::int FROM notifications n WHERE n.member_id = m.id AND n.read_at IS NULL) AS unread
           FROM members m WHERE m.user_id = $1 AND m.left_at IS NULL AND m.family_id = ANY($2::uuid[])`, [ctx.user.userId, ids]);
    }
    const by = new Map(mine.map((r) => [r.family_id, r]));
    return {
      user: { displayName: ctx.user.displayName }, login: null, legacy: false,
      pendingInvitations: uf.pendingInvitations, pendingApprovals: uf.pendingApprovals,
      families: uf.families.map((f) => { const l = by.get(f.id); return { id: f.id, name: f.name, memberId: l ? l.id : null, myName: ctx.user.displayName, role: f.role, unread: l ? l.unread : 0 }; }),
    };
  });

  app.route('GET', '/api/config', async () => ({ ai: !!config.aiKey, push: { enabled: pushEnabled(), publicKey: pushEnabled() ? config.vapidPublic : '' }, id: { url: config.nineIdPublicPath }, legacy: config.legacySessions }));

  // ---------- trang chính của gia đình ----------
  F.get('', async (ctx, me, fid) => {
    await touch(ctx);
    const con = me.role === 'con';
    const f = (await query('SELECT * FROM families WHERE id=$1', [fid]))[0];
    const members = await query(
      `SELECT m.* FROM members m WHERE m.family_id=$1 AND m.left_at IS NULL ${con ? "AND m.external = false AND m.role <> 'con'" : ''} ORDER BY m.created_at, m.seq`, [fid]);
    const children = await query(
      `SELECT * FROM children WHERE family_id=$1 AND archived_at IS NULL ${con ? 'AND linked_user_id = $2' : ''} ORDER BY created_at, id`, con ? [fid, me.userId] : [fid]);
    const nowMs = clock.now();
    const today = dayOfMs(nowMs);
    const l = solarToLunar(today);
    const notes = new Map((ctx.view ? ctx.view.children : []).map((k) => [k.id, k.note]));
    let inbox = { invitations: 0, approvals: 0 };
    if (ctx.user) { try { const uf = await userFamilies(ctx); inbox = { invitations: uf.pendingInvitations, approvals: uf.pendingApprovals }; } catch { /* không chặn trang chính */ } }
    return {
      family: { id: f.id, name: f.name, esc: { ...DEFAULT_ESC, ...(f.settings.esc || {}) } },
      me: { id: me.id, name: me.name, role: me.role, relation: me.relation, childIds: me.childIds, ...(me.legacy ? { legacy: true } : {}) },
      members: members.map((m) => ({ ...memberOut(m, me), pending: !m.external && !m.user_id, linked: !!m.user_id })),
      children: children.map((k) => ({ ...childOut(k, me), healthNote: con ? undefined : (notes.get(k.id) || undefined) })),
      caps: { ai: !!config.aiKey, push: pushEnabled(), pushKey: pushEnabled() ? config.vapidPublic : '' },
      limits: { children: config.maxChildren },
      id: { ...idLinks(fid), inbox, notesHidden: !!me.notesHidden },
      rev: f.rev, now: nowMs, today, lunar: { ...l, canChi: canChiYear(l.year) },
    };
  }, { con: true });

  // giao diện vừa đổi gì đó ở 9id (thêm con, mời người...): làm mới bản đọc ngay, không chờ đệm 60 giây
  F.post('/resync', async (ctx, me, fid) => {
    ctx.noBump = true;
    invalidateFamily(fid);
    await familyContext(ctx, fid, { force: true });
    return { ok: true };
  }, { con: true, limit: 60, limitKey: 'resync' });

  F.get('/pulse', async (ctx, me, fid) => {
    const r = (await query(
      `SELECT f.rev, (SELECT count(*)::int FROM notifications n WHERE n.member_id=$2 AND n.read_at IS NULL) AS unread FROM families f WHERE f.id=$1`, [fid, me.id]))[0];
    return { rev: r.rev, unread: r.unread, now: clock.now() };
  }, { con: true });

  F.post('/settings', async (ctx, me, fid) => {
    requireManager(me);
    const b = ctx.body;
    if (b.name !== undefined) throw new ApiError(409, 'rename_in_id', 'Tên gia đình đổi ở tài khoản 9app (mục Gia đình của 9app).', { link: idLinks(fid).family });
    if (b.esc === undefined) return { ok: true };
    const e = b.esc || {};
    const esc = {
      t1: intIn(e.t1, { min: 2, max: 180, field: 'Mốc nhắc người phụ trách' }), t2: intIn(e.t2, { min: 2, max: 180, field: 'Mốc nhắc dự phòng 1' }),
      t3: intIn(e.t3, { min: 1, max: 180, field: 'Mốc nhắc dự phòng 2' }), t4: intIn(e.t4, { min: 1, max: 180, field: 'Mốc báo cả nhà' }),
      after: intIn(e.after, { min: 1, max: 120, field: 'Mốc sau giờ ca' }),
    };
    if (!(esc.t1 > esc.t2 && esc.t2 > esc.t3 && esc.t3 > esc.t4)) throw new ApiError(400, 'invalid_input', 'Các mốc nhắc phải giảm dần: người phụ trách, dự phòng 1, dự phòng 2, báo cả nhà', { field: 'Mốc nhắc' });
    await query('UPDATE families SET settings = settings || $2::jsonb WHERE id=$1', [fid, JSON.stringify({ esc })]);
    return { ok: true };
  });

  // ---------- thành viên: chỉ còn NGƯỜI ĐÓN HỘ (không có tài khoản) và quan hệ trong nhà ----------
  F.post('/members', async (ctx, me, fid) => {
    const b = ctx.body;
    requireManager(me);
    if (b.external !== true) throw new ApiError(409, 'invite_in_id', 'Mời người thân vào gia đình ở tài khoản 9app (bằng số điện thoại).', { link: idLinks(fid).family });
    const name = cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên' });
    const relation = relationOf(b.relation, { external: true });
    const phone = cleanPhone(b.phone);
    const note = cleanNote(b.note, { max: 200, field: 'Ghi chú nhận dạng' });
    return tx(async (c) => {
      me = await lockMe(c, fid, me.id);
      requireManager(me);
      const n = (await c.query('SELECT count(*)::int n FROM members WHERE family_id=$1 AND left_at IS NULL AND external = true', [fid]))[0].n;
      if (n >= config.maxMembers) throw new ApiError(409, 'family_full', `Chỉ lưu tối đa ${config.maxMembers} người đón hộ`);
      const dup = (await c.query('SELECT name FROM members WHERE family_id=$1 AND left_at IS NULL AND external = true', [fid])).some((x) => normKey(x.name) === normKey(name));
      if (dup) throw new ApiError(409, 'name_taken', 'Đã có người đón hộ tên này. Thêm chữ đệm để phân biệt nhé.');
      const m = (await c.query(
        'INSERT INTO members(family_id, name, relation, role, external, phone, note, joined_at) VALUES($1,$2,$3,\'thanh_vien\',true,$4,$5,$6) RETURNING *',
        [fid, name, relation, phone, note, new Date(clock.now()).toISOString()]))[0];
      return { member: memberOut(m, me) };
    });
  }, { noIdemBody: true });

  F.post('/members/:mid', async (ctx, me, fid) => {
    const mid = uuidParam(ctx.params.mid);
    const b = ctx.body;
    return tx(async (c) => {
      me = await lockMe(c, fid, me.id);
      const m = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL FOR UPDATE', [mid, fid]))[0];
      if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên');
      const self = m.id === me.id;
      if (!self) {
        requireManager(me);
        if (m.role === 'chu') throw forbidden('Không sửa được thông tin của chủ gia đình');
        if (m.role === 'quan_ly' && me.role !== 'chu') throw forbidden('Chỉ chủ gia đình mới sửa người quản lý');
      }
      const upd = {};
      if (!m.external && m.user_id) {
        // tên và vai trò của người có tài khoản do 9id quyết định
        if ((b.name !== undefined && b.name !== m.name) || b.role !== undefined) throw new ApiError(409, 'managed_in_id', 'Tên và quyền của thành viên có tài khoản 9app được đổi ở tài khoản 9app.', { link: idLinks(fid).family });
      } else if (b.name !== undefined) {
        upd.name = cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên' });
      }
      if (b.relation !== undefined && !m.external) upd.relation = relationOf(b.relation);
      if (m.external) {
        if (b.phone !== undefined) upd.phone = cleanPhone(b.phone);
        if (b.note !== undefined) upd.note = cleanNote(b.note, { max: 200, field: 'Ghi chú nhận dạng' });
      }
      const keys = Object.keys(upd);
      if (!keys.length) return { ok: true };
      await c.query(`UPDATE members SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1`, [mid, ...keys.map((k) => upd[k])]);
      return { ok: true };
    });
  });

  // xóa người đón hộ, hoặc thành viên cũ chưa nối tài khoản. Người có tài khoản thì gỡ ở 9id.
  F.del('/members/:mid', async (ctx, me, fid) => {
    const mid = uuidParam(ctx.params.mid);
    await tx(async (c) => {
      me = await lockMe(c, fid, me.id);
      requireManager(me);
      const m = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL FOR UPDATE', [mid, fid]))[0];
      if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên');
      if (m.id === me.id) throw new ApiError(400, 'invalid_input', 'Muốn rời gia đình hãy dùng tài khoản 9app');
      if (!m.external && m.user_id) throw new ApiError(409, 'managed_in_id', 'Mời người có tài khoản 9app ra khỏi gia đình ở tài khoản 9app.', { link: idLinks(fid).family });
      if (m.role === 'chu') throw forbidden('Không xóa được chủ gia đình');
      await detachMember(c, m, clock.now());
    });
    return { ok: true };
  });

  // Gộp thành viên cũ (từ bản ẩn danh, chưa có tài khoản) vào một thành viên đã có tài khoản 9app: ca đưa đón, việc, thông báo... chuyển sang người mới
  F.post('/members/:mid/merge', async (ctx, me, fid) => {
    const mid = uuidParam(ctx.params.mid);
    const into = uuidParam(ctx.body.into);
    await tx(async (c) => {
      me = await lockMe(c, fid, me.id);
      requireManager(me);
      const from = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL AND external=false AND user_id IS NULL FOR UPDATE', [mid, fid]))[0];
      const to = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL AND external=false AND user_id IS NOT NULL FOR UPDATE', [into, fid]))[0];
      if (!from || !to) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên');
      if (from.role === 'chu') throw forbidden('Không gộp chủ gia đình');
      if (to.role === 'con') throw new ApiError(400, 'invalid_input', 'Không gộp vào tài khoản của con', { field: 'Thành viên' });
      await mergeMembers(c, from, to);
    });
    return { ok: true };
  });
}
