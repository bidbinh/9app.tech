// Tài khoản gia sư ẩn danh: tạo, khôi phục bằng mã, ghép thiết bị, thiết bị, xuất và xóa dữ liệu
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query, tx } from '../db.js';
import { COOKIE, createSession, requireTutor } from '../auth.js';
import { cleanText, cleanBank, oneOf, sha256hex, newRecoveryCode, newPairCode, normCode, stripAccents, uuidParam, todayVN } from '../util.js';

export const STATUSES = ['sinh_vien', 'giao_vien_cong', 'giao_vien_khac', 'khac'];

// Bộ đếm theo giờ cho các thao tác dò mã (trong bộ nhớ: một tiến trình duy nhất)
const hourly = new Map();
function hourlyHit(key, limit) {
  const now = Date.now();
  let h = hourly.get(key);
  if (!h || h.reset < now) { h = { n: 0, reset: now + 3600_000 }; hourly.set(key, h); }
  h.n += 1;
  if (hourly.size > 20000) for (const [k, v] of hourly) if (v.reset < now) hourly.delete(k);
  return h.n > limit;
}
export const resetHourly = () => hourly.clear();
const idUnavailable = () => new ApiError(503, 'id_unavailable', 'Chưa kết nối được dịch vụ tài khoản 9app, thử lại sau ít phút');
const tooMany = () => new ApiError(429, 'rate_limited', 'Bạn thử quá nhiều lần, đợi một lúc rồi thử lại');

export async function meView(t) {
  const [counts] = await query(
    `SELECT (SELECT count(*)::int FROM students WHERE tutor_id=$1) AS students,
            (SELECT count(*)::int FROM students WHERE tutor_id=$1 AND active) AS active_students`, [t.id]);
  return {
    name: t.name,
    status: t.status,
    bank: t.bank_bin ? { bin: t.bank_bin, account: t.bank_account, holder: t.bank_holder } : null,
    hasRecovery: !!t.recovery_at,
    recoveryAt: t.recovery_at,
    students: counts.students,
    activeStudents: counts.active_students,
    publicProfileAllowed: t.status !== 'giao_vien_cong',
    today: todayVN(),
  };
}
async function freshTutor(id) { return (await query('SELECT * FROM tutors WHERE id=$1', [id]))[0]; }

export function accountRoutes(app) {
  app.route('POST', '/api/start', async (ctx) => {
    const name = cleanText(ctx.body.name, { max: 40, min: 1, field: 'Tên hiển thị' });
    const status = oneOf(ctx.body.status, STATUSES, 'Tình trạng');
    if (ctx.idDown) throw idUnavailable();   // đã đăng nhập mà 9id lỗi: không tạo gia sư ẩn danh thứ hai
    const recent = (await query(`SELECT count(*)::int AS n FROM tutors WHERE created_ip = $1 AND created_at > now() - interval '1 hour'`, [ctx.ip]))[0].n;
    if (recent >= config.tutorsPerIpHour * 1) throw new ApiError(429, 'rate_limited', 'Đã tạo quá nhiều tài khoản từ mạng này, thử lại sau ít phút');
    const code = newRecoveryCode();
    const t = await tx(async (c) => {
      if (ctx.userId) {
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 9201))', ['u:' + ctx.userId]);   // cùng khóa với nhận gia sư vào tài khoản
        if ((await c.query('SELECT 1 FROM tutors WHERE user_id = $1', [ctx.userId])).length) throw new ApiError(409, 'already', 'Tài khoản 9app này đã có sổ gia sư');
      }
      const row = (await c.query(
        `INSERT INTO tutors(name, status, status_at, recovery_hash, recovery_at, created_ip, user_id) VALUES($1,$2,now(),$3,now(),$4,$5) RETURNING *`,
        [name, status, sha256hex(normCode(code)), ctx.ip, ctx.userId || null]))[0];
      if (!ctx.userId) await createSession(c, ctx, row.id);   // đăng nhập: quyền đi qua tài khoản, máy không giữ lại sau khi đăng xuất
      return row;
    });
    return { recoveryCode: code, me: await meView(t) };
  }, { limit: 30 });

  app.route('GET', '/api/me', async (ctx) => {
    const t = requireTutor(ctx);
    return { me: await meView(t) };
  });

  app.route('POST', '/api/me', async (ctx) => {
    const t = requireTutor(ctx);
    const b = ctx.body;
    const sets = []; const vals = [t.id];
    const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.name !== undefined) add('name', cleanText(b.name, { max: 40, min: 1, field: 'Tên hiển thị' }));
    let newStatus = null;
    if (b.status !== undefined) { newStatus = oneOf(b.status, STATUSES, 'Tình trạng'); if (newStatus !== t.status) { add('status', newStatus); sets.push('status_at=now()'); } }
    if (b.bank !== undefined) {
      const bank = cleanBank(b.bank) || { bin: null, account: null, holder: null };
      add('bank_bin', bank.bin); add('bank_account', bank.account); add('bank_holder', bank.holder);
    }
    await tx(async (c) => {
      if (sets.length) await c.query(`UPDATE tutors SET ${sets.join(', ')} WHERE id=$1`, vals);
      // giáo viên công lập: không quảng bá, tắt trang giới thiệu đang bật
      if (newStatus === 'giao_vien_cong') await c.query('UPDATE profiles SET enabled=false WHERE tutor_id=$1', [t.id]);
    });
    return { me: await meView(await freshTutor(t.id)) };
  });

  // Đổi mã khôi phục: mã cũ vô hiệu ngay
  app.route('POST', '/api/me/recovery', async (ctx) => {
    const t = requireTutor(ctx);
    const code = newRecoveryCode();
    await query('UPDATE tutors SET recovery_hash=$2, recovery_at=now() WHERE id=$1', [t.id, sha256hex(normCode(code))]);
    return { recoveryCode: code };
  }, { limit: 10 });

  app.route('POST', '/api/recover', async (ctx) => {
    if (hourlyHit('rec:' + ctx.ip, config.recoverPerIpHour)) throw tooMany();
    const code = normCode(ctx.body.code);
    if (code.length !== 25) throw new ApiError(404, 'not_found', 'Mã khôi phục không đúng');
    const t = (await query('SELECT * FROM tutors WHERE recovery_hash=$1', [sha256hex(code)]))[0];
    if (!t) throw new ApiError(404, 'not_found', 'Mã khôi phục không đúng');
    if (ctx.idDown) throw idUnavailable();
    // đã đăng nhập và đã có gia sư của tài khoản: không gắn thêm gia sư khác vào máy này (tránh hai danh tính)
    if (ctx.userId && ctx.tutor && ctx.tutor.user_id === ctx.userId && ctx.tutor.id !== t.id) throw new ApiError(409, 'already', 'Tài khoản 9app này đã có sổ gia sư');
    await tx((c) => createSession(c, ctx, t.id));
    return { me: await meView(t) };
  }, { limit: 30 });

  // ---- ghép thiết bị ----
  app.route('POST', '/api/devices/pair', async (ctx) => {
    const t = requireTutor(ctx);
    const code = newPairCode();
    const exp = await tx(async (c) => {
      await c.query('SELECT id FROM tutors WHERE id=$1 FOR UPDATE', [t.id]);
      await c.query('DELETE FROM pair_codes WHERE tutor_id=$1 AND expires_at < now()', [t.id]);
      const n = (await c.query('SELECT count(*)::int AS n FROM pair_codes WHERE tutor_id=$1', [t.id]))[0].n;
      if (n >= config.maxPairCodes) throw new ApiError(429, 'too_many', 'Đang có quá nhiều mã ghép còn hiệu lực, đợi hết hạn rồi tạo lại');
      return (await c.query(`INSERT INTO pair_codes(code_hash, tutor_id, expires_at) VALUES($1,$2, now() + interval '15 minutes') RETURNING expires_at`, [sha256hex(code), t.id]))[0].expires_at;
    });
    return { code, expiresAt: exp };
  }, { limit: 20 });

  // Xem trước tài khoản mà mã ghép sẽ mở (không đốt mã): để người bấm biết có đúng tài khoản của mình không,
  // tránh bị lừa mở link ghép vào tài khoản của kẻ khác
  app.route('POST', '/api/devices/peek', async (ctx) => {
    if (hourlyHit('peek:' + ctx.ip, config.recoverPerIpHour * 3)) throw tooMany();
    const code = normCode(ctx.body.code);
    if (code.length !== 12) throw new ApiError(404, 'not_found', 'Mã ghép không đúng hoặc đã hết hạn');
    const r = (await query('SELECT t.name, t.created_at, (SELECT count(*)::int FROM students s WHERE s.tutor_id = t.id AND s.active) AS students FROM pair_codes p JOIN tutors t ON t.id = p.tutor_id WHERE p.code_hash=$1 AND p.expires_at > now()', [sha256hex(code)]))[0];
    if (!r) throw new ApiError(404, 'not_found', 'Mã ghép không đúng hoặc đã hết hạn');
    return { name: r.name, students: r.students, createdAt: r.created_at };
  }, { limit: 30 });

  app.route('POST', '/api/devices/redeem', async (ctx) => {
    if (hourlyHit('pair:' + ctx.ip, config.recoverPerIpHour)) throw tooMany();
    const code = normCode(ctx.body.code);
    if (code.length !== 12) throw new ApiError(404, 'not_found', 'Mã ghép không đúng hoặc đã hết hạn');
    if (ctx.idDown) throw idUnavailable();
    const t = await tx(async (c) => {
      const r = await c.query('DELETE FROM pair_codes WHERE code_hash=$1 AND expires_at > now() RETURNING tutor_id', [sha256hex(code)]);
      if (!r.length) throw new ApiError(404, 'not_found', 'Mã ghép không đúng hoặc đã hết hạn');
      if (ctx.userId && ctx.tutor && ctx.tutor.user_id === ctx.userId && ctx.tutor.id !== r[0].tutor_id) throw new ApiError(409, 'already', 'Tài khoản 9app này đã có sổ gia sư');
      await createSession(c, ctx, r[0].tutor_id);
      return (await c.query('SELECT * FROM tutors WHERE id=$1', [r[0].tutor_id]))[0];
    });
    return { me: await meView(t) };
  }, { limit: 30 });

  app.route('GET', '/api/devices', async (ctx) => {
    const t = requireTutor(ctx);
    const rows = await query('SELECT id, ua, created_at, last_used_at FROM sessions WHERE tutor_id=$1 ORDER BY last_used_at DESC', [t.id]);
    return { devices: rows.map((r) => ({ id: r.id, label: r.ua || 'Thiết bị', createdAt: r.created_at, lastUsedAt: r.last_used_at, current: r.id === ctx.sessionId })) };
  });
  app.route('POST', '/api/devices/:id/revoke', async (ctx) => {
    const t = requireTutor(ctx);
    const id = uuidParam(ctx.params.id);
    const r = await query('DELETE FROM sessions WHERE id=$1 AND tutor_id=$2 RETURNING id', [id, t.id]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Không tìm thấy thiết bị này');
    if (id === ctx.sessionId) ctx.setCookie(COOKIE, '', { clear: true });
    return { ok: true };
  });
  app.route('POST', '/api/logout', async (ctx) => {
    if (ctx.sessionId) await query('DELETE FROM sessions WHERE id=$1', [ctx.sessionId]);
    ctx.setCookie(COOKIE, '', { clear: true });
    return { ok: true };
  });
  app.route('POST', '/api/logout-others', async (ctx) => {
    const t = requireTutor(ctx);
    const r = await query('DELETE FROM sessions WHERE tutor_id=$1 AND ($2::uuid IS NULL OR id<>$2) RETURNING id', [t.id, ctx.sessionId || null]);
    return { ok: true, removed: r.length };
  });

  // ---- dữ liệu của tôi ----
  app.route('GET', '/api/export', async (ctx) => {
    const t = requireTutor(ctx);
    const all = async (table, cols = '*') => query(`SELECT ${cols} FROM ${table} WHERE tutor_id=$1 ORDER BY created_at`, [t.id]);
    const body = {
      exportedAt: new Date().toISOString(),
      tutor: { name: t.name, status: t.status, bank: t.bank_bin ? { bin: t.bank_bin, account: t.bank_account, holder: t.bank_holder } : null },
      students: await all('students'), slots: await all('slots'), lessons: await all('lessons'), charges: await all('charges'), payments: await all('payments'),
      profile: (await query('SELECT * FROM profiles WHERE tutor_id=$1', [t.id]))[0] || null,
    };
    return { __raw: true, body: JSON.stringify(body, null, 1), headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="9tutor-du-lieu.json"', 'cache-control': 'no-store' } };
  }, { limit: 10 });

  app.route('POST', '/api/me/delete', async (ctx) => {
    const t = requireTutor(ctx);
    if (stripAccents(String(ctx.body.confirm || '')).trim().toUpperCase() !== 'XOA') throw new ApiError(400, 'invalid_input', 'Hãy gõ XÓA để xác nhận xóa toàn bộ dữ liệu', { field: 'confirm' });
    await query('DELETE FROM tutors WHERE id=$1', [t.id]);
    // máy có thể còn gia sư ẩn danh khác (khi đã đăng nhập): chỉ bỏ cookie nếu phiên này đang nối tới chính gia sư bị xóa
    if (ctx.sessionTutorId === t.id || !ctx.userId) ctx.setCookie(COOKIE, '', { clear: true });
    return { ok: true };
  }, { limit: 5 });
}
