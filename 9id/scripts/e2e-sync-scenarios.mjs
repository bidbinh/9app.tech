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
};
