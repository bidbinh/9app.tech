import { MODE_LABEL, newId, splitUpcoming, countdown } from './model.js';
import { createStore } from './store.js';
import { parseIso, fmtDate, fmtTime, fmtDayLabel, formIso, formArrivalIso } from './time.js';
import { isInternational, leadMinutes, leaveByIso, placeWord } from './airport.js';
import { buildICS, icsFileName } from './ics.js';
import { settle } from './split.js';
import { parseTicketText, matchStation } from './parse.js';
import { getStatus, STATE_LABEL } from './status.js';
import { makeSamples } from './sample.js';

const store = createStore(() => window.localStorage);
const main = document.getElementById('main');
let stations = [];

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const money = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const dayLine = (iso) => `${fmtDayLabel(iso)} ${fmtDate(iso).slice(0, 5)} ${fmtTime(iso)}`;
const route = (t) => `${t.from.name} → ${t.to.name}`;
const MODE_ICON = { bay: '✈', tau: '🚆', xe: '🚌' };

function setView(nodes, nav) {
  main.classList.remove('ticket-mode');
  main.replaceChildren(...[].concat(nodes));
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function memoryBanner() {
  return store.isPersistent() ? null : h('p', { class: 'banner warn', role: 'status' }, 'Trình duyệt không cho lưu dữ liệu: các chuyến sẽ mất khi đóng trang. Hãy dùng "Xuất dữ liệu" ở mục Về app để giữ bản sao.');
}

function statusChip(trip) {
  const chip = h('span', { class: 'chip info', text: STATE_LABEL.unknown });
  getStatus(trip).then((s) => {
    chip.textContent = STATE_LABEL[s.state] + (s.state === 'delayed' && s.delayMin ? ` ${s.delayMin} phút` : '');
    chip.className = 'chip ' + ({ ontime: 'ok', delayed: 'warn', cancelled: 'bad' }[s.state] || 'info');
  });
  return chip;
}

function card(t, upcoming) {
  const now = Date.now();
  return h('a', { class: 'card', href: '#/trip/' + t.id },
    h('div', { class: 'card-top' },
      h('span', { class: 'mode', 'aria-hidden': 'true' }, MODE_ICON[t.mode]),
      h('strong', { text: [t.code, t.operator].filter(Boolean).join(' · ') || MODE_LABEL[t.mode] }),
      upcoming ? statusChip(t) : null),
    h('div', { class: 'route', text: route(t) }),
    h('div', { class: 'muted', text: `${dayLine(t.departAt)}${t.arriveAt ? ' → ' + fmtTime(t.arriveAt) : ''}` }),
    upcoming ? h('div', { class: 'count', text: countdown(parseIso(t.departAt).ms, now) }) : null);
}

function viewList() {
  const trips = store.load();
  const { upcoming, past } = splitUpcoming(trips, Date.now());
  const page = h('section', { class: 'page' },
    h('div', { class: 'row' }, h('h1', { text: 'Chuyến của tôi' }), h('a', { class: 'btn primary', href: '#/add', text: 'Thêm chuyến' })),
    memoryBanner());
  if (!trips.length) {
    page.append(h('div', { class: 'empty' },
      h('p', { text: 'Chưa có chuyến nào. Thêm vé máy bay, tàu hoặc xe khách để 9ticket nhắc giờ ra bến và giữ vé dùng được khi không có mạng.' }),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: '#/add', text: 'Thêm chuyến đầu tiên' }),
        h('button', { class: 'btn', type: 'button', onclick: () => { makeSamples(Date.now()).forEach((t) => store.upsert(t)); render(); } }, 'Xem chuyến mẫu'))));
  } else {
    page.append(h('h2', { text: 'Sắp tới' }), upcoming.length ? h('div', { class: 'list' }, upcoming.map((t) => card(t, true))) : h('p', { class: 'muted', text: 'Không có chuyến sắp tới.' }));
    if (past.length) page.append(h('h2', { text: 'Đã đi' }), h('div', { class: 'list' }, past.map((t) => card(t, false))));
    if (trips.some((t) => t.id.startsWith('mau-'))) {
      page.append(h('p', {}, h('button', { class: 'btn small', type: 'button', onclick: () => { trips.filter((t) => t.id.startsWith('mau-')).forEach((t) => store.remove(t.id)); render(); } }, 'Xóa chuyến mẫu')));
    }
  }
  setView(page, 'list');
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { text: label }), control, hint ? h('small', { class: 'muted', text: hint }) : null);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function viewDetail(id) {
  const t = store.get(id);
  if (!t) { setView(h('section', { class: 'page' }, h('h1', { text: 'Không tìm thấy chuyến' }), h('a', { class: 'btn', href: '#/', text: 'Về danh sách' })), 'list'); return; }
  const intl = isInternational(t, stations);
  const lead = leadMinutes(t, intl);
  const leave = leaveByIso(t, intl);
  const page = h('section', { class: 'page detail' });
  page.append(h('div', { class: 'detail-head' },
    h('div', { class: 'muted', text: `${MODE_LABEL[t.mode]}${t.operator ? ' · ' + t.operator : ''}${t.code ? ' · ' + t.code : ''}` }),
    h('h1', { text: route(t) }),
    h('div', { class: 'times' },
      h('div', {}, h('div', { class: 'big', text: fmtTime(t.departAt) }), h('div', { class: 'muted', text: `${fmtDayLabel(t.departAt)} ${fmtDate(t.departAt)}` })),
      t.arriveAt ? h('div', {}, h('div', { class: 'big', text: fmtTime(t.arriveAt) }), h('div', { class: 'muted', text: fmtDate(t.arriveAt) })) : null),
    h('div', { class: 'count', text: countdown(parseIso(t.departAt).ms, Date.now()) }),
    t.pnr ? h('div', { class: 'pnr' }, h('span', { class: 'muted', text: 'Mã đặt chỗ ' }), h('strong', { text: t.pnr })) : null));

  const body = h('div', { class: 'detail-body' });
  const statusBox = h('p', { id: 'status', class: 'box', text: 'Đang tải trạng thái…' });
  getStatus(t).then((s) => {
    const parts = [STATE_LABEL[s.state]];
    if (s.state === 'delayed' && s.delayMin) parts.push(`${s.delayMin} phút`);
    if (s.gate) parts.push('cổng ' + s.gate);
    if (s.terminal) parts.push('nhà ga ' + s.terminal);
    statusBox.textContent = parts.join(' · ') + (s.source === 'none' ? '. Chưa có nguồn dữ liệu chuyến.' : s.source === 'mau' ? '. (Dữ liệu mẫu)' : `. Cập nhật lúc ${s.updatedAt}, nguồn ${s.source}.`);
  });
  body.append(h('h2', { text: 'Trạng thái chuyến' }), statusBox);

  const leaveBox = h('div', { class: 'box leave-by' },
    h('strong', { text: leave ? `Nên ra ${placeWord(t.mode)} lúc ${fmtTime(leave)} (${fmtDate(leave).slice(0, 5)})` : '' }),
    h('div', { class: 'muted', text: `Sớm ${lead} phút so với giờ đi.` }));
  const leadInput = h('input', { id: 'lead', type: 'number', min: '0', max: '720', step: '5', value: String(lead), inputmode: 'numeric' });
  leadInput.addEventListener('change', () => {
    const n = Number.parseInt(leadInput.value, 10);
    store.upsert({ ...(store.get(id) || t), leadMin: Number.isInteger(n) ? n : null });
    viewDetail(id);
  });
  body.append(h('h2', { text: 'Giờ ra bến' }), leaveBox, field('Ra sớm (phút)', leadInput));

  const details = [t.gate && ['Cổng', t.gate], t.terminal && ['Nhà ga', t.terminal]].filter(Boolean);
  if (details.length) body.append(h('dl', { class: 'dl' }, details.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
  if (t.passengers.length) {
    body.append(h('div', { class: 'ticket-keep' }, h('h2', { text: 'Hành khách' }), h('ul', { class: 'plain' }, t.passengers.map((p) => h('li', { text: [p.name, p.seat && 'ghế ' + p.seat, p.bag && 'hành lý ' + p.bag].filter(Boolean).join(' · ') })))));
  }
  if (t.note) body.append(h('h2', { text: 'Ghi chú' }), h('p', { class: 'note', text: t.note }));
  page.append(body);

  const split = h('div', { class: 'box', id: 'split' });
  function drawSplit() {
    const cur = store.get(id);
    split.replaceChildren();
    const people = cur.passengers.map((p) => p.name);
    const r = settle(cur.payments, people);
    if (cur.payments.length) {
      split.append(h('ul', { class: 'plain' }, cur.payments.map((p, i) => h('li', {},
        `${p.payer} trả ${money(p.amount)}${p.label ? ' (' + p.label + ')' : ''} `,
        h('button', { class: 'link', type: 'button', 'aria-label': 'Xóa khoản chi', onclick: () => { store.upsert({ ...cur, payments: cur.payments.filter((_, j) => j !== i) }); drawSplit(); } }, 'xóa')))));
      split.append(h('p', { class: 'muted', text: `Tổng ${money(r.total)}, chia đều ${r.people.length} người.` }));
      split.append(r.transfers.length ? h('ul', { class: 'plain transfers' }, r.transfers.map((x) => h('li', { text: `${x.from} chuyển cho ${x.to} ${money(x.amount)}` }))) : h('p', { text: 'Không ai cần chuyển tiền.' }));
    } else split.append(h('p', { class: 'muted', text: 'Chưa có khoản chi chung nào.' }));
    const payer = h('input', { id: 'pay-who', type: 'text', maxlength: '40', list: 'people', autocomplete: 'off' });
    const amount = h('input', { id: 'pay-amount', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
    const label = h('input', { id: 'pay-label', type: 'text', maxlength: '60', autocomplete: 'off' });
    const err = h('p', { class: 'error', role: 'alert' });
    split.append(
      h('datalist', { id: 'people' }, people.map((n) => h('option', { value: n }))),
      field('Ai trả', payer), field('Số tiền (đồng)', amount), field('Cho việc gì', label), err,
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const n = Number(String(amount.value).replace(/[.,\s]/g, ''));
        if (!payer.value.trim()) { err.textContent = 'Nhập tên người trả.'; return; }
        if (!Number.isInteger(n) || n <= 0 || n > 1e9) { err.textContent = 'Số tiền phải là số nguyên dương, không quá 1.000.000.000.'; return; }
        const res = store.upsert({ ...cur, payments: [...cur.payments, { payer: payer.value.trim(), amount: n, label: label.value.trim() }] });
        if (!res.trip) { err.textContent = res.errors[0]; return; }
        drawSplit();
      } }, 'Thêm khoản chi'));
  }
  drawSplit();
  page.append(h('h2', { text: 'Chia tiền nhóm' }), split);

  let confirming = false, timer = null;
  const del = h('button', { class: 'btn danger', type: 'button', onclick: () => {
    if (!confirming) { confirming = true; del.textContent = 'Bấm lần nữa để xóa'; timer = setTimeout(() => { confirming = false; del.textContent = 'Xóa chuyến'; }, 4000); return; }
    clearTimeout(timer); store.remove(id); location.hash = '#/';
  } }, 'Xóa chuyến');
  const ticketBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => {
    const on = main.classList.toggle('ticket-mode');
    ticketBtn.textContent = on ? 'Thoát chế độ vé' : 'Chế độ vé (chữ lớn)';
  } }, 'Chế độ vé (chữ lớn)');
  page.append(h('div', { class: 'actions' },
    ticketBtn,
    h('button', { class: 'btn', type: 'button', onclick: () => download(icsFileName(t), buildICS(t, { alarmMin: lead }), 'text/calendar') }, 'Thêm vào lịch (.ics)'),
    h('a', { class: 'btn', href: '#/edit/' + id, text: 'Sửa' }),
    del));
  setView(page, 'list');
}

function viewAdd(editId) {
  const editing = editId ? store.get(editId) : null;
  if (editId && !editing) { location.hash = '#/'; return; }
  const draft = editing || { id: newId(), mode: 'bay', passengers: [], payments: [] };
  const page = h('section', { class: 'page' }, h('h1', { text: editing ? 'Sửa chuyến' : 'Thêm chuyến' }));
  const msg = h('div', { id: 'msg', role: 'status' });
  const formHost = h('div', {});

  function drawForm(d, notice) {
    msg.replaceChildren(notice ? h('p', { class: 'banner info', text: notice }) : '');
    const f = {};
    f.mode = h('select', { id: 'f-mode' }, ['bay', 'tau', 'xe'].map((m) => h('option', { value: m, selected: m === d.mode ? true : null }, MODE_LABEL[m])));
    f.operator = h('input', { id: 'f-operator', type: 'text', maxlength: '60', value: d.operator || '' });
    f.code = h('input', { id: 'f-code', type: 'text', maxlength: '12', value: d.code || '', autocapitalize: 'characters' });
    f.from = h('input', { id: 'f-from', type: 'text', maxlength: '80', list: 'stations', value: d.from ? d.from.name : '', autocomplete: 'off' });
    f.to = h('input', { id: 'f-to', type: 'text', maxlength: '80', list: 'stations', value: d.to ? d.to.name : '', autocomplete: 'off' });
    f.depDate = h('input', { id: 'f-dep-date', type: 'date', value: d.departAt ? d.departAt.slice(0, 10) : '' });
    f.depTime = h('input', { id: 'f-dep-time', type: 'time', value: d.departAt ? d.departAt.slice(11, 16) : '' });
    f.arrDate = h('input', { id: 'f-arr-date', type: 'date', value: d.arriveAt ? d.arriveAt.slice(0, 10) : '' });
    f.arrTime = h('input', { id: 'f-arr-time', type: 'time', value: d.arriveAt ? d.arriveAt.slice(11, 16) : '' });
    f.pnr = h('input', { id: 'f-pnr', type: 'text', maxlength: '10', value: d.pnr || '', autocapitalize: 'characters' });
    f.pax = h('textarea', { id: 'f-pax', rows: '3' }, (d.passengers || []).map((p) => [p.name, p.seat, p.bag].filter((x, i) => i === 0 || x).join(', ')).join('\n'));
    f.gate = h('input', { id: 'f-gate', type: 'text', maxlength: '10', value: d.gate || '' });
    f.terminal = h('input', { id: 'f-terminal', type: 'text', maxlength: '10', value: d.terminal || '' });
    f.note = h('textarea', { id: 'f-note', rows: '2', maxlength: '1000' }, d.note || '');
    const errs = h('ul', { class: 'error', role: 'alert' });
    const dl = h('datalist', { id: 'stations' }, stations.map((s) => h('option', { value: s.name }, s.code ? `${s.code} · ${s.kinds[0]}` : s.kinds[0])));

    const tzOf = (name, mode) => { const s = matchStation(stations, name, mode); return s ? s.tz : null; };
    const placeOf = (name, mode) => { const s = matchStation(stations, name, mode); return s ? { code: s.code, name: s.name } : { code: '', name: name.trim() }; };
    const form = h('form', { novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const mode = f.mode.value;
      const pax = f.pax.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20).map((l) => { const [name, seat, bag] = l.split(',').map((x) => (x || '').trim()); return { name, seat, bag }; });
      const depIso = formIso(f.depDate.value, f.depTime.value, tzOf(f.from.value, mode), d.departAt);
      const raw = { ...d, id: d.id, mode, operator: f.operator.value, code: f.code.value, from: placeOf(f.from.value, mode), to: placeOf(f.to.value, mode),
        departAt: depIso, arriveAt: formArrivalIso(depIso, f.arrDate.value, f.arrTime.value, tzOf(f.to.value, mode), d.arriveAt),
        pnr: f.pnr.value, passengers: pax, gate: f.gate.value, terminal: f.terminal.value, note: f.note.value };
      const res = store.upsert(raw);
      if (!res.trip) { errs.replaceChildren(...res.errors.map((x) => h('li', { text: x }))); return; }
      location.hash = '#/trip/' + res.trip.id;
    } },
      field('Loại chuyến', f.mode), field('Hãng / nhà xe', f.operator), field('Số hiệu (VJ123, SE1…)', f.code),
      field('Nơi đi', f.from, 'Gõ tên hoặc mã sân bay (HAN, SGN…)'), field('Nơi đến', f.to),
      h('div', { class: 'two' }, field('Ngày đi', f.depDate), field('Giờ đi', f.depTime)),
      h('div', { class: 'two' }, field('Ngày đến (tùy chọn)', f.arrDate), field('Giờ đến', f.arrTime)),
      field('Mã đặt chỗ', f.pnr), field('Hành khách (mỗi dòng: tên, ghế, hành lý)', f.pax),
      h('div', { class: 'two' }, field('Cổng', f.gate), field('Nhà ga', f.terminal)),
      field('Ghi chú', f.note), dl, errs,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Lưu chuyến'), h('a', { class: 'btn', href: editing ? '#/trip/' + editId : '#/' }, 'Hủy')));
    formHost.replaceChildren(form);
  }

  if (!editing) {
    const paste = h('textarea', { id: 'paste', rows: '5', maxlength: '20000', placeholder: 'Dán nội dung email hoặc SMS vé vào đây…' });
    page.append(h('div', { class: 'box' },
      h('h2', { text: 'Dán nội dung vé' }),
      h('p', { class: 'muted', text: 'Mình sẽ đọc rồi điền sẵn vào form bên dưới. Bạn soát lại trước khi lưu; không có gì được lưu tự động.' }),
      paste,
      h('button', { class: 'btn', type: 'button', id: 'read', onclick: () => {
        const r = parseTicketText(paste.value, { stations });
        if (!r.trip) { msg.replaceChildren(h('p', { class: 'banner warn', text: r.issues[0] })); return; }
        drawForm({ ...r.trip, id: draft.id }, r.ok ? 'Đã đọc xong. Soát lại thông tin rồi bấm Lưu chuyến.' : 'Đọc được một phần: ' + r.issues.join(' ') + ' Bổ sung trong form bên dưới.');
        formHost.scrollIntoView({ block: 'start' });
      } }, 'Đọc vé')));
  }
  page.append(msg, h('h2', { text: editing ? 'Thông tin chuyến' : 'Hoặc nhập tay' }), formHost);
  drawForm(draft);
  setView(page, 'list');
}

function viewAbout() {
  const fileIn = h('input', { id: 'import-file', type: 'file', accept: 'application/json,.json' });
  const out = h('p', { role: 'status' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    const r = store.importJson(await f.text());
    out.textContent = r.error ? r.error : `Đã nhập: thêm ${r.added}, cập nhật ${r.updated}, bỏ qua ${r.skipped}.`;
    fileIn.value = '';
  });
  setView(h('section', { class: 'page' },
    h('h1', { text: 'Về 9ticket' }),
    h('p', { text: '9ticket gom chuyến bay, tàu, xe khách của bạn ở một chỗ: nhắc giờ ra bến, giữ vé dùng được khi không có mạng, chia tiền nhóm. Dữ liệu nằm trên máy này, không gửi đi đâu.' }),
    h('p', { class: 'banner info', text: 'Hiện 9ticket chưa bán vé và chưa tự cập nhật trạng thái chuyến; trạng thái ở các chuyến mẫu chỉ là dữ liệu mẫu.' }),
    h('h2', { text: 'Đặt vé ở đâu' }),
    h('ul', { class: 'plain' },
      h('li', {}, 'Vé tàu: ', h('a', { href: 'https://dsvn.vn', rel: 'noopener noreferrer', target: '_blank' }, 'dsvn.vn')),
      h('li', {}, 'Vé xe khách: ', h('a', { href: 'https://vexere.com', rel: 'noopener noreferrer', target: '_blank' }, 'vexere.com')),
      h('li', {}, 'Vé máy bay: trang web hoặc ứng dụng của hãng bay.')),
    h('h2', { text: 'Sao lưu dữ liệu' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => download('9ticket-sao-luu.json', store.exportJson(), 'application/json') }, 'Xuất dữ liệu'),
      field('Nhập dữ liệu (tệp JSON)', fileIn)),
    out), 'about');
}

function render() {
  const [path] = (location.hash.replace(/^#/, '') || '/').split('?');
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'trip' && seg[1]) viewDetail(seg[1]);
  else if (seg[0] === 'add') viewAdd(null);
  else if (seg[0] === 'edit' && seg[1]) viewAdd(seg[1]);
  else if (seg[0] === 'about') viewAbout();
  else viewList();
}

async function start() {
  try { stations = await (await fetch('data/stations.json')).json(); } catch { stations = []; }
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
