// 9race: giao diện. Chỉ tạo phần tử bằng DOM API, mọi chữ đi qua textContent.
import { todayISO, fmtDate, fmtRange, fmtMoney, fmtKm, monthLabel, addDays, isHttpsUrl } from './util.js';
import {
  TYPES, DISTANCES, REGIONS, REG_STATES, REG_LABEL,
  parseHash, buildHash, defaultFilters, activeFilterCount, selectRaces, regStatusOf, isPast, endOf,
  monthMatrix, shiftMonth, countdownText, sortRaces,
} from './model.js';
import { eventsForRace, buildICS, icsFileName } from './ics.js';
import { createStore, STATUSES, STATUS_LABEL, normalizePb } from './store.js';

const REPORT_EMAIL = 'ttrongbinh@gmail.com';
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label]));
const REGION_LABEL = Object.fromEntries(REGIONS.map((t) => [t.id, t.label]));

// ---------- tiện ích DOM ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

function extLink(href, text, cls, label) {
  return h('a', { href, class: cls, target: '_blank', rel: 'noopener noreferrer', 'aria-label': label || null }, text);
}

// ---------- trạng thái ----------
let races = [];
let byId = new Map();
let meta = { updatedAt: '' };
const today = todayISO();
const mine = createStore(safeStorage());
const main = document.getElementById('main');
let listCtx = null; // trạng thái trang danh sách đang hiển thị
let lastListHash = '#/';

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

function setData(doc) {
  meta = { updatedAt: doc.updatedAt || '' };
  races = Array.isArray(doc.races) ? doc.races : [];
  byId = new Map(races.map((r) => [r.id, r]));
}

async function loadData() {
  const res = await fetch('data/races.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  setData(await res.json());
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 4000);
}

function updateMineCount() {
  const el = document.getElementById('mine-count');
  const n = mine.count();
  el.textContent = String(n);
  el.hidden = n === 0;
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadRaceICS(race) {
  const evs = eventsForRace(race);
  download(icsFileName(race.id), buildICS(evs, { name: race.name }), 'text/calendar;charset=utf-8');
  toast(`Đã tạo tệp lịch với ${evs.length} sự kiện. Mở tệp để thêm vào lịch có nhắc.`);
}

function reportHref(race) {
  const subject = `Báo sai 9race: ${race.name}`;
  const body = [
    `Giải: ${race.name}`,
    `Mã: ${race.id}`,
    `Cập nhật trong dữ liệu: ${fmtDate(race.updatedAt)}`,
    '',
    'Thông tin sai / cần sửa:',
    '',
    'Link nguồn đúng (nếu có):',
  ].join('\n');
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- thành phần ----------
function badge(text, cls) {
  return h('span', { class: `badge ${cls || ''}` }, text);
}

function regBadge(race) {
  const st = regStatusOf(race, today);
  return badge(REG_LABEL[st], `reg-${st}`);
}

function distanceText(race) {
  const parts = [];
  if (race.distances && race.distances.length) parts.push(race.distances.map(fmtKm).join(' · '));
  if (race.format === '70.3') parts.push('70.3 (Half Ironman)');
  else if (race.format === 'full') parts.push('Ironman (full)');
  else if (race.format === 'multi') parts.push('Nhiều nội dung (duathlon, triathlon, aquathlon)');
  return parts.join(' · ');
}

function priceText(race) {
  const a = race.priceFrom, b = race.priceTo;
  if (a == null && b == null) return '';
  if (a != null && b != null && a !== b) return `${fmtMoney(a, race.currency)} - ${fmtMoney(b, race.currency)}`;
  return `${a != null && b == null ? 'Từ ' : ''}${fmtMoney(a != null ? a : b, race.currency)}`;
}

function regDetailText(race) {
  const bits = [];
  if (race.regOpens && today < race.regOpens) bits.push(`Mở ${fmtDate(race.regOpens)}`);
  if (race.regCloses && today <= race.regCloses && !isPast(race, today)) bits.push(`Hạn ${fmtDate(race.regCloses)}`);
  return bits.join(' · ');
}

function dl(rows) {
  const d = h('dl', { class: 'facts' });
  for (const [k, v] of rows) {
    if (v == null || v === '' || v === false) continue;
    d.append(h('dt', { text: k }), h('dd', null, v));
  }
  return d;
}

function mineButton(race) {
  const it = mine.get(race.id);
  if (!it) {
    return h('button', {
      type: 'button', class: 'btn ghost', 'aria-pressed': 'false',
      onclick: (e) => {
        mine.setStatus(race.id, 'interested');
        updateMineCount();
        toast(`Đã thêm "${race.name}" vào Giải của tôi.`);
        const nb = mineButton(race);
        e.currentTarget.replaceWith(nb);
        nb.focus();
      },
    }, '☆ Quan tâm');
  }
  return h('a', { class: 'btn ghost on', href: `#/g/${encodeURIComponent(race.id)}`, 'aria-label': `${STATUS_LABEL[it.status]}: ${race.name}. Mở chi tiết` }, `★ ${STATUS_LABEL[it.status]}`);
}

function raceCard(race, opts = {}) {
  const past = isPast(race, today);
  const idHref = `#/g/${encodeURIComponent(race.id)}`;
  const art = h('article', { class: `card${past ? ' past' : ''}`, 'data-id': race.id });
  const badges = h('div', { class: 'badges' },
    badge(TYPE_LABEL[race.type], `type-${race.type}`),
    race.region.startsWith('vn-') ? null : badge(REGION_LABEL[race.region], 'plain'),
    ...(race.tags || []).slice(0, 3).map((t) => badge(t, 'tag')),
    regBadge(race),
    race.verified ? null : badge('Cần kiểm chứng', 'warn'));
  const dist = distanceText(race);
  const price = priceText(race);
  const regExtra = regDetailText(race);
  art.append(
    badges,
    h('h3', { class: 'card-title' }, h('a', { href: idHref }, race.name)),
    h('p', { class: 'when' },
      h('strong', null, fmtRange(race.startDate, race.endDate)),
      ' ',
      h('span', { class: `count-down${past ? ' muted' : ''}` }, countdownText(race, today))),
    dl([
      ['Địa điểm', race.city + (race.venue ? ` · ${race.venue}` : '')],
      ['Cự ly', dist],
      ['Độ cao', race.elevation != null ? `D+ ${new Intl.NumberFormat('vi-VN').format(race.elevation)} m` : ''],
      ['Giá', price],
      ['Đăng ký', regExtra],
      ['Tổ chức', race.organizer],
    ]),
    h('p', { class: 'meta' }, `Cập nhật ${fmtDate(race.updatedAt)}`),
  );
  const actions = h('div', { class: 'actions' });
  if (race.registerUrl) {
    actions.append(extLink(race.registerUrl, 'Đăng ký', 'btn primary', `Đăng ký ${race.name} (trang chính thức, mở tab mới)`));
  }
  if (race.website) actions.append(extLink(race.website, 'Trang giải', 'btn', `Trang giải ${race.name} (mở tab mới)`));
  actions.append(h('a', { class: 'btn', href: idHref, 'aria-label': `Chi tiết ${race.name}` }, 'Chi tiết'));
  actions.append(mineButton(race));
  actions.append(h('a', { class: 'btn link', href: reportHref(race), 'aria-label': `Báo sai thông tin ${race.name}` }, 'Báo sai'));
  art.append(actions);
  return art;
}

// ---------- trang danh sách ----------
function chipGroup(title, options, key, f, onToggle) {
  const wrap = h('fieldset', { class: 'chipset' }, h('legend', { text: title }));
  const row = h('div', { class: 'chips' });
  for (const o of options) {
    const b = h('button', {
      type: 'button', class: 'chip', 'data-key': key, 'data-id': o.id,
      'aria-pressed': f[key].includes(o.id) ? 'true' : 'false',
      title: o.hint || null,
      onclick: () => onToggle(key, o.id),
    }, o.label);
    row.append(b);
  }
  wrap.append(row);
  return wrap;
}

function renderList(f) {
  const ctx = { f };
  listCtx = ctx;

  const commit = (opts = {}) => {
    history.replaceState(null, '', buildHash('list', ctx.f));
    syncControls();
    renderResults();
    if (opts.focus) opts.focus();
  };

  const toggle = (key, id) => {
    const cur = ctx.f[key];
    ctx.f = { ...ctx.f, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id], day: '' };
    commit();
  };

  const search = h('input', {
    type: 'search', id: 'q', class: 'search', placeholder: 'Tìm tên giải hoặc địa điểm',
    value: f.q, autocomplete: 'off', enterkeyhint: 'search', maxlength: '80',
    oninput: (e) => { ctx.f = { ...ctx.f, q: e.target.value.trim(), day: '' }; commit(); },
  });
  search.value = f.q;

  const filtersBox = h('details', { class: 'filters' });
  const summary = h('summary', null, 'Bộ lọc ', h('span', { class: 'count', id: 'fcount', hidden: true }));
  filtersBox.append(summary,
    chipGroup('Loại giải', TYPES, 'types', ctx.f, toggle),
    chipGroup('Cự ly', DISTANCES, 'dists', ctx.f, toggle),
    chipGroup('Vùng', REGIONS, 'regions', ctx.f, toggle),
    chipGroup('Đăng ký', REG_STATES, 'regs', ctx.f, toggle),
    h('div', { class: 'filters-foot' },
      h('button', { type: 'button', class: 'btn small', id: 'clear', onclick: () => {
        ctx.f = { ...defaultFilters(), view: ctx.f.view, month: ctx.f.month };
        search.value = '';
        commit();
      } }, 'Xóa bộ lọc'),
      h('p', { class: 'hint' }, 'Cự ly tính gần đúng theo từng cự ly của giải (trail 25K nằm ở nhóm 21K).')));
  if (activeFilterCount(f) > 0) filtersBox.open = true;

  const viewList = h('button', { type: 'button', class: 'seg', 'data-view': 'list', onclick: () => { ctx.f = { ...ctx.f, view: 'list', day: '' }; commit(); } }, 'Danh sách');
  const viewMonth = h('button', { type: 'button', class: 'seg', 'data-view': 'month', onclick: () => { ctx.f = { ...ctx.f, view: 'month' }; commit(); } }, 'Lịch tháng');
  const pastBox = h('input', { type: 'checkbox', id: 'past', onchange: (e) => { ctx.f = { ...ctx.f, past: e.target.checked }; commit(); } });
  const pastLabel = h('label', { class: 'check', for: 'past' }, pastBox, ' Hiện cả giải đã qua');

  const bar = h('div', { class: 'bar' },
    h('div', { class: 'seggroup', role: 'group', 'aria-label': 'Kiểu hiển thị' }, viewList, viewMonth),
    pastLabel,
    h('p', { class: 'result-count', id: 'rcount', role: 'status' }));

  const results = h('div', { id: 'results' });

  function syncControls() {
    for (const b of filtersBox.querySelectorAll('.chip')) {
      b.setAttribute('aria-pressed', ctx.f[b.dataset.key].includes(b.dataset.id) ? 'true' : 'false');
    }
    const n = activeFilterCount(ctx.f) - (ctx.f.past ? 1 : 0);
    const fc = filtersBox.querySelector('#fcount');
    fc.textContent = String(n);
    fc.hidden = n === 0;
    viewList.setAttribute('aria-pressed', ctx.f.view === 'list' ? 'true' : 'false');
    viewMonth.setAttribute('aria-pressed', ctx.f.view === 'month' ? 'true' : 'false');
    pastBox.checked = ctx.f.past;
    pastLabel.hidden = ctx.f.view === 'month';
  }

  function renderResults() {
    results.replaceChildren();
    const f2 = ctx.f;
    const list = selectRaces(races, f2, today);
    const rc = bar.querySelector('#rcount');

    if (f2.view === 'month') {
      const ym = f2.month || today.slice(0, 7);
      const monthList = selectRaces(races, { ...f2, day: '' }, today);
      results.append(monthGrid(ym, monthList, f2, ctx, commit));
      rc.textContent = f2.day ? `${list.length} giải ngày ${fmtDate(f2.day)}` : `${list.length} giải trong ${monthLabel(ym).toLowerCase()}`;
    } else {
      rc.textContent = `${list.length} giải`;
    }

    if (!list.length) {
      results.append(h('div', { class: 'empty' },
        h('p', { text: 'Không có giải nào khớp bộ lọc.' }),
        h('button', { type: 'button', class: 'btn', onclick: () => { ctx.f = { ...defaultFilters(), view: ctx.f.view, month: ctx.f.month }; search.value = ''; commit(); } }, 'Xóa bộ lọc')));
      return;
    }
    if (f2.view === 'month') {
      const sec = h('section', { 'aria-label': 'Giải trong tháng' });
      list.forEach((r) => sec.append(raceCard(r)));
      results.append(sec);
      return;
    }
    let curMonth = '';
    let sec = null;
    for (const r of list) {
      const ym = r.startDate.slice(0, 7);
      if (ym !== curMonth) {
        curMonth = ym;
        sec = h('section', { 'aria-labelledby': `m-${ym}` }, h('h2', { class: 'month-h', id: `m-${ym}` }, monthLabel(ym)));
        results.append(sec);
      }
      sec.append(raceCard(r));
    }
  }

  main.replaceChildren(
    h('h1', { class: 'sr-only' }, 'Lịch giải chạy'),
    h('div', { class: 'search-row' }, h('label', { for: 'q', class: 'sr-only' }, 'Tìm giải'), search),
    filtersBox, bar, results);
  syncControls();
  renderResults();
}

function monthGrid(ym, monthList, f, ctx, commit) {
  const byDay = new Map();
  for (const r of monthList) {
    for (let d = r.startDate; d <= endOf(r); d = addDays(d, 1)) {
      if (d.slice(0, 7) !== ym) continue;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(r);
    }
  }
  const go = (delta) => { ctx.f = { ...ctx.f, month: shiftMonth(ym, delta), day: '' }; commit(); };
  const nav = h('div', { class: 'month-nav' },
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'Tháng trước', onclick: () => go(-1) }, '‹'),
    h('h2', { class: 'month-title', id: 'month-title' }, monthLabel(ym)),
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'Tháng sau', onclick: () => go(1) }, '›'),
    h('button', { type: 'button', class: 'btn small', onclick: () => { ctx.f = { ...ctx.f, month: '', day: '' }; commit(); } }, 'Tháng này'));
  const head = h('div', { class: 'cal-row cal-head', 'aria-hidden': 'true' }, ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => h('span', null, d)));
  const grid = h('div', { class: 'cal', role: 'group', 'aria-labelledby': 'month-title' }, head);
  for (const week of monthMatrix(ym)) {
    const row = h('div', { class: 'cal-row' });
    for (const d of week) {
      if (!d) { row.append(h('span', { class: 'cell empty-cell' })); continue; }
      const rs = byDay.get(d) || [];
      const selected = f.day === d;
      const cell = h('button', {
        type: 'button',
        class: `cell${rs.length ? ' has' : ''}${d === today ? ' today' : ''}${selected ? ' sel' : ''}`,
        'aria-pressed': selected ? 'true' : 'false',
        'aria-label': `Ngày ${+d.slice(8)} tháng ${+d.slice(5, 7)}${rs.length ? `, ${rs.length} giải` : ', không có giải'}${d === today ? ', hôm nay' : ''}`,
        disabled: rs.length ? null : true,
        onclick: () => { ctx.f = { ...ctx.f, day: selected ? '' : d }; commit(); },
      },
      h('span', { class: 'num' }, String(+d.slice(8))),
      rs.length ? h('span', { class: 'dots', 'aria-hidden': 'true' }, rs.slice(0, 3).map((r) => h('i', { class: `dot type-${r.type}` })), rs.length > 3 ? h('b', null, `+${rs.length - 3}`) : null) : null);
      row.append(cell);
    }
    grid.append(row);
  }
  const legend = h('p', { class: 'legend' },
    h('i', { class: 'dot type-road' }), ' Đường nhựa  ', h('i', { class: 'dot type-trail' }), ' Trail  ', h('i', { class: 'dot type-tri' }), ' Triathlon');
  return h('div', { class: 'month' }, nav, grid, legend);
}

// ---------- trang chi tiết ----------
function mineSection(race) {
  const box = h('section', { class: 'panel', 'aria-labelledby': 'mine-h' }, h('h2', { id: 'mine-h' }, 'Giải của tôi'));
  const body = h('div');
  box.append(body);

  function draw() {
    body.replaceChildren();
    const it = mine.get(race.id);
    const seg = h('div', { class: 'seggroup wide', role: 'group', 'aria-label': 'Trạng thái của tôi với giải này' });
    for (const s of STATUSES) {
      seg.append(h('button', {
        type: 'button', class: 'seg', 'data-status': s, 'aria-pressed': it && it.status === s ? 'true' : 'false',
        onclick: () => { mine.setStatus(race.id, s); updateMineCount(); draw(); },
      }, STATUS_LABEL[s]));
    }
    body.append(seg);
    if (!it) {
      body.append(h('p', { class: 'hint' }, 'Chọn một trạng thái để lưu giải này trên máy bạn (không cần tài khoản).'));
      return;
    }
    if (it.status === 'ran') {
      const err = h('p', { class: 'field-err', id: 'pb-err', role: 'alert', hidden: true }, 'PB cần dạng giờ:phút:giây (ví dụ 3:45:12) hoặc phút:giây (ví dụ 24:30).');
      const pb = h('input', {
        id: 'pb', class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '3:45:12', value: it.pb, maxlength: '8',
        'aria-describedby': 'pb-err',
        onchange: (e) => {
          const raw = e.target.value;
          const ok = normalizePb(raw) != null && mine.setPb(race.id, raw);
          err.hidden = ok;
          e.target.setAttribute('aria-invalid', ok ? 'false' : 'true');
          if (ok) { e.target.value = mine.get(race.id).pb; toast('Đã lưu PB.'); }
        },
      });
      pb.value = it.pb;
      const note = h('textarea', {
        id: 'note', class: 'input', rows: '4', maxlength: '2000', placeholder: 'Cảm nhận, thời tiết, bài học…',
        onchange: (e) => { mine.setNote(race.id, e.target.value); toast('Đã lưu ghi chú.'); },
      });
      note.value = it.note;
      body.append(
        h('div', { class: 'field' }, h('label', { for: 'pb' }, 'PB (thành tích cá nhân) của bạn ở giải này'), pb, err),
        h('div', { class: 'field' }, h('label', { for: 'note' }, 'Ghi chú'), note));
    }
    body.append(h('button', { type: 'button', class: 'btn link', onclick: () => {
      if ((it.pb || it.note) && !window.confirm('Bỏ giải này khỏi danh sách sẽ xóa cả PB và ghi chú đã lưu. Tiếp tục?')) return;
      mine.setStatus(race.id, null);
      updateMineCount();
      draw();
    } }, 'Bỏ khỏi Giải của tôi'));
  }
  draw();
  return box;
}

function renderDetail(id) {
  const race = byId.get(id);
  if (!race) {
    main.replaceChildren(h('div', { class: 'panel' },
      h('h1', null, 'Không tìm thấy giải'),
      h('p', null, 'Giải này không có trong dữ liệu (có thể đã được gỡ hoặc đổi mã).'),
      h('a', { class: 'btn primary', href: '#/' }, 'Về lịch giải')));
    document.title = 'Không tìm thấy giải — 9race';
    return;
  }
  document.title = `${race.name} — 9race`;
  const past = isPast(race, today);
  const st = regStatusOf(race, today);
  const evs = eventsForRace(race);

  const dates = [
    ['Ngày giải', fmtRange(race.startDate, race.endDate)],
    ['Ngày chạy chính', race.raceDay && race.raceDay !== race.startDate ? fmtDate(race.raceDay, true) : ''],
    ['Mở đăng ký', race.regOpens ? fmtDate(race.regOpens, true) : ''],
    ['Hạn đăng ký', race.regCloses ? fmtDate(race.regCloses, true) : ''],
    ['Nhận BIB', race.bibPickup ? fmtRange(race.bibPickup.start, race.bibPickup.end) : ''],
  ];

  const actions = h('div', { class: 'actions big' });
  if (race.registerUrl) actions.append(extLink(race.registerUrl, 'Đăng ký (trang chính thức)', 'btn primary', `Đăng ký ${race.name}, mở tab mới`));
  if (race.website) actions.append(extLink(race.website, 'Trang giải', 'btn', `Trang giải ${race.name}, mở tab mới`));
  actions.append(h('a', { class: 'btn link', href: reportHref(race) }, 'Báo sai thông tin'));

  main.replaceChildren(
    h('p', null, h('a', { class: 'back', href: lastListHash }, '‹ Lịch giải')),
    h('article', { class: 'detail' },
      h('div', { class: 'badges' },
        badge(TYPE_LABEL[race.type], `type-${race.type}`),
        badge(REGION_LABEL[race.region], 'plain'),
        ...(race.tags || []).map((t) => badge(t, 'tag')),
        regBadge(race),
        race.verified ? badge('Đã đối chiếu nguồn', 'ok') : badge('Cần kiểm chứng', 'warn')),
      h('h1', { class: 'detail-title' }, race.name),
      h('p', { class: 'when' }, h('strong', null, fmtRange(race.startDate, race.endDate)), ' ', h('span', { class: `count-down${past ? ' muted' : ''}` }, countdownText(race, today))),
      !race.verified ? h('p', { class: 'callout warn' }, 'Cần kiểm chứng: ngày hoặc thông tin của giải này chưa được xác nhận từ trang chính thức. Hãy mở trang giải để đối chiếu trước khi quyết định.') : null,
      st === 'soldout' ? h('p', { class: 'callout' }, 'Theo nguồn đã đọc, vé đã hết. Hãy xem trang giải để biết có đợt vé hoặc chuyển nhượng chính thức.') : null,
      actions,
      h('section', { class: 'panel', 'aria-labelledby': 'info-h' },
        h('h2', { id: 'info-h' }, 'Thông tin'),
        dl([
          ['Địa điểm', race.city],
          ['Địa điểm xuất phát', race.venue],
          ['Cự ly', distanceText(race)],
          ['Độ cao tích lũy', race.elevation != null ? `D+ ${new Intl.NumberFormat('vi-VN').format(race.elevation)} m` : ''],
          ['Giá', priceText(race)],
          ['Nhà tổ chức', race.organizer],
        ])),
      h('section', { class: 'panel', 'aria-labelledby': 'date-h' },
        h('h2', { id: 'date-h' }, 'Mốc thời gian'),
        dl(dates)),
      race.note ? h('section', { class: 'panel', 'aria-labelledby': 'note-h' }, h('h2', { id: 'note-h' }, 'Ghi chú'), h('p', null, race.note)) : null,
      mineSection(race),
      h('section', { class: 'panel', 'aria-labelledby': 'cal-h' },
        h('h2', { id: 'cal-h' }, 'Nhắc qua lịch'),
        h('p', null, `Tải tệp .ics gồm ${evs.length} sự kiện (${evs.map((e) => ({ race: 'ngày giải', regOpen: 'mở đăng ký', regClose: 'hạn đăng ký', bib: 'nhận BIB' }[e.kind])).join(', ')}), mỗi sự kiện có chuông nhắc. Mở tệp bằng Google Calendar, Apple Calendar hoặc Outlook.`),
        h('button', { type: 'button', class: 'btn', onclick: () => downloadRaceICS(race) }, 'Tải lịch .ics'),
        h('p', { class: 'hint' }, 'Bản này chưa có thông báo đẩy (push) từ máy chủ; nhắc dựa vào ứng dụng lịch của bạn.')),
      h('section', { class: 'panel', 'aria-labelledby': 'src-h' },
        h('h2', { id: 'src-h' }, 'Nguồn dữ liệu'),
        h('p', null, 'Cập nhật lần cuối: ', h('strong', null, fmtDate(race.updatedAt)), '.'),
        isHttpsUrl(race.source) ? h('p', null, 'Nguồn: ', extLink(race.source, hostOf(race.source), 'inline', `Nguồn dữ liệu ${hostOf(race.source)}, mở tab mới`)) : null,
        h('p', { class: 'hint' }, 'Thông tin chỉ mang tính tham khảo. Hãy kiểm tra trang chính thức của giải trước khi đăng ký hoặc thanh toán.'))));
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}

// ---------- Giải của tôi ----------
function renderMine() {
  const all = mine.all();
  const ids = Object.keys(all);
  const rows = ids.map((id) => ({ id, it: all[id], race: byId.get(id) || null }));
  const known = sortRaces(rows.filter((r) => r.race).map((r) => r.race)).map((r) => rows.find((x) => x.id === r.id));
  const upcoming = known.filter((x) => x.it.status !== 'ran' && !isPast(x.race, today));
  const ran = known.filter((x) => x.it.status === 'ran').reverse();
  const pastOpen = known.filter((x) => x.it.status !== 'ran' && isPast(x.race, today));
  const missing = rows.filter((r) => !r.race);

  const msg = h('p', { class: 'hint', id: 'io-msg', role: 'status' });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file', tabindex: '-1' });
  let importMode = 'merge';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { msg.textContent = 'Tệp quá lớn (tối đa 2 MB).'; return; }
    const text = await file.text();
    const res = mine.importJSON(text, importMode);
    if (!res.ok) { msg.textContent = res.error; msg.className = 'field-err'; return; }
    updateMineCount();
    toast(`Đã nhập ${res.count} giải.`);
    renderMine();
  });

  const icsBtn = h('button', { type: 'button', class: 'btn', disabled: upcoming.length ? null : true, onclick: () => {
    const evs = upcoming.flatMap((x) => eventsForRace(x.race));
    download('9race-giai-cua-toi.ics', buildICS(evs, { name: '9race: giải của tôi' }), 'text/calendar;charset=utf-8');
    toast(`Đã tạo tệp lịch với ${evs.length} sự kiện.`);
  } }, 'Tải lịch .ics cho giải sắp tới');

  const tools = h('section', { class: 'panel', 'aria-labelledby': 'tools-h' },
    h('h2', { id: 'tools-h' }, 'Nhắc, sao lưu'),
    h('p', null, 'Nhắc dùng tệp lịch .ics (có chuông nhắc 7 ngày và 1 ngày trước giải, nhắc mở và hạn đăng ký, nhận BIB). Bản này chưa có thông báo đẩy từ máy chủ.'),
    h('div', { class: 'actions' },
      icsBtn,
      h('button', { type: 'button', class: 'btn', disabled: ids.length ? null : true, onclick: () => {
        download('9race-sao-luu.json', mine.exportJSON(), 'application/json');
        toast('Đã xuất tệp sao lưu JSON.');
      } }, 'Xuất sao lưu JSON'),
      h('button', { type: 'button', class: 'btn', onclick: () => { importMode = 'merge'; fileInput.click(); } }, 'Nhập sao lưu (gộp)'),
      h('button', { type: 'button', class: 'btn', onclick: () => {
        if (!window.confirm('Nhập thay thế sẽ xóa danh sách hiện tại trên máy này. Tiếp tục?')) return;
        importMode = 'replace';
        fileInput.click();
      } }, 'Nhập sao lưu (thay thế)'),
      fileInput),
    msg,
    mine.persistent ? null : h('p', { class: 'callout warn' }, 'Trình duyệt đang chặn lưu trữ nên danh sách chỉ giữ tới khi đóng trang. Hãy xuất sao lưu JSON.'));

  const empty = !ids.length
    ? h('div', { class: 'empty' },
      h('p', null, 'Bạn chưa lưu giải nào. Bấm "Quan tâm" ở một giải để theo dõi.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Xem lịch giải'))
    : null;

  const section = (id, title, list, render) => (list.length
    ? h('section', { 'aria-labelledby': id }, h('h2', { class: 'month-h', id }, title), list.map(render))
    : null);

  main.replaceChildren(...[
    h('h1', null, 'Giải của tôi'),
    tools,
    empty,
    section('up-h', `Sắp tới (${upcoming.length})`, upcoming, (x) => {
      const card = raceCard(x.race);
      card.prepend(h('p', { class: 'mine-status' }, STATUS_LABEL[x.it.status]));
      return card;
    }),
    section('pastopen-h', `Đã qua, chưa đánh dấu (${pastOpen.length})`, pastOpen, (x) => h('article', { class: 'card past' },
      h('h3', { class: 'card-title' }, h('a', { href: `#/g/${encodeURIComponent(x.id)}` }, x.race.name)),
      h('p', { class: 'when' }, fmtRange(x.race.startDate, x.race.endDate)),
      h('p', { class: 'hint' }, 'Giải đã diễn ra. Mở chi tiết, chọn "Đã chạy" để ghi PB và ghi chú.'))),
    section('ran-h', `Đã chạy (${ran.length})`, ran, (x) => h('article', { class: 'card' },
      h('h3', { class: 'card-title' }, h('a', { href: `#/g/${encodeURIComponent(x.id)}` }, x.race.name)),
      h('p', { class: 'when' }, fmtRange(x.race.startDate, x.race.endDate)),
      dl([['PB', x.it.pb], ['Ghi chú', x.it.note]]),
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: `#/g/${encodeURIComponent(x.id)}` }, 'Sửa PB, ghi chú')))),
    section('miss-h', `Không còn trong dữ liệu (${missing.length})`, missing, (x) => h('article', { class: 'card past' },
      h('h3', { class: 'card-title' }, x.id),
      h('p', { class: 'hint' }, 'Giải này không còn trong lịch hiện tại.'),
      h('button', { type: 'button', class: 'btn', onclick: () => { mine.setStatus(x.id, null); updateMineCount(); renderMine(); } }, 'Gỡ khỏi danh sách'))),
  ].filter(Boolean));
}

// ---------- Về dữ liệu ----------
function renderAbout() {
  const total = races.length;
  const verified = races.filter((r) => r.verified).length;
  const vn = races.filter((r) => r.country === 'VN').length;
  main.replaceChildren(
    h('h1', null, 'Về dữ liệu'),
    h('section', { class: 'panel' },
      h('h2', null, 'Dữ liệu từ đâu'),
      h('p', null, `Hiện có ${total} giải (${vn} giải Việt Nam, ${total - vn} giải khu vực và thế giới); ${verified} giải đã đối chiếu, ${total - verified} giải có nhãn "Cần kiểm chứng". Dữ liệu cập nhật ngày ${fmtDate(meta.updatedAt)}.`),
      h('p', null, 'Mọi giải được nhập tay từ trang chính thức của giải hoặc nhà tổ chức, nền tảng đăng ký (iRace, ActiUp, 5Bib, Pace8...) và báo chí/trang tổng hợp đáng tin. Mỗi giải ghi rõ nguồn ở trang chi tiết. Ô nào chưa tìm được thì để trống, không đoán.'),
      h('p', null, 'Nhãn "Đã đối chiếu nguồn" nghĩa là ngày giải thấy trên trang chính thức hoặc có từ hai nguồn độc lập khớp nhau cho năm 2026/2027. Nhãn "Cần kiểm chứng" nghĩa là chỉ có một nguồn tổng hợp hoặc suy từ năm trước.'),
      h('p', null, 'Trạng thái đăng ký là tình trạng tại ngày cập nhật, cộng với mốc ngày mở/hạn nếu có. Giải hot có thể hết vé sớm hơn hạn ghi.')),
    h('section', { class: 'panel' },
      h('h2', null, 'Báo sai, góp giải'),
      h('p', null, 'Thấy ngày, giá hoặc link sai? Bấm "Báo sai" trên thẻ giải (mở email có sẵn tên giải) hoặc gửi tới ', h('a', { href: `mailto:${REPORT_EMAIL}` }, REPORT_EMAIL), '. Nếu biết giải chưa có trong lịch, gửi tên, ngày và link trang chính thức.')),
    h('section', { class: 'panel' },
      h('h2', null, 'Nhắc lịch'),
      h('p', null, 'Nhắc dùng tệp lịch .ics có chuông (VALARM): nhập vào Google Calendar, Apple Calendar hoặc Outlook. Bản này chưa gửi thông báo đẩy từ máy chủ; nếu cần, đó là bước sau.')),
    h('section', { class: 'panel' },
      h('h2', null, 'Miễn trừ'),
      h('p', null, 'Thông tin chỉ mang tính tham khảo và có thể thay đổi (đổi ngày, hủy, đổi giá). 9race không bán vé, không thu tiền và không phải nhà tổ chức. Nút "Đăng ký" chỉ chuyển bạn tới trang chính thức. Hãy kiểm tra trang chính thức của giải trước khi đăng ký hoặc thanh toán.'),
      h('p', null, 'Tên giải và nhãn hiệu thuộc về chủ sở hữu tương ứng.')),
    h('section', { class: 'panel' },
      h('h2', null, 'Dữ liệu của bạn'),
      h('p', null, '"Giải của tôi" lưu trên trình duyệt của bạn (localStorage), không gửi đi đâu. Xóa dữ liệu trình duyệt sẽ mất danh sách, nên hãy xuất sao lưu JSON ở trang Giải của tôi.')));
}

// ---------- định tuyến ----------
function setNav(route) {
  const key = route === 'detail' ? 'list' : route;
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function render(opts = {}) {
  const r = parseHash(location.hash);
  setNav(r.route);
  document.title = '9race — Lịch giải chạy';
  if (r.route === 'detail') renderDetail(r.id);
  else if (r.route === 'mine') { document.title = 'Giải của tôi — 9race'; renderMine(); }
  else if (r.route === 'about') { document.title = 'Về dữ liệu — 9race'; renderAbout(); }
  else { lastListHash = location.hash && location.hash.startsWith('#/?') ? location.hash : '#/'; renderList(r.filters); }
  updateMineCount();
  if (!opts.keepScroll && !opts.initial) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

function showError(err) {
  main.replaceChildren(h('div', { class: 'panel' },
    h('h1', null, 'Không tải được dữ liệu'),
    h('p', null, 'Hãy kiểm tra kết nối mạng rồi thử lại.'),
    h('button', { type: 'button', class: 'btn primary', onclick: start }, 'Thử lại'),
    h('p', { class: 'hint' }, String(err && err.message ? err.message : err))));
}

async function start() {
  try {
    await loadData();
  } catch (e) {
    showError(e);
    return;
  }
  render({ initial: true });
}

window.addEventListener('hashchange', () => render());
document.querySelector('.skip').addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

// ---------- service worker, cập nhật an toàn ----------
function showUpdate(worker) {
  const banner = document.getElementById('update');
  banner.hidden = false;
  document.getElementById('update-btn').onclick = () => {
    window.__refreshing = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__refreshing) location.reload();
  });
  navigator.serviceWorker.addEventListener('message', async (e) => {
    if (!e.data || e.data.type !== 'data-updated') return;
    const before = meta.updatedAt;
    try {
      await loadData();
      if (meta.updatedAt !== before) {
        toast('Dữ liệu giải vừa được cập nhật.');
        render({ keepScroll: true });
      }
    } catch { /* giữ dữ liệu cũ */ }
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
      });
    });
  }).catch(() => { /* chạy được không cần SW */ });
}

start();
