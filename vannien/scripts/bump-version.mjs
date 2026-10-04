// Tăng số phiên bản chống bộ nhớ đệm cho mô-đun Văn khấn, Mâm cúng.
// Chạy sau MỖI lần sửa tệp trong mod\:   node scripts/bump-version.mjs          (tăng thêm 1)
//                                         node scripts/bump-version.mjs 7        (đặt số 7)
// Việc làm: viết lại ?v=N trong mọi câu import tương đối của mod\*.js, hằng VERSION trong app.js
// (dùng khi tải JSON dữ liệu), và hai thẻ trong index.html, 404.html.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MOD = path.join(ROOT, 'mod')
const appPath = path.join(MOD, 'app.js')
const cur = Number(/const VERSION = '(\d+)'/.exec(fs.readFileSync(appPath, 'utf8'))?.[1] || 0)
const next = process.argv[2] ? Number(process.argv[2]) : cur + 1
if (!Number.isInteger(next) || next < 1) throw new Error('Số phiên bản không hợp lệ')

for (const f of fs.readdirSync(MOD).filter((n) => n.endsWith('.js'))) {
  const p = path.join(MOD, f)
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(/(from\s+'\.\/[\w.-]+\.js)(\?v=\d+)?'/g, `$1?v=${next}'`)
  if (f === 'app.js') s = s.replace(/const VERSION = '\d+'/, `const VERSION = '${next}'`)
  fs.writeFileSync(p, s)
}
for (const f of ['index.html', '404.html']) {
  const p = path.join(ROOT, f)
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(/(mod\/mod\.css)(\?v=\d+)?/g, `$1?v=${next}`).replace(/(mod\/app\.js)(\?v=\d+)?/g, `$1?v=${next}`)
  fs.writeFileSync(p, s)
}
console.log(`Phiên bản mô-đun: ${cur} -> ${next}`)
