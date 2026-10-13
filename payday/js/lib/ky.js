// Số liệu của kỳ lương hiện tại: hũ, dự báo từng hũ và tổng. Thuần hàm.
import { chuKy, congNgay } from './dates.js';
import { tinhHu, duBao, huCuaKhoan } from './spend.js';

export function soLieuKy(st, hom, lui = 0) {
  let k = chuKy(hom, st.hoso.ngayLuong);
  if (lui > 0) { // kỳ trước: lùi về trước ngày bắt đầu kỳ hiện tại
    for (let i = 0; i < lui; i++) k = chuKy(congNgay(k.tu, -1), st.hoso.ngayLuong);
    k = { ...k, ngayDaQua: k.soNgay, ngayCon: 0 };
  }
  const chi = st.chi.filter((c) => c.ngay >= k.tu && c.ngay <= k.den);
  const hu = tinhHu({ net: st.hoso.net, hu: st.hu.tyLe, coDinh: st.coDinh, chi });
  const duBaoHu = {};
  for (const j of hu.ds) if (j.loai === 'chi') duBaoHu[j.id] = duBao({ daChi: j.daChi, duocChi: j.duocChi, ngayDaQua: k.ngayDaQua, soNgay: k.soNgay });
  const tong = duBao({ daChi: hu.tongDaChi, duocChi: hu.tongDuocChi, ngayDaQua: k.ngayDaQua, soNgay: k.soNgay });
  return { k, chi, hu, duBaoHu, tong };
}

export { huCuaKhoan };
