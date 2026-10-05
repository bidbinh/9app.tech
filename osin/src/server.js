import { fileURLToPath } from 'node:url';
import { createApp, raw } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate } from './db.js';
import { makeAuth } from './auth.js';
import { createMockIdentity, createIdIdentity } from './identity.js';
import { createLlm } from './llm/index.js';
import { createRegistry } from './apps.js';
import { loadSearchIndex } from './tools/search.js';
import { apiRoutes } from './routes/api.js';
import { consoleApiRoutes } from './console-api.js';
import { maintenance } from './store.js';
import { OSIN_SEARCH_INDEX } from './osin-index.js';
import { query } from './db.js';
import { logEvent, logError } from './util.js';

/** Danh tính giả hoặc khóa mặc định dành cho phát triển thì CHỈ nghe trên loopback, không bao giờ mở ra mạng. */
export function chooseHost({ secretFromEnv, identityKind, host }) {
  return !secretFromEnv || identityKind === 'mock' ? '127.0.0.1' : (host || undefined);
}

/** Dựng ứng dụng. `overrides` cho phép test/e2e thay identity, llm, registry bằng bản giả. */
export function buildApp(overrides = {}) {
  const identity = overrides.identity || (config.identity === '9id'
    ? createIdIdentity({ url: config.idUrl, keyId: config.idKeyId, secret: config.idSecret, timeoutMs: config.idTimeoutMs })
    : createMockIdentity());
  const llm = overrides.llm || createLlm(config);
  const registry = overrides.registry || createRegistry({ apps: config.apps, searchEntries: loadSearchIndex(config.searchDir || undefined), config });
  const deps = { identity, llm, registry };
  const app = createApp();
  app.setAuthResolver(makeAuth(identity));
  apiRoutes(app, deps);
  consoleApiRoutes(app, deps);
  app.route('GET', '/healthz', async () => { await query('SELECT 1'); return { ok: true }; });
  app.route('GET', '/search-index.json', async () => raw(JSON.stringify(OSIN_SEARCH_INDEX), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }));
  app.deps = deps;
  return app;
}

export async function start() {
  const problems = productionProblems();
  if (config.envInvalid) problems.push(`NODE_ENV="${config.nodeEnv}" không hợp lệ (chỉ nhận production, development hoặc test)`);
  if (problems.length) {
    console.error(['Cấu hình production không an toàn, từ chối khởi động:'].concat(problems).join('\n - '));
    process.exit(1);
  }
  process.on('unhandledRejection', (e) => logError('unhandledRejection', e));
  await migrate();
  await maintenance().catch((e) => logError('maintenance', e));
  setInterval(() => { maintenance().catch((e) => logError('maintenance', e)); }, 6 * 3600_000).unref();
  const app = buildApp();
  // danh tính giả hoặc khóa mặc định dành cho phát triển: chỉ nghe trên loopback, không bao giờ mở ra mạng
  const devOnly = chooseHost({ secretFromEnv: config.secretFromEnv, identityKind: app.deps.identity.kind, host: config.host }) === '127.0.0.1';
  if (devOnly && config.production) { console.error('Từ chối khởi động: danh tính giả/khóa mặc định không dùng được ở production'); process.exit(1); }
  const port = await app.listen(config.port, chooseHost({ secretFromEnv: config.secretFromEnv, identityKind: app.deps.identity.kind, host: config.host }));
  logEvent('listen', { port, base: config.basePath, ai: app.deps.llm.kind, identity: app.deps.identity.kind, apps: app.deps.registry.appIds().length });
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { logError('start_failed', e); process.exit(1); });
}
