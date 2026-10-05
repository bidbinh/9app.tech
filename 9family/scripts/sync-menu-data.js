// Sao chép thư viện menu-data (dữ liệu món ăn + planner + shopping + normalize) vào 9family để build Docker độc lập.
//   node scripts/sync-menu-data.js            sao chép từ ../menu-data (hoặc MENU_DATA_SRC / đối số đầu tiên)
//   node scripts/sync-menu-data.js --check    chỉ kiểm tra: bản sao khớp MANIFEST, và khớp nguồn nếu thư mục nguồn có
// Kết quả:
//   src/menu/lib/{src,data}/   máy chủ dùng đầy đủ
//   public/menu/               trình duyệt dùng (common.js, normalize.js, ingredients.json) để chuẩn hóa gõ/giọng nói
//   MANIFEST.json ở cả hai nơi: băm từng tệp + băm gộp của nguồn
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

export const SERVER_FILES = [
  'src/common.js', 'src/index.js', 'src/load-node.js', 'src/normalize.js', 'src/planner.js', 'src/shopping.js',
  'data/dishes.json', 'data/ingredients.json', 'data/seasonal.json',
];
export const BROWSER_FILES = [['src/common.js', 'common.js'], ['src/normalize.js', 'normalize.js'], ['data/ingredients.json', 'ingredients.json']];
export const SERVER_DIR = path.join(root, 'src', 'menu', 'lib');
export const BROWSER_DIR = path.join(root, 'public', 'menu');

// băm theo nội dung đã chuẩn hóa xuống dòng (CRLF -> LF) để không lệch giữa Windows và Linux
export function hashFile(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(txt).digest('hex');
}
export function combine(files) {
  const h = crypto.createHash('sha256');
  for (const k of Object.keys(files).sort()) h.update(k + ':' + files[k] + '\n');
  return h.digest('hex');
}
export function defaultSource() {
  return process.env.MENU_DATA_SRC || path.resolve(root, '..', 'menu-data');
}
export function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8')); } catch { return null; }
}
// Kiểm tra bản sao khớp MANIFEST (không cần thư mục nguồn). Trả về danh sách lỗi.
export function verifyCopies() {
  const errs = [];
  const sm = readManifest(SERVER_DIR); const bm = readManifest(BROWSER_DIR);
  if (!sm) errs.push('Thiếu src/menu/lib/MANIFEST.json (chạy node scripts/sync-menu-data.js).');
  else {
    for (const f of SERVER_FILES) {
      const p = path.join(SERVER_DIR, f);
      if (!fs.existsSync(p)) { errs.push('Thiếu ' + p); continue; }
      if (hashFile(p) !== sm.files[f]) errs.push('Bản sao máy chủ lệch MANIFEST: ' + f);
    }
  }
  if (!bm) errs.push('Thiếu public/menu/MANIFEST.json.');
  else {
    for (const [from, to] of BROWSER_FILES) {
      const p = path.join(BROWSER_DIR, to);
      if (!fs.existsSync(p)) { errs.push('Thiếu ' + p); continue; }
      if (hashFile(p) !== bm.files[to]) errs.push('Bản sao trình duyệt lệch MANIFEST: ' + to);
      if (sm && sm.files[from] !== bm.files[to]) errs.push('Bản trình duyệt khác bản máy chủ: ' + to);
    }
  }
  if (sm && bm && sm.hash !== bm.sourceHash) errs.push('Băm nguồn của hai MANIFEST không khớp.');
  return errs;
}
// So với thư mục nguồn (nếu có). Trả về { present, errs }.
export function verifySource(src = defaultSource()) {
  if (!fs.existsSync(path.join(src, 'src', 'planner.js'))) return { present: false, errs: [] };
  const sm = readManifest(SERVER_DIR); const errs = [];
  if (!sm) return { present: true, errs: ['Chưa đồng bộ.'] };
  for (const f of SERVER_FILES) {
    const p = path.join(src, f);
    if (!fs.existsSync(p)) { errs.push('Nguồn thiếu ' + f); continue; }
    if (hashFile(p) !== sm.files[f]) errs.push('Nguồn đã đổi, chạy lại node scripts/sync-menu-data.js: ' + f);
  }
  return { present: true, errs };
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  // ghi theo LF để băm và diff ổn định
  fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(/\r\n/g, '\n'));
}

export function sync(src = defaultSource()) {
  if (!fs.existsSync(path.join(src, 'src', 'planner.js'))) throw new Error('Không thấy thư mục nguồn menu-data tại ' + src + ' (đặt MENU_DATA_SRC hoặc truyền đường dẫn).');
  const files = {};
  for (const f of SERVER_FILES) { copy(path.join(src, f), path.join(SERVER_DIR, f)); files[f] = hashFile(path.join(SERVER_DIR, f)); }
  const hash = combine(files);
  const dishes = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'data/dishes.json'), 'utf8'));
  const meta = { dishes: dishes.items.length, dataVersion: dishes.version, region: dishes.region };
  fs.writeFileSync(path.join(SERVER_DIR, 'MANIFEST.json'), JSON.stringify({ source: 'menu-data', hash, ...meta, files }, null, 2) + '\n');
  const bfiles = {};
  for (const [from, to] of BROWSER_FILES) { copy(path.join(src, from), path.join(BROWSER_DIR, to)); bfiles[to] = hashFile(path.join(BROWSER_DIR, to)); }
  fs.writeFileSync(path.join(BROWSER_DIR, 'MANIFEST.json'), JSON.stringify({ source: 'menu-data', sourceHash: hash, ...meta, files: bfiles }, null, 2) + '\n');
  return { hash, ...meta };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const errs = verifyCopies();
    const s = verifySource(args.find((a) => !a.startsWith('--')));
    if (!s.present) console.log('Không có thư mục nguồn: chỉ kiểm tra bản sao so với MANIFEST.');
    errs.push(...s.errs);
    if (errs.length) { console.error(errs.map((e) => ' - ' + e).join('\n')); process.exit(1); }
    console.log('Bản sao menu-data khớp.');
  } else {
    const r = sync(args.find((a) => !a.startsWith('--')));
    console.log(`Đã đồng bộ menu-data: ${r.dishes} món, băm ${r.hash.slice(0, 12)}.`);
  }
}
