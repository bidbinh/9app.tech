import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate, query } from './db.js';
import { resolveSession } from './auth.js';
import { accountRoutes } from './routes/account.js';
import { idRoutes } from './routes/id.js';
import { studentRoutes } from './routes/students.js';
import { lessonRoutes } from './routes/lessons.js';
import { moneyRoutes } from './routes/money.js';
import { publicRoutes } from './routes/public.js';
import { consoleApiRoutes } from './console-api.js';

// Dọn dữ liệu hết hạn: phiên quá hạn, mã ghép, khóa idempotency cũ
export async function maintenance() {
  await query("DELETE FROM sessions WHERE last_used_at < now() - make_interval(days => $1)", [config.sessionDays]);
  await query("DELETE FROM pair_codes WHERE expires_at < now() - interval '1 day'");
  await query("DELETE FROM idem WHERE created_at < now() - interval '2 days'");
  // chính sách lưu giữ: IP tạo tài khoản chỉ giữ 30 ngày (để giới hạn theo giờ); tài khoản bỏ hoang bị xóa cứng
  // (không hoạt động 365 ngày và chưa có học sinh, hoặc không hoạt động 730 ngày)
  await query("UPDATE tutors SET created_ip = NULL WHERE created_ip IS NOT NULL AND created_at < now() - interval '30 days'");
  await query("DELETE FROM tutors t WHERE t.last_seen_at < now() - interval '730 days' OR (t.last_seen_at < now() - interval '365 days' AND NOT EXISTS (SELECT 1 FROM students s WHERE s.tutor_id = t.id))");
}

export function buildApp() {
  const app = createApp();
  app.setAuthResolver(resolveSession);
  accountRoutes(app);
  idRoutes(app);
  studentRoutes(app);
  lessonRoutes(app);
  moneyRoutes(app);
  publicRoutes(app);
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
  setInterval(() => { maintenance().catch((e) => console.error('[maintenance]', e && e.message)); }, 6 * 3600_000).unref();
  const app = buildApp();
  const port = await app.listen(config.port);
  console.log(`9tutor chạy tại http://localhost:${port}${config.basePath}/`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
