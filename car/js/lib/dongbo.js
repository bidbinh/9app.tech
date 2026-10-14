// Đồng bộ 9car qua tài khoản 9app (tùy chọn, mặc định tắt): ba tập `xe`, `nhatKy`, `hen`, gộp ba chiều theo id (js/lib/nine-sync.js).
// KHÔNG đồng bộ ảnh xe (nhạy cảm và nặng): ảnh ở lại máy, bản ghi từ máy khác không mang ảnh nhưng ảnh sẵn có trên máy này được giữ lại.
// `meta` (cài đặt riêng của máy) cũng không đồng bộ. Bản ghi không có dấu thời gian: hai máy cùng sửa một bản ghi thì máy đang đồng bộ thắng.
import { createSync } from './nine-sync.js';
import { kho, loXe, loNhatKy, loHen } from './data.js';
import * as db from './db.js';

const sach = (x) => { const { anh, ...r } = x; return r; };
const nhanBan = (o) => JSON.parse(JSON.stringify(o));

async function thayTap(ten, cu, moi) {
  const conId = new Set(moi.map((x) => x.id));
  for (const x of cu) if (!conId.has(x.id)) await db.xoa(ten, x.id);
  if (moi.length) await db.ghiNhieu(ten, moi);
}

export const dongBo = createSync({
  app: 'car',
  sanSang: () => kho.luuTru === 'indexeddb',   // chạy bằng bộ nhớ tạm: dữ liệu rỗng không được hiểu là "đã xóa hết"
  getData: () => nhanBan({ xe: kho.xe.map(sach), nhatKy: kho.nhatKy, hen: kho.hen }),
  setData: async (m) => {
    const anhCu = new Map(kho.xe.filter((x) => x.anh).map((x) => [x.id, x.anh]));
    const xe = (m.xe || []).map((x) => loXe({ ...x, anh: anhCu.get(x.id) || '' })).filter(Boolean);
    const nhatKy = (m.nhatKy || []).map(loNhatKy).filter(Boolean);
    const hen = (m.hen || []).map(loHen).filter(Boolean);
    await thayTap('xe', kho.xe, xe); await thayTap('nhatKy', kho.nhatKy, nhatKy); await thayTap('hen', kho.hen, hen);
    kho.xe = xe; kho.nhatKy = nhatKy; kho.hen = hen;
  },
});
export const dangNhapUrl = () => '/id/?next=' + encodeURIComponent(location.pathname + location.search + location.hash) + '#/dang-nhap';
