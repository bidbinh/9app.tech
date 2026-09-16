import { APPS, CATEGORIES, FAV_KEY, TAB_KEY } from './apps.js';

const catsEl = document.getElementById('cats');
const gridEl = document.getElementById('grid');
const emptyEl = document.getElementById('empty');
const toastEl = document.getElementById('toast');

function loadFavs() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    if (Array.isArray(raw) && raw.length) return new Set(raw);
  } catch { /* lần đầu */ }
  return new Set(['speed']);
}

function saveFavs(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
}

let favs = loadFavs();
let tab = localStorage.getItem(TAB_KEY) || 'fav';
if (!CATEGORIES.some((c) => c.id === tab)) tab = 'fav';

function appsIn(cat) {
  if (cat === 'fav') return APPS.filter((a) => favs.has(a.id));
  return APPS.filter((a) => a.categories.includes(cat));
}

let toastTimer = 0;
function toast(msg) {
  toastEl.hidden = false;
  toastEl.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
}

function openApp(app) {
  if (!app.ready) {
    toast(`${app.name} sắp ra mắt`);
    return;
  }
  location.href = app.href;
}

function toggleFav(app) {
  if (favs.has(app.id)) {
    favs.delete(app.id);
    toast(`Đã bỏ ${app.name} khỏi Ưu thích`);
  } else {
    favs.add(app.id);
    toast(`Đã ghim ${app.name} vào Ưu thích`);
  }
  saveFavs(favs);
  renderGrid();
}

function renderCats() {
  catsEl.replaceChildren();
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = cat.label;
    btn.className = cat.id === tab ? 'on' : '';
    btn.addEventListener('click', () => {
      tab = cat.id;
      localStorage.setItem(TAB_KEY, tab);
      renderCats();
      renderGrid();
    });
    catsEl.append(btn);
  }
}

function renderGrid() {
  const list = appsIn(tab);
  gridEl.replaceChildren();
  emptyEl.hidden = list.length > 0;
  for (const app of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app' + (app.ready ? '' : ' soon');
    btn.innerHTML = `<img src="${app.icon}" alt=""><b>${app.name}</b>`;
    let hold = 0;
    btn.addEventListener('pointerdown', () => {
      hold = setTimeout(() => {
        hold = 0;
        toggleFav(app);
      }, 520);
    });
    const cancel = () => { if (hold) { clearTimeout(hold); hold = 0; } };
    btn.addEventListener('pointerup', () => {
      const wasHold = hold;
      cancel();
      if (wasHold) openApp(app);
    });
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('pointercancel', cancel);
    gridEl.append(btn);
  }
}

renderCats();
renderGrid();
