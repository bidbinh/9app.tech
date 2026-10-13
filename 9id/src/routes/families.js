import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import { requireUser } from '../auth.js';
import { withIdem } from '../idem.js';
import { reauth } from '../reauth.js';
import { cleanText, intIn, normalizePhone, phoneHash, phoneHashes, uuidParam, uuidBody, oneOf, notFound, forbidden } from '../util.js';
import { can, canMap, need, lockFamily, requireMember, listMembers, listChildren, transferOwner, unlinkUser, roleOf, notesHidden, revokeInvitesBy, ROLE_LABEL } from '../families.js';
import { audit } from '../auth.js';
import { consume } from '../throttle.js';
import { ipKey } from '../otp.js';
import { normalizeClaim, claimHash } from '../internal.js';

const NAME = { min: 1, max: 60, field: 'Tên gia đình' };
const OK = { ok: true };

// Thông điệp CHUNG cho người mời, giống nhau trong mọi trường hợp (kể cả lời mời bị bỏ qua vì hạn mức hoặc bị người nhận chặn)
export const INVITE_NOTICE = 'Đã ghi nhận lời mời. Nếu người nhận đã có tài khoản 9app, lời mời hiện ngay trong mục Lời mời của họ; nếu chưa, lời mời chờ tối đa 14 ngày. Có thể lời mời chưa đến được người nhận, hãy nhắc họ mở 9app.';

// Tạo lời mời. Phản hồi KHÔNG phụ thuộc số đã có tài khoản hay chưa, đã là thành viên, đã chặn người mời hay chưa (chống dò số).
// Chỉ các lỗi nói về chính người mời (số của mình, hạn mức của mình) mới được báo.
async function createInvite(c, { fid, kind, role, childId = null, phone, label = '', by }) {
  if (phone === by.phone) throw new ApiError(400, 'self_invite', 'Đây là số điện thoại của chính bạn');
  const ph = phoneHash(phone);
  const hashes = phoneHashes(phone);
  const mine = (await c.query("SELECT count(*)::int AS n FROM invitations WHERE invited_by=$1 AND created_at > now() - interval '24 hours'", [by.id]))[0].n;
  if (mine >= config.invitesPerUserDay) throw new ApiError(429, 'invite_limit', 'Bạn đã gửi quá nhiều lời mời hôm nay, hãy thử lại vào ngày mai');
  // tài khoản mới (dưới 24 giờ) bị hạn mức chặt hơn: chống tài khoản dùng một lần để làm phiền
  const fresh = new Date(by.createdAt).getTime() > Date.now() - config.newAccountHours * 3600_000;
  if (fresh && mine >= config.newAccountInvitesPerDay) throw new ApiError(429, 'invite_limit', 'Tài khoản mới chỉ được gửi ' + config.newAccountInvitesPerDay + ' lời mời mỗi ngày. Hãy thử lại sau.');
  const fam = (await c.query("SELECT count(*)::int AS n FROM invitations WHERE family_id=$1 AND status IN ('pending','awaiting') AND expires_at > now()", [fid]))[0].n;
  if (fam >= config.maxPendingPerFamily) throw new ApiError(409, 'too_many_pending', 'Gia đình đang có quá nhiều lời mời chờ, hãy thu hồi bớt');
  // từ đây mọi trường hợp bị bỏ qua đều im lặng (phản hồi vẫn giống hệt)
  const perPhone = (await c.query("SELECT count(*)::int AS n FROM invitations WHERE phone_hash = ANY($1) AND status='pending' AND expires_at > now()", [hashes]))[0].n;
  if (perPhone >= config.maxPendingPerPhone) return;
  // người nhận đã chặn người mời này
  const target = (await c.query('SELECT id FROM users WHERE phone=$1', [phone]))[0];
  if (target && (await c.query('SELECT 1 FROM invite_blocks WHERE user_id=$1 AND blocked_user_id=$2', [target.id, by.id])).length) return;
  // đã là thành viên. Riêng tài khoản của con có thể được mời lên làm người lớn (con lớn lên).
  const existing = (await c.query(
    `SELECT 1 FROM users u JOIN memberships m ON m.user_id = u.id AND m.family_id=$2 AND m.left_at IS NULL WHERE u.phone=$1 AND ($3 = 'con' OR m.role <> 'con')`, [phone, fid, kind]))[0];
  if (existing) return;
  if (childId) await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE child_id=$1 AND status IN ('pending','awaiting')", [childId]);
  await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE family_id=$1 AND phone_hash = ANY($2) AND status IN ('pending','awaiting')", [fid, hashes]);
  await c.query(
    `INSERT INTO invitations(family_id, kind, role, child_id, phone_hash, phone_last4, label, invited_by, expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8, now() + make_interval(days => $9))`, [fid, kind, role, childId, ph, phone.slice(-4), label, by.id, config.inviteTtlDays]);
}

function childInput(b, { partial = false } = {}) {
  const out = {};
  if (!partial || b.name !== undefined) out.name = cleanText(b.name, { min: 1, max: 40, field: 'Tên của con' });
  if (!partial || b.birthYear !== undefined) {
    out.birthYear = b.birthYear === null || b.birthYear === undefined || b.birthYear === '' ? null : intIn(b.birthYear, { min: new Date().getFullYear() - 30, max: new Date().getFullYear(), field: 'Năm sinh' });
  }
  if (!partial || b.note !== undefined) out.note = cleanText(b.note ?? '', { max: 300, multiline: true, field: 'Ghi chú' });
  return out;
}

async function getChild(c, fid, cid) {
  const ch = (await c.query('SELECT * FROM child_profiles WHERE id=$1 AND family_id=$2 FOR UPDATE', [cid, fid]))[0];
  if (!ch) throw notFound();
  return ch;
}

export function familyRoutes(app) {
  const R = (method, path, handler, opts) => app.route(method, path, async (ctx) => { requireUser(ctx); return handler(ctx); }, opts);

  // ---------- danh sách, tạo ----------
  R('GET', '/api/families', async (ctx) => {
    const rows = await query(
      `SELECT f.id, f.name, m.role,
              (SELECT count(*)::int FROM memberships x WHERE x.family_id = f.id AND x.left_at IS NULL) AS member_count,
              (SELECT count(*)::int FROM child_profiles ch WHERE ch.family_id = f.id AND ch.archived_at IS NULL) AS child_count
         FROM memberships m JOIN families f ON f.id = m.family_id WHERE m.user_id=$1 AND m.left_at IS NULL ORDER BY m.joined_at`, [ctx.user.id]);
    return { families: rows.map((r) => ({ id: r.id, name: r.name, role: r.role, roleLabel: ROLE_LABEL[r.role], memberCount: r.member_count, childCount: r.role === 'con' ? null : r.child_count })) };
  });

  R('POST', '/api/families', withIdem(async (ctx) => {
    const name = cleanText(ctx.body.name, NAME);
    const u = ctx.user;
    const fam = await tx(async (c) => {
      // khóa theo người dùng để hai yêu cầu đồng thời không vượt hạn mức
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['fam:' + u.id]);
      const owned = (await c.query("SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND role='chu' AND left_at IS NULL", [u.id]))[0].n;
      if (owned >= config.maxFamiliesOwned) throw new ApiError(409, 'family_limit', `Bạn đã làm chủ ${config.maxFamiliesOwned} gia đình, đó là mức tối đa`);
      const joined = (await c.query('SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND left_at IS NULL', [u.id]))[0].n;
      if (joined >= config.maxFamiliesJoined) throw new ApiError(409, 'family_limit', 'Bạn đã tham gia quá nhiều gia đình');
      const f = (await c.query('INSERT INTO families(name, created_by) VALUES($1,$2) RETURNING id, name', [name, u.id]))[0];
      await c.query("INSERT INTO memberships(family_id, user_id, role) VALUES($1,$2,'chu')", [f.id, u.id]);
      return f;
    });
    return { family: { id: fam.id, name: fam.name, role: 'chu' } };
  }), { limit: 30 });

  // ---------- chi tiết ----------
  R('GET', '/api/families/:fid', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const f = await requireMember(query, fid, ctx.user.id);
    const manager = can(f.role, 'invite');
    const hidden = notesHidden(f);
    const [members, children] = await Promise.all([listMembers(query, fid, f.role, ctx.user.id), listChildren(query, fid, f.role, ctx.user.id, { hideNotes: hidden })]);
    let invitations = [];
    if (manager) {
      invitations = (await query(
        `SELECT i.id, i.kind, i.role, i.child_id, i.label, i.status, i.phone_last4, i.expires_at, i.invited_by, u.display_name AS by_name, c.name AS child_name, a.display_name AS accepter_name
           FROM invitations i LEFT JOIN users u ON u.id = i.invited_by LEFT JOIN users a ON a.id = i.accepted_by LEFT JOIN child_profiles c ON c.id = i.child_id
          WHERE i.family_id=$1 AND i.status IN ('pending','awaiting') AND i.expires_at > now() ORDER BY i.created_at`, [fid]))
        .map((i) => ({ id: i.id, kind: i.kind, role: i.role, childId: i.child_id, childName: i.child_name, label: i.label, status: i.status, awaiting: i.status === 'awaiting', phoneLast4: i.phone_last4, accepterName: i.status === 'awaiting' ? i.accepter_name : null, expiresAt: i.expires_at, invitedByName: i.by_name, mine: i.invited_by === ctx.user.id }));
    }
    return {
      family: { id: f.id, name: f.name, createdAt: f.created_at, settings: f.role === 'con' ? undefined : { requireApproval: f.require_approval, notesForNewMembers: f.notes_for_new }, notesHidden: hidden },
      me: { userId: ctx.user.id, role: f.role, roleLabel: ROLE_LABEL[f.role] },
      can: canMap(f.role),
      members: members.map((m) => ({ ...m, roleLabel: ROLE_LABEL[m.role] })),
      children,
      invitations,
    };
  });

  R('POST', '/api/families/:fid/rename', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const name = cleanText(ctx.body.name, NAME);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const role = await roleOf(c.query, fid, ctx.user.id);
      if (!role) throw notFound();
      need(role, 'rename');
      await c.query('UPDATE families SET name=$2 WHERE id=$1', [fid, name]);
      return { family: { id: fid, name } };
    });
  });

  // ---------- hồ sơ con ----------
  R('POST', '/api/families/:fid/children', withIdem(async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const data = childInput(ctx.body);
    const hasPhone = ctx.body.phone !== undefined && ctx.body.phone !== null && String(ctx.body.phone).trim() !== '';
    const phone = hasPhone ? normalizePhone(ctx.body.phone) : null;
    const child = await tx(async (c) => {
      await lockFamily(c, fid);
      const role = await roleOf(c.query, fid, ctx.user.id);
      if (!role) throw notFound();
      need(role, 'editChildren');
      const n = (await c.query('SELECT count(*)::int AS n FROM child_profiles WHERE family_id=$1', [fid]))[0].n;
      if (n >= config.maxChildren) throw new ApiError(409, 'child_limit', 'Gia đình đã có quá nhiều hồ sơ con');
      const ch = (await c.query(
        'INSERT INTO child_profiles(family_id, name, birth_year, note, created_by) VALUES($1,$2,$3,$4,$5) RETURNING id, name, birth_year',
        [fid, data.name, data.birthYear, data.note, ctx.user.id]))[0];
      if (phone) await createInvite(c, { fid, kind: 'con', role: 'con', childId: ch.id, phone, label: data.name, by: ctx.user });
      return ch;
    });
    return { child: { id: child.id, name: child.name, birthYear: child.birth_year }, ok: true, notice: INVITE_NOTICE };
  }), { limit: 60 });

  R('POST', '/api/families/:fid/children/:cid', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const cid = uuidParam(ctx.params.cid);
    const data = childInput(ctx.body, { partial: true });
    return tx(async (c) => {
      await lockFamily(c, fid);
      const role = await roleOf(c.query, fid, ctx.user.id);
      if (!role) throw notFound();
      need(role, 'editChildren');
      const ch = await getChild(c, fid, cid);
      const n = { name: data.name ?? ch.name, birth_year: data.birthYear !== undefined ? data.birthYear : ch.birth_year, note: data.note ?? ch.note };
      await c.query('UPDATE child_profiles SET name=$2, birth_year=$3, note=$4 WHERE id=$1', [cid, n.name, n.birth_year, n.note]);
      return OK;
    });
  });

  R('POST', '/api/families/:fid/children/:cid/archive', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const cid = uuidParam(ctx.params.cid);
    const archived = ctx.body.archived !== false;
    return tx(async (c) => {
      await lockFamily(c, fid);
      const role = await roleOf(c.query, fid, ctx.user.id);
      if (!role) throw notFound();
      need(role, 'editChildren');
      await getChild(c, fid, cid);
      await c.query('UPDATE child_profiles SET archived_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1', [cid, archived]);
      if (archived) await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE child_id=$1 AND status='pending'", [cid]);
      return OK;
    });
  });

  R('DELETE', '/api/families/:fid/children/:cid', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const cid = uuidParam(ctx.params.cid);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const role = await roleOf(c.query, fid, ctx.user.id);
      if (!role) throw notFound();
      need(role, 'editChildren');
      const ch = await getChild(c, fid, cid);
      if (ch.linked_user_id) await unlinkUser(c, fid, ch.linked_user_id);
      await c.query('DELETE FROM child_profiles WHERE id=$1', [cid]);
      return OK;
    });
  });

  // nối số điện thoại cho hồ sơ con: tạo lời mời; phản hồi đồng nhất
  R('POST', '/api/families/:fid/children/:cid/phone', withIdem(async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const cid = uuidParam(ctx.params.cid);
    const phone = normalizePhone(ctx.body.phone);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const role = await roleOf(c.query, fid, ctx.user.id);
      if (!role) throw notFound();
      need(role, 'editChildren');
      const ch = await getChild(c, fid, cid);
      if (ch.archived_at) throw new ApiError(409, 'archived', 'Hồ sơ này đã lưu trữ');
      if (ch.linked_user_id) throw new ApiError(409, 'already_linked', 'Hồ sơ này đã nối với một tài khoản. Hãy gỡ nối trước nếu muốn đổi số.');
      await createInvite(c, { fid, kind: 'con', role: 'con', childId: cid, phone, label: ch.name, by: ctx.user });
      return { ok: true, notice: INVITE_NOTICE };
    });
  }), { limit: 30 });

  // gỡ nối: cha mẹ hoặc chính con
  R('POST', '/api/families/:fid/children/:cid/unlink', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const cid = uuidParam(ctx.params.cid);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const role = await roleOf(c.query, fid, ctx.user.id);
      if (!role) throw notFound();
      const ch = await getChild(c, fid, cid);
      if (role === 'con') { if (ch.linked_user_id !== ctx.user.id) throw notFound(); } else need(role, 'editChildren');
      if (!ch.linked_user_id) return OK;
      await unlinkUser(c, fid, ch.linked_user_id);
      await audit(c, ctx.user.id, 'child_unlinked');
      return OK;
    });
  });

  // ---------- mời người lớn ----------
  R('POST', '/api/families/:fid/invites', withIdem(async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const phone = normalizePhone(ctx.body.phone);
    const role = oneOf(ctx.body.role ?? 'thanh_vien', ['quan_ly', 'thanh_vien'], 'Vai trò');
    const label = cleanText(ctx.body.label ?? '', { max: 40, field: 'Ghi chú' });
    return tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'invite');
      if (role === 'quan_ly') need(my, 'inviteManager', 'Chỉ chủ gia đình mới mời người làm Quản lý');
      const members = (await c.query('SELECT count(*)::int AS n FROM memberships WHERE family_id=$1 AND left_at IS NULL', [fid]))[0].n;
      if (members >= config.maxMembers) throw new ApiError(409, 'member_limit', 'Gia đình đã đủ số thành viên tối đa');
      await createInvite(c, { fid, kind: 'nguoi_lon', role, phone, label, by: ctx.user });
      return { ok: true, notice: INVITE_NOTICE };
    });
  }), { limit: 30 });

  R('DELETE', '/api/families/:fid/invites/:iid', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const iid = uuidParam(ctx.params.iid);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'invite');
      const inv = (await c.query("SELECT * FROM invitations WHERE id=$1 AND family_id=$2 AND status IN ('pending','awaiting') FOR UPDATE", [iid, fid]))[0];
      if (!inv) throw notFound();
      if (my !== 'chu' && inv.invited_by !== ctx.user.id) throw forbidden('Bạn chỉ thu hồi được lời mời do mình gửi');
      await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE id=$1", [iid]);
      return OK;
    });
  });

  // Duyệt người nhận: sau khi người được mời bấm chấp nhận, chủ/quản lý xem 4 số cuối của số đã mời rồi duyệt hoặc từ chối.
  R('POST', '/api/families/:fid/invites/:iid/approve', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const iid = uuidParam(ctx.params.iid);
    const out = await tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'approve');
      const inv = (await c.query("SELECT * FROM invitations WHERE id=$1 AND family_id=$2 AND status='awaiting' FOR UPDATE", [iid, fid]))[0];
      if (!inv) throw notFound();
      if (new Date(inv.expires_at) < new Date()) {
        await c.query("UPDATE invitations SET status='expired', decided_at=now() WHERE id=$1", [iid]);
        return { err: new ApiError(410, 'expired', 'Lời mời đã hết hạn. Hãy gửi lại.') };
      }
      const user = inv.accepted_by ? (await c.query('SELECT id, phone FROM users WHERE id=$1', [inv.accepted_by]))[0] : null;
      if (!user || !phoneHashes(user.phone).includes(inv.phone_hash)) {
        await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE id=$1", [iid]);
        return { err: new ApiError(409, 'gone', 'Người nhận không còn hợp lệ. Lời mời đã bị hủy.') };
      }
      const r = await finalizeInvite(c, inv, user.id);
      if (!r.err) await audit(c, ctx.user.id, 'invite_approved', inv.kind);
      return r;
    });
    if (out.err) throw out.err;
    return { ok: true };
  });

  R('POST', '/api/families/:fid/invites/:iid/reject', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const iid = uuidParam(ctx.params.iid);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'approve');
      const r = await c.query("UPDATE invitations SET status='declined', decided_at=now() WHERE id=$1 AND family_id=$2 AND status='awaiting' RETURNING 1", [iid, fid]);
      if (!r.length) throw notFound();
      await audit(c, ctx.user.id, 'invite_rejected');
      return OK;
    });
  });

  // Cài đặt gia đình (chỉ chủ). Tắt bước duyệt làm lời mời gõ nhầm số vào thẳng gia đình ngay khi người lạ bấm chấp nhận.
  R('POST', '/api/families/:fid/settings', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const b = ctx.body;
    for (const k of ['requireApproval', 'notesForNewMembers']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw new ApiError(400, 'invalid_input', 'Giá trị cài đặt không hợp lệ', { field: k });
    return tx(async (c) => {
      const f = await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'settings');
      const ra = b.requireApproval === undefined ? f.require_approval : b.requireApproval;
      const nn = b.notesForNewMembers === undefined ? f.notes_for_new : b.notesForNewMembers;
      await c.query('UPDATE families SET require_approval=$2, notes_for_new=$3 WHERE id=$1', [fid, ra, nn]);
      if (ra !== f.require_approval) await audit(c, ctx.user.id, ra ? 'approval_on' : 'approval_off');
      return { ok: true, settings: { requireApproval: ra, notesForNewMembers: nn } };
    });
  });

  // ---------- lời mời gửi cho tôi ----------
  // Chỉ lộ: tên gia đình (do người dùng tự đặt), tên người mời, loại lời mời. KHÔNG lộ thành viên, tên con, lịch hay dữ liệu gia đình.
  R('GET', '/api/invitations', async (ctx) => {
    const rows = await query(
      `SELECT i.id, i.kind, i.role, i.status, i.expires_at, i.created_at, f.name AS family_name, u.display_name AS by_name
         FROM invitations i JOIN families f ON f.id = i.family_id LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.phone_hash = ANY($1) AND i.status IN ('pending','awaiting') AND i.expires_at > now() AND (i.status = 'pending' OR i.accepted_by = $2) ORDER BY i.created_at DESC`, [phoneHashes(ctx.user.phone), ctx.user.id]);
    return { invitations: rows.map((r) => ({ id: r.id, kind: r.kind, role: r.role, roleLabel: ROLE_LABEL[r.role], status: r.status, awaitingApproval: r.status === 'awaiting', familyName: r.family_name, familyNameNote: 'Tên gia đình do người dùng tự đặt, không phải xác nhận của 9app', invitedByName: r.by_name || 'Một thành viên', expiresAt: r.expires_at, createdAt: r.created_at })) };
  });

  async function myInvitation(c, iid, me, { statuses = ['pending'] } = {}) {
    // khóa gia đình trước, rồi mới khóa lời mời (cùng thứ tự với các thao tác khác)
    const pre = (await c.query('SELECT family_id, phone_hash FROM invitations WHERE id=$1', [iid]))[0];
    if (!pre || !phoneHashes(me.phone).includes(pre.phone_hash)) throw notFound('Không tìm thấy lời mời này');
    await lockFamily(c, pre.family_id);
    const inv = (await c.query('SELECT * FROM invitations WHERE id=$1 FOR UPDATE', [iid]))[0];
    if (!inv || !statuses.includes(inv.status)) throw notFound('Không tìm thấy lời mời này');
    return inv;
  }

  // Hoàn tất lời mời: tạo thành viên / nối hồ sơ con. Gọi khi người nhận chấp nhận (không cần duyệt) hoặc khi chủ/quản lý duyệt.
  async function finalizeInvite(c, inv, userId) {
    const existing = await roleOf(c.query, inv.family_id, userId);
    const done = async () => { await c.query("UPDATE invitations SET status='accepted', decided_at=now(), accepted_by=$2 WHERE id=$1", [inv.id, userId]); await audit(c, userId, 'invite_accepted', inv.kind); };
    if (inv.kind === 'nguoi_lon') {
      if (existing && existing !== 'con') { await done(); return { ok: true, familyId: inv.family_id }; }
      if (existing === 'con') await unlinkUser(c, inv.family_id, userId); // con lớn lên: gỡ nối hồ sơ con rồi vào làm người lớn
      const joined = existing ? 0 : (await c.query('SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND left_at IS NULL', [userId]))[0].n;
      if (joined >= config.maxFamiliesJoined) return { err: new ApiError(409, 'family_limit', 'Người nhận đã tham gia quá nhiều gia đình') };
      const members = (await c.query('SELECT count(*)::int AS n FROM memberships WHERE family_id=$1 AND left_at IS NULL', [inv.family_id]))[0].n;
      if (members >= config.maxMembers) return { err: new ApiError(409, 'member_limit', 'Gia đình đã đủ số thành viên tối đa') };
      await c.query('INSERT INTO memberships(family_id, user_id, role) VALUES($1,$2,$3)', [inv.family_id, userId, inv.role]);
      await done();
      return { ok: true, familyId: inv.family_id };
    }
    // lời mời nối hồ sơ con
    const ch = (await c.query('SELECT * FROM child_profiles WHERE id=$1 AND family_id=$2 FOR UPDATE', [inv.child_id, inv.family_id]))[0];
    if (!ch || ch.archived_at) {
      await c.query("UPDATE invitations SET status='revoked', decided_at=now() WHERE id=$1", [inv.id]);
      return { err: new ApiError(409, 'gone', 'Hồ sơ này không còn nữa. Lời mời đã bị hủy.') };
    }
    if (ch.linked_user_id && ch.linked_user_id !== userId) return { err: new ApiError(409, 'child_already_linked', 'Hồ sơ này đã nối với một tài khoản khác') };
    if (existing && existing !== 'con') return { err: new ApiError(409, 'already_member', 'Người nhận đã ở trong gia đình này với vai trò người lớn') };
    if (!existing) {
      const joined = (await c.query('SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND left_at IS NULL', [userId]))[0].n;
      if (joined >= config.maxFamiliesJoined) return { err: new ApiError(409, 'family_limit', 'Người nhận đã tham gia quá nhiều gia đình') };
      await c.query("INSERT INTO memberships(family_id, user_id, role) VALUES($1,$2,'con')", [inv.family_id, userId]);
    } else {
      // đã là "con" của gia đình này qua hồ sơ khác: chuyển sang hồ sơ mới
      await c.query('UPDATE child_profiles SET linked_user_id = NULL WHERE family_id=$1 AND linked_user_id=$2', [inv.family_id, userId]);
    }
    await c.query('UPDATE child_profiles SET linked_user_id=$2 WHERE id=$1', [ch.id, userId]);
    await done();
    return { ok: true, familyId: inv.family_id };
  }

  R('POST', '/api/invitations/:iid/accept', async (ctx) => {
    const iid = uuidParam(ctx.params.iid);
    const me = ctx.user;
    const out = await tx(async (c) => {
      const inv = await myInvitation(c, iid, me);
      if (new Date(inv.expires_at) < new Date()) {
        await c.query("UPDATE invitations SET status='expired', decided_at=now() WHERE id=$1", [iid]);
        return { err: new ApiError(410, 'expired', 'Lời mời đã hết hạn. Hãy nhờ người mời gửi lại.') };
      }
      const fam = (await c.query('SELECT require_approval FROM families WHERE id=$1', [inv.family_id]))[0];
      const existing = await roleOf(c.query, inv.family_id, me.id);
      const needsApproval = fam.require_approval && !(inv.kind === 'nguoi_lon' && existing && existing !== 'con');
      if (needsApproval) {
        // chờ chủ/quản lý duyệt: người nhận CHƯA thấy dữ liệu gia đình nào
        await c.query("UPDATE invitations SET status='awaiting', accepted_by=$2, accepted_at=now() WHERE id=$1", [iid, me.id]);
        return { ok: true, awaiting: true };
      }
      return finalizeInvite(c, inv, me.id);
    });
    if (out.err) throw out.err;
    return out;
  });

  R('POST', '/api/invitations/:iid/decline', async (ctx) => {
    const iid = uuidParam(ctx.params.iid);
    return tx(async (c) => {
      await myInvitation(c, iid, ctx.user, { statuses: ['pending', 'awaiting'] });
      await c.query("UPDATE invitations SET status='declined', decided_at=now() WHERE id=$1", [iid]);
      return OK;
    });
  });

  // Chặn người mời (và báo cáo): từ chối lời mời, người mời không gửi lời mời cho mình được nữa (người mời không được báo là đã bị chặn).
  async function blockInviter(ctx, report) {
    const iid = uuidParam(ctx.params.iid);
    return tx(async (c) => {
      const inv = await myInvitation(c, iid, ctx.user, { statuses: ['pending', 'awaiting'] });
      await c.query("UPDATE invitations SET status='declined', decided_at=now() WHERE id=$1", [iid]);
      if (inv.invited_by && inv.invited_by !== ctx.user.id) {
        await c.query('INSERT INTO invite_blocks(user_id, blocked_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [ctx.user.id, inv.invited_by]);
        if (report) await c.query('INSERT INTO invite_reports(reporter, reported, family_id) VALUES($1,$2,$3)', [ctx.user.id, inv.invited_by, inv.family_id]);
        await audit(c, ctx.user.id, report ? 'invite_reported' : 'invite_blocked');
      }
      return OK;
    });
  }
  R('POST', '/api/invitations/:iid/block', (ctx) => blockInviter(ctx, false));
  R('POST', '/api/invitations/:iid/report', (ctx) => blockInviter(ctx, true));

  R('GET', '/api/blocks', async (ctx) => {
    const rows = await query('SELECT b.blocked_user_id AS id, u.display_name, b.created_at FROM invite_blocks b JOIN users u ON u.id = b.blocked_user_id WHERE b.user_id=$1 ORDER BY b.created_at DESC', [ctx.user.id]);
    return { blocks: rows.map((r) => ({ userId: r.id, displayName: r.display_name, at: r.created_at })) };
  });
  R('DELETE', '/api/blocks/:uid', async (ctx) => {
    const r = await query('DELETE FROM invite_blocks WHERE user_id=$1 AND blocked_user_id=$2 RETURNING 1', [ctx.user.id, uuidParam(ctx.params.uid)]);
    if (!r.length) throw notFound();
    return OK;
  });

  // ---------- nhận gia đình được nhập từ app khác bằng mã nhận (xem spec mục 15) ----------
  R('POST', '/api/claims/redeem', async (ctx) => {
    await consume('cl:u:' + ctx.user.id, { limit: 10, windowSec: 3600, message: 'Bạn nhập mã nhận quá nhiều lần, hãy thử lại sau' });
    await consume('cl:i:' + ipKey(ctx.ip), { limit: 30, windowSec: 3600, message: 'Bạn nhập mã nhận quá nhiều lần, hãy thử lại sau' });
    const code = normalizeClaim(ctx.body.code);
    const bad = () => new ApiError(400, 'claim_invalid', 'Mã nhận không đúng hoặc đã hết hạn');
    if (code.length !== 20) throw bad();
    return tx(async (c) => {
      // dùng một lần, nguyên tử; giao dịch hỏng thì mã không bị đốt
      const r = (await c.query("UPDATE family_claims SET status='used', claimed_by=$2, used_at=now() WHERE code_hash=$1 AND status='open' AND expires_at > now() RETURNING family_id", [claimHash(code), ctx.user.id]))[0];
      if (!r) throw bad();
      await lockFamily(c, r.family_id);
      if ((await c.query("SELECT 1 FROM memberships WHERE family_id=$1 AND role='chu' AND left_at IS NULL", [r.family_id])).length) throw new ApiError(409, 'claimed', 'Gia đình này đã có chủ');
      const owned = (await c.query("SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND role='chu' AND left_at IS NULL", [ctx.user.id]))[0].n;
      if (owned >= config.maxFamiliesOwned) throw new ApiError(409, 'family_limit', 'Bạn đã làm chủ quá nhiều gia đình');
      await c.query("INSERT INTO memberships(family_id, user_id, role) VALUES($1,$2,'chu')", [r.family_id, ctx.user.id]);
      await c.query('UPDATE families SET created_by=$2 WHERE id=$1', [r.family_id, ctx.user.id]);
      await audit(c, ctx.user.id, 'family_claimed');
      return { ok: true, familyId: r.family_id };
    });
  });

  // ---------- thành viên ----------
  R('POST', '/api/families/:fid/members/:uid/role', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const uid = uuidParam(ctx.params.uid);
    const role = oneOf(ctx.body.role, ['quan_ly', 'thanh_vien'], 'Vai trò');
    return tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'changeRoles');
      const target = await roleOf(c.query, fid, uid);
      if (!target) throw notFound();
      if (target === 'chu' || target === 'con') throw new ApiError(400, 'invalid_target', 'Không đổi vai trò của chủ gia đình hoặc của con');
      await c.query('UPDATE memberships SET role=$3 WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL', [fid, uid, role]);
      if (role === 'thanh_vien') await revokeInvitesBy(c, fid, uid); // hạ vai: không còn quyền mời nên lời mời cũ bị thu hồi
      return OK;
    });
  });

  R('DELETE', '/api/families/:fid/members/:uid', async (ctx) => {
    const fid = uuidParam(ctx.params.fid); const uid = uuidParam(ctx.params.uid);
    if (uid === ctx.user.id) throw new ApiError(400, 'use_leave', 'Muốn rời gia đình, hãy chọn "Rời gia đình"');
    return tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      const target = await roleOf(c.query, fid, uid);
      if (!target) throw notFound();
      if (target === 'chu') throw forbidden('Không thể xóa chủ gia đình');
      if (target === 'quan_ly') need(my, 'removeQuanLy');
      else need(my, 'removeThanhVien');
      if (target === 'con') await unlinkUser(c, fid, uid);
      else await c.query('UPDATE memberships SET left_at=now() WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL', [fid, uid]);
      await revokeInvitesBy(c, fid, uid);
      await audit(c, ctx.user.id, 'member_removed', target);
      return OK;
    });
  });

  R('POST', '/api/families/:fid/leave', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      if (my === 'chu') throw new ApiError(409, 'owner_cannot_leave', 'Chủ gia đình cần chuyển quyền cho người khác (hoặc xóa gia đình) trước khi rời');
      if (my === 'con') await unlinkUser(c, fid, ctx.user.id);
      else await c.query('UPDATE memberships SET left_at=now() WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL', [fid, ctx.user.id]);
      await revokeInvitesBy(c, fid, ctx.user.id);
      return OK;
    });
  });

  R('POST', '/api/families/:fid/transfer', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const to = uuidBody(ctx.body.toUserId, 'Người nhận quyền chủ');
    await reauth(ctx.user.id, ctx.body.password);
    return tx(async (c) => {
      await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'transfer');
      if (to === ctx.user.id) throw new ApiError(400, 'invalid_target', 'Bạn đã là chủ gia đình');
      await transferOwner(c, fid, ctx.user.id, to);
      await audit(c, ctx.user.id, 'owner_transferred');
      return OK;
    });
  });

  R('POST', '/api/families/:fid/delete', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    await reauth(ctx.user.id, ctx.body.password);
    return tx(async (c) => {
      const f = await lockFamily(c, fid);
      const my = await roleOf(c.query, fid, ctx.user.id);
      if (!my) throw notFound();
      need(my, 'delete');
      const typed = cleanText(ctx.body.confirmName, { max: 60, field: 'Tên gia đình' });
      if (typed.toLowerCase() !== f.name.normalize('NFC').toLowerCase()) throw new ApiError(400, 'confirm_mismatch', 'Tên gia đình gõ lại chưa đúng');
      await c.query('DELETE FROM families WHERE id=$1', [fid]);
      await audit(c, ctx.user.id, 'family_deleted');
      return OK;
    });
  });
}
