// Ngày quan trọng: tìm lần kế tiếp (dương/âm), dịp lễ, danh sách "sắp tới", tệp .ics có VALARM. Thuần hàm.
import {
  iso, tachIso, homNayIso, congNgay, chenhNgay, amCua, amSangIso, namNhuanDuong, ngayThuTrongThang, ngayVn, soNgayDuong, hopLe,
} from './ngay.js';
import { canChiNam } from './lunar.js';
import { DIP_LE } from '../data/dip.js';

export const LOAI_NGAY = Object.assign(Object.create(null), {
  sinhNhat: { ten: 'Sinh nhật', truoc: 3 },
  gio: { ten: 'Ngày giỗ', truoc: 3 },
  cuoi: { ten: 'Ngày cưới', truoc: 7 },
  kyNiem: { ten: 'Kỷ niệm', truoc: 3 },
  khac: { ten: 'Ngày khác', truoc: 3 },
});

/**
 * Lần kế tiếp (>= tuIso) của một ngày lặp hằng năm.
 * spec: {kieu:'duong'|'am', ngay, thang, nam?, nhuan?}
 * Quy ước âm: tháng nhuận -> nhắc theo tháng thường cùng số; ngày 30 gặp tháng thiếu (29 ngày) -> ngày 29.
 * Quy ước dương: 29/2 gặp năm không nhuận -> 28/2.
 * @returns {{iso:string, namAm:number|null}|null}
 */
export function lanKeTiep(spec, tuIso) {
  const t = tachIso(tuIso);
  if (!t || !spec) return null;
  const ngay = Number(spec.ngay); const thang = Number(spec.thang);
  if (!(ngay >= 1 && ngay <= 31 && thang >= 1 && thang <= 12)) return null;
  if (spec.kieu === 'am') {
    if (ngay > 30) return null;
    for (let y = t.y - 1; y <= t.y + 2; y++) {
      const r = amSangIso(ngay, thang, y);
      if (r && r >= tuIso) return { iso: r, namAm: y };
    }
    return null;
  }
  for (let y = t.y; y <= t.y + 8; y++) {
    let d = ngay;
    if (thang === 2 && ngay === 29 && !namNhuanDuong(y)) d = 28;
    if (!hopLe(y, thang, d)) return null;
    const r = iso(y, thang, d);
    if (r >= tuIso) return { iso: r, namAm: null };
  }
  return null;
}

/** Ngày của một dịp lễ trong năm dương y (hoặc null). */
export function ngayDip(dip, y) {
  if (dip.kieu === 'duong') return iso(y, dip.thang, dip.ngay);
  if (dip.kieu === 'am') return amSangIso(dip.ngay, dip.thang, y);
  if (dip.kieu === 'chuNhat') return ngayThuTrongThang(y, dip.thang, 0, dip.lan);
  return null;
}

/**
 * Các mục nhắc từ danh bạ + ngày quan trọng tự thêm.
 * people: [{id, ten, cachGoi, sinh:{kieu,ngay,thang,nam,nhuan}, nhacTruoc}], dates: [{id, personId, loai, ten, kieu, ngay, thang, nam, nhuan, truoc}]
 */
export function danhSachMuc(people = [], dates = []) {
  const tenId = new Map(people.map((p) => [p.id, p]));
  const out = [];
  for (const p of people) {
    if (p.sinh && p.sinh.ngay && p.sinh.thang) {
      out.push({ key: `sn:${p.id}`, loai: 'sinhNhat', personId: p.id, ten: p.cachGoi || p.ten, kieu: p.sinh.kieu === 'am' ? 'am' : 'duong', ngay: p.sinh.ngay, thang: p.sinh.thang, nam: p.sinh.nam || null, nhuan: !!p.sinh.nhuan, truoc: p.nhacTruoc ?? LOAI_NGAY.sinhNhat.truoc });
    }
  }
  for (const d of dates) {
    const p = d.personId ? tenId.get(d.personId) : null;
    const ten = d.ten || (p ? (p.cachGoi || p.ten) : '');
    out.push({ key: `d:${d.id}`, loai: LOAI_NGAY[d.loai] ? d.loai : 'khac', personId: d.personId || null, ten, kieu: d.kieu === 'am' ? 'am' : 'duong', ngay: d.ngay, thang: d.thang, nam: d.nam || null, nhuan: !!d.nhuan, truoc: d.truoc ?? (LOAI_NGAY[d.loai] || LOAI_NGAY.khac).truoc, ghiChu: d.ghiChu || '' });
  }
  return out;
}

const lanThuTiengViet = (n) => (n === 1 ? 'giỗ đầu' : `giỗ lần thứ ${n}`);

function moTaMuc(m, ln) {
  const t = tachIso(ln.iso);
  if (m.loai === 'sinhNhat') {
    const tuoi = m.nam ? (m.kieu === 'am' ? ln.namAm - m.nam : t.y - m.nam) : null;
    return { tieuDe: `Sinh nhật ${m.ten}`, phu: tuoi && tuoi > 0 ? `tròn ${tuoi} tuổi${m.kieu === 'am' ? ' (tính theo âm lịch)' : ''}` : '', lan: tuoi };
  }
  if (m.loai === 'gio') {
    const n = m.nam ? (m.kieu === 'am' ? ln.namAm - m.nam : t.y - m.nam) : null;
    return { tieuDe: `Giỗ ${m.ten}`, phu: n && n > 0 ? lanThuTiengViet(n) : '', lan: n };
  }
  if (m.loai === 'cuoi') {
    const n = m.nam ? (m.kieu === 'am' ? ln.namAm - m.nam : t.y - m.nam) : null;
    return { tieuDe: `Ngày cưới ${m.ten}`, phu: n && n > 0 ? `kỷ niệm ${n} năm` : '', lan: n };
  }
  return { tieuDe: m.ten || LOAI_NGAY[m.loai].ten, phu: '', lan: null };
}

/**
 * Mọi sự kiện trong [tu, tu + soNgay]. Mỗi phần tử:
 * {key, loai, personId, tieuDe, phu, iso, conLai, am, truoc, canChuanBi, dip?}
 * dipBat: tập id dịp lễ được bật (mặc định theo macDinh của từng dịp).
 */
export function sapToi({ people = [], dates = [], dipBat = null, tu = homNayIso(), soNgay = 30 }) {
  const den = congNgay(tu, soNgay);
  const ds = [];
  for (const m of danhSachMuc(people, dates)) {
    // lặp mọi lần rơi trong khoảng (khoảng dài như 24 tháng có nhiều lần)
    let tuLan = tu;
    for (let guard = 0; guard < 40; guard++) {
      const ln = lanKeTiep(m, tuLan);
      if (!ln || ln.iso > den) break;
      const mo = moTaMuc(m, ln);
      const conLai = chenhNgay(tu, ln.iso);
      ds.push({ key: m.key, loai: m.loai, personId: m.personId, tieuDe: mo.tieuDe, phu: mo.phu, lan: mo.lan, iso: ln.iso, conLai, am: amCua(ln.iso), truoc: m.truoc, canChuanBi: conLai <= m.truoc && m.loai !== 'gio' });
      tuLan = congNgay(ln.iso, 1);
    }
  }
  const t = tachIso(tu); const tDen = tachIso(den);
  for (const dip of DIP_LE) {
    const bat = dipBat ? dipBat.has(dip.id) : dip.macDinh;
    if (!bat) continue;
    // năm dương bắt đầu từ y-1: dịp âm tháng Chạp của năm âm trước rơi vào tháng 1-2 năm dương sau
    for (let y = t.y - 1; y <= tDen.y; y++) {
      const d = ngayDip(dip, y);
      if (!d || d < tu || d > den) continue;
      const conLai = chenhNgay(tu, d);
      ds.push({ key: `dip:${dip.id}:${d}`, loai: 'dip', dipId: dip.id, personId: null, tieuDe: dip.ten, phu: dip.doiTuong || '', iso: d, conLai, am: amCua(d), truoc: dip.truoc, canChuanBi: conLai <= dip.truoc && dip.quaTang !== false });
    }
  }
  return ds.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.tieuDe.localeCompare(b.tieuDe, 'vi')));
}

// ---------- .ics ----------
const enc = new TextEncoder();
function gap(line) {
  // gấp dòng ở 75 octet, không cắt giữa ký tự
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = ''; let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}
const thoat = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ngayIcs = (s) => s.replace(/-/g, '');

/** Hash ngắn ổn định để làm UID. */
function bam(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/**
 * Tạo tệp lịch .ics: mỗi sự kiện là cả ngày, có hai nhắc (VALARM): trước `truoc` ngày lúc 9 giờ và đúng ngày lúc 8 giờ.
 * Ngày âm không biểu diễn được bằng RRULE nên xuất từng lần cho nhiều năm tới.
 */
export function taoIcs(events, { now = new Date(), ten = '9gift - Ngày quan trọng' } = {}) {
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}Z`;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app.tech//9gift//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${thoat(ten)}`];
  for (const e of events) {
    const mo = [];
    if (e.am) mo.push(`Âm lịch: ${e.am.ngay}/${e.am.thang}${e.am.nhuan ? ' nhuận' : ''} năm ${canChiNam(e.am.nam)}`);
    if (e.phu) mo.push(e.phu);
    if (e.loai !== 'gio') mo.push('Nhớ chuẩn bị quà hoặc phong bì.');
    const uid = `${bam(`${e.key}|${e.iso}`)}-${ngayIcs(e.iso)}@9gift.9app.tech`;
    L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ngayIcs(e.iso)}`, `DTEND;VALUE=DATE:${ngayIcs(congNgay(e.iso, 1))}`, `SUMMARY:${thoat(e.tieuDe)}`);
    if (mo.length) L.push(`DESCRIPTION:${thoat(mo.join('\n'))}`);
    L.push('TRANSP:TRANSPARENT', 'CATEGORIES:9gift');
    const truoc = Math.max(0, Math.round(Number(e.truoc) || 0));
    if (truoc > 0) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${thoat(`Còn ${truoc} ngày: ${e.tieuDe}. Chuẩn bị quà.`)}`, `TRIGGER:-P${truoc - 1}DT15H`, 'END:VALARM');
    }
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${thoat(`Hôm nay: ${e.tieuDe}`)}`, 'TRIGGER:PT8H', 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return `${L.map(gap).join('\r\n')}\r\n`;
}

/** Mọi sự kiện trong `soThang` tháng tới, dùng để xuất .ics. */
export function suKienChoIcs(args, soThang = 12) {
  return sapToi({ ...args, soNgay: Math.round(soThang * 30.5) });
}
export { ngayVn, soNgayDuong };
