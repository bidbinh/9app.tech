// Máy chủ tĩnh cục bộ cho e2e: launcher ở gốc, các app lấy từ repo D:\9app.tech\<app> (bản sao để kiểm deep link).
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO = resolve(HERE, '..');
export const APP_DIRS = {
  vannien: 'vannien', unit: 'unit', license: 'license', english: 'english', race: 'race', scanner: 'scanner', speed: 'speed',
  interview: 'interview/public', hire: 'hire/public', swap: 'swap/public', '9lunch': '9lunch/public', '9ship': '9ship/public',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export function startServer(port, opts = {}) {
  const delay = opts.delay || {};      // { '/search/unit.json': 300 }
  const fail = opts.fail || new Set(); // đường dẫn trả 500
  const hits = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    hits[p] = (hits[p] || 0) + 1;
    const seg = p.split('/')[1];
    let root = HERE, rel = p;
    if (APP_DIRS[seg]) { root = join(REPO, APP_DIRS[seg]); rel = p.slice(seg.length + 1); }
    if (rel.endsWith('/') || rel === '') rel += 'index.html';
    const file = normalize(join(root, rel));
    const go = () => {
      if (fail.has(p)) { res.writeHead(500); res.end('fail'); return; }
      if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); res.end(); return; }
      try {
        const st = statSync(file);
        if (!st.isFile()) throw new Error('nf');
        res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        createReadStream(file).pipe(res);
      } catch { res.writeHead(404); res.end('not found'); }
    };
    if (delay[p]) setTimeout(go, delay[p]); else go();
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, hits, fail, port })));
}
