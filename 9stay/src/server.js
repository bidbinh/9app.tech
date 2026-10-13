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

// idClient: { verify(token) -> { userId, displayName } | null }. Test truyền bản giả; production dùng máy khách 9id.
export function buildApp({ idClient, cfg = config, clock } = {}) {
  const app = createApp({ cfg, clock });
  app.setAuthResolver(makeAuthResolver({ idClient }));
  coreRoutes(app, cfg);
  bookingRoutes(app);
  adminRoutes(app);
  ownerRoutes(app);
  catalogRoutes(app);
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
  const idClient = createNineId({ baseUrl: config.nineIdUrl, keyId: config.nineIdKey, secret: config.nineIdSecret });
  const app = buildApp({ idClient });
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
