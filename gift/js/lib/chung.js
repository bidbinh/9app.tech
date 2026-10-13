// Hàm dùng chung cho các màn: tra người, sự kiện sắp tới theo dữ liệu hiện có.
import { layDs, layMot, layCaiDat } from './kho.js';
import { sapToi } from './nhac.js';
import { homNayIso } from './ngay.js';

export const nguoiTheoId = (id) => (id ? layMot('people', id) : null);
/** Cách gọi ngắn của một người (ưu tiên "cách gọi"). */
export const goiNguoi = (p) => (p ? (p.cachGoi || p.ten) : '');
export function tenCuaKhoan(e) {
  const p = nguoiTheoId(e.personId);
  const t = p ? p.ten : (e.tenNguoi || 'Chưa ghi tên');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function dipBatHienTai() {
  const d = layCaiDat().dipBat;
  return d ? new Set(d) : null;
}

export function sapToiHienTai(soNgay = 30, tu = homNayIso()) {
  const cd = layCaiDat();
  const people = layDs('people').map((p) => ({ ...p, nhacTruoc: p.nhacTruoc ?? cd.nhacTruoc }));
  const dates = layDs('dates').map((d) => ({ ...d, truoc: d.truoc ?? undefined }));
  return sapToi({ people, dates, dipBat: dipBatHienTai(), tu, soNgay });
}

/** Chữ "Còn N ngày" / "Hôm nay" / "Ngày mai". */
export function conLaiChu(n) {
  if (n === 0) return 'Hôm nay';
  if (n === 1) return 'Ngày mai';
  return `Còn ${n} ngày`;
}

export const nhomCuaNguoi = (p) => p.nhom || '';

import { khoaTim } from './text.js';
import { luu } from './kho.js';
import { homNayIso as hn } from './ngay.js';

/** Quà trùng: người này đã được tặng món gần giống chưa (trong danh sách quà hoặc ghi chú ở sổ lễ). Trả mô tả hoặc null. */
export function kiemTrungQua(personId, ten, boQuaId = null) {
  const k = khoaTim(ten);
  if (k.length < 3 || !personId) return null;
  const gan = (x) => { const a = khoaTim(x); return a.length >= 3 && (a.includes(k) || k.includes(a)); };
  const g = layDs('gifts').find((x) => x.personId === personId && x.trangThai === 'da-tang' && x.id !== boQuaId && gan(x.ten));
  if (g) return `Bạn đã tặng “${g.ten}”${g.ngay ? ` ngày ${g.ngay.split('-').reverse().join('/')}` : ''}.`;
  const e = layDs('entries').find((x) => x.personId === personId && x.huong === 'di' && x.qua && gan(x.qua));
  if (e) return `Sổ lễ ghi bạn đã tặng “${e.qua}” ngày ${e.ngay.split('-').reverse().join('/')}.`;
  return null;
}

export function themQua({ personId, ten, trangThai = 'y-tuong', dip = '', ghiChu = '' }) {
  return luu('gifts', { personId: personId || null, trangThai, ten: ten.trim(), dip, ngay: trangThai === 'da-tang' ? hn() : null, ghiChu });
}
