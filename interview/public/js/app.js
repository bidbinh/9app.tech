import { h, icon, clear } from './ui.js';
import * as store from './store.js';
import { renderHome } from './views/home.js';
import { renderBank, renderQuestion } from './views/bank.js';
import { renderSetup, renderPractice, renderSessionEnd } from './views/practice.js';
import { renderCvPage, renderLetterPage } from './views/cvview.js';
import { renderPrepare } from './views/prepare.js';
import { renderSettings } from './views/settings.js';

const root = document.getElementById('view');
let cleanup = null;

const NAV = [
  ['', 'Trang chủ', 'home'], ['hoi', 'Câu hỏi', 'list'], ['luyen', 'Luyện nói', 'mic'], ['cv', 'CV', 'doc'], ['chuanbi', 'Chuẩn bị', 'check'],
];

function drawNav(active) {
  const nav = document.getElementById('nav');
  clear(nav);
  for (const [path, label, ic] of NAV) {
    const on = path === active;
    nav.append(h('a', { href: `#/${path}`, class: on ? 'on' : '', 'aria-current': on ? 'page' : null, 'data-nav': path || 'home' }, icon(ic), h('span', { text: label })));
  }
}

function route() {
  if (cleanup) { try { cleanup(); } catch { /* bỏ qua */ } cleanup = null; }
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [a, b, c] = parts;
  let active = a || '';
  let out;
  if (!a) out = renderHome(root);
  else if (a === 'hoi') out = b ? renderQuestion(root, b) : renderBank(root);
  else if (a === 'luyen') {
    if (b === 'q' && c) out = renderPractice(root, c);
    else if (b === 'phien') out = renderPractice(root, null);
    else if (b === 'xong') out = renderSessionEnd(root);
    else out = renderSetup(root);
  } else if (a === 'cv') out = b === 'thu' ? renderLetterPage(root) : renderCvPage(root);
  else if (a === 'chuanbi') out = renderPrepare(root);
  else if (a === 'caidat') { out = renderSettings(root); active = ''; }
  else { out = renderHome(root); active = ''; }
  if (typeof out === 'function') cleanup = out;
  drawNav(active);
  document.title = '9interview - Luyện phỏng vấn và làm CV';
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });

// Nút quay về launcher 9app
const host = location.hostname;
const onHub = host === '9app.tech' || host === 'www.9app.tech';
document.getElementById('home-link').setAttribute('href', onHub ? '/' : 'https://9app.tech/');

route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
