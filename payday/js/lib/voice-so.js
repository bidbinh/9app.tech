// Đọc số tiền tiếng Việt: "45k", "2tr5", "hai triệu rưỡi", "một trăm hai mươi nghìn".
// Phần lõi (bảng từ, manhSo, duoiMuoi, nhomGiaTri, capDo, docDayManh) SAO CHÉP từ 9unit: unit/js/lib/voice.js
// (bộ phân tích lời nói tiếng Việt cho máy tính giọng nói). Chỉ giữ phần đọc số; phần tính toán của 9unit không dùng ở đây.
import { khoaTim, docSo, chuanHoaSoChuoi } from './text.js';

const RE_SO = /^\d+(?:[.,]\d+)*$/;
const laSo = (w) => RE_SO.test(w);
function giaTriSo(w) {
  const c = chuanHoaSoChuoi(w);
  if (c === '') return null;
  const v = Number(c);
  return Number.isFinite(v) ? v : null;
}

const CHU_SO = {
  khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9,
};
const THANG = { nghin: 1e3, ngan: 1e3, ngin: 1e3, trieu: 1e6, chieu: 1e6, cu: 1e6, ty: 1e9, ti: 1e9 };
const TU_LE = new Set(['le', 'linh']);
const TU_RUOI = new Set(['ruoi', 'ruoi']);

// ---------- Phân loại một từ thành "mảnh số" ----------
/** Trả {k,...} nếu từ là một phần của số, ngược lại null. `truoc` là mảnh số đứng ngay trước (để phân giải mười/mươi). */
export function manhSo(w, truoc) {
  if (laSo(w)) {
    const v = giaTriSo(w);
    return v === null ? null : { k: 'lit', v, w };
  }
  if (w in CHU_SO && Object.prototype.hasOwnProperty.call(CHU_SO, w)) return { k: 'd', v: CHU_SO[w], w };
  if (w === 'muoi') {
    const sauSo = truoc && ((truoc.k === 'd' && truoc.v >= 2) || (truoc.k === 'lit' && truoc.v >= 2 && truoc.v <= 9));
    return sauSo ? { k: 'tens', w } : { k: 'ten', w };
  }
  if (w === 'tram') return { k: 'tram', w };
  if (w === 'chuc') return { k: 'chuc', w };
  if (TU_LE.has(w)) return { k: 'le', w };
  if (TU_RUOI.has(w)) return { k: 'ruoi', w };
  if (Object.prototype.hasOwnProperty.call(THANG, w)) return { k: 'scale', v: THANG[w], w };
  return null;
}

// ---------- Đọc một cụm mảnh số thành giá trị ----------
function duoiMuoi(m) { // phần "chục + đơn vị" (0..99) từ danh sách mảnh; null nếu sai khuôn
  const L = m.length;
  const so = (x) => x && (x.k === 'd' || x.k === 'lit');
  if (L === 0) return 0;
  if (L === 1) {
    if (so(m[0])) return m[0].v;
    if (m[0].k === 'ten') return 10;
    if (m[0].k === 'chuc') return 10;
    return null;
  }
  if (L === 2) {
    if (m[0].k === 'le' && so(m[1])) return m[1].v;
    if (m[0].k === 'ten' && so(m[1])) return 10 + m[1].v;
    if (so(m[0]) && (m[1].k === 'tens' || m[1].k === 'chuc')) return m[0].v * 10;
    return null;
  }
  if (L === 3 && so(m[0]) && m[1].k === 'tens' && so(m[2])) return m[0].v * 10 + m[2].v;
  if (L === 3 && so(m[0]) && m[1].k === 'chuc' && so(m[2])) return m[0].v * 10 + m[2].v;
  return null;
}

// Giá trị một nhóm không có từ nghìn/triệu/tỷ. Trả {v, leLe, ghiChu} hoặc null.
function nhomGiaTri(items) {
  let m = items.slice();
  let half = false;
  const ghiChu = [];
  if (m.length && m[m.length - 1].k === 'ruoi') { half = true; m = m.slice(0, -1); }
  if (!m.length) return { v: 0, nuaThoi: true, ghiChu };
  const leLe = m[0].k === 'le';
  const tramIdx = m.findIndex((x) => x.k === 'tram');
  let v;
  let cuoiTram = false;
  if (tramIdx >= 0) {
    const truoc = m.slice(0, tramIdx);
    let h;
    if (truoc.length === 0) h = 1;
    else if (truoc.length === 1 && (truoc[0].k === 'd' || truoc[0].k === 'lit')) h = truoc[0].v;
    else return null;
    const sau = m.slice(tramIdx + 1);
    let t;
    if (sau.length === 1 && sau[0].k === 'd' && sau[0].v !== 0) {
      // "ba trăm tám" nói tắt là 380 (bỏ "mươi")
      t = sau[0].v * 10;
      ghiChu.push(`Hiểu "${m.slice(0, tramIdx + 2).map((x) => x.w).join(' ')}" là ${h * 100 + t} (nói tắt, bỏ "mươi"). Muốn ${h * 100 + sau[0].v} hãy nói "${docSo(h)} trăm lẻ ${docSo(sau[0].v)}".`);
    } else {
      t = duoiMuoi(sau);
      if (t === null) return null;
    }
    v = h * 100 + t;
    cuoiTram = sau.length === 0;
  } else if (m.length >= 2 && m[0].k !== 'le' && m.every((x) => x.k === 'd' || x.k === 'le')) {
    // đọc từng chữ số: "hai lẻ năm" = 205, "không chín ba" = 093, "hai lăm" = 25
    if (m[m.length - 1].k === 'le') return null;
    v = Number(m.map((x) => (x.k === 'le' ? 0 : x.v)).join(''));
  } else {
    v = duoiMuoi(m);
    if (v === null) return null;
  }
  if (half) {
    if (cuoiTram) v += 50;
    else if (m[m.length - 1].k === 'chuc') v += 5;
    else v += 0.5;
  }
  const leTram = m[0].k === 'd' && m[0].v === 0 && tramIdx === 1;
  return { v, leLe: leLe || leTram, soDon: m.length === 1 && (m[0].k === 'd' || m[0].k === 'lit') || (half && m.length === 1), coTram: tramIdx >= 0, ghiChu };
}

const THANG_DS = [1e9, 1e6, 1e3];
function capDo(items, cha, ghiChu) {
  for (const S of THANG_DS) {
    let idx = -1;
    for (let i = items.length - 1; i >= 0; i--) if (items[i].k === 'scale' && items[i].v === S) { idx = i; break; }
    if (idx < 0) continue;
    const trai = items.slice(0, idx);
    const phai = items.slice(idx + 1);
    let tv = 1;
    if (trai.length) { tv = capDo(trai, null, ghiChu); if (tv === null) return null; }
    let pv = 0;
    if (phai.length) { pv = capDo(phai, S, ghiChu); if (pv === null) return null; }
    return tv * S + pv;
  }
  // nhóm cuối: không còn từ thang
  if (items.length === 1 && items[0].k === 'ruoi') return cha ? 0.5 * cha : 0.5;
  const g = nhomGiaTri(items);
  if (!g) return null;
  g.ghiChu.forEach((x) => ghiChu.push(x));
  if (!cha) return g.v;
  if (g.leLe) return g.v * (cha / 1000);
  if (!g.coTram && g.v < 10) return g.v * (cha / 10);
  if (Number.isInteger(g.v) && g.v >= 1000 && !g.coTram) return g.v; // số đã viết đủ
  return g.v * (cha / 1000);
}

/** Đọc một dãy mảnh số thành số. Trả {v, ghiChu} hoặc null. */
export function docDayManh(items) {
  const ghiChu = [];
  const v = capDo(items, null, ghiChu);
  return v === null ? null : { v, ghiChu };
}
