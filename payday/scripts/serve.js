// Máy chủ tĩnh nhỏ cho kiểm thử: phục vụ thư mục payday tại /payday/.
// Dùng riêng: node scripts/serve.js  (cổng ngẫu nhiên từ 22000 trở lên, in ra màn hình)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ics': 'text/calendar' };

function handler(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/id/api/me') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"user":null}'); }   // 9id giả: chưa đăng nhập (thẻ đồng bộ chỉ cần biết điều này)
  let file = null;
  if (p === '/payday') { res.writeHead(301, { Location: '/payday/' }); return res.end(); }
  if (p.startsWith('/payday/')) {
    p = p.slice('/payday/'.length) || 'index.html';
    if (p.endsWith('/')) p += 'index.html';
    file = path.normalize(path.join(APP, p));
    const rel = path.relative(APP, file);
    if (rel.startsWith('..') || /^(node_modules|test|scripts|shots|docs)([\\/]|$)/.test(rel)) file = null;
  }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

export function start() {
  return new Promise((resolve, reject) => {
    const thu = (n) => {
      const port = 22000 + Math.floor(Math.random() * 3000);
      const srv = http.createServer(handler);
      srv.once('error', (e) => (e.code === 'EADDRINUSE' && n < 30 ? thu(n + 1) : reject(e)));
      srv.listen(port, '127.0.0.1', () => resolve({ srv, port }));
    };
    thu(0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { port } = await start();
  console.log(`http://127.0.0.1:${port}/payday/`);
}
