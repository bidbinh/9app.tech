import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate, query } from './db.js';
import { resolveSession } from './auth.js';
import { familyRoutes } from './routes/families.js';
import { rideRoutes } from './routes/rides.js';
import { eventRoutes } from './routes/events.js';
import { miscRoutes } from './routes/misc.js';
import { menuRoutes } from './routes/menu.js';
import { shoppingRoutes } from './routes/menu-shop.js';
import { schoolRoutes } from './routes/school.js';
import { healthRoutes } from './routes/health.js';
import { moneyRoutes } from './routes/money.js';
import { consoleApiRoutes } from './console-api.js';
import { startScheduler, stopScheduler } from './scheduler.js';

export function buildApp() {
  const app = createApp();
  app.setAuthResolver(resolveSession);
  familyRoutes(app);
  rideRoutes(app);
  eventRoutes(app);
  miscRoutes(app);
  shoppingRoutes(app);
  menuRoutes(app);
  schoolRoutes(app);
  healthRoutes(app);
  moneyRoutes(app);
  consoleApiRoutes(app);
  app.route('GET', '/healthz', async () => { await query('SELECT 1'); return { ok: true }; });
  return app;
}

export async function start({ scheduler = true } = {}) {
  const problems = productionProblems();
  if (problems.length) { console.error(['Cấu hình production chưa đúng, không khởi động:', ...problems.map((p) => ' - ' + p)].join('\n')); throw new Error('cấu hình production không hợp lệ'); }
  await migrate();
  const app = buildApp();
  const port = await app.listen(config.port);
  console.log(`9family chạy tại http://localhost:${port}${config.basePath}/`);
  if (scheduler) startScheduler();
  const stop = async () => { stopScheduler(); await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
