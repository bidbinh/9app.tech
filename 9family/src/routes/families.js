import QRCode from 'qrcode';
import { config, DEFAULT_ESC } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { ensureSession, requireSession, forbidden, requireManager, requireOwner, isManager, touch, deviceLabel, memberFor } from '../auth.js';
import { clock } from '../clock.js';
import { cleanText, cleanPhone, cleanNote, normKey, newCode, newToken, sha256hex, CODE_RE, uuidParam, intIn, iso } from '../util.js';
import { notifyMembers } from '../notify.js';
import { dayOfMs } from '../vn.js';
import { solarToLunar, canChiYear } from '../lunar.js';
import { pushEnabled } from '../push.js';
import { famRoutes, publicPost, uniqueViolation, memberOut, childOut } from './common.js';

export const RELATIONS = ['bo', 'me', 'ong', 'ba', 'nguoi_than', 'giup_viec', 'khac'];

function relationOf(v, { external = false } = {}) {
  if (external) return 'don_ho';
  if (!RELATIONS.includes(v)) throw new ApiError(400, 'invalid_input', 'Vai trò không hợp lệ', { field: 'Vai trò' });
  return v;
}

// Cắt mọi liên kết của một thành viên khi họ rời đi hoặc bị mời ra
export async function detachMember(c, m, nowMs) {
  const at = new Date(nowMs).toISOString();
  await c.query('DELETE FROM sessions WHERE member_id=$1', [m.id]);
  await c.query('DELETE FROM push_subs WHERE member_id=$1', [m.id]);
  await c.query('DELETE FROM invites WHERE member_id=$1', [m.id]);
  await c.query('UPDATE rides SET p0 = CASE WHEN p0=$1 THEN NULL ELSE p0 END, p1 = CASE WHEN p1=$1 THEN NULL ELSE p1 END, p2 = CASE WHEN p2=$1 THEN NULL ELSE p2 END WHERE family_id=$2', [m.id, m.family_id]);
  await c.query(
    `UPDATE ride_days SET p0 = CASE WHEN p0=$1 THEN NULL ELSE p0 END, p1 = CASE WHEN p1=$1 THEN NULL ELSE p1 END, p2 = CASE WHEN p2=$1 THEN NULL ELSE p2 END,
            state = CASE WHEN state IN ('da_nhan','dang_di') AND claimed_by=$1 THEN 'cho' ELSE state END,
            claimed_by = CASE WHEN state IN ('da_nhan','dang_di') AND claimed_by=$1 THEN NULL ELSE claimed_by END
      WHERE family_id=$2 AND state IN ('cho','da_nhan','dang_di','khong_ai')`, [m.id, m.family_id]);
  await c.query('UPDATE events SET member_ids = array_remove(member_ids, $1) WHERE family_id=$2 AND $1 = ANY(member_ids)', [m.id, m.family_id]);
  await c.query('UPDATE tasks SET assignee_id = NULL WHERE assignee_id=$1', [m.id]);
  await c.query('UPDATE members SET left_at=$2, ics_token=NULL WHERE id=$1', [m.id, at]);
}

async function nameTaken(c, fid, name, exceptId = null) {
  const rows = await c.query('SELECT id, name FROM members WHERE family_id=$1 AND left_at IS NULL', [fid]);
  return rows.some((x) => x.id !== exceptId && normKey(x.name) === normKey(name));
}

function originFor(ctx, given) {
  const host = String(ctx.headers['x-forwarded-host'] || ctx.headers.host || '');
  const proto = ctx.headers['x-forwarded-proto'] || (config.production ? 'https' : 'http');
  try {
    const u = new URL(String(given));
    if (u.host === host) return u.origin;
  } catch { /* dùng giá trị suy ra */ }
  return `${proto}://${host}`;
}

export function familyRoutes(app) {
  const F = famRoutes(app);

  // ---------- tôi ở những gia đình nào ----------
  app.route('GET', '/api/me', async (ctx) => {
    if (!ctx.sid) return { families: [] };
    await touch(ctx);
    const rows = await query(
      `SELECT f.id, f.name, m.id AS member_id, m.name AS my_name, m.role,
              (SELECT count(*)::int FROM notifications n WHERE n.member_id = m.id AND n.read_at IS NULL) AS unread
         FROM members m JOIN sessions s ON s.member_id = m.id JOIN families f ON f.id = m.family_id
        WHERE s.token_hash = $1 AND m.left_at IS NULL AND m.external = false ORDER BY m.joined_at DESC NULLS LAST`, [ctx.sid]);
    return { families: rows.map((r) => ({ id: r.id, name: r.name, memberId: r.member_id, myName: r.my_name, role: r.role, unread: r.unread })) };
  });

  app.route('GET', '/api/config', async () => ({ ai: !!config.aiKey, push: { enabled: pushEnabled(), publicKey: pushEnabled() ? config.vapidPublic : '' } }));

  // ---------- tạo gia đình ----------
  publicPost(app, '/api/families', async (ctx) => {
    const b = ctx.body;
    const name = cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên gia đình' });
    const myName = cleanText(b.myName, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' });
    const relation = relationOf(b.relation || 'khac');
    const sid = ensureSession(ctx);
    const made = (await query("SELECT count(*)::int n FROM families WHERE created_by_hash=$1 AND created_at > now() - interval '24 hours'", [sid]))[0].n;
    if (made >= config.maxFamiliesPerDay) throw new ApiError(429, 'too_many', `Mỗi ngày chỉ tạo được ${config.maxFamiliesPerDay} gia đình, mai bạn tạo tiếp nhé`);
    const at = new Date(clock.now()).toISOString();
    return tx(async (c) => {
      const f = (await c.query('INSERT INTO families(name, created_by_hash) VALUES($1,$2) RETURNING id', [name, sid]))[0];
      const m = (await c.query(
        "INSERT INTO members(family_id, name, relation, role, joined_at, ics_token) VALUES($1,$2,$3,'chu',$4,$5) RETURNING id", [f.id, myName, relation, at, newToken()]))[0];
      await c.query('INSERT INTO sessions(token_hash, member_id, label) VALUES($1,$2,$3)', [sid, m.id, deviceLabel(ctx.headers['user-agent'])]);
      return { family: { id: f.id, name }, memberId: m.id };
    });
  }, { limit: 20, limitKey: 'mkfam' });

  // ---------- trang chính của gia đình ----------
  F.get('', async (ctx, me, fid) => {
    await touch(ctx);
    const f = (await query('SELECT * FROM families WHERE id=$1', [fid]))[0];
    const members = await query(
      `SELECT m.*, (SELECT max(expires_at) FROM invites i WHERE i.member_id = m.id AND i.kind='moi' AND i.used_at IS NULL) AS invite_until
         FROM members m WHERE m.family_id=$1 AND m.left_at IS NULL ORDER BY m.created_at, m.seq`, [fid]);
    const children = await query('SELECT * FROM children WHERE family_id=$1 ORDER BY created_at, id', [fid]);
    const nowMs = clock.now();
    const today = dayOfMs(nowMs);
    const l = solarToLunar(today);
    return {
      family: { id: f.id, name: f.name, esc: { ...DEFAULT_ESC, ...(f.settings.esc || {}) } },
      me: { id: me.id, name: me.name, role: me.role, relation: me.relation },
      members: members.map((m) => ({ ...memberOut(m, me), inviteUntil: isManager(me) && !m.external && !m.joined_at ? iso(m.invite_until) : undefined })),
      children: children.map(childOut),
      caps: { ai: !!config.aiKey, push: pushEnabled(), pushKey: pushEnabled() ? config.vapidPublic : '' },
      limits: { children: config.maxChildren },
      rev: f.rev, now: nowMs, today, lunar: { ...l, canChi: canChiYear(l.year) },
    };
  });

  F.get('/pulse', async (ctx, me, fid) => {
    const r = (await query(
      `SELECT f.rev, (SELECT count(*)::int FROM notifications n WHERE n.member_id=$2 AND n.read_at IS NULL) AS unread FROM families f WHERE f.id=$1`, [fid, me.id]))[0];
    return { rev: r.rev, unread: r.unread, now: clock.now() };
  });

  F.post('/settings', async (ctx, me, fid) => {
    requireManager(me);
    const b = ctx.body;
    const sets = []; const vals = [fid];
    if (b.name !== undefined) { vals.push(cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên gia đình' })); sets.push(`name=$${vals.length}`); }
    if (b.esc !== undefined) {
      const e = b.esc || {};
      const esc = {
        t1: intIn(e.t1, { min: 2, max: 180, field: 'Mốc nhắc người phụ trách' }), t2: intIn(e.t2, { min: 2, max: 180, field: 'Mốc nhắc dự phòng 1' }),
        t3: intIn(e.t3, { min: 1, max: 180, field: 'Mốc nhắc dự phòng 2' }), t4: intIn(e.t4, { min: 1, max: 180, field: 'Mốc báo cả nhà' }),
        after: intIn(e.after, { min: 1, max: 120, field: 'Mốc sau giờ ca' }),
      };
      if (!(esc.t1 > esc.t2 && esc.t2 > esc.t3 && esc.t3 > esc.t4)) throw new ApiError(400, 'invalid_input', 'Các mốc nhắc phải giảm dần: người phụ trách, dự phòng 1, dự phòng 2, báo cả nhà', { field: 'Mốc nhắc' });
      vals.push(JSON.stringify({ esc })); sets.push(`settings = settings || $${vals.length}::jsonb`);
    }
    if (!sets.length) return { ok: true };
    await query(`UPDATE families SET ${sets.join(', ')} WHERE id=$1`, vals);
    return { ok: true };
  });

  F.post('/delete', async (ctx, me, fid) => {
    requireOwner(me, 'Chỉ chủ gia đình mới xóa được gia đình');
    const f = (await query('SELECT name FROM families WHERE id=$1', [fid]))[0];
    if (normKey(String(ctx.body.confirm ?? '')) !== normKey(f.name)) throw new ApiError(400, 'confirm_mismatch', 'Hãy gõ đúng tên gia đình để xác nhận xóa');
    await query('DELETE FROM families WHERE id=$1', [fid]);
    ctx.noBump = true;
    return { ok: true };
  });

  F.post('/leave', async (ctx, me, fid) => {
    if (me.role === 'chu') {
      const others = (await query('SELECT count(*)::int n FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL AND id<>$2', [fid, me.id]))[0].n;
      throw new ApiError(409, 'owner_cannot_leave', others ? 'Bạn là chủ gia đình. Hãy chuyển quyền chủ cho người khác trước khi rời.' : 'Bạn là người duy nhất trong gia đình. Muốn thoát hãy xóa gia đình.');
    }
    await tx(async (c) => {
      await detachMember(c, me, clock.now());
      await notifyMembers(c, { familyId: fid, memberIds: (await c.query("SELECT id FROM members WHERE family_id=$1 AND role IN ('chu','quan_ly') AND left_at IS NULL", [fid])).map((r) => r.id), type: 'family', title: `${me.name} đã rời gia đình`, link: `#/f/${fid}/me` });
    });
    return { ok: true };
  });

  // ---------- thành viên ----------
  F.post('/members', async (ctx, me, fid) => {
    requireManager(me);
    const b = ctx.body;
    const external = b.external === true;
    const name = cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên' });
    const relation = relationOf(b.relation, { external });
    let role = 'thanh_vien';
    if (b.role === 'quan_ly') { requireOwner(me, 'Chỉ chủ gia đình mới đặt người quản lý'); if (external) throw new ApiError(400, 'invalid_input', 'Người đón hộ không thể là người quản lý'); role = 'quan_ly'; }
    const phone = external ? cleanPhone(b.phone) : '';
    const note = external ? cleanNote(b.note, { max: 200, field: 'Ghi chú nhận dạng' }) : '';
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      const n = (await c.query('SELECT count(*)::int n FROM members WHERE family_id=$1 AND left_at IS NULL', [fid]))[0].n;
      if (n >= config.maxMembers) throw new ApiError(409, 'family_full', `Gia đình đã đủ ${config.maxMembers} người`);
      if (await nameTaken(c, fid, name)) throw new ApiError(409, 'name_taken', 'Trong gia đình đã có người tên này. Thêm chữ đệm để phân biệt nhé.');
      const m = (await c.query(
        'INSERT INTO members(family_id, name, relation, role, external, phone, note, ics_token, joined_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [fid, name, relation, role, external, phone, note, external ? null : newToken(), external ? new Date(clock.now()).toISOString() : null]))[0];
      if (external) return { member: memberOut(m, me) };
      const inv = await makeInvite(c, fid, m.id, me.id, 'moi');
      return { member: memberOut(m, me), invite: inv };
    });
  });

  F.post('/members/:mid', async (ctx, me, fid) => {
    const mid = uuidParam(ctx.params.mid);
    const b = ctx.body;
    return tx(async (c) => {
      const m = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL FOR UPDATE', [mid, fid]))[0];
      if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên');
      const self = m.id === me.id;
      if (!self) {
        requireManager(me);
        if (m.role === 'chu') throw forbidden('Không sửa được thông tin của chủ gia đình');
        if (m.role === 'quan_ly' && me.role !== 'chu') throw forbidden('Chỉ chủ gia đình mới sửa người quản lý');
      }
      const upd = {};
      if (b.name !== undefined) {
        upd.name = cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên' });
        if (await nameTaken(c, fid, upd.name, m.id)) throw new ApiError(409, 'name_taken', 'Trong gia đình đã có người tên này');
      }
      if (b.relation !== undefined && !m.external) upd.relation = relationOf(b.relation);
      if (m.external) {
        if (b.phone !== undefined) upd.phone = cleanPhone(b.phone);
        if (b.note !== undefined) upd.note = cleanNote(b.note, { max: 200, field: 'Ghi chú nhận dạng' });
      }
      if (b.role !== undefined && b.role !== m.role) {
        requireOwner(me, 'Chỉ chủ gia đình mới đổi quyền');
        if (self || m.external || !['quan_ly', 'thanh_vien'].includes(b.role)) throw new ApiError(400, 'invalid_input', 'Quyền không hợp lệ', { field: 'Quyền' });
        upd.role = b.role;
      }
      const keys = Object.keys(upd);
      if (!keys.length) return { ok: true };
      await c.query(`UPDATE members SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1`, [mid, ...keys.map((k) => upd[k])]);
      return { ok: true };
    });
  });

  F.del('/members/:mid', async (ctx, me, fid) => {
    const mid = uuidParam(ctx.params.mid);
    requireManager(me);
    await tx(async (c) => {
      const m = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL FOR UPDATE', [mid, fid]))[0];
      if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên');
      if (m.id === me.id) throw new ApiError(400, 'invalid_input', 'Muốn rời gia đình hãy dùng nút Rời gia đình');
      if (m.role === 'chu') throw forbidden('Không xóa được chủ gia đình');
      if (m.role === 'quan_ly' && me.role !== 'chu') throw forbidden('Chỉ chủ gia đình mới xóa người quản lý');
      if (!m.external && !m.joined_at) { await c.query('DELETE FROM members WHERE id=$1', [m.id]); return; }
      await detachMember(c, m, clock.now());
    });
    return { ok: true };
  });

  // mời lại đúng thành viên đó (mất hết thiết bị): link mới, các thiết bị cũ bị thu hồi khi link được dùng
  F.post('/members/:mid/invite', async (ctx, me, fid) => {
    const mid = uuidParam(ctx.params.mid);
    requireManager(me);
    return tx(async (c) => {
      const m = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL FOR UPDATE', [mid, fid]))[0];
      if (!m || m.external) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên');
      if (m.id === me.id) throw new ApiError(400, 'invalid_input', 'Để dùng thêm thiết bị, hãy tạo link liên kết thiết bị');
      if (m.role === 'chu') throw forbidden('Không tạo lại link cho chủ gia đình');
      if (m.role === 'quan_ly' && me.role !== 'chu') throw forbidden('Chỉ chủ gia đình mới mời lại người quản lý');
      return { invite: await makeInvite(c, fid, m.id, me.id, 'moi'), member: { id: m.id, name: m.name } };
    });
  });

  F.post('/transfer', async (ctx, me, fid) => {
    requireOwner(me, 'Chỉ chủ gia đình mới chuyển quyền chủ');
    const mid = uuidParam(ctx.body.memberId);
    await tx(async (c) => {
      const m = (await c.query('SELECT * FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL FOR UPDATE', [mid, fid]))[0];
      if (!m || m.id === me.id) throw new ApiError(400, 'invalid_input', 'Hãy chọn một thành viên khác đã vào gia đình');
      await c.query("UPDATE members SET role='quan_ly' WHERE id=$1", [me.id]);
      await c.query("UPDATE members SET role='chu' WHERE id=$1", [m.id]);
      await notifyMembers(c, { familyId: fid, memberIds: [m.id], type: 'family', title: `${me.name} chuyển quyền chủ gia đình cho bạn`, link: `#/f/${fid}/me` });
    });
    return { ok: true };
  });

  // ---------- thiết bị ----------
  F.get('/devices', async (ctx, me) => {
    const rows = await query('SELECT token_hash, label, created_at, last_used_at FROM sessions WHERE member_id=$1 ORDER BY created_at', [me.id]);
    return { devices: rows.map((r) => ({ id: r.token_hash.slice(0, 16), label: r.label || 'Thiết bị', createdAt: iso(r.created_at), lastUsedAt: iso(r.last_used_at), current: r.token_hash === ctx.sid })) };
  });
  F.del('/devices/:did', async (ctx, me) => {
    const did = String(ctx.params.did);
    if (!/^[0-9a-f]{16}$/.test(did)) throw new ApiError(404, 'not_found', 'Không tìm thấy thiết bị');
    const rows = await query('SELECT token_hash FROM sessions WHERE member_id=$1 AND left(token_hash, 16) = $2', [me.id, did]);
    if (!rows.length) throw new ApiError(404, 'not_found', 'Không tìm thấy thiết bị');
    const total = (await query('SELECT count(*)::int n FROM sessions WHERE member_id=$1', [me.id]))[0].n;
    if (total <= 1 && rows[0].token_hash === ctx.sid) throw new ApiError(409, 'last_device', 'Đây là thiết bị duy nhất của bạn. Hãy thêm thiết bị khác trước, hoặc chọn Rời gia đình.');
    await tx(async (c) => {
      await c.query('DELETE FROM sessions WHERE member_id=$1 AND token_hash=$2', [me.id, rows[0].token_hash]);
      await c.query('DELETE FROM push_subs WHERE member_id=$1 AND sid=$2', [me.id, rows[0].token_hash]);
    });
    return { ok: true };
  });
  F.post('/devices/link', async (ctx, me, fid) => {
    const inv = await tx((c) => makeInvite(c, fid, me.id, me.id, 'thiet_bi'));
    const url = `${originFor(ctx, ctx.body.origin)}${config.basePath}/d/${inv.code}`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
    return { invite: inv, url, qr };
  });

  // ---------- link mời / liên kết thiết bị (không cần đăng nhập) ----------
  async function inviteState(c, code, lock) {
    if (!CODE_RE.test(code)) throw new ApiError(404, 'bad_code', 'Link không đúng. Hãy xin người trong nhà gửi lại link mới.');
    const inv = (await c.query(`SELECT * FROM invites WHERE code_hash=$1 ${lock ? 'FOR UPDATE' : ''}`, [sha256hex(code)]))[0];
    if (!inv) throw new ApiError(404, 'bad_code', 'Link không đúng. Hãy xin người trong nhà gửi lại link mới.');
    if (inv.used_at) throw new ApiError(410, 'invite_used', inv.kind === 'moi' ? 'Link mời này đã được dùng rồi. Hãy xin người trong nhà tạo link mới.' : 'Link liên kết này đã được dùng rồi. Hãy tạo link mới trên thiết bị cũ.');
    if (new Date(inv.expires_at).getTime() <= clock.now()) throw new ApiError(410, 'invite_expired', inv.kind === 'moi' ? 'Link mời đã hết hạn (7 ngày). Hãy xin người trong nhà tạo link mới.' : 'Link liên kết đã hết hạn (10 phút). Hãy tạo link mới trên thiết bị cũ.');
    return inv;
  }

  app.route('GET', '/api/invites/:code', async (ctx) => {
    let inv;
    try { inv = await inviteState({ query }, ctx.params.code, false); } catch (e) {
      // thành viên mở lại link đã dùng của chính gia đình mình: báo "đã ở trong gia đình" thay vì báo link hỏng
      if (e.code === 'invite_used' && ctx.sid) {
        const row = (await query('SELECT i.family_id, i.kind, f.name FROM invites i JOIN families f ON f.id = i.family_id WHERE i.code_hash=$1', [sha256hex(ctx.params.code)]))[0];
        const mine = row ? await memberFor(query, ctx.sid, row.family_id) : null;
        if (mine) return { kind: row.kind, familyName: row.name, memberName: mine.name, alreadyMember: true, familyId: row.family_id };
      }
      throw e;
    }
    const m = (await query('SELECT m.id, m.name, m.relation, m.left_at, f.name AS fname FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=$1', [inv.member_id]))[0];
    if (!m || m.left_at) throw new ApiError(410, 'invite_expired', 'Link này không còn dùng được.');
    const mine = ctx.sid ? await memberFor(query, ctx.sid, inv.family_id) : null;
    return { kind: inv.kind, familyName: m.fname, memberName: m.name, relation: m.relation, alreadyMember: !!mine, familyId: mine ? inv.family_id : undefined, expiresAt: iso(inv.expires_at) };
  }, { limit: 60, limitKey: 'invget' });

  publicPost(app, '/api/invites/:code/accept', async (ctx) => {
    const sid = ensureSession(ctx);
    const nowMs = clock.now();
    return tx(async (c) => {
      const inv = await inviteState(c, ctx.params.code, true);
      const m = (await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE', [inv.member_id]))[0];
      if (!m || m.left_at) throw new ApiError(410, 'invite_expired', 'Link này không còn dùng được.');
      const mine = (await c.query(
        'SELECT m.id FROM members m JOIN sessions s ON s.member_id=m.id WHERE s.token_hash=$1 AND m.family_id=$2 AND m.left_at IS NULL', [sid, inv.family_id]))[0];
      if (mine && mine.id !== m.id) throw new ApiError(409, 'already_member', 'Thiết bị này đã ở trong gia đình này với một tên khác. Link mời chỉ dành cho người chưa vào.');
      const label = deviceLabel(ctx.headers['user-agent']);
      if (mine) { await c.query('UPDATE invites SET used_at=$2 WHERE id=$1', [inv.id, new Date(nowMs).toISOString()]); return { familyId: inv.family_id, memberId: m.id, already: true }; }
      if (inv.kind === 'moi') {
        let name = m.name;
        if (ctx.body.name !== undefined && ctx.body.name !== m.name) {
          name = cleanText(ctx.body.name, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' });
          if (await nameTaken(c, inv.family_id, name, m.id)) throw new ApiError(409, 'name_taken', 'Trong gia đình đã có người tên này. Thêm chữ đệm để phân biệt nhé.');
        }
        if (m.joined_at) { // mời lại sau khi mất thiết bị: thu hồi mọi thiết bị cũ
          await c.query('DELETE FROM sessions WHERE member_id=$1', [m.id]);
          await c.query('DELETE FROM push_subs WHERE member_id=$1', [m.id]);
        }
        await c.query('UPDATE members SET name=$2, joined_at=COALESCE(joined_at,$3) WHERE id=$1', [m.id, name, new Date(nowMs).toISOString()]);
        if (!m.joined_at) {
          const mgr = (await c.query("SELECT id FROM members WHERE family_id=$1 AND role IN ('chu','quan_ly') AND left_at IS NULL AND id<>$2", [inv.family_id, m.id])).map((r) => r.id);
          await notifyMembers(c, { familyId: inv.family_id, memberIds: mgr, type: 'family', title: `${name} đã vào gia đình`, link: `#/f/${inv.family_id}/me`, dedupe: `join:${m.id}` });
        }
      }
      await c.query('INSERT INTO sessions(token_hash, member_id, label) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [sid, m.id, label]);
      await c.query('UPDATE invites SET used_at=$2 WHERE id=$1', [inv.id, new Date(nowMs).toISOString()]);
      await c.query('UPDATE families SET rev = rev + 1 WHERE id=$1', [inv.family_id]);
      return { familyId: inv.family_id, memberId: m.id };
    });
  }, { limit: 30, limitKey: 'invacc' });
}

export async function makeInvite(c, fid, memberId, byId, kind) {
  const code = newCode();
  const ttl = kind === 'moi' ? config.inviteDays * 86400_000 : config.deviceLinkMinutes * 60_000;
  const expires = new Date(clock.now() + ttl).toISOString();
  await c.query("DELETE FROM invites WHERE member_id=$1 AND kind=$2 AND used_at IS NULL", [memberId, kind]);
  await c.query('INSERT INTO invites(family_id, member_id, kind, code_hash, expires_at, created_by) VALUES($1,$2,$3,$4,$5,$6)', [fid, memberId, kind, sha256hex(code), expires, byId]);
  return { code, path: `${config.basePath}/${kind === 'moi' ? 'm' : 'd'}/${code}`, expiresAt: expires };
}
