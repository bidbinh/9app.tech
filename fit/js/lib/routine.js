// Dựng chuỗi khởi động, giãn cơ từ kho bài: chia đều thời gian theo số phút yêu cầu. Thuần hàm.
// Quy tắc: bài ở "dau" chỉ xuất hiện một lần ở đầu, bài ở "cuoi" chỉ một lần ở cuối (ví dụ nâng nhịp tim cuối khởi động, thở cuối buổi giãn);
// phần giữa chạy theo vòng, từ vòng 2 được gắn nhãn "vòng 2" nên không lặp vô nghĩa.
const LAM_TRON = 5;
const lam5 = (v) => Math.max(10, Math.round(v / LAM_TRON) * LAM_TRON);

/** Thời gian gốc (giây) của một bài khi dùng trong chuỗi. */
export function giayGoc(ex) {
  const d = ex.dem;
  if (!d) return 30;
  if (d.kieu === 'giay') return Math.min(d.giayMin, 60);
  return Math.min(Math.max(d.lanMin * 3, 20), 60);
}
const tgBai = (ex) => giayGoc(ex) * (ex.dem && ex.dem.moiBen ? 2 : 1);

/**
 * Trả về các bước: [{ ex, giay, ben, vong }]. ben là 'trái', 'phải' hoặc ''.
 * quyTac: { dau: [id], cuoi: [id] }. Tổng thời gian khớp số phút yêu cầu trong khoảng vài phần trăm.
 */
export function dungChuoi(kho, phut, baiMap, quyTac = {}) {
  const dauId = quyTac.dau || []; const cuoiId = quyTac.cuoi || [];
  const lay = (ids) => ids.map((id) => baiMap.get(id)).filter(Boolean);
  const dau = lay(dauId); const cuoi = lay(cuoiId);
  const giua = (kho || []).filter((id) => !dauId.includes(id) && !cuoiId.includes(id)).map((id) => baiMap.get(id)).filter(Boolean);
  if (!giua.length && !dau.length && !cuoi.length) return [];
  const ngan = phut * 60;
  const co = [...dau.map((ex) => ({ ex, vong: 1 }))];
  let tong = dau.reduce((a, e) => a + tgBai(e), 0) + cuoi.reduce((a, e) => a + tgBai(e), 0);
  let vong = 1;
  const muc = ngan / 1.5; // ưu tiên kéo dài từng động tác (tối đa 1,5 lần) trước khi lặp lại vòng
  while (giua.length && tong < muc * 0.92 && vong <= 4) {
    let dung = false;
    for (const ex of giua) {
      const t = tgBai(ex);
      if (tong + t > muc * 1.08 && co.length > dau.length) { dung = true; break; }
      co.push({ ex, vong }); tong += t;
      if (tong >= muc * 0.92) { dung = true; break; }
    }
    if (dung) break;
    vong++;
  }
  cuoi.forEach((ex) => co.push({ ex, vong: 1 }));
  const he = Math.min(2, Math.max(0.6, ngan / tong));
  const buoc = [];
  let du = 0;
  for (const { ex, vong: v } of co) {
    const ben = ex.dem && ex.dem.moiBen;
    const so = ben ? 2 : 1;
    const ly = giayGoc(ex) * he;
    const g = lam5(ly + du / so);
    du += (ly - g) * so;
    if (ben) buoc.push({ ex: ex.id, giay: g, ben: 'trái', vong: v }, { ex: ex.id, giay: g, ben: 'phải', vong: v }); else buoc.push({ ex: ex.id, giay: g, ben: '', vong: v });
  }
  return buoc;
}
export const tongGiay = (buoc) => buoc.reduce((a, b) => a + b.giay, 0);
