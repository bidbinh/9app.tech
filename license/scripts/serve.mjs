// Máy chủ tĩnh cho phát triển/e2e: phục vụ cả thư mục gốc D:\9app.tech (để /js/homebar.js và /license/ cùng gốc như khi triển khai).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

// Công tắc cho e2e: giả lập mạng hỏng với riêng hình (Service Worker không bị setOfflineMode của trang chi phối).
export const control = { blockImg: false };

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (control.blockImg && p.includes('/data/img/')) { req.socket.destroy(); return; }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT) || file.includes('node_modules')) { res.writeHead(403); res.end('403'); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const { port: p } = await startServer(port);
  console.log(`http://127.0.0.1:${p}/license/`);
}
