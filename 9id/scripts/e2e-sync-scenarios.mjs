// Kịch bản theo từng app cho e2e-sync.mjs: seed(page, tag) thêm một bản ghi mang nhãn tag bằng chính mô-đun của app,
// remove(page, tag) xóa nó, read(page) trả chuỗi mô tả dữ liệu hiện có, confirm(page) bấm nút xác nhận xóa bản trên máy chủ, dataHash là màn có thẻ đồng bộ.
const clickText = async (page, label) => {
  await page.waitForFunction((l) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === l && b.getBoundingClientRect().width > 0), { timeout: 6000 }, label);
  await page.evaluate((l) => { [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === l && b.getBoundingClientRect().width > 0).pop().click(); }, label);
};

export const SCENARIOS = {
  payday: {
    dataHash: '#/them/du-lieu',
    async seed(page, tag) {
      await page.evaluate(async (t) => {
        const m = await import('./js/lib/store.js');
        m.sua((s) => { s.mucTieu.push({ id: 'mt-' + t, ten: t, mucTieu: 1000000, daCo: 0, han: '', laiNam: 5 }); });
        await m.ghiNgay();
      }, tag);
    },
    async remove(page, tag) {
      await page.evaluate(async (t) => {
        const m = await import('./js/lib/store.js');
        m.sua((s) => { s.mucTieu = s.mucTieu.filter((x) => x.ten !== t); });
        await m.ghiNgay();
      }, tag);
    },
    read: (page) => page.evaluate(async () => (await import('./js/lib/store.js')).layState().mucTieu.map((x) => x.ten).join(',')),
    confirm: (page) => clickText(page, 'Xóa bản trên máy chủ'),
  },
  car: {
    dataHash: '#/du-lieu',
    async seed(page, tag) {
      await page.evaluate(async (t) => {
        const m = await import('./js/lib/data.js');
        await m.luuXe({ id: 'xe-demo', ten: 'Xe thử', loai: 'oto', bienSo: '30A-12345', tao: '2026-01-01T00:00:00.000Z', anh: '' });
        await m.luuNhatKy({ id: 'nk-' + t, xeId: 'xe-demo', loai: 'khac', ngay: '2026-10-01', tien: 100000, ghiChu: t }, '2026-10-14');
      }, tag);
    },
    remove: (page, tag) => page.evaluate(async (t) => { await (await import('./js/lib/data.js')).xoaNhatKy('nk-' + t, '2026-10-14'); }, tag),
    read: (page) => page.evaluate(async () => (await import('./js/lib/data.js')).kho.nhatKy.map((x) => x.ghiChu).join(',')),
    confirm: (page) => clickText(page, 'Xóa bản trên máy chủ'),
  },
  fit: {
    dataHash: '#/them/du-lieu',
    seed: (page, tag) => page.evaluate(async (t) => { const S = await import('./js/lib/store.js'); await S.luuChoi({ id: 'c-' + t, ngay: '2026-10-01', mon: t, phut: 30, rpe: 5, ghiChu: '' }); }, tag),
    remove: (page, tag) => page.evaluate(async (t) => { const S = await import('./js/lib/store.js'); await S.xoaChoi('c-' + t); }, tag),
    read: (page) => page.evaluate(async () => (await import('./js/lib/store.js')).dsChoi().map((x) => x.mon).join(',')),
    confirm: (page) => clickText(page, 'Xóa bản trên máy chủ'),
  },
};
