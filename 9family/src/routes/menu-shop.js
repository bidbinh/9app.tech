// Danh sách đi chợ nâng cao: mục có số lượng, chuẩn hóa gõ/giọng nói, gộp từ thực đơn, tích đã mua, nhắc chưa mua đủ.
// Chữ ký các endpoint cũ (POST /shopping {text}, /shopping/:id/bought, DELETE, /shopping/clear-bought) giữ nguyên.
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { isManager, forbidden } from '../auth.js';
import { clock } from '../clock.js';
import { cleanText, uuidParam, normKey } from '../util.js';
import { dayOfMs, atMs, addDays } from '../vn.js';
import { notifyMembers } from '../notify.js';
import { famRoutes } from './common.js';
import { canEdit, needEdit, loadProfile } from './menu.js';
import * as M from '../menu/index.js';

const noKid = (me) => { if (me.role === 'con') throw forbidden('Tài khoản của con không dùng danh sách mua sắm'); };
const SOURCES = ['tay', 'giong_noi', 'osin'];

export const shopOut = (s) => {
  const qty = s.qty === null || s.qty === undefined ? null : Number(s.qty);
  // mục lưu từ trước khi có bộ tách tên (name rỗng) có thể còn nguyên câu nói: đưa bản gợi ý gọn để hiển thị, KHÔNG sửa dữ liệu im lặng
  let tidy = null;
  if (!s.name && s.text) { const p = M.prepareShopItem(s.text); if (p && p.text !== s.text) tidy = { text: p.text, name: p.name, qty: p.qty, unit: p.unit, display: p.display }; }
  return {
    tidy,
    id: s.id, text: s.text, name: s.name || s.text, qty, unit: s.unit || null, display: qty != null ? M.fmtQty(qty, s.unit) : '',
    aisle: s.aisle || null, ingredientId: s.ingredient_id || null, source: s.source || 'tay', fromDishes: s.from_dishes || [], have: !!s.have, note: s.note || '',
    bought: !!s.bought_at, addedBy: s.added_name || '', boughtBy: s.bought_name || '', addedById: s.added_by, planWeek: s.plan_week || null,
  };
};
export const SHOP_SELECT = `SELECT s.*, a.name AS added_name, b.name AS bought_name FROM shopping s LEFT JOIN members a ON a.id = s.added_by LEFT JOIN members b ON b.id = s.bought_by`;

export async function loadShopping(q, fid) {
  const weekAgo = new Date(clock.now() - 7 * 86400_000).toISOString();
  const rows = await q(`${SHOP_SELECT} WHERE s.family_id=$1 AND (s.bought_at IS NULL OR s.bought_at > $2) ORDER BY (s.bought_at IS NOT NULL), s.created_at, s.id`, [fid, weekAgo]);
  return rows.map(shopOut);
}

const bad = (msg, field) => new ApiError(400, 'invalid_input', msg, field ? { field } : undefined);

function partsOf(text, split) {
  if (typeof text !== 'string') return [];
  const list = split ? M.splitList(text) : [text];
  return list.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 10);
}

// Thêm một hoặc nhiều mục trong giao dịch (đã khóa hàng gia đình). Trả về { items, merged }.
export async function addItems(c, fid, me, parts, { source = 'tay', qty, unit, note } = {}) {
  await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
  const n = (await c.query('SELECT count(*)::int n FROM shopping WHERE family_id=$1', [fid]))[0].n;
  const prepared = parts.map((p) => {
    const t = typeof p === 'string' ? p : String((p && p.text) ?? '');
    if ([...t].length > 80) throw bad('Mỗi món tối đa 80 ký tự', 'Món cần mua');
    if (typeof p === 'string') return M.prepareShopItem(p, parts.length === 1 ? { qty, unit } : {});
    return M.prepareShopItem(t, { qty: p.qty, unit: p.unit });
  }).filter(Boolean);
  if (!prepared.length) throw bad('Hãy gõ món cần mua', 'Món cần mua');
  const noteText = note === undefined ? '' : cleanText(note, { max: 80, field: 'Ghi chú' });
  const items = []; let merged = 0; let added = 0;
  for (const p of prepared) {
    const dup = (await c.query(
      "SELECT * FROM shopping WHERE family_id=$1 AND bought_at IS NULL AND have=false AND source <> 'thuc_don' AND norm_key=$2 ORDER BY created_at LIMIT 1", [fid, p.normKey]))[0];
    if (dup) {
      merged++;
      const dq = dup.qty === null ? null : Number(dup.qty);
      let row = dup;
      if (p.qty != null && (dq === null || p.qty > dq)) {
        row = (await c.query('UPDATE shopping SET qty=$2, unit=$3, text=$4, updated_at=now() WHERE id=$1 RETURNING *', [dup.id, p.qty, p.unit, p.text]))[0];
      }
      items.push({ ...shopOut({ ...row, added_name: me.name }), merged: true });
      continue;
    }
    if (n + added >= config.maxShopping) throw new ApiError(409, 'limit', 'Danh sách mua sắm đã đầy, hãy xóa các món đã mua');
    added++;
    const r = (await c.query(
      `INSERT INTO shopping(family_id, text, added_by, name, qty, unit, aisle, ingredient_id, source, note, norm_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [fid, p.text, me.id, p.name, p.qty, p.unit, p.aisle, p.ingredientId, source, noteText || p.note, p.normKey]))[0];
    items.push({ ...shopOut({ ...r, added_name: me.name }), merged: false });
  }
  return { items, merged };
}

export function shopReminderTitle(count, names) {
  return { title: `Còn ${count} món chưa mua`, body: names.slice(0, 3).join(', ') + (names.length > 3 ? '...' : '') };
}

// Bộ lập lịch: nhắc "chưa mua đủ" một lần mỗi ngày cho gia đình bật nhắc, trong 3 giờ kể từ giờ đặt
export async function shopReminderStage(nowMs) {
  const today = dayOfMs(nowMs);
  const rows = await query("SELECT family_id, profile FROM menu_profiles WHERE profile->'shopReminder'->>'on' = 'true'");
  let n = 0;
  for (const r of rows) {
    const time = (r.profile.shopReminder && r.profile.shopReminder.time) || '17:00';
    const at = atMs(today, time);
    if (nowMs < at || nowMs > at + 3 * 3600_000) continue;
    try {
      n += await tx(async (c) => {
        const open = await c.query("SELECT text FROM shopping WHERE family_id=$1 AND bought_at IS NULL AND have=false ORDER BY created_at LIMIT 50", [r.family_id]);
        if (!open.length) return 0;
        const t = shopReminderTitle(open.length, open.map((o) => o.text));
        return notifyMembers(c, { familyId: r.family_id, memberIds: (await c.query("SELECT id FROM members WHERE family_id=$1 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL AND role <> 'con'", [r.family_id])).map((m) => m.id), type: 'task', title: t.title, body: t.body, link: `#/f/${r.family_id}/shop`, dedupe: `shop:${today}` });
      });
    } catch (e) { console.error('[scheduler:shop]', e && e.code ? `code=${e.code}` : String(e && e.message).slice(0, 120)); }
  }
  return n;
}

export function shoppingRoutes(app) {
  const F = famRoutes(app);

  F.get('/shopping', async (ctx, me, fid) => {
    const today = dayOfMs(clock.now());
    const items = me.role === 'con' ? [] : await loadShopping(query, fid);
    const plans = await query('SELECT week_start, shop_stale, status FROM menu_plans WHERE family_id=$1 AND shop_synced_at IS NOT NULL AND week_start >= $2 ORDER BY week_start', [fid, addDays(today, -14)]);
    return { items, today, plans: plans.map((p) => ({ weekStart: p.week_start, stale: p.shop_stale, status: p.status })), canEdit: canEdit(me) };
  });

  F.post('/shopping', async (ctx, me, fid) => {
    noKid(me);
    const parts = partsOf(ctx.body.text, true);
    if (!parts.length) throw bad('Hãy gõ món cần mua', 'Món cần mua');
    const source = SOURCES.includes(ctx.body.source) ? ctx.body.source : 'tay';
    const out = await tx((c) => addItems(c, fid, me, parts, { source }));
    return { items: out.items.map(({ merged, ...i }) => i), merged: out.merged };
  });

  // Điểm vào sạch cho trợ lý Osin: một mục theo văn bản tự do + số lượng/đơn vị tùy chọn
  F.post('/shopping/items', async (ctx, me, fid) => {
    noKid(me);
    const b = ctx.body;
    const parts = partsOf(b.text, false);
    if (!parts.length) throw bad('Hãy cho biết cần mua gì', 'Món cần mua');
    const source = SOURCES.includes(b.source) ? b.source : 'tay';
    const out = await tx((c) => addItems(c, fid, me, parts, { source, qty: b.qty, unit: b.unit, note: b.note }));
    return { item: out.items[0], merged: out.merged > 0 };
  });

  // Thêm nhiều mục đã soát (từ màn xem lại sau khi nói): [{ text, qty?, unit? }], tối đa 20
  F.post('/shopping/batch', async (ctx, me, fid) => {
    noKid(me);
    const arr = Array.isArray(ctx.body.items) ? ctx.body.items.slice(0, 20) : [];
    const parts = arr.filter((x) => x && typeof x === 'object' && typeof x.text === 'string' && x.text.trim()).map((x) => ({ text: x.text, qty: x.qty, unit: x.unit }));
    if (!parts.length) throw bad('Chưa có món nào để thêm', 'Món cần mua');
    const source = SOURCES.includes(ctx.body.source) ? ctx.body.source : 'tay';
    const out = await tx((c) => addItems(c, fid, me, parts, { source }));
    return { items: out.items.map(({ merged, ...i }) => i), merged: out.merged };
  });

  // Xem trước cách hiểu một câu gõ/nói (không ghi gì)
  F.post('/shopping/parse', async (ctx) => {
    ctx.noBump = true;
    const parts = partsOf(ctx.body.text, true);
    return {
      items: parts.map((p) => {
        const r = M.prepareShopItem(p);
        return { raw: p, text: r.text, name: r.name, qty: r.qty, unit: r.unit, display: r.qty != null ? M.fmtQty(r.qty, r.unit) : '', ingredientId: r.ingredientId, aisle: r.aisle, confidence: r.confidence, approx: r.approx };
      }),
    };
  });

  F.post('/shopping/clear-bought', async (ctx, me, fid) => {
    noKid(me);
    needEdit(me);
    const r = await query('DELETE FROM shopping WHERE family_id=$1 AND bought_at IS NOT NULL RETURNING 1', [fid]);
    return { removed: r.length };
  });

  F.post('/shopping/:id/bought', async (ctx, me, fid) => {
    noKid(me);
    const id = uuidParam(ctx.params.id);
    const bought = ctx.body.bought !== false;
    const row = (await query(
      bought ? 'UPDATE shopping SET bought_at=$3, bought_by=$4, updated_at=now() WHERE id=$1 AND family_id=$2 AND bought_at IS NULL RETURNING *' : 'UPDATE shopping SET bought_at=NULL, bought_by=NULL, updated_at=now() WHERE id=$1 AND family_id=$2 AND bought_at IS NOT NULL RETURNING *',
      bought ? [id, fid, new Date(clock.now()).toISOString(), me.id] : [id, fid]))[0];
    if (!row && !(await query('SELECT 1 FROM shopping WHERE id=$1 AND family_id=$2', [id, fid])).length) throw new ApiError(404, 'not_found', 'Không tìm thấy món này');
    return { ok: true, already: !row };
  });

  // "Nhà đã có" (không cần mua) hoặc trả lại thành cần mua
  F.post('/shopping/:id/have', async (ctx, me, fid) => {
    noKid(me);
    needEdit(me);
    const id = uuidParam(ctx.params.id);
    const have = ctx.body.have !== false;
    const row = (await query('UPDATE shopping SET have=$3, updated_at=now() WHERE id=$1 AND family_id=$2 AND have <> $3 RETURNING id', [id, fid, have]))[0];
    if (!row && !(await query('SELECT 1 FROM shopping WHERE id=$1 AND family_id=$2', [id, fid])).length) throw new ApiError(404, 'not_found', 'Không tìm thấy món này');
    return { ok: true, already: !row };
  });

  F.post('/shopping/:id', async (ctx, me, fid) => {
    noKid(me);
    const id = uuidParam(ctx.params.id); const b = ctx.body;
    return tx(async (c) => {
      const s = (await c.query('SELECT * FROM shopping WHERE id=$1 AND family_id=$2 FOR UPDATE', [id, fid]))[0];
      if (!s) throw new ApiError(404, 'not_found', 'Không tìm thấy món này');
      if (!(isManager(me) || s.added_by === me.id)) throw forbidden('Chỉ người thêm hoặc người quản lý mới sửa được');
      let { text, name, qty, unit, note } = { text: s.text, name: s.name, qty: s.qty === null ? null : Number(s.qty), unit: s.unit, note: s.note };
      let aisle = null; let ingId = null;
      if (b.tidy === true || b.text !== undefined) {
        const p = M.prepareShopItem(b.tidy === true ? s.text : cleanText(b.text, { max: 80, min: 1, field: 'Món cần mua' }));
        text = p.text; name = p.name; qty = p.qty; unit = p.unit; aisle = p.aisle; ingId = p.ingredientId;
      }
      if (b.name !== undefined) { name = cleanText(b.name, { max: 60, min: 1, field: 'Tên món' }); text = M.composeText(name, qty, unit); }
      if (b.qty !== undefined) {
        if (b.qty === null || b.qty === '') { qty = null; unit = null; } else {
          const q = Number(b.qty);
          if (!Number.isFinite(q) || q <= 0 || q > 100000) throw bad('Số lượng phải là số dương hợp lý', 'Số lượng');
          qty = Math.round(q * 100) / 100;
          if (b.unit !== undefined) unit = b.unit ? M.prepareShopItem('x', { qty: 1, unit: b.unit }).unit : null;
        }
        text = M.composeText(name || text, qty, unit);
      }
      if (b.note !== undefined) note = cleanText(b.note, { max: 80, field: 'Ghi chú' });
      const row = (await c.query('UPDATE shopping SET text=$2, name=$3, qty=$4, unit=$5, note=$6, norm_key=$7, aisle=COALESCE($8, aisle), ingredient_id=COALESCE($9, ingredient_id), updated_at=now() WHERE id=$1 RETURNING *',
        [id, text, name, qty, unit, note || '', name ? normKey(name) + '|' + (unit || '') : s.norm_key, aisle, ingId]))[0];
      return { item: shopOut({ ...row, added_name: me.name }) };
    });
  });

  F.del('/shopping/:id', async (ctx, me, fid) => {
    noKid(me);
    const id = uuidParam(ctx.params.id);
    const s = (await query('SELECT added_by FROM shopping WHERE id=$1 AND family_id=$2', [id, fid]))[0];
    if (!s) throw new ApiError(404, 'not_found', 'Không tìm thấy món này');
    if (!(isManager(me) || s.added_by === me.id)) throw forbidden('Chỉ người thêm hoặc người quản lý mới xóa được');
    await query('DELETE FROM shopping WHERE id=$1', [id]);
    return { ok: true };
  });

  // ---------- từ thực đơn -> danh sách đi chợ ----------
  // preview=true: chỉ tính và trả về (không ghi). Ghi: cộng dồn, nhân số suất, không mất mục cũ, cập nhật nếu đã tạo trước đó.
  F.post('/menu/week/shopping', async (ctx, me, fid) => {
    noKid(me);
    needEdit(me);
    const b = ctx.body;
    const weekStart = M.cleanWeekStart(b.start, dayOfMs(clock.now()));
    const idList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && M.ING.has(x)))] : []);
    const haveIds = idList(b.haveIds); const buyPantry = idList(b.buyPantry);
    const includeOptional = b.includeOptional !== false;
    if (b.preview === true) {
      ctx.noBump = true;
      const row = (await query('SELECT plan, shop_synced_at, shop_stale FROM menu_plans WHERE family_id=$1 AND week_start=$2', [fid, weekStart]))[0];
      if (!row) throw new ApiError(404, 'not_found', 'Tuần này chưa có thực đơn');
      const r = M.menuShoppingLines(row.plan, { haveIds, buyPantry, includeOptional });
      const prof = await loadProfile(query, fid);
      return { ...r, pantryHave: prof.profile.pantryHave, synced: !!row.shop_synced_at };
    }
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      const row = (await c.query('SELECT * FROM menu_plans WHERE family_id=$1 AND week_start=$2 FOR UPDATE', [fid, weekStart]))[0];
      if (!row) throw new ApiError(404, 'not_found', 'Tuần này chưa có thực đơn');
      const res = M.menuShoppingLines(row.plan, { haveIds, buyPantry, includeOptional });
      const existing = await c.query("SELECT * FROM shopping WHERE family_id=$1 AND plan_week=$2 AND source='thuc_don'", [fid, weekStart]);
      const exBy = new Map(existing.map((e) => [e.ingredient_id, e]));
      const total = (await c.query('SELECT count(*)::int n FROM shopping WHERE family_id=$1', [fid]))[0].n;
      const fresh = res.lines.filter((l) => !exBy.has(l.ingredientId)).length;
      if (total + fresh > config.maxShopping) throw new ApiError(409, 'limit', `Danh sách mua sắm sắp đầy (${total}/${config.maxShopping}), hãy xóa các món đã mua trước`);
      const out = { added: 0, updated: 0, removed: 0, keptBought: 0 };
      const seen = new Set();
      for (const l of res.lines) {
        seen.add(l.ingredientId);
        const text = M.composeText(l.name, l.qty, l.unit).slice(0, 80);
        const ex = exBy.get(l.ingredientId);
        if (ex) {
          if (ex.bought_at) { out.keptBought++; continue; }
          const have = b.haveIds !== undefined ? l.have : ex.have;
          await c.query('UPDATE shopping SET text=$2, name=$3, qty=$4, unit=$5, aisle=$6, from_dishes=$7, note=$8, have=$9, updated_at=now() WHERE id=$1',
            [ex.id, text, l.name, l.qty, l.unit, l.aisle, JSON.stringify(l.fromDishes), l.note, have]);
          out.updated++;
        } else {
          await c.query(
            `INSERT INTO shopping(family_id, text, added_by, name, qty, unit, aisle, ingredient_id, source, plan_week, from_dishes, have, note, norm_key)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,'thuc_don',$9,$10,$11,$12,$13)`,
            [fid, text, me.id, l.name, l.qty, l.unit, l.aisle, l.ingredientId, weekStart, JSON.stringify(l.fromDishes), l.have, l.note, normKey(l.name) + '|' + (l.unit || '')]);
          out.added++;
        }
      }
      for (const ex of existing) {
        if (seen.has(ex.ingredient_id)) continue;
        if (ex.bought_at) { out.keptBought++; continue; }
        await c.query('DELETE FROM shopping WHERE id=$1', [ex.id]); out.removed++;
      }
      await c.query('UPDATE menu_plans SET shop_synced_at=now(), shop_stale=false WHERE id=$1', [row.id]);
      // nhớ đồ nhà luôn có để lần sau hỏi ít hơn
      if (b.rememberPantry === true && me.role !== 'con') {
        const prof = await loadProfile(c.query, fid);
        const keep = new Set(prof.profile.pantryHave);
        for (const l of M.menuShoppingLines(row.plan, { buyPantry: [] }).pantryCheck) { if (buyPantry.includes(l.ingredientId)) keep.delete(l.ingredientId); else keep.add(l.ingredientId); }
        await c.query(
          `INSERT INTO menu_profiles(family_id, profile, updated_by) VALUES($1,$2,$3) ON CONFLICT (family_id) DO UPDATE SET profile=$2, updated_by=$3, updated_at=now()`,
          [fid, JSON.stringify({ ...prof.profile, pantryHave: [...keep].slice(0, 80) }), me.id]);
      }
      return { ...out, servings: res.servings };
    });
  });
}
