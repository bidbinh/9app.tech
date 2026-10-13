// Tiền gia đình: sổ nhẹ (không xử lý thanh toán thật). Khoản phải đóng, tiền tiêu vặt của con, chi tiêu chung.
// Quyền: chủ/quản lý thấy và sửa tất cả; thành viên thường xem tổng + khoản phải đóng (chỉ xem) và ghi/sửa/xóa khoản chi CỦA MÌNH;
// vai trò "con" chỉ xem tiền tiêu vặt và khoản phải đóng của chính mình. Ma trận đầy đủ trong README.
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { clock } from '../clock.js';
import { dayOfMs } from '../vn.js';
import { isManager } from '../auth.js';
import { cleanText, cleanNote, cleanDay, uuidParam, bad } from '../util.js';
import { raw } from '../http.js';
import { famRoutes } from './common.js';
import { createDueItem } from '../money/api.js';
import { CAT_IDS, CAT_LABEL, MAX_VND, summarize, budgetStatus, allowanceBalance, goalProgress, periodKey, toCsv, monthOf } from '../money/calc.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function moneyRoutes(app) {
  const F = famRoutes(app);
  const today = () => dayOfMs(clock.now());
  const isCon = (me) => me.role === 'con';

  const amountOf = (v, { min = 1, field = 'Số tiền' } = {}) => {
    if (!Number.isSafeInteger(v) || v < min || v > MAX_VND) throw bad(field, `${field} phải là số nguyên đồng từ ${min.toLocaleString('vi-VN')} đến ${MAX_VND.toLocaleString('vi-VN')}`);
    return v;
  };
  async function activeMembers(fid) {
    return query("SELECT id, name, role FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL AND role <> 'con' ORDER BY created_at, seq", [fid]);
  }
  // Con của vai trò "con" (tài khoản đã nối vào hồ sơ con)
  const myChildIds = async (me) => (isCon(me) && Array.isArray(me.childIds) ? me.childIds : []);
  const needManager = (me, msg = 'Chỉ chủ gia đình hoặc người quản lý mới làm được việc này') => { if (!isManager(me)) throw new ApiError(403, 'forbidden', msg); };

  const dueOut = (d, today0) => ({
    id: d.id, title: d.title, amount: Number(d.amount), dueDate: d.due_date, childId: d.child_id, note: d.note, source: d.source,
    paid: !!d.paid_on, paidOn: d.paid_on, paidBy: d.paid_by, overdue: !d.paid_on && d.due_date < today0, inCalendar: !!d.event_id,
  });
  const expOut = (e, names) => ({ id: e.id, day: e.day, amount: Number(e.amount), category: e.category, who: e.who, whoName: names.get(e.who) || '', note: e.note, createdBy: e.created_by });

  // ---------- tổng quan ----------
  F.get('/money', async (ctx, me, fid) => {
    const month = ctx.query.month && MONTH_RE.test(ctx.query.month) ? ctx.query.month : monthOf(today());
    const day = today();
    const mgr = isManager(me);
    const con = isCon(me);
    const members = await activeMembers(fid);
    const names = new Map(members.map((m) => [m.id, m.name]));
    const children = await query('SELECT id, name, color FROM children WHERE family_id=$1 AND archived_at IS NULL ORDER BY created_at, id', [fid]);
    const out = {
      role: con ? 'con' : mgr ? 'manager' : 'member', month, today: day, now: clock.now(),
      perm: { manage: mgr, addExpense: !con, seeTotals: !con, seeAllowance: mgr || con },
      categories: CAT_IDS.map((k) => ({ id: k, label: CAT_LABEL[k] })),
      members: mgr ? members.map((m) => ({ id: m.id, name: m.name })) : members.filter((m) => m.id === me.id).map((m) => ({ id: m.id, name: m.name })),
      children: children.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    };
    const mine = con ? await myChildIds(me) : null;
    if (!con) {
      const from = `${month}-01`;
      const rows = await query(
        `SELECT * FROM money_expenses WHERE family_id=$1 AND deleted_at IS NULL AND day >= $2::date AND day < ($2::date + interval '1 month') ORDER BY day DESC, created_at DESC`, [fid, from]);
      out.summary = summarize(rows, month);
      if (!mgr) delete out.summary.byWho;
      else out.summary.byWho = Object.fromEntries(Object.entries(out.summary.byWho).map(([k, v]) => [k, { name: names.get(k) || 'Không rõ', total: v }]));
      const budget = (await query('SELECT budget FROM money_settings WHERE family_id=$1', [fid]))[0];
      out.budget = Number(budget ? budget.budget : 0);
      out.budgetStatus = budgetStatus(out.summary.total, out.budget);
      const vis = mgr ? rows : rows.filter((r) => r.created_by === me.id || r.who === me.id);
      out.expenses = vis.slice(0, 300).map((r) => expOut(r, names));
      // 6 tháng gần nhất cho biểu đồ cột
      const hist = await query(
        `SELECT to_char(date_trunc('month', day), 'YYYY-MM') AS m, sum(amount)::bigint AS t FROM money_expenses WHERE family_id=$1 AND deleted_at IS NULL AND day >= ($2::date - interval '5 months') AND day < ($2::date + interval '1 month') GROUP BY 1 ORDER BY 1`, [fid, from]);
      out.history = hist.map((h) => ({ month: h.m, total: Number(h.t) }));
    }
    // khoản phải đóng: chủ/quản lý + thành viên (chỉ xem); "con" chỉ khoản của chính mình
    let dues = await query("SELECT * FROM money_dues WHERE family_id=$1 AND (paid_on IS NULL OR paid_on >= ($2::date - interval '60 days')) ORDER BY (paid_on IS NOT NULL), due_date LIMIT 200", [fid, day]);
    if (con) dues = dues.filter((d) => d.child_id && mine.includes(d.child_id));
    out.dues = dues.map((d) => dueOut(d, day));
    // tiền tiêu vặt
    if (mgr || con) {
      const kids = con ? children.filter((c) => mine.includes(c.id)) : children;
      const al = kids.length ? await query('SELECT * FROM money_allowance WHERE child_id = ANY($1::uuid[])', [kids.map((k) => k.id)]) : [];
      const logs = kids.length ? await query('SELECT * FROM money_allowance_log WHERE child_id = ANY($1::uuid[]) ORDER BY day DESC, created_at DESC', [kids.map((k) => k.id)]) : [];
      out.allowances = kids.map((k) => {
        const a = al.find((x) => x.child_id === k.id);
        const l = logs.filter((x) => x.child_id === k.id);
        const bal = allowanceBalance(l);
        const period = a ? a.period : 'tuan';
        const key = periodKey(day, period);
        return {
          childId: k.id, name: k.name, color: k.color, configured: !!a, amount: a ? Number(a.amount) : 0, period,
          goalName: a ? a.goal_name : '', goalAmount: a ? Number(a.goal_amount) : 0, balance: bal, goalPct: a ? goalProgress(bal, Number(a.goal_amount)) : null,
          givenThisPeriod: l.some((x) => x.period_key === key),
          entries: l.slice(0, 20).map((x) => ({ id: x.id, day: x.day, kind: x.kind, amount: Number(x.amount), note: x.note })),
        };
      });
    }
    return out;
  }, { con: true });

  // ---------- chi tiêu chung ----------
  function parseExpense(b, me, mgr, members) {
    const day = cleanDay(b.day ?? today(), 'Ngày chi');
    if (day > today()) throw bad('Ngày chi', 'Ngày chi không được ở tương lai');
    if (day < '2000-01-01') throw bad('Ngày chi');
    const category = CAT_IDS.includes(b.category) ? b.category : 'khac';
    let who = me.id;
    if (mgr && b.who) { who = uuidParam(b.who); if (!members.some((m) => m.id === who)) throw bad('Người chi', 'Người chi không thuộc gia đình'); }
    return { day, amount: amountOf(b.amount), category, who, note: cleanText(b.note ?? '', { max: 100, field: 'Ghi chú' }) };
  }

  F.post('/money/expenses', async (ctx, me, fid) => {
    if (isCon(me)) throw new ApiError(403, 'forbidden', 'Tài khoản của con không ghi chi tiêu chung');
    const members = await activeMembers(fid);
    const o = parseExpense(ctx.body, me, isManager(me), members);
    const n = (await query('SELECT count(*)::int n FROM money_expenses WHERE family_id=$1', [fid]))[0].n;
    if (n >= 50000) throw new ApiError(409, 'limit', 'Sổ chi tiêu đã đầy');
    const r = (await query('INSERT INTO money_expenses(family_id, day, amount, category, who, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [fid, o.day, o.amount, o.category, o.who, o.note, me.id]))[0];
    const sum = (await query("SELECT COALESCE(sum(amount),0)::bigint t FROM money_expenses WHERE family_id=$1 AND deleted_at IS NULL AND to_char(day,'YYYY-MM')=$2", [fid, monthOf(o.day)]))[0].t;
    const b = (await query('SELECT budget FROM money_settings WHERE family_id=$1', [fid]))[0];
    return { id: r.id, budgetStatus: budgetStatus(Number(sum), Number(b ? b.budget : 0)) };
  });

  async function ownExpense(me, fid, id) {
    const e = (await query('SELECT * FROM money_expenses WHERE id=$1 AND family_id=$2', [id, fid]))[0];
    if (!e) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản chi');
    if (!isManager(me) && !(e.created_by === me.id && !isCon(me))) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản chi'); // khoản của người khác: không lộ
    return e;
  }
  F.post('/money/expenses/:id', async (ctx, me, fid) => {
    const e = await ownExpense(me, fid, uuidParam(ctx.params.id));
    if (e.deleted_at) throw new ApiError(409, 'deleted', 'Khoản chi đã bị xóa');
    const members = await activeMembers(fid);
    const o = parseExpense({ day: e.day, category: e.category, who: e.who, note: e.note, amount: Number(e.amount), ...ctx.body }, me, isManager(me), members);
    await query('UPDATE money_expenses SET day=$2, amount=$3, category=$4, who=$5, note=$6 WHERE id=$1', [e.id, o.day, o.amount, o.category, isManager(me) ? o.who : e.who, o.note]);
    return { ok: true };
  });
  F.del('/money/expenses/:id', async (ctx, me, fid) => {
    const e = await ownExpense(me, fid, uuidParam(ctx.params.id));
    await query('UPDATE money_expenses SET deleted_at = COALESCE(deleted_at, now()) WHERE id=$1', [e.id]);
    return { ok: true };
  });
  F.post('/money/expenses/:id/restore', async (ctx, me, fid) => {
    const e = await ownExpense(me, fid, uuidParam(ctx.params.id));
    await query('UPDATE money_expenses SET deleted_at = NULL WHERE id=$1', [e.id]);
    return { ok: true };
  });

  F.post('/money/budget', async (ctx, me, fid) => {
    needManager(me);
    const v = ctx.body.budget === null || ctx.body.budget === '' ? 0 : amountOf(ctx.body.budget, { min: 0, field: 'Ngân sách' });
    await query('INSERT INTO money_settings(family_id, budget) VALUES($1,$2) ON CONFLICT (family_id) DO UPDATE SET budget=$2, updated_at=now()', [fid, v]);
    return { ok: true };
  });

  // CSV: chủ/quản lý xuất tất cả; thành viên chỉ khoản của mình. Ô bắt đầu bằng = + - @ được chặn (CSV injection).
  F.get('/money/export.csv', async (ctx, me, fid) => {
    if (isCon(me)) throw new ApiError(403, 'forbidden', 'Không có quyền xuất');
    const month = ctx.query.month && MONTH_RE.test(ctx.query.month) ? ctx.query.month : null;
    const mem = new Map((await activeMembers(fid)).map((m) => [m.id, m.name]));
    const rows = await query(
      `SELECT * FROM money_expenses WHERE family_id=$1 AND deleted_at IS NULL AND ($2::text IS NULL OR to_char(day,'YYYY-MM')=$2) AND ($3 OR created_by=$4 OR who=$4) ORDER BY day, created_at`, [fid, month, isManager(me), me.id]);
    const csv = toCsv(['Ngày', 'Số tiền (đồng)', 'Danh mục', 'Người chi', 'Ghi chú'], rows.map((r) => [r.day, Number(r.amount), CAT_LABEL[r.category], mem.get(r.who) || '', r.note]));
    ctx.noBump = true;
    return raw(csv, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="chi-tieu${month ? '-' + month : ''}.csv"`, 'cache-control': 'no-store' });
  });

  // ---------- khoản phải đóng ----------
  F.post('/money/dues', async (ctx, me, fid) => {
    needManager(me);
    const b = ctx.body;
    const r = await tx((c) => createDueItem(c, {
      familyId: fid, title: b.title, amount: b.amount, dueDate: b.dueDate, childId: b.childId || null, note: b.note,
      source: 'thu_cong', createdBy: me.id, withEvent: b.addToCalendar !== false,
    }));
    return { id: r.id };
  });
  F.post('/money/dues/:id', async (ctx, me, fid) => {
    needManager(me);
    const b = ctx.body;
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      const d = (await c.query('SELECT * FROM money_dues WHERE id=$1 AND family_id=$2 FOR UPDATE', [id, fid]))[0];
      if (!d) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản phải đóng');
      const sets = []; const vals = [id];
      const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
      if (b.title !== undefined) add('title', cleanText(b.title, { max: 100, min: 1, field: 'Tên khoản' }));
      if (b.amount !== undefined) add('amount', amountOf(b.amount, { min: 0 }));
      if (b.dueDate !== undefined) add('due_date', cleanDay(b.dueDate, 'Hạn đóng'));
      if (b.note !== undefined) add('note', cleanNote(b.note, { max: 300 }));
      if (b.paid === true) {
        add('paid_on', b.paidOn ? cleanDay(b.paidOn, 'Ngày đóng') : today());
        let payer = me.id;
        if (b.paidBy) { payer = uuidParam(b.paidBy); if (!(await c.query("SELECT 1 FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL AND external=false", [payer, fid])).length) throw bad('Người đóng'); }
        add('paid_by', payer);
        if (b.addExpense === true && !d.paid_on) {
          await c.query("INSERT INTO money_expenses(family_id, day, amount, category, who, note, created_by) VALUES($1,$2,$3,'hoc_hanh',$4,$5,$6)", [fid, today(), Number(d.amount) || 1, payer, d.title.slice(0, 100), me.id]);
        }
      } else if (b.paid === false) { add('paid_on', null); add('paid_by', null); }
      if (!sets.length) return { ok: true };
      await c.query(`UPDATE money_dues SET ${sets.join(', ')} WHERE id=$1`, vals);
      if (d.event_id && b.dueDate !== undefined) await c.query("UPDATE events SET start_date=$2 WHERE id=$1 AND source='money'", [d.event_id, b.dueDate]);
      if (d.event_id && b.title !== undefined) await c.query("UPDATE events SET title=$2 WHERE id=$1 AND source='money'", [d.event_id, `Hạn đóng: ${b.title}`.slice(0, 120)]);
      return { ok: true };
    });
  });
  F.del('/money/dues/:id', async (ctx, me, fid) => {
    needManager(me);
    const id = uuidParam(ctx.params.id);
    await tx(async (c) => {
      const d = (await c.query('DELETE FROM money_dues WHERE id=$1 AND family_id=$2 RETURNING event_id', [id, fid]))[0];
      if (!d) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản phải đóng');
      if (d.event_id) await c.query("DELETE FROM events WHERE id=$1 AND source='money'", [d.event_id]);
      await c.query('DELETE FROM hm_fires WHERE key LIKE $1', [`due:${id}:%`]);
    });
    return { ok: true };
  });

  // ---------- tiền tiêu vặt của con (chỉ sổ, không tiền thật) ----------
  async function kidOf(fid, cid) {
    const k = (await query('SELECT id FROM children WHERE id=$1 AND family_id=$2 AND archived_at IS NULL', [cid, fid]))[0];
    if (!k) throw new ApiError(404, 'not_found', 'Không tìm thấy con');
    return k;
  }
  F.post('/money/allowance/:cid', async (ctx, me, fid) => {
    needManager(me);
    const cid = uuidParam(ctx.params.cid); await kidOf(fid, cid);
    const b = ctx.body;
    const period = b.period === 'thang' ? 'thang' : 'tuan';
    await query(
      `INSERT INTO money_allowance(child_id, family_id, amount, period, goal_name, goal_amount) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT (child_id) DO UPDATE SET amount=$3, period=$4, goal_name=$5, goal_amount=$6, updated_at=now()`,
      [cid, fid, amountOf(b.amount ?? 0, { min: 0 }), period, cleanText(b.goalName ?? '', { max: 60, field: 'Mục tiêu' }), amountOf(b.goalAmount ?? 0, { min: 0, field: 'Số tiền mục tiêu' })]);
    return { ok: true };
  });
  // "Đã đưa kỳ này": mỗi kỳ (tuần/tháng) chỉ ghi một lần, bấm lại không cộng đôi
  F.post('/money/allowance/:cid/give', async (ctx, me, fid) => {
    needManager(me);
    const cid = uuidParam(ctx.params.cid); await kidOf(fid, cid);
    const a = (await query('SELECT * FROM money_allowance WHERE child_id=$1', [cid]))[0];
    if (!a || Number(a.amount) <= 0) throw new ApiError(409, 'not_configured', 'Hãy đặt số tiền tiêu vặt trước');
    const key = periodKey(today(), a.period);
    const r = await query(
      "INSERT INTO money_allowance_log(family_id, child_id, day, kind, amount, period_key, created_by) VALUES($1,$2,$3,'dua',$4,$5,$6) ON CONFLICT (child_id, period_key) WHERE period_key IS NOT NULL DO NOTHING RETURNING id",
      [fid, cid, today(), Number(a.amount), key, me.id]);
    if (!r.length) throw new ApiError(409, 'already_given', a.period === 'thang' ? 'Tháng này đã ghi đưa tiền rồi' : 'Tuần này đã ghi đưa tiền rồi');
    return { id: r[0].id };
  });
  F.post('/money/allowance/:cid/entries', async (ctx, me, fid) => {
    needManager(me);
    const cid = uuidParam(ctx.params.cid); await kidOf(fid, cid);
    const b = ctx.body;
    if (!['dua', 'chi', 'dieu_chinh'].includes(b.kind)) throw bad('Loại');
    let amount = b.kind === 'dieu_chinh'
      ? (Number.isSafeInteger(b.amount) && Math.abs(b.amount) <= MAX_VND && b.amount !== 0 ? b.amount : (() => { throw bad('Số tiền'); })())
      : amountOf(b.amount);
    if (b.kind === 'chi') amount = -amount;
    const day = cleanDay(b.day ?? today(), 'Ngày');
    if (day > today()) throw bad('Ngày', 'Ngày không được ở tương lai');
    const r = (await query('INSERT INTO money_allowance_log(family_id, child_id, day, kind, amount, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [fid, cid, day, b.kind, amount, cleanText(b.note ?? '', { max: 80, field: 'Ghi chú' }), me.id]))[0];
    return { id: r.id };
  });
  F.del('/money/allowance/entries/:id', async (ctx, me, fid) => {
    needManager(me);
    const r = await query('DELETE FROM money_allowance_log WHERE id=$1 AND family_id=$2 RETURNING 1', [uuidParam(ctx.params.id), fid]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Không tìm thấy dòng sổ');
    return { ok: true };
  });
}
