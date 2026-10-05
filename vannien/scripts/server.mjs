// Máy chủ tĩnh nhỏ để kiểm thử: phục vụ thư mục Vạn Niên ở /vannien/ và js/homebar.js của cổng 9app ở /js/.
// Chạy tay:  node scripts/server.mjs [thư mục] [cổng]    (cổng mặc định ngẫu nhiên từ 20000)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const HUB = path.resolve(HERE, '..', '..')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

export function startServer({ dir: dirIn = path.resolve(HERE, '..'), port = 0 } = {}) {
  const dir = path.resolve(dirIn)
  const server = http.createServer((req, res) => {
    let p
    try {
      p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    } catch {
      res.writeHead(400).end('bad')
      return
    }
    let file
    if (p.startsWith('/vannien/') || p === '/vannien') file = path.join(dir, p.replace(/^\/vannien\/?/, '') || 'index.html')
    else if (p.startsWith('/js/')) file = path.join(HUB, p)
    else if (p === '/favicon.svg') file = path.join(dir, 'favicon.svg')
    else {
      res.writeHead(404).end('not found')
      return
    }
    if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html')
    if (!file.startsWith(dir) && !file.startsWith(path.join(HUB, 'js'))) {
      res.writeHead(403).end('forbidden')
      return
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        // giống 404.html của Vạn Niên khi triển khai tĩnh: trả trang chính
        res.writeHead(404, { 'content-type': MIME['.html'] })
        res.end(fs.existsSync(path.join(dir, '404.html')) ? fs.readFileSync(path.join(dir, '404.html')) : 'not found')
        return
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(buf)
    })
  })
  return new Promise((resolve, reject) => {
    const tryListen = (n) => {
      const pt = port || 20000 + Math.floor(Math.random() * 9000)
      server.once('error', (e) => (e.code === 'EADDRINUSE' && n < 20 ? tryListen(n + 1) : reject(e)))
      server.listen(pt, '127.0.0.1', () => resolve({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) }))
    }
    tryListen(0)
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : undefined
  const s = await startServer({ dir, port: Number(process.argv[3]) || 0 })
  console.log(`http://127.0.0.1:${s.port}/vannien/`)
}
