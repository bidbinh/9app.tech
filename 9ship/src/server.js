import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate, query } from './db.js';
import * as worker from './worker.js';
import * as registry from './carriers/index.js';
import { mockControl } from './carriers/mock.js';
import { syncPickupPoints } from './places.js';
import { expirePending } from './topup.js';
import { quotesRoutes } from './routes/quotes.js';
import { authRoutes } from './routes/auth.js';
import { moneyRoutes } from './routes/money.js';
import { shipmentRoutes } from './routes/shipments.js';
import { webhookRoutes } from './routes/webhooks.js';
import { adminRoutes } from './routes/admin.js';
import { ApiError } from './errors.js';

export function buildApp() {
  const app = createApp();
  authRoutes(app);
  quotesRoutes(app);
  moneyRoutes(app);      // đăng ký trước webhookRoutes: /v1/webhooks/bank phải khớp trước /v1/webhooks/:carrier
  shipmentRoutes(app);
  webhookRoutes(app);
  adminRoutes(app);

  app.route('GET', '/healthz', async () => {
    await query('SELECT 1');
    return { ok: true };
  });

  // Chế độ demo (không bao giờ bật ở production): đẩy hành trình của đơn mock để xem luồng.
  if (!config.production && config.mockCarriers) {
    app.route('POST', '/v1/dev/mock/advance', async (ctx) => {
      const { code, status } = ctx.body || {};
      if (!code || !status) throw new ApiError(400, 'invalid_request', 'Cần code và status');
      const ev = mockControl.advance(code, status);
      return { ok: true, event: ev };
    }, { auth: 'user' });
  }
  return app;
}

export async function start() {
  const problems = productionProblems();
  if (problems.length && process.env.ALLOW_UNSAFE_PRODUCTION !== '1') {
    console.error(['Cấu hình production không an toàn, từ chối khởi động:'].concat(problems).join('\n - '));
    process.exit(1);
  }
  await migrate();
  registry.initDefault();
  const external = await registry.loadExternal();
  if (external.length) console.log('Adapter ngoài đã nạp:', external.join(', '));
  const n = await syncPickupPoints();
  const app = buildApp();
  const port = await app.listen(config.port);
  worker.start(5000);
  setInterval(() => { expirePending().catch(() => {}); }, 60_000).unref();
  console.log(`9Ship chạy tại http://localhost:${port}${config.basePath}/ (${n} điểm nhận gửi)`);
  const stop = async () => { worker.stop(); await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
