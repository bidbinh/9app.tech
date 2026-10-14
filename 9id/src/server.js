import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate, query } from './db.js';
import { resolveSession } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { phoneRoutes } from './routes/phone.js';
import { familyRoutes } from './routes/families.js';
import { internalRoutes } from './internal.js';
import { oauthRoutes } from './oauth.js';
import { consoleApiRoutes } from './console-api.js';

// Dọn dữ liệu hết hạn (chính sách lưu giữ, xem spec mục 10)
export async function maintenance() {
  await query("DELETE FROM otps WHERE created_at < now() - interval '1 day'");
  await query("DELETE FROM tickets WHERE expires_at < now() - interval '1 day'");
  await query('DELETE FROM sessions WHERE last_used_at < now() - make_interval(days => $1)', [config.sessionDays]);
  await query("UPDATE invitations SET status='expired', decided_at=now() WHERE status IN ('pending','awaiting') AND expires_at < now()");
  await query("DELETE FROM invitations WHERE status NOT IN ('pending','awaiting') AND COALESCE(decided_at, expires_at) < now() - interval '60 days'");
  await query("DELETE FROM internal_nonces WHERE at < now() - interval '10 minutes'");
  await query("DELETE FROM idem WHERE created_at < now() - interval '1 day'");
  await query("DELETE FROM throttle WHERE (locked_until IS NULL OR locked_until < now()) AND window_start < now() - interval '2 hours'");
  await query("UPDATE family_claims SET status='expired' WHERE status='open' AND expires_at < now()");
  await query("DELETE FROM auth_codes WHERE expires_at < now() - interval '1 hour'");
  await query('DELETE FROM app_sessions WHERE expires_at < now()');
  await query("DELETE FROM pow_used WHERE at < now() - interval '1 hour'");
  await query("DELETE FROM devices WHERE last_used_at < now() - interval '400 days'");
  await query("DELETE FROM notices WHERE created_at < now() - interval '90 days'");
  await query("UPDATE phone_changes SET old_phone = NULL WHERE old_phone IS NOT NULL AND changed_at < now() - interval '8 days'");
  await query("DELETE FROM phone_changes WHERE changed_at < now() - interval '90 days'");
  await query("DELETE FROM audit WHERE at < now() - interval '180 days'");
}

export function buildApp() {
  const app = createApp();
  app.setAuthResolver(resolveSession);
  authRoutes(app);
  accountRoutes(app);
  phoneRoutes(app);
  familyRoutes(app);
  internalRoutes(app);
  oauthRoutes(app);
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
  await maintenance().catch((e) => console.error('[maintenance]', e && e.message));
  setInterval(() => { maintenance().catch((e) => console.error('[maintenance]', e && e.message)); }, 3600_000).unref();
  const app = buildApp();
  const port = await app.listen(config.port);
  console.log(`9id chạy tại http://localhost:${port}${config.basePath}/`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
