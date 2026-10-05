// Màn "Sắp tới": hôm nay, việc cần chuẩn bị, 30 ngày tới, nợ lễ, nhắc sao lưu.
import { h, svg, phanDoan, trong } from '../ui/dom.js';
import { IC } from '../ui/icons.js';
import { layDs, layCaiDat } from '../lib/kho.js';
import { sapToiHienTai, conLaiChu } from '../lib/chung.js';
import { homNayIso, tenThu, tenThuNgan, chuoiAm, amCua, ngayVn, tachIso, chenhNgay } from '../lib/ngay.js';
import { canChiNam } from '../lib/lunar.js';
import { tinhNoLe } from '../lib/le.js';
import { DIP_LE } from '../data/dip.js';

let soNgay = 30;
/** Dịp gợi ý quà/lời chúc của một mục. null = không có lời chúc hay quà phù hợp (ngày nghỉ lễ, giỗ Tổ...) nên ẩn nút. undefined = chưa rõ, để người dùng tự chọn. */
const dipCua = (e) => {
  if (e.loai === 'dip') { const d = DIP_LE.find((x) => x.id === e.dipId); return d ? d.dip : null; }
  if (e.loai === 'cuoi' || e.loai === 'kyNiem') return 'tinhYeu';
  if (e.loai === 'gio') return 'tang';
  if (e.loai === 'sinhNhat') return 'sinhNhat';
  return undefined;
};

function hangSuKien(e) {
  const t = tachIso(e.iso);
  const nho = e.conLai === 0 ? 'hot' : '';
  const dp = dipCua(e);
  const qs = new URLSearchParams(dp ? { dip: dp } : {});
  if (e.personId) qs.set('p', e.personId);
  const mo = [];
  if (e.phu) mo.push(e.phu);
  if (e.am) mo.push(`${e.am.ngay}/${e.am.thang}${e.am.nhuan ? ' nhuận' : ''} âm lịch`);
  const hanh = [];
  if (e.loai === 'gio') {
    hanh.push(h('a', { class: 'btn sm', href: `../vannien/#/van-khan/gio?d=${e.iso}` }, 'Văn khấn giỗ'), h('a', { class: 'btn sm', href: `../vannien/#/mam-cung/co-gio?d=${e.iso}` }, 'Mâm cúng giỗ'));
  } else if (dp !== null && (e.loai !== 'dip' || e.canChuanBi || e.conLai <= 7)) {
    hanh.push(h('a', { class: 'btn sm', href: `#/qua?${qs}` }, 'Gợi ý quà'), h('a', { class: 'btn sm', href: `#/qua/chuc?${qs}` }, 'Lời chúc'));
    if (e.loai === 'dip' && e.dipId === 'tet-nguyen-dan') hanh.push(h('a', { class: 'btn sm', href: '../vannien/#/mam-cung' }, 'Mâm cúng Tết'));
  }
  return h('li', { 'data-testid': 'su-kien' },
    h('div', { class: 'item' },
      h('div', { class: `datebox ${nho}` }, h('b', {}, String(t.d)), h('span', {}, `Th${t.m}`)),
      h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, e.tieuDe), h('div', { class: 'item-s' }, `${tenThu(e.iso)}, ${ngayVn(e.iso)}${mo.length ? ` · ${mo.join(' · ')}` : ''}`),
        h('span', { class: `tag mt4 ${e.conLai <= 3 ? 'rose' : ''}` }, conLaiChu(e.conLai)))),
    hanh.length ? h('div', { class: 'item-act' }, hanh) : null);
}

export default function ve(root) {
  const hn = homNayIso();
  const a = amCua(hn);
  const people = layDs('people'); const entries = layDs('entries');
  const ds = sapToiHienTai(soNgay);
  const canLam = ds.filter((e) => e.canChuanBi);
  const conLai = ds.filter((e) => !e.canChuanBi);
  const hom = ds.filter((e) => e.conLai === 0);

  root.append(h('section', { class: 'hero', 'aria-label': 'Hôm nay' },
    h('div', { class: 'muted small' }, 'Hôm nay'),
    h('div', { class: 'big', 'data-testid': 'hom-nay' }, `${tenThu(hn)}, ${ngayVn(hn)}`),
    h('div', { class: 'muted' }, `${chuoiAm(a)} năm ${canChiNam(a.nam)}`),
    hom.length ? h('p', { class: 'tag rose mt8' }, `Hôm nay có ${hom.length} dịp: ${hom.map((e) => e.tieuDe).join(', ')}`) : null));

  // sao lưu
  const cd = layCaiDat();
  const coDuLieu = people.length + entries.length > 0;
  if (coDuLieu) {
    const ngayCu = cd.daSaoLuu ? chenhNgay(cd.daSaoLuu.slice(0, 10), hn) : null;
    if (ngayCu === null || ngayCu > 30) {
      root.append(h('div', { class: 'note', 'data-testid': 'nhac-sao-luu' },
        h('p', {}, ngayCu === null ? 'Bạn chưa sao lưu lần nào. Dữ liệu chỉ nằm trên máy này, đổi máy hoặc xóa dữ liệu trình duyệt là mất.' : `Bản sao lưu cuối cách đây ${ngayCu} ngày.`),
        h('a', { class: 'btn sm mt8', href: '#/them/du-lieu' }, 'Sao lưu ngay')));
    }
  }

  if (!people.length && !entries.length) {
    root.append(h('div', { class: 'card', 'data-testid': 'bat-dau' },
      h('h2', {}, 'Bắt đầu với 9gift'),
      h('p', {}, 'Thêm người thân và bạn bè để app tự nhắc sinh nhật, ngày giỗ theo âm lịch. Ghi những phong bì đã đi và đã nhận để biết còn nợ lễ ai.'),
      h('div', { class: 'row-actions' },
        h('a', { class: 'btn primary', href: '#/ban/moi', 'data-testid': 'bd-them-nguoi' }, 'Thêm người đầu tiên'),
        h('a', { class: 'btn', href: '#/le/moi' }, 'Ghi một khoản lễ'))));
  }

  root.append(h('div', { class: 'sec-head' }, h('h1', {}, soNgay === 30 ? 'Sắp tới 30 ngày' : 'Sắp tới 90 ngày')));
  root.append(phanDoan([{ id: 30, ten: '30 ngày' }, { id: 90, ten: '90 ngày' }], soNgay, (v) => { soNgay = v; window.dispatchEvent(new Event('gift:lamlai')); }, 'Khoảng thời gian'));

  if (canLam.length) {
    root.append(h('section', { class: 'stack', 'aria-labelledby': 'cl-t' }, h('h2', { id: 'cl-t' }, 'Cần chuẩn bị quà'), h('ul', { class: 'list', 'data-testid': 'can-chuan-bi' }, canLam.map(hangSuKien))));
  }
  if (conLai.length) {
    root.append(h('section', { class: 'stack', 'aria-labelledby': 'ct-t' }, h('h2', { id: 'ct-t' }, canLam.length ? 'Những ngày tới' : 'Các ngày trong khoảng này'), h('ul', { class: 'list', 'data-testid': 'ds-sap-toi' }, conLai.map(hangSuKien))));
  }
  if (!ds.length) {
    root.append(trong(`Không có dịp nào trong ${soNgay} ngày tới`, 'Thêm ngày sinh của người thân ở Danh bạ, hoặc bật thêm dịp lễ ở mục Thêm.', h('a', { class: 'btn', href: '#/them/dip' }, 'Chọn dịp lễ cần nhắc')));
  }

  const no = tinhNoLe(entries);
  if (no.chuaDap.length || no.chuaNhan.length) {
    root.append(h('a', { class: 'card blk-link', href: '#/le/no', 'data-testid': 'the-no-le' },
      h('div', { class: 'sec-head' }, h('h2', {}, 'Sổ nợ lễ'), svg(IC.phai)),
      h('p', {}, no.chuaDap.length ? `${no.chuaDap.length} khoản người khác đã mừng hoặc phúng viếng bạn mà bạn chưa đáp lễ.` : 'Bạn không còn khoản nào chưa đáp lễ.'),
      no.chuaNhan.length ? h('p', { class: 'muted' }, `${no.chuaNhan.length} khoản bạn đã gửi mà họ chưa đáp lại.`) : null));
  }
  root.append(h('div', { class: 'row-actions' },
    h('a', { class: 'btn primary', href: '#/le/moi', 'data-testid': 'ghi-le' }, 'Ghi khoản lễ'),
    h('a', { class: 'btn', href: '#/ban/moi' }, 'Thêm người'),
    h('a', { class: 'btn ghost', href: '#/them/nhac' }, 'Nhắc qua lịch điện thoại')));
}
void tenThuNgan;
