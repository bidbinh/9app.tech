// Xuất lịch .ics từ các mục nhắc có hạn ngày.
import { taiTep, toast } from './dom.js';
import { tatCaHen } from './common.js';
import { taoICS } from '../lib/ics.js';
import { tenXe } from '../lib/data.js';

function muc({ hen, xe, tt }) {
  return {
    id: hen.id, tieuDe: `${hen.ten}${xe ? ' - ' + tenXe(xe) : ''}`, han: tt.han,
    ghiChu: 'Nhắc từ 9car. Hãy đối chiếu hạn với giấy tờ, tem thật.' + (hen.ghiChu ? ` ${hen.ghiChu}` : ''),
  };
}
function tai(ds, ten) {
  const dm = ds.filter((x) => x.tt.han).map(muc);
  if (!dm.length) { toast('Chưa có mục nào có hạn ngày để xuất lịch.'); return 0; }
  taiTep(ten, taoICS(dm), 'text/calendar');
  toast(`Đã tạo lịch ${dm.length} mục, có nhắc trước 30, 7 và 1 ngày. Mở tệp để thêm vào lịch điện thoại.`, { ms: 9000 });
  return dm.length;
}
export const icsChoXe = (xeId) => tai(tatCaHen().filter((x) => x.hen.xeId === xeId), '9car-nhac-han-xe.ics');
export const icsTatCa = () => tai(tatCaHen(), '9car-nhac-han.ics');
export const icsMotHen = (id) => tai(tatCaHen().filter((x) => x.hen.id === id), '9car-nhac-han.ics');
