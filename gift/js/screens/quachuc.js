// Quà & lời chúc: gợi ý quà theo quan hệ/dịp/ngân sách, lời chúc mẫu nhiều giọng, danh sách quà của tôi.
import { h, tabLink, chon, truong, phanDoan, oTien, thongBao, saoChep, trong, lamLai, svg } from '../ui/dom.js';
import { IC } from '../ui/icons.js';
import { layDs, luu, xoa } from '../lib/kho.js';
import { goiYQua, KIENG_KY, MUC, mucTuTien } from '../data/qua.js';
import { DIP, GIONG, NHOM_QUAN_HE, QUAN_HE, nhomCuaQuanHe, tenDip, tenQuanHe } from '../data/dip.js';
import { layLoiChuc, dienLoi } from '../data/loichuc.js';
import { nguoiTheoId, goiNguoi, kiemTrungQua, themQua } from '../lib/chung.js';
import { ngayVn, homNayIso } from '../lib/ngay.js';

const trangThai = { p: '', dip: 'sinhNhat', nhom: '', muc: 0, giong: 'thanMat', xung: 'auto', tien: null };
const XUNG_THEO_QH = Object.assign(Object.create(null), { 'ong-ba': 'cháu', 'ho-hang-tren': 'cháu', 'cha-me': 'con', 'cap-tren': 'em', 'thay-co': 'em' });

export default function ve(root, ctx) {
  const [muc] = ctx.seg;
  const q = ctx.q;
  if (q.get('p') !== null) trangThai.p = q.get('p') || '';
  if (q.get('dip') && DIP.some((d) => d.id === q.get('dip'))) trangThai.dip = q.get('dip');
  const tab = muc === 'chuc' ? 'chuc' : muc === 'cua-toi' ? 'cua' : 'qua';
  root.append(tabLink([{ id: 'qua', ten: 'Gợi ý quà', href: '#/qua' }, { id: 'chuc', ten: 'Lời chúc', href: '#/qua/chuc' }, { id: 'cua', ten: 'Quà của tôi', href: '#/qua/cua-toi' }], tab, 'Các phần của Quà và lời chúc'));
  if (tab === 'chuc') return veChuc(root);
  if (tab === 'cua') return veCuaToi(root);
  return veGoiY(root);
}

const chonNguoi = (gia, id) => chon([{ v: '', t: 'Chưa chọn người' }, ...layDs('people').slice().sort((a, b) => a.ten.localeCompare(b.ten, 'vi')).map((p) => ({ v: p.id, t: `${p.ten}${p.quanHe ? ` (${tenQuanHe(p.quanHe)})` : ''}` }))], gia, { id });

// ---------- Gợi ý quà ----------
function veGoiY(root) {
  const selNguoi = chonNguoi(trangThai.p, 'g-nguoi');
  const selNhom = chon([{ v: '', t: 'Mọi quan hệ' }, ...NHOM_QUAN_HE.map((n) => ({ v: n.id, t: n.ten }))], trangThai.nhom, { id: 'g-nhom' });
  const selDip = chon(DIP.map((d) => ({ v: d.id, t: d.ten })), trangThai.dip, { id: 'g-dip' });
  const tien = oTien({ nhan: 'Ngân sách (không bắt buộc)', gia: trangThai.tien, chonNhanh: [200000, 500000, 1000000, 2000000], onDoi: () => { const v = tien.lay(); trangThai.tien = Number.isFinite(v) ? v : null; trangThai.muc = Number.isFinite(v) ? mucTuTien(v) : 0; veKq(); } });
  const kq = h('div', { class: 'stack', 'data-testid': 'goi-y-qua' });
  const luuY = (q) => {
    if (!trangThai.p) { thongBao('Chọn người ở trên để lưu ý tưởng quà cho họ.'); return; }
    const trung = kiemTrungQua(trangThai.p, q.ten);
    if (trung) { thongBao(`${trung} Vẫn lưu làm ý tưởng.`); }
    themQua({ personId: trangThai.p, ten: q.ten, dip: trangThai.dip });
    thongBao('Đã lưu vào ý tưởng quà của người này.');
  };
  function veKq() {
    kq.replaceChildren();
    const p = trangThai.p ? nguoiTheoId(trangThai.p) : null;
    const nhom = trangThai.nhom || null;
    const daTang = trangThai.p ? [...layDs('gifts').filter((g) => g.personId === trangThai.p && g.trangThai === 'da-tang').map((g) => g.ten), ...layDs('entries').filter((e) => e.personId === trangThai.p && e.huong === 'di' && e.qua).map((e) => e.qua)] : [];
    let ds = goiYQua({ nhom, dip: trangThai.dip, muc: trangThai.muc, daTang });
    let loiNoi = '';
    if (!ds.length && nhom) { ds = goiYQua({ dip: trangThai.dip, muc: trangThai.muc, daTang }); loiNoi = 'Chưa có gợi ý riêng cho đúng quan hệ và ngân sách này, đây là gợi ý chung cho dịp.'; }
    if (!ds.length) { ds = goiYQua({ dip: trangThai.dip, daTang }); loiNoi = 'Chưa có gợi ý đúng ngân sách này, đây là tất cả gợi ý cho dịp.'; }
    if (p && p.ghiChu) kq.append(h('div', { class: 'note', 'data-testid': 'luu-y-nguoi' }, h('strong', {}, `Nhớ về ${goiNguoi(p)}: `), p.ghiChu));
    if (trangThai.dip === 'thayCo' || trangThai.nhom === 'thay-co') kq.append(h('div', { class: 'note', 'data-testid': 'luu-y-thay-co' }, 'Với thầy cô: nhiều trường và quy định đạo đức nhà giáo hạn chế hoặc không cho nhận quà, đặc biệt quà có giá trị hay thẻ quà tặng (gần như tiền mặt). Hãy hỏi trước; hoa, thiệp và lời cảm ơn là lựa chọn an toàn nhất.'));
    if (trangThai.dip === 'tang') kq.append(h('div', { class: 'note info' }, 'Với tang lễ, đây là cách thể hiện sự chia sẻ chứ không phải quà tặng. Mức phúng và cách làm tùy gia đình, địa phương, tôn giáo.'));
    if (loiNoi) kq.append(h('div', { class: 'note info' }, loiNoi));
    kq.append(h('h2', {}, `${ds.length} gợi ý cho ${tenDip(trangThai.dip).toLowerCase()}`));
    kq.append(h('ul', { class: 'stack' }, ds.map((q) => h('li', { class: 'card', 'data-testid': 'goi-y' },
      h('div', { class: 'item-t' }, q.ten),
      h('p', {}, q.tip),
      h('div', { class: 'chips' }, q.m.map((m) => h('span', { class: 'tag' }, MUC.find((x) => x.id === m).ten)), q.daTang ? h('span', { class: 'tag amber' }, 'Người này đã được tặng món giống') : null),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn sm', onclick: () => luuY(q) }, 'Lưu làm ý tưởng'))))));
    const kk = KIENG_KY.filter((k) => !k.dip || k.dip === trangThai.dip);
    kq.append(h('details', { class: 'card' }, h('summary', {}, 'Nên tránh, theo quan niệm dân gian'),
      h('ul', { class: 'stack' }, kk.map((k) => h('li', {}, k.noi))), h('p', { class: 'hint' }, 'Những điều này tùy từng nhà và từng vùng, chỉ để bạn cân nhắc.')));
    kq.append(h('p', { class: 'hint' }, 'Danh mục do 9gift tự biên soạn, không có liên kết mua hàng và không nêu giá. Mức ngân sách là cách app chia nhóm theo số tiền bạn đặt (dưới khoảng 300 nghìn, 300 nghìn đến 1 triệu, trên 1 triệu), không phải giá của món.'));
  }
  selNguoi.addEventListener('change', () => {
    trangThai.p = selNguoi.value;
    const p = nguoiTheoId(trangThai.p);
    if (p) { trangThai.nhom = nhomCuaQuanHe(p.quanHe); selNhom.value = trangThai.nhom; }
    veKq();
  });
  selNhom.addEventListener('change', () => { trangThai.nhom = selNhom.value; veKq(); });
  selDip.addEventListener('change', () => { trangThai.dip = selDip.value; veKq(); });
  const pp = trangThai.p ? nguoiTheoId(trangThai.p) : null;
  if (pp && !trangThai.nhom) { trangThai.nhom = nhomCuaQuanHe(pp.quanHe); selNhom.value = trangThai.nhom; }
  root.append(h('h1', {}, 'Gợi ý quà'),
    h('div', { class: 'card' }, truong('Dịp', selDip), truong('Tặng ai', selNguoi),
      h('details', { open: !!(trangThai.tien || (trangThai.nhom && !trangThai.p)) }, h('summary', {}, 'Lọc thêm theo quan hệ và ngân sách'), truong('Quan hệ', selNhom), tien.el)), kq);
  veKq();
}

// ---------- Lời chúc ----------
function veChuc(root) {
  const selNguoi = chonNguoi(trangThai.p, 'c-nguoi');
  const selDip = chon(DIP.map((d) => ({ v: d.id, t: d.ten })), trangThai.dip, { id: 'c-dip' });
  const selXung = chon([{ v: 'auto', t: 'Tự chọn theo quan hệ' }, ...['mình', 'em', 'con', 'cháu', 'anh', 'chị', 'tôi'].map((x) => ({ v: x, t: x }))], trangThai.xung, { id: 'c-xung' });
  const phanG = h('div', { id: 'c-giong' });
  const kq = h('div', { class: 'stack', 'data-testid': 'loi-chuc' });
  function giongHopLe() { const d = DIP.find((x) => x.id === trangThai.dip); return d.giong; }
  function veGiong() {
    const ok = giongHopLe();
    if (!ok.includes(trangThai.giong)) trangThai.giong = ok[0];
    phanG.replaceChildren(phanDoan(GIONG.filter((g) => ok.includes(g.id)), trangThai.giong, (v) => { trangThai.giong = v; veKq(); }, 'Giọng văn'));
  }
  function veKq() {
    kq.replaceChildren();
    const p = trangThai.p ? nguoiTheoId(trangThai.p) : null;
    const xung = trangThai.xung === 'auto' ? (p ? XUNG_THEO_QH[p.quanHe] || 'mình' : 'mình') : trangThai.xung;
    const ten = p ? goiNguoi(p) : 'bạn';
    const ds = layLoiChuc(trangThai.dip, trangThai.giong, p ? nhomCuaQuanHe(p.quanHe) : null);
    if (trangThai.dip === 'tang') kq.append(h('div', { class: 'note info', 'data-testid': 'ghi-chu-tang' }, 'Lời chia buồn nên ngắn, chân thành, không dùng từ chúc mừng. Nếu biết tôn giáo của gia đình, chọn lời đúng theo đạo. Gặp trực tiếp thì cái nắm tay và sự hiện diện quan trọng hơn lời nói.'));
    if (trangThai.dip === 'vuLan' || trangThai.dip === 'thamBenh') kq.append(h('div', { class: 'note info' }, 'Dịp này chỉ có giọng trang trọng và thân mật, không có lời đùa.'));
    if (trangThai.dip === 'vuLan') kq.append(h('div', { class: 'note info' }, 'Vu Lan có người còn cha mẹ, có người đã mất cha hoặc mẹ. Các lời có nhãn “Khi cha hoặc mẹ người nhận đã mất” dành cho trường hợp sau, hãy chọn cho phù hợp.'));
    const nhomP = p ? nhomCuaQuanHe(p.quanHe) : null;
    if (trangThai.giong === 'haiHuoc' && ['cap-tren', 'thay-co', 'cha-me'].includes(nhomP)) kq.append(h('div', { class: 'note', 'data-testid': 'canh-bao-dua' }, 'Giọng hài hước có thể không hợp khi gửi cho sếp, thầy cô, ông bà hay bậc trên. Hãy chọn giọng trang trọng hoặc thân mật nếu bạn không chắc.'));
    if (!p) kq.append(h('div', { class: 'note info' }, 'Chọn người nhận để lời chúc tự đổi cách xưng: “kính chúc” chỉ dùng cho ông bà, cha mẹ, bậc trên và thầy cô; với người khác dùng “chúc”.'));
    kq.append(h('ul', { class: 'stack' }, ds.map((x, i) => {
      const text = dienLoi(x.t, { ten, xung });
      return h('li', { class: 'card', 'data-testid': 'loi' },
        x.nhan ? h('div', { class: 'wish-nhan' }, x.nhan) : null,
        h('p', { class: 'wish', id: `loi-${i}` }, text),
        h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn sm', 'data-testid': 'chep-loi', onclick: async (ev) => { const nut = ev.currentTarget; const ok = await saoChep(text); thongBao(ok ? 'Đã sao chép lời chúc.' : 'Không sao chép được, hãy bôi đen và chép tay.'); nut.focus(); } }, svg(IC.chep), 'Sao chép'),
          navigator.share ? h('button', { type: 'button', class: 'btn sm', onclick: () => { navigator.share({ text }).catch(() => {}); } }, svg(IC.chia), 'Chia sẻ') : null));
    })));
    if (!ds.length) kq.append(trong('Chưa có lời cho lựa chọn này', 'Thử đổi giọng văn hoặc dịp.'));
  }
  selNguoi.addEventListener('change', () => { trangThai.p = selNguoi.value; veKq(); });
  selDip.addEventListener('change', () => { trangThai.dip = selDip.value; veGiong(); veKq(); });
  selXung.addEventListener('change', () => { trangThai.xung = selXung.value; veKq(); });
  root.append(h('h1', {}, 'Lời chúc'),
    h('div', { class: 'card' }, truong('Dịp', selDip), h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Giọng văn'), phanG), truong('Gửi cho', selNguoi), truong('Mình xưng là', selXung)),
    kq,
    h('p', { class: 'hint' }, 'Lời chúc mẫu do 9gift tự biên soạn. Hãy sửa vài chữ cho đúng giọng của bạn trước khi gửi, người nhận sẽ thấy ấm hơn.'));
  veGiong(); veKq();
  void QUAN_HE;
}

// ---------- Quà của tôi ----------
let locQua = 'y-tuong';
function veCuaToi(root) {
  const selNguoi = chonNguoi('', 'qt-nguoi');
  const ten = h('input', { type: 'text', id: 'qt-ten', maxlength: 120, placeholder: 'Ví dụ: khăn len màu xám', 'data-testid': 'qt-ten' });
  const canh = h('div', { class: 'hint', role: 'status' });
  const them = (trang) => {
    const t = ten.value.trim();
    if (!t) { canh.textContent = 'Hãy gõ tên món quà.'; ten.focus(); return; }
    const trung = selNguoi.value ? kiemTrungQua(selNguoi.value, t) : null;
    if (trung && canh.dataset.xn !== t) { canh.textContent = `${trung} Bấm lưu lại nếu vẫn muốn thêm.`; canh.dataset.xn = t; return; }
    themQua({ personId: selNguoi.value || null, ten: t, trangThai: trang });
    ten.value = ''; canh.textContent = ''; delete canh.dataset.xn;
    thongBao(trang === 'da-tang' ? 'Đã ghi quà đã tặng.' : 'Đã lưu ý tưởng quà.');
    lamLai();
  };
  const tatCa = layDs('gifts');
  const ds = tatCa.filter((g) => g.trangThai === locQua).sort((a, b) => (a.suaLuc < b.suaLuc ? 1 : -1));
  root.append(h('h1', {}, 'Quà của tôi'),
    h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); them('y-tuong'); } }, truong('Cho ai', selNguoi), truong('Món quà', ten), canh,
      h('div', { class: 'row-actions' }, h('button', { type: 'submit', class: 'btn primary sm', 'data-testid': 'qt-luu' }, 'Lưu làm ý tưởng'), h('button', { type: 'button', class: 'btn sm', onclick: () => them('da-tang') }, 'Ghi đã tặng hôm nay'))),
    phanDoan([{ id: 'y-tuong', ten: `Muốn tặng (${tatCa.filter((g) => g.trangThai === 'y-tuong').length})` }, { id: 'da-tang', ten: `Đã tặng (${tatCa.filter((g) => g.trangThai === 'da-tang').length})` }], locQua, (v) => { locQua = v; lamLai(); }, 'Lọc quà'));
  if (!ds.length) {
    root.append(trong(locQua === 'y-tuong' ? 'Chưa có ý tưởng nào' : 'Chưa ghi món nào đã tặng', locQua === 'y-tuong' ? 'Khi nghe ai nhắc muốn món gì, ghi lại ngay ở đây để đến dịp khỏi phải nghĩ.' : 'Ghi quà đã tặng để lần sau khỏi tặng trùng.'));
    return;
  }
  root.append(h('ul', { class: 'list', 'data-testid': 'ds-qua' }, ds.map((g) => {
    const p = g.personId ? nguoiTheoId(g.personId) : null;
    return h('li', {}, h('div', { class: 'item' },
      h('div', { class: 'item-main' }, h('div', { class: 'item-t' }, g.ten), h('div', { class: 'item-s' }, [p ? `Cho ${goiNguoi(p)}` : 'Chưa chọn người', g.ngay ? `tặng ${ngayVn(g.ngay)}` : '', g.dip ? tenDip(g.dip) : ''].filter(Boolean).join(' · '))),
      g.trangThai === 'y-tuong' ? h('button', { type: 'button', class: 'btn sm', onclick: () => { luu('gifts', { ...g, trangThai: 'da-tang', ngay: homNayIso() }); thongBao('Đã chuyển sang quà đã tặng.'); lamLai(); } }, 'Đã tặng') : null,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Xóa ${g.ten}`, onclick: () => { const cu = xoa('gifts', g.id); thongBao('Đã xóa món quà.', { hoanTac: () => { luu('gifts', cu); lamLai(); } }); lamLai(); } }, svg(IC.xoa))));
  })));
}
