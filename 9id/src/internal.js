// API nội bộ cho các app khác (máy chủ-máy chủ, mạng docker; nginx PHẢI chặn /id/internal/ từ internet).
// Mỗi app một cặp key id + secret (INTERNAL_KEYS). Chữ ký HMAC-SHA256 trên:
//   ts \n nonce \n METHOD \n đường-dẫn-và-query \n sha256(body)
// Chống phát lại thật: ts lệch tối đa 120 giây và (key, nonce) chỉ dùng một lần (bảng internal_nonces).
// Ràng buộc người dùng: các endpoint theo người dùng/gia đình phải kèm header X-9ID-Token = token phiên (cookie nine_sid) của CHÍNH người đó,
// nên app bị chiếm không đọc được gia đình của người chưa từng gọi qua nó. App gắn cờ delegate (INTERNAL_DELEGATE_APPS) được dùng `as` không kèm token
// nhưng bị giới hạn thấp hơn và ghi nhật ký.
import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query, tx } from './db.js';
import { lookupSession, audit } from './auth.js';
import { requireMember, listMembers, listChildren, notesHidden } from './families.js';
import { sha256hex, uuidParam, uuidBody, notFound, phoneHashes, phoneLast4, safeEqualHex, cleanText, intIn, hmac } from './util.js';

const MAX_SKEW_S = 120;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export const signInternal = (secret, ts, nonce, method, pathq, body = '') =>
  crypto.createHmac('sha256', secret).update(`${ts}\n${nonce}\n${String(method).toUpperCase()}\n${pathq}\n${sha256hex(body)}`).digest('hex');

const unauthorized = (msg = 'Xác thực không hợp lệ') => new ApiError(401, 'unauthorized', msg);

export async function authInternal(ctx) {
  if (!config.internalKeys.size) throw new ApiError(404, 'not_found', 'Không tìm thấy');
  const h = ctx.headers;
  const kid = String(h['x-9id-key'] || '');
  const ts = String(h['x-9id-ts'] || '');
  const nonce = String(h['x-9id-nonce'] || '');
  const sig = String(h['x-9id-sig'] || '');
  const secret = config.internalKeys.get(kid);
  if (!secret || !/^\d{9,12}$/.test(ts) || !NONCE_RE.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) throw unauthorized();
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_S) throw unauthorized('Đồng hồ lệch quá 120 giây');
  if (!safeEqualHex(signInternal(secret, ts, nonce, ctx.req.method, ctx.req.url, ctx.raw || ''), sig)) throw unauthorized('Chữ ký không hợp lệ');
  // chỉ ghi nonce SAU khi chữ ký đúng (kẻ lạ không làm đầy bảng); trùng thì là phát lại
  const claimed = await query('INSERT INTO internal_nonces(kid, nonce) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [kid, nonce]);
  if (!claimed.length) throw unauthorized('Yêu cầu đã được dùng (phát lại)');
  if (ctx.hit('int:' + kid, config.internalLimitPerMin)) throw new ApiError(429, 'rate_limited', 'Quá nhiều yêu cầu');
  return kid;
}

// Nhật ký dùng delegate (không kèm token): tối đa một dòng mỗi phút mỗi app
const delegateSeen = new Map();
async function bindUser(ctx, uid) {
  const token = ctx.headers['x-9id-token'];
  if (token !== undefined) {
    const s = await lookupSession(String(token));
    if (!s || s.user.id !== uid) throw new ApiError(401, 'token_mismatch', 'Token phiên không khớp với người dùng được yêu cầu');
    return;
  }
  if (!config.internalDelegateApps.has(ctx.kid)) throw new ApiError(401, 'token_required', 'Thiếu header X-9ID-Token (token phiên của người dùng này)');
  if (ctx.hit('del:' + ctx.kid, config.internalDelegateLimitPerMin)) throw new ApiError(429, 'rate_limited', 'Quá nhiều yêu cầu ủy quyền');
  const now = Date.now();
  if (now - (delegateSeen.get(ctx.kid) || 0) > 60_000) {
    delegateSeen.set(ctx.kid, now);
    console.warn(`[internal] app ủy quyền "${ctx.kid}" đọc dữ liệu không kèm token phiên`);
    await audit(null, null, 'internal_delegate', ctx.kid).catch(() => {});
  }
}

// ---------- nhập gia đình hiện có từ app khác (xem spec mục 15) ----------
const CLAIM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ I O 0 1
export function newClaimCode() {
  const buf = crypto.randomBytes(20);
  let s = '';
  for (let i = 0; i < 20; i++) s += CLAIM_ALPHABET[buf[i] & 31];
  return s.match(/.{5}/g).join('-'); // 100 bit entropy
}
export const normalizeClaim = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z2-9]/g, '');
export const claimHash = (code) => hmac('claim', normalizeClaim(code));

async function issueClaim(c, fid, app) {
  await c.query("UPDATE family_claims SET status='revoked' WHERE family_id=$1 AND status='open'", [fid]);
  const code = newClaimCode();
  const r = (await c.query(
    "INSERT INTO family_claims(family_id, code_hash, expires_at, created_by_app) VALUES($1,$2, now() + make_interval(days => $3), $4) RETURNING id, expires_at",
    [fid, claimHash(code), config.claimDays, app]))[0];
  return { claimId: r.id, claimCode: code, expiresAt: r.expires_at };
}

export function internalRoutes(app) {
  const R = (method, path, handler) => app.route(method, '/internal/v1' + path, async (ctx) => { ctx.kid = await authInternal(ctx); return handler(ctx); }, { internal: true, noCsrf: true });
  const needImport = (ctx) => { if (!config.internalImportApps.has(ctx.kid)) throw new ApiError(403, 'forbidden', 'App này không được phép nhập gia đình'); };

  // Cookie nine_sid -> người dùng. KHÔNG bao giờ trả số điện thoại đầy đủ.
  R('POST', '/verify', async (ctx) => {
    const s = await lookupSession(ctx.body.token);
    if (!s) throw new ApiError(401, 'invalid_session', 'Phiên không hợp lệ hoặc đã hết hạn');
    const out = { userId: s.user.id, displayName: s.user.displayName };
    const fields = Array.isArray(ctx.body.fields) ? ctx.body.fields : [];
    if (fields.includes('phoneLast4') && config.internalLast4Apps.has(ctx.kid)) out.phoneLast4 = phoneLast4(s.user.phone);
    return out;
  });

  R('GET', '/users/:uid/families', async (ctx) => {
    const uid = uuidParam(ctx.params.uid);
    await bindUser(ctx, uid);
    const u = (await query('SELECT phone FROM users WHERE id=$1', [uid]))[0];
    if (!u) throw notFound();
    const rows = await query(
      `SELECT f.id, f.name, m.role,
              (SELECT count(*)::int FROM memberships x WHERE x.family_id = f.id AND x.left_at IS NULL) AS member_count,
              (SELECT count(*)::int FROM child_profiles ch WHERE ch.family_id = f.id AND ch.archived_at IS NULL) AS child_count
         FROM memberships m JOIN families f ON f.id = m.family_id WHERE m.user_id=$1 AND m.left_at IS NULL ORDER BY m.joined_at`, [uid]);
    const pending = (await query("SELECT count(*)::int AS n FROM invitations WHERE phone_hash = ANY($1) AND status='pending' AND expires_at > now()", [phoneHashes(u.phone)]))[0].n;
    const approvals = (await query(
      `SELECT count(*)::int AS n FROM invitations i JOIN memberships m ON m.family_id = i.family_id AND m.user_id = $1 AND m.left_at IS NULL AND m.role IN ('chu','quan_ly')
        WHERE i.status='awaiting' AND i.expires_at > now()`, [uid]))[0].n;
    return {
      families: rows.map((r) => ({ id: r.id, name: r.name, role: r.role, memberCount: r.member_count, childCount: r.role === 'con' ? null : r.child_count })),
      pendingInvitations: pending, pendingApprovals: approvals,
    };
  });

  // `as` = người dùng mà app đã xác thực qua /verify. Không thuộc gia đình (hoặc gia đình không có) thì 404.
  R('GET', '/families/:fid/members', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const as = uuidParam(ctx.query.as);
    await bindUser(ctx, as);
    const f = await requireMember(query, fid, as);
    return { role: f.role, members: (await listMembers(query, fid, f.role, as)).map(({ userId, displayName, role, joinedAt }) => ({ userId, displayName, role, joinedAt })) };
  });

  // Ghi chú sức khỏe/dị ứng của trẻ không có cho thành viên vừa vào dưới 24 giờ, trừ khi chủ bật (families.notes_for_new)
  R('GET', '/families/:fid/children', async (ctx) => {
    const fid = uuidParam(ctx.params.fid);
    const as = uuidParam(ctx.query.as);
    await bindUser(ctx, as);
    const f = await requireMember(query, fid, as);
    const hidden = notesHidden(f);
    const children = (await listChildren(query, fid, f.role, as, { withArchived: false, hideNotes: hidden })).map((c) => ({ id: c.id, name: c.name, birthYear: c.birthYear, linkedUserId: c.linkedUserId, ...(c.note !== undefined ? { note: c.note } : {}) }));
    return { role: f.role, children, notesHidden: hidden };
  });

  // ---------- nhập gia đình ẩn danh hiện có: tạo gia đình (chưa có chủ) + hồ sơ con + mã nhận dùng một lần ----------
  R('POST', '/import/families', async (ctx) => {
    needImport(ctx);
    const b = ctx.body;
    if (!b.family || typeof b.family !== 'object') throw new ApiError(400, 'invalid_input', 'Thiếu family');
    const fid = uuidBody(b.family.id, 'family.id');
    const name = cleanText(b.family.name, { min: 1, max: 60, field: 'Tên gia đình' });
    const kids = Array.isArray(b.children) ? b.children : [];
    if (kids.length > config.maxChildren) throw new ApiError(400, 'invalid_input', 'Quá nhiều hồ sơ con');
    const parsed = kids.map((k) => {
      if (!k || typeof k !== 'object') throw new ApiError(400, 'invalid_input', 'Hồ sơ con không hợp lệ');
      return {
        id: uuidBody(k.id, 'child.id'), name: cleanText(k.name, { min: 1, max: 40, field: 'Tên của con' }),
        birthYear: k.birthYear === null || k.birthYear === undefined ? null : intIn(k.birthYear, { min: 1990, max: new Date().getFullYear(), field: 'Năm sinh' }),
        note: cleanText(k.note ?? '', { max: 300, multiline: true, field: 'Ghi chú' }),
      };
    });
    if (new Set(parsed.map((k) => k.id)).size !== parsed.length) throw new ApiError(400, 'invalid_input', 'Trùng mã hồ sơ con');
    const out = await tx(async (c) => {
      if ((await c.query('SELECT 1 FROM families WHERE id=$1', [fid])).length) throw new ApiError(409, 'exists', 'Gia đình này đã được nhập');
      if (parsed.length && (await c.query('SELECT 1 FROM child_profiles WHERE id = ANY($1)', [parsed.map((k) => k.id)])).length) throw new ApiError(409, 'exists', 'Hồ sơ con đã tồn tại');
      await c.query('INSERT INTO families(id, name) VALUES($1,$2)', [fid, name]);
      for (const k of parsed) await c.query('INSERT INTO child_profiles(id, family_id, name, birth_year, note) VALUES($1,$2,$3,$4,$5)', [k.id, fid, k.name, k.birthYear, k.note]);
      const claim = await issueClaim(c, fid, ctx.kid);
      await audit(c, null, 'family_imported', ctx.kid);
      return claim;
    });
    return { familyId: fid, ...out };
  });

  // cấp lại mã nhận (mã cũ bị thu hồi) cho gia đình chưa có chủ
  R('POST', '/import/families/:fid/claim', async (ctx) => {
    needImport(ctx);
    const fid = uuidParam(ctx.params.fid);
    return tx(async (c) => {
      const f = (await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]))[0];
      if (!f) throw notFound();
      if ((await c.query("SELECT 1 FROM memberships WHERE family_id=$1 AND role='chu' AND left_at IS NULL", [fid])).length) throw new ApiError(409, 'claimed', 'Gia đình này đã có chủ');
      return { familyId: fid, ...(await issueClaim(c, fid, ctx.kid)) };
    });
  });

  R('POST', '/import/claims/:id/revoke', async (ctx) => {
    needImport(ctx);
    const r = await query("UPDATE family_claims SET status='revoked' WHERE id=$1 AND status='open' RETURNING 1", [uuidParam(ctx.params.id)]);
    if (!r.length) throw notFound();
    return { ok: true };
  });
}
