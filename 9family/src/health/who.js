// Chuẩn tăng trưởng WHO: tính z-score, phần trăm và đường chuẩn từ bảng L, M, S (data/who-*.json).
//   0-5 tuổi: WHO Child Growth Standards (cân nặng, chiều dài/cao, vòng đầu, BMI theo tháng tuổi).
//   5-19 tuổi: WHO Growth reference 2007 (chiều cao, BMI). Cân nặng theo tuổi KHÔNG có sau 5 tuổi (WHO chỉ có đến 10 tuổi và chúng tôi chưa nạp): ẩn, không bịa.
// Chỉ để THAM KHẢO, không chẩn đoán.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const cache = {};
function load(ind) {
  if (!cache[ind]) cache[ind] = JSON.parse(fs.readFileSync(path.join(dir, `who-${ind}.json`), 'utf8'));
  return cache[ind];
}
export const INDICATORS = ['wfa', 'lhfa', 'hcfa', 'bfa'];
export const KIND_IND = { weight: 'wfa', height: 'lhfa', head: 'hcfa', bmi: 'bfa' };
export const DAYS_PER_MONTH = 30.4375;
export const Z_FOR = { p3: -1.8808, p15: -1.0364, p50: 0, p85: 1.0364, p97: 1.8808 }; // z tương ứng 3/15/50/85/97 phần trăm
export function whoMeta(ind) { const d = load(ind); return { title: d.title, unit: d.unit, source: d.source, sourceRef: d.sourceRef, retrieved: d.retrieved }; }

// Số tháng tuổi (thập phân) từ ngày sinh đến một ngày
export function ageMonths(birth, day) {
  const days = (Date.parse(day + 'T00:00:00Z') - Date.parse(birth + 'T00:00:00Z')) / 86400000;
  return days / DAYS_PER_MONTH;
}

function interp(rows, a) {
  if (!rows.length || a < rows[0][0] || a > rows[rows.length - 1][0]) return null;
  let lo = 0; let hi = rows.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid][0] <= a) lo = mid; else hi = mid; }
  const r0 = rows[lo]; const r1 = rows[Math.min(lo + 1, rows.length - 1)];
  if (r1[0] === r0[0]) return { L: r0[1], M: r0[2], S: r0[3] };
  const t = (a - r0[0]) / (r1[0] - r0[0]);
  const f = (i) => r0[i] + (r1[i] - r0[i]) * t;
  return { L: f(1), M: f(2), S: f(3) };
}

// L, M, S ở tuổi `a` (tháng, thập phân). Trả null nếu WHO không có bảng cho độ tuổi này.
// Giữa 60 và 61 tháng là chỗ nối giữa hai bộ số liệu: lấy bộ gần hơn, không nội suy chéo bộ.
export function lmsAt(ind, sex, a) {
  const s = load(ind).sets[sex];
  if (!s || !(a >= 0) || !Number.isFinite(a)) return null;
  if (a <= 60) return interp(s.std, a);
  if (!s.ref) return null;
  if (a < 61) return a < 60.5 ? interp(s.std, 60) : interp(s.ref, 61);
  return interp(s.ref, a);
}

export function zOf(v, { L, M, S }) {
  if (!(v > 0)) return null;
  return L === 0 ? Math.log(v / M) / S : (Math.pow(v / M, L) - 1) / (L * S);
}
export function valueAtZ({ L, M, S }, z) {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}
// Hàm phân phối chuẩn tích lũy (Abramowitz-Stegun 7.1.26, sai số < 1.5e-7)
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
export const percentOf = (z) => normCdf(z) * 100;

// Vị trí của một số đo. Trả null nếu không có chuẩn cho độ tuổi/chỉ số này.
export function placeOf(ind, sex, a, value) {
  const lms = lmsAt(ind, sex, a);
  if (!lms) return null;
  const z = zOf(value, lms);
  if (z === null) return null;
  const pct = percentOf(z);
  return { z: Math.round(z * 100) / 100, pct: Math.round(pct * 10) / 10, band: Math.abs(z) > 1.8808 ? (z < 0 ? 'thap' : 'cao') : 'giua', median: Math.round(lms.M * 100) / 100 };
}

// Lời giải thích trung tính (không chẩn đoán)
export function explain(label, p) {
  if (!p) return '';
  const pc = p.pct < 1 ? 'dưới 1' : p.pct > 99 ? 'trên 99' : String(Math.round(p.pct));
  let s = `${label} của bé nằm ở khoảng phần trăm thứ ${pc} so với trẻ cùng tuổi, cùng giới theo chuẩn WHO.`;
  if (p.band === 'thap') s += ' Đây là vùng thấp hơn 97% trẻ cùng tuổi; nên trao đổi với bác sĩ nhi.';
  else if (p.band === 'cao') s += ' Đây là vùng cao hơn 97% trẻ cùng tuổi; nên trao đổi với bác sĩ nhi.';
  else s += ' Nằm trong vùng thường gặp (khoảng từ phần trăm thứ 3 đến 97).';
  return s + ' Thông tin chỉ để tham khảo, không phải chẩn đoán; hãy hỏi bác sĩ nhi.';
}

// Đường chuẩn p3, p15, p50, p85, p97 theo tháng tuổi, trong đoạn [from, to] (bước 1 tháng). Chỗ nào WHO không có thì bỏ trống.
export function curves(ind, sex, from, to) {
  const out = { p3: [], p15: [], p50: [], p85: [], p97: [] };
  const a0 = Math.max(0, Math.floor(from)); const a1 = Math.min(228, Math.ceil(to));
  for (let m = a0; m <= a1; m++) {
    const lms = lmsAt(ind, sex, m);
    if (!lms) continue;
    for (const [k, z] of Object.entries(Z_FOR)) out[k].push([m, Math.round(valueAtZ(lms, z) * 100) / 100]);
  }
  return out;
}
// Tuổi tối đa có chuẩn cho một chỉ số
export const maxAgeMonths = (ind) => (ind === 'wfa' || ind === 'hcfa' ? 60 : 228);

// Phân tích tăng trưởng của một đứa trẻ. measures: [{day, kind: weight|height|head, v1}]. Trả từng chỉ số: điểm, vị trí, đường chuẩn.
export function analyze({ sex, birthDate, measures, today }) {
  if (!sex || !birthDate) return { ready: false, reason: 'Cần giới tính và ngày sinh để đối chiếu chuẩn WHO.' };
  const by = { weight: [], height: [], head: [] };
  for (const m of measures) if (by[m.kind]) by[m.kind].push({ day: m.day, v: Number(m.v1) });
  for (const k of Object.keys(by)) by[k].sort((a, b) => (a.day < b.day ? -1 : 1));
  // BMI: cân nặng + chiều cao cùng ngày, hoặc chiều cao gần nhất trong 30 ngày
  const bmi = [];
  for (const w of by.weight) {
    let best = null; let bd = 31;
    for (const h of by.height) {
      const d = Math.abs((Date.parse(h.day + 'T00:00:00Z') - Date.parse(w.day + 'T00:00:00Z')) / 86400000);
      if (d < bd) { bd = d; best = h; }
    }
    if (best && best.v > 0) bmi.push({ day: w.day, v: Math.round((w.v / ((best.v / 100) ** 2)) * 10) / 10 });
  }
  by.bmi = bmi;
  const endAge = Math.max(ageMonths(birthDate, today), ...Object.values(by).flat().map((p) => ageMonths(birthDate, p.day)), 0);
  const out = { ready: true, ageMonths: Math.round(ageMonths(birthDate, today) * 10) / 10, indicators: {}, notes: [] };
  const labels = { weight: 'Cân nặng', height: 'Chiều dài/chiều cao', head: 'Vòng đầu', bmi: 'BMI' };
  for (const kind of ['weight', 'height', 'head', 'bmi']) {
    const ind = KIND_IND[kind];
    const pts = by[kind].map((p) => {
      const a = ageMonths(birthDate, p.day);
      return { day: p.day, ageMonths: Math.round(a * 100) / 100, value: p.v, place: placeOf(ind, sex, a, p.v) };
    }).filter((p) => p.ageMonths >= 0);
    if (!pts.length) continue;
    const covered = pts.filter((p) => p.place);
    const hidden = pts.length - covered.length;
    const last = pts[pts.length - 1];
    const ageLast = last.ageMonths;
    const lo = Math.max(0, Math.min(...pts.map((p) => p.ageMonths)) - 3);
    const hi = Math.min(maxAgeMonths(ind), Math.max(endAge, ...pts.map((p) => p.ageMonths)) + 3);
    out.indicators[kind] = {
      label: labels[kind], unit: kind === 'bmi' ? 'kg/m²' : kind === 'weight' ? 'kg' : 'cm', ind,
      points: pts, curves: covered.length || ageLast <= maxAgeMonths(ind) ? curves(ind, sex, lo, hi) : null,
      last: { ...last, text: explain(labels[kind], last.place) },
      note: hidden ? (ageLast > maxAgeMonths(ind) ? `WHO không có đường chuẩn ${labels[kind].toLowerCase()} theo tuổi sau ${maxAgeMonths(ind) / 12} tuổi trong dữ liệu của app, nên không đối chiếu ở độ tuổi này.` : 'Có số đo ngoài độ tuổi có đường chuẩn nên không đối chiếu.') : '',
      source: whoMeta(ind).source,
    };
  }
  if (!Object.keys(out.indicators).length) out.ready = false, out.reason = 'Chưa có số đo nào.';
  return out;
}
