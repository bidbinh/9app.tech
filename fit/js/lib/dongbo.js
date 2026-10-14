// Đồng bộ 9fit qua tài khoản 9app (tùy chọn, mặc định tắt): nhật ký tập luyện, gộp ba chiều theo id (js/lib/nine-sync.js).
// Dữ liệu sức khỏe nhạy cảm KHÔNG đồng bộ: sàng lọc PAR-Q (`sangloc`), kế hoạch đang theo (`kehoach`, phụ thuộc kết quả sàng lọc ở máy), cài đặt riêng của máy (`caidat`) và bản nháp (`nhap`).
// Bản ghi không có dấu thời gian: hai máy cùng sửa một bản ghi thì máy đang đồng bộ thắng.
import { createSync } from './nine-sync.js';
import * as db from './db.js';

export const KHOA_DONG_BO = ['buoi', 'choi', 'dodac', 'muctieu', 'test'];

export function layDuLieu() {
  const du = {};
  for (const k of KHOA_DONG_BO) { const v = db.doc(k, undefined); if (v !== undefined && v !== null) du[k] = v; }
  return du;
}
export async function datDuLieu(merged) {
  const kt = db.kiemTraGoi({ ungDung: '9fit', phienBan: db.PHIEN_BAN, duLieu: Object.fromEntries(KHOA_DONG_BO.filter((k) => k in merged).map((k) => [k, merged[k]])) });
  if (!kt.ok) throw new Error(kt.loi);
  for (const k of KHOA_DONG_BO) {
    if (k in kt.sach) await db.ghi(k, kt.sach[k]);
    else if (!(k in merged)) await db.bo(k);
  }
}

export const dongBo = createSync({ app: 'fit', getData: layDuLieu, setData: datDuLieu, sanSang: () => db.trangThai.luuBen });   // chạy bằng bộ nhớ tạm: dữ liệu rỗng không được hiểu là "đã xóa hết"
export const dangNhapUrl = () => '/id/?next=' + encodeURIComponent(location.pathname + location.search + location.hash) + '#/dang-nhap';
