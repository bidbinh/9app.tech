import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireMember, forbidden, touch } from '../auth.js';
import { post } from './teams.js';
import { cleanText, cleanUrl, cleanDate, intIn, normKey, randomCode, todayVN, addDays, uuidParam, KINDS } from '../util.js';
import { splitMeal } from '../split.js';
import { canTransition } from '../machine.js';
import { recentKeys, pickRandom, suggestPayer } from '../venues.js';
import { buildSlip, reminderText } from '../slip.js';
import { transferContent } from '../transfer.js';
import { planPayerChange } from '../payee.js';

export const rng = { fn: Math.random }; // tiêm được trong kiểm thử

const unique = (e) => e && e.code === '23505';
// quản lý bữa: chủ nhóm, người tạo bữa, người ứng tiền, người chốt đơn
export const isManager = (me, meal) => me.role === 'chu' || meal.created_by === me.id || meal.payer_id === me.id || meal.orderer_id === me.id;
const bankOf = (m) => (m && m.bank_account ? { bin: m.bank_bin, account: m.bank_account, holder: m.bank_holder } : null);
const MAX_MONEY = 100_000_000;

export async function logEvent(c, { teamId, mealId = null, chargeId = null, actorId = null, action, detail = null }) {
  await c.query('INSERT INTO charge_events(team_id, meal_id, charge_id, actor_id, action, detail) VALUES($1,$2,$3,$4,$5,$6)',
    [teamId, mealId, chargeId, actorId, action, detail ? JSON.stringify(detail) : null]);
}

// ---------- khóa bữa ăn + tự chốt quán khi hết giờ ----------
async function proposalsWithVotes(c, mealId) {
  return c.query(
    `SELECT p.*, (SELECT count(*)::int FROM votes v WHERE v.proposal_id = p.id) AS votes
       FROM proposals p WHERE p.meal_id = $1 ORDER BY votes DESC, p.created_at, p.id`, [mealId]);
}

async function applyVenue(c, meal, proposal) {
  await c.query("UPDATE meals SET venue_id=$2, venue_name=$3, status='dat_mon' WHERE id=$1", [meal.id, proposal.id, proposal.name]);
}

// read=true: đọc không khóa hàng (thăm dò định kỳ không chặn thao tác ghi); chỉ khóa khi phải tự chốt quán vì hết giờ
export async function lockMeal(c, ctx, mealId, { read = false } = {}) {
  const sel = (lock) => c.query(`SELECT * FROM meals WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [mealId]);
  let meal = (await sel(!read))[0];
  if (!meal) throw new ApiError(404, 'not_found', 'Không tìm thấy bữa ăn này');
  const me = await requireMember(c.query, ctx, meal.team_id);
  const due = (m) => m.status === 'binh_chon' && m.vote_deadline && new Date(m.vote_deadline) <= new Date();
  if (due(meal)) {
    if (read) meal = (await sel(true))[0];
    if (due(meal)) {
      const top = (await proposalsWithVotes(c, meal.id))[0];
      if (top) { await applyVenue(c, meal, top); meal = (await sel(false))[0]; }
    }
  }
  return { meal, me };
}

const voteOpen = (m) => m.status === 'binh_chon' && !(m.vote_deadline && new Date(m.vote_deadline) <= new Date());
const orderOpen = (m) => m.status === 'dat_mon' && !m.locked_at && !(m.order_deadline && new Date(m.order_deadline) <= new Date());

// ---------- dựng dữ liệu hiển thị ----------
async function mealView(c, meal, me) {
  const id = meal.id;
  const team = (await c.query('SELECT id, name, round500 FROM teams WHERE id=$1', [meal.team_id]))[0];
  const members = await c.query('SELECT * FROM members WHERE team_id=$1 AND (left_at IS NULL OR id IN (SELECT member_id FROM items WHERE meal_id=$2 UNION SELECT member_id FROM charges WHERE meal_id=$2 UNION SELECT payee_id FROM charges WHERE meal_id=$2)) ORDER BY joined_at, seq', [meal.team_id, id]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const nameOf = (mid) => (byId.get(mid) ? byId.get(mid).name + (byId.get(mid).left_at ? ' (đã rời nhóm)' : '') : 'Người đã rời');
  const props = await proposalsWithVotes(c, id);
  const votes = await c.query('SELECT member_id, proposal_id FROM votes WHERE meal_id=$1', [id]);
  const items = await c.query('SELECT * FROM items WHERE meal_id=$1 ORDER BY seq', [id]);
  const charges = await c.query('SELECT * FROM charges WHERE meal_id=$1 ORDER BY seq', [id]);
  const ratings = await c.query('SELECT member_id, value FROM meal_ratings WHERE meal_id=$1', [id]);
  const myVote = votes.find((v) => v.member_id === me.id);
  const payer = meal.payer_id ? byId.get(meal.payer_id) : null;
  const venue = meal.venue_id ? props.find((p) => p.id === meal.venue_id) : null;

  const itemList = items.map((i) => ({
    id: i.id, memberId: i.member_id, memberName: nameOf(i.member_id), name: i.name, price: Number(i.price), qty: i.qty, note: i.note, mine: i.member_id === me.id,
  }));
  const fees = { ship: Number(meal.fee_ship), service: Number(meal.fee_service), tip: Number(meal.fee_tip), discount: Number(meal.discount) };
  const split = splitMeal({ items: items.map((i) => ({ memberId: i.member_id, price: Number(i.price), qty: i.qty })), fees, mode: meal.split_mode, round500: team.round500, payerId: meal.payer_id });
  const slip = buildSlip(items.map((i) => ({ name: i.name, price: Number(i.price), qty: i.qty, note: i.note })), { venue: meal.venue_name || '', day: String(meal.day).slice(0, 10), kind: meal.kind });

  const dayStr = typeof meal.day === 'string' ? meal.day : meal.day.toISOString().slice(0, 10);
  const view = {
    id, teamId: meal.team_id, teamName: team.name, day: dayStr, status: meal.status, code: meal.code, kind: meal.kind,
    orderUrl: meal.order_url, locked: !!meal.locked_at,
    orderer: (meal.orderer_id || meal.payer_id) ? { id: meal.orderer_id || meal.payer_id, name: nameOf(meal.orderer_id || meal.payer_id), isDefault: !meal.orderer_id } : null,
    voteDeadline: meal.vote_deadline, orderDeadline: meal.order_deadline,
    voteOpen: voteOpen(meal), orderOpen: orderOpen(meal),
    fees, splitMode: meal.split_mode, round500: team.round500,
    payer: payer ? { id: payer.id, name: nameOf(payer.id), hasBank: !!payer.bank_account } : null,
    venue: meal.venue_name ? { id: meal.venue_id, name: meal.venue_name, url: venue ? venue.url : '', note: venue ? venue.note : '' } : null,
    me: { id: me.id, name: me.name, role: me.role, hasBank: !!me.bank_account },
    canManage: isManager(me, meal),
    canChangePayer: me.role === 'chu' || meal.created_by === me.id || meal.payer_id === me.id,
    isPayer: meal.payer_id === me.id,
    members: members.filter((m) => !m.left_at).map((m) => ({ id: m.id, name: m.name, hasBank: !!m.bank_account })),
    proposals: props.map((p) => ({
      id: p.id, name: p.name, url: p.url, note: p.note, votes: p.votes,
      voters: votes.filter((v) => v.proposal_id === p.id).map((v) => nameOf(v.member_id)),
      mine: !!myVote && myVote.proposal_id === p.id,
      canDelete: p.created_by === me.id || isManager(me, meal),
      byName: p.created_by ? nameOf(p.created_by) : '',
    })),
    items: itemList,
    slip,
    preview: {
      foodTotal: split.foodTotal, gross: split.gross, discountApplied: split.discountApplied, total: split.total, surplus: split.surplus,
      shares: split.shares.map((s) => ({ memberId: s.memberId, name: nameOf(s.memberId), food: s.food, extra: s.extra, amount: s.amount, rounded: s.rounded })),
    },
    ratings: { up: ratings.filter((r) => r.value === 1).length, down: ratings.filter((r) => r.value === -1).length, mine: (ratings.find((r) => r.member_id === me.id) || {}).value || 0 },
  };

  if (meal.status === 'thanh_toan' || meal.status === 'xong') {
    const pc = (await c.query("SELECT id, at, detail FROM charge_events WHERE meal_id=$1 AND action='doi_nguoi_ung' ORDER BY id DESC LIMIT 1", [id]))[0];
    view.payerChange = pc ? { id: Number(pc.id), at: pc.at, fromName: nameOf(pc.detail.from), toName: nameOf(pc.detail.to), toMe: pc.detail.to === me.id, fromMe: pc.detail.from === me.id } : null;
    view.charges = charges.map((ch) => {
      const isSelf = ch.member_id === ch.payee_id;
      const involved = ch.member_id === me.id || ch.payee_id === me.id;
      const out = {
        id: ch.id, memberId: ch.member_id, memberName: nameOf(ch.member_id), payeeId: ch.payee_id, payeeName: nameOf(ch.payee_id),
        food: Number(ch.food), amount: Number(ch.amount), status: ch.status, isSelf, qrGen: ch.qr_gen,
        payeeChanged: !!ch.payee_changed_at && ch.status === 'chua_tra', inNetting: !!ch.netting_id && ch.status === 'chua_tra',
        settledByNetting: ch.settled_by_netting, mine: ch.member_id === me.id, toMe: ch.payee_id === me.id,
      };
      if (involved && !isSelf && ch.payee_bin) {
        out.pay = { content: ch.content, bin: ch.payee_bin, account: ch.payee_account, holder: ch.payee_holder, qrUrl: `api/charges/${ch.id}/qr.png?v=${ch.qr_gen}`, qrSvgUrl: `api/charges/${ch.id}/qr.svg?v=${ch.qr_gen}` };
      }
      return out;
    });
    const held = new Map();
    for (const ch of charges) {
      if (ch.member_id !== ch.payee_id && ch.payee_id !== meal.payer_id && ch.status !== 'chua_tra') held.set(ch.payee_id, (held.get(ch.payee_id) || 0) + Number(ch.amount));
    }
    view.heldByOldPayees = [...held].map(([pid, amount]) => ({ payeeId: pid, payeeName: nameOf(pid), amount }));
    if (payer && payer.id === me.id) {
      view.reminders = charges.filter((ch) => ch.payee_id === me.id && ch.member_id !== me.id && ch.status !== 'da_nhan').map((ch) => ({
        chargeId: ch.id, memberId: ch.member_id, name: nameOf(ch.member_id), amount: Number(ch.amount),
        text: reminderText({ name: nameOf(ch.member_id), amount: Number(ch.amount), payerName: me.name, venue: meal.venue_name || '', day: dayStr }),
      }));
    }
  }

  if (meal.status === 'binh_chon' || meal.status === 'dat_mon') {
    const cand = members.filter((m) => !m.left_at && (items.length === 0 || items.some((i) => i.member_id === m.id)));
    const adv = await c.query(
      `SELECT m.payer_id AS member_id, m.day::text AS day, COALESCE(SUM(ch.amount),0)::bigint AS amount
         FROM meals m LEFT JOIN charges ch ON ch.meal_id = m.id WHERE m.team_id=$1 AND m.status IN ('thanh_toan','xong') AND m.payer_id IS NOT NULL AND m.day >= ($2::date - 30) GROUP BY m.id`, [meal.team_id, todayVN()]);
    const s = suggestPayer(cand.map((m) => ({ id: m.id, joinedAt: m.joined_at.toISOString(), hasBank: !!m.bank_account })),
      adv.map((a) => ({ memberId: a.member_id, day: a.day, amount: Number(a.amount) })), todayVN());
    if (s) view.suggestedPayer = { id: s.id, name: nameOf(s.id), reason: s.reason };
  }
  if (meal.status === 'dat_mon' && meal.venue_name && !itemList.some((i) => i.mine)) {
    const prev = await previousItems(c, meal, me);
    view.repeat = prev.length ? { count: prev.length, names: prev.slice(0, 3).map((p) => p.name) } : null;
  }
  return view;
}

async function previousItems(c, meal, me) {
  const meals = await c.query(
    `SELECT m.id, m.venue_name FROM meals m WHERE m.team_id=$1 AND m.id<>$2 AND m.venue_name IS NOT NULL AND m.kind=$4
        AND EXISTS (SELECT 1 FROM items i WHERE i.meal_id = m.id AND i.member_id = $3) ORDER BY m.day DESC, m.created_at DESC LIMIT 30`, [meal.team_id, meal.id, me.id, meal.kind]);
  const hit = meals.find((m) => normKey(m.venue_name) === normKey(meal.venue_name));
  if (!hit) return [];
  return c.query('SELECT name, price, qty, note FROM items WHERE meal_id=$1 AND member_id=$2 ORDER BY seq', [hit.id, me.id]);
}

const getView = (ctx, mealId) => tx(async (c) => {
  const { meal, me } = await lockMeal(c, ctx, mealId, { read: true });
  return { meal: await mealView(c, meal, me) };
});

// ---------- tạo các khoản thu khi sang bước thu tiền ----------
async function createCharges(c, meal, me) {
  const team = (await c.query('SELECT round500 FROM teams WHERE id=$1', [meal.team_id]))[0];
  const items = await c.query('SELECT member_id, price, qty FROM items WHERE meal_id=$1', [meal.id]);
  if (!items.length) throw new ApiError(409, 'no_items', 'Chưa ai gọi món nên chưa chia tiền được');
  const payer = (await c.query('SELECT * FROM members WHERE id=$1', [meal.payer_id]))[0];
  const split = splitMeal({
    items: items.map((i) => ({ memberId: i.member_id, price: Number(i.price), qty: i.qty })),
    fees: { ship: Number(meal.fee_ship), service: Number(meal.fee_service), tip: Number(meal.fee_tip), discount: Number(meal.discount) },
    mode: meal.split_mode, round500: team.round500, payerId: meal.payer_id,
  });
  const order = await c.query('SELECT id FROM members WHERE id = ANY($1) ORDER BY seq', [split.shares.map((s) => s.memberId)]);
  const seqOf = new Map(order.map((m, i) => [m.id, i + 1]));
  for (const s of split.shares) {
    const self = s.memberId === payer.id;
    const settled = self || s.amount === 0;
    const seq = seqOf.get(s.memberId);
    const ch = (await c.query(
      `INSERT INTO charges(meal_id, member_id, payee_id, seq, food, amount, status, content, payee_bin, payee_account, payee_holder, received_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, $12) RETURNING id`,
      [meal.id, s.memberId, payer.id, seq, s.food, s.amount, settled ? 'da_nhan' : 'chua_tra', self ? '' : transferContent({ mealCode: meal.code, seq }),
        self ? null : payer.bank_bin, self ? null : payer.bank_account, self ? null : payer.bank_holder, settled ? new Date() : null]))[0];
    await logEvent(c, { teamId: meal.team_id, mealId: meal.id, chargeId: ch.id, actorId: me.id, action: 'tao_khoan', detail: { amount: s.amount, payee: payer.id } });
  }
}

async function changePayerAfterPayment(c, meal, me, newPayer) {
  if (!newPayer.bank_account) throw new ApiError(409, 'payer_no_bank', `${newPayer.name} chưa lưu tài khoản nhận tiền. Mở "Tài khoản nhận tiền" để nhập, hoặc chọn người khác.`, { payerId: newPayer.id });
  const charges = await c.query('SELECT * FROM charges WHERE meal_id=$1 ORDER BY id FOR UPDATE', [meal.id]);
  if (charges.some((ch) => ch.netting_id && ch.status === 'chua_tra')) {
    throw new ApiError(409, 'in_netting', 'Có khoản của bữa này đang nằm trong một phiên bù trừ. Hoàn tất hoặc hủy phiên bù trừ trước khi đổi người ứng tiền.');
  }
  await logEvent(c, { teamId: meal.team_id, mealId: meal.id, actorId: me.id, action: 'doi_nguoi_ung', detail: { from: meal.payer_id, to: newPayer.id } });
  const plan = planPayerChange(charges.map((ch) => ({ id: ch.id, memberId: ch.member_id, payeeId: ch.payee_id, status: ch.status, amount: Number(ch.amount) })), meal.payer_id, newPayer.id);
  for (const p of plan) {
    if (p.action === 'keep') continue;
    const ch = charges.find((x) => x.id === p.id);
    if (p.action === 'self') {
      await c.query("UPDATE charges SET payee_id=$2, status='da_nhan', received_at=now(), payee_bin=NULL, payee_account=NULL, payee_holder=NULL, content='', payee_changed_at=now() WHERE id=$1", [ch.id, newPayer.id]);
    } else {
      const content = ch.content || transferContent({ mealCode: meal.code, seq: ch.seq });
      await c.query(
        `UPDATE charges SET payee_id=$2, status='chua_tra', received_at=NULL, marked_at=NULL, payee_bin=$3, payee_account=$4, payee_holder=$5,
                content=$6, qr_gen=qr_gen+1, payee_changed_at=now() WHERE id=$1`,
        [ch.id, newPayer.id, newPayer.bank_bin, newPayer.bank_account, newPayer.bank_holder, content]);
    }
    await logEvent(c, { teamId: meal.team_id, mealId: meal.id, chargeId: ch.id, actorId: me.id, action: 'doi_nguoi_nhan_' + p.action, detail: { from: meal.payer_id, to: newPayer.id } });
  }
}

export function mealRoutes(app) {
  // ---------- tạo bữa ----------
  post(app, '/api/teams/:id/meals', async (ctx) => {
    const teamId = uuidParam(ctx.params.id);
    const b = ctx.body;
    const today = todayVN();
    const day = b.day === undefined ? today : String(b.day);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < addDays(today, -1) || day > addDays(today, 14)) throw new ApiError(400, 'invalid_input', 'Ngày không hợp lệ (chọn từ hôm qua đến 14 ngày tới)');
    const vd = cleanDate(b.voteDeadline, 'Giờ chốt bình chọn');
    const od = cleanDate(b.orderDeadline, 'Giờ chốt đặt món');
    const kind = b.kind === undefined ? 'trua' : b.kind;
    if (!KINDS.includes(kind)) throw new ApiError(400, 'invalid_input', 'Loại bữa không hợp lệ');
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [teamId]);
      const me = await requireMember(c.query, ctx, teamId);
      const open = (await c.query("SELECT id FROM meals WHERE team_id=$1 AND day=$2 AND kind=$3 AND status IN ('binh_chon','dat_mon')", [teamId, day, kind]))[0];
      if (open) throw new ApiError(409, 'meal_exists', 'Nhóm đã có một bữa cùng loại đang diễn ra trong ngày này, vào đó nhé.', { mealId: open.id });
      const perDay = (await c.query('SELECT count(*)::int n FROM meals WHERE team_id=$1 AND day=$2', [teamId, day]))[0].n;
      if (perDay >= config.maxMealsPerDay) throw new ApiError(429, 'too_many_meals', `Mỗi nhóm tối đa ${config.maxMealsPerDay} bữa mỗi ngày`);
      const openN = (await c.query("SELECT count(*)::int n FROM meals WHERE team_id=$1 AND status IN ('binh_chon','dat_mon','thanh_toan')", [teamId]))[0].n;
      if (openN >= config.maxOpenMeals) throw new ApiError(429, 'too_many_meals', `Nhóm đang có quá nhiều bữa chưa xong (tối đa ${config.maxOpenMeals}). Hãy hoàn tất hoặc hủy bớt.`);
      for (let i = 0; i < 6; i++) {
        try {
          await c.query('SAVEPOINT s');
          const m = (await c.query('INSERT INTO meals(team_id, day, kind, code, vote_deadline, order_deadline, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [teamId, day, kind, randomCode(5), vd, od, me.id]))[0];
          return { mealId: m.id };
        } catch (e) { if (!unique(e)) throw e; await c.query('ROLLBACK TO SAVEPOINT s'); }
      }
      throw new ApiError(500, 'internal', 'Không tạo được bữa, thử lại');
    });
  });

  app.route('GET', '/api/meals/:id', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const out = await getView(ctx, id);
    await touch(ctx);
    return out;
  });

  // ---------- cài đặt bữa: người ứng tiền, giờ chốt, phí, cách chia ----------
  post(app, '/api/meals/:id/settings', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const b = ctx.body;
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (meal.status === 'huy' || meal.status === 'xong') throw new ApiError(409, 'meal_closed', 'Bữa này đã kết thúc nên không sửa được nữa');
      const manager = isManager(me, meal);
      const pre = meal.status === 'binh_chon' || meal.status === 'dat_mon';
      const sets = []; const vals = [id];
      const set = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };

      if ('payerId' in b) {
        const target = b.payerId === undefined ? null : b.payerId;
        if (target !== null && target !== undefined) uuidParam(target);
        const payerAdmin = me.role === 'chu' || meal.created_by === me.id || meal.payer_id === me.id;
        if (meal.status === 'thanh_toan' && !payerAdmin) throw forbidden('Đã sang bước thu tiền: chỉ chủ nhóm, người tạo bữa hoặc người ứng tiền hiện tại mới đổi được người nhận tiền');
        if (target === null && !(manager && pre)) throw forbidden('Chỉ chủ nhóm hoặc người tạo bữa mới bỏ chọn người ứng tiền');
        if (target && target !== me.id && !manager) throw forbidden('Bạn chỉ có thể nhận ứng tiền cho chính mình, hoặc nhờ chủ nhóm đổi giúp');
        if (target && target === me.id && !manager && meal.payer_id) throw forbidden('Bữa này đã có người ứng tiền. Nhờ chủ nhóm hoặc người ứng tiền đổi giúp nếu cần.');
        if (target) {
          const np = (await c.query('SELECT * FROM members WHERE id=$1 AND team_id=$2 AND left_at IS NULL', [target, meal.team_id]))[0];
          if (!np) throw new ApiError(400, 'invalid_input', 'Người ứng tiền phải là thành viên của nhóm');
          if (np.id !== meal.payer_id) {
            if (meal.status === 'thanh_toan') await changePayerAfterPayment(c, meal, me, np);
            set('payer_id', np.id);
          }
        } else if (meal.payer_id) set('payer_id', null);
      }
      if ('ordererId' in b) {
        const target = b.ordererId === undefined ? null : b.ordererId;
        if (target !== null) uuidParam(target);
        if (!pre) throw new ApiError(409, 'locked', 'Bữa này đã sang bước thu tiền nên không đổi người chốt đơn nữa');
        if (target && target !== me.id && !manager) throw forbidden('Bạn chỉ nhận chốt đơn cho chính mình, hoặc nhờ chủ nhóm chọn giúp');
        if (target && target === me.id && !manager && (meal.orderer_id || meal.payer_id)) throw forbidden('Bữa này đã có người chốt đơn. Nhờ chủ nhóm hoặc người đó đổi giúp nếu cần.');
        if (target === null && !manager) throw forbidden('Chỉ chủ nhóm hoặc người tạo bữa mới đặt lại người chốt đơn');
        if (target) {
          const np = (await c.query('SELECT id FROM members WHERE id=$1 AND team_id=$2 AND left_at IS NULL', [target, meal.team_id]))[0];
          if (!np) throw new ApiError(400, 'invalid_input', 'Người chốt đơn phải là thành viên của nhóm');
        }
        set('orderer_id', target);
      }
      if ('orderUrl' in b) {
        if (!manager) throw forbidden('Chỉ người quản lý bữa mới dán được link đặt món');
        set('order_url', cleanUrl(b.orderUrl));
      }
      if ('voteDeadline' in b || 'orderDeadline' in b || 'fees' in b || 'splitMode' in b) {
        if (!manager) throw forbidden('Chỉ chủ nhóm, người tạo bữa hoặc người ứng tiền mới sửa phần này');
      }
      if ('voteDeadline' in b) set('vote_deadline', cleanDate(b.voteDeadline, 'Giờ chốt bình chọn'));
      if ('orderDeadline' in b) set('order_deadline', cleanDate(b.orderDeadline, 'Giờ chốt đặt món'));
      if ('fees' in b || 'splitMode' in b) {
        if (!pre) throw new ApiError(409, 'locked', 'Đã sang bước thu tiền nên không sửa phí hay cách chia nữa. Bấm "Quay lại sửa" nếu cần.');
        const f = b.fees || {};
        const cols = { ship: 'fee_ship', service: 'fee_service', tip: 'fee_tip', discount: 'discount' };
        const names = { ship: 'Phí giao hàng', service: 'Phí dịch vụ', tip: 'Tiền boa', discount: 'Giảm giá' };
        for (const k of Object.keys(cols)) if (k in f) set(cols[k], intIn(f[k], { min: 0, max: MAX_MONEY, field: names[k] }));
        if ('splitMode' in b) {
          if (!['ty_le', 'chia_deu'].includes(b.splitMode)) throw new ApiError(400, 'invalid_input', 'Cách chia không hợp lệ');
          set('split_mode', b.splitMode);
        }
      }
      if (sets.length) await c.query(`UPDATE meals SET ${sets.join(', ')} WHERE id=$1`, vals);
      const fresh = (await c.query('SELECT * FROM meals WHERE id=$1', [id]))[0];
      return { meal: await mealView(c, fresh, me) };
    });
  });

  // ---------- đề xuất quán và bình chọn ----------
  post(app, '/api/meals/:id/proposals', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const name = cleanText(ctx.body.name, { max: config.maxNameLen, min: 1, field: 'Tên quán' });
    const url = cleanUrl(ctx.body.url);
    const note = cleanText(ctx.body.note, { max: 120, field: 'Ghi chú' });
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (meal.status !== 'binh_chon') throw new ApiError(409, 'locked', 'Đã chốt quán rồi nên không thêm đề xuất được nữa');
      const n = (await c.query('SELECT count(*)::int n FROM proposals WHERE meal_id=$1', [id]))[0].n;
      if (n >= config.maxProposals) throw new ApiError(409, 'too_many', `Mỗi bữa tối đa ${config.maxProposals} quán`);
      const key = normKey(name);
      if (!key) throw new ApiError(400, 'invalid_input', 'Tên quán cần có chữ hoặc số');
      const dup = (await c.query('SELECT id FROM proposals WHERE meal_id=$1 AND name_key=$2', [id, key]))[0];
      if (dup) return { proposalId: dup.id, already: true };
      const p = (await c.query('INSERT INTO proposals(meal_id, team_id, name, name_key, kind, url, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [id, meal.team_id, name, key, meal.kind, url, note, me.id]))[0];
      return { proposalId: p.id };
    });
  });

  app.route('DELETE', '/api/proposals/:pid', async (ctx) => {
    const pid = uuidParam(ctx.params.pid);
    const p = (await query('SELECT meal_id FROM proposals WHERE id=$1', [pid]))[0];
    if (!p) throw new ApiError(404, 'not_found', 'Không tìm thấy quán này');
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, p.meal_id);
      const row = (await c.query('SELECT * FROM proposals WHERE id=$1', [pid]))[0];
      if (!row) return { ok: true };
      if (meal.status !== 'binh_chon') throw new ApiError(409, 'locked', 'Đã chốt quán rồi nên không xóa đề xuất được nữa');
      if (row.created_by !== me.id && !isManager(me, meal)) throw forbidden('Bạn chỉ xóa được quán do mình đề xuất');
      await c.query('DELETE FROM proposals WHERE id=$1', [pid]);
      return { ok: true };
    });
  });

  post(app, '/api/meals/:id/vote', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const pid = ctx.body.proposalId;
    if (pid !== null && pid !== undefined) uuidParam(pid);
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (!voteOpen(meal)) throw new ApiError(409, 'vote_closed', meal.status === 'binh_chon' ? 'Đã hết giờ bình chọn' : 'Đã chốt quán rồi nên không đổi phiếu được nữa');
      if (!pid) { await c.query('DELETE FROM votes WHERE meal_id=$1 AND member_id=$2', [id, me.id]); return { ok: true }; }
      const p = (await c.query('SELECT id FROM proposals WHERE id=$1 AND meal_id=$2', [pid, id]))[0];
      if (!p) throw new ApiError(404, 'not_found', 'Không tìm thấy quán này');
      await c.query('INSERT INTO votes(meal_id, member_id, proposal_id) VALUES($1,$2,$3) ON CONFLICT (meal_id, member_id) DO UPDATE SET proposal_id = EXCLUDED.proposal_id', [id, me.id, pid]);
      return { ok: true };
    });
  });

  // gợi ý ngẫu nhiên: bốc một quán từ danh sách quán của nhóm, bỏ các quán đã ăn trong 3 ngày gần nhất
  post(app, '/api/meals/:id/random', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (meal.status !== 'binh_chon') throw new ApiError(409, 'locked', 'Đã chốt quán rồi');
      const pool = await c.query(
        `SELECT DISTINCT ON (name_key) name, name_key, url, note FROM proposals WHERE team_id=$1 AND kind=$2 ORDER BY name_key, created_at DESC`, [meal.team_id, meal.kind]);
      const hist = await c.query("SELECT venue_name AS name, day::text AS day FROM meals WHERE team_id=$1 AND kind=$2 AND venue_name IS NOT NULL AND status IN ('dat_mon','thanh_toan','xong')", [meal.team_id, meal.kind]);
      const exclude = recentKeys(hist, todayVN());
      for (const p of await c.query('SELECT name_key FROM proposals WHERE meal_id=$1', [id])) exclude.add(p.name_key);
      if (!pool.length) throw new ApiError(409, 'no_venues', 'Nhóm chưa có quán nào trong danh sách. Hãy thêm vài quán trước.');
      const pick = pickRandom(pool, { excludeKeys: exclude, rand: rng.fn });
      if (!pick) throw new ApiError(409, 'no_venues', 'Các quán của nhóm đều đã được đề xuất hoặc vừa ăn trong 3 ngày qua. Hãy thêm quán mới.');
      const n = (await c.query('SELECT count(*)::int n FROM proposals WHERE meal_id=$1', [id]))[0].n;
      if (n >= config.maxProposals) throw new ApiError(409, 'too_many', `Mỗi bữa tối đa ${config.maxProposals} quán`);
      const p = (await c.query('INSERT INTO proposals(meal_id, team_id, name, name_key, kind, url, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [id, meal.team_id, pick.name, normKey(pick.name), meal.kind, pick.url, pick.note, me.id]))[0];
      return { proposalId: p.id, name: pick.name };
    });
  });

  // ---------- chuyển bước ----------
  post(app, '/api/meals/:id/status', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const to = String(ctx.body.to || '');
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (meal.status === to) return { meal: await mealView(c, meal, me) }; // bấm hai lần: giữ nguyên
      if (!canTransition(meal.status, to)) throw new ApiError(409, 'bad_transition', 'Bữa này không chuyển sang bước đó được nữa. Tải lại trang để xem trạng thái mới.');
      if (!isManager(me, meal)) throw forbidden('Chỉ chủ nhóm, người tạo bữa hoặc người ứng tiền mới chuyển bước được');
      if (meal.status === 'binh_chon' && to === 'dat_mon') {
        const props = await proposalsWithVotes(c, id);
        const want = ctx.body.proposalId;
        let pick = props[0];
        if (want) { uuidParam(want); pick = props.find((p) => p.id === want); if (!pick) throw new ApiError(404, 'not_found', 'Không tìm thấy quán này'); }
        if (!pick) throw new ApiError(409, 'no_proposals', 'Chưa có quán nào được đề xuất. Hãy thêm ít nhất một quán.');
        await applyVenue(c, meal, pick);
      } else if (meal.status === 'dat_mon' && to === 'binh_chon') {
        const n = (await c.query('SELECT count(*)::int n FROM items WHERE meal_id=$1', [id]))[0].n;
        if (n) throw new ApiError(409, 'has_items', 'Đã có người gọi món nên không đổi quán được. Hãy xóa hết món hoặc hủy bữa.');
        await c.query("UPDATE meals SET status='binh_chon', venue_id=NULL, venue_name=NULL, vote_deadline=NULL WHERE id=$1", [id]);
      } else if (to === 'thanh_toan') {
        if (!meal.payer_id) throw new ApiError(409, 'no_payer', 'Chọn người ứng tiền trước khi sang bước thu tiền.');
        const payer = (await c.query('SELECT * FROM members WHERE id=$1', [meal.payer_id]))[0];
        if (!payer.bank_account) throw new ApiError(409, 'payer_no_bank', `${payer.name} chưa lưu tài khoản nhận tiền. ${payer.id === me.id ? 'Hãy nhập tài khoản của bạn' : 'Nhờ ' + payer.name + ' nhập tài khoản của họ'}, hoặc đổi người ứng tiền.`, { payerId: payer.id });
        await createCharges(c, meal, me);
        await c.query("UPDATE meals SET status='thanh_toan', payment_at=now() WHERE id=$1", [id]);
      } else if (meal.status === 'thanh_toan' && to === 'dat_mon') {
        const ch = await c.query('SELECT * FROM charges WHERE meal_id=$1 FOR UPDATE', [id]);
        if (ch.some((x) => x.member_id !== x.payee_id && (x.status !== 'chua_tra' || x.netting_id))) {
          throw new ApiError(409, 'has_payments', 'Đã có người báo chuyển tiền hoặc khoản nằm trong phiên bù trừ nên không quay lại sửa được.');
        }
        await c.query('DELETE FROM charges WHERE meal_id=$1', [id]);
        await logEvent(c, { teamId: meal.team_id, mealId: id, actorId: me.id, action: 'quay_lai_dat_mon' });
        await c.query("UPDATE meals SET status='dat_mon', payment_at=NULL WHERE id=$1", [id]);
      } else if (to === 'xong') {
        await c.query("UPDATE meals SET status='xong', done_at=now() WHERE id=$1", [id]);
      } else if (to === 'huy') {
        await c.query("UPDATE meals SET status='huy' WHERE id=$1", [id]);
      }
      return { meal: await mealView(c, (await c.query('SELECT * FROM meals WHERE id=$1', [id]))[0], me) };
    });
  });

  // ---------- gom món ----------
  function itemInput(b) {
    return {
      name: cleanText(b.name, { max: config.maxNameLen, min: 1, field: 'Tên món' }),
      price: intIn(b.price, { min: 0, max: 10_000_000, field: 'Giá món' }),
      qty: intIn(b.qty ?? 1, { min: 1, max: 99, field: 'Số lượng' }),
      note: cleanText(b.note, { max: 160, field: 'Ghi chú' }),
    };
  }

  post(app, '/api/meals/:id/items', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const it = itemInput(ctx.body);
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (!orderOpen(meal)) throw new ApiError(409, 'order_closed', meal.status === 'dat_mon' ? 'Đã hết giờ chốt đặt món' : 'Bữa này chưa đến lúc gọi món hoặc đã chốt');
      const n = (await c.query('SELECT count(*)::int n FROM items WHERE meal_id=$1 AND member_id=$2', [id, me.id]))[0].n;
      if (n >= config.maxItemsPerMember) throw new ApiError(409, 'too_many', `Mỗi người tối đa ${config.maxItemsPerMember} dòng món`);
      const r = (await c.query('INSERT INTO items(meal_id, member_id, name, price, qty, note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [id, me.id, it.name, it.price, it.qty, it.note]))[0];
      return { itemId: r.id };
    });
  });

  post(app, '/api/meals/:id/items/repeat', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (!orderOpen(meal)) throw new ApiError(409, 'order_closed', 'Bữa này đang không nhận món');
      const has = (await c.query('SELECT count(*)::int n FROM items WHERE meal_id=$1 AND member_id=$2', [id, me.id]))[0].n;
      if (has) throw new ApiError(409, 'already_has_items', 'Bạn đã có món trong bữa này rồi');
      const prev = await previousItems(c, meal, me);
      if (!prev.length) throw new ApiError(409, 'no_history', 'Bạn chưa từng gọi món ở quán này nên chưa có "như thường lệ"');
      for (const p of prev.slice(0, config.maxItemsPerMember)) {
        await c.query('INSERT INTO items(meal_id, member_id, name, price, qty, note) VALUES($1,$2,$3,$4,$5,$6)', [id, me.id, p.name, p.price, p.qty, p.note]);
      }
      return { added: Math.min(prev.length, config.maxItemsPerMember) };
    });
  });

  async function withItem(ctx, fn) {
    const iid = uuidParam(ctx.params.iid);
    const it0 = (await query('SELECT meal_id FROM items WHERE id=$1', [iid]))[0];
    if (!it0) throw new ApiError(404, 'not_found', 'Không tìm thấy món này (có thể đã được xóa)');
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, it0.meal_id);
      const it = (await c.query('SELECT * FROM items WHERE id=$1', [iid]))[0];
      if (!it) throw new ApiError(404, 'not_found', 'Không tìm thấy món này (có thể đã được xóa)');
      if (it.member_id !== me.id) throw forbidden('Bạn chỉ sửa hoặc xóa được món của chính mình');
      if (!orderOpen(meal)) throw new ApiError(409, 'order_closed', 'Đã chốt đặt món nên không sửa được nữa');
      return fn(c, it);
    });
  }
  post(app, '/api/items/:iid', async (ctx) => {
    const it = itemInput(ctx.body);
    return withItem(ctx, async (c, row) => {
      await c.query('UPDATE items SET name=$2, price=$3, qty=$4, note=$5 WHERE id=$1', [row.id, it.name, it.price, it.qty, it.note]);
      return { ok: true };
    });
  });
  app.route('DELETE', '/api/items/:iid', (ctx) => withItem(ctx, async (c, row) => { await c.query('DELETE FROM items WHERE id=$1', [row.id]); return { ok: true }; }));

  // ---------- chốt đơn: khóa danh sách món để người chốt đặt ở quán/sàn (app không đặt món hộ, không có API đặt món cho cá nhân) ----------
  post(app, '/api/meals/:id/lock', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const want = ctx.body.locked !== false;
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (meal.status !== 'dat_mon') throw new ApiError(409, 'bad_state', 'Chỉ chốt đơn được khi đang ở bước gọi món');
      if (!isManager(me, meal)) throw forbidden('Chỉ chủ nhóm, người tạo bữa, người ứng tiền hoặc người chốt đơn mới chốt được');
      if (want && !meal.locked_at) {
        const n = (await c.query('SELECT count(*)::int n FROM items WHERE meal_id=$1', [id]))[0].n;
        if (!n) throw new ApiError(409, 'no_items', 'Chưa ai gọi món nên chưa chốt đơn được');
      }
      await c.query('UPDATE meals SET locked_at = CASE WHEN $2 THEN COALESCE(locked_at, now()) ELSE NULL END WHERE id=$1', [id, want]);
      return { meal: await mealView(c, (await c.query('SELECT * FROM meals WHERE id=$1', [id]))[0], me) };
    });
  });

  // ---------- đánh giá quán một chạm ----------
  post(app, '/api/meals/:id/rating', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const v = ctx.body.value;
    if (![-1, 0, 1].includes(v)) throw new ApiError(400, 'invalid_input', 'Đánh giá không hợp lệ');
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, id);
      if (meal.status !== 'thanh_toan' && meal.status !== 'xong') throw new ApiError(409, 'too_early', 'Đánh giá được sau khi đã chốt tiền');
      const joined = (await c.query('SELECT 1 FROM items WHERE meal_id=$1 AND member_id=$2 LIMIT 1', [id, me.id]))[0];
      if (!joined) throw forbidden('Chỉ người đã gọi món trong bữa này mới đánh giá được');
      if (v === 0) await c.query('DELETE FROM meal_ratings WHERE meal_id=$1 AND member_id=$2', [id, me.id]);
      else await c.query('INSERT INTO meal_ratings(meal_id, member_id, value) VALUES($1,$2,$3) ON CONFLICT (meal_id, member_id) DO UPDATE SET value = EXCLUDED.value', [id, me.id, v]);
      return { ok: true };
    });
  });
}
