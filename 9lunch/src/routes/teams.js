import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { ensureSession, requireSession, requireMember, memberFor, forbidden, touch } from '../auth.js';
import { withIdem } from '../idem.js';
import { cleanText, cleanBank, normKey, randomCode, INVITE_RE, uuidParam } from '../util.js';

export const post = (app, p, h, o = {}) => app.route('POST', p, withIdem(h), o);

const uniqueViolation = (e) => e && e.code === '23505';

// Khoản còn dang dở của một thành viên (nợ người khác, người khác nợ mình, hoặc nằm trong phiên bù trừ đang mở)
export async function openMoneyOf(q, memberId) {
  const r = await q(
    `SELECT 1 FROM charges c JOIN meals m ON m.id = c.meal_id
      WHERE (c.member_id = $1 OR c.payee_id = $1) AND c.member_id <> c.payee_id AND c.status <> 'da_nhan' AND m.status <> 'huy'
      UNION ALL
     SELECT 1 FROM netting_transfers t JOIN nettings n ON n.id = t.netting_id
      WHERE (t.from_id = $1 OR t.to_id = $1) AND n.status = 'cho' LIMIT 1`, [memberId]);
  return r.length > 0;
}

const memberRow = (m, me) => ({ id: m.id, name: m.name, role: m.role, hasBank: !!m.bank_account, isMe: m.id === me.id });

export function teamRoutes(app) {
  // ---------- phiên hiện tại: danh sách nhóm của tôi ----------
  app.route('GET', '/api/me', async (ctx) => {
    if (!ctx.sid && !ctx.userId) return { teams: [] };
    await touch(ctx);
    // mỗi nhóm một dòng: máy có cả thành viên ẩn danh lẫn thành viên tài khoản thì ưu tiên tài khoản (giống memberFor)
    const rows = await query(
      `WITH mine AS (
         SELECT DISTINCT ON (m.team_id) m.* FROM members m
          WHERE m.left_at IS NULL
            AND ( ($1::text IS NOT NULL AND EXISTS (SELECT 1 FROM phien p WHERE p.member_id = m.id AND p.token_hash = $1))
                  OR ($2::uuid IS NOT NULL AND m.user_id = $2::uuid) )
          ORDER BY m.team_id, (m.user_id = $2::uuid) DESC NULLS LAST, m.joined_at, m.seq)
       SELECT t.id, t.name, t.invite_code, m.id AS member_id, m.name AS my_name, m.role,
              (SELECT count(*)::int FROM members x WHERE x.team_id = t.id AND x.left_at IS NULL) AS member_count,
              (SELECT COALESCE(SUM(c.amount),0) FROM charges c JOIN meals ml ON ml.id = c.meal_id
                WHERE c.member_id = m.id AND c.member_id <> c.payee_id AND c.status <> 'da_nhan' AND ml.status <> 'huy') AS owe,
              (SELECT COALESCE(SUM(c.amount),0) FROM charges c JOIN meals ml ON ml.id = c.meal_id
                WHERE c.payee_id = m.id AND c.member_id <> c.payee_id AND c.status <> 'da_nhan' AND ml.status <> 'huy') AS owed,
              (SELECT row_to_json(x) FROM (SELECT id, status, day::text AS day, venue_name FROM meals
                WHERE team_id = t.id AND status IN ('binh_chon','dat_mon','thanh_toan') ORDER BY day DESC, created_at DESC LIMIT 1) x) AS active_meal
         FROM mine m JOIN teams t ON t.id = m.team_id
        ORDER BY m.joined_at DESC`, [ctx.sid || null, ctx.userId || null]);
    return {
      teams: rows.map((r) => ({
        id: r.id, name: r.name, inviteCode: r.invite_code, memberId: r.member_id, myName: r.my_name, role: r.role,
        memberCount: r.member_count, owe: Number(r.owe), owed: Number(r.owed), activeMeal: r.active_meal,
      })),
    };
  });

  // ---------- tạo nhóm ----------
  post(app, '/api/teams', async (ctx) => {
    const b = ctx.body;
    const name = cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên nhóm' });
    const myName = cleanText(b.myName, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' });
    const bank = cleanBank(b.bank);
    const sid = ensureSession(ctx);
    const made = (await query("SELECT count(*)::int n FROM teams WHERE created_by_hash=$1 AND created_at > now() - interval '24 hours'", [sid]))[0].n;
    if (made >= config.maxTeamsPerDay) throw new ApiError(429, 'too_many_teams', `Mỗi ngày chỉ tạo được ${config.maxTeamsPerDay} nhóm, mai bạn tạo tiếp nhé`);
    const fromIp = (await query("SELECT count(*)::int n FROM teams WHERE created_ip=$1 AND created_at > now() - interval '1 hour'", [ctx.ip]))[0].n;
    if (fromIp >= config.maxTeamsPerIpHour) throw new ApiError(429, 'too_many_teams', 'Từ mạng này đã tạo nhiều nhóm trong một giờ qua, thử lại sau nhé');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await tx(async (c) => {
          const t = (await c.query('INSERT INTO teams(name, invite_code, created_by_hash, created_ip) VALUES($1,$2,$3,$4) RETURNING id, invite_code', [name, randomCode(10), sid, ctx.ip]))[0];
          const m = (await c.query(
            "INSERT INTO members(team_id, name, role, bank_bin, bank_account, bank_holder, user_id) VALUES($1,$2,'chu',$3,$4,$5,$6) RETURNING id",
            [t.id, myName, bank?.bin ?? null, bank?.account ?? null, bank?.holder ?? null, ctx.userId || null]))[0];
          if (!ctx.userId) await c.query('INSERT INTO phien(token_hash, member_id) VALUES($1,$2)', [sid, m.id]);   // đăng nhập: quyền đi qua tài khoản, máy không giữ lại sau khi đăng xuất
          return { team: { id: t.id, name, inviteCode: t.invite_code }, memberId: m.id };
        });
      } catch (e) { if (!uniqueViolation(e)) throw e; }
    }
    throw new ApiError(500, 'internal', 'Không tạo được mã mời, thử lại');
  }, { limit: 20, limitKey: 'mkteam' });

  // ---------- vào nhóm bằng mã mời ----------
  const codeOf = (ctx) => {
    const c = String(ctx.params.code || '').toUpperCase();
    if (!INVITE_RE.test(c)) throw new ApiError(404, 'bad_code', 'Mã mời không đúng. Kiểm tra lại link hoặc hỏi người tạo nhóm mã mới.');
    return c;
  };

  app.route('GET', '/api/join/:code', async (ctx) => {
    const code = codeOf(ctx);
    const t = (await query(
      `SELECT t.id, t.name, (SELECT count(*)::int FROM members m WHERE m.team_id = t.id AND m.left_at IS NULL) AS n FROM teams t WHERE t.invite_code = $1`, [code]))[0];
    if (!t) throw new ApiError(404, 'bad_code', 'Mã mời không đúng hoặc đã được đổi. Hỏi người tạo nhóm để lấy link mới.');
    const mine = (ctx.sid || ctx.userId) ? await requireMemberSoft(ctx, t.id) : null;
    return { name: t.name, memberCount: t.n, full: t.n >= config.maxMembers, alreadyMember: !!mine, teamId: mine ? t.id : undefined };
  }, { limit: 40, limitKey: 'joinget' });

  post(app, '/api/join/:code', async (ctx) => {
    const code = codeOf(ctx);
    const name = cleanText(ctx.body.name, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' });
    const sid = ensureSession(ctx);
    const attempt = () => tx(async (c) => {
      const t = (await c.query('SELECT id, name FROM teams WHERE invite_code=$1 FOR UPDATE', [code]))[0];
      if (!t) throw new ApiError(404, 'bad_code', 'Mã mời không đúng hoặc đã được đổi. Hỏi người tạo nhóm để lấy link mới.');
      // đã là thành viên: qua phiên ẩn danh này hoặc qua tài khoản 9id -> dùng lại
      const mine = await memberFor(c.query, { sid, userId: ctx.userId }, t.id);
      if (mine) return { team: { id: t.id, name: t.name }, memberId: mine.id, already: true };   // KHÔNG nối thêm phiên ẩn danh của máy này (máy dùng chung)
      const all = await c.query('SELECT name FROM members WHERE team_id=$1 AND left_at IS NULL', [t.id]);
      if (all.length >= config.maxMembers) throw new ApiError(409, 'team_full', `Nhóm đã đủ ${config.maxMembers} người`);
      if (all.some((x) => normKey(x.name) === normKey(name))) throw new ApiError(409, 'name_taken', 'Trong nhóm đã có người tên này. Thêm họ hoặc chữ đệm để mọi người phân biệt nhé.');
      const m = (await c.query("INSERT INTO members(team_id, name, role, user_id) VALUES($1,$2,'thanh_vien',$3) RETURNING id", [t.id, name, ctx.userId || null]))[0];
      if (!ctx.userId) await c.query('INSERT INTO phien(token_hash, member_id) VALUES($1,$2)', [sid, m.id]);
      return { team: { id: t.id, name: t.name }, memberId: m.id };
    });
    try { return await attempt(); }
    catch (e) {
      // hai yêu cầu cùng người dùng chạy đua: chỉ mục duy nhất (team, user) chặn bản thứ hai -> thử lại, lần này thấy thành viên đã có
      if (uniqueViolation(e) && ctx.userId) return attempt();
      throw e;
    }
  }, { limit: 20, limitKey: 'joinpost' });

  async function requireMemberSoft(ctx, teamId) {
    try { return await requireMember(query, ctx, teamId); } catch { return null; }
  }

  // ---------- trang nhóm ----------
  app.route('GET', '/api/teams/:id', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    requireSession(ctx);
    const me = await requireMember(query, ctx, id);
    await touch(ctx);
    const t = (await query('SELECT id, name, invite_code, round500 FROM teams WHERE id=$1', [id]))[0];
    const members = await query('SELECT * FROM members WHERE team_id=$1 AND left_at IS NULL ORDER BY joined_at, seq', [id]);
    const meals = await query(
      `SELECT m.id, m.day::text AS day, m.status, m.kind, m.venue_name, m.payer_id, p.name AS payer_name
         FROM meals m LEFT JOIN members p ON p.id = m.payer_id WHERE m.team_id = $1 ORDER BY m.day DESC, m.created_at DESC LIMIT 30`, [id]);
    const mine = await query(
      `SELECT c.id, c.meal_id, c.amount, c.status, c.payee_id, p.name AS payee_name, m.venue_name, m.day::text AS day, c.qr_gen, c.payee_changed_at
         FROM charges c JOIN meals m ON m.id = c.meal_id JOIN members p ON p.id = c.payee_id
        WHERE c.member_id = $1 AND c.member_id <> c.payee_id AND c.status <> 'da_nhan' AND m.status <> 'huy' ORDER BY m.day DESC`, [me.id]);
    const owed = await query(
      `SELECT c.id, c.meal_id, c.amount, c.status, c.member_id, d.name AS member_name, m.venue_name, m.day::text AS day
         FROM charges c JOIN meals m ON m.id = c.meal_id JOIN members d ON d.id = c.member_id
        WHERE c.payee_id = $1 AND c.member_id <> c.payee_id AND c.status <> 'da_nhan' AND m.status <> 'huy' ORDER BY m.day DESC`, [me.id]);
    const netting = (await query("SELECT id FROM nettings WHERE team_id=$1 AND status='cho'", [id]))[0];
    const actives = meals.filter((m) => ['binh_chon', 'dat_mon', 'thanh_toan'].includes(m.status));
    const act = actives[0];
    const sum = (m) => ({ id: m.id, day: m.day, status: m.status, kind: m.kind, venueName: m.venue_name, payerName: m.payer_name });
    return {
      team: { id: t.id, name: t.name, inviteCode: t.invite_code, round500: t.round500 },
      me: { id: me.id, name: me.name, role: me.role, bank: me.bank_account ? { bin: me.bank_bin, account: me.bank_account, holder: me.bank_holder } : null },
      members: members.map((m) => memberRow(m, me)),
      activeMeal: act ? sum(act) : null,
      activeMeals: actives.map(sum),
      recentMeals: meals.filter((m) => !actives.includes(m)).slice(0, 12).map(sum),
      myDebts: mine.map((r) => ({ id: r.id, mealId: r.meal_id, amount: Number(r.amount), status: r.status, payeeId: r.payee_id, payeeName: r.payee_name, venueName: r.venue_name, day: r.day, payeeChanged: !!r.payee_changed_at && r.status === 'chua_tra' })),
      owedToMe: owed.map((r) => ({ id: r.id, mealId: r.meal_id, amount: Number(r.amount), status: r.status, memberId: r.member_id, memberName: r.member_name, venueName: r.venue_name, day: r.day })),
      nettingId: netting ? netting.id : null,
    };
  });

  // ---------- chỉnh nhóm (chủ nhóm) ----------
  post(app, '/api/teams/:id', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (me.role !== 'chu') throw forbidden('Chỉ chủ nhóm mới sửa được thông tin nhóm');
      const b = ctx.body;
      if (b.name !== undefined) await c.query('UPDATE teams SET name=$2 WHERE id=$1', [id, cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên nhóm' })]);
      if (b.round500 !== undefined) await c.query('UPDATE teams SET round500=$2 WHERE id=$1', [id, b.round500 === true]);
      return { ok: true };
    });
  });

  post(app, '/api/teams/:id/rotate-code', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const me = await requireMember(query, ctx, id);
    if (me.role !== 'chu') throw forbidden('Chỉ chủ nhóm mới đổi được mã mời');
    for (let i = 0; i < 5; i++) {
      try {
        const r = await query('UPDATE teams SET invite_code=$2 WHERE id=$1 RETURNING invite_code', [id, randomCode(10)]);
        return { inviteCode: r[0].invite_code };
      } catch (e) { if (!uniqueViolation(e)) throw e; }
    }
    throw new ApiError(500, 'internal', 'Không đổi được mã mời, thử lại');
  });

  // ---------- hồ sơ của tôi trong nhóm: tên hiển thị và tài khoản nhận tiền (của riêng từng người) ----------
  post(app, '/api/teams/:id/me', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      const b = ctx.body;
      if (b.name !== undefined) {
        const name = cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên của bạn' });
        const others = await c.query('SELECT name FROM members WHERE team_id=$1 AND left_at IS NULL AND id<>$2', [id, me.id]);
        if (others.some((x) => normKey(x.name) === normKey(name))) throw new ApiError(409, 'name_taken', 'Trong nhóm đã có người tên này. Thêm họ hoặc chữ đệm nhé.');
        await c.query('UPDATE members SET name=$2 WHERE id=$1', [me.id, name]);
      }
      if (b.bank !== undefined) {
        const bank = cleanBank(b.bank) || { bin: null, account: null, holder: null };
        await c.query('UPDATE members SET bank_bin=$2, bank_account=$3, bank_holder=$4 WHERE id=$1', [me.id, bank.bin, bank.account, bank.holder]);
      }
      return { ok: true };
    });
  });

  // ---------- rời nhóm, xóa thành viên, xóa nhóm ----------
  async function removeMember(c, teamId, target, who) {
    // khóa các bữa đang diễn ra (theo id) để không tạo khoản cho người vừa rời và không kẹt bữa
    await c.query("SELECT id FROM meals WHERE team_id=$1 AND status IN ('binh_chon','dat_mon','thanh_toan') ORDER BY id FOR UPDATE", [teamId]);
    if (await openMoneyOf(c.query, target.id)) {
      throw new ApiError(409, 'has_open_money', who === 'self'
        ? 'Bạn còn khoản chưa thanh toán nên chưa rời nhóm được. Hãy trả hoặc xác nhận xong các khoản đó trước.'
        : `${target.name} còn khoản chưa thanh toán nên chưa xóa được. Hãy để các khoản đó được thanh toán xong trước.`);
    }
    // bỏ phiếu và món ở các bữa đang diễn ra; dữ liệu đã chốt (lịch sử, sổ nợ) giữ nguyên, thành viên chỉ đánh dấu đã rời
    await c.query("DELETE FROM votes WHERE member_id=$1 AND meal_id IN (SELECT id FROM meals WHERE status IN ('binh_chon','dat_mon'))", [target.id]);
    await c.query("DELETE FROM items WHERE member_id=$1 AND meal_id IN (SELECT id FROM meals WHERE status IN ('binh_chon','dat_mon'))", [target.id]);
    await c.query("UPDATE meals SET payer_id = NULL WHERE payer_id=$1 AND status IN ('binh_chon','dat_mon')", [target.id]);
    await c.query("UPDATE meals SET orderer_id = NULL WHERE orderer_id=$1 AND status IN ('binh_chon','dat_mon')", [target.id]);
    await c.query('UPDATE members SET left_at = now(), bank_bin=NULL, bank_account=NULL, bank_holder=NULL WHERE id=$1', [target.id]);
    await c.query('DELETE FROM phien WHERE member_id=$1', [target.id]);
  }

  // thoát khỏi thiết bị này: xóa phiên ở máy chủ và cookie (thành viên vẫn ở trong nhóm, nhưng máy này không còn nhận ra)
  post(app, '/api/logout', async (ctx) => {
    if (ctx.sid) await query('DELETE FROM phien WHERE token_hash=$1', [ctx.sid]);
    ctx.setCookie('lsid', '', { clear: true });
    return { ok: true };
  });

  post(app, '/api/teams/:id/leave', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (me.role === 'chu') {
        const others = await c.query('SELECT id FROM members WHERE team_id=$1 AND left_at IS NULL AND id<>$2', [id, me.id]);
        if (others.length) throw new ApiError(409, 'owner_cannot_leave', 'Bạn là chủ nhóm nên chưa rời được. Hãy chuyển quyền chủ nhóm cho người khác hoặc xóa nhóm.');
      }
      await removeMember(c, id, me, 'self');
      return { ok: true };
    });
  });

  post(app, '/api/teams/:id/members/:mid/remove', async (ctx) => {
    const id = uuidParam(ctx.params.id); const mid = uuidParam(ctx.params.mid);
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (me.role !== 'chu') throw forbidden('Chỉ chủ nhóm mới xóa được thành viên');
      const target = (await c.query('SELECT * FROM members WHERE id=$1 AND team_id=$2 AND left_at IS NULL', [mid, id]))[0];
      if (!target) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên này');
      if (target.id === me.id) throw new ApiError(400, 'invalid_input', 'Bạn không tự xóa mình được. Hãy dùng nút Rời nhóm hoặc Xóa nhóm.');
      await removeMember(c, id, target, 'other');
      return { ok: true };
    });
  });

  // chuyển quyền chủ nhóm
  post(app, '/api/teams/:id/members/:mid/make-owner', async (ctx) => {
    const id = uuidParam(ctx.params.id); const mid = uuidParam(ctx.params.mid);
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (me.role !== 'chu') throw forbidden('Chỉ chủ nhóm mới chuyển quyền được');
      const target = (await c.query('SELECT id FROM members WHERE id=$1 AND team_id=$2 AND left_at IS NULL', [mid, id]))[0];
      if (!target) throw new ApiError(404, 'not_found', 'Không tìm thấy thành viên này');
      await c.query("UPDATE members SET role='thanh_vien' WHERE id=$1", [me.id]);
      await c.query("UPDATE members SET role='chu' WHERE id=$1", [mid]);
      return { ok: true };
    });
  });

  app.route('DELETE', '/api/teams/:id', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      if (me.role !== 'chu') throw forbidden('Chỉ chủ nhóm mới xóa được nhóm');
      await c.query('DELETE FROM teams WHERE id=$1', [id]); // xóa cứng toàn bộ dữ liệu nhóm
      return { ok: true };
    });
  });
}
