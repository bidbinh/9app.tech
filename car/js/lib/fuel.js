// Tính mức tiêu hao, chi phí/km, thống kê chi phí. Thuần hàm.
import { thangCuaNgay, nThangGan, diffDays, addMonths } from './dates.js';

export const LOAI_NHAT_KY = [
  { id: 'xang', ten: 'Đổ nhiên liệu', nhom: 'nhien-lieu', ngan: 'Xăng, dầu' },
  { id: 'sac', ten: 'Sạc điện', nhom: 'nhien-lieu', ngan: 'Sạc điện' },
  { id: 'bao-duong', ten: 'Bảo dưỡng', nhom: 'bao-duong', ngan: 'Bảo dưỡng' },
  { id: 'sua-chua', ten: 'Sửa chữa', nhom: 'sua-chua', ngan: 'Sửa chữa' },
  { id: 'gui-xe', ten: 'Gửi xe', nhom: 'gui-xe', ngan: 'Gửi xe' },
  { id: 'cau-duong', ten: 'Cầu đường', nhom: 'cau-duong', ngan: 'Cầu đường' },
  { id: 'rua-xe', ten: 'Rửa xe', nhom: 'rua-xe', ngan: 'Rửa xe' },
  { id: 'khac', ten: 'Khác', nhom: 'khac', ngan: 'Khác' },
];
export const NHOM_CHI_PHI = [
  { id: 'nhien-lieu', ten: 'Nhiên liệu, sạc' },
  { id: 'bao-duong', ten: 'Bảo dưỡng' },
  { id: 'sua-chua', ten: 'Sửa chữa' },
  { id: 'gui-xe', ten: 'Gửi xe' },
  { id: 'cau-duong', ten: 'Cầu đường' },
  { id: 'rua-xe', ten: 'Rửa xe' },
  { id: 'khac', ten: 'Khác' },
];
export const tenLoai = (id) => (LOAI_NHAT_KY.find((l) => l.id === id) || { ten: id }).ten;
export const nhomCua = (id) => (LOAI_NHAT_KY.find((l) => l.id === id) || { nhom: 'khac' }).nhom;

const coSo = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Mức tiêu hao theo phương pháp đổ đầy - đổ đầy.
 * entries: các lần đổ/sạc của MỘT xe, cùng loại ('xang' hoặc 'sac'). Mỗi lần: {km, luong, day} (day !== false là đổ đầy).
 * Lần đổ đầy trước đó làm mốc; mọi lượng đổ sau mốc đến lần đầy kế tiếp được cộng vào.
 */
export function tieuHao(entries) {
  const canhBao = [];
  const coLuong = entries.filter((e) => coSo(e.luong) && e.luong > 0);
  const khongKm = coLuong.filter((e) => !coSo(e.km)).length;
  if (khongKm) canhBao.push(`${khongKm} lần đổ chưa có số km không được tính vào mức tiêu hao.`);
  const ds = coLuong.filter((e) => coSo(e.km))
    .sort((a, b) => a.km - b.km || String(a.ngay).localeCompare(String(b.ngay)));
  // số km phải tăng theo ngày; nếu lùi thì nhiều khả năng gõ nhầm, báo thay vì lặng lẽ sắp lại
  const theoNgay = ds.slice().sort((a, b) => String(a.ngay).localeCompare(String(b.ngay)) || a.km - b.km);
  let lui = 0;
  for (let i = 1; i < theoNgay.length; i++) if (theoNgay[i].km < theoNgay[i - 1].km) lui++;
  if (lui) canhBao.push(`${lui} lần ghi có số km nhỏ hơn lần trước đó theo ngày. Hãy kiểm tra, có thể bạn gõ nhầm số km.`);
  const dau = ds.filter((e) => e.day !== false);
  const doan = [];
  for (let i = 1; i < dau.length; i++) {
    const a = dau[i - 1]; const b = dau[i];
    const km = b.km - a.km;
    if (km <= 0) continue;
    const luong = ds.filter((e) => e.km > a.km && e.km <= b.km).reduce((s, e) => s + e.luong, 0);
    if (luong <= 0) continue;
    doan.push({ tu: a.km, den: b.km, km, luong, per100: (luong / km) * 100, ngay: b.ngay });
  }
  const tongKm = doan.reduce((s, d) => s + d.km, 0);
  const tongLuong = doan.reduce((s, d) => s + d.luong, 0);
  return {
    per100: tongKm > 0 ? (tongLuong / tongKm) * 100 : null,
    gan: doan.length ? doan[doan.length - 1].per100 : null,
    tongKm, tongLuong, doan, canhBao,
    canThem: dau.length < 2 ? 'Cần ít nhất 2 lần đổ đầy kèm số km trên đồng hồ để tính mức tiêu hao.' : '',
  };
}

/** Chi phí trên mỗi km của một xe: tổng chi trong khoảng đã có số km / số km đã chạy. */
export function chiPhiMoiKm(entries, loc = null) {
  const co = entries.filter((e) => coSo(e.km));
  if (co.length < 2) return { moiKm: null, tong: 0, km: 0 };
  const sx = co.slice().sort((a, b) => a.km - b.km);
  const dau = sx[0]; const cuoi = sx[sx.length - 1];
  const km = cuoi.km - dau.km;
  if (km <= 0) return { moiKm: null, tong: 0, km: 0 };
  let tong = 0;
  for (const e of entries) {
    if (loc && !loc(e)) continue;
    if (e === dau && nhomCua(e.loai) === 'nhien-lieu') continue; // nhiên liệu đổ trước mốc đầu không tính vào quãng đường
    if (e.ngay < dau.ngay || e.ngay > cuoi.ngay) continue;
    tong += e.tien || 0;
  }
  return { moiKm: km > 0 ? tong / km : null, tong, km };
}

export function tongTien(entries) { return entries.reduce((s, e) => s + (e.tien || 0), 0); }

/** n tháng gần nhất, mỗi tháng có tổng và tổng theo nhóm. */
export function thongKeThang(entries, hom, n = 12) {
  const cac = nThangGan(hom, n);
  const map = new Map(cac.map((ym) => [ym, { ym, tong: 0, theoNhom: {} }]));
  for (const e of entries) {
    const o = map.get(thangCuaNgay(e.ngay));
    if (!o) continue;
    const t = e.tien || 0;
    o.tong += t;
    const g = nhomCua(e.loai);
    o.theoNhom[g] = (o.theoNhom[g] || 0) + t;
  }
  return cac.map((ym) => map.get(ym));
}

export function theoNhom(entries) {
  const m = new Map();
  for (const e of entries) {
    const g = nhomCua(e.loai);
    m.set(g, (m.get(g) || 0) + (e.tien || 0));
  }
  return NHOM_CHI_PHI.map((g) => ({ id: g.id, ten: g.ten, tong: m.get(g.id) || 0 })).filter((x) => x.tong > 0).sort((a, b) => b.tong - a.tong);
}

/** Tổng chi phí sở hữu: chi vận hành ghi trong sổ, chia theo tháng sở hữu; cộng giá mua nếu có. */
export function tongChiPhiSoHuu(xe, entries, hom) {
  const tong = tongTien(entries);
  const tu = xe.ngayMua || xe.ngayDangKy || (entries.length ? entries.map((e) => e.ngay).sort()[0] : null);
  let thang = null;
  if (tu && tu <= hom) {
    const ngay = diffDays(tu, hom);
    thang = Math.max(1, Math.round(ngay / 30.4375));
  }
  const giaMua = coSo(xe.giaMua) && xe.giaMua > 0 ? xe.giaMua : null;
  return { vanHanh: tong, thang, moiThang: thang ? tong / thang : null, giaMua, tatCa: giaMua ? tong + giaMua : null, tu };
}

/** Ước số km đi mỗi ngày từ các lần ghi có số km (cần ít nhất 30 ngày dữ liệu). */
export function uocKmNgay(entries, xe = null) {
  const pts = entries.filter((e) => coSo(e.km) && e.ngay).map((e) => ({ km: e.km, ngay: e.ngay }));
  if (xe && coSo(xe.km) && xe.kmNgay) pts.push({ km: xe.km, ngay: xe.kmNgay });
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.ngay.localeCompare(b.ngay) || a.km - b.km);
  const a = pts[0]; const b = pts[pts.length - 1];
  const ngay = diffDays(a.ngay, b.ngay);
  const km = b.km - a.km;
  if (ngay < 30 || km <= 0) return null;
  return km / ngay;
}

/**
 * So sánh chi phí/km xe điện với xe xăng tương đương.
 * giaDien: đ/kWh, giaXang: đ/lít, kwh100: kWh/100km của xe điện, l100: lít/100km của xe xăng tương đương.
 */
export function soSanhDienXang({ kwh100, giaDien, l100, giaXang }) {
  const dien = coSo(kwh100) && coSo(giaDien) && kwh100 > 0 && giaDien > 0 ? (kwh100 * giaDien) / 100 : null;
  const xang = coSo(l100) && coSo(giaXang) && l100 > 0 && giaXang > 0 ? (l100 * giaXang) / 100 : null;
  return { dienMoiKm: dien, xangMoiKm: xang, tietKiem1000km: dien !== null && xang !== null ? (xang - dien) * 1000 : null };
}

export function giaCuaThang(ngayCapNhat, hom) {
  if (!ngayCapNhat) return null;
  return diffDays(ngayCapNhat, hom) > 90 || addMonths(ngayCapNhat, 3) < hom ? 'cu' : 'moi';
}
