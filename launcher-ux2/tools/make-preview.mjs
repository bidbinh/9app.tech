// Sinh gói xem thử: home3.html + css/home3.css + js/home3.js + js/home3-config.js + icons/soon-osin.svg (không đụng tệp production).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(R, 'preview');
for (const d of ['css', 'js', 'icons']) mkdirSync(resolve(out, d), { recursive: true });
let h = readFileSync(resolve(R, 'index.html'), 'utf8');
h = h.replace(/css\/style\.css\?v=\d+/, 'css/home3.css?v=1').replace(/js\/launcher\.js\?v=\d+/, 'js/home3.js?v=1').replace(/js\/home-config\.js\?v=\d+/, 'js/home3-config.js?v=1');
h = h.replace('<title>9app</title>', '<title>9app (xem thử)</title><meta name="robots" content="noindex">');
h = h.replace('<a class="brand" href="./"', '<a class="brand" href="home3.html"');
if (!/home3\.css/.test(h) || !/home3\.js/.test(h) || !/home3-config\.js/.test(h)) throw new Error('thay đường dẫn thất bại');
writeFileSync(resolve(out, 'home3.html'), h);
writeFileSync(resolve(out, 'css/home3.css'), readFileSync(resolve(R, 'css/style.css')));
writeFileSync(resolve(out, 'js/home3.js'), readFileSync(resolve(R, 'js/launcher.js')));
writeFileSync(resolve(out, 'js/home3-config.js'), readFileSync(resolve(R, 'js/home-config.js')));
copyFileSync(resolve(R, 'icons/soon-osin.svg'), resolve(out, 'icons/soon-osin.svg'));
console.log('đã sinh preview/home3.html, css/home3.css, js/home3.js, js/home3-config.js, icons/soon-osin.svg');
