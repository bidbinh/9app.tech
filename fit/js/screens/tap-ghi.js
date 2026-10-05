// Ghi buổi tập nhanh: chọn bài, hiệp, lần, mức tạ, RPE; hẹn giờ nghỉ; điền sẵn từ buổi trước; gợi ý tăng tạ; kỷ lục; bản nháp tự lưu.
import { h, xoa, hopThoai, hoi, toast, homNay, chips } from '../ui/dom.js';
import { BAI_TAP, BAI_THEO_ID } from '../data/exercises.js';
import { moTaDem } from '../data/ex-base.js';
import { khoaTim, khop, soVN } from '../lib/text.js';
import { lichSuBai, goiYTangTa, kiemTraPR, laBaiChan, setHopLe, hiepDaLam, kepRPE, ngayVN } from '../lib/calc.js';
import { choPhepBai, thieuBaiNen } from '../lib/an-toan.js';
import * as S from '../lib/store.js';
import * as rest from '../ui/rest.js';
import { caiDat, luuCaiDat } from '../ui/timer.js';
import { CHUONG_TRINH } from '../data/programs.js';
import { baiCuaBuoi } from '../lib/calc.js';
import { thumb, bannerAnToan, mocHiep, tomTatBuoi } from '../ui/common.js';

const so = (v) => { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };

// ---------- Khởi tạo dữ liệu ----------
function setTrong(dem) { return dem.kieu === 'giay' ? { giay: null, xong: false } : { lan: null, kg: null, rpe: null, xong: false }; }
// Giá trị buổi trước chỉ là gợi ý (placeholder, trường ph); hiệp chỉ được lưu khi bấm xong hoặc người dùng tự nhập (trường tay).
const gocHiep = (s, dem) => (dem.kieu === 'giay' ? { giay: null, xong: false, ph: { giay: s.giay ?? null } } : { lan: null, kg: null, rpe: null, xong: false, ph: { lan: s.lan ?? null, kg: s.kg ?? null } });

/** Tạo mục bài mới, điền sẵn từ buổi trước (nếu có). */
export function taoMucBai(exId, boQuaId = null, demGhiDe = null) {
  const ex = BAI_THEO_ID.get(exId);
  const dem = demGhiDe || ex.dem;
  const truoc = lichSuBai(S.dsBuoi(), exId, boQuaId).filter((l) => (l.sets || []).some(setHopLe)).pop();
  let sets;
  if (truoc) {
    sets = truoc.sets.filter(setHopLe).map((s) => gocHiep(s, dem));
    while (sets.length < dem.hiep) sets.push(JSON.parse(JSON.stringify(sets[sets.length - 1])));
  } else sets = Array.from({ length: dem.hiep }, () => setTrong(dem));
  return { ex: exId, dem: { ...dem }, sets };
}

function nhapMoi() {
  return { id: S.taoId(), ngay: homNay(), ten: 'Buổi tập', bd: Date.now(), phut: null, rpe: null, ghiChu: '', bai: [], ct: null };
}

/** Thêm bài vào bản nháp (tạo bản nháp nếu chưa có). Dùng từ Thư viện. */
export function themVaoNhap(exId) {
  const ex = BAI_THEO_ID.get(exId);
  const kt = choPhepBai(S.trangThaiSangLoc(), ex);
  if (!kt.ok) return kt;
  const n = S.layNhap() || nhapMoi();
  if (!n.bai.some((e) => e.ex === exId)) n.bai.push(taoMucBai(exId, n.sua || null));
  S.luuNhap(n);
  return { ok: true, ly: '' };
}

/** Tạo bản nháp từ một buổi trong chương trình. */
export function nhapTuChuongTrinh(kh, muc) {
  const ct = CHUONG_TRINH.find((c) => c.id === kh.ctId);
  const n = nhapMoi();
  n.ct = muc.key;
  n.ten = `${ct.ten.split(':')[0]} · ${ct.phien[muc.phienIdx].ten}`;
  n.bai = baiCuaBuoi(ct, muc, BAI_THEO_ID).map((b) => taoMucBai(b.ex, null, b.dem));
  S.luuNhap(n);
  return n;
}

/** Sao chép buổi cũ thành bản nháp mới (ngày hôm nay, chưa đánh dấu xong). */
export function nhapTuBuoiCu(b) {
  const n = nhapMoi();
  n.ten = b.ten;
  n.bai = (b.bai || []).map((e) => ({ ex: e.ex, dem: e.dem || BAI_THEO_ID.get(e.ex)?.dem, sets: (e.sets || []).filter(setHopLe).map((s) => gocHiep(s, e.dem || BAI_THEO_ID.get(e.ex)?.dem || { kieu: 'lan' })) })).filter((e) => BAI_THEO_ID.has(e.ex));
  S.luuNhap(n);
  return n;
}

// ---------- Chọn bài ----------
export function chonBai(daCo = []) {
  return hopThoai('Thêm bài tập', (dong) => {
    const o = h('input', { type: 'search', class: 'search', id: 'pick-q', 'aria-label': 'Tìm bài', placeholder: 'Tìm bài: squat, hít đất, vai...', autocomplete: 'off', autofocus: true, 'data-testid': 'pick-q' });
    const ds = h('ul', { class: 'list', 'data-testid': 'pick-list' });
    const gan = (() => {
      const dem = new Map();
      for (const b of S.dsBuoi()) for (const e of b.bai || []) dem.set(e.ex, (dem.get(e.ex) || 0) + 1);
      return [...dem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => BAI_THEO_ID.get(id)).filter(Boolean);
    })();
    const ve = () => {
      xoa(ds);
      const q = o.value.trim();
      let kq;
      const muc = S.trangThaiSangLoc();
      const duoc = (b) => choPhepBai(muc, b).ok;
      if (q) kq = BAI_TAP.filter((b) => duoc(b) && khop(khoaTim(b.ten + ' ' + b.nhomChinh.join(' ')), q)).slice(0, 30);
      else kq = (gan.length ? gan : BAI_TAP.filter((b) => b.loai === 'suc-manh')).filter(duoc).slice(0, 12);
      if (!kq.length) { ds.append(h('li', { class: 'empty' }, 'Không thấy bài nào. Thử gõ từ khác.')); return; }
      if (!q) ds.append(h('li', { class: 'sub' }, gan.length ? 'Bài bạn hay tập' : 'Gợi ý bài sức mạnh'));
      for (const b of kq) {
        ds.append(h('li', {}, h('button', { type: 'button', class: 'item', 'data-pick': b.id, onclick: () => dong(b.id) },
          thumb(b), h('div', { class: 'grow' }, h('div', { class: 't' }, b.ten), h('div', { class: 's' }, daCo.includes(b.id) ? 'Đã có trong buổi, thêm lần nữa' : moTaDem(b.dem))))));
      }
    };
    o.addEventListener('input', ve);
    ve();
    return [o, ds, h('div', { class: 'modal-act' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => dong(undefined) }, 'Đóng'))];
  });
}

// ---------- Màn hình ghi ----------
export default function ghi(ctx, idSua = null) {
  const { root } = ctx;
  if (!idSua && S.trangThaiSangLoc() === 'dung-lai') {
    ctx.datTieuDe('Ghi buổi tập');
    root.append(h('div', { class: 'note warn', role: 'alert', 'data-testid': 'ghi-bi-khoa' }, h('b', {}, 'Chưa nên tập lúc này. '), 'Theo kết quả sàng lọc, bạn nên hỏi bác sĩ hoặc huấn luyện viên trước khi tập. Bạn vẫn xem được thư viện và lịch sử.', h('div', { class: 'row wrap' }, h('a', { class: 'btn sm', href: '#/them/suc-khoe' }, 'Xem hướng dẫn'), h('a', { class: 'btn sm ghost', href: '#/thu-vien' }, 'Mở thư viện'))));
    return;
  }
  let buoi; let laSua = false;
  if (idSua) {
    const goc = S.layBuoi(idSua);
    if (!goc) { root.append(h('div', { class: 'empty' }, h('b', {}, 'Không tìm thấy buổi tập'), h('a', { class: 'btn mt', href: '#/tap/lich-su' }, 'Về lịch sử'))); return; }
    buoi = JSON.parse(JSON.stringify(goc)); laSua = true; buoi.sua = idSua;
    buoi.bai.forEach((e) => { e.dem = e.dem || BAI_THEO_ID.get(e.ex)?.dem; e.sets.forEach((s) => { s.xong = setHopLe(s); }); });
  } else {
    buoi = S.layNhap();
    if (!buoi) {
      const kh = ctx.query.get('ct');
      const kehoach = S.layKeHoach();
      const muc = kh && kehoach ? kehoach.muc.find((m) => m.key === kh) : null;
      buoi = muc ? nhapTuChuongTrinh(kehoach, muc) : nhapMoi();
      if (!muc) S.luuNhap(buoi);
    } else if (ctx.query.get('ct') && buoi.ct !== ctx.query.get('ct')) {
      // Có bản nháp khác với buổi chương trình vừa chọn: hỏi người dùng
      const kh = S.layKeHoach(); const muc = kh?.muc.find((m) => m.key === ctx.query.get('ct'));
      if (muc && buoi.bai.some((e) => hiepDaLam(e.sets).length)) {
        hoi('Đang có một buổi ghi dở', 'Bạn muốn tiếp tục buổi đang ghi hay thay bằng buổi trong chương trình?', { ok: 'Thay bằng buổi chương trình', huy: 'Giữ buổi đang ghi' }).then((thay) => { if (thay) { nhapTuChuongTrinh(kh, muc); ctx.dieuHuong('#/tap/ghi'); ctx.veLai(); } });
      } else if (muc) { buoi = nhapTuChuongTrinh(kh, muc); }
    }
  }
  ctx.datTieuDe(laSua ? 'Sửa buổi tập' : 'Ghi buổi tập');

  let hen = 0; let daDong = false;
  const luuNhap = () => { if (laSua) return; clearTimeout(hen); hen = setTimeout(() => S.luuNhap(buoi), 250); };
  const luuNgay = () => { if (laSua) return; clearTimeout(hen); S.luuNhap(buoi); };

  const khung = h('div', { class: 'stack', 'data-testid': 'editor' });
  root.append(khung);

  function ve() {
    xoa(khung);
    const an = bannerAnToan({ ngan: true });
    if (an) khung.append(an);
    // Đầu buổi
    const ten = h('input', { type: 'text', id: 'b-ten', value: buoi.ten, maxlength: '60', 'aria-label': 'Tên buổi tập', 'data-testid': 'b-ten' });
    ten.addEventListener('input', () => { buoi.ten = ten.value; luuNhap(); });
    const ngay = h('input', { type: 'date', id: 'b-ngay', value: buoi.ngay, 'aria-label': 'Ngày tập', 'data-testid': 'b-ngay' });
    ngay.addEventListener('change', () => { if (ngay.value) { buoi.ngay = ngay.value; luuNhap(); } });
    khung.append(
      h('div', { class: 'card' },
        h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { for: 'b-ten' }, 'Tên buổi'), ten), h('div', { class: 'field' }, h('label', { for: 'b-ngay' }, 'Ngày'), ngay)),
        laSua ? null : h('div', { class: 'hint' }, 'Bản nháp tự lưu trên máy. Thoát giữa chừng vẫn còn.')),
      nghiChinh());

    if (!buoi.bai.length) {
      khung.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'Chưa có bài nào'), 'Thêm bài từ thư viện, hoặc áp dụng một chương trình mẫu trong mục Tập.')));
    }
    buoi.bai.forEach((e, i) => khung.append(theBai(e, i)));
    khung.append(
      h('button', { type: 'button', class: 'btn line block', 'data-testid': 'them-bai', onclick: async () => { const id = await chonBai(buoi.bai.map((e) => e.ex)); if (id) { buoi.bai.push(taoMucBai(id, laSua ? buoi.id : null)); luuNgay(); ve(); } } }, '+ Thêm bài'),
      h('div', { class: 'field' }, h('label', { for: 'b-note' }, 'Ghi chú buổi tập'), (() => {
        const t = h('textarea', { id: 'b-note', maxlength: '500', 'data-testid': 'b-note', placeholder: 'Cảm giác, chỗ đau, ghi nhớ cho buổi sau...' }, buoi.ghiChu || '');
        t.addEventListener('input', () => { buoi.ghiChu = t.value; luuNhap(); });
        return t;
      })()),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn grow', 'data-testid': 'ket-thuc', onclick: ketThuc }, laSua ? 'Lưu thay đổi' : 'Kết thúc và lưu'),
        h('button', { type: 'button', class: 'btn ghost', 'data-testid': 'huy-buoi', onclick: huyBuoi }, laSua ? 'Không lưu' : 'Bỏ buổi này')));
  }

  function nghiChinh() {
    const cd = caiDat();
    const muc = [{ v: '0', t: 'Tắt' }, { v: '60', t: '1 phút' }, { v: '90', t: '1:30' }, { v: '120', t: '2 phút' }, { v: '180', t: '3 phút' }];
    return h('div', { class: 'card' }, h('div', { class: 'lbl' }, 'Hẹn giờ nghỉ sau mỗi hiệp'), chips(muc, String(cd.nghiMacDinh), (v) => { luuCaiDat({ nghiMacDinh: Number(v) }); }, 'Thời gian nghỉ'),
      h('div', { class: 'hint' }, 'Báo bằng âm và rung nếu trình duyệt cho phép; tắt trong Thêm, Dữ liệu và cài đặt.'));
  }

  function theBai(e, i) {
    const ex = BAI_THEO_ID.get(e.ex);
    const dem = e.dem || ex.dem;
    const giay = dem.kieu === 'giay';
    const truoc = lichSuBai(S.dsBuoi(), e.ex, laSua ? buoi.id : null).filter((l) => (l.sets || []).some(setHopLe));
    const cuoi = truoc[truoc.length - 1];
    const goiY = goiYTangTa(cuoi?.sets, dem, laBaiChan(ex));
    const the = h('div', { class: 'ex-card', 'data-ex': e.ex });
    the.append(h('div', { class: 'ex-head' }, thumb(ex),
      h('div', { class: 'grow' }, h('h3', {}, h('a', { href: `#/thu-vien/${ex.id}` }, ex.ten)), h('div', { class: 'sub' }, `Mục tiêu: ${moTaDem(dem)}`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Xóa bài ${ex.ten}`, 'data-testid': 'xoa-bai', onclick: () => { const gocBai = buoi.bai.splice(i, 1)[0]; luuNgay(); ve(); toast(`Đã xóa ${ex.ten}.`, { hoanTac: () => { buoi.bai.splice(i, 0, gocBai); luuNgay(); ve(); } }); } }, '✕')));
    const nen = thieuBaiNen(e.ex, S.dsBuoi().filter((b) => b.id !== buoi.id));
    if (nen && BAI_THEO_ID.get(nen)) the.append(h('div', { class: 'note warn', 'data-testid': 'thieu-nen' }, h('b', {}, 'Nên làm bài nền trước: '), `${BAI_THEO_ID.get(nen).ten}. Nhật ký của bạn chưa có bài này; hãy tập bài nền vài buổi rồi mới làm bài ${ex.ten.toLowerCase()}.`));
    if (ex.mucDo >= 3) the.append(h('div', { class: 'hint' }, 'Bài khó: bắt đầu nhẹ, ít hiệp, tăng dần qua nhiều tuần.'));
    the.append(h('div', { class: 'lan-truoc' }, cuoi ? `Lần trước (${ngayVN(cuoi.ngay)}): ${mocHiep(cuoi.sets)}` : 'Chưa có lần trước. Chọn mức nhẹ để học đúng form.'));
    if (goiY.loai !== 'moi') {
      const ap = ['tang-ta', 'giam'].includes(goiY.loai) ? h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'ap-goi-y', onclick: () => { e.sets.forEach((s) => { if (!s.xong && !s.tay) { s.ph = { ...(s.ph || {}), kg: goiY.kg }; if (goiY.lan && goiY.loai === 'tang-ta') s.ph.lan = goiY.lan; } }); luuNgay(); ve(); } }, 'Áp dụng') : null;
      the.append(h('div', { class: 'goi-y', 'data-testid': 'goi-y' }, h('b', {}, 'Gợi ý: '), goiY.ly, ' (chỉ là gợi ý, hãy nghe cơ thể.) ', ap));
    }
    const sets = h('div', { class: 'sets' });
    sets.append(h('div', { class: `set-h${giay ? ' giay' : ''}`, 'aria-hidden': 'true' }, h('span', {}, 'Hiệp'), ...(giay ? [h('span', {}, 'Giây')] : [h('span', {}, 'Lần'), h('span', {}, 'Kg')]), h('span', {}, 'RPE'), h('span', {}, 'Xong')));
    e.sets.forEach((s, j) => {
      const ghiGiaTri = (k, el, nguyen) => el.addEventListener('input', () => {
        let v = so(el.value);
        if (v !== null && k === 'rpe') v = kepRPE(v);
        s[k] = v === null ? null : (nguyen ? Math.round(v) : v);
        s.tay = setHopLe(s);
        luuNhap();
      });
      const mkIn = (k, nhan, mode, goiPh) => {
        const g = s.ph && s.ph[k] != null ? String(s.ph[k]).replace('.', ',') : null;
        const el = h('input', { type: 'text', inputmode: mode, autocomplete: 'off', 'aria-label': `${nhan} hiệp ${j + 1}, ${ex.ten}`, 'data-f': k, value: s[k] ?? '', placeholder: g || goiPh || '' });
        ghiGiaTri(k, el, k !== 'kg');
        if (k === 'rpe') el.addEventListener('blur', () => { if (s.rpe != null) el.value = String(s.rpe); });
        return el;
      };
      const nutXong = h('button', { type: 'button', class: 'done', 'aria-pressed': String(!!s.xong), 'aria-label': `Hoàn thành hiệp ${j + 1}`, 'data-testid': 'set-xong', onclick: () => {
        if (!s.xong) {
          // Lấy giá trị gợi ý (nếu có) cho ô còn trống; không có gì thì không cho đánh dấu xong
          if (giay) { if (!(s.giay > 0) && s.ph && s.ph.giay > 0) s.giay = s.ph.giay; } else { if (!(s.lan > 0) && s.ph && s.ph.lan > 0) s.lan = s.ph.lan; if (!(s.kg > 0) && s.ph && s.ph.kg > 0) s.kg = s.ph.kg; }
          if (!setHopLe(s)) { toast(giay ? 'Nhập số giây trước khi bấm xong.' : 'Nhập số lần trước khi bấm xong.'); return; }
          s.xong = true;
        } else s.xong = false;
        if (s.xong) {
          const kq = kiemTraPR(truoc, s);
          s.pr = kq;
          if (cd().nghiMacDinh > 0 && !laSua) rest.bat(cd().nghiMacDinh, ex.ten);
        } else s.pr = [];
        luuNgay(); ve();
      } }, s.xong ? '✓' : '○');
      sets.append(h('div', { class: `set${giay ? ' giay' : ''}`, 'data-set': j },
        h('span', { class: 'no' }, String(j + 1)),
        ...(giay ? [mkIn('giay', 'Số giây', 'numeric', String(dem.giayMin))] : [mkIn('lan', 'Số lần', 'numeric', `${dem.lanMin}-${dem.lanMax}`), mkIn('kg', 'Mức tạ kg', 'decimal', 'kg')]),
        mkIn('rpe', 'RPE', 'decimal', '1-10'),
        nutXong));
      if (s.xong && s.pr && s.pr.length) sets.append(h('div', { class: 'pr', role: 'status', 'data-testid': 'pr' }, `Kỷ lục mới: ${s.pr.map((p) => ({ kg: 'mức tạ', e1rm: 'sức mạnh ước tính', lan: 'số lần', giay: 'thời gian' }[p])).join(', ')}`));
    });
    the.append(sets);
    the.append(h('div', { class: 'ex-act' },
      h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'them-hiep', onclick: () => { const l = e.sets[e.sets.length - 1]; e.sets.push(l ? { ...l, xong: false, tay: false, rpe: null, pr: [], lan: null, kg: null, giay: null, ph: l.ph || { lan: l.lan ?? null, kg: l.kg ?? null, giay: l.giay ?? null } } : setTrong(dem)); luuNgay(); ve(); } }, '+ Hiệp'),
      e.sets.some((s) => s.ph && !s.tay && !s.xong) ? h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'dien-lan-truoc', onclick: () => { e.sets.forEach((s) => { if (!s.xong && !s.tay && s.ph) { if (s.ph.lan != null) s.lan = s.ph.lan; if (s.ph.kg != null) s.kg = s.ph.kg; if (s.ph.giay != null) s.giay = s.ph.giay; s.tay = setHopLe(s); } }); luuNgay(); ve(); } }, 'Điền như lần trước') : null,
      e.sets.length > 1 ? h('button', { type: 'button', class: 'btn sm ghost', 'data-testid': 'bot-hiep', onclick: () => { const bo = e.sets.pop(); luuNgay(); ve(); toast('Đã bỏ hiệp cuối.', { hoanTac: () => { e.sets.push(bo); luuNgay(); ve(); } }); } }, '− Hiệp') : null));
    return the;
  }
  const cd = () => caiDat();

  async function huyBuoi() {
    const co = buoi.bai.some((e) => hiepDaLam(e.sets).length);
    if (!laSua && co) {
      const ok = await hoi('Bỏ buổi đang ghi?', 'Những gì đã nhập sẽ bị xóa.', { ok: 'Bỏ buổi', huy: 'Giữ lại', nguy: true });
      if (!ok) return;
    }
    daDong = true; clearTimeout(hen);
    if (!laSua) { await S.xoaNhap(); rest.dung(); }
    location.hash = laSua ? '#/tap/lich-su' : '#/tap';
  }

  async function ketThuc() {
    const hopLe = buoi.bai.map((e) => ({ ...e, sets: hiepDaLam(e.sets).map((s) => { const { xong, pr, tay, ph, ...r } = s; void xong; void pr; void tay; void ph; return r; }) })).filter((e) => e.sets.length);
    if (!hopLe.length) {
      toast('Chưa có hiệp nào hoàn thành. Bấm xong hoặc nhập số lần (hoặc giây) trước khi lưu.');
      return;
    }
    const troi = (Date.now() - (buoi.bd || Date.now())) / 60000;
    // Không đoán thời lượng từ lúc tạo nháp nếu đã bỏ dở quá lâu: bắt người dùng nhập
    const phutMacDinh = buoi.phut || (troi <= 180 ? Math.max(1, Math.round(troi)) : null);
    const kq = await hopThoai(laSua ? 'Lưu thay đổi' : 'Kết thúc buổi tập', (dong) => {
      const phut = h('input', { type: 'text', inputmode: 'numeric', id: 'k-phut', value: phutMacDinh ? String(phutMacDinh) : '', 'data-testid': 'k-phut', 'aria-label': 'Thời lượng phút' });
      const loiPhut = h('div', { class: 'hint', role: 'alert', 'data-testid': 'k-phut-loi' }, phutMacDinh ? '' : 'Buổi này đã mở từ lâu. Hãy nhập số phút bạn thật sự tập.');
      let rpe = buoi.rpe || null;
      const lbl = h('div', { class: 'hint', 'data-testid': 'rpe-lbl' }, rpe ? '' : 'Bỏ trống thì 9fit ước tính RPE 5 khi tính tải.');
      const MOTA = { 1: 'Rất nhẹ', 2: 'Nhẹ', 3: 'Nhẹ', 4: 'Hơi nhẹ', 5: 'Vừa', 6: 'Khá', 7: 'Nặng', 8: 'Rất nặng', 9: 'Gần tối đa', 10: 'Tối đa' };
      const ds = chips(Array.from({ length: 10 }, (_, k) => ({ v: k + 1, t: String(k + 1) })), rpe || '', (v) => { rpe = Number(v); lbl.textContent = `RPE ${v}: ${MOTA[v]}`; }, 'RPE của buổi');
      return [
        h('div', { class: 'field' }, h('label', { for: 'k-phut' }, 'Thời lượng (phút)'), phut, loiPhut),
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Mức nỗ lực cả buổi (RPE 1-10)'), ds, lbl),
        h('div', { class: 'modal-act' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => dong(undefined) }, 'Quay lại'),
          h('button', { type: 'button', class: 'btn', 'data-testid': 'luu-buoi', onclick: () => { const p = so(phut.value); if (!(p > 0) || p > 600) { loiPhut.textContent = 'Nhập số phút từ 1 đến 600.'; phut.focus(); return; } dong({ phut: Math.round(p), rpe }); } }, 'Lưu buổi tập')),
      ];
    });
    if (!kq) return;
    const luu = { id: laSua ? buoi.id : buoi.id, ngay: buoi.ngay, ten: (buoi.ten || 'Buổi tập').trim() || 'Buổi tập', bd: buoi.bd, phut: kq.phut, rpe: kq.rpe, ghiChu: buoi.ghiChu || '', bai: hopLe, ct: buoi.ct || null };
    daDong = true; clearTimeout(hen);
    await S.luuBuoi(luu);
    if (!laSua) {
      await S.xoaNhap(); rest.dung();
      if (buoi.ct) { const kh = S.layKeHoach(); if (kh) { kh.xong = kh.xong || {}; kh.xong[buoi.ct] = luu.id; await S.luuKeHoach(kh); } }
    }
    const t = tomTatBuoi(luu);
    const prs = [];
    hopLe.forEach((e) => { const ls = lichSuBai(S.dsBuoi(), e.ex, luu.id).filter((l) => (l.sets || []).some(setHopLe)); if (ls.length) e.sets.forEach((s) => { const k = kiemTraPR(ls, s); if (k.length) prs.push(`${BAI_THEO_ID.get(e.ex).ten}: ${mocHiep([s])}`); }); });
    await hopThoai('Đã lưu buổi tập', (dong) => [
      h('div', { class: 'grid3' },
        h('div', { class: 'stat' }, h('b', { 'data-testid': 'sum-hiep' }, String(t.sets)), h('span', {}, 'hiệp')),
        h('div', { class: 'stat' }, h('b', { 'data-testid': 'sum-kg' }, soVN(Math.round(t.kg))), h('span', {}, 'kg khối lượng')),
        h('div', { class: 'stat' }, h('b', { 'data-testid': 'sum-tai' }, soVN(t.tai)), h('span', {}, 'tải (RPE×phút)'))),
      prs.length ? h('div', { class: 'note ok' }, h('b', {}, 'Kỷ lục mới: '), [...new Set(prs)].join('; ')) : null,
      t.uoc ? h('div', { class: 'hint' }, 'Chưa có RPE nên tải được ước tính với RPE 5.') : null,
      h('div', { class: 'modal-act' }, h('button', { type: 'button', class: 'btn', 'data-testid': 'xong-tom-tat', onclick: () => dong(true) }, 'Xong')),
    ]);
    location.hash = '#/';
  }

  ve();
  const xaNhap = () => { clearTimeout(hen); if (!laSua && !daDong) S.luuNhap(buoi); };
  const khiAn = () => { if (document.visibilityState === 'hidden') xaNhap(); };
  window.addEventListener('pagehide', xaNhap);
  document.addEventListener('visibilitychange', khiAn);
  return () => { window.removeEventListener('pagehide', xaNhap); document.removeEventListener('visibilitychange', khiAn); xaNhap(); };
}
