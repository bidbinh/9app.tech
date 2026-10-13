// Khởi động, giãn cơ, phục hồi: chuỗi có hẹn giờ từng động tác, đọc to, tạm dừng, bỏ qua. Cùng màn hẹn giờ nghỉ lẻ.
import { h, xoa, chips } from '../ui/dom.js';
import { CHUOI, KHO, QUY_TAC } from '../data/routines.js';
import { BAI_THEO_ID } from '../data/exercises.js';
import { MON } from '../data/ex-base.js';
import { dungChuoi, tongGiay } from '../lib/routine.js';
import { DemNguoc, keu, doc as docTo, dungDoc, coGiongDoc, caiDat, luuCaiDat, mmss, moKhoaAm } from '../ui/timer.js';
import * as rest from '../ui/rest.js';
import { trangRong, bannerAnToan } from '../ui/common.js';

const TEN_MON = { ...MON, chung: 'Chung' };

function hang(tieuDe, loai, mon) {
  const ds = CHUOI.filter((c) => c.loai === loai && c.mon === mon);
  return h('div', { class: 'field' }, h('div', { class: 'lbl' }, tieuDe),
    h('div', { class: 'chips' }, ...ds.map((c) => h('a', { class: 'chip', href: `#/them/khoi-dong/${c.id}`, 'data-chuoi': c.id, 'aria-label': `${c.ten}` }, `${c.phut} phút`))));
}

function danhSach(ctx) {
  ctx.datTieuDe('Khởi động và giãn cơ');
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/them' }, '‹ Thêm'),
    h('section', { class: 'hero' }, h('h1', {}, 'Khởi động, giãn cơ, phục hồi'), h('p', {}, 'Chuỗi 5 đến 30 phút, hẹn giờ từng động tác, có giọng đọc tiếng Việt (tắt được). Chạy được khi không có mạng.')),
    h('div', { class: 'note' }, 'Khởi động 5 đến 10 phút trước khi tập hoặc chơi, và giãn cơ nhẹ sau đó. Dừng nếu đau nhói hoặc chóng mặt.'),
    h('div', { class: 'card stack' }, h('h2', {}, 'Khởi động trước tập, trước trận'),
      ...['cau-long', 'pickleball', 'bong-da', 'chay-bo', 'chung'].map((m) => hang(TEN_MON[m], 'khoi-dong', m))),
    h('div', { class: 'card stack' }, h('h2', {}, 'Giãn cơ và phục hồi sau tập, sau trận'),
      ...['cau-long', 'pickleball', 'bong-da', 'chay-bo', 'chung'].map((m) => hang(TEN_MON[m], 'phuc-hoi', m))),
    h('div', { class: 'card stack' }, h('h2', {}, 'Yoga, giãn cơ cơ bản'), hang('Toàn thân', 'yoga', 'chung')),
    h('a', { class: 'tile', href: '#/them/hen-gio', 'data-testid': 'o-hen-gio' }, h('b', {}, 'Hẹn giờ nghỉ'), h('span', { class: 'd' }, 'Đồng hồ đếm ngược lẻ cho nghỉ giữa hiệp')));
}

function chay(ctx, id) {
  const c = CHUOI.find((x) => x.id === id);
  const { root } = ctx;
  if (!c) { root.append(trangRong('Không tìm thấy chuỗi này', '', h('a', { class: 'btn', href: '#/them/khoi-dong' }, 'Về danh sách'))); return; }
  ctx.datTieuDe(c.ten);
  const buoc = dungChuoi(KHO[c.kho], c.phut, BAI_THEO_ID, QUY_TAC[c.kho]);
  const tong = tongGiay(buoc);
  let i = -1; let dem = null; let chuanBi = false; let tamDung = false; let xong = false;
  const khung = h('div', { class: 'stack', 'data-testid': 'runner' });
  root.append(khung);
  const loiTat = () => { dem?.dung(); dem = null; dungDoc(); };

  function ghiTat(k, v) { luuCaiDat({ [k]: v }); }
  const cd = caiDat();

  function veTruoc() {
    xoa(khung);
    const an = bannerAnToan({ ngan: true });
    if (an) khung.append(an);
    khung.append(
      h('a', { class: 'lnk', href: '#/them/khoi-dong' }, '‹ Danh sách'),
      h('section', { class: 'hero' }, h('h1', {}, c.ten), h('p', { 'data-testid': 'tom-tat' }, `${buoc.length} bước, khoảng ${Math.round(tong / 60)} phút.`)),
      h('div', { class: 'card stack' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'tg-doc', 'data-testid': 'tg-doc', checked: cd.docTo, disabled: !coGiongDoc(), onchange: (e) => ghiTat('docTo', e.target.checked) }), 'Đọc to tên động tác'),
        !coGiongDoc() ? h('div', { class: 'hint' }, 'Trình duyệt này chưa hỗ trợ giọng đọc.') : null,
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'tg-am', 'data-testid': 'tg-am', checked: cd.amThanh, onchange: (e) => ghiTat('amThanh', e.target.checked) }), 'Âm báo khi đổi động tác'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'tg-rung', 'data-testid': 'tg-rung', checked: cd.rung, onchange: (e) => ghiTat('rung', e.target.checked) }), 'Rung nếu thiết bị hỗ trợ'),
        h('button', { type: 'button', class: 'btn block', 'data-testid': 'bat-dau-chuoi', onclick: batDau }, 'Bắt đầu')),
      h('div', { class: 'card' }, h('h2', {}, 'Các động tác'),
        h('ol', { class: 'bul' }, ...buoc.map((b) => h('li', {}, `${BAI_THEO_ID.get(b.ex).ten}${b.ben ? ` (bên ${b.ben})` : ''}${b.vong > 1 ? ' (vòng 2)' : ''}: ${b.giay} giây`)))));
  }

  function batDau() {
    moKhoaAm();
    chuanBi = true; i = -1; xong = false; tamDung = false;
    chayChuanBi();
  }
  function chayChuanBi() {
    loiTat();
    ve();
    dem = new DemNguoc({ giay: 3, khiTick: (g) => capNhatSo(g), khiXong: () => { chuanBi = false; chay1(0); } });
    docTo('Chuẩn bị');
    dem.batDau();
  }
  function chay1(k) {
    loiTat();
    if (k >= buoc.length) { hoanThanh(); return; }
    i = k; chuanBi = false; tamDung = false;
    const b = buoc[k]; const ex = BAI_THEO_ID.get(b.ex);
    docTo(`${ex.ten}${b.ben ? `, bên ${b.ben}` : ''}, ${b.giay} giây`);
    ve();
    dem = new DemNguoc({ giay: b.giay, khiTick: (g) => { capNhatSo(g); const nhan = khung.querySelector('[data-testid="tong-con"]'); if (nhan) nhan.textContent = `Còn khoảng ${mmss(conLai(g))}`; }, khiXong: () => { keu(1); chay1(k + 1); } });
    dem.batDau();
  }
  const conLai = (g) => g + buoc.slice(i + 1).reduce((a, b) => a + b.giay, 0);
  function capNhatSo(g) {
    const el = khung.querySelector('[data-testid="dem-so"]');
    if (el) el.textContent = mmss(g);
  }
  function hoanThanh() {
    xong = true; i = buoc.length; keu(2); docTo('Hoàn thành. Giỏi lắm');
    ve();
  }
  function tamDungToggle() {
    if (!dem) return;
    if (tamDung) { dem.tiepTuc(); tamDung = false; } else { dem.tamDung(); tamDung = true; dungDoc(); }
    ve();
  }
  function boQua() { if (chuanBi) { chuanBi = false; chay1(0); } else chay1(i + 1); }
  function quayLai() { chay1(Math.max(0, i - 1)); }

  function ve() {
    xoa(khung);
    if (xong) {
      khung.append(h('div', { class: 'card runner', 'data-testid': 'chuoi-xong' }, h('h2', {}, 'Hoàn thành'), h('p', { class: 'sub' }, `${c.ten}. Uống nước và nghỉ một chút.`),
        h('div', { class: 'row wrap mt' }, h('a', { class: 'btn grow', href: '#/' }, 'Về Hôm nay'), h('button', { type: 'button', class: 'btn ghost grow', onclick: () => { xong = false; i = -1; loiTat(); veTruoc(); } }, 'Làm lại'))));
      return;
    }
    const b = chuanBi ? null : buoc[i];
    const ex = b ? BAI_THEO_ID.get(b.ex) : null;
    const tiepTheo = buoc[i + 1];
    const phanTram = Math.round((100 * Math.max(0, i)) / buoc.length);
    khung.append(
      h('div', { class: 'prog', role: 'progressbar', 'aria-valuenow': phanTram, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Tiến độ chuỗi' }, (() => { const el = h('i'); el.style.width = `${phanTram}%`; return el; })()),
      h('div', { class: 'card runner' },
        h('div', { class: 'sub', 'data-testid': 'buoc-so' }, chuanBi ? 'Chuẩn bị' : `Bước ${i + 1}/${buoc.length}`),
        h('h2', { 'data-testid': 'ten-dong-tac' }, chuanBi ? 'Sẵn sàng' : `${ex.ten}${b.ben ? ` · bên ${b.ben}` : ''}${b.vong > 1 ? ' · vòng 2' : ''}`),
        h('div', { class: 'big', 'data-testid': 'dem-so', role: 'timer', 'aria-live': 'off' }, mmss(dem ? Math.ceil(dem.conLai / 1000) : 0)),
        h('div', { class: 'sub', 'data-testid': 'tong-con' }, chuanBi ? '' : `Còn khoảng ${mmss(conLai(Math.ceil((dem?.conLai || 0) / 1000)))}`),
        tiepTheo ? h('p', { class: 'hint' }, `Tiếp theo: ${BAI_THEO_ID.get(tiepTheo.ex).ten}${tiepTheo.ben ? ` (bên ${tiepTheo.ben})` : ''}`) : h('p', { class: 'hint' }, 'Đây là bước cuối.'),
        h('div', { class: 'row wrap mt' },
          h('button', { type: 'button', class: 'btn ghost', 'data-testid': 'quay-lai', disabled: chuanBi || i <= 0, onclick: quayLai }, 'Quay lại'),
          h('button', { type: 'button', class: 'btn grow', 'data-testid': 'tam-dung', onclick: tamDungToggle }, tamDung ? 'Tiếp tục' : 'Tạm dừng'),
          h('button', { type: 'button', class: 'btn ghost', 'data-testid': 'bo-qua', onclick: boQua }, 'Bỏ qua'))),
      ex ? h('details', { class: 'card' }, h('summary', { class: 'lnk' }, 'Xem cách làm'), h('ol', { class: 'steps mt' }, ...ex.buoc.map((s) => h('li', {}, s)))) : null,
      h('button', { type: 'button', class: 'btn line block', 'data-testid': 'dung-chuoi', onclick: () => { loiTat(); veTruoc(); } }, 'Dừng chuỗi'));
  }

  veTruoc();
  return () => loiTat();
}

const PHUT = [30, 60, 90, 120, 180, 300];
function henGio(ctx) {
  ctx.datTieuDe('Hẹn giờ nghỉ');
  const cd = caiDat();
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/them' }, '‹ Thêm'),
    h('section', { class: 'hero' }, h('h1', {}, 'Hẹn giờ nghỉ'), h('p', {}, 'Đếm ngược để nghỉ giữa các hiệp. Hết giờ sẽ báo bằng âm và rung nếu bạn bật.')),
    h('div', { class: 'card stack' },
      h('div', { class: 'chips', 'data-testid': 'hen-gio-chips' }, ...PHUT.map((g) => h('button', { type: 'button', class: 'chip', 'data-g': g, onclick: () => rest.bat(g, 'Hẹn giờ') }, mmss(g)))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: cd.amThanh, onchange: (e) => luuCaiDat({ amThanh: e.target.checked }) }), 'Âm báo'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: cd.rung, onchange: (e) => luuCaiDat({ rung: e.target.checked }) }), 'Rung'),
      h('div', { class: 'hint' }, 'Một số trình duyệt chỉ cho phát âm sau khi bạn chạm vào màn hình, và điện thoại có thể tắt tiếng hoặc rung theo cài đặt máy.')));
}

export default function khoiDong(ctx, id) {
  if (id === 'hen-gio') return henGio(ctx);
  if (id) return chay(ctx, id);
  return danhSach(ctx);
}
void chips;
