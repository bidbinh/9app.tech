// Tiến độ: tải tập tuần, khối lượng theo nhóm cơ, cân nặng và vòng đo, bài kiểm tra thể lực.
import { h, xoa, tabs, chips, toast, homNay } from '../ui/dom.js';
import { cotChong, thanhNgang, duong } from '../ui/charts.js';
import { NHOM } from '../data/ex-base.js';
import { BAI_THEO_ID } from '../data/exercises.js';
import { dauTuan, congNgay, chuoiTaiTuan, canhBaoTai, khoiLuongTheoNhom, ngayVN, ngayTuChuoi, vo2Cooper, chieuCaoBat } from '../lib/calc.js';
import { soVN } from '../lib/text.js';
import * as S from '../lib/store.js';
import { ghiChuTai, trangRong } from '../ui/common.js';
import { BAI_TEST, hopLeTest } from '../lib/fitness.js';
import { choPhepTest } from '../lib/an-toan.js';

const so = (v) => { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
const ngNgan = (s) => { const d = ngayTuChuoi(s); return `${d.getDate()}/${d.getMonth() + 1}`; };

// ---------- Tải ----------
function tabTai(root, ctx) {
  const hom = homNay();
  const buoi = S.dsBuoi(); const choi = S.dsChoi();
  const tuan = chuoiTaiTuan(buoi, choi, hom, 8);
  const truoc = tuan.slice(3, 7).map((t) => t.tong);
  const hienTai = tuan[7];
  const cb = canhBaoTai(hienTai.tong, truoc);
  const tb = truoc.reduce((a, c) => a + c, 0) / 4;
  const co = tuan.some((t) => t.tong > 0);
  root.append(
    h('div', { class: 'card' },
      h('h2', {}, 'Tải tập 8 tuần gần nhất'),
      h('p', { class: 'sub' }, 'Tải = RPE × số phút, cộng buổi tập và buổi chơi môn thể thao.'),
      co ? [cotChong(tuan.map((t) => ({ nhan: ngNgan(t.dau), phan: [t.tap, t.choi] })), { nhan: 'Biểu đồ tải tập theo tuần', duongTb: tb > 0 ? tb : null }),
        h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'c1' }), 'Buổi tập'), h('span', {}, h('i', { class: 'c2' }), 'Buổi chơi'))]
        : trangRong('Chưa có dữ liệu', 'Ghi buổi tập hoặc buổi chơi để thấy biểu đồ.', h('a', { class: 'btn sm', href: '#/tap/choi' }, 'Ghi buổi chơi'))),
    h('div', { class: 'card' }, h('h2', {}, 'Tuần này'),
      h('div', { class: 'grid3 mt' },
        h('div', { class: 'stat' }, h('b', { 'data-testid': 'tai-tong' }, soVN(hienTai.tong)), h('span', {}, 'tải tổng')),
        h('div', { class: 'stat' }, h('b', {}, soVN(hienTai.tap)), h('span', {}, 'buổi tập')),
        h('div', { class: 'stat' }, h('b', {}, soVN(hienTai.choi)), h('span', {}, 'buổi chơi'))),
      h('div', { class: 'mt' }, ghiChuTai(cb)),
      hienTai.coUoc ? h('p', { class: 'hint' }, 'Có buổi chưa nhập RPE nên được ước tính với RPE 5.') : null),
    h('div', { class: 'row wrap' }, h('a', { class: 'btn grow', href: '#/tap/choi' }, 'Ghi buổi chơi'), h('a', { class: 'btn ghost grow', href: '#/tap/ghi' }, 'Ghi buổi tập')),
    h('details', { class: 'card' }, h('summary', { class: 'lnk' }, 'Cách tính và giới hạn'),
      h('div', { class: 'stack mt' },
        h('p', {}, 'Tải của một buổi bằng RPE (mức nỗ lực cảm nhận, thang 1 đến 10) nhân với số phút. Phương pháp này gọi là session-RPE (Foster và cộng sự, 2001).'),
        h('p', {}, 'Cảnh báo so tải tuần này với trung bình 4 tuần trước (ý tưởng acute:chronic workload, Gabbett 2016). Mức vượt khoảng 30% hiện lưu ý, vượt 50% hiện cảnh báo rõ hơn.'),
        h('p', {}, 'Đây chỉ là gợi ý để bạn chú ý, không phải chẩn đoán hay dự báo chấn thương. Cách tính này còn được tranh luận trong giới nghiên cứu. Hãy lắng nghe cơ thể: đau kéo dài, mệt mỏi bất thường thì nên nghỉ và hỏi chuyên viên.'))));
}

// ---------- Khối lượng ----------
const st = { lui: 0 };
function tabKhoiLuong(root, ctx) {
  const hom = homNay();
  const dau = congNgay(dauTuan(hom), -7 * st.lui);
  const kq = khoiLuongTheoNhom(S.dsBuoi(), BAI_THEO_ID, dau);
  const hang = Object.entries(kq).map(([n, v]) => ({ nhan: NHOM[n], v: v.hiep, kg: v.kg, lan: v.lan })).sort((a, b) => b.v - a.v);
  const tongHiep = hang.reduce((a, x) => a + x.v, 0);
  const tongKg = Object.values(kq).reduce((a, v) => a + v.kg, 0);
  root.append(
    h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tuần trước', 'data-testid': 'tuan-truoc', onclick: () => { st.lui++; ctx.veLai(); } }, '‹'),
        h('div', { class: 'grow', 'aria-live': 'polite', 'data-testid': 'tuan-nhan' }, h('b', {}, st.lui === 0 ? 'Tuần này' : `${st.lui} tuần trước`), h('div', { class: 'sub' }, `${ngNgan(dau)} đến ${ngNgan(congNgay(dau, 6))}`)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tuần sau', 'data-testid': 'tuan-sau', disabled: st.lui === 0, onclick: () => { st.lui = Math.max(0, st.lui - 1); ctx.veLai(); } }, '›')),
      hang.length ? [
        h('h2', { class: 'mt' }, 'Số hiệp theo nhóm cơ'),
        h('p', { class: 'sub' }, 'Nhóm cơ chính tính 1 hiệp, nhóm phụ tính nửa hiệp.'),
        thanhNgang(hang, { nhan: 'Số hiệp theo nhóm cơ trong tuần', don: '' }),
        h('div', { class: 'grid2 mt' },
          h('div', { class: 'stat' }, h('b', { 'data-testid': 'kl-hiep' }, soVN(tongHiep, 1)), h('span', {}, 'hiệp (đã tính nhóm phụ)')),
          h('div', { class: 'stat' }, h('b', { 'data-testid': 'kl-kg' }, soVN(Math.round(tongKg))), h('span', {}, 'kg khối lượng (hiệp × lần × kg)'))),
        h('table', { class: 'offscreen' }, h('caption', {}, 'Khối lượng theo nhóm cơ'), h('tbody', {}, ...hang.map((x) => h('tr', {}, h('td', {}, x.nhan), h('td', {}, String(x.v)), h('td', {}, String(Math.round(x.kg)))))))] :
        trangRong('Tuần này chưa có buổi tập', 'Ghi buổi tập để thấy khối lượng theo nhóm cơ.', h('a', { class: 'btn sm', href: '#/tap/ghi' }, 'Ghi buổi tập'))),
    h('div', { class: 'note' }, 'Khối lượng chỉ tính các bài có tạ (kg). Bài không tạ được tính bằng số hiệp. Dùng để thấy tuần nào thiếu hoặc dồn quá nhiều vào một nhóm cơ, không dùng để so với người khác.'));
}

// ---------- Cân nặng, vòng đo ----------
const VONG = [['eo', 'Vòng eo'], ['nguc', 'Vòng ngực'], ['mong', 'Vòng mông'], ['dui', 'Vòng đùi'], ['tay', 'Vòng tay']];
const sdo = { vong: 'eo' };
function tabDo(root, ctx) {
  const ds = S.dsDo().sort((a, b) => a.ngay.localeCompare(b.ngay));
  const mt = S.layMucTieu();
  const ngay = h('input', { type: 'date', id: 'd-ngay', value: homNay(), 'data-testid': 'd-ngay' });
  const kg = h('input', { type: 'text', inputmode: 'decimal', id: 'd-kg', 'data-testid': 'd-kg', placeholder: 'ví dụ 62,5', autocomplete: 'off' });
  const vong = {};
  const ovong = VONG.map(([k, t]) => { vong[k] = h('input', { type: 'text', inputmode: 'decimal', id: `d-${k}`, 'data-testid': `d-${k}`, autocomplete: 'off', placeholder: 'cm' }); return h('div', { class: 'field' }, h('label', { for: `d-${k}` }, t), vong[k]); });
  const dsEl = h('ul', { class: 'list', 'data-testid': 'ds-do' });
  const veDs = () => {
    xoa(dsEl);
    if (!ds.length) { dsEl.append(h('li', { class: 'empty' }, 'Chưa có số đo nào.')); return; }
    [...ds].reverse().slice(0, 12).forEach((d) => dsEl.append(h('li', { class: 'item', 'data-do': d.id },
      h('div', { class: 'grow' }, h('div', { class: 't' }, `${d.kg ? `${soVN(d.kg, 1)} kg` : 'Chỉ vòng đo'}`), h('div', { class: 's' }, `${ngayVN(d.ngay)}${Object.entries(d.vong || {}).map(([k, v]) => ` · ${VONG.find((x) => x[0] === k)[1].replace('Vòng ', '')} ${soVN(v, 1)}`).join('')}`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Xóa số đo', onclick: async () => { const cu = JSON.parse(JSON.stringify(d)); await S.xoaDo(d.id); ctx.veLai(); toast('Đã xóa số đo.', { hoanTac: async () => { await S.luuDo(cu); ctx.veLai(); } }); } }, '✕'))));
  };
  const diemCan = ds.filter((d) => d.kg).map((d) => ({ nhan: ngNgan(d.ngay), v: d.kg }));
  const diemVong = ds.filter((d) => d.vong && d.vong[sdo.vong]).map((d) => ({ nhan: ngNgan(d.ngay), v: d.vong[sdo.vong] }));
  const mucTieu = h('input', { type: 'text', inputmode: 'decimal', id: 'd-mt', 'data-testid': 'd-mt', value: mt.kg ? String(mt.kg).replace('.', ',') : '', placeholder: 'kg, bỏ trống nếu không có', autocomplete: 'off' });
  root.append(
    h('div', { class: 'card stack' }, h('h2', {}, 'Ghi số đo'),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { for: 'd-ngay' }, 'Ngày'), ngay), h('div', { class: 'field' }, h('label', { for: 'd-kg' }, 'Cân nặng (kg)'), kg)),
      h('details', {}, h('summary', { class: 'lnk' }, 'Thêm vòng đo (cm)'), h('div', { class: 'grid2 mt' }, ...ovong)),
      h('button', { type: 'button', class: 'btn block', 'data-testid': 'luu-do', onclick: async () => {
        const c = so(kg.value); const v = {};
        for (const [k] of VONG) { const x = so(vong[k].value); if (x !== null) { if (!(x > 5 && x < 250)) { toast('Vòng đo nên trong khoảng 5 đến 250 cm.'); return; } v[k] = x; } }
        if (c !== null && !(c >= 20 && c <= 300)) { toast('Cân nặng nên trong khoảng 20 đến 300 kg.'); return; }
        if (c === null && !Object.keys(v).length) { toast('Nhập cân nặng hoặc ít nhất một vòng đo.'); return; }
        await S.luuDo({ id: S.taoId(), ngay: ngay.value || homNay(), kg: c, vong: v });
        toast('Đã lưu số đo.'); ctx.veLai();
      } }, 'Lưu số đo')),
    h('div', { class: 'card' }, h('h2', {}, 'Biểu đồ cân nặng'),
      diemCan.length ? duong(diemCan, { nhan: 'Biểu đồ cân nặng', muc: mt.kg || null, don: ' kg' }) : trangRong('Chưa có cân nặng', 'Ghi cân nặng để thấy biểu đồ.'),
      h('div', { class: 'field mt' }, h('label', { for: 'd-mt' }, 'Mục tiêu cân nặng (kg)'), mucTieu,
        h('div', { class: 'row mt' }, h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'luu-mt', onclick: async () => { const x = so(mucTieu.value); await S.luuMucTieu(x && x >= 20 && x <= 300 ? { ...mt, kg: x } : { ...mt, kg: null }); ctx.veLai(); } }, 'Lưu mục tiêu')))),
    h('div', { class: 'card' }, h('h2', {}, 'Vòng đo'),
      chips(VONG.map(([v, t]) => ({ v, t })), sdo.vong, (v) => { sdo.vong = v; ctx.veLai(); }, 'Chọn vòng đo'),
      h('div', { class: 'mt' }, diemVong.length ? duong(diemVong, { nhan: `Biểu đồ ${VONG.find((x) => x[0] === sdo.vong)[1]}`, don: ' cm' }) : trangRong('Chưa có số liệu', 'Ghi vòng đo ở phần trên.'))),
    h('div', { class: 'card tight' }, h('h2', {}, 'Lịch sử số đo'), dsEl),
    h('div', { class: 'note' }, 'Số đo chỉ để bạn theo dõi xu hướng của chính mình. 9fit không đưa lời khuyên về ăn uống hay cân nặng lý tưởng. Chưa có ảnh tiến độ ở bản này.'));
  veDs();
}

// ---------- Kiểm tra thể lực ----------
const sdt = { loai: 'chong-day' };
const mmss = (g) => `${Math.floor(g / 60)}:${String(Math.round(g % 60)).padStart(2, '0')}`;
function tabTest(root, ctx) {
  const tt = S.trangThaiSangLoc();
  const b = BAI_TEST[sdt.loai];
  const choPhep = choPhepTest(tt, b);
  if (!choPhep) {
    root.append(h('div', { class: 'note warn', 'data-testid': 'test-bi-khoa' }, h('b', {}, 'Chưa nên làm bài kiểm tra này. '), tt === 'chua' ? 'Đây là bài sức nặng cao. Hãy làm sàng lọc sức khỏe trước.' : 'Theo câu trả lời sàng lọc, bạn nên hỏi bác sĩ hoặc huấn luyện viên trước.', h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: tt === 'chua' ? '#/them/suc-khoe/sang-loc' : '#/them/suc-khoe' }, tt === 'chua' ? 'Làm sàng lọc' : 'Xem hướng dẫn'))));
  }
  const ds = S.dsTest().filter((t) => t.loai === sdt.loai).sort((a, c) => a.ngay.localeCompare(c.ngay));
  const tot = ds.length ? (b.cao ? Math.max(...ds.map((t) => t.v)) : Math.min(...ds.map((t) => t.v))) : null;
  const dinh = (v) => (sdt.loai === 'chay-1600' ? mmss(v) : `${soVN(v, 1)} ${b.don}`);
  const ngay = h('input', { type: 'date', id: 't-ngay', value: homNay(), 'data-testid': 't-ngay' });
  const v1 = h('input', { type: 'text', inputmode: 'decimal', id: 't-v', 'data-testid': 't-v', autocomplete: 'off', placeholder: sdt.loai === 'chay-1600' ? 'phút' : b.don });
  const v2 = h('input', { type: 'text', inputmode: 'numeric', id: 't-v2', 'data-testid': 't-v2', autocomplete: 'off', placeholder: sdt.loai === 'chay-1600' ? 'giây' : 'cm' });
  const bt = b.bienThe ? h('select', { id: 't-bt', 'data-testid': 't-bt' }, ...b.bienThe.map((x) => h('option', { value: x }, x))) : null;
  const ghiEl = h('div', { class: 'hint', 'aria-live': 'polite' });
  const dsEl = h('ul', { class: 'list', 'data-testid': 'ds-test' });
  [...ds].reverse().slice(0, 10).forEach((t) => dsEl.append(h('li', { class: 'item', 'data-test': t.id }, h('div', { class: 'grow' }, h('div', { class: 't' }, dinh(t.v)), h('div', { class: 's' }, `${ngayVN(t.ngay)}${t.bt ? ` · ${t.bt}` : ''}${t.vo2 ? ` · VO2max ước tính ${soVN(t.vo2, 1)} ml/kg/phút` : ''}`)),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Xóa kết quả', onclick: async () => { const cu = { ...t }; await S.xoaTest(t.id); ctx.veLai(); toast('Đã xóa kết quả.', { hoanTac: async () => { await S.luuTest(cu); ctx.veLai(); } }); } }, '✕'))));
  if (!ds.length) dsEl.append(h('li', { class: 'empty' }, 'Chưa có kết quả.'));
  root.append(
    h('div', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', { for: 'sel-test' }, 'Bài kiểm tra'), (() => { const s = h('select', { id: 'sel-test', 'data-testid': 'sel-test' }, ...Object.entries(BAI_TEST).map(([k, x]) => h('option', { value: k }, x.ten))); s.value = sdt.loai; s.addEventListener('change', () => { sdt.loai = s.value; ctx.veLai(); }); return s; })()),
      h('p', {}, b.mo),
      b.nang ? h('div', { class: 'note warn' }, 'Bài này sức nặng cao. Chỉ làm khi đã khởi động kỹ, sức khỏe tốt, không đau ngực hoặc chóng mặt; dừng ngay nếu thấy không ổn.') : null,
      h('p', { class: 'hint' }, 'Kết quả chỉ để so với chính bạn theo thời gian, 9fit không xếp loại hay so với người khác.')),
    !choPhep ? null : h('div', { class: 'card stack' }, h('h2', {}, 'Ghi kết quả'),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { for: 't-ngay' }, 'Ngày'), ngay), h('div', { class: 'field' }, h('label', { for: 't-v' }, sdt.loai === 'bat-cao' ? 'Chạm khi đứng (cm)' : sdt.loai === 'chay-1600' ? 'Thời gian: phút' : `Kết quả (${b.don})`), v1)),
      sdt.loai === 'bat-cao' || sdt.loai === 'chay-1600' ? h('div', { class: 'field' }, h('label', { for: 't-v2' }, sdt.loai === 'bat-cao' ? 'Chạm khi bật (cm)' : 'Giây'), v2) : null,
      bt ? h('div', { class: 'field' }, h('label', { for: 't-bt' }, 'Kiểu'), bt) : null,
      ghiEl,
      h('button', { type: 'button', class: 'btn block', 'data-testid': 'luu-test', onclick: async () => {
        let v; let vo2 = null;
        if (sdt.loai === 'bat-cao') { v = chieuCaoBat(so(v1.value), so(v2.value)); if (v === null || !hopLeTest('bat-cao', v)) { toast('Nhập hai điểm chạm (cm); điểm khi bật phải cao hơn điểm khi đứng.'); return; } } else if (sdt.loai === 'chay-1600') { const p = so(v1.value); const g = so(v2.value) || 0; v = Math.round(p || 0) * 60 + Math.round(g); if (p === null || g < 0 || g > 59 || !hopLeTest('chay-1600', v)) { toast('Nhập thời gian từ 3 phút đến 30 phút, ví dụ 8 phút 30 giây.'); return; } } else {
          v = so(v1.value);
          if (v === null || !hopLeTest(sdt.loai, v)) { toast(`Nhập kết quả từ ${b.min} đến ${b.max} ${b.don}.`); return; }
          if (sdt.loai === 'cooper' && bt && bt.value === 'Chạy') vo2 = vo2Cooper(v);
        }
        await S.luuTest({ id: S.taoId(), ngay: ngay.value || homNay(), loai: sdt.loai, v, bt: bt ? bt.value : null, vo2 });
        toast('Đã lưu kết quả.'); ctx.veLai();
      } }, 'Lưu kết quả')),
    h('div', { class: 'card' }, h('h2', {}, 'Tiến bộ'),
      ds.length ? [h('p', { 'data-testid': 'test-tot' }, `Tốt nhất: ${dinh(tot)}`), ds.length > 1 ? duong(ds.map((t) => ({ nhan: ngNgan(t.ngay), v: t.v })), { nhan: `Biểu đồ ${b.ten}`, don: '' }) : h('p', { class: 'hint' }, 'Làm thêm một lần nữa để thấy biểu đồ.')] : trangRong('Chưa có dữ liệu', 'Ghi kết quả đầu tiên làm mốc để so sánh.'),
      sdt.loai === 'cooper' ? h('p', { class: 'hint' }, 'VO2max ước tính theo công thức Cooper (1968): (quãng đường m - 504,9) / 44,73, đơn vị ml/kg/phút. Chỉ tính khi bạn chạy (đi nhanh không áp dụng công thức) và chỉ là ước tính thô.') : null),
    h('div', { class: 'card tight' }, h('h2', {}, 'Lịch sử'), dsEl));
}

export default function tienDo(ctx) {
  const t = ctx.parts[0] || 'tai';
  const TAB = [{ id: 'tai', ten: 'Tải tập' }, { id: 'khoi-luong', ten: 'Khối lượng' }, { id: 'do', ten: 'Số đo' }, { id: 'test', ten: 'Kiểm tra' }];
  const tab = TAB.some((x) => x.id === t) ? t : 'tai';
  ctx.datTieuDe('Tiến độ');
  ctx.root.append(h('section', { class: 'hero' }, h('h1', {}, 'Tiến độ')), tabs(TAB, tab, (id) => { location.hash = `#/tien-do/${id}`; }));
  const noi = h('div', { class: 'stack' });
  ctx.root.append(noi);
  ({ tai: tabTai, 'khoi-luong': tabKhoiLuong, do: tabDo, test: tabTest })[tab](noi, ctx);
}
