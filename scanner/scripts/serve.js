// Máy chủ tĩnh tối giản để chạy thử/kiểm thử: phục vụ thư mục scanner ở /scanner/ và /js/homebar.js của cổng 9app.
// Dùng: node scripts/serve.js [cổng]   (mặc định cổng ngẫu nhiên từ 9400)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const HUB = path.resolve(APP, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.gz': 'application/gzip', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
    let file;
    if (p === '/js/homebar.js') file = path.join(HUB, 'js', 'homebar.js');
    else if (p === '/scanner') { res.writeHead(301, { Location: '/scanner/' }); return res.end(); }
    else if (p.startsWith('/scanner/')) {
      const rel = p.slice('/scanner/'.length) || 'index.html';
      file = path.join(APP, path.normalize(rel));
      if (!file.startsWith(APP + path.sep) || /[\/](tests|scripts|shots|node_modules)[\/]/.test(file)) { res.writeHead(403); return res.end(); }
    } else { res.writeHead(404); return res.end('not found'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 9400 + Math.floor(Math.random() * 500);
  const s = await startServer(port);
  console.log(`9scanner: http://127.0.0.1:${s.address().port}/scanner/`);
}
