// Màn "Mục tiêu": mục tiêu tiết kiệm, máy tính vay và trả nợ sớm, gửi lãi kép.
import { h, oTien, phanDoan, dong, trieu, trong, thongBao, truong, phanTram, thanhTienDo, moHopThoai, so } from '../ui/dom.js';
import { canDeDanh, bangTraNo, soSanhTraSom, laiKep, tyLeTraNo } from '../lib/vay.js';
import { homNay, soThangDen, dinhDangNgay } from '../lib/dates.js';
import { sua, moiId } from '../lib/store.js';

const dat = (nhan, id, phan) => h('a', { href: `#/muctieu${id ? '/' + id : ''}`, 'aria-current': phan === id ? 'page' : undefined }, nhan);

function thanhTab(phan) {
  return h('nav', { class: 'seg', 'aria-label': 'Mục tiêu và vay' }, dat('Mục tiêu', '', phan), dat('Vay', 'vay', phan), dat('Gửi lãi kép', 'gui', phan));
}

// ---------- Mục tiêu ----------
function tabMucTieu(st) {
  const hom = homNay();
  const root = h('div', { class: 'stack' });
  const ds = h('div', { class: 'stack', 'data-testid': 'ds-muc-tieu' });
  const veDs = () => {
    ds.replaceChildren();
    if (!st.mucTieu.length) { ds.append(h('section', { class: 'card' }, trong('Chưa có mục tiêu nào', 'Thêm mục tiêu như quỹ dự phòng, mua xe, đi du lịch để biết mỗi tháng cần để dành bao nhiêu.'))); return; }
    for (const g of st.mucTieu) {
      const thang = g.han ? Math.max(1, soThangDen(hom, g.han)) : 0;
      let kq = null; let loi = '';
      try { kq = g.han && g.han > hom ? canDeDanh({ mucTieu: g.mucTieu, daCo: g.daCo, soThang: thang, laiNam: g.laiNam }) : null; } catch (e) { loi = e.message; }
      const quaHan = g.han && g.han <= hom;
      ds.append(h('section', { class: 'card', 'data-id': g.id },
        h('div', { class: 'card-h' }, h('h2', {}, g.ten), h('b', { class: 'num' }, dong(g.mucTieu))),
        thanhTienDo(g.mucTieu ? Math.min(1, g.daCo / g.mucTieu) : 0),
        h('div', { class: 'small muted' }, `Đã có ${dong(g.daCo)} (${phanTram(g.mucTieu ? g.daCo / g.mucTieu : 0, 0)})${g.han ? ` · hạn ${dinhDangNgay(g.han)}` : ''}`),
        quaHan ? h('div', { class: 'note warn' }, g.daCo >= g.mucTieu ? 'Đã đạt mục tiêu.' : 'Đã quá hạn, hãy đặt hạn mới hoặc điều chỉnh số tiền.')
          : kq ? (kq.daDu ? h('div', { class: 'note good' }, 'Bạn đã có đủ, chỉ cần giữ tiền và chờ đến hạn.')
            : h('div', { class: 'note', role: 'status' }, h('b', {}, `Cần để dành ${dong(kq.moiThang)} mỗi tháng`), ` trong ${thang} tháng${g.laiNam > 0 ? ` (với lãi ${g.laiNam}%/năm; không tính lãi thì ${dong(kq.khongLai)})` : ''}.`,
              st.hoso.net > 0 ? ` Bằng ${phanTram(kq.moiThang / st.hoso.net, 0)} lương net.` : ''))
          : h('div', { class: 'note warn' }, loi || 'Hãy đặt hạn để tính số cần để dành.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn sm', onclick: () => hopCapNhat(g) }, 'Cập nhật số đã có'),
          h('button', { type: 'button', class: 'btn sm danger', onclick: () => {
            sua((s) => { s.mucTieu = s.mucTieu.filter((x) => x.id !== g.id); });
            thongBao(`Đã xóa mục tiêu ${g.ten}`, { hoanTac: () => sua((s) => { s.mucTieu.push(g); }) });
          } }, 'Xóa'))));
    }
  };
  function hopCapNhat(g) {
    moHopThoai(`Số đã có cho "${g.ten}"`, (dong_) => {
      let v = g.daCo;
      const o = oTien({ nhan: 'Số tiền đã để dành', value: g.daCo, macDinh: 1e6, onDoi: (x) => { v = x; } });
      return h('div', { class: 'stack' }, o.el, h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => dong_() }, 'Hủy'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => { sua((s) => { const x = s.mucTieu.find((k) => k.id === g.id); if (x) x.daCo = v; }); dong_(); } }, 'Lưu')));
    });
  }
  // Form thêm
  const ten = h('input', { type: 'text', id: 'mt-ten', maxlength: '60', placeholder: 'Ví dụ: Quỹ dự phòng 6 tháng', autocomplete: 'off' });
  let muc = 0, daCo = 0;
  const oMuc = oTien({ nhan: 'Số tiền cần có', macDinh: 1e6, onDoi: (v) => { muc = v; }, id: 'mt-muc' });
  const oCo = oTien({ nhan: 'Hiện đã có', macDinh: 1e6, onDoi: (v) => { daCo = v; }, id: 'mt-co' });
  const han = h('input', { type: 'date', id: 'mt-han', min: hom });
  const lai = h('input', { type: 'number', id: 'mt-lai', value: '5', min: '0', max: '30', step: '0.1', inputmode: 'decimal' });
  const loi = h('div', { class: 'hint err', role: 'alert' });
  const form = h('section', { class: 'card', 'aria-label': 'Thêm mục tiêu' },
    h('h2', {}, 'Thêm mục tiêu'),
    truong('Tên mục tiêu', ten), oMuc.el, oCo.el, truong('Hạn đạt được', han),
    truong('Lãi suất gửi tiết kiệm (%/năm, tham khảo)', lai, 'Nhập 0 nếu chỉ để tiền mặt. Lãi suất thực tế do bạn kiểm tra ở ngân hàng.'), loi,
    h('button', { type: 'button', class: 'btn primary', 'data-testid': 'them-muc-tieu', onclick: () => {
      if (!ten.value.trim()) { loi.textContent = 'Hãy đặt tên mục tiêu.'; return; }
      if (!(muc > 0)) { loi.textContent = 'Hãy nhập số tiền cần có.'; return; }
      if (!han.value || han.value <= hom) { loi.textContent = 'Hãy chọn hạn sau hôm nay.'; return; }
      if (daCo >= muc) { loi.textContent = 'Số đã có đã đủ hoặc vượt mục tiêu. Hãy tăng số tiền cần có.'; return; }
      sua((s) => { s.mucTieu.push({ id: moiId(), ten: ten.value.trim(), mucTieu: muc, daCo, han: han.value, laiNam: Math.max(0, +lai.value || 0) }); });
    } }, 'Thêm mục tiêu'));
  veDs();
  root.append(ds, form);
  return root;
}

// ---------- Vay ----------
function tabVay(st) {
  const root = h('div', { class: 'stack' });
  const v = { soTien: 0, laiNam: 10, soThang: 120, kieu: 'niemkim', thangTra: 12, soTienTra: 0, phi: 0, cach: 'rut-ky-han' };
  const kq = h('div', { class: 'stack', 'aria-live': 'polite' });
  const oSo = oTien({ nhan: 'Số tiền vay', macDinh: 1e6, onDoi: (x) => { v.soTien = x; tinh(); }, id: 'vay-so' });
  const lai = h('input', { type: 'number', id: 'vay-lai', value: '10', min: '0', max: '60', step: '0.1', inputmode: 'decimal' });
  const ky = h('input', { type: 'number', id: 'vay-ky', value: '120', min: '1', max: '480', step: '1', inputmode: 'numeric' });
  const kieu = phanDoan([{ id: 'niemkim', nhan: 'Đều hàng tháng' }, { id: 'goc-deu', nhan: 'Gốc đều' }, { id: 'lai-phang', nhan: 'Lãi phẳng' }], v.kieu, (id) => { v.kieu = id; tinh(); }, 'Kiểu trả nợ');
  lai.addEventListener('input', () => { v.laiNam = +lai.value || 0; tinh(); });
  ky.addEventListener('input', () => { v.soThang = Math.round(+ky.value) || 0; tinh(); });
  const form = h('section', { class: 'card', 'aria-label': 'Máy tính vay' },
    h('h2', {}, 'Máy tính vay và trả góp'),
    oSo.el,
    h('div', { class: 'grid2 keep' }, truong('Lãi suất (%/năm)', lai), truong('Kỳ hạn (tháng)', ky)),
    h('div', { class: 'lbl' }, 'Kiểu trả nợ'), kieu.el,
    h('div', { class: 'hint' }, 'Đều hàng tháng (niên kim): mỗi tháng trả bằng nhau, phổ biến ở vay mua nhà, xe. Gốc đều: tháng đầu trả nhiều nhất rồi giảm dần. Lãi phẳng: lãi tính trên số vay ban đầu, lãi thực cao hơn con số công bố.'));
  const ds = h('div', { class: 'stack' });

  function tinh() {
    kq.replaceChildren();
    if (!(v.soTien > 0)) { kq.append(h('section', { class: 'card' }, trong('Nhập số tiền vay', 'Rồi xem tiền trả mỗi tháng, tổng lãi và so sánh trả nợ sớm.'))); return; }
    if (!(v.soThang >= 1 && v.soThang <= 480)) { kq.append(h('div', { class: 'note bad', role: 'alert' }, 'Kỳ hạn phải từ 1 đến 480 tháng.')); return; }
    if (v.laiNam < 0 || v.laiNam > 60) { kq.append(h('div', { class: 'note bad', role: 'alert' }, 'Lãi suất phải từ 0 đến 60%/năm.')); return; }
    let b;
    try { b = bangTraNo({ soTien: v.soTien, laiNam: v.laiNam, soThang: v.soThang, kieu: v.kieu }); } catch (e) { kq.append(h('div', { class: 'note bad', role: 'alert' }, e.message)); return; }
    const dti = st.hoso.net > 0 ? tyLeTraNo(b.kyDau, st.hoso.net) : null;
    let hien = 12;
    const bang = h('tbody', {});
    const nutXem = h('button', { type: 'button', class: 'btn sm', onclick: () => { hien = hien === 12 ? b.hang.length : 12; veBang(); } });
    const veBang = () => {
      bang.replaceChildren(...b.hang.slice(0, hien).map((r) => h('tr', {}, h('td', {}, String(r.ky)), h('td', {}, so(r.goc)), h('td', {}, so(r.lai)), h('td', {}, so(r.tra)), h('td', {}, so(r.duNo)))));
      nutXem.textContent = hien === 12 ? `Xem cả ${b.hang.length} kỳ` : 'Thu gọn';
      nutXem.hidden = b.hang.length <= 12;
    };
    veBang();
    kq.append(h('section', { class: 'card hero', 'aria-label': 'Kết quả vay' },
      h('div', { class: 'sub' }, v.kieu === 'niemkim' ? 'Trả mỗi tháng' : 'Tháng đầu trả'),
      h('div', { class: 'big', 'data-testid': 'vay-ky-dau' }, dong(b.kyDau)),
      h('div', { class: 'small' }, v.kieu !== 'niemkim' ? `Tháng cuối trả ${dong(b.kyCuoi)}. ` : ''),
      h('div', { class: 'small' }, `Tổng lãi ${dong(b.tongLai)} · tổng phải trả ${dong(b.tongTra)}`),
      b.laiThucNam ? h('div', { class: 'small' }, `Lãi suất thực khoảng ${(Math.round(b.laiThucNam * 10) / 10).toString().replace('.', ',')}%/năm, cao hơn con số công bố.`) : null));
    if (dti) kq.append(h('div', { class: `note ${dti.muc === 'nang' ? 'bad' : dti.muc === 'vua' ? 'warn' : 'good'}` }, `Khoản trả tháng đầu bằng ${phanTram(dti.tyLe, 0)} lương net. ${dti.muc === 'nhe' ? 'Mức khá nhẹ.' : dti.muc === 'vua' ? 'Mức trung bình, cần dè chừng chi tiêu khác.' : 'Mức nặng, nên cân nhắc vay ít hơn hoặc kéo dài kỳ hạn. Đây chỉ là gợi ý, không phải tiêu chuẩn của ngân hàng.'}`));
    kq.append(h('section', { class: 'card', 'aria-label': 'Bảng trả nợ' }, h('h2', {}, 'Bảng trả nợ'),
      h('div', { class: 'scroll-x' }, h('table', { class: 'tb' }, h('thead', {}, h('tr', {}, ['Kỳ', 'Gốc', 'Lãi', 'Trả', 'Dư nợ'].map((t) => h('th', {}, t)))), bang)), nutXem));
    // Trả nợ sớm
    if (v.kieu !== 'lai-phang' && v.soThang >= 2) kq.append(traSom(b));
    // Lưu
    const ten = h('input', { type: 'text', id: 'vay-ten', maxlength: '60', placeholder: 'Ví dụ: Vay mua nhà' });
    const loi = h('div', { class: 'hint err', role: 'alert' });
    kq.append(h('section', { class: 'card', 'aria-label': 'Lưu khoản vay' }, h('h2', {}, 'Lưu khoản vay này'), truong('Tên khoản vay', ten), loi,
      h('button', { type: 'button', class: 'btn primary', 'data-testid': 'luu-vay', onclick: () => {
        if (!ten.value.trim()) { loi.textContent = 'Hãy đặt tên khoản vay.'; return; }
        sua((s) => { s.vay.push({ id: moiId(), ten: ten.value.trim(), soTien: v.soTien, laiNam: v.laiNam, soThang: v.soThang, kieu: v.kieu }); }, { im: true });
        ten.value = ''; veDs(); thongBao('Đã lưu khoản vay. Bạn có thể thêm nó vào khoản cố định hoặc đặt nhắc ngày trả ở danh sách bên dưới.');
      } }, 'Lưu')));
  }

  function traSom() {
    const so_ = h('div', { class: 'stack', 'aria-live': 'polite' });
    const th = h('input', { type: 'number', id: 'ts-thang', value: String(Math.min(v.thangTra, v.soThang - 1)), min: '1', max: String(v.soThang - 1), inputmode: 'numeric' });
    const phi = h('input', { type: 'number', id: 'ts-phi', value: String(v.phi), min: '0', max: '10', step: '0.1', inputmode: 'decimal' });
    const cach = phanDoan([{ id: 'rut-ky-han', nhan: 'Rút ngắn kỳ hạn' }, { id: 'giam-tien-tra', nhan: 'Giảm tiền trả/tháng' }], v.cach, (id) => { v.cach = id; ra(); }, 'Cách trả sớm');
    const oTra = oTien({ nhan: 'Số tiền trả thêm một lần', value: v.soTienTra, macDinh: 1e6, onDoi: (x) => { v.soTienTra = x; ra(); }, id: 'ts-tien' });
    th.addEventListener('input', () => { v.thangTra = Math.round(+th.value) || 0; ra(); });
    phi.addEventListener('input', () => { v.phi = +phi.value || 0; ra(); });
    function ra() {
      so_.replaceChildren();
      if (!(v.soTienTra > 0)) return;
      try {
        const r = soSanhTraSom({ soTien: v.soTien, laiNam: v.laiNam, soThang: v.soThang, kieu: v.kieu, thangTra: v.thangTra, soTienTra: v.soTienTra, phiPhanTram: v.phi, cach: v.cach });
        so_.append(h('div', { class: `note ${r.tietKiemRong > 0 ? 'good' : 'warn'}`, 'data-testid': 'tra-som' },
          h('b', {}, r.tietKiemRong > 0 ? `Tiết kiệm được ${dong(r.tietKiemRong)} tiền lãi` : 'Trả sớm không có lợi trong trường hợp này'),
          r.phi ? ` (đã trừ phí trả trước hạn ${dong(r.phi)})` : '', `. Tổng lãi từ ${dong(r.goc.tongLai)} xuống ${dong(r.som.tongLai)}.`,
          r.rutKy > 0 ? ` Khoản vay kết thúc sớm ${r.rutKy} tháng (còn ${r.som.soKy} tháng).` : ' Kỳ hạn giữ nguyên, tiền trả mỗi tháng giảm.'));
      } catch (e) { so_.append(h('div', { class: 'note bad', role: 'alert' }, e.message)); }
    }
    ra();
    return h('section', { class: 'card', 'aria-label': 'So sánh trả nợ sớm' }, h('h2', {}, 'Nếu trả nợ sớm thì sao?'),
      h('div', { class: 'grid2 keep' }, truong('Trả vào cuối tháng thứ', th), truong('Phí trả trước hạn (%)', phi)),
      oTra.el, cach.el, so_, h('div', { class: 'hint' }, 'Xem hợp đồng vay về phí trả trước hạn (thường vài phần trăm trong 1 đến 5 năm đầu). Nếu bạn đang có tiền gửi lãi cao hơn lãi vay thì chưa chắc nên trả sớm.'));
  }

  // Danh sách khoản vay đã lưu
  function veDs() {
    ds.replaceChildren();
    if (!st.vay.length) return;
    ds.append(h('section', { class: 'card', 'aria-label': 'Khoản vay của tôi' }, h('h2', {}, 'Khoản vay của tôi'),
      h('ul', { class: 'list', 'data-testid': 'ds-vay' }, st.vay.map((x) => {
        const b = bangTraNo({ soTien: x.soTien, laiNam: x.laiNam, soThang: x.soThang, kieu: x.kieu });
        return h('li', { 'data-id': x.id },
          h('div', { class: 't' }, h('b', {}, x.ten), h('span', { class: 'small muted' }, `${dong(x.soTien)} · ${x.laiNam}%/năm · ${x.soThang} tháng`), h('span', { class: 'small' }, `Tháng đầu trả ${dong(b.kyDau)}`),
            h('span', { class: 'row' },
              h('button', { type: 'button', class: 'btn sm', onclick: () => { sua((s) => { s.coDinh.push({ id: moiId(), ten: `Trả ${x.ten}`, soTien: b.kyDau, hu: 'thiet-yeu' }); }, { im: true }); thongBao(`Đã thêm "Trả ${x.ten}" vào khoản cố định`); } }, 'Thêm vào khoản cố định'),
              h('button', { type: 'button', class: 'btn sm', onclick: () => hopNhac(x, b.kyDau) }, 'Nhắc ngày trả'))),
          h('button', { type: 'button', class: 'ico-btn', 'aria-label': `Xóa khoản vay ${x.ten}`, onclick: () => { sua((s) => { s.vay = s.vay.filter((k) => k.id !== x.id); }, { im: true }); veDs(); thongBao(`Đã xóa ${x.ten}`, { hoanTac: () => { sua((s) => { s.vay.push(x); }, { im: true }); veDs(); } }); } }, '✕'));
      }))));
  }
  function hopNhac(x, tien) {
    moHopThoai(`Nhắc ngày trả "${x.ten}"`, (dong_) => {
      const sel = h('select', { id: 'nhac-ngay' }); for (let d = 1; d <= 28; d++) sel.append(h('option', { value: String(d) }, `Ngày ${d} hằng tháng`));
      return h('div', { class: 'stack' }, truong('Ngày trả nợ', sel), h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => dong_() }, 'Hủy'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => {
          const hom = homNay(); const d = +sel.value;
          sua((s) => { s.lich.push({ id: moiId(), ten: `Trả ${x.ten}`, loai: 'vay', ngay: `${hom.slice(0, 7)}-${String(d).padStart(2, '0')}`, lap: 'thang', nhacTruoc: 3, soTien: tien }); }, { im: true });
          dong_(); thongBao('Đã thêm nhắc. Xuất tệp .ics ở mục Lịch và nhắc để nhắc cả trên điện thoại.');
        } }, 'Thêm nhắc')));
    });
  }
  veDs();
  tinh();
  root.append(form, kq, ds);
  return root;
}

// ---------- Gửi lãi kép ----------
function tabGui() {
  const g = { von: 0, gop: 0, lai: 6, nam: 5 };
  const kq = h('div', { class: 'stack', 'aria-live': 'polite' });
  const oVon = oTien({ nhan: 'Vốn ban đầu', macDinh: 1e6, onDoi: (x) => { g.von = x; ra(); }, id: 'gui-von' });
  const oGop = oTien({ nhan: 'Góp thêm mỗi tháng', macDinh: 1e6, onDoi: (x) => { g.gop = x; ra(); }, id: 'gui-gop' });
  const lai = h('input', { type: 'number', id: 'gui-lai', value: '6', min: '0', max: '40', step: '0.1', inputmode: 'decimal' });
  const nam = h('input', { type: 'number', id: 'gui-nam', value: '5', min: '1', max: '50', step: '1', inputmode: 'numeric' });
  lai.addEventListener('input', () => { g.lai = +lai.value || 0; ra(); });
  nam.addEventListener('input', () => { g.nam = Math.round(+nam.value) || 0; ra(); });
  function ra() {
    kq.replaceChildren();
    if (!(g.von > 0 || g.gop > 0)) { kq.append(h('section', { class: 'card' }, trong('Nhập vốn hoặc số góp hằng tháng', 'Rồi xem số tiền sau vài năm nhờ lãi kép.'))); return; }
    if (!(g.nam >= 1 && g.nam <= 50)) { kq.append(h('div', { class: 'note bad', role: 'alert' }, 'Số năm phải từ 1 đến 50.')); return; }
    if (g.lai < 0 || g.lai > 40) { kq.append(h('div', { class: 'note bad', role: 'alert' }, 'Lãi suất phải từ 0 đến 40%/năm.')); return; }
    const r = laiKep({ von: g.von, laiNam: g.lai, soNam: g.nam, kyGhep: 12, gopThang: g.gop });
    kq.append(h('section', { class: 'card hero' }, h('div', { class: 'sub' }, `Sau ${g.nam} năm bạn có`), h('div', { class: 'big', 'data-testid': 'gui-tong' }, dong(r.tong)),
      h('div', { class: 'small' }, `Tiền bạn bỏ vào ${dong(r.daGop)} · tiền lãi ${dong(r.lai)}`)));
    kq.append(h('section', { class: 'card' }, h('h2', {}, 'Theo từng năm'), h('div', { class: 'scroll-x' }, h('table', { class: 'tb' }, h('thead', {}, h('tr', {}, ['Năm', 'Đã góp', 'Lãi', 'Số dư'].map((t) => h('th', {}, t)))),
      h('tbody', {}, r.theoNam.map((x) => h('tr', {}, h('td', {}, String(x.nam)), h('td', {}, so(x.daGop)), h('td', {}, so(x.lai)), h('td', {}, so(x.soDu)))))))));
    kq.append(h('p', { class: 'small muted' }, 'Lãi ghép theo tháng, góp vào cuối mỗi tháng, lãi suất giữ nguyên suốt kỳ. Lãi tiền gửi tại tổ chức tín dụng thuộc diện miễn thuế TNCN (Luật 109/2025/QH15 Điều 4 khoản 6). Lãi suất thực tế đổi theo thời điểm, hãy hỏi ngân hàng.'));
  }
  ra();
  return h('div', { class: 'stack' }, h('section', { class: 'card', 'aria-label': 'Lãi kép' }, h('h2', {}, 'Gửi tiết kiệm và lãi kép'), oVon.el, oGop.el, h('div', { class: 'grid2 keep' }, truong('Lãi suất (%/năm)', lai), truong('Số năm', nam))), kq);
}

export function ve(st, ctx) {
  const phan = ctx.parts[1] || '';
  const noi = phan === 'vay' ? tabVay(st) : phan === 'gui' ? tabGui() : tabMucTieu(st);
  return { el: h('div', { class: 'stack' }, thanhTab(phan), noi), tieuDe: 'Mục tiêu và vay' };
}
