// Hẹn giờ nghỉ giữa hiệp: thanh nổi dưới màn hình, hoạt động trên mọi màn hình cho đến khi xong hoặc bỏ qua.
import { h, xoa } from './dom.js';
import { DemNguoc, keu, mmss, moKhoaAm, caiDat, luuCaiDat } from './timer.js';

let dock = null; let dem = null; let tmEl = null;

function khungDock() {
  if (!dock) {
    dock = h('div', { class: 'rest-dock', hidden: true }, h('div', { class: 'rest-in', role: 'group', 'aria-label': 'Hẹn giờ nghỉ' }));
    document.body.append(dock);
  }
  return dock.firstChild;
}

/** Dựng thanh một lần; các lần tick chỉ cập nhật chữ số để nút không bị thay giữa lúc chạm. */
function dung_(nhan, xong) {
  const inEl = khungDock();
  dock.hidden = false;
  inEl.classList.toggle('xong', !!xong);
  xoa(inEl);
  tmEl = h('div', { class: 'tm', 'data-testid': 'rest-tm', role: 'timer', 'aria-live': 'off' }, '');
  inEl.append(
    h('div', {}, h('div', { class: 'lb' }, xong ? 'Hết giờ nghỉ' : `Nghỉ: ${nhan}`), tmEl),
    h('div', { class: 'grow' }),
    xong ? null : h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Bớt 15 giây', 'data-testid': 'rest-tru', onclick: () => dem?.cong(-15) }, '−15'),
    xong ? null : h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Thêm 15 giây', 'data-testid': 'rest-cong', onclick: () => dem?.cong(15) }, '+15'),
    h('button', { type: 'button', class: 'btn sm', 'data-testid': 'rest-bo', onclick: dung }, xong ? 'Đóng' : 'Bỏ qua'));
}

export function dung() {
  dem?.dung(); dem = null;
  if (dock) dock.hidden = true;
}

/** Bắt đầu hẹn giờ nghỉ. giay: số giây; nhan: tên bài. */
export function bat(giay, nhan = '') {
  moKhoaAm();
  dem?.dung();
  dung_(nhan, false);
  tmEl.textContent = mmss(giay);
  dem = new DemNguoc({
    giay,
    khiTick: (g) => { if (tmEl) tmEl.textContent = mmss(g); },
    khiXong: () => { keu(2); dung_(nhan, true); tmEl.textContent = '0:00'; },
  });
  dem.batDau();
}

export const dangChay = () => !!dem && dem.dangChay;
export const chonNghi = () => caiDat().nghiMacDinh;
export const datNghi = (g) => luuCaiDat({ nghiMacDinh: g });
