// Đồng bộ 9payday qua tài khoản 9app (tùy chọn, mặc định tắt). Toàn bộ trạng thái là một đối tượng JSON thuần nên đồng bộ nguyên khối `du_lieu`.
// Gộp ba chiều theo bản ghi (id) ở máy; xem js/lib/nine-sync.js. Bản ghi không có dấu thời gian: khi hai máy cùng sửa một bản ghi, máy đang đồng bộ thắng.
import { createSync } from './nine-sync.js';
import { layState, datLai, ghiNgay } from './store.js';

export const dongBo = createSync({
  app: 'payday',
  getData: () => ({ du_lieu: JSON.parse(JSON.stringify(layState())) }),
  setData: async (m) => { datLai(m.du_lieu); await ghiNgay(); },
});
export const dangNhapUrl = () => '/id/?next=' + encodeURIComponent(location.pathname + location.search + location.hash) + '#/dang-nhap';
