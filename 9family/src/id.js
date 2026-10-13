// Cầu nối tới 9id (tài khoản 9app dùng chung): xác thực phiên, đọc gia đình/thành viên/con, và ĐỒNG BỘ phần mở rộng vào CSDL 9family.
//
// Nguyên tắc:
//  * 9id là NGUỒN ĐÚNG của: ai là người dùng, gia đình nào, vai trò, tên, hồ sơ con (tên, năm sinh, nối tài khoản).
//  * 9family giữ phần mở rộng theo id của 9id (trường/lớp/màu/ghi chú đưa đón của con, thiết lập leo thang, lịch, ca đưa đón...) và
//    một BẢN SAO tên/vai trò/năm sinh trong bảng members/children để các truy vấn cũ (JOIN lấy tên) vẫn chạy. Bản sao được làm mới
//    mỗi khi có người mở gia đình và đệm đã hết hạn (tối đa idCacheMs, mặc định 60 giây), hoặc ngay khi giao diện báo vừa đổi bên 9id.
//  * App là app thường: MỌI lần đọc gia đình đều kèm token phiên (cookie nine_sid) của chính người đó (X-9ID-Token).
//  * 9id lỗi/không với tới thì trả 503 (KHÔNG coi là đã đăng xuất).
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query, tx } from './db.js';
import { clock } from './clock.js';
import { createNineId, NineIdError } from './nine-id.js';
import { sha256hex, newToken, UUID_RE } from './util.js';
import { detachMember } from './members.js';
import { notifyMembers } from './notify.js';

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const COLORS = ['xanh', 'cam', 'tim', 'hong', 'luc', 'vang', 'do', 'nau'];
export const ARCHIVE_PURGE_DAYS = 7;

let client = null;
export function idClient() {
  if (!client) client = createNineId({ baseUrl: config.nineIdUrl, keyId: config.nineIdKeyId, secret: config.nineIdSecret, timeoutMs: config.idTimeoutMs });
  return client;
}
// Kiểm thử: thay máy khách (9id giả). null = về mặc định.
export function setIdClient(c) { client = c; flushCaches(); }

const verifyCache = new Map();   // băm token -> { user, at }
const famCache = new Map();      // `${uid}|${fid}` -> { view, at }
const userFamCache = new Map();  // uid -> { data, at }
export function flushCaches() { verifyCache.clear(); famCache.clear(); userFamCache.clear(); brokenAt = 0; }
export function invalidateFamily(fid) { for (const k of famCache.keys()) if (k.endsWith('|' + fid)) famCache.delete(k); userFamCache.clear(); }
export function invalidateUser(uid) { userFamCache.delete(uid); for (const k of famCache.keys()) if (k.startsWith(uid + '|')) famCache.delete(k); }
function trim(map, max = 5000) { if (map.size > max) { const now = Date.now(); for (const [k, v] of map) if (now - v.at > config.idCacheMs) map.delete(k); if (map.size > max) map.clear(); } }
const fresh = (e) => e && Date.now() - e.at < config.idCacheMs;

// Cầu dao: 9id vừa lỗi hạ tầng (không với tới, hết thời gian, 5xx) thì trong idBreakMs yêu cầu sau trả 503 ngay, không chờ thêm 5 giây mỗi yêu cầu
let brokenAt = 0;
const unavailable = () => new ApiError(503, 'id_unavailable', 'Chưa kết nối được dịch vụ tài khoản 9app, thử lại sau ít phút');
function breaker() { if (config.idBreakMs > 0 && Date.now() - brokenAt < config.idBreakMs) throw unavailable(); }

function mapErr(e) {
  if (e instanceof ApiError) return e;
  if (e instanceof NineIdError) {
    if (e.status === 404) return new ApiError(404, 'not_found', 'Không tìm thấy gia đình này, hoặc bạn không ở trong gia đình');
    if (e.status === 401) return new ApiError(401, 'unauthenticated', 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', { login: config.nineIdPublicPath });
    if (e.status === 429) return new ApiError(503, 'id_unavailable', 'Dịch vụ tài khoản 9app đang bận, thử lại sau ít phút');
  }
  brokenAt = Date.now();
  console.error('[9id] lỗi gọi 9id:', e && e.status ? `HTTP ${e.status} ${e.code || ''}` : (e && e.name) || e);
  return unavailable();
}

// ---------- xác thực ----------
// Cookie nine_sid -> { userId, displayName } hoặc null (chưa đăng nhập / phiên hết hạn). 9id không với tới -> ném 503.
export async function verifyToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const h = sha256hex(token);
  const hit = verifyCache.get(h);
  if (fresh(hit)) return hit.user;
  breaker();
  let u;
  try { u = await idClient().verify(token); } catch (e) { throw mapErr(e); }
  if (!u) { verifyCache.delete(h); return null; }
  if (!u.userId || !UUID_RE.test(String(u.userId))) throw new ApiError(503, 'id_unavailable', 'Dịch vụ tài khoản 9app trả dữ liệu không hợp lệ');
  const user = { userId: String(u.userId).toLowerCase(), displayName: String(u.displayName || '') };
  verifyCache.set(h, { user, at: Date.now() });
  trim(verifyCache);
  return user;
}
export function forgetToken(token) { if (token) verifyCache.delete(sha256hex(token)); }

// ---------- danh sách gia đình của người dùng (9id) ----------
export async function userFamilies(ctx, { force = false, maxAgeMs = null } = {}) {
  const uid = ctx.user.userId;
  const hit = userFamCache.get(uid);
  if (!force && hit && Date.now() - hit.at < (maxAgeMs ?? config.idCacheMs)) return hit.data;
  breaker();
  let data;
  try { data = await idClient().userFamilies(uid, ctx.token); } catch (e) {
    const err = mapErr(e);
    if (err.status === 401) forgetToken(ctx.token);
    throw err;
  }
  const out = {
    families: (data.families || []).filter((f) => f && UUID_RE.test(String(f.id))).map((f) => ({ id: String(f.id).toLowerCase(), name: String(f.name || ''), role: f.role, memberCount: f.memberCount, childCount: f.childCount })),
    pendingInvitations: Number(data.pendingInvitations) || 0,
    pendingApprovals: Number(data.pendingApprovals) || 0,
  };
  userFamCache.set(uid, { data: out, at: Date.now() });
  trim(userFamCache);
  return out;
}

// ---------- một gia đình: đọc 9id + đồng bộ bản sao ----------
async function loadView(ctx, fid) {
  const uid = ctx.user.userId;
  breaker();
  try {
    const [m, k] = await Promise.all([idClient().members(fid, uid, ctx.token), idClient().children(fid, uid, ctx.token)]);
    let fams = await userFamilies(ctx);
    let f = fams.families.find((x) => x.id === fid);
    if (!f) { fams = await userFamilies(ctx, { force: true }); f = fams.families.find((x) => x.id === fid); }
    if (!f) throw new NineIdError(404, 'not_found', 'Không tìm thấy');
    const role = m.role;
    if (!['chu', 'quan_ly', 'thanh_vien', 'con'].includes(role)) throw new ApiError(503, 'id_unavailable', 'Dịch vụ tài khoản 9app trả vai trò không hợp lệ');
    return {
      role, name: f.name, notesHidden: !!k.notesHidden,
      members: (m.members || []).filter((x) => x && UUID_RE.test(String(x.userId))).map((x) => ({ userId: String(x.userId).toLowerCase(), displayName: String(x.displayName || ''), role: x.role })),
      children: (k.children || []).filter((x) => x && UUID_RE.test(String(x.id))).map((x) => ({
        id: String(x.id).toLowerCase(), name: String(x.name || ''), birthYear: Number.isInteger(x.birthYear) ? x.birthYear : null,
        linkedUserId: x.linkedUserId ? String(x.linkedUserId).toLowerCase() : null, note: typeof x.note === 'string' ? x.note : undefined,
      })),
    };
  } catch (e) {
    const err = mapErr(e);
    if (err.status === 401) { forgetToken(ctx.token); invalidateUser(uid); }
    throw err;
  }
}

// Ghi bản sao vào CSDL. Chạy trong giao dịch, khóa hàng gia đình trước (cùng thứ tự khóa với các route ghi).
async function reconcile(fid, view, viewer) {
  return tx(async (c) => {
    const now = clock.now();
    let changed = false;
    await c.query(
      `INSERT INTO families(id, name, created_by_hash) VALUES($1,$2,'') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name WHERE families.name IS DISTINCT FROM EXCLUDED.name`, [fid, view.name]);
    await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);

    // ----- thành viên -----
    const local = await c.query('SELECT * FROM members WHERE family_id=$1 AND left_at IS NULL AND external = false', [fid]);
    const byUser = new Map(local.filter((m) => m.user_id).map((m) => [m.user_id, m]));
    const incoming = new Map(view.members.map((m) => [m.userId, m]));
    // 1) người không còn trong gia đình ở 9id (người xem là 'con' không thấy các con khác nên bỏ qua hàng 'con')
    for (const m of local) {
      if (m.user_id && !incoming.has(m.user_id) && !(view.role === 'con' && m.role === 'con')) { await detachMember(c, m, now); changed = true; byUser.delete(m.user_id); }
    }
    // 2) cập nhật tên/vai trò của người đã có; hạ 'chu' trước khi bất kỳ ai được nâng lên 'chu' (chỉ mục "một chủ")
    const promote = [];
    for (const [uid, inc] of incoming) {
      const l = byUser.get(uid);
      if (!l) continue;
      if (inc.role === 'chu' && l.role !== 'chu') { promote.push([l, inc]); continue; }
      if (l.name !== inc.displayName || l.role !== inc.role) {
        await c.query('UPDATE members SET name=$2, role=$3 WHERE id=$1', [l.id, inc.displayName || l.name, inc.role]);
        changed = true;
      }
    }
    // 3) người mới ở 9id: chủ của gia đình đã nhập thì nối vào thành viên "chu" cũ chưa có tài khoản; còn lại tạo mới
    let legacyOwner = local.find((m) => !m.user_id && m.role === 'chu') || null;
    const joined = [];
    const newcomers = [...incoming.values()].filter((m) => !byUser.has(m.userId));
    newcomers.sort((a, b) => (a.role === 'chu' ? 1 : 0) - (b.role === 'chu' ? 1 : 0)); // chủ mới xử lý sau cùng
    for (const inc of newcomers) {
      if (inc.role === 'chu' && legacyOwner) {
        await c.query("UPDATE members SET user_id=$2, name=$3, recovery_hash=NULL WHERE id=$1", [legacyOwner.id, inc.userId, inc.displayName || legacyOwner.name]);
        await c.query('DELETE FROM sessions WHERE member_id=$1', [legacyOwner.id]);          // phiên ẩn danh cũ hết giá trị
        await c.query('UPDATE push_subs SET user_id=$2 WHERE member_id=$1', [legacyOwner.id, inc.userId]);
        byUser.set(inc.userId, { ...legacyOwner, user_id: inc.userId });
        legacyOwner = null; changed = true;
        continue;
      }
      if (inc.role === 'chu') { // chưa có ai làm chủ ở bản sao: nếu còn chủ cũ (đã có tài khoản khác) thì hạ xuống trước
        await c.query("UPDATE members SET role='quan_ly' WHERE family_id=$1 AND role='chu' AND left_at IS NULL", [fid]);
      }
      const ins = await c.query(
        `INSERT INTO members(family_id, name, relation, role, user_id, ics_token, joined_at) VALUES($1,$2,'khac',$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *`,
        [fid, inc.displayName || 'Thành viên', inc.role, inc.userId, newToken(), new Date(now).toISOString()]);
      if (ins[0]) { byUser.set(inc.userId, ins[0]); joined.push(ins[0]); }
      changed = true;
    }
    // thông báo cho chủ/quản lý khi có người mới vào gia đình (không báo ở lần đồng bộ đầu tiên của một gia đình: lúc đó "mới" chỉ là mới với 9family)
    if (joined.length && local.length) {
      const mgr = (await c.query("SELECT id FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND role IN ('chu','quan_ly')", [fid])).map((r) => r.id);
      for (const j of joined) await notifyMembers(c, { familyId: fid, memberIds: mgr.filter((x) => x !== j.id), type: 'family', title: `${j.name} đã vào gia đình`, link: `#/f/${fid}/me`, dedupe: `join:${j.id}` });
    }
    for (const [l, inc] of promote) {
      await c.query("UPDATE members SET role='quan_ly' WHERE family_id=$1 AND role='chu' AND left_at IS NULL AND id <> $2", [fid, l.id]);
      await c.query('UPDATE members SET name=$2, role=$3 WHERE id=$1', [l.id, inc.displayName || l.name, inc.role]);
      changed = true;
    }

    // ----- hồ sơ con -----
    const ids = view.children.map((k) => k.id);
    const have = new Map((await c.query('SELECT id, family_id, name, birth_year, linked_user_id, archived_at, color FROM children WHERE id = ANY($1::uuid[])', [ids])).map((r) => [r.id, r]));
    const used = (await c.query('SELECT color FROM children WHERE family_id=$1 AND archived_at IS NULL', [fid])).map((r) => r.color);
    for (const k of view.children) {
      const ex = have.get(k.id);
      if (!ex) {
        const color = COLORS.find((x) => !used.includes(x)) || 'xanh';
        used.push(color);
        await c.query('INSERT INTO children(id, family_id, name, birth_year, color, linked_user_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING', [k.id, fid, k.name, k.birthYear, color, k.linkedUserId]);
        changed = true;
      } else if (ex.family_id !== fid) {
        continue; // không bao giờ đụng vào hồ sơ của gia đình khác
      } else if (ex.name !== k.name || ex.birth_year !== k.birthYear || ex.archived_at || (viewer.role !== 'con' && ex.linked_user_id !== k.linkedUserId)
        || (viewer.role === 'con' && k.linkedUserId && ex.linked_user_id !== k.linkedUserId)) {
        await c.query('UPDATE children SET name=$3, birth_year=$4, archived_at=NULL, linked_user_id = CASE WHEN $5::boolean THEN $6::uuid ELSE COALESCE($6::uuid, linked_user_id) END WHERE id=$1 AND family_id=$2',
          [k.id, fid, k.name, k.birthYear, viewer.role !== 'con', k.linkedUserId]);
        changed = true;
      }
    }
    // hồ sơ bị lưu trữ/xóa ở 9id: ẩn và ngừng sinh ca đưa đón NGAY, nhưng chỉ dọn khuôn đưa đón và thời khóa biểu sau ARCHIVE_PURGE_DAYS ngày
    // (khôi phục hồ sơ trong thời gian đó thì mọi thứ trở lại; 9id trục trặc trả thiếu con cũng không làm mất dữ liệu).
    // Người xem là 'con' chỉ thấy hồ sơ của mình nên không kết luận gì.
    if (view.role !== 'con') {
      const gone = await c.query('SELECT id FROM children WHERE family_id=$1 AND archived_at IS NULL AND id <> ALL($2::uuid[])', [fid, ids]);
      for (const g of gone) {
        await c.query('UPDATE children SET archived_at=$2 WHERE id=$1', [g.id, new Date(now).toISOString()]);
        changed = true;
      }
    }
    const cutoff = new Date(now - ARCHIVE_PURGE_DAYS * 86400_000).toISOString();
    const old = (await c.query('SELECT id FROM children WHERE family_id=$1 AND archived_at IS NOT NULL AND archived_at < $2', [fid, cutoff])).map((r) => r.id);
    if (old.length) {
      await c.query('DELETE FROM rides WHERE child_id = ANY($1::uuid[])', [old]);
      await c.query("DELETE FROM events WHERE family_id=$1 AND source='tkb' AND source_child = ANY($2::uuid[])", [fid, old]);
      await c.query('DELETE FROM timetables WHERE child_id = ANY($1::uuid[])', [old]);
      changed = true;
    }
    if (changed) await c.query('UPDATE families SET rev = rev + 1 WHERE id=$1', [fid]);
    return changed;
  });
}

// Trả { view, me, childIds } cho người dùng đang đăng nhập trong gia đình fid. Người ngoài gia đình: 404 (như gia đình không tồn tại).
export async function familyContext(ctx, fid, { force = false } = {}) {
  const uid = ctx.user.userId;
  const key = uid + '|' + fid;
  let view = null;
  const hit = famCache.get(key);
  if (!force && fresh(hit)) view = hit.view;
  let synced = false;
  if (!view) {
    view = await loadView(ctx, fid);
    await reconcile(fid, view, { role: view.role, userId: uid });
    famCache.set(key, { view, at: Date.now() });
    trim(famCache);
    synced = true;
  }
  let me = (await query('SELECT * FROM members WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL AND external=false', [fid, uid]))[0];
  if (!me && !synced) { // bản đệm nói còn nhưng CSDL không có: làm lại
    view = await loadView(ctx, fid);
    await reconcile(fid, view, { role: view.role, userId: uid });
    famCache.set(key, { view, at: Date.now() });
    me = (await query('SELECT * FROM members WHERE family_id=$1 AND user_id=$2 AND left_at IS NULL AND external=false', [fid, uid]))[0];
  }
  if (!me) throw new ApiError(404, 'not_found', 'Không tìm thấy gia đình này, hoặc bạn không ở trong gia đình');
  const childIds = (await query('SELECT id FROM children WHERE family_id=$1 AND linked_user_id=$2 AND archived_at IS NULL', [fid, uid])).map((r) => r.id);
  // vai trò theo 9id (đệm tối đa idCacheMs) là bản đúng; hàng members chỉ là bản sao
  const role = view.role;
  return { view, childIds, me: Object.assign(me, { role, userId: me.user_id, memberId: me.id, isExternal: me.external, childIds, notesHidden: view.notesHidden }) };
}
