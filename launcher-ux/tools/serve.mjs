// Máy chủ tĩnh cục bộ. /orig/ = bản gốc (thiếu tệp thì lấy ở gốc); còn lại là bản mới.
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function find(p) {
  const cands = [];
  if (p.startsWith('/orig/')) { cands.push(join(ROOT, p)); cands.push(join(ROOT, p.slice(5))); }
  else cands.push(join(ROOT, p));
  for (let f of cands) {
    if (f.endsWith('/') || f.endsWith(sep)) f = join(f, 'index.html');
    f = normalize(f);
    if (!f.startsWith(ROOT)) continue;
    try { if (statSync(f).isFile()) return f; } catch (e) {}
  }
  return null;
}
export function startServer(port) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/vannien/search-index.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; } // production có tệp thật
    const f = find(p);
    if (!f) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': T[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}
