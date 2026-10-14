import { tx } from '../db.js';
import { AppError } from '../errors.js';
import { requirePerm } from '../auth.js';
import { audit } from '../audit.js';
import { rawResponse } from '../http.js';
import { listTasks, setTaskStatus, createManualTask } from '../housekeeping.js';
import { addFeed, listFeeds, setFeedStatus, applyFeed, fetchIcs, recordFeedError, ensureExportToken, exportIcs } from '../ical.js';

// Đồng bộ một nguồn: tải ngoài giao dịch (mạng chậm không giữ kết nối CSDL), rồi áp trong một giao dịch.
export async function syncFeed(orgId, feedId, { now = new Date(), fetchText = fetchIcs } = {}) {
  const feed = await tx(async (c) => (await c.query("SELECT url FROM ical_feeds WHERE id = $1 AND org_id = $2 AND status = 'active'", [feedId, orgId]))[0]);
  if (!feed) throw new AppError('not_found', 'Không tìm thấy nguồn đang bật', 404);
  let text;
  try { text = await fetchText(feed.url); } catch (e) {
    const msg = e instanceof AppError ? e.message : 'Không tải được nguồn iCal';
    await tx((c) => recordFeedError(c, { feedId, message: msg, now }));
    throw e instanceof AppError ? e : new AppError('feed_error', msg, 502);
  }
  try {
    return await tx((c) => applyFeed(c, { orgId, feedId, text }, { now }));
  } catch (e) {
    await tx((c) => recordFeedError(c, { feedId, message: e instanceof AppError ? e.message : 'Lỗi xử lý', now }));
    throw e;
  }
}

export function opsRoutes(app, { fetchText } = {}) {
  // ---- Buồng phòng ----
  app.route('GET', '/api/housekeeping', async (ctx) => {
    requirePerm(ctx, 'housekeeping.read');
    return { tasks: await tx((c) => listTasks(c, { orgId: ctx.member.orgId, now: ctx.now })) };
  });
  app.route('POST', '/api/housekeeping/:id/status', async (ctx) => {
    requirePerm(ctx, 'housekeeping.update');
    return tx((c) => setTaskStatus(c, { orgId: ctx.member.orgId, taskId: ctx.params.id, status: ctx.body.status, by: ctx.member.id }, { now: ctx.now }));
  });
  app.route('POST', '/api/housekeeping', async (ctx) => {
    requirePerm(ctx, 'housekeeping.create');
    return tx((c) => createManualTask(c, { orgId: ctx.member.orgId, unitId: ctx.body.unitId, dueDate: ctx.body.dueDate, note: ctx.body.note ?? '' }));
  });

  // ---- iCal ----
  app.route('GET', '/api/ical/feeds', async (ctx) => {
    requirePerm(ctx, 'ical.manage');
    return { feeds: await tx((c) => listFeeds(c, { orgId: ctx.member.orgId })) };
  });
  app.route('POST', '/api/ical/feeds', async (ctx) => {
    requirePerm(ctx, 'ical.manage');
    return tx(async (c) => {
      const r = await addFeed(c, { orgId: ctx.member.orgId, unitId: ctx.body.unitId, name: ctx.body.name, url: ctx.body.url });
      await audit(c, { orgId: ctx.member.orgId, actor: ctx.member.id, action: 'ical.feed.add', target: r.id, data: { unitId: ctx.body.unitId } });
      return r;
    });
  });
  app.route('POST', '/api/ical/feeds/:id/status', async (ctx) => {
    requirePerm(ctx, 'ical.manage');
    await tx((c) => setFeedStatus(c, { orgId: ctx.member.orgId, feedId: ctx.params.id, status: ctx.body.status }));
    return { ok: true };
  });
  app.route('POST', '/api/ical/feeds/:id/sync', async (ctx) => {
    requirePerm(ctx, 'ical.manage');
    return syncFeed(ctx.member.orgId, ctx.params.id, { now: ctx.now, fetchText });
  }, { limit: 20 });
  app.route('POST', '/api/ical/export/:unitId', async (ctx) => {
    requirePerm(ctx, 'ical.manage');
    const token = await tx((c) => ensureExportToken(c, { orgId: ctx.member.orgId, unitId: ctx.params.unitId }));
    return { path: `/api/ical/out/${token}.ics` };
  });
  // OTA đọc lịch bằng địa chỉ bí mật, không cookie.
  app.route('GET', '/api/ical/out/:file', async (ctx) => {
    const m = /^([0-9a-f]{48})\.ics$/.exec(ctx.params.file);
    if (!m) throw new AppError('not_found', 'Không tìm thấy', 404);
    const body = await tx((c) => exportIcs(c, { token: m[1] }, { now: ctx.now }));
    return rawResponse(body, { contentType: 'text/calendar; charset=utf-8' });
  }, { auth: 'none', limit: 60 });
}
