import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate, query } from './db.js';
import { resolveSession } from './auth.js';
import { apiRoutes } from './routes/api.js';
import { seedFromEnv } from './registry.js';
import * as sync from './sync.js';

export function buildApp() {
  const app = createApp();
  app.setAuthResolver(resolveSession);
  apiRoutes(app);
  app.route('GET', '/healthz', async () => { await query('SELECT 1'); return { ok: true }; });
  return app;
}

export async function start() {
  const problems = productionProblems();
  if (problems.length) {
    console.error(['Cấu hình production không an toàn, từ chối khởi động:'].concat(problems).join('\n - '));
    process.exit(1);
  }
  await migrate();
  const seeded = await seedFromEnv();
  const app = buildApp();
  const port = await app.listen(config.port);
  sync.start();
  console.log(`9app Console chạy tại http://localhost:${port}${config.basePath}/ (${seeded} app nạp từ CONSOLE_APPS)`);
  const stop = async () => { sync.stop(); await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
