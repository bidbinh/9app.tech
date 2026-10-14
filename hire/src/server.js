import { fileURLToPath } from 'node:url';
import { createApp } from './http.js';
import { config, productionProblems } from './config.js';
import { migrate, query } from './db.js';
import { resolveSession } from './auth.js';
import { publicRoutes } from './routes/public.js';
import { employerRoutes } from './routes/employer.js';
import { accountRoutes } from './routes/account.js';
import { consoleApiRoutes } from './console-api.js';

export function buildApp() {
  const app = createApp();
  app.setAuthResolver(resolveSession);
  publicRoutes(app);
  employerRoutes(app);
  accountRoutes(app);
  consoleApiRoutes(app);
  app.route('GET', '/healthz', async () => { await query('SELECT 1'); return { ok: true }; });
  return app;
}

// Dọn dữ liệu cũ: hồ sơ ứng viên của tin đã hết hạn/đóng quá N ngày, tin quá cũ, hạn mức cũ, báo cáo và lượt xem của tin đã gỡ.
export async function sweep() {
  const d = config.retainApplicationsDays;
  const apps = await query(
    `DELETE FROM applications a USING jobs j WHERE j.id = a.job_id
        AND ((j.status = 'dang' AND j.expires_at < now() - make_interval(days => $1))
          OR (j.status = 'dong' AND j.closed_at < now() - make_interval(days => $1))) RETURNING a.id`, [d]);
  // hồ sơ của tin đã ẩn (bị báo cáo) cũng không giữ quá hạn
  const hidden = await query("DELETE FROM applications a USING jobs j WHERE j.id = a.job_id AND j.status = 'an' AND j.updated_at < now() - make_interval(days => $1) RETURNING a.id", [d]);
  const jobs = await query(
    `DELETE FROM jobs WHERE (status = 'dang' AND expires_at < now() - make_interval(days => $1))
        OR (status = 'dong' AND closed_at < now() - make_interval(days => $1)) RETURNING id`, [d + 30]);
  await query("DELETE FROM quota WHERE at < now() - interval '3 days'");
  // tin bị ẩn quá hạn: bỏ số điện thoại, địa chỉ (giữ băm trong bảng blocked)
  await query("UPDATE jobs SET contact_phone = '', address = '' WHERE status = 'an' AND updated_at < now() - make_interval(days => $1) AND (contact_phone <> '' OR address <> '')", [d]);
  // phiên quá hạn cookie, IP quá thời hạn lưu, báo cáo cũ
  await query("DELETE FROM phien WHERE created_at < now() - make_interval(days => $1)", [config.sessionDays]);
  await query("UPDATE jobs SET created_ip = NULL WHERE created_ip IS NOT NULL AND created_at < now() - make_interval(days => $1)", [config.ipRetainDays]);
  await query("UPDATE employers SET created_ip = NULL WHERE created_ip IS NOT NULL AND created_at < now() - make_interval(days => $1)", [config.ipRetainDays]);
  await query("DELETE FROM reports r USING jobs j WHERE j.id = r.job_id AND j.status <> 'an' AND r.created_at < now() - interval '90 days'");
  return { applications: apps.length + hidden.length, jobs: jobs.length };
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
  console.log(`9hire chạy tại http://localhost:${port}${config.basePath}/`);
  const run = () => sweep().catch((e) => console.error('[sweep]', e && e.message));
  run();
  const timer = setInterval(run, 3600_000);
  timer.unref();
  const stop = async () => { clearInterval(timer); await app.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
