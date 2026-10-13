import { config } from '../config.js';
import { query, tx } from '../db.js';
import { ApiError } from '../errors.js';
import { isManager, forbidden } from '../auth.js';
import { clock } from '../clock.js';
import { cleanText, cleanDay, uuidParam, newToken, intIn, iso } from '../util.js';
import { dayOfMs, addDays, weekdayISO, minutesOf } from '../vn.js';
import { notifyMembers, NOTIFY_TYPES } from '../notify.js';
import { checkEndpoint } from '../push.js';
import { buildIcs } from '../ics.js';
import { occurrencesIn, visibleToChild } from './events.js';
import { raw } from '../http.js';
import { famRoutes } from './common.js';
import { shopOut, SHOP_SELECT } from './menu-shop.js';

export function miscRoutes(app) {
  const F = famRoutes(app);

  // ---------- việc chung và mua sắm ----------
  const taskOut = (t) => ({ id: t.id, title: t.title, assigneeId: t.assignee_id, due: t.due_date, done: !!t.done_at, doneAt: t.done_at ? new Date(t.done_at).getTime() : null, doneBy: t.done_name || '', createdBy: t.created_by });

  const loadTask = async (id) => (await query('SELECT t.*, d.name AS done_name FROM tasks t LEFT JOIN members d ON d.id = t.done_by WHERE t.id=$1', [id]))[0];

  F.get('/lists', async (ctx, me, fid) => {
    const weekAgo = new Date(clock.now() - 7 * 86400_000).toISOString();
    const tasks = await query(
      `SELECT t.*, d.name AS done_name FROM tasks t LEFT JOIN members d ON d.id = t.done_by
        WHERE t.family_id=$1 AND (t.done_at IS NULL OR t.done_at > $2) ORDER BY (t.done_at IS NOT NULL), t.due_date NULLS LAST, t.created_at`, [fid, weekAgo]);
    const shop = await query(
      `${SHOP_SELECT}
        WHERE s.family_id=$1 AND (s.bought_at IS NULL OR s.bought_at > $2) ORDER BY (s.bought_at IS NOT NULL), s.created_at`, [fid, weekAgo]);
    // tài khoản của con: chỉ việc giao cho mình, không thấy danh sách mua sắm
    if (me.role === 'con') return { tasks: tasks.filter((t) => t.assignee_id === me.id).map(taskOut), shopping: [], today: dayOfMs(clock.now()) };
    return { tasks: tasks.map(taskOut), shopping: shop.map(shopOut), today: dayOfMs(clock.now()) };
  }, { con: true });

  async function assigneeOk(c, fid, id) {
    if (!id) return null;
    const m = (await c.query('SELECT id FROM members WHERE id=$1 AND family_id=$2 AND left_at IS NULL AND external=false AND joined_at IS NOT NULL', [uuidParam(id), fid]))[0];
    if (!m) throw new ApiError(400, 'invalid_input', 'Người phụ trách không còn trong gia đình', { field: 'Người phụ trách' });
    return m.id;
  }

  F.post('/tasks', async (ctx, me, fid) => {
    const b = ctx.body;
    const title = cleanText(b.title, { max: 100, min: 1, field: 'Việc cần làm' });
    const due = cleanDay(b.due, 'Hạn', { optional: true });
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      if ((await c.query('SELECT count(*)::int n FROM tasks WHERE family_id=$1', [fid]))[0].n >= config.maxTasks) throw new ApiError(409, 'limit', 'Danh sách việc đã đầy, hãy xóa bớt việc cũ');
      const assignee = await assigneeOk(c, fid, b.assigneeId);
      const t = (await c.query('INSERT INTO tasks(family_id, title, assignee_id, due_date, created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [fid, title, assignee, due, me.id]))[0];
      if (assignee && assignee !== me.id) await notifyMembers(c, { familyId: fid, memberIds: [assignee], type: 'task', title: `${me.name} giao việc cho bạn`, body: title, link: `#/f/${fid}/tasks`, dedupe: `task:${t.id}:assign:${assignee}` });
      return { task: taskOut(t) };
    });
  });

  F.post('/tasks/:id', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id); const b = ctx.body;
    return tx(async (c) => {
      const t = (await c.query('SELECT * FROM tasks WHERE id=$1 AND family_id=$2 FOR UPDATE', [id, fid]))[0];
      if (!t) throw new ApiError(404, 'not_found', 'Không tìm thấy việc này');
      if (!(isManager(me) || t.created_by === me.id || t.assignee_id === me.id)) throw forbidden('Chỉ người giao, người nhận việc hoặc người quản lý mới sửa được');
      const title = b.title !== undefined ? cleanText(b.title, { max: 100, min: 1, field: 'Việc cần làm' }) : t.title;
      const due = b.due !== undefined ? cleanDay(b.due, 'Hạn', { optional: true }) : t.due_date;
      const assignee = b.assigneeId !== undefined ? await assigneeOk(c, fid, b.assigneeId) : t.assignee_id;
      const dueFired = (due !== t.due_date || assignee !== t.assignee_id) ? false : t.due_fired;
      const row = (await c.query('UPDATE tasks SET title=$2, due_date=$3, assignee_id=$4, due_fired=$5 WHERE id=$1 RETURNING *', [id, title, due, assignee, dueFired]))[0];
      if (assignee && assignee !== t.assignee_id && assignee !== me.id) await notifyMembers(c, { familyId: fid, memberIds: [assignee], type: 'task', title: `${me.name} giao việc cho bạn`, body: title, link: `#/f/${fid}/tasks`, dedupe: `task:${id}:assign:${assignee}` });
      return { task: taskOut(row) };
    });
  });

  F.post('/tasks/:id/done', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const done = ctx.body.done !== false;
    if (me.role === 'con' && !(await query('SELECT 1 FROM tasks WHERE id=$1 AND family_id=$2 AND assignee_id=$3', [id, fid, me.id])).length) throw forbidden('Con chỉ đánh dấu xong được việc giao cho mình');
    const row = (await query(
      done ? 'UPDATE tasks SET done_at=$3, done_by=$4 WHERE id=$1 AND family_id=$2 AND done_at IS NULL RETURNING *' : 'UPDATE tasks SET done_at=NULL, done_by=NULL, due_fired=false WHERE id=$1 AND family_id=$2 AND done_at IS NOT NULL RETURNING *',
      done ? [id, fid, new Date(clock.now()).toISOString(), me.id] : [id, fid]))[0];
    if (!row) {
      const ex = (await query('SELECT * FROM tasks WHERE id=$1 AND family_id=$2', [id, fid]))[0];
      if (!ex) throw new ApiError(404, 'not_found', 'Không tìm thấy việc này');
      return { task: taskOut(await loadTask(ex.id)), already: true };
    }
    return { task: taskOut(await loadTask(row.id)) };
  }, { con: true });

  F.del('/tasks/:id', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const t = (await query('SELECT created_by, assignee_id FROM tasks WHERE id=$1 AND family_id=$2', [id, fid]))[0];
    if (!t) throw new ApiError(404, 'not_found', 'Không tìm thấy việc này');
    if (!(isManager(me) || t.created_by === me.id)) throw forbidden('Chỉ người tạo hoặc người quản lý mới xóa được');
    await query('DELETE FROM tasks WHERE id=$1', [id]);
    return { ok: true };
  });

  // Các endpoint mua sắm (thêm, tích, sửa, xóa, dọn, từ thực đơn) nằm ở routes/menu-shop.js

  // ---------- hộp thông báo ----------
  F.get('/notifications', async (ctx, me) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(ctx.query.limit, 10) || 50));
    const rows = await query('SELECT id, type, title, body, link, created_at, read_at FROM notifications WHERE member_id=$1 ORDER BY id DESC LIMIT $2', [me.id, limit]);
    return { items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, at: new Date(n.created_at).getTime(), read: !!n.read_at })) };
  }, { con: true });
  F.post('/notifications/read', async (ctx, me) => {
    ctx.noBump = true;
    const upTo = ctx.body.upTo === undefined ? null : intIn(ctx.body.upTo, { min: 0, max: Number.MAX_SAFE_INTEGER, field: 'Mã' });
    await query('UPDATE notifications SET read_at=$3 WHERE member_id=$1 AND read_at IS NULL AND ($2::bigint IS NULL OR id <= $2)', [me.id, upTo, new Date(clock.now()).toISOString()]);
    return { ok: true };
  }, { con: true });

  // ---------- Web Push ----------
  function subBody(b) {
    const endpoint = checkEndpoint(b.endpoint);
    const k = b.keys || {};
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(String(k.p256dh)) || !/^[A-Za-z0-9_-]{10,100}$/.test(String(k.auth))) throw new ApiError(400, 'invalid_input', 'Khóa đẩy thông báo không hợp lệ');
    return { endpoint, p256dh: k.p256dh, auth: k.auth };
  }
  function typesOf(v) {
    if (v === undefined) return NOTIFY_TYPES;
    if (!Array.isArray(v) || v.some((t) => !NOTIFY_TYPES.includes(t))) throw new ApiError(400, 'invalid_input', 'Loại thông báo không hợp lệ');
    return [...new Set(v)];
  }
  F.post('/push/subscribe', async (ctx, me) => {
    ctx.noBump = true;
    if (!config.vapidPublic || !config.vapidPrivate) throw new ApiError(404, 'push_disabled', 'Thông báo đẩy chưa được bật trên máy chủ');
    const s = subBody(ctx.body); const types = typesOf(ctx.body.types);
    const hide = ctx.body.hide !== false; // mặc định ẩn tên con/địa điểm trên màn hình khóa
    await tx(async (c) => {
      const n = (await c.query('SELECT count(*)::int n FROM push_subs WHERE member_id=$1', [me.id]))[0].n;
      const exists = (await c.query('SELECT 1 FROM push_subs WHERE member_id=$1 AND endpoint=$2', [me.id, s.endpoint])).length;
      if (!exists && n >= 10) throw new ApiError(409, 'limit', 'Bạn đã bật thông báo trên quá nhiều thiết bị');
      await c.query(
        `INSERT INTO push_subs(member_id, user_id, sid, endpoint, p256dh, auth, types, hide) VALUES($1,$8,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (member_id, endpoint) DO UPDATE SET user_id=$8, sid=$2, p256dh=$4, auth=$5, types=$6, hide=$7, fail_count=0`, [me.id, ctx.sid, s.endpoint, s.p256dh, s.auth, types, hide, me.userId || null]);
    });
    return { ok: true, types, hide };
  }, { con: true });
  F.post('/push/status', async (ctx, me) => {
    ctx.noBump = true;
    let endpoint = '';
    try { endpoint = checkEndpoint(ctx.body.endpoint); } catch { return { subscribed: false }; }
    const r = (await query('SELECT types, hide FROM push_subs WHERE member_id=$1 AND endpoint=$2', [me.id, endpoint]))[0];
    return { subscribed: !!r, types: r ? r.types : [], hide: r ? r.hide : true };
  }, { con: true });
  F.post('/push/types', async (ctx, me) => {
    ctx.noBump = true;
    const endpoint = checkEndpoint(ctx.body.endpoint);
    const cur = (await query('SELECT types, hide FROM push_subs WHERE member_id=$1 AND endpoint=$2', [me.id, endpoint]))[0];
    if (!cur) throw new ApiError(404, 'not_found', 'Thiết bị này chưa bật thông báo');
    const types = ctx.body.types === undefined ? cur.types : typesOf(ctx.body.types);
    const hide = typeof ctx.body.hide === 'boolean' ? ctx.body.hide : cur.hide;
    await query('UPDATE push_subs SET types=$3, hide=$4 WHERE member_id=$1 AND endpoint=$2', [me.id, endpoint, types, hide]);
    return { ok: true, types, hide };
  }, { con: true });
  F.post('/push/unsubscribe', async (ctx, me) => {
    ctx.noBump = true;
    let endpoint; try { endpoint = checkEndpoint(ctx.body.endpoint); } catch { return { ok: true }; }
    await query('DELETE FROM push_subs WHERE member_id=$1 AND endpoint=$2', [me.id, endpoint]);
    return { ok: true };
  }, { con: true });

  // ---------- lịch ICS ----------
  F.get('/ics', async (ctx, me) => {
    let t = me.ics_token;
    if (!t) { t = newToken(); await query('UPDATE members SET ics_token=$2 WHERE id=$1', [me.id, t]); }
    return { path: `${config.basePath}/ics/${t}.ics` };
  }, { con: true });
  F.post('/ics/reset', async (ctx, me) => {
    ctx.noBump = true;
    const t = newToken();
    await query('UPDATE members SET ics_token=$2 WHERE id=$1', [me.id, t]);
    return { path: `${config.basePath}/ics/${t}.ics` };
  }, { con: true });

  app.route('GET', '/ics/:file', async (ctx) => {
    const m = /^([A-Za-z0-9_-]{43})\.ics$/.exec(ctx.params.file);
    if (!m) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const mem = (await query('SELECT m.*, f.name AS fname FROM members m JOIN families f ON f.id=m.family_id WHERE m.ics_token=$1 AND m.left_at IS NULL AND m.external=false', [m[1]]))[0];
    if (!mem) throw new ApiError(404, 'not_found', 'Không tìm thấy');
    const nowMs = clock.now(); const today = dayOfMs(nowMs);
    const from = addDays(today, -30); const to = addDays(today, 365);
    const kids = new Map((await query('SELECT id, name FROM children WHERE family_id=$1', [mem.family_id])).map((c) => [c.id, c.name]));
    const items = [];
    // occurrencesIn giới hạn khoảng ngày ở tầng route, ở đây gọi trực tiếp nên không bị giới hạn 62 ngày
    const conView = mem.role === 'con' ? { id: mem.id, childIds: (await query('SELECT id FROM children WHERE family_id=$1 AND linked_user_id=$2 AND archived_at IS NULL', [mem.family_id, mem.user_id])).map((r) => r.id) } : null;
    for (const o of await occurrencesIn(query, mem.family_id, from, to)) {
      if (conView ? !visibleToChild(o, conView) : (o.memberIds.length && !o.memberIds.includes(mem.id))) continue;
      const desc = [];
      const who = o.childIds.map((id) => kids.get(id)).filter(Boolean);
      if (who.length) desc.push(`Cho: ${who.join(', ')}`);
      if (o.checklist && o.checklist.length) desc.push(`Cần mang: ${o.checklist.join(', ')}`);
      items.push({ uid: `${o.eventId}-${o.day}`, day: o.day, allDay: o.allDay, start: o.start, end: o.end, title: o.title, location: o.location, description: desc.join('\n') });
      if (items.length >= 5000) break;
    }
    const last = addDays(today, 60);
    const rideEnd = (t) => (minutesOf(t) + 30 < 1440 ? `${String(Math.floor((minutesOf(t) + 30) / 60)).padStart(2, '0')}:${String((minutesOf(t) + 30) % 60).padStart(2, '0')}` : null);
    const rideItem = (key, d, r) => ({ uid: `ride-${key}-${d}`, day: d, allDay: false, start: r.at_time, end: rideEnd(r.at_time), title: `${r.dir === 'dua' ? 'Đưa' : 'Đón'} ${kids.get(r.child_id) || 'con'}`, location: r.place, description: 'Ca đưa đón do bạn phụ trách' });
    // ca đã sinh theo ngày (có thể đã ghi đè người, đổi giờ hoặc bỏ qua) quyết định trước; khuôn tuần chỉ bù cho ngày chưa có ca
    const inst = await query('SELECT id, ride_id, child_id, dir, day, at_time, place, p0, state FROM ride_days WHERE family_id=$1 AND day BETWEEN $2 AND $3', [mem.family_id, today, last]);
    const instKeys = new Set(inst.filter((x) => x.ride_id).map((x) => x.ride_id + '|' + x.day));
    for (const x of inst) if (x.p0 === mem.id && x.state !== 'bo_qua') items.push(rideItem(x.id, x.day, x));
    const rides = await query('SELECT * FROM rides WHERE family_id=$1 AND p0=$2', [mem.family_id, mem.id]);
    for (let d = today; d <= last; d = addDays(d, 1)) {
      for (const r of rides) {
        if (r.weekday !== weekdayISO(d) || instKeys.has(r.id + '|' + d)) continue;
        items.push(rideItem(r.id, d, r));
      }
    }
    const body = buildIcs({ name: `9family - ${mem.fname}`, items, nowMs });
    return raw(body, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="9family.ics"', 'cache-control': 'private, no-cache' });
  }, { limit: 60, limitKey: 'ics' });
}
