// Phía nhà tuyển dụng: tài khoản ẩn danh + mã khôi phục, đăng/sửa/đóng tin, hộp thư ứng viên.
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { ensureSession, clearSessionCookie, employerFor, whoOf, requireEmployer, consume, notFound } from '../auth.js';
import { APP_STATUS, keys } from '../meta.js';
import { intIn, cleanText, newRecoveryCode, normRecoveryCode, sha256hex, uuidParam, todayVN, hourVN } from '../util.js';
import { validateJob, stateOf, checkBlocked } from '../jobs.js';

const L = config.limits;
const tooMany = (msg) => new ApiError(429, 'too_many', msg);
const idUnavailable = () => new ApiError(503, 'id_unavailable', 'Chưa kết nối được dịch vụ tài khoản 9app, thử lại sau ít phút');

const employerOut = (e) => ({ id: e.id, name: e.name, createdAt: e.created_at });

// Dữ liệu đầy đủ của tin cho CHỦ tin (kể cả liên hệ, địa chỉ)
function ownJob(r, extra = {}) {
  return {
    id: r.id, seq: r.seq, title: r.title, company: r.company, kind: r.kind, category: r.category, description: r.description, requirements: r.requirements,
    payType: r.pay_type, payMin: r.pay_min, payMax: r.pay_max, shifts: r.shifts, shiftNote: r.shift_note, city: r.city, district: r.district, address: r.address,
    contactName: r.contact_name, contactPhone: r.contact_phone, startNow: r.start_now, slots: r.slots,
    status: r.status, state: stateOf(r), hiddenReason: r.hidden_reason, appealNote: r.appeal_note, appealedAt: r.appealed_at, risk: r.risk, riskNotes: r.risk_notes, renewCount: r.renew_count,
    createdAt: r.created_at, updatedAt: r.updated_at, expiresAt: r.expires_at, closedAt: r.closed_at, ...extra,
  };
}

// Giữ tối đa N phiên mỗi nhà tuyển dụng (xóa phiên cũ nhất)
async function attachSession(q, sid, employerId) {
  await q('INSERT INTO phien(token_hash, employer_id) VALUES($1,$2) ON CONFLICT (token_hash) DO UPDATE SET employer_id = EXCLUDED.employer_id, created_at = now()', [sid, employerId]);
  await q(
    `DELETE FROM phien WHERE employer_id = $1 AND token_hash NOT IN
       (SELECT token_hash FROM phien WHERE employer_id = $1 ORDER BY created_at DESC LIMIT ${L.sessionsPerEmployer})`, [employerId]);
}

async function openCount(q, employerId, exceptId = null) {
  return (await q("SELECT count(*)::int AS n FROM jobs WHERE employer_id = $1 AND status = 'dang' AND expires_at > now() AND ($2::uuid IS NULL OR id <> $2)", [employerId, exceptId]))[0].n;
}

async function dupCheck(q, j, employerId, ip, exceptId = null) {
  const r = await q(
    `SELECT 1 FROM jobs WHERE content_hash = $1 AND created_at > now() - interval '7 days' AND ($4::uuid IS NULL OR id <> $4)
       AND (employer_id = $2 OR created_ip = $3) LIMIT 1`, [j.contentHash, employerId, ip, exceptId]);
  if (r.length) throw new ApiError(409, 'duplicate', 'Tin giống hệt một tin bạn (hoặc mạng này) đã đăng trong 7 ngày qua. Hãy sửa hoặc gia hạn tin cũ thay vì đăng lại.');
}

export function employerRoutes(app) {
  // ---------- tài khoản ----------
  app.route('GET', '/api/employer/me', async (ctx) => {
    const e = await employerFor(query, whoOf(ctx));
    if (!e) return { employer: null };
    await query("UPDATE employers SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 minute'", [e.id]);
    return { employer: employerOut(e) };
  });

  app.route('POST', '/api/employer', async (ctx) => {
    const name = cleanText(ctx.body.name, { max: 60, min: 2, field: 'Tên quán hoặc tên bạn' });
    if (ctx.idDown) throw idUnavailable();   // đã đăng nhập mà 9id lỗi: không tạo tài khoản ẩn danh thứ hai
    const sid = ensureSession(ctx);
    const code = newRecoveryCode();
    return tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 9201))', [ctx.userId ? 'u:' + ctx.userId : sid]);
      if (await employerFor(c.query, whoOf(ctx))) throw new ApiError(409, 'already', ctx.userId ? 'Tài khoản này đã có tài khoản nhà tuyển dụng' : 'Thiết bị này đã có tài khoản nhà tuyển dụng');
      if (!(await consume(c.query, `emp:ip:${ctx.ip}:${todayVN()}`, L.employersPerIpDay))) throw tooMany('Từ mạng này đã tạo nhiều tài khoản hôm nay, thử lại vào ngày mai');
      const e = (await c.query('INSERT INTO employers(name, recovery_hash, created_ip, user_id) VALUES($1,$2,$3,$4) RETURNING *', [name, sha256hex(normRecoveryCode(code)), ctx.ip, ctx.userId || null]))[0];
      if (!ctx.userId) await attachSession(c.query, sid, e.id);   // đăng nhập: quyền đi qua tài khoản, máy không giữ lại sau khi đăng xuất
      return { employer: employerOut(e), recoveryCode: code };
    });
  }, { limit: 10, limitKey: 'mkemp' });

  // vào lại bằng mã khôi phục: MỌI lần thử đều tính hạn mức (theo IP và toàn cục) để chống dò mã
  app.route('POST', '/api/employer/recover', async (ctx) => {
    const hour = hourVN();
    // chỉ giới hạn theo IP (không có trần toàn cục: tránh một kẻ khóa mọi nhà tuyển dụng; mã 80 bit không dò được)
    if (!(await consume(query, `rec:ip:${ctx.ip}:${hour}`, L.recoverPerIpHour))) {
      throw tooMany('Thử mã quá nhiều lần, đợi một giờ rồi thử lại');
    }
    const code = normRecoveryCode(ctx.body.code);
    const wrong = new ApiError(404, 'bad_code', 'Mã khôi phục không đúng. Kiểm tra lại từng ký tự (mã gồm 16 ký tự chữ và số).');
    if (!code) throw wrong;
    const e = (await query('SELECT * FROM employers WHERE recovery_hash = $1', [sha256hex(code)]))[0];
    if (!e) throw wrong;
    if (ctx.idDown) throw idUnavailable();
    // đã đăng nhập và đã có nhà tuyển dụng của tài khoản: không gắn thêm nhà tuyển dụng khác vào máy này (tránh hai danh tính)
    if (ctx.userId && e.user_id !== ctx.userId && await employerFor(query, { userId: ctx.userId })) throw new ApiError(409, 'already', 'Tài khoản 9app này đã có tài khoản nhà tuyển dụng');
    const sid = ensureSession(ctx);
    await tx((c) => attachSession(c.query, sid, e.id));
    return { employer: employerOut(e) };
  }, { limit: 20, limitKey: 'recover' });

  // đổi mã khôi phục (mã cũ hết hiệu lực); hiện đúng một lần
  app.route('POST', '/api/employer/recovery-code', async (ctx) => {
    const e = await requireEmployer(ctx);
    const code = newRecoveryCode();
    await query('UPDATE employers SET recovery_hash = $2 WHERE id = $1', [e.id, sha256hex(normRecoveryCode(code))]);
    return { recoveryCode: code };
  }, { limit: 10, limitKey: 'newcode' });

  // xóa tài khoản: xóa cứng mọi tin, hồ sơ ứng viên và phiên của tài khoản này
  app.route('DELETE', '/api/employer', async (ctx) => {
    const e = await requireEmployer(ctx);
    // máy có thể còn nhà tuyển dụng ẩn danh khác (khi đã đăng nhập): chỉ bỏ cookie nếu phiên này đang nối tới chính nhà tuyển dụng bị xóa
    const linked = ctx.sid ? (await query('SELECT 1 FROM phien WHERE token_hash = $1 AND employer_id = $2', [ctx.sid, e.id])).length > 0 : false;
    await query('DELETE FROM employers WHERE id = $1', [e.id]);
    if (linked || !ctx.userId) clearSessionCookie(ctx);
    return { ok: true };
  }, { limit: 5, limitKey: 'delemp' });

  app.route('POST', '/api/employer/logout', async (ctx) => {
    if (ctx.sid) await query('DELETE FROM phien WHERE token_hash = $1', [ctx.sid]);
    clearSessionCookie(ctx);
    return { ok: true };
  });

  // ---------- tin của tôi ----------
  app.route('GET', '/api/employer/jobs', async (ctx) => {
    const e = await requireEmployer(ctx);
    const rows = await query(
      `SELECT j.*,
              (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS apps_total,
              (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id AND a.status = 'moi') AS apps_new,
              (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id AND a.status = 'nhan') AS apps_accepted,
              (SELECT count(*)::int FROM reveals r WHERE r.job_id = j.id) AS reveals
         FROM jobs j WHERE j.employer_id = $1 ORDER BY j.seq DESC LIMIT 100`, [e.id]);
    return { employer: employerOut(e), jobs: rows.map((r) => ownJob(r, { appsTotal: r.apps_total, appsNew: r.apps_new, appsAccepted: r.apps_accepted, contactViews: r.reveals })), openLimit: L.openJobsPerEmployer };
  });

  app.route('POST', '/api/employer/jobs', async (ctx) => {
    const e = await requireEmployer(ctx);
    const j = validateJob(ctx.body, { create: true });
    return tx(async (c) => {
      // khóa hàng nhà tuyển dụng: hai yêu cầu đăng tin đồng thời chạy lần lượt, không vượt hạn mức
      const emp = (await c.query('SELECT * FROM employers WHERE id = $1 FOR UPDATE', [e.id]))[0];
      if (!emp) throw notFound();
      const day = todayVN();
      const isNew = Date.now() - new Date(emp.created_at).getTime() < 24 * 3600_000;
      const cap = isNew ? Math.min(L.jobsPerNewSessionDay, L.jobsPerSessionDay) : L.jobsPerSessionDay;
      if (!(await consume(c.query, `job:emp:${e.id}:${day}`, cap))) {
        throw tooMany(isNew ? `Tài khoản mới đăng được tối đa ${cap} tin mỗi ngày. Ngày mai bạn đăng tiếp nhé.` : `Mỗi ngày đăng tối đa ${cap} tin. Ngày mai bạn đăng tiếp nhé.`);
      }
      if (!(await consume(c.query, `job:ip:${ctx.ip}:${day}`, L.jobsPerIpDay))) throw tooMany('Từ mạng này đã đăng nhiều tin hôm nay, thử lại vào ngày mai');
      if ((await openCount(c.query, e.id)) >= L.openJobsPerEmployer) throw new ApiError(409, 'too_many_open', `Bạn đang có ${L.openJobsPerEmployer} tin đang mở. Hãy đóng bớt tin đã tuyển đủ trước khi đăng tin mới.`);
      await checkBlocked(c.query, j.contentHash, j.contactPhone);
      await dupCheck(c.query, j, e.id, ctx.ip);
      const r = (await c.query(
        `INSERT INTO jobs(employer_id, title, company, kind, category, description, requirements, pay_type, pay_min, pay_max, shifts, shift_note,
                          city, district, district_key, address, contact_name, contact_phone, start_now, slots, risk, risk_notes, content_hash, search_key, created_ip, expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now() + make_interval(days => $26))
         RETURNING *`,
        [e.id, j.title, j.company, j.kind, j.category, j.description, j.requirements, j.payType, j.payMin, j.payMax, j.shifts, j.shiftNote,
          j.city, j.district, j.districtKey, j.address, j.contactName, j.contactPhone, j.startNow, j.slots, j.risk, j.riskNotes, j.contentHash, j.searchKey, ctx.ip, j.days]))[0];
      return { job: ownJob(r) };
    });
  }, { limit: 20, limitKey: 'postjob' });

  // chủ tin lấy 1 tin (để sửa); tin của người khác là 404
  const ownRow = async (q, id, employerId, lock = false) => {
    const r = (await q(`SELECT * FROM jobs WHERE id = $1 AND employer_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, employerId]))[0];
    if (!r) throw notFound('Không tìm thấy tin này trong tài khoản của bạn');
    return r;
  };

  app.route('GET', '/api/employer/jobs/:id', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    const row = await ownRow(query, id, e.id);
    const views = (await query('SELECT count(*)::int AS n FROM reveals WHERE job_id = $1', [id]))[0].n;
    return { job: ownJob(row, { contactViews: views }) };
  });

  app.route('PUT', '/api/employer/jobs/:id', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    const j = validateJob(ctx.body, { create: false });
    return tx(async (c) => {
      const cur = await ownRow(c.query, id, e.id, true);
      if (cur.status === 'an') throw new ApiError(409, 'hidden', 'Tin đang bị ẩn do bị báo cáo nên chưa sửa được. Liên hệ quản trị để được xem xét.');
      if (!(await consume(c.query, `edit:emp:${e.id}:${todayVN()}`, L.editsPerEmployerDay))) throw tooMany('Hôm nay bạn sửa tin quá nhiều lần');
      await checkBlocked(c.query, j.contentHash, j.contactPhone);
      await dupCheck(c.query, j, e.id, ctx.ip, id);
      const r = (await c.query(
        `UPDATE jobs SET title=$2, company=$3, kind=$4, category=$5, description=$6, requirements=$7, pay_type=$8, pay_min=$9, pay_max=$10, shifts=$11, shift_note=$12,
                         city=$13, district=$14, district_key=$15, address=$16, contact_name=$17, contact_phone=$18, start_now=$19, slots=$20, risk=$21, risk_notes=$22,
                         content_hash=$23, search_key=$24, updated_at=now()
          WHERE id=$1 RETURNING *`,
        [id, j.title, j.company, j.kind, j.category, j.description, j.requirements, j.payType, j.payMin, j.payMax, j.shifts, j.shiftNote,
          j.city, j.district, j.districtKey, j.address, j.contactName, j.contactPhone, j.startNow, j.slots, j.risk, j.riskNotes, j.contentHash, j.searchKey]))[0];
      return { job: ownJob(r) };
    });
  }, { limit: 30, limitKey: 'editjob' });

  app.route('POST', '/api/employer/jobs/:id/close', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      const cur = await ownRow(c.query, id, e.id, true);
      if (cur.status === 'dang') await c.query("UPDATE jobs SET status = 'dong', closed_at = now(), updated_at = now() WHERE id = $1", [id]);
      return { ok: true };
    });
  }, { limit: 30, limitKey: 'closejob' });

  // mở lại / gia hạn thêm N ngày kể từ bây giờ
  app.route('POST', '/api/employer/jobs/:id/reopen', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    const days = intIn(ctx.body.days ?? config.defaultDays, { min: 1, max: config.maxDays, field: 'Số ngày' });
    return tx(async (c) => {
      await c.query('SELECT 1 FROM employers WHERE id = $1 FOR UPDATE', [e.id]);
      const cur = await ownRow(c.query, id, e.id, true);
      if (cur.status === 'an') throw new ApiError(409, 'hidden', 'Tin đang bị ẩn do bị báo cáo nên chưa mở lại được.');
      const stillOpen = cur.status === 'dang' && new Date(cur.expires_at).getTime() > Date.now();
      if (!stillOpen && cur.renew_count >= 6) throw new ApiError(409, 'renew_limit', 'Tin này đã gia hạn nhiều lần. Hãy đăng một tin mới với nội dung cập nhật.');
      if ((await openCount(c.query, e.id, id)) >= L.openJobsPerEmployer) throw new ApiError(409, 'too_many_open', `Bạn đang có ${L.openJobsPerEmployer} tin đang mở, hãy đóng bớt trước.`);
      if (!(await consume(c.query, `edit:emp:${e.id}:${todayVN()}`, L.editsPerEmployerDay))) throw tooMany('Hôm nay bạn sửa tin quá nhiều lần');
      const r = (await c.query("UPDATE jobs SET status = 'dang', closed_at = NULL, expires_at = CASE WHEN $3 THEN GREATEST(expires_at, now() + make_interval(days => $2)) ELSE now() + make_interval(days => $2) END, renew_count = renew_count + CASE WHEN $3 THEN 0 ELSE 1 END, updated_at = now() WHERE id = $1 RETURNING *", [id, days, stillOpen]))[0];
      return { job: ownJob(r) };
    });
  }, { limit: 30, limitKey: 'reopenjob' });

  app.route('DELETE', '/api/employer/jobs/:id', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    const r = await query('DELETE FROM jobs WHERE id = $1 AND employer_id = $2 RETURNING id', [id, e.id]);
    if (!r.length) throw notFound('Không tìm thấy tin này trong tài khoản của bạn');
    return { ok: true };
  }, { limit: 30, limitKey: 'deljob' });

  // ---------- hộp thư ứng viên ----------
  app.route('GET', '/api/employer/jobs/:id/applications', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    const job = await ownRow(query, id, e.id);
    const st = ctx.query.status;
    if (st !== undefined && st !== '' && !keys(APP_STATUS).includes(st)) throw new ApiError(400, 'invalid_input', 'Trạng thái không hợp lệ');
    const before = Number.parseInt(ctx.query.before, 10);
    const params = [id]; let where = 'job_id = $1';
    if (st) { params.push(st); where += ` AND status = $${params.length}`; }
    if (Number.isSafeInteger(before) && before > 0) { params.push(before); where += ` AND seq < $${params.length}`; }
    const PAGE = 50;
    const all = await query(`SELECT * FROM applications WHERE ${where} ORDER BY seq DESC LIMIT ${PAGE + 1}`, params);
    const rows = all.slice(0, PAGE);
    // đã hiển thị cho chủ tin = đã xem (mở chỗ trống dưới trần hồ sơ chưa xem)
    if (rows.length) await query('UPDATE applications SET seen_at = now() WHERE id = ANY($1::uuid[]) AND seen_at IS NULL', [rows.map((r) => r.id)]);
    const counts = Object.fromEntries((await query('SELECT status, count(*)::int AS n FROM applications WHERE job_id = $1 GROUP BY status', [id])).map((r) => [r.status, r.n]));
    return {
      job: { id: job.id, title: job.title, slots: job.slots, state: stateOf(job) },
      counts, next: all.length > PAGE ? rows[rows.length - 1].seq : null,
      items: rows.map((a) => ({ id: a.id, name: a.name, phone: a.phone, zaloUrl: 'https://zalo.me/' + a.phone, message: a.message, startNow: a.start_now, status: a.status, createdAt: a.created_at })),
    };
  });

  // dọn hàng loạt: xóa hồ sơ đã loại, hoặc loại tất cả hồ sơ mới
  app.route('POST', '/api/employer/jobs/:id/applications/bulk', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    await ownRow(query, id, e.id);
    const action = ctx.body.action;
    if (action === 'delete_rejected') {
      const r = await query("DELETE FROM applications WHERE job_id = $1 AND status = 'loai' RETURNING id", [id]);
      return { ok: true, count: r.length };
    }
    if (action === 'reject_new') {
      const r = await query("UPDATE applications SET status = 'loai', updated_at = now(), seen_at = COALESCE(seen_at, now()) WHERE job_id = $1 AND status = 'moi' RETURNING id", [id]);
      return { ok: true, count: r.length };
    }
    throw new ApiError(400, 'invalid_input', 'Thao tác không hợp lệ');
  }, { limit: 20, limitKey: 'bulk' });

  // khiếu nại khi tin bị ẩn: ghi lại để quản trị (Console) xem xét
  app.route('POST', '/api/employer/jobs/:id/appeal', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    const note = cleanText(ctx.body.note, { max: 500, min: 5, field: 'Nội dung khiếu nại' });
    return tx(async (c) => {
      const cur = await ownRow(c.query, id, e.id, true);
      if (cur.status !== 'an') throw new ApiError(409, 'not_hidden', 'Tin này không bị ẩn');
      if (cur.appealed_at && Date.now() - new Date(cur.appealed_at).getTime() < 24 * 3600_000) throw tooMany('Bạn đã khiếu nại trong 24 giờ qua, vui lòng chờ xem xét');
      await c.query('UPDATE jobs SET appeal_note = $2, appealed_at = now() WHERE id = $1', [id, note]);
      return { ok: true };
    });
  }, { limit: 10, limitKey: 'appeal' });

  app.route('POST', '/api/employer/applications/:id/status', async (ctx) => {
    const e = await requireEmployer(ctx);
    const id = uuidParam(ctx.params.id);
    const st = ctx.body.status;
    if (typeof st !== 'string' || !keys(APP_STATUS).includes(st)) throw new ApiError(400, 'invalid_input', 'Trạng thái không hợp lệ');
    // một câu lệnh: chỉ cập nhật khi đơn thuộc tin của chính nhà tuyển dụng này
    const r = await query(
      `UPDATE applications a SET status = $2, updated_at = now() FROM jobs j
        WHERE a.id = $1 AND j.id = a.job_id AND j.employer_id = $3 RETURNING a.id, a.status`, [id, st, e.id]);
    if (!r.length) throw notFound('Không tìm thấy hồ sơ này');
    return { id: r[0].id, status: r[0].status };
  }, { limit: 120, limitKey: 'appstatus' });
}
