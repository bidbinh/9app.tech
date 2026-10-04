import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { requireMember, forbidden } from '../auth.js';
import { post } from './teams.js';
import { lockMeal, logEvent } from './meals.js';
import { raw } from '../http.js';
import { uuidParam, randomCode, normKey, todayVN } from '../util.js';
import { vietQrPayload, qrPng, qrSvg, transferContent } from '../transfer.js';
import { pairDebts, settle, netBalances } from '../debts.js';

const IMG_HEADERS = { 'cache-control': 'private, no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" };

async function sendQr(ext, payload) {
  if (ext === 'svg') return raw(await qrSvg(payload), { ...IMG_HEADERS, 'content-type': 'image/svg+xml; charset=utf-8' });
  return raw(await qrPng(payload), { ...IMG_HEADERS, 'content-type': 'image/png' });
}

const nameMap = async (q, teamId) => {
  const rows = await q('SELECT id, name, left_at FROM members WHERE team_id=$1', [teamId]);
  return new Map(rows.map((m) => [m.id, m.name + (m.left_at ? ' (đã rời nhóm)' : '')]));
};

export function moneyRoutes(app) {
  // ---------- đánh dấu thanh toán từng khoản ----------
  async function withCharge(ctx, fn) {
    const cid = uuidParam(ctx.params.cid);
    const c0 = (await query('SELECT meal_id FROM charges WHERE id=$1', [cid]))[0];
    if (!c0) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản này');
    return tx(async (c) => {
      const { meal, me } = await lockMeal(c, ctx, c0.meal_id); // khóa bữa trước, rồi mới khóa khoản
      const ch = (await c.query('SELECT * FROM charges WHERE id=$1 FOR UPDATE', [cid]))[0];
      if (!ch) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản này');
      if (meal.status !== 'thanh_toan' && meal.status !== 'xong') throw new ApiError(409, 'bad_state', 'Bữa này chưa ở bước thu tiền');
      return fn(c, ch, meal, me);
    });
  }
  const inNetting = (ch) => ch.netting_id && ch.status === 'chua_tra';
  const NET_MSG = 'Khoản này đang nằm trong một phiên bù trừ. Hãy làm theo phiên bù trừ ở Sổ nợ, hoặc hủy phiên đó trước.';

  post(app, '/api/charges/:cid/paid', (ctx) => withCharge(ctx, async (c, ch, meal, me) => {
    if (ch.member_id !== me.id) throw forbidden('Chỉ người nợ mới bấm "Tôi đã chuyển" được');
    if (ch.member_id === ch.payee_id || ch.status !== 'chua_tra') return { ok: true, status: ch.status };
    if (inNetting(ch)) throw new ApiError(409, 'in_netting', NET_MSG);
    await c.query("UPDATE charges SET status='da_chuyen', marked_at=now() WHERE id=$1", [ch.id]);
    await logEvent(c, { teamId: meal.team_id, mealId: meal.id, chargeId: ch.id, actorId: me.id, action: 'da_chuyen' });
    return { ok: true, status: 'da_chuyen' };
  }));

  post(app, '/api/charges/:cid/received', (ctx) => withCharge(ctx, async (c, ch, meal, me) => {
    if (ch.payee_id !== me.id) throw forbidden('Chỉ người nhận tiền mới bấm "Đã nhận" được');
    if (ch.status === 'da_nhan') return { ok: true, status: ch.status };
    if (inNetting(ch)) throw new ApiError(409, 'in_netting', NET_MSG);
    await c.query("UPDATE charges SET status='da_nhan', received_at=now() WHERE id=$1", [ch.id]);
    await logEvent(c, { teamId: meal.team_id, mealId: meal.id, chargeId: ch.id, actorId: me.id, action: 'da_nhan' });
    return { ok: true, status: 'da_nhan' };
  }));

  post(app, '/api/charges/:cid/unseen', (ctx) => withCharge(ctx, async (c, ch, meal, me) => {
    if (ch.payee_id !== me.id) throw forbidden('Chỉ người nhận tiền mới bấm "Chưa thấy" được');
    if (ch.member_id === ch.payee_id) throw new ApiError(409, 'bad_state', 'Đây là phần của chính bạn');
    if (ch.settled_by_netting) throw new ApiError(409, 'settled_by_netting', 'Khoản này đã được thanh toán qua bù trừ nên không hoàn lại được.');
    if (ch.status === 'chua_tra') return { ok: true, status: ch.status };
    await c.query("UPDATE charges SET status='chua_tra', marked_at=NULL, received_at=NULL WHERE id=$1", [ch.id]);
    await logEvent(c, { teamId: meal.team_id, mealId: meal.id, chargeId: ch.id, actorId: me.id, action: 'chua_thay' });
    return { ok: true, status: 'chua_tra' };
  }));

  // ---------- QR của một khoản ----------
  app.route('GET', '/api/charges/:cid/qr.:ext', async (ctx) => {
    const cid = uuidParam(ctx.params.cid);
    if (!['png', 'svg'].includes(ctx.params.ext)) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const ch = (await query('SELECT c.*, m.team_id FROM charges c JOIN meals m ON m.id=c.meal_id WHERE c.id=$1', [cid]))[0];
    if (!ch) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản này');
    const me = await requireMember(query, ctx, ch.team_id);
    // chỉ người nợ và người nhận mới thấy QR (có số tài khoản)
    if (me.id !== ch.member_id && me.id !== ch.payee_id) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản này');
    if (ch.member_id === ch.payee_id || !ch.payee_account) throw new ApiError(409, 'no_qr', 'Khoản này không cần chuyển tiền');
    if (ctx.query.v !== undefined && String(ctx.query.v) !== String(ch.qr_gen)) {
      throw new ApiError(410, 'qr_expired', 'QR này đã hết hiệu lực vì người nhận tiền đã đổi. Tải lại trang để lấy QR mới.');
    }
    return sendQr(ctx.params.ext, vietQrPayload({ bin: ch.payee_bin, account: ch.payee_account, amount: Number(ch.amount), content: ch.content }));
  });

  // ---------- sổ nợ nhóm ----------
  async function openCharges(q, teamId) {
    return q(
      `SELECT c.id, c.member_id AS "from", c.payee_id AS "to", c.amount, c.status, c.netting_id, m.id AS meal_id, m.day::text AS day, m.venue_name
         FROM charges c JOIN meals m ON m.id = c.meal_id
        WHERE m.team_id=$1 AND m.status IN ('thanh_toan','xong') AND c.status <> 'da_nhan' AND c.member_id <> c.payee_id AND c.amount > 0
        ORDER BY m.day, c.seq`, [teamId]);
  }

  async function nettingView(q, teamId, me, names) {
    const n = (await q("SELECT * FROM nettings WHERE team_id=$1 AND status='cho'", [teamId]))[0];
    if (!n) return null;
    const ts = await q('SELECT * FROM netting_transfers WHERE netting_id=$1 ORDER BY seq', [n.id]);
    return {
      id: n.id, code: n.code, createdBy: n.created_by, canCancel: ts.every((t) => t.status === 'chua_tra'),
      transfers: ts.map((t) => {
        const involved = t.from_id === me.id || t.to_id === me.id;
        const o = { id: t.id, from: t.from_id, fromName: names.get(t.from_id), to: t.to_id, toName: names.get(t.to_id), amount: Number(t.amount), status: t.status, mine: t.from_id === me.id, toMe: t.to_id === me.id };
        if (involved) o.pay = { content: t.content, bin: t.bin, account: t.account, holder: t.holder, qrUrl: `api/transfers/${t.id}/qr.png`, qrSvgUrl: `api/transfers/${t.id}/qr.svg` };
        return o;
      }),
    };
  }

  app.route('GET', '/api/teams/:id/debts', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    const me = await requireMember(query, ctx, id);
    const names = await nameMap(query, id);
    const rows = await openCharges(query, id);
    // Xem trước và chạy thật dùng CÙNG điều kiện: chỉ khoản chưa trả; khoản đã báo chuyển (chờ xác nhận) tách riêng
    const live = rows.filter((r) => r.status === 'chua_tra');
    const flat = live.map((r) => ({ from: r.from, to: r.to, amount: Number(r.amount) }));
    const nm = (x) => names.get(x) || 'Người đã rời';
    const waiting = rows.filter((r) => r.status === 'da_chuyen').map((r) => ({ id: r.id, from: r.from, fromName: nm(r.from), to: r.to, toName: nm(r.to), amount: Number(r.amount), mealId: r.meal_id, day: r.day, venueName: r.venue_name }));
    const pairs = pairDebts(flat).map((p) => ({ ...p, fromName: nm(p.from), toName: nm(p.to) }));
    const suggestions = settle(flat).map((p) => ({ ...p, fromName: nm(p.from), toName: nm(p.to) }));
    const bal = netBalances(flat);
    return {
      me: me.id,
      pairs, suggestions, waiting, canNet: live.some((r) => !r.netting_id),
      balances: [...bal].map(([mid, v]) => ({ memberId: mid, name: nm(mid), net: v })).sort((a, b) => b.net - a.net),
      items: rows.map((r) => ({ id: r.id, from: r.from, fromName: nm(r.from), to: r.to, toName: nm(r.to), amount: Number(r.amount), status: r.status, mealId: r.meal_id, day: r.day, venueName: r.venue_name, inNetting: !!r.netting_id && r.status === 'chua_tra' })),
      netting: await nettingView(query, id, me, names),
    };
  });

  // ---------- bù trừ: tạo phiên ----------
  post(app, '/api/teams/:id/netting', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    return tx(async (c) => {
      await c.query('SELECT id FROM teams WHERE id=$1 FOR UPDATE', [id]);
      const me = await requireMember(c.query, ctx, id);
      const open = (await c.query("SELECT id FROM nettings WHERE team_id=$1 AND status='cho'", [id]))[0];
      if (open) return { nettingId: open.id, already: true };
      const rows = await c.query(
        `SELECT c.id, c.member_id AS "from", c.payee_id AS "to", c.amount, c.meal_id
           FROM charges c JOIN meals m ON m.id = c.meal_id
          WHERE m.team_id=$1 AND m.status IN ('thanh_toan','xong') AND c.status='chua_tra' AND c.netting_id IS NULL
            AND c.member_id <> c.payee_id AND c.amount > 0 ORDER BY c.id FOR UPDATE OF c`, [id]);
      const transfers = settle(rows.map((r) => ({ from: r.from, to: r.to, amount: Number(r.amount) })));
      if (!rows.length) throw new ApiError(409, 'nothing_to_net', 'Chưa có khoản chưa trả nào để bù trừ.');
      const payees = await c.query('SELECT * FROM members WHERE id = ANY($1)', [[...new Set(transfers.map((t) => t.to))]]);
      const noBank = payees.filter((p) => !p.bank_account);
      if (noBank.length) throw new ApiError(409, 'payee_no_bank', `${noBank.map((p) => p.name).join(', ')} chưa lưu tài khoản nhận tiền nên chưa lập được mã QR bù trừ. Nhờ họ nhập tài khoản rồi thử lại.`, { memberIds: noBank.map((p) => p.id) });
      const bankOf = new Map(payees.map((p) => [p.id, p]));
      let n;
      for (let i = 0; i < 5 && !n; i++) {
        try {
          await c.query('SAVEPOINT s');
          n = (await c.query('INSERT INTO nettings(team_id, code, created_by, status, done_at) VALUES($1,$2,$3,$4::text, CASE WHEN $4::text = \'xong\' THEN now() END) RETURNING id, code', [id, randomCode(5), me.id, transfers.length ? 'cho' : 'xong']))[0];
        } catch (e) { if (e.code !== '23505') throw e; await c.query('ROLLBACK TO SAVEPOINT s'); }
      }
      if (!n) throw new ApiError(500, 'internal', 'Không tạo được phiên bù trừ, thử lại');
      if (!transfers.length) {
        // các khoản qua lại bù nhau đúng bằng 0: không ai phải chuyển, đánh dấu thanh toán qua bù trừ (giữ dấu vết)
        const done = await c.query("UPDATE charges SET netting_id=$2, status='da_nhan', received_at=now(), settled_by_netting=true WHERE id = ANY($1) RETURNING id, meal_id", [rows.map((r) => r.id), n.id]);
        for (const r of done) {
          await logEvent(c, { teamId: id, mealId: r.meal_id, chargeId: r.id, actorId: me.id, action: 'vao_bu_tru', detail: { nettingId: n.id } });
          await logEvent(c, { teamId: id, mealId: r.meal_id, chargeId: r.id, actorId: me.id, action: 'da_nhan_bu_tru', detail: { nettingId: n.id, zeroSum: true } });
        }
        return { nettingId: n.id, done: true, settled: done.length };
      }
      let seq = 0;
      for (const t of transfers) {
        seq += 1;
        const b = bankOf.get(t.to);
        await c.query(
          `INSERT INTO netting_transfers(netting_id, seq, from_id, to_id, amount, content, bin, account, holder) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [n.id, seq, t.from, t.to, t.amount, transferContent({ mealCode: n.code, seq, prefix: '9N' }), b.bank_bin, b.bank_account, b.bank_holder]);
      }
      await c.query('UPDATE charges SET netting_id=$2 WHERE id = ANY($1)', [rows.map((r) => r.id), n.id]);
      for (const r of rows) await logEvent(c, { teamId: id, mealId: r.meal_id, chargeId: r.id, actorId: me.id, action: 'vao_bu_tru', detail: { nettingId: n.id } });
      return { nettingId: n.id };
    });
  });

  async function withTransfer(ctx, fn) {
    const tid = uuidParam(ctx.params.tid);
    const t0 = (await query('SELECT n.id AS nid, n.team_id FROM netting_transfers t JOIN nettings n ON n.id=t.netting_id WHERE t.id=$1', [tid]))[0];
    if (!t0) throw new ApiError(404, 'not_found', 'Không tìm thấy khoản bù trừ này');
    return tx(async (c) => {
      const me = await requireMember(c.query, ctx, t0.team_id);
      const n = (await c.query('SELECT * FROM nettings WHERE id=$1 FOR UPDATE', [t0.nid]))[0];
      const t = (await c.query('SELECT * FROM netting_transfers WHERE id=$1 FOR UPDATE', [tid]))[0];
      return fn(c, t, n, me);
    });
  }

  post(app, '/api/transfers/:tid/paid', (ctx) => withTransfer(ctx, async (c, t, n, me) => {
    if (t.from_id !== me.id) throw forbidden('Chỉ người chuyển mới bấm "Tôi đã chuyển" được');
    if (n.status !== 'cho') throw new ApiError(409, 'netting_closed', 'Phiên bù trừ này đã kết thúc');
    if (t.status === 'chua_tra') {
      await c.query("UPDATE netting_transfers SET status='da_chuyen', marked_at=now() WHERE id=$1", [t.id]);
      await logEvent(c, { teamId: n.team_id, actorId: me.id, action: 'bu_tru_da_chuyen', detail: { transferId: t.id } });
    }
    return { ok: true };
  }));

  post(app, '/api/transfers/:tid/unseen', (ctx) => withTransfer(ctx, async (c, t, n, me) => {
    if (t.to_id !== me.id) throw forbidden('Chỉ người nhận mới bấm "Chưa thấy" được');
    if (n.status !== 'cho') throw new ApiError(409, 'netting_closed', 'Phiên bù trừ này đã kết thúc');
    if (t.status !== 'chua_tra') await c.query("UPDATE netting_transfers SET status='chua_tra', marked_at=NULL, received_at=NULL WHERE id=$1", [t.id]);
    return { ok: true };
  }));

  post(app, '/api/transfers/:tid/received', (ctx) => withTransfer(ctx, async (c, t, n, me) => {
    if (t.to_id !== me.id) throw forbidden('Chỉ người nhận mới bấm "Đã nhận" được');
    if (n.status !== 'cho') return { ok: true, done: n.status === 'xong' };
    if (t.status !== 'da_nhan') {
      await c.query("UPDATE netting_transfers SET status='da_nhan', received_at=now() WHERE id=$1", [t.id]);
      await logEvent(c, { teamId: n.team_id, actorId: me.id, action: 'bu_tru_da_nhan', detail: { transferId: t.id } });
    }
    const left = (await c.query("SELECT count(*)::int n FROM netting_transfers WHERE netting_id=$1 AND status <> 'da_nhan'", [n.id]))[0].n;
    if (left > 0) return { ok: true, done: false };
    // đủ mọi khoản: các khoản gốc được coi là đã thanh toán qua bù trừ (giữ lại dấu vết, không xóa)
    const done = await c.query(
      `UPDATE charges SET status='da_nhan', received_at=now(), settled_by_netting=true WHERE netting_id=$1 AND status='chua_tra' RETURNING id, meal_id`, [n.id]);
    for (const r of done) await logEvent(c, { teamId: n.team_id, mealId: r.meal_id, chargeId: r.id, actorId: me.id, action: 'da_nhan_bu_tru', detail: { nettingId: n.id } });
    await c.query("UPDATE nettings SET status='xong', done_at=now() WHERE id=$1", [n.id]);
    return { ok: true, done: true, settled: done.length };
  }));

  post(app, '/api/nettings/:nid/cancel', async (ctx) => {
    const nid = uuidParam(ctx.params.nid);
    const n0 = (await query('SELECT team_id FROM nettings WHERE id=$1', [nid]))[0];
    if (!n0) throw new ApiError(404, 'not_found', 'Không tìm thấy phiên bù trừ');
    return tx(async (c) => {
      const me = await requireMember(c.query, ctx, n0.team_id);
      const n = (await c.query('SELECT * FROM nettings WHERE id=$1 FOR UPDATE', [nid]))[0];
      if (n.status === 'huy') return { ok: true };
      if (n.status !== 'cho') throw new ApiError(409, 'netting_closed', 'Phiên bù trừ này đã hoàn tất');
      if (n.created_by !== me.id && me.role !== 'chu') throw forbidden('Chỉ người tạo phiên hoặc chủ nhóm mới hủy được');
      const busy = (await c.query("SELECT count(*)::int n FROM netting_transfers WHERE netting_id=$1 AND status <> 'chua_tra'", [nid]))[0].n;
      if (busy) throw new ApiError(409, 'has_payments', 'Đã có người báo chuyển hoặc đã nhận tiền nên không hủy phiên được. Hãy hoàn tất phiên này.');
      await c.query('UPDATE charges SET netting_id=NULL WHERE netting_id=$1 AND status=\'chua_tra\'', [nid]);
      await c.query("UPDATE nettings SET status='huy' WHERE id=$1", [nid]);
      await logEvent(c, { teamId: n.team_id, actorId: me.id, action: 'huy_bu_tru', detail: { nettingId: nid } });
      return { ok: true };
    });
  });

  app.route('GET', '/api/transfers/:tid/qr.:ext', async (ctx) => {
    const tid = uuidParam(ctx.params.tid);
    if (!['png', 'svg'].includes(ctx.params.ext)) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const t = (await query('SELECT t.*, n.team_id FROM netting_transfers t JOIN nettings n ON n.id=t.netting_id WHERE t.id=$1', [tid]))[0];
    if (!t) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const me = await requireMember(query, ctx, t.team_id);
    if (me.id !== t.from_id && me.id !== t.to_id) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    return sendQr(ctx.params.ext, vietQrPayload({ bin: t.bin, account: t.account, amount: Number(t.amount), content: t.content }));
  });

  // ---------- lịch sử và thống kê ----------
  app.route('GET', '/api/teams/:id/stats', async (ctx) => {
    const id = uuidParam(ctx.params.id);
    await requireMember(query, ctx, id);
    const names = await nameMap(query, id);
    const kind = ['trua', 'cafe', 'sang', 'tiec'].includes(ctx.query.kind) ? ctx.query.kind : null; // lọc theo loại bữa
    let month = String(ctx.query.month || todayVN().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) month = todayVN().slice(0, 7);
    const spent = await query(
      `SELECT c.member_id, SUM(c.amount)::bigint AS amount, count(*)::int AS meals FROM charges c JOIN meals m ON m.id=c.meal_id
        WHERE m.team_id=$1 AND m.status IN ('thanh_toan','xong') AND to_char(m.day,'YYYY-MM')=$2 AND ($3::text IS NULL OR m.kind=$3) GROUP BY c.member_id ORDER BY amount DESC`, [id, month, kind]);
    const meals = await query(
      `SELECT m.id, m.day::text AS day, m.status, m.kind, m.venue_name, m.payer_id, COALESCE((SELECT SUM(amount) FROM charges c WHERE c.meal_id=m.id),0)::bigint AS total
         FROM meals m WHERE m.team_id=$1 AND ($2::text IS NULL OR m.kind=$2) ORDER BY m.day DESC, m.created_at DESC LIMIT 40`, [id, kind]);
    const venues = await query(
      `SELECT m.venue_name, m.day::text AS day,
              (SELECT count(*)::int FROM meal_ratings r WHERE r.meal_id=m.id AND r.value=1) AS up,
              (SELECT count(*)::int FROM meal_ratings r WHERE r.meal_id=m.id AND r.value=-1) AS down
         FROM meals m WHERE m.team_id=$1 AND m.venue_name IS NOT NULL AND m.status IN ('thanh_toan','xong') AND ($2::text IS NULL OR m.kind=$2) ORDER BY m.day DESC`, [id, kind]);
    const fav = new Map();
    for (const v of venues) {
      const k = normKey(v.venue_name);
      const f = fav.get(k) || { name: v.venue_name, count: 0, up: 0, down: 0, lastDay: v.day };
      f.count += 1; f.up += v.up; f.down += v.down;
      fav.set(k, f);
    }
    const adv = await query(
      `SELECT m.payer_id, count(*)::int AS n, COALESCE(SUM((SELECT SUM(amount) FROM charges c WHERE c.meal_id=m.id)),0)::bigint AS amount
         FROM meals m WHERE m.team_id=$1 AND m.status IN ('thanh_toan','xong') AND m.payer_id IS NOT NULL AND m.day >= ($2::date - 30) GROUP BY m.payer_id`, [id, todayVN()]);
    return {
      month,
      spent: spent.map((r) => ({ memberId: r.member_id, name: names.get(r.member_id), amount: Number(r.amount), meals: r.meals })),
      kind,
      meals: meals.map((m) => ({ id: m.id, day: m.day, status: m.status, kind: m.kind, venueName: m.venue_name, payerName: m.payer_id ? names.get(m.payer_id) : null, total: Number(m.total) })),
      favorites: [...fav.values()].sort((a, b) => (b.count - a.count) || (b.up - b.down) - (a.up - a.down)).slice(0, 10),
      advances: adv.map((a) => ({ memberId: a.payer_id, name: names.get(a.payer_id), count: a.n, amount: Number(a.amount) })),
    };
  });
}
