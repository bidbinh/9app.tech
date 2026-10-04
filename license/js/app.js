// 9license: khung ứng dụng, bộ định tuyến theo hash, thanh điều hướng.
import { h, mount, icon, toast } from './ui.js';
import { D, loadData, hang, applyTheme, counts } from './state.js';
import { store } from './store.js';
import { viewHome, viewLearn, viewChapter, viewCrit, viewSigns, viewExamIntro, viewReview } from './views/pages.js';
import { viewProgress, viewSettings, viewAbout, openHangSheet } from './views/pages2.js';
import { imageUrls, autoStart, stop as stopPrefetch } from './prefetch.js';
import { viewPractice, viewExam, viewResult } from './views/quiz.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
let cleanup = null;

const TABS = [
  { id: '/', t: 'Trang chủ', ic: 'home', match: (p) => p === '/' },
  { id: '/hoc', t: 'Học', ic: 'book', match: (p) => p.startsWith('/hoc') || p === '/luyen' },
  { id: '/thi', t: 'Thi thử', ic: 'test', match: (p) => p.startsWith('/thi') },
  { id: '/on', t: 'Ôn lại', ic: 'redo', match: (p) => p === '/on' },
  { id: '/tien-do', t: 'Tiến độ', ic: 'chart', match: (p) => p === '/tien-do' },
];

function setHomeLink() {
  const a = document.getElementById('home9app');
  const host = location.hostname || '';
  const onHub = host === '9app.tech' || host === 'www.9app.tech' || host === 'localhost' || host === '127.0.0.1';
  a.setAttribute('href', onHub ? '/' : 'https://9app.tech/');
}

function drawNav(path) {
  let due = 0;
  try { due = D.ready ? counts().due.length : 0; } catch { due = 0; }
  mount(nav, TABS.map((t) => h('a', { class: 'tab', href: '#' + t.id, 'aria-current': t.match(path) ? 'page' : null },
    icon(t.ic, 22), t.t, t.id === '/on' && due ? h('span', { class: 'badge', 'aria-label': due + ' câu đến hạn' }, due > 99 ? '99+' : String(due)) : null)));
}

function drawHeader() {
  document.getElementById('btn-hang').textContent = 'Hạng ' + hang();
}

const TITLES = { '/': 'Trang chủ', '/hoc': 'Học theo chương', '/thi': 'Thi thử', '/thi/lam': 'Đang thi thử', '/on': 'Ôn lại', '/tien-do': 'Tiến độ', '/cai-dat': 'Cài đặt', '/du-lieu': 'Về dữ liệu', '/luyen': 'Luyện tập', '/hoc/diem-liet': 'Câu điểm liệt', '/hoc/bien-bao': 'Biển báo' };

function parse() {
  let p = location.hash.replace(/^#/, '') || '/';
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '') || '/';
}

function route() {
  if (cleanup) { try { cleanup(); } catch { /* bỏ qua */ } cleanup = null; }
  document.getElementById('modal-root').replaceChildren();
  document.body.classList.remove('focus');
  const path = parse();
  drawHeader();
  drawNav(path);
  const parts = path.split('/').filter(Boolean);
  let c;
  if (!D.ready) return;
  switch (true) {
    case path === '/': viewHome(view); break;
    case path === '/hoc': viewLearn(view); break;
    case parts[0] === 'hoc' && parts[1] === 'c': viewChapter(view, parts[2]); break;
    case path === '/hoc/diem-liet': viewCrit(view); break;
    case path === '/hoc/bien-bao': viewSigns(view); break;
    case path === '/luyen': c = viewPractice(view); break;
    case path === '/thi': viewExamIntro(view); break;
    case path === '/thi/lam': c = viewExam(view); break;
    case parts[0] === 'thi' && parts[1] === 'ket-qua': viewResult(view, +parts[2]); break;
    case path === '/on': viewReview(view); break;
    case path === '/tien-do': viewProgress(view); break;
    case path === '/cai-dat': viewSettings(view); break;
    case path === '/du-lieu': viewAbout(view); break;
    default: mount(view, h('div', { class: 'card center stack' }, h('h1', null, 'Không tìm thấy trang'), h('a', { class: 'btn', href: '#/' }, 'Về trang chủ')));
  }
  if (typeof c === 'function') cleanup = c;
  const base = '9license';
  document.title = (TITLES[path] ? TITLES[path] + ' — ' : '') + base;
  if (!document.body.classList.contains('focus')) window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}

async function boot() {
  store.onError = (kind) => toast(kind === 'quota' ? 'Bộ nhớ trình duyệt đã đầy: tiến độ mới chưa được lưu. Hãy tải file sao lưu trong Cài đặt rồi giải phóng dung lượng.' : 'Trình duyệt chặn lưu dữ liệu: tiến độ chỉ giữ trong phiên này.');
  applyTheme();
  setHomeLink();
  document.getElementById('btn-set').append(icon('gear', 22));
  document.getElementById('btn-hang').addEventListener('click', () => openHangSheet(() => route()));
  mount(view, h('p', { class: 'muted center' }, 'Đang tải bộ câu hỏi…'));
  try {
    await loadData();
  } catch (e) {
    mount(view, h('div', { class: 'card stack center' }, h('h1', null, 'Chưa tải được dữ liệu'), h('p', { class: 'muted' }, 'Kiểm tra kết nối mạng rồi thử lại. (' + e.message + ')'), h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Thử lại')));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* không bắt buộc */ });
  }
  window.addEventListener('offline', () => { stopPrefetch(); toast('Đang ngoại tuyến: vẫn học được bình thường'); });
  autoStart(imageUrls(D.questions), { enabled: store.get().settings.autoImg !== false });
  window.__ready = true;
}

boot();
export { store };
