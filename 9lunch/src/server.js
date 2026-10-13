import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate, query } from './db.js';
import { resolveSession } from './auth.js';
import { teamRoutes } from './routes/teams.js';
import { mealRoutes } from './routes/meals.js';
import { moneyRoutes } from './routes/money.js';
import { consoleApiRoutes } from './console-api.js';

export function buildApp() {
  const app = createApp();
  app.setAuthResolver(resolveSession);
  teamRoutes(app);
  mealRoutes(app);
  moneyRoutes(app);
  consoleApiRoutes(app);
  app.route('GET', '/healthz', async () => { await query('SELECT 1'); return { ok: true }; });
  return app;
}

export async function start() {
  const problems = productionProblems();
  if (problems.length) {
    console.error(['Cấu hình production không an toàn, từ chối khởi động:'].concat(problems).join('\n - '));
    process.exit(1);
  }
  process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  await migrate();
  const app = buildApp();
  const port = await app.listen(config.port);
  console.log(`9lunch chạy tại http://localhost:${port}${config.basePath}/`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
