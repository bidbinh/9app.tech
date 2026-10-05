// Biểu đồ SVG tự vẽ (không thư viện). Màu lấy từ biến CSS qua lớp class, nên tự đổi theo chế độ sáng/tối.
const NS = 'http://www.w3.org/2000/svg';
function e(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}
function khung(w, hh, nhan) {
  const s = e('svg', { viewBox: `0 0 ${w} ${hh}`, class: 'chart', role: 'img', 'aria-label': nhan });
  return s;
}
const dep = (n) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n * 10) / 10));

/** Cột chồng theo tuần. cot: [{nhan, phan:[v1,v2], ghi}]. phan theo thứ tự lớp: c1 (tập), c2 (chơi). */
export function cotChong(cot, { nhan = 'Biểu đồ cột', w = 340, hh = 190, duongTb = null } = {}) {
  const s = khung(w, hh, nhan);
  const L = 36; const R = 8; const T = 14; const B = 32;
  const max = Math.max(1, ...cot.map((c) => c.phan.reduce((a, v) => a + v, 0)), duongTb || 0) * 1.1;
  const cw = (w - L - R) / cot.length;
  const y = (v) => T + (hh - T - B) * (1 - v / max);
  for (let i = 0; i <= 3; i++) {
    const v = (max / 3) * i;
    s.append(e('line', { x1: L, x2: w - R, y1: y(v), y2: y(v), class: 'ch-grid' }));
    s.append(e('text', { x: L - 6, y: y(v) + 4, class: 'ch-t ch-r' }, dep(v)));
  }
  cot.forEach((c, i) => {
    let base = 0;
    const x0 = L + i * cw + cw * 0.18; const bw = cw * 0.64;
    c.phan.forEach((v, j) => {
      if (v <= 0) return;
      s.append(e('rect', { x: x0, y: y(base + v), width: bw, height: Math.max(1, y(base) - y(base + v)), rx: 3, class: `ch-b c${j + 1}`, 'data-v': v }));
      base += v;
    });
    s.append(e('text', { x: x0 + bw / 2, y: hh - 12, class: 'ch-t ch-m' }, c.nhan));
  });
  if (duongTb) {
    s.append(e('line', { x1: L, x2: w - R, y1: y(duongTb), y2: y(duongTb), class: 'ch-avg' }));
    s.append(e('text', { x: L + 4, y: y(duongTb) - 4, class: 'ch-t ch-avgt' }, 'TB 4 tuần trước'));
  }
  return s;
}

/** Thanh ngang. hang: [{nhan, v, phu}]. */
export function thanhNgang(hang, { nhan = 'Biểu đồ thanh', w = 340, don = '' } = {}) {
  const dong = 32; const L = 124; const R = 46; const hh = hang.length * dong + 8;
  const s = khung(w, hh, nhan);
  const max = Math.max(1, ...hang.map((x) => x.v));
  hang.forEach((x, i) => {
    const yy = 4 + i * dong;
    s.append(e('text', { x: L - 8, y: yy + 18, class: 'ch-t ch-r ch-lbl' }, x.nhan));
    s.append(e('rect', { x: L, y: yy + 5, width: w - L - R, height: 16, rx: 8, class: 'ch-track' }));
    if (x.v > 0) s.append(e('rect', { x: L, y: yy + 5, width: Math.max(10, ((w - L - R) * x.v) / max), height: 16, rx: 8, class: 'ch-b c1', 'data-nhom': x.nhan }));
    s.append(e('text', { x: w - R + 6, y: yy + 18, class: 'ch-t ch-val' }, `${Math.round(x.v * 10) / 10}${don}`));
  });
  return s;
}

/** Đường theo thời gian. diem: [{nhan, v}], muc: số hoặc null (đường mục tiêu). */
export function duong(diem, { nhan = 'Biểu đồ đường', w = 340, hh = 180, muc = null, don = '' } = {}) {
  const s = khung(w, hh, nhan);
  const L = 40; const R = 12; const T = 14; const B = 30;
  const vs = diem.map((d) => d.v).concat(muc != null ? [muc] : []);
  let lo = Math.min(...vs); let hi = Math.max(...vs);
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const x = (i) => (diem.length === 1 ? (L + w - R) / 2 : L + ((w - L - R) * i) / (diem.length - 1));
  const y = (v) => T + (hh - T - B) * (1 - (v - lo) / (hi - lo));
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) / 3) * i;
    s.append(e('line', { x1: L, x2: w - R, y1: y(v), y2: y(v), class: 'ch-grid' }));
    s.append(e('text', { x: L - 6, y: y(v) + 4, class: 'ch-t ch-r' }, String(Math.round(v * 10) / 10)));
  }
  if (muc != null) {
    s.append(e('line', { x1: L, x2: w - R, y1: y(muc), y2: y(muc), class: 'ch-avg' }));
    s.append(e('text', { x: L + 4, y: y(muc) - 4, class: 'ch-t ch-avgt' }, `Mục tiêu ${muc}${don}`));
  }
  if (diem.length > 1) s.append(e('polyline', { points: diem.map((d, i) => `${x(i)},${y(d.v)}`).join(' '), class: 'ch-line' }));
  diem.forEach((d, i) => {
    s.append(e('circle', { cx: x(i), cy: y(d.v), r: 4, class: 'ch-dot', 'data-v': d.v }));
    if (diem.length <= 8 || i === 0 || i === diem.length - 1) s.append(e('text', { x: x(i), y: hh - 10, class: 'ch-t ch-m' }, d.nhan));
  });
  return s;
}
