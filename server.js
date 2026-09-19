#!/usr/bin/env node
// Cổng 9app + gắn 9speed ở /speed.
//
//   node server.js            -> http://localhost:9090
//   node server.js --https    -> https://<IP LAN>:9443
//
// /            launcher 9app (folder này)
// /speed/...   app 9speed (../9speed.tech)
// /9pick/...   proxy 9pick.tech (cùng origin với launcher)
// /9quy/...    proxy quỹ phụ huynh (uvicorn :8088)
// /9fin/...    proxy sổ thu chi cá nhân (uvicorn :8080)

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { matchGate, proxyGate } from './js/gate.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SPEED = path.resolve(ROOT, '..', '9speed.tech');
const useHttps = process.argv.includes('--https');
const PORT = Number(process.env.PORT) || (useHttps ? 9443 : 9090);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function resolvePath(urlPath) {
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  if (urlPath.startsWith('/speed')) {
    let rest = urlPath.slice('/speed'.length) || '/';
    if (rest === '/') rest = '/index.html';
    return { root: SPEED, file: path.join(SPEED, path.normalize(rest).replace(/^(\.\.[/\\])+/, '')) };
  }
  return { root: ROOT, file: path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')) };
}

function inside(root, file) {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return file === root || file.startsWith(prefix);
}

function handler(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (urlPath.startsWith('/certs/') || urlPath.startsWith('/.git') || urlPath === '/.gitignore') {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const gate = matchGate(urlPath);
  if (gate) {
    proxyGate(req, res, gate, { secure: useHttps });
    return;
  }

  const { root, file: filePath } = resolvePath(urlPath);
  if (!inside(root, filePath)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      let start = match[1] === '' ? null : Number(match[1]);
      let end = match[2] === '' ? null : Number(match[2]);
      if (start === null && end !== null) {
        start = Math.max(0, stat.size - end);
        end = stat.size - 1;
      } else {
        if (start === null) start = 0;
        if (end === null || end >= stat.size) end = stat.size - 1;
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': urlPath.startsWith('/speed') ? '/speed/' : '/',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

let server;
if (useHttps) {
  const keyPath = [path.join(ROOT, 'certs', 'key.pem'), path.join(SPEED, 'certs', 'key.pem')].find(fs.existsSync);
  const certPath = [path.join(ROOT, 'certs', 'cert.pem'), path.join(SPEED, 'certs', 'cert.pem')].find(fs.existsSync);
  if (!keyPath || !certPath) {
    console.error('Chưa có chứng chỉ. Chạy trong 9speed.tech: powershell -File tools/make-cert.ps1');
    process.exit(1);
  }
  server = https.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    handler,
  );
} else {
  server = http.createServer(handler);
}

server.listen(PORT, '0.0.0.0', () => {
  const scheme = useHttps ? 'https' : 'http';
  console.log(`\n9app đang chạy:`);
  console.log(`  ${scheme}://localhost:${PORT}`);
  console.log(`  ${scheme}://localhost:${PORT}/speed/`);
  for (const ip of localAddresses()) {
    console.log(`  ${scheme}://${ip}:${PORT}   (điện thoại cùng Wi-Fi)`);
  }
  if (!useHttps) {
    console.log('\nGPS trên điện thoại cần HTTPS: node server.js --https\n');
  }
});
