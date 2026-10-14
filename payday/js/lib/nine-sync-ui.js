// Thẻ "Đồng bộ qua tài khoản 9app" và đồng bộ tự động, dùng chung cho các app chỉ lưu ở máy (spec 2026-10-14-dong-bo-9id-design.md, mục 5).
// Mỗi app chép tệp này vào js/lib/nine-sync-ui.js (nguồn gốc: 9id/public/nine-sync-ui.mjs) và truyền hàm dựng phần tử `h` của app.
// Văn bản người dùng không bao giờ đi vào innerHTML: chỉ dùng `h(tag, attrs, ...kids)` với chuỗi tĩnh.

const gio = (iso) => { try { return new Date(iso).toLocaleString('vi-VN', { hour12: false }); } catch { return ''; } };

/**
 * theDongBo({ h, sync, tenApp, duLieuGom, duLieuKhong, thongBao, xacNhan, lamMoi, dangNhapUrl })
 *  - sync: bộ trả về của createSync
 *  - duLieuGom / duLieuKhong: chuỗi mô tả dữ liệu được/không được đồng bộ (hiện ở màn đồng ý)
 *  - thongBao(msg, loai?), xacNhan(tieuDe, noiDung) -> Promise<boolean>, lamMoi(): vẽ lại app sau khi dữ liệu máy đổi
 */
export function theDongBo({ h, sync, tenApp, duLieuGom, duLieuKhong, thongBao, xacNhan, lamMoi, dangNhapUrl }) {
  const goc = h('section', { class: 'card', 'data-testid': 'the-dong-bo' });
  const noiDung = (...kids) => { while (goc.firstChild) goc.removeChild(goc.firstChild); goc.append(...kids.flat(Infinity).filter(Boolean)); };
  const nut = (text, cls, fn, attrs = {}) => {
    const b = h('button', { type: 'button', class: 'btn ' + (cls || ''), ...attrs }, text);
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true;
      try { await fn(); } finally { b.disabled = false; }
    });
    return b;
  };
  const tieuDe = () => h('h2', {}, 'Đồng bộ qua tài khoản 9app');
  const loiChu = (e) => (e && e.code === 'offline' ? 'Không có mạng, dữ liệu trên máy vẫn nguyên vẹn. Thử lại khi có mạng.'
    : e && e.status === 401 ? 'Phiên đăng nhập đã hết, hãy đăng nhập lại.'
    : e && ['busy', 'khong-luu-ben', 'khac-tai-khoan', 'da-xoa-o-may-khac', 'mat-nhieu', 'khong-luu-nho'].includes(e.code) ? e.message
    : e && e.status === 413 ? 'Dữ liệu quá lớn để đồng bộ.'
    : 'Chưa đồng bộ được, dữ liệu trên máy vẫn nguyên vẹn. Thử lại sau.');

  async function dongBo(thongBaoXong) {
    try {
      const r = await sync.run();
      thongBao(thongBaoXong || 'Đã đồng bộ.');
      if (r.changedLocal) lamMoi();
      else veDaBat();
    } catch (e) {
      thongBao(loiChu(e), 'err');
      if (e && (e.code === 'khac-tai-khoan' || e.code === 'da-xoa-o-may-khac')) ve();   // đồng bộ đã tự tắt: vẽ lại thẻ
    }
  }

  function veChuaDangNhap() {
    noiDung(tieuDe(),
      h('p', {}, `Dùng ${tenApp} trên nhiều máy và không sợ mất dữ liệu khi đổi điện thoại. Không bắt buộc: ${tenApp} vẫn dùng bình thường mà không cần tài khoản.`),
      h('div', { class: 'btn-row' }, nut('Đăng nhập tài khoản 9app', 'primary', () => { location.assign(dangNhapUrl()); }, { 'data-testid': 'dong-bo-dang-nhap' })));
  }
  function veDongY() {
    const o = h('input', { type: 'checkbox', id: 'dong-bo-dong-y', 'data-testid': 'dong-bo-dong-y' });
    const bat = nut('Bật đồng bộ', 'primary', async () => { sync.enable(); await dongBo('Đã bật đồng bộ.'); }, { disabled: true, 'data-testid': 'dong-bo-bat' });
    o.addEventListener('change', () => { bat.disabled = !o.checked; });
    noiDung(tieuDe(),
      h('p', {}, `Khi bật, dữ liệu ${tenApp} của bạn được lưu trên máy chủ 9app, gắn với tài khoản, và tự gộp giữa các máy bạn đăng nhập.`),
      h('ul', { class: 'small' }, h('li', {}, `Được đồng bộ: ${duLieuGom}.`), duLieuKhong ? h('li', {}, `Không đồng bộ (ở lại máy này): ${duLieuKhong}.`) : null,
        h('li', {}, 'Dữ liệu chưa được mã hóa đầu cuối: bản trên máy chủ do 9app giữ, không chia sẻ cho ai khác. Bạn tắt hoặc xóa bản trên máy chủ bất cứ lúc nào.')),
      h('label', { class: 'check', for: 'dong-bo-dong-y' }, o, ' Tôi hiểu và đồng ý lưu dữ liệu trên máy chủ 9app.'),
      h('div', { class: 'btn-row' }, bat));
  }
  function veDaBat() {
    const luc = sync.lastAt();
    noiDung(tieuDe(),
      h('p', { 'data-testid': 'dong-bo-trang-thai' }, luc ? `Đang bật. Đồng bộ gần nhất: ${gio(luc)}.` : 'Đang bật. Chưa đồng bộ lần nào.'),
      h('div', { class: 'btn-row' },
        nut('Đồng bộ ngay', 'primary', () => dongBo(), { 'data-testid': 'dong-bo-ngay' }),
        nut('Tắt đồng bộ', '', async () => { sync.disable(); thongBao('Đã tắt đồng bộ trên máy này. Dữ liệu trên máy giữ nguyên.'); await ve(); }, { 'data-testid': 'dong-bo-tat' }),
        nut('Xóa bản trên máy chủ', 'danger', async () => {
          if (!(await xacNhan('Xóa bản trên máy chủ?', `Bản ${tenApp} lưu trên máy chủ 9app sẽ bị xóa; dữ liệu trên các máy giữ nguyên. Đồng bộ sẽ tắt trên máy này.`))) return;
          try { await sync.deleteRemote(); sync.disable(); thongBao('Đã xóa bản trên máy chủ.'); await ve(); } catch (e) { thongBao(loiChu(e), 'err'); }
        }, { 'data-testid': 'dong-bo-xoa' })));
  }
  async function ve() {
    noiDung(tieuDe(), h('p', { class: 'muted' }, 'Đang kiểm tra tài khoản...'));
    const t = await sync.probe();
    if (t === 'chua-dang-nhap') return veChuaDangNhap();
    if (t === 'loi') return noiDung(tieuDe(), h('p', { class: 'muted' }, 'Đồng bộ chưa dùng được lúc này (mất mạng hoặc dịch vụ tài khoản chưa sẵn sàng). Dữ liệu trên máy không bị ảnh hưởng.'));
    return sync.enabled() ? veDaBat() : veDongY();
  }
  ve();
  return goc;
}

/**
 * Đồng bộ tự động khi mở app và khi quay lại tab (không quá một lần mỗi 60 giây). Chỉ chạy khi đã bật.
 * Lỗi (mất mạng, chưa đăng nhập) bị bỏ qua lặng lẽ: dữ liệu máy là bản gốc. lamMoi() gọi khi dữ liệu máy vừa đổi do gộp.
 */
export function tuDongDongBo(sync, { lamMoi, khoangMs = 60000, doc = (typeof document !== 'undefined' ? document : null) } = {}) {
  let cuoi = 0, dang = false;
  const chay = async () => {
    if (dang || !sync.enabled() || Date.now() - cuoi < khoangMs) return;
    dang = true; cuoi = Date.now();
    try { const r = await sync.run(); if (r.changedLocal && lamMoi) lamMoi(); } catch (e) { console.debug('[dong-bo] không đồng bộ được:', e && e.message); } finally { dang = false; }
  };
  chay();
  if (doc) doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') chay(); });
  return chay;
}
