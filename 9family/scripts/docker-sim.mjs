// Chạy: node scripts/docker-sim.mjs   (khi máy không có docker)
// Mô phỏng `docker build`: chép đúng các tệp mà Dockerfile COPY ra thư mục tạm (đã áp .dockerignore), npm ci --omit=dev, chạy server với PostgreSQL nhúng.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dock = fs.readFileSync(path.join(SRC, 'Dockerfile'), 'utf8');
const ign = fs.readFileSync(path.join(SRC, '.dockerignore'), 'utf8').split(/\r?\n/).filter(Boolean);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '9family-docksim-'));
console.log('thư mục tạm:', tmp);
const ignored = (rel) => ign.some((p) => {
  if (p.startsWith('!')) return false;
  const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '(/|$)');
  return re.test(rel);
});
function copyRec(from, to, rel) {
  if (fs.statSync(from).isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) copyRec(path.join(from, f), path.join(to, f), rel ? rel + '/' + f : f);
  } else {
    // ngoại lệ "!" trong .dockerignore
    const negated = ign.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
    if (ignored(rel) && !negated.includes(rel)) { console.log('  (bị .dockerignore loại)', rel); return; }
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to);
  }
}
const copies = [...dock.matchAll(/^COPY\s+(.+?)\s+(\S+)\s*$/gm)].map((m) => [m[1].trim().split(/\s+/), m[2]]);
for (const [srcs, dest] of copies) {
  for (const s of srcs) {
    const from = path.join(SRC, s);
    if (!fs.existsSync(from)) throw new Error('Dockerfile COPY nguồn không tồn tại: ' + s);
    const to = dest.endsWith('/') ? path.join(tmp, dest, path.basename(s)) : path.join(tmp, dest);
    copyRec(from, to, s.replace(/\\/g, '/'));
    console.log('COPY', s, '->', dest);
  }
}
console.log('npm ci --omit=dev ...');
execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: tmp, stdio: 'inherit' });
if (fs.existsSync(path.join(tmp, 'node_modules', 'embedded-postgres'))) throw new Error('devDependencies lọt vào bản chạy');

const { startEmbedded } = await import(pathToFileURL(path.join(SRC, 'scripts', 'embedded-pg.js')).href);
const pg = await startEmbedded({ database: 'family_docksim' });
const port = 30000 + Math.floor(Math.random() * 20000);
const env = { ...process.env, NODE_ENV: 'development', PORT: String(port), DATABASE_URL: pg.url, NINE_ID_SECRET: 'x'.repeat(40), NINE_ID_URL: 'http://127.0.0.1:9/id', BASE_PATH: '/9family' };
const child = spawn(process.execPath, ['src/server.js'], { cwd: tmp, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 60 && !ok; i++) { await sleep(500); try { const r = await fetch(`http://127.0.0.1:${port}/healthz`); ok = r.ok; } catch { /* chờ */ } }
const results = [];
const chk = (name, cond, extra = '') => { results.push([name, !!cond]); console.log((cond ? 'ok   ' : 'LỖI ') + name + (cond ? '' : ' ' + extra)); };
chk('server khởi động và /healthz 200 (migration chạy đủ)', ok, log.slice(-600));
if (ok) {
  const base = `http://127.0.0.1:${port}/9family/`;
  const idx = await (await fetch(base)).text();
  const assets = [...idx.matchAll(/(?:src|href)="([^":]+\.(?:js|css|png|svg|webmanifest))"/g)].map((m) => m[1]);
  let bad = [];
  for (const a of assets) { const r = await fetch(new URL(a, base)); if (!r.ok) bad.push(a + ' ' + r.status); }
  chk(`mọi tệp tĩnh trong index.html tải được (${assets.length} tệp)`, !bad.length, bad.join(', '));
  chk('/api/config trả JSON', (await (await fetch(base + 'api/config')).json()).id);
  const pubFiles = fs.readdirSync(path.join(SRC, 'public'), { recursive: true }).filter((f) => /\.(js|css)$/.test(f)).map((f) => f.replace(/\\/g, '/'));
  const missing = [];
  for (const f of pubFiles) { const r = await fetch(new URL(f, base)); if (!r.ok) missing.push(f); }
  chk(`mọi tệp public/*.js|css (kể cả thư mục con) có trong bản chạy (${pubFiles.length})`, !missing.length, missing.join(', '));
}
child.kill();
// nạp mọi mô-đun trong src + đọc dữ liệu lười (WHO, TCMR, thực đơn) từ BẢN SAO
const modsOut = [];
for (const f of fs.readdirSync(path.join(tmp, 'src'), { recursive: true }).filter((f) => f.endsWith('.js'))) {
  if (f.replace(/\\/g, '/') === 'server.js') continue;
  try { await import(pathToFileURL(path.join(tmp, 'src', f)).href); } catch (e) { modsOut.push(f + ': ' + e.message.split('\n')[0]); }
}
chk('nạp được mọi mô-đun trong src của bản sao', !modsOut.length, modsOut.join(' | '));
try {
  const who = await import(pathToFileURL(path.join(tmp, 'src/health/who.js')).href);
  const c = who.lmsAt('wfa', 'nu', 12);
  const vx = await import(pathToFileURL(path.join(tmp, 'src/health/vaccines.js')).href);
  const sch = vx.scheduleFor('2026-01-05');
  chk('bảng WHO và lịch tiêm TCMR đọc được từ data/ của bản sao', c && sch && sch.length > 3, JSON.stringify(c));
  const menu = await import(pathToFileURL(path.join(tmp, 'src/menu/index.js')).href);
  chk('kho món ăn nạp được từ src/menu/lib/data', menu.DATA.dishes.items.length > 50, String(menu.DATA.dishes.items.length));
} catch (e) { chk('đọc dữ liệu lười', false, e.stack.split('\n').slice(0, 3).join(' | ')); }
await pg.stop();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.every((r) => r[1]) ? '\nMÔ PHỎNG DOCKER: ĐẠT ' + results.length + '/' + results.length : '\nMÔ PHỎNG DOCKER: CÓ LỖI');
process.exit(results.every((r) => r[1]) ? 0 : 1);
