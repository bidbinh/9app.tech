// Máy chủ tĩnh nhỏ cho kiểm thử: phục vụ /english/ và /js/homebar.js (tệp dùng chung của hệ 9app).
// Dùng riêng: node scripts/serve.js  (cổng ngẫu nhiên từ 9600 trở lên, in ra màn hình)
const http = require('http');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const HUB_JS = path.join(__dirname, '..', '..', 'js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function handler(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file;
  if (p === '/js/homebar.js') file = path.join(HUB_JS, 'homebar.js');
  else if (p === '/english' ) { res.writeHead(301, { Location: '/english/' }); return res.end(); }
  else if (p.startsWith('/english/')) {
    p = p.slice('/english/'.length) || 'index.html';
    if (p.endsWith('/')) p += 'index.html';
    file = path.normalize(path.join(APP, p));
    const rel = path.relative(APP, file);
    if (rel.startsWith('..') || /^(node_modules|tests|scripts|shots)([\\/]|$)/.test(rel)) file = null;
  }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function start() {
  return new Promise((resolve, reject) => {
    const tryPort = (n) => {
      const port = 9600 + Math.floor(Math.random() * 400);
      const srv = http.createServer(handler);
      srv.once('error', (e) => (e.code === 'EADDRINUSE' && n < 30 ? tryPort(n + 1) : reject(e)));
      srv.listen(port, '127.0.0.1', () => resolve({ srv, port }));
    };
    tryPort(0);
  });
}

module.exports = { start };
if (require.main === module) start().then(({ port }) => console.log(`http://127.0.0.1:${port}/english/`));
