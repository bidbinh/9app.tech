// Dựng bản xem thử tĩnh vào preview/ (chạy trong trình duyệt, không cần máy chủ): node scripts/build-preview.js
// Sao chép giao diện thật trong public/, thêm lớp giả API với dữ liệu mẫu BỊA (scripts/preview-shim.js) và băng rôn "bản xem thử".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'preview');
const pub = path.join(root, 'public');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) { if (f !== 'PREVIEW.md') fs.rmSync(path.join(out, f), { recursive: true, force: true }); }

// Sao chép MỌI tệp tĩnh mà public/index.html tham chiếu (tự theo giao diện thật, không phải cập nhật tay) + thư mục public/menu (nhập động)
const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const COPY = [...new Set([...indexHtml.matchAll(/(?:src|href)="([^":/]+\.(?:js|css|png|svg))"/g)].map((m) => m[1]).concat(['icon.svg', 'icon.png']))];
for (const f of COPY) fs.copyFileSync(path.join(pub, f), path.join(out, f));
if (fs.existsSync(path.join(pub, 'menu'))) fs.cpSync(path.join(pub, 'menu'), path.join(out, 'menu'), { recursive: true });

// âm lịch chạy trong trình duyệt: bỏ "export" của src/lunar.js và bọc lại
const lunar = fs.readFileSync(path.join(root, 'src', 'lunar.js'), 'utf8').replace(/^export /gm, '');
fs.writeFileSync(path.join(out, 'lunar.js'), `/* Sao chép từ src/lunar.js để bản xem thử tính âm lịch ngay trong trình duyệt. */\nwindow.__lunar = (function () {\n${lunar}\nreturn { solarToLunar: solarToLunar, lunarToSolar: lunarToSolar, canChiYear: canChiYear };\n})();\n`);
fs.copyFileSync(path.join(root, 'scripts', 'preview-shim.js'), path.join(out, 'shim.js'));
fs.writeFileSync(path.join(out, 'preview.css'), `.pv-banner { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fdf0cf; color: #5c3205; font: 600 14px/1.35 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; padding: 8px 12px; padding-top: calc(8px + env(safe-area-inset-top)); }
.pv-banner button { flex: none; min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1.5px solid #8a4a06; background: #fff; color: #5c3205; font: 700 14px/1 inherit; cursor: pointer; }
/* các mô-đun chưa có lớp giả API trong bản xem thử: ẩn ô dẫn tới (không để người xem rơi vào màn lỗi) */
a.tile[href$="/menu"], a.tile[href$="/shop"], a.tile[href$="/health"], a.tile[href$="/money"], a.tile[href$="/school"], a.shopcard { display: none; }
@media (prefers-color-scheme: dark) { .pv-banner { background: #3d2f0c; color: #fcd34d; } .pv-banner button { background: #12242a; color: #fcd34d; border-color: #7a5f1a; } }
`);

let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const sub = (a, b) => { if (!html.includes(a)) throw new Error('index.html thiếu: ' + a); html = html.replace(a, () => b); };
sub('<base href="__BASE__">', '<base href="./">');
sub('<link rel="manifest" href="manifest.webmanifest">\n', '');
sub('<link rel="apple-touch-icon" href="icon.png">\n', '');
sub('<title>9family - Lịch học và đưa đón của con</title>', '<title>9family - Bản xem thử</title>\n<meta name="robots" content="noindex">');
sub('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="preview.css">');
sub('<script src="ui.js"></script>', '<script src="lunar.js"></script>\n<script src="shim.js"></script>\n<script src="ui.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('Đã dựng preview/ với', fs.readdirSync(out).length, 'tệp');
