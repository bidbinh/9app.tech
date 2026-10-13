// Sinh gói xem thử: home2.html + css/home2.css + js/home2.js (không đụng tệp production).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(R, 'preview');
mkdirSync(resolve(out, 'css'), { recursive: true });
mkdirSync(resolve(out, 'js'), { recursive: true });
let h = readFileSync(resolve(R, 'index.html'), 'utf8');
h = h.replace(/css\/style\.css\?v=\d+/, 'css/home2.css?v=1').replace(/js\/launcher\.js\?v=\d+/, 'js/home2.js?v=1');
h = h.replace('<title>9app</title>', '<title>9app (xem thử)</title><meta name="robots" content="noindex">');
h = h.replace('<a class="brand" href="./"', '<a class="brand" href="home2.html"');
if (!/home2\.css/.test(h) || !/home2\.js/.test(h)) throw new Error('thay đường dẫn thất bại');
writeFileSync(resolve(out, 'home2.html'), h);
writeFileSync(resolve(out, 'css/home2.css'), readFileSync(resolve(R, 'css/style.css')));
writeFileSync(resolve(out, 'js/home2.js'), readFileSync(resolve(R, 'js/launcher.js')));
console.log('đã sinh preview/home2.html, preview/css/home2.css, preview/js/home2.js');
