import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate } from './db.js';
import { makeAuthResolver } from './auth.js';
import { createNineId } from './nine-id.js';
import { coreRoutes } from './routes/core.js';
import { bookingRoutes } from './routes/booking.js';
import { adminRoutes } from './routes/admin.js';
import { ownerRoutes } from './routes/owner.js';
import { catalogRoutes } from './routes/catalog.js';
import { bankRoutes } from './routes/bank.js';
import { setupRoutes } from './routes/setup.js';
import { publicRoutes } from './routes/public.js';
import { opsRoutes, syncFeed } from './routes/ops.js';
import { cleanup } from './maintenance.js';
import { tx } from './db.js';
import { expireHolds } from './bookings.js';

// idClient: { verify(token) -> { userId, displayName } | null }. Test truyền bản giả; production dùng máy khách 9id.
export function buildApp({ idClient, cfg = config, clock, fetchText } = {}) {
  const app = createApp({ cfg, clock });
  app.setAuthResolver(makeAuthResolver({ idClient }));
  coreRoutes(app, cfg);
  bookingRoutes(app);
  adminRoutes(app);
  ownerRoutes(app);
  catalogRoutes(app);
  bankRoutes(app, cfg);
  setupRoutes(app);
  opsRoutes(app, { fetchText });
  publicRoutes(app, { idClient });
  return app;
}

// Nhả các đơn giữ chỗ quá hạn của mọi org mỗi phút (đặt phòng công khai chỉ giữ vài phút nên không thể chỉ nhả "lười").
export function startExpirer(intervalMs = 60_000) {
  const t = setInterval(async () => {
    try {
      const orgs = await tx((c) => c.query('SELECT id FROM orgs'));
      for (const o of orgs) await tx((c) => expireHolds(c, { orgId: o.id, now: new Date() }));
    } catch (e) { console.error('[expire]', e && e.message); }
  }, intervalMs);
  t.unref();
  // mỗi 30 phút: đồng bộ iCal; mỗi giờ: dọn dữ liệu rác
  let n = 0;
  let syncing = false;
  const slow = setInterval(async () => {
    n += 1;
    if (n % 2 === 0) { try { await tx((c) => cleanup(c, { now: new Date() })); } catch (e) { console.error('[cleanup]', e && e.message); } }
    if (syncing) return; // vòng trước chưa xong thì bỏ lượt, không chạy chồng
    syncing = true;
    try {
      const feeds = await tx((c) => c.query("SELECT id, org_id FROM ical_feeds WHERE status = 'active'"));
      for (const f of feeds) { try { await syncFeed(f.org_id, f.id); } catch { /* lỗi đã ghi vào nguồn */ } }
    } catch (e) { console.error('[ical]', e && e.message); } finally { syncing = false; }
  }, 30 * 60_000);
  slow.unref();
  return () => { clearInterval(t); clearInterval(slow); };
}

export async function start() {
  const problems = productionProblems();
  if (problems.length) {
    console.error(['Cấu hình production không an toàn, từ chối khởi động:'].concat(problems).join('\n - '));
    process.exit(1);
  }
  process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  await migrate();
  const idClient = createNineId({ baseUrl: config.nineIdUrl, keyId: config.nineIdKey, secret: config.nineIdSecret });
  const app = buildApp({ idClient });
  startExpirer();
  const port = await app.listen(config.port);
  console.log(`9stay chạy tại http://localhost:${port}${config.basePath}/`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
