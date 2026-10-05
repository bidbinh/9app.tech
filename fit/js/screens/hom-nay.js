// Màn Hôm nay: buổi tập hôm nay, tải tuần, bắt đầu nhanh.
import { h, homNay as homNayStr } from '../ui/dom.js';
import * as S from '../lib/store.js';
import { dauTuan, congNgay, taiTuan, canhBaoTai, chuoiTaiTuan, chuoiTuan, soNgayHoatDong, ngayVNDayDu, ngayVN, hiepDaLam } from '../lib/calc.js';
import { choPhepChuongTrinh } from '../lib/an-toan.js';
import { BAI_THEO_ID } from '../data/exercises.js';
import { baiCuaBuoi } from '../lib/calc.js';
import { moTaDem } from '../data/ex-base.js';
import { bannerAnToan, ghiChuTai } from '../ui/common.js';
import { thongTinKeHoach } from './tap-ct.js';
import { soVN } from '../lib/text.js';

export default function homNay(ctx) {
  ctx.datTieuDe('Hôm nay');
  const hom = homNayStr();
  const buoi = S.dsBuoi(); const choi = S.dsChoi();
  const kh = S.layKeHoach();
  const tt = thongTinKeHoach(kh, hom);
  const nhap = S.layNhap();
  const coNhap = nhap && nhap.bai.length && S.trangThaiSangLoc() !== 'dung-lai';
  const tuan = dauTuan(hom);
  const tai = taiTuan(buoi, choi, tuan);
  const truoc = chuoiTaiTuan(buoi, choi, hom, 5).slice(0, 4).map((t) => t.tong);
  const cb = canhBaoTai(tai.tong, truoc);
  const ngayHD = S.tatCaNgayHoatDong();
  const chuoi = chuoiTuan(ngayHD, hom);
  const n7 = soNgayHoatDong(ngayHD, hom, 7);
  void congNgay;

  let thePhien;
  const khoa = tt ? !choPhepChuongTrinh(S.trangThaiSangLoc(), tt.ct, BAI_THEO_ID) : false;
  if (tt && khoa) {
    thePhien = h('div', { class: 'note warn', 'data-testid': 'phien-khoa' }, h('b', {}, 'Kế hoạch tập đang bị khóa. '), 'Theo kết quả sàng lọc hiện tại, bạn chưa nên tập theo chương trình. Hãy hỏi bác sĩ hoặc huấn luyện viên trước.', h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: '#/them/suc-khoe' }, 'Xem hướng dẫn')));
  } else if (tt && tt.homNayMuc) {
    const m = tt.homNayMuc;
    const bai = baiCuaBuoi(tt.ct, m, BAI_THEO_ID);
    thePhien = h('div', { class: 'card hl', 'data-testid': 'phien-hom-nay' },
      h('div', { class: 'row between' }, h('h2', {}, 'Hôm nay có buổi tập'), m.giamTai ? h('span', { class: 'tag w' }, 'Giảm tải') : null),
      h('p', {}, h('b', {}, m.phien.ten), ` · ${tt.ct.ten.split(':')[0]}`),
      h('ul', { class: 'bul' }, ...bai.slice(0, 4).map((b) => h('li', {}, `${BAI_THEO_ID.get(b.ex).ten}: ${moTaDem(b.dem)}`)), bai.length > 4 ? h('li', {}, `và ${bai.length - 4} bài nữa`) : null),
      h('div', { class: 'row wrap mt' },
        h('a', { class: 'btn grow', href: `#/tap/ghi?ct=${encodeURIComponent(m.key)}`, 'data-testid': 'bat-dau-hom-nay' }, 'Bắt đầu buổi tập'),
        h('a', { class: 'btn ghost', href: `#/them/khoi-dong/${m.phien.kd || 'kd-chung-10'}` }, 'Khởi động trước')));
  } else if (tt && tt.sapToi) {
    thePhien = h('div', { class: 'card', 'data-testid': 'phien-sap-toi' },
      h('h2', {}, 'Hôm nay là ngày nghỉ theo lịch'),
      h('p', { class: 'sub' }, `Buổi kế tiếp: ${ngayVN(tt.sapToi.ngay)} · ${tt.sapToi.phien.ten}`),
      tt.troQua.length ? h('p', { class: 'hint' }, `Có ${tt.troQua.length} buổi chưa làm. Không sao, cứ tiếp tục buổi kế tiếp.`) : null,
      h('a', { class: 'btn ghost', href: '#/tap' }, 'Xem lịch tập'));
  } else if (tt) {
    thePhien = h('div', { class: 'card' }, h('h2', {}, 'Chương trình đã hết lịch'), h('p', { class: 'sub' }, `${tt.soXong}/${tt.tong} buổi đã xong. Chọn chương trình mới hoặc ghi buổi tự do.`), h('a', { class: 'btn', href: '#/tap/chuong-trinh' }, 'Chọn chương trình'));
  } else {
    thePhien = h('div', { class: 'card', 'data-testid': 'chua-co-ct' }, h('h2', {}, 'Chưa có chương trình'), h('p', { class: 'sub' }, 'Chọn chương trình theo môn bạn chơi, hoặc ghi một buổi tự do.'), h('div', { class: 'row wrap' }, h('a', { class: 'btn grow', href: '#/tap/chuong-trinh' }, 'Xem chương trình mẫu'), h('a', { class: 'btn ghost', href: '#/tap/ghi' }, 'Ghi buổi tự do')));
  }

  ctx.root.append(
    h('section', { class: 'hero' }, h('h1', {}, 'Chào bạn'), h('p', { 'data-testid': 'ngay' }, ngayVNDayDu(hom))),
    bannerAnToan(),
    coNhap ? h('div', { class: 'card hl', 'data-testid': 'nhap-dang-ghi' }, h('h2', {}, 'Buổi đang ghi dở'), h('p', {}, `${nhap.ten} · ${nhap.bai.length} bài · ${nhap.bai.reduce((a, e) => a + hiepDaLam(e.sets).length, 0)} hiệp đã làm`), h('a', { class: 'btn', href: '#/tap/ghi', 'data-testid': 'tiep-tuc' }, 'Tiếp tục ghi')) : null,
    thePhien,
    h('div', { class: 'card', 'data-testid': 'tai-tuan' },
      h('div', { class: 'row between' }, h('h2', {}, 'Tải tuần này'), h('a', { href: '#/tien-do/tai' }, 'Chi tiết')),
      h('div', { class: 'grid3 mt' },
        h('div', { class: 'stat' }, h('b', { 'data-testid': 'tai-tong' }, soVN(tai.tong)), h('span', {}, 'tải tổng')),
        h('div', { class: 'stat' }, h('b', {}, soVN(tai.tap)), h('span', {}, 'buổi tập')),
        h('div', { class: 'stat' }, h('b', {}, soVN(tai.choi)), h('span', {}, 'buổi chơi'))),
      h('div', { class: 'mt' }, ghiChuTai(cb))),
    h('div', { class: 'card' },
      h('h2', {}, 'Nhịp tập của bạn'),
      h('p', { 'data-testid': 'chuoi' }, chuoi > 0 ? `${chuoi} tuần liên tiếp có hoạt động. ` : 'Bắt đầu lại lúc nào cũng được. ', `${n7} ngày hoạt động trong 7 ngày qua.`),
      h('p', { class: 'hint' }, 'Ngày nghỉ cũng là một phần của tập luyện, không cần tập mỗi ngày.')),
    h('div', { class: 'sec-h' }, h('h2', {}, 'Bắt đầu nhanh')),
    h('div', { class: 'tiles' },
      h('a', { class: 'tile', href: '#/tap/ghi', 'data-testid': 'q-ghi' }, h('b', {}, 'Ghi buổi tự do'), h('span', { class: 'd' }, 'Chọn bài và ghi ngay')),
      h('a', { class: 'tile', href: '#/them/khoi-dong/kd-chung-10', 'data-testid': 'q-kd' }, h('b', {}, 'Khởi động 10 phút'), h('span', { class: 'd' }, 'Có hẹn giờ từng động tác')),
      h('a', { class: 'tile', href: '#/tap/choi', 'data-testid': 'q-choi' }, h('b', {}, 'Ghi buổi chơi'), h('span', { class: 'd' }, 'Tính vào tải tuần')),
      h('a', { class: 'tile', href: '#/them/khoi-dong/ph-chung-10' }, h('b', {}, 'Giãn cơ 10 phút'), h('span', { class: 'd' }, 'Làm nguội sau buổi tập'))));
}
