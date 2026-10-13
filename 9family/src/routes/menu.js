// Thực đơn tuần: hồ sơ ăn uống, lập/đổi/khóa/chốt thực đơn, chi tiết món. Danh sách đi chợ từ thực đơn nằm ở menu-shop.js.
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { isManager, forbidden } from '../auth.js';
import { clock } from '../clock.js';
import { intIn } from '../util.js';
import { dayOfMs, addDays, weekdayISO } from '../vn.js';
import { famRoutes } from './common.js';
import * as M from '../menu/index.js';

// Quyền (theo ma trận 9id): quản lý (chu, quan_ly) làm mọi việc; thành viên người lớn đổi/khóa món;
// tài khoản con (vai trò 'con', khi 9id chuyển xong) chỉ xem.
export const canManage = (me) => isManager(me);
export const canEdit = (me) => isManager(me) || (me.role !== 'con');
export function needEdit(me) { if (!canEdit(me)) throw forbidden('Tài khoản của con chỉ được xem thực đơn'); }
export function needManage(me, msg = 'Chỉ chủ gia đình hoặc người quản lý mới làm được việc này') { if (!canManage(me)) throw forbidden(msg); }

export async function loadChildren(q, fid) {
  return q('SELECT id, name, birth_year FROM children WHERE family_id=$1 ORDER BY created_at, id', [fid]);
}
export async function loadProfile(q, fid) {
  const row = (await q('SELECT * FROM menu_profiles WHERE family_id=$1', [fid]))[0];
  if (row) return { profile: { ...M.defaultProfile(), ...row.profile }, hidden: row.hidden_dishes, saved: true, updatedAt: row.updated_at };
  const members = await q('SELECT relation, external FROM members WHERE family_id=$1 AND left_at IS NULL', [fid]);
  return { profile: M.defaultProfile(members), hidden: [], saved: false };
}
async function loadPlan(q, fid, weekStart, lock = false) {
  return (await q(`SELECT * FROM menu_plans WHERE family_id=$1 AND week_start=$2${lock ? ' FOR UPDATE' : ''}`, [fid, weekStart]))[0] || null;
}
const todayVN = () => dayOfMs(clock.now());

function checkWeekRange(weekStart) {
  const t = M.mondayOf(todayVN());
  if (weekStart < addDays(t, -56) || weekStart > addDays(t, 84)) throw new ApiError(400, 'invalid_input', 'Chỉ lập thực đơn trong khoảng từ 8 tuần trước đến 12 tuần tới', { field: 'Tuần' });
}

// so sánh không phụ thuộc thứ tự khóa (jsonb của PostgreSQL xếp lại khóa)
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v));

function planOut(row, built) {
  const dec = M.decoratePlan(row.plan, row.locks);
  const profileStale = built ? canon(built.profile.people) !== canon(row.plan.profile.people) : false;
  return { id: row.id, weekStart: row.week_start, status: row.status, gen: row.gen, locks: row.locks, ...dec, shopSynced: !!row.shop_synced_at, shopStale: !!row.shop_stale, profileStale, updatedAt: row.updated_at };
}

export function menuRoutes(app) {
  const F = famRoutes(app);

  async function builtFor(q, fid, profile) {
    try { return M.buildPlannerProfile(profile, await loadChildren(q, fid), todayVN()); } catch { return null; }
  }

  const outFor = async (q, fid, row) => planOut(row, await builtFor(q, fid, (await loadProfile(q, fid)).profile));

  // ---------- hồ sơ ăn uống ----------
  F.get('/menu/profile', async (ctx, me, fid) => {
    const { profile, hidden, saved } = await loadProfile(query, fid);
    const children = await loadChildren(query, fid);
    let built = null; let problem = null;
    try { built = M.buildPlannerProfile(profile, children, todayVN()); } catch (e) { problem = e.message; }
    return {
      profile, saved, problem, canEdit: canManage(me),
      people: built ? built.people : [], servings: built ? built.servings : 0, warnings: built ? built.warnings : [],
      children: children.map((c) => ({ id: c.id, name: c.name, birthYear: c.birth_year })),
      hidden: hidden.map((id) => ({ id, name: (M.DISH.get(id) || {}).name || id })),
      options: {
        avoid: M.AVOID_KEYS.map((k) => [k, M.AVOID_LABEL[k]]), diet: M.DIET_KEYS.map((k) => [k, M.DIET_LABEL[k]]),
        meals: M.MEALS.map((k) => [k, M.MEAL_LABEL[k]]), budget: M.BUDGETS.map((k) => [k, M.BUDGET_LABEL[k]]),
      },
      disclaimer: M.DISCLAIMER, region: 'Miền Bắc',
    };
  });

  F.post('/menu/profile', async (ctx, me, fid) => {
    needManage(me, 'Chỉ chủ gia đình hoặc người quản lý mới sửa hồ sơ ăn uống');
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      const children = await loadChildren(c.query, fid);
      const profile = M.cleanProfile(ctx.body, children.map((k) => k.id));
      M.buildPlannerProfile(profile, children, todayVN()); // kiểm tra dựng được
      await c.query(
        `INSERT INTO menu_profiles(family_id, profile, updated_by) VALUES($1,$2,$3)
         ON CONFLICT (family_id) DO UPDATE SET profile=$2, updated_by=$3, updated_at=now()`, [fid, JSON.stringify(profile), me.id]);
      return { ok: true, profile };
    });
  });

  // ---------- tuần ----------
  F.get('/menu/week', async (ctx, me, fid) => {
    const today = todayVN();
    const weekStart = M.cleanWeekStart(ctx.query.start, today);
    const { profile, saved } = await loadProfile(query, fid);
    const row = await loadPlan(query, fid, weekStart);
    const weeks = await query('SELECT week_start, status FROM menu_plans WHERE family_id=$1 AND week_start BETWEEN $2 AND $3 ORDER BY week_start', [fid, addDays(weekStart, -56), addDays(weekStart, 84)]);
    const built = await builtFor(query, fid, profile);
    return {
      weekStart, thisWeek: M.mondayOf(today), today, hasProfile: saved, plan: row ? planOut(row, built) : null,
      weeks: weeks.map((w) => ({ start: w.week_start, status: w.status })), month: M.weekMonth(weekStart),
      season: M.SEASON_LABEL[M.seasonOfMonth(M.weekMonth(weekStart))],
      people: built ? { count: built.people.length, servings: built.servings } : null,
      canEdit: canEdit(me), canManage: canManage(me), disclaimer: M.DISCLAIMER, mealLabels: M.MEAL_LABEL,
    };
  });

  F.post('/menu/week/generate', async (ctx, me, fid) => {
    needManage(me, 'Chỉ chủ gia đình hoặc người quản lý mới lập thực đơn');
    const b = ctx.body;
    const weekStart = M.cleanWeekStart(b.start, todayVN());
    checkWeekRange(weekStart);
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      const { profile, hidden } = await loadProfile(c.query, fid);
      const children = await loadChildren(c.query, fid);
      const old = await loadPlan(c.query, fid, weekStart, true);
      if (old && old.status === 'chot' && b.force !== true) throw new ApiError(409, 'finalized', 'Thực đơn tuần này đã chốt. Mở khóa chốt hoặc xác nhận lập lại.');
      const prev = await c.query('SELECT plan FROM menu_plans WHERE family_id=$1 AND week_start = ANY($2::date[])', [fid, [addDays(weekStart, -7), addDays(weekStart, -14)]]);
      const prevDishIds = prev.flatMap((r) => M.dishIdsOfPlan(r.plan));
      const gen = old ? old.gen + 1 : 1;
      const keep = old && b.keepLocks !== false ? old.locks : [];
      const r = M.buildWeekPlan({ weekStart, profile, children, today: todayVN(), hidden, prevDishIds, gen, old: old && keep.length ? { plan: old.plan, locks: keep } : null });
      const row = (await c.query(
        `INSERT INTO menu_plans(family_id, week_start, plan, locks, status, gen, created_by, updated_by) VALUES($1,$2,$3,$4,'nhap',$5,$6,$6)
         ON CONFLICT (family_id, week_start) DO UPDATE SET plan=$3, locks=$4, status='nhap', gen=$5, updated_by=$6, updated_at=now(), shop_stale = (menu_plans.shop_synced_at IS NOT NULL)
         RETURNING *`, [fid, weekStart, JSON.stringify(r.plan), keep, gen, me.id]))[0];
      return { plan: planOut(row, r.built), warnings: r.warnings };
    });
  });

  F.post('/menu/week/swap', async (ctx, me, fid) => {
    needEdit(me);
    const b = ctx.body;
    const weekStart = M.cleanWeekStart(b.start, todayVN());
    const cell = cleanCell(b);
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      const row = await loadPlan(c.query, fid, weekStart, true);
      if (!row) throw new ApiError(404, 'not_found', 'Tuần này chưa có thực đơn');
      if (row.locks.includes(M.cellKey(cell.day, cell.meal, cell.slot))) throw new ApiError(409, 'locked', 'Món này đã khóa. Mở khóa rồi hãy đổi.');
      const prof = await loadProfile(c.query, fid);
      let hidden = prof.hidden;
      const cur = (row.plan.days[cell.day - 1].meals[cell.meal].items.find((i) => i.slot === cell.slot) || {}).dishId;
      if (b.hideCurrent === true && cur) {
        if (!hidden.includes(cur)) {
          if (hidden.length >= 200) throw new ApiError(409, 'limit', 'Đã ẩn quá nhiều món (200). Hãy bỏ ẩn bớt trong Hồ sơ ăn uống.');
          hidden = [...hidden, cur];
          await c.query(
            `INSERT INTO menu_profiles(family_id, profile, hidden_dishes, updated_by) VALUES($1,$2,$3,$4)
             ON CONFLICT (family_id) DO UPDATE SET hidden_dishes=$3, updated_by=$4, updated_at=now()`, [fid, JSON.stringify(prof.profile), hidden, me.id]);
        }
      }
      let dishId;
      if (b.dishId !== undefined && b.dishId !== null && b.dishId !== '') {
        dishId = String(b.dishId);
        if (!M.DISH.has(dishId)) throw new ApiError(400, 'invalid_input', 'Không có món này', { field: 'Món' });
        if (hidden.includes(dishId)) throw new ApiError(409, 'hidden', 'Món này đang bị ẩn. Bỏ ẩn trong Hồ sơ ăn uống nếu muốn dùng lại.');
      }
      const attempt = b.attempt === undefined ? 0 : intIn(b.attempt, { min: 0, max: 50, field: 'Lần thử' });
      const next = M.swapCell(row.plan, cell, { dishId, hidden, attempt });
      const upd = (await c.query(
        'UPDATE menu_plans SET plan=$3, updated_by=$4, updated_at=now(), shop_stale=(shop_synced_at IS NOT NULL) WHERE family_id=$1 AND week_start=$2 RETURNING *', [fid, weekStart, JSON.stringify(next), me.id]))[0];
      return { plan: await outFor(c.query, fid, upd), hidden: b.hideCurrent === true ? hidden : undefined };
    });
  });

  function cleanCell(b) {
    const day = intIn(b.day, { min: 1, max: 7, field: 'Ngày' });
    if (!M.MEALS.includes(b.meal)) throw new ApiError(400, 'invalid_input', 'Bữa không hợp lệ', { field: 'Bữa' });
    if (typeof b.slot !== 'string' || !/^[a-z0-9_]{2,12}$/.test(b.slot)) throw new ApiError(400, 'invalid_input', 'Ô món không hợp lệ', { field: 'Ô' });
    return { day, meal: b.meal, slot: b.slot };
  }

  F.get('/menu/week/alternatives', async (ctx, me, fid) => {
    const weekStart = M.cleanWeekStart(ctx.query.start, todayVN());
    const cell = cleanCell({ day: ctx.query.day, meal: ctx.query.meal, slot: ctx.query.slot });
    const row = await loadPlan(query, fid, weekStart);
    if (!row) throw new ApiError(404, 'not_found', 'Tuần này chưa có thực đơn');
    const { hidden } = await loadProfile(query, fid);
    const cur = (row.plan.days[cell.day - 1].meals[cell.meal] || { items: [] }).items.find((i) => i.slot === cell.slot);
    if (!cur) throw new ApiError(404, 'not_found', 'Không có ô này trong thực đơn');
    return { cell, current: M.describeItem(cur, row.locks.includes(M.cellKey(cell.day, cell.meal, cell.slot))), alternatives: M.alternativesFor(row.plan, cell, { hidden }) };
  });

  F.post('/menu/week/lock', async (ctx, me, fid) => {
    needEdit(me);
    const weekStart = M.cleanWeekStart(ctx.body.start, todayVN());
    const cell = cleanCell(ctx.body); const key = M.cellKey(cell.day, cell.meal, cell.slot);
    const on = ctx.body.locked !== false;
    return tx(async (c) => {
      const row = await loadPlan(c.query, fid, weekStart, true);
      if (!row) throw new ApiError(404, 'not_found', 'Tuần này chưa có thực đơn');
      const day = row.plan.days[cell.day - 1];
      if (!day || !day.meals[cell.meal] || !day.meals[cell.meal].items.some((i) => i.slot === cell.slot)) throw new ApiError(404, 'not_found', 'Không có ô này trong thực đơn');
      const locks = on ? [...new Set([...row.locks, key])] : row.locks.filter((k) => k !== key);
      const upd = (await c.query('UPDATE menu_plans SET locks=$3, updated_by=$4, updated_at=now() WHERE family_id=$1 AND week_start=$2 RETURNING *', [fid, weekStart, locks, me.id]))[0];
      return { plan: await outFor(c.query, fid, upd) };
    });
  });

  F.post('/menu/week/status', async (ctx, me, fid) => {
    needManage(me, 'Chỉ chủ gia đình hoặc người quản lý mới chốt thực đơn');
    const weekStart = M.cleanWeekStart(ctx.body.start, todayVN());
    if (!['nhap', 'chot'].includes(ctx.body.status)) throw new ApiError(400, 'invalid_input', 'Trạng thái không hợp lệ', { field: 'Trạng thái' });
    const upd = (await query('UPDATE menu_plans SET status=$3, updated_by=$4, updated_at=now() WHERE family_id=$1 AND week_start=$2 RETURNING *', [fid, weekStart, ctx.body.status, me.id]))[0];
    if (!upd) throw new ApiError(404, 'not_found', 'Tuần này chưa có thực đơn');
    return { plan: await outFor(query, fid, upd) };
  });

  F.del('/menu/week', async (ctx, me, fid) => {
    needManage(me, 'Chỉ chủ gia đình hoặc người quản lý mới xóa thực đơn');
    const weekStart = M.cleanWeekStart(ctx.query.start, todayVN());
    const r = await query('DELETE FROM menu_plans WHERE family_id=$1 AND week_start=$2 RETURNING 1', [fid, weekStart]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Tuần này chưa có thực đơn');
    // các dòng đi chợ từ thực đơn này vẫn giữ nguyên (không mất dữ liệu), chỉ bỏ liên kết tuần
    return { ok: true };
  });

  // ---------- món ăn ----------
  F.post('/menu/hide', async (ctx, me, fid) => {
    const id = String(ctx.body.dishId || '');
    if (!M.DISH.has(id)) throw new ApiError(400, 'invalid_input', 'Không có món này', { field: 'Món' });
    const hide = ctx.body.hidden !== false;
    if (!hide) needManage(me, 'Chỉ chủ gia đình hoặc người quản lý mới bỏ ẩn món'); else needEdit(me);
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      const cur = await loadProfile(c.query, fid);
      let hidden = cur.hidden.filter((x) => x !== id);
      if (hide) { if (hidden.length >= 200) throw new ApiError(409, 'limit', 'Đã ẩn quá nhiều món (200)'); hidden = [...hidden, id]; }
      await c.query(
        `INSERT INTO menu_profiles(family_id, profile, hidden_dishes, updated_by) VALUES($1,$2,$3,$4)
         ON CONFLICT (family_id) DO UPDATE SET hidden_dishes=$3, updated_by=$4, updated_at=now()`, [fid, JSON.stringify(cur.profile), hidden, me.id]);
      return { hidden: hidden.map((x) => ({ id: x, name: (M.DISH.get(x) || {}).name || x })) };
    });
  });

  F.get('/menu/dishes', async (ctx, me, fid) => {
    const { profile, hidden } = await loadProfile(query, fid);
    const built = await builtFor(query, fid, profile);
    if (!built) return { items: [] };
    return { items: M.searchDishes(String(ctx.query.q || '').slice(0, 40), ctx.query.role, built.profile, hidden) };
  });

  F.get('/menu/dishes/:id', async (ctx, me, fid) => {
    const id = String(ctx.params.id);
    if (!M.DISH.has(id)) throw new ApiError(404, 'not_found', 'Không tìm thấy món này');
    const { profile } = await loadProfile(query, fid);
    const built = await builtFor(query, fid, profile);
    const dish = M.DISH.get(id);
    const servings = dish.role === 'chao_bot' ? 1 : (built ? built.servings : dish.servingsBase);
    return { dish: M.dishDetail(id, servings, built ? built.profile : null), disclaimer: M.DISCLAIMER };
  });

  // Hôm nay ăn gì (một dòng trên màn Hôm nay)
  F.get('/menu/today', async (ctx, me, fid) => {
    const today = todayVN(); const weekStart = M.mondayOf(today);
    const row = await loadPlan(query, fid, weekStart);
    if (!row) return { today, plan: null };
    const day = row.plan.days[weekdayISO(today) - 1];
    if (!day) return { today, plan: null };
    const meals = M.MEALS.filter((mk) => day.meals[mk]).map((mk) => [mk, day.meals[mk]]).map(([mk, m]) => ({ meal: mk, label: M.MEAL_LABEL[mk], names: m.items.map((i) => i.name), baby: (m.baby || []).map((b) => b.name) }));
    return { today, weekStart, status: row.status, plan: { meals } };
  });
}
