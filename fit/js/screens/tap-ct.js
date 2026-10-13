// Chương trình mẫu: danh sách, chi tiết, áp vào lịch tuần, tải tệp lịch .ics, theo dõi hoàn thành.
import { h, xoa, hoi, toast, homNay, taiTep } from '../ui/dom.js';
import { CHUONG_TRINH, MUC_TIEU } from '../data/programs.js';
import { BAI_THEO_ID } from '../data/exercises.js';
import { MON, moTaDem } from '../data/ex-base.js';
import { lenLich, baiCuaBuoi, taoICS, ngayVN, ngayVNDayDu, TEN_THU, TEN_THU_DAI, congNgay, ngayLienKe, canNghi48h, mucConHan } from '../lib/calc.js';
import { choPhepChuongTrinh } from '../lib/an-toan.js';
import * as S from '../lib/store.js';
import { bannerAnToan, hangBai, trangRong } from '../ui/common.js';

const ctTheoId = (id) => CHUONG_TRINH.find((c) => c.id === id);

/** Thông tin kế hoạch đang áp dụng. */
export function thongTinKeHoach(kh, hom = homNay()) {
  if (!kh) return null;
  const ct = ctTheoId(kh.ctId);
  if (!ct) return null;
  const xong = kh.xong || {};
  const muc = kh.muc.map((m) => ({ ...m, daXong: !!xong[m.key], phien: ct.phien[m.phienIdx] }));
  const soXong = muc.filter((m) => m.daXong).length;
  const homNayMuc = muc.find((m) => m.ngay === hom && !m.daXong) || null;
  const sapToi = muc.find((m) => m.ngay > hom && !m.daXong) || null;
  const troQua = muc.filter((m) => m.ngay < hom && !m.daXong);
  return { ct, muc, soXong, tong: muc.length, homNayMuc, sapToi, troQua, ketThuc: muc.length > 0 && muc.every((m) => m.daXong || m.ngay < hom) };
}

export function taiICS(kh) {
  const ct = ctTheoId(kh.ctId);
  const hom = homNay();
  const sk = mucConHan(kh, hom).map((m) => {
    const ph = ct.phien[m.phienIdx];
    const bai = baiCuaBuoi(ct, m, BAI_THEO_ID).map((b) => `${BAI_THEO_ID.get(b.ex).ten} (${moTaDem(b.dem)})`);
    return {
      key: m.key, ngay: m.ngay, tieuDe: `9fit: ${ph.ten}${m.giamTai ? ' (giảm tải)' : ''}`,
      moTa: `${ct.ten}\n${bai.join('\n')}\nNhắc từ 9fit. Không phải tư vấn y tế; dừng tập nếu đau nhói hoặc chóng mặt.`,
    };
  });
  const noi = taoICS(sk, { gio: kh.gio || '18:00', phut: ct.phutBuoi || 45, nhacTruoc: kh.nhacTruoc ?? 30 });
  taiTep('9fit-lich-tap.ics', noi, 'text/calendar;charset=utf-8');
  return sk.length;
}

function theChuongTrinh(ct) {
  return h('a', { class: 'tile', href: `#/tap/chuong-trinh/${ct.id}`, 'data-ct': ct.id },
    h('b', {}, ct.ten),
    h('span', { class: 'd' }, ct.mota),
    h('div', { class: 'tags' }, h('span', { class: 'tag g' }, `${ct.tuanPlan.length} tuần`), h('span', { class: 'tag' }, `${ct.phien.length} buổi mỗi tuần`), ct.giamTaiTruocGiai ? h('span', { class: 'tag' }, 'Giảm tải trước giải') : null));
}

function danhSach(ctx) {
  ctx.datTieuDe('Chương trình mẫu');
  const kh = S.layKeHoach();
  const bn = bannerAnToan();
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/tap' }, '‹ Tập'),
    h('section', { class: 'hero' }, h('h1', {}, 'Chương trình mẫu'), h('p', {}, 'Chương trình 2 đến 4 tuần do 9fit biên soạn, theo môn và theo mục tiêu. Mẫu tổng quát, không thay thế huấn luyện viên hoặc bác sĩ.')),
    bn,
    kh ? h('div', { class: 'note ok' }, `Bạn đang theo: ${ctTheoId(kh.ctId)?.ten || kh.ctId}. `, h('a', { href: '#/tap' }, 'Xem lịch')) : null,
    h('div', { class: 'sec-h' }, h('h2', {}, 'Theo môn')),
    h('div', { class: 'tiles', 'data-testid': 'ct-mon' }, ...CHUONG_TRINH.filter((c) => c.mon).map(theChuongTrinh)),
    h('div', { class: 'sec-h' }, h('h2', {}, 'Theo mục tiêu')),
    h('div', { class: 'tiles', 'data-testid': 'ct-muctieu' }, ...CHUONG_TRINH.filter((c) => !c.mon).map(theChuongTrinh)));
}

function goiYThu(n) { return n >= 3 ? [0, 2, 4] : n === 2 ? [1, 4] : [2]; }

function chiTiet(ctx, id) {
  const ct = ctTheoId(id);
  const { root } = ctx;
  if (!ct) { root.append(trangRong('Không tìm thấy chương trình', '', h('a', { class: 'btn', href: '#/tap/chuong-trinh' }, 'Về danh sách'))); return; }
  ctx.datTieuDe(ct.ten.split(':')[0]);
  const tt = S.trangThaiSangLoc();
  const khHienTai = S.layKeHoach();
  const dangTheo = khHienTai && khHienTai.ctId === ct.id;

  root.append(
    h('a', { class: 'lnk', href: '#/tap/chuong-trinh' }, '‹ Chương trình mẫu'),
    h('section', { class: 'hero' }, h('h1', {}, ct.ten), h('p', {}, ct.mota)),
    h('div', { class: 'tags' }, h('span', { class: 'tag g' }, ct.mon ? MON[ct.mon] : MUC_TIEU[ct.mucTieu]), h('span', { class: 'tag' }, `${ct.tuanPlan.length} tuần`), h('span', { class: 'tag' }, `khoảng ${ct.phutBuoi} phút mỗi buổi`)),
    h('div', { class: 'card' }, h('h2', {}, 'Các tuần'),
      h('ul', { class: 'bul' }, ...ct.tuanPlan.map((t) => h('li', {}, h('b', {}, t.ten), t.giamTai ? ': giảm khoảng một phần ba đến một nửa số hiệp để cơ thể hồi phục.' : t.themHiep ? `: thêm ${t.themHiep} hiệp cho tối đa 2 bài sức mạnh chính mỗi buổi nếu thấy khỏe.` : '.'))),
      ct.giamTaiTruocGiai ? h('p', { class: 'hint' }, 'Nếu bạn có giải đấu, nhập ngày giải khi áp lịch: 7 ngày trước giải sẽ giảm tải, 2 ngày liền trước giải nghỉ.') : null),
    ...ct.phien.map((p) => h('div', { class: 'card', 'data-phien': p.ten },
      h('h2', {}, `Buổi ${p.ten}`),
      h('ul', { class: 'list' }, ...p.bai.map(([bid, ghiDe]) => { const ex = BAI_THEO_ID.get(bid); return h('li', {}, hangBai(ex, { phu: moTaDem(ghiDe ? { ...ex.dem, ...docNhanh(ghiDe) } : ex.dem) })); })))));

  if (tt === 'dung-lai' || (tt === 'hoi-bac-si' && !choPhepChuongTrinh(tt, ct, BAI_THEO_ID))) {
    root.append(h('div', { class: 'note warn', 'data-testid': 'gate-dung' }, h('b', {}, tt === 'dung-lai' ? 'Không tạo chương trình cho bạn lúc này. ' : 'Chương trình này chưa phù hợp với kết quả sàng lọc của bạn. '), tt === 'dung-lai' ? 'Theo câu trả lời sàng lọc, bạn nên gặp bác sĩ hoặc huấn luyện viên trước khi tập theo chương trình. Bạn vẫn xem được các bài trong thư viện.' : 'Bạn nên hỏi bác sĩ trước; trong lúc chờ chỉ chọn chương trình nhẹ như Linh hoạt, Phục hồi hoặc Giảm mỡ vận động nhẹ.', h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: '#/them/suc-khoe' }, 'Xem hướng dẫn'))));
    return;
  }
  if (tt === 'chua') {
    root.append(bannerAnToan());
    return;
  }
  if (dangTheo) root.append(h('div', { class: 'note ok' }, 'Bạn đang theo chương trình này. ', h('a', { href: '#/tap' }, 'Xem lịch tập')));
  root.append(formAp(ct));
}

import { docDem } from '../data/ex-base.js';
function docNhanh(ma) { return docDem(ma) || {}; }

function formAp(ct) {
  const trangThai = { batDau: homNay(), thu: goiYThu(ct.phien.length), gio: '18:00', nhac: 30, giai: '' };
  const xem = h('ul', { class: 'list', 'data-testid': 'xem-lich' });
  const thuBtn = h('div', { class: 'chips day-chips', role: 'group', 'aria-label': 'Ngày tập trong tuần' },
    ...TEN_THU.map((t, i) => h('button', { type: 'button', class: 'chip', 'data-thu': i, 'aria-label': TEN_THU_DAI[i], 'aria-pressed': String(trangThai.thu.includes(i)), onclick: (e) => {
      const k = trangThai.thu.indexOf(i);
      if (k >= 0) trangThai.thu.splice(k, 1); else trangThai.thu.push(i);
      e.currentTarget.setAttribute('aria-pressed', String(trangThai.thu.includes(i)));
      capNhat();
    } }, t)));
  const ngay = h('input', { type: 'date', id: 'ap-ngay', value: trangThai.batDau, 'data-testid': 'ap-ngay' });
  const gio = h('input', { type: 'time', id: 'ap-gio', value: trangThai.gio, 'data-testid': 'ap-gio' });
  const nhac = h('select', { id: 'ap-nhac', 'data-testid': 'ap-nhac' }, ...[[0, 'Đúng giờ'], [15, 'Trước 15 phút'], [30, 'Trước 30 phút'], [60, 'Trước 1 giờ']].map(([v, t]) => h('option', { value: v }, t)));
  nhac.value = '30';
  const giai = h('input', { type: 'date', id: 'ap-giai', 'data-testid': 'ap-giai' });
  const canh = h('div', { class: 'hint', 'aria-live': 'polite' });
  const canh48 = h('div', { class: 'note warn', role: 'status', 'data-testid': 'canh-48h', hidden: true });
  const nang48 = canNghi48h(ct, BAI_THEO_ID);
  const nutAp = h('button', { type: 'button', class: 'btn block', 'data-testid': 'ap-xacnhan' }, 'Áp vào lịch của tôi');

  function tinh() {
    return lenLich(ct, { batDau: trangThai.batDau, thu: trangThai.thu, ngayGiai: ct.giamTaiTruocGiai && trangThai.giai ? trangThai.giai : null });
  }
  function capNhat() {
    trangThai.batDau = ngay.value || homNay(); trangThai.gio = gio.value || '18:00'; trangThai.nhac = Number(nhac.value); trangThai.giai = giai.value;
    const ds = tinh();
    xoa(xem);
    ds.forEach((m) => xem.append(h('li', { class: 'item', 'data-muc': m.key }, h('div', { class: 'grow' }, h('div', { class: 't' }, `${ngayVN(m.ngay)} · ${ct.phien[m.phienIdx].ten}`), h('div', { class: 's' }, `${ct.tuanPlan[m.khoi].ten.split(':')[0]}${m.giamTai ? ' · giảm tải' : ''}`)))));
    const thieu = trangThai.thu.length < ct.phien.length;
    canh.textContent = !trangThai.thu.length ? 'Chọn ít nhất một ngày trong tuần.' : thieu ? `Chương trình có ${ct.phien.length} buổi khác nhau; chọn ít nhất ${ct.phien.length} ngày mỗi tuần để tập đủ các buổi.` : `${ds.length} buổi trong ${ct.tuanPlan.length} tuần.`;
    nutAp.disabled = !ds.length;
    const lk = nang48 ? ngayLienKe(trangThai.thu) : [];
    canh48.hidden = !lk.length;
    if (lk.length) canh48.textContent = `Có ${lk.length} cặp ngày tập liền nhau (${lk.map(([a, b]) => `${TEN_THU[a]}-${TEN_THU[b]}`).join(', ')}). Buổi sức mạnh và bật nhảy nên cách nhau ít nhất 48 giờ; bài Nordic hoặc Copenhagen càng cần nghỉ dài. Hãy chọn các ngày cách nhau, ví dụ T2-T4-T6.`;
  }
  [ngay, gio, giai].forEach((e) => e.addEventListener('input', capNhat));
  nhac.addEventListener('change', capNhat);

  nutAp.addEventListener('click', async () => {
    const muc = tinh();
    if (!muc.length) return;
    const cu = S.layKeHoach();
    if (cu) {
      const ok = await hoi('Thay chương trình đang theo?', 'Lịch hiện tại sẽ được thay bằng chương trình này. Các buổi đã ghi vẫn được giữ trong lịch sử.', { ok: 'Thay', huy: 'Giữ lịch cũ' });
      if (!ok) return;
    }
    const kh = { ctId: ct.id, batDau: trangThai.batDau, thu: [...trangThai.thu].sort(), gio: trangThai.gio, nhacTruoc: trangThai.nhac, ngayGiai: trangThai.giai || null, muc, xong: {}, tao: homNay() };
    await S.luuKeHoach(kh);
    xoa(xongEl);
    xongEl.append(h('div', { class: 'note ok', role: 'status', 'data-testid': 'ap-ok' }, h('b', {}, 'Đã áp vào lịch. '), `${muc.length} buổi, từ ${ngayVNDayDu(muc[0].ngay)}. Buổi tập hôm nay sẽ hiện ở màn Hôm nay.`,
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn sm', 'data-testid': 'tai-ics', onclick: () => { const n = taiICS(kh); toast(`Đã tạo tệp lịch với ${n} buổi. Mở tệp để thêm vào lịch điện thoại.`); } }, 'Tải tệp lịch (.ics)'),
        h('a', { class: 'btn sm ghost', href: '#/tap' }, 'Xem lịch tập'))));
  });
  const xongEl = h('div', { 'aria-live': 'polite' });
  capNhat();
  return h('div', { class: 'card', 'data-testid': 'form-ap' },
    h('h2', {}, 'Áp vào lịch tuần của bạn'),
    h('div', { class: 'stack' },
      h('div', { class: 'field' }, h('label', { for: 'ap-ngay' }, 'Bắt đầu từ ngày'), ngay),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Ngày tập trong tuần'), thuBtn),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', { for: 'ap-gio' }, 'Giờ tập'), gio),
        h('div', { class: 'field' }, h('label', { for: 'ap-nhac' }, 'Nhắc trong lịch'), nhac)),
      ct.giamTaiTruocGiai ? h('div', { class: 'field' }, h('label', { for: 'ap-giai' }, 'Ngày thi đấu, giải (nếu có)'), giai, h('div', { class: 'hint' }, 'Có ngày giải thì 9fit tự giảm tải 7 ngày trước đó.')) : null,
      canh, canh48,
      h('div', { class: 'card tight' }, h('h3', {}, 'Lịch dự kiến'), xem),
      nutAp, xongEl));
}

/** Màn hình Tập: kế hoạch đang theo. */
export function khungKeHoach(ctx, kh) {
  const tt = thongTinKeHoach(kh);
  if (!tt) return null;
  const hom = homNay();
  const khoa = !choPhepChuongTrinh(S.trangThaiSangLoc(), tt.ct, BAI_THEO_ID);
  const dong = (m) => {
    const trang = m.daXong ? h('span', { class: 'tag g' }, 'Đã xong') : m.ngay === hom ? h('span', { class: 'tag w' }, 'Hôm nay') : m.ngay < hom ? h('span', { class: 'tag' }, 'Chưa làm') : h('span', { class: 'tag' }, 'Sắp tới');
    return h('li', { class: 'item', 'data-muc': m.key },
      h('div', { class: 'grow' }, h('div', { class: 't' }, `${ngayVN(m.ngay)} · ${m.phien.ten}`), h('div', { class: 's' }, m.giamTai ? 'Giảm tải' : tt.ct.tuanPlan[m.khoi].ten.split(':')[0])),
      trang,
      !khoa && !m.daXong && m.ngay <= congNgay(hom, 7) ? h('a', { class: 'btn sm', href: `#/tap/ghi?ct=${encodeURIComponent(m.key)}`, 'data-testid': 'bat-dau-muc', 'aria-label': `Bắt đầu buổi ${m.phien.ten}` }, 'Bắt đầu') : null);
  };
  const the = h('div', { class: 'card', 'data-testid': 'ke-hoach' },
    h('div', { class: 'row between' }, h('h2', {}, tt.ct.ten), h('span', { class: 'tag g', 'data-testid': 'tien-do-ct' }, `${tt.soXong}/${tt.tong} buổi`)),
    h('div', { class: 'prog mt', role: 'progressbar', 'aria-valuenow': tt.soXong, 'aria-valuemin': 0, 'aria-valuemax': tt.tong, 'aria-label': 'Tiến độ chương trình' }, (() => { const i = h('i'); i.style.width = `${Math.round((100 * tt.soXong) / Math.max(1, tt.tong))}%`; return i; })()),
    khoa ? h('div', { class: 'note warn', 'data-testid': 'ke-hoach-khoa' }, h('b', {}, 'Kế hoạch đang bị khóa. '), 'Theo kết quả sàng lọc hiện tại, bạn chưa nên tập theo chương trình này. Hãy hỏi bác sĩ hoặc huấn luyện viên, rồi làm lại sàng lọc khi sẵn sàng.', h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: '#/them/suc-khoe' }, 'Xem hướng dẫn'))) : null,
    tt.troQua.length ? h('p', { class: 'hint' }, `Có ${tt.troQua.length} buổi chưa làm. Không sao, bạn cứ tiếp tục buổi kế tiếp.`) : null,
    h('ul', { class: 'list' }, ...tt.muc.map(dong)),
    h('div', { class: 'row wrap mt' },
      h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'tai-ics-2', onclick: () => { const n = taiICS(kh); toast(`Đã tạo tệp lịch với ${n} buổi.`); } }, 'Tải tệp lịch (.ics)'),
      h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'dung-ct', onclick: async () => { const ok = await hoi('Dừng chương trình?', 'Lịch sẽ được gỡ. Các buổi đã ghi vẫn còn trong lịch sử.', { ok: 'Dừng chương trình', nguy: true }); if (ok) { const cu = kh; await S.xoaKeHoach(); ctx.veLai(); toast('Đã dừng chương trình.', { hoanTac: async () => { await S.luuKeHoach(cu); ctx.veLai(); } }); } } }, 'Dừng chương trình')));
  return the;
}

export default function chuongTrinh(ctx, id) {
  if (id) chiTiet(ctx, id); else danhSach(ctx);
}
