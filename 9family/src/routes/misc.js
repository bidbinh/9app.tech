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
import { occurrencesIn } from './events.js';
import { raw } from '../http.js';
import { famRoutes } from './common.js';

export function miscRoutes(app) {
  const F = famRoutes(app);

  // ---------- việc chung và mua sắm ----------
  const taskOut = (t) => ({ id: t.id, title: t.title, assigneeId: t.assignee_id, due: t.due_date, done: !!t.done_at, doneAt: t.done_at ? new Date(t.done_at).getTime() : null, doneBy: t.done_name || '', createdBy: t.created_by });
  const shopOut = (s) => ({ id: s.id, text: s.text, bought: !!s.bought_at, addedBy: s.added_name || '', boughtBy: s.bought_name || '', addedById: s.added_by });

  const loadTask = async (id) => (await query('SELECT t.*, d.name AS done_name FROM tasks t LEFT JOIN members d ON d.id = t.done_by WHERE t.id=$1', [id]))[0];

  F.get('/lists', async (ctx, me, fid) => {
    const weekAgo = new Date(clock.now() - 7 * 86400_000).toISOString();
    const tasks = await query(
      `SELECT t.*, d.name AS done_name FROM tasks t LEFT JOIN members d ON d.id = t.done_by
        WHERE t.family_id=$1 AND (t.done_at IS NULL OR t.done_at > $2) ORDER BY (t.done_at IS NOT NULL), t.due_date NULLS LAST, t.created_at`, [fid, weekAgo]);
    const shop = await query(
      `SELECT s.*, a.name AS added_name, b.name AS bought_name FROM shopping s LEFT JOIN members a ON a.id = s.added_by LEFT JOIN members b ON b.id = s.bought_by
        WHERE s.family_id=$1 AND (s.bought_at IS NULL OR s.bought_at > $2) ORDER BY (s.bought_at IS NOT NULL), s.created_at`, [fid, weekAgo]);
    return { tasks: tasks.map(taskOut), shopping: shop.map(shopOut), today: dayOfMs(clock.now()) };
  });

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
    const row = (await query(
      done ? 'UPDATE tasks SET done_at=$3, done_by=$4 WHERE id=$1 AND family_id=$2 AND done_at IS NULL RETURNING *' : 'UPDATE tasks SET done_at=NULL, done_by=NULL, due_fired=false WHERE id=$1 AND family_id=$2 AND done_at IS NOT NULL RETURNING *',
      done ? [id, fid, new Date(clock.now()).toISOString(), me.id] : [id, fid]))[0];
    if (!row) {
      const ex = (await query('SELECT * FROM tasks WHERE id=$1 AND family_id=$2', [id, fid]))[0];
      if (!ex) throw new ApiError(404, 'not_found', 'Không tìm thấy việc này');
      return { task: taskOut(await loadTask(ex.id)), already: true };
    }
    return { task: taskOut(await loadTask(row.id)) };
  });

  F.del('/tasks/:id', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const t = (await query('SELECT created_by, assignee_id FROM tasks WHERE id=$1 AND family_id=$2', [id, fid]))[0];
    if (!t) throw new ApiError(404, 'not_found', 'Không tìm thấy việc này');
    if (!(isManager(me) || t.created_by === me.id)) throw forbidden('Chỉ người tạo hoặc người quản lý mới xóa được');
    await query('DELETE FROM tasks WHERE id=$1', [id]);
    return { ok: true };
  });

  F.post('/shopping', async (ctx, me, fid) => {
    const raw0 = typeof ctx.body.text === 'string' ? ctx.body.text : '';
    const items = raw0.split(/\n|,/).map((s) => cleanText(s, { max: 80, field: 'Món cần mua' })).filter(Boolean).slice(0, 10);
    if (!items.length) throw new ApiError(400, 'invalid_input', 'Hãy gõ món cần mua', { field: 'Món cần mua' });
    return tx(async (c) => {
      await c.query('SELECT id FROM families WHERE id=$1 FOR UPDATE', [fid]);
      const n = (await c.query('SELECT count(*)::int n FROM shopping WHERE family_id=$1', [fid]))[0].n;
      if (n + items.length > config.maxShopping) throw new ApiError(409, 'limit', 'Danh sách mua sắm đã đầy, hãy xóa các món đã mua');
      const rows = [];
      for (const text of items) rows.push((await c.query('INSERT INTO shopping(family_id, text, added_by) VALUES($1,$2,$3) RETURNING *', [fid, text, me.id]))[0]);
      return { items: rows.map((r) => shopOut({ ...r, added_name: me.name })) };
    });
  });

  F.post('/shopping/:id/bought', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const bought = ctx.body.bought !== false;
    const row = (await query(
      bought ? 'UPDATE shopping SET bought_at=$3, bought_by=$4 WHERE id=$1 AND family_id=$2 AND bought_at IS NULL RETURNING *' : 'UPDATE shopping SET bought_at=NULL, bought_by=NULL WHERE id=$1 AND family_id=$2 AND bought_at IS NOT NULL RETURNING *',
      bought ? [id, fid, new Date(clock.now()).toISOString(), me.id] : [id, fid]))[0];
    if (!row && !(await query('SELECT 1 FROM shopping WHERE id=$1 AND family_id=$2', [id, fid])).length) throw new ApiError(404, 'not_found', 'Không tìm thấy món này');
    return { ok: true, already: !row };
  });

  F.del('/shopping/:id', async (ctx, me, fid) => {
    const id = uuidParam(ctx.params.id);
    const s = (await query('SELECT added_by FROM shopping WHERE id=$1 AND family_id=$2', [id, fid]))[0];
    if (!s) throw new ApiError(404, 'not_found', 'Không tìm thấy món này');
    if (!(isManager(me) || s.added_by === me.id)) throw forbidden('Chỉ người thêm hoặc người quản lý mới xóa được');
    await query('DELETE FROM shopping WHERE id=$1', [id]);
    return { ok: true };
  });

  F.post('/shopping/clear-bought', async (ctx, me, fid) => {
    const r = await query('DELETE FROM shopping WHERE family_id=$1 AND bought_at IS NOT NULL RETURNING 1', [fid]);
    return { removed: r.length };
  });

  // ---------- hộp thông báo ----------
  F.get('/notifications', async (ctx, me) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(ctx.query.limit, 10) || 50));
    const rows = await query('SELECT id, type, title, body, link, created_at, read_at FROM notifications WHERE member_id=$1 ORDER BY id DESC LIMIT $2', [me.id, limit]);
    return { items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, at: new Date(n.created_at).getTime(), read: !!n.read_at })) };
  });
  F.post('/notifications/read', async (ctx, me) => {
    ctx.noBump = true;
    const upTo = ctx.body.upTo === undefined ? null : intIn(ctx.body.upTo, { min: 0, max: Number.MAX_SAFE_INTEGER, field: 'Mã' });
    await query('UPDATE notifications SET read_at=$3 WHERE member_id=$1 AND read_at IS NULL AND ($2::bigint IS NULL OR id <= $2)', [me.id, upTo, new Date(clock.now()).toISOString()]);
    return { ok: true };
  });

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
    await tx(async (c) => {
      const n = (await c.query('SELECT count(*)::int n FROM push_subs WHERE member_id=$1', [me.id]))[0].n;
      const exists = (await c.query('SELECT 1 FROM push_subs WHERE member_id=$1 AND endpoint=$2', [me.id, s.endpoint])).length;
      if (!exists && n >= 10) throw new ApiError(409, 'limit', 'Bạn đã bật thông báo trên quá nhiều thiết bị');
      await c.query(
        `INSERT INTO push_subs(member_id, sid, endpoint, p256dh, auth, types) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT (member_id, endpoint) DO UPDATE SET sid=$2, p256dh=$4, auth=$5, types=$6, fail_count=0`, [me.id, ctx.sid, s.endpoint, s.p256dh, s.auth, types]);
    });
    return { ok: true, types };
  });
  F.post('/push/status', async (ctx, me) => {
    ctx.noBump = true;
    let endpoint = '';
    try { endpoint = checkEndpoint(ctx.body.endpoint); } catch { return { subscribed: false }; }
    const r = (await query('SELECT types FROM push_subs WHERE member_id=$1 AND endpoint=$2', [me.id, endpoint]))[0];
    return { subscribed: !!r, types: r ? r.types : [] };
  });
  F.post('/push/types', async (ctx, me) => {
    ctx.noBump = true;
    const endpoint = checkEndpoint(ctx.body.endpoint); const types = typesOf(ctx.body.types);
    const r = await query('UPDATE push_subs SET types=$3 WHERE member_id=$1 AND endpoint=$2 RETURNING 1', [me.id, endpoint, types]);
    if (!r.length) throw new ApiError(404, 'not_found', 'Thiết bị này chưa bật thông báo');
    return { ok: true, types };
  });
  F.post('/push/unsubscribe', async (ctx, me) => {
    ctx.noBump = true;
    let endpoint; try { endpoint = checkEndpoint(ctx.body.endpoint); } catch { return { ok: true }; }
    await query('DELETE FROM push_subs WHERE member_id=$1 AND endpoint=$2', [me.id, endpoint]);
    return { ok: true };
  });

  // ---------- lịch ICS ----------
  F.get('/ics', async (ctx, me) => {
    let t = me.ics_token;
    if (!t) { t = newToken(); await query('UPDATE members SET ics_token=$2 WHERE id=$1', [me.id, t]); }
    return { path: `${config.basePath}/ics/${t}.ics` };
  });
  F.post('/ics/reset', async (ctx, me) => {
    ctx.noBump = true;
    const t = newToken();
    await query('UPDATE members SET ics_token=$2 WHERE id=$1', [me.id, t]);
    return { path: `${config.basePath}/ics/${t}.ics` };
  });

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
    for (const o of await occurrencesIn(query, mem.family_id, from, to)) {
      if (o.memberIds.length && !o.memberIds.includes(mem.id)) continue;
      const desc = [];
      const who = o.childIds.map((id) => kids.get(id)).filter(Boolean);
      if (who.length) desc.push(`Cho: ${who.join(', ')}`);
      if (o.checklist && o.checklist.length) desc.push(`Cần mang: ${o.checklist.join(', ')}`);
      items.push({ uid: `${o.eventId}-${o.day}`, day: o.day, allDay: o.allDay, start: o.start, end: o.end, title: o.title, location: o.location, description: desc.join('\n') });
      if (items.length >= 5000) break;
    }
    const rides = await query('SELECT * FROM rides WHERE family_id=$1 AND p0=$2', [mem.family_id, mem.id]);
    for (let d = today; d <= addDays(today, 60); d = addDays(d, 1)) {
      for (const r of rides) {
        if (r.weekday !== weekdayISO(d)) continue;
        const end = minutesOf(r.at_time) + 30 < 1440 ? `${String(Math.floor((minutesOf(r.at_time) + 30) / 60)).padStart(2, '0')}:${String((minutesOf(r.at_time) + 30) % 60).padStart(2, '0')}` : null;
        items.push({ uid: `ride-${r.id}-${d}`, day: d, allDay: false, start: r.at_time, end, title: `${r.dir === 'dua' ? 'Đưa' : 'Đón'} ${kids.get(r.child_id) || 'con'}`, location: r.place, description: 'Ca đưa đón do bạn phụ trách' });
      }
    }
    const body = buildIcs({ name: `9family - ${mem.fname}`, items, nowMs });
    return raw(body, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="9family.ics"', 'cache-control': 'private, no-cache' });
  }, { limit: 60, limitKey: 'ics' });
}
