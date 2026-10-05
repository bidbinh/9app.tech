// e2e trình duyệt thật cho 9payday: node scripts/e2e.js
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib-e2e.js';

const { sleep, assert, chu, chuTatCa, bam, bamChu, go, di, mo, chup, trangMoi, state, khongCuonNgang, problems } = L;
const results = [];
async function step(ten, fn) {
  const t0 = Date.now(), truoc = problems.length;
  try { await fn(); const xau = problems.slice(truoc); if (xau.length) throw new Error('console/mạng: ' + xau.join(' | ')); results.push({ ten, ok: true }); console.log(`  ok   ${ten} (${Date.now() - t0}ms)`); }
  catch (e) { results.push({ ten, ok: false, loi: e.message }); console.log(`  FAIL ${ten}\n       ${e.message.split('\n')[0].slice(0, 500)}`); }
}
const tien = (s) => Number(String(s).replace(/[^\d]/g, ''));

await L.khoiDong();
L.xoaAnh();
let m; // trang di động chính

await step('Tải trang: tiêu đề, manifest, CSP, nút về 9app, không lỗi console', async () => {
  m = await trangMoi('m390');
  await mo(m);
  assert((await m.title()).includes('9payday'), 'tiêu đề');
  assert(await m.$eval('#ve-9app', (a) => a.getAttribute('href')) === 'https://9app.tech/', 'nút về 9app');
  const csp = await m.$eval('meta[http-equiv="Content-Security-Policy"]', (e) => e.content);
  assert(/default-src 'none'/.test(csp) && /script-src 'self'/.test(csp), 'CSP');
  const man = await m.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
  assert(man.icons.length >= 4 && man.icons.some((i) => i.purpose === 'maskable') && man.lang === 'vi', 'manifest');
  const idx = await m.evaluate(() => fetch('search-index.json').then((r) => r.json()));
  assert(Array.isArray(idx) && idx.length >= 10 && idx.every((e) => e.name && e.keywords.length && e.path.startsWith('#/') && e.blurb), 'search-index');
  assert(new Set(idx.map((e) => e.path)).size === idx.length, 'path trùng');
  assert((await m.$$('.nav a')).length === 5, 'thanh dưới 5 mục');
  await khongCuonNgang(m, 'home');
  await chup(m, '01-onboarding-390');
});

await step('Bắt đầu: nhập net 15tr, ngày lương 1, ra bảng điều khiển', async () => {
  await m.click('#o-net, .card input[inputmode="decimal"]');
  await m.type('.card input[inputmode="decimal"]', '15tr');
  await sleep(100);
  assert((await chu(m, '.card .hint')).includes('15.000.000'), 'xem trước số tiền ' + await chu(m, '.card .hint'));
  await m.select('#ngay-luong-on', '1');
  await bam(m, '[data-testid=bat-dau]');
  await m.waitForSelector('[data-testid=con-lai]');
  const st = await state(m);
  assert(st.hoso.net === 15000000 && st.hoso.ngayLuong === 1, JSON.stringify(st.hoso));
  const t = await chu(m, '[data-testid=con-lai]');
  assert(t.includes('7.500.000') || t.includes('15.000.000') || tien(t) > 0, 'còn lại ' + t);
  await khongCuonNgang(m, 'home dashboard');
  await chup(m, '02-hom-nay-390');
});

await step('Ghi nhanh gõ: "cà phê 45k" -> xem trước -> Ghi -> thấy trong danh sách; Hoàn tác', async () => {
  await go(m, '.voice-in', 'cà phê 45k');
  const xem = await chu(m, '.preview');
  assert(xem.includes('45.000') && xem.includes('Cà phê'), 'xem trước: ' + xem);
  await bam(m, '[data-testid=ghi]');
  await m.waitForSelector('.toast');
  assert((await chu(m, '.toast')).includes('Đã ghi'), 'toast');
  await sleep(200);
  let st = await state(m);
  assert(st.chi.length === 1 && st.chi[0].soTien === 45000 && st.chi[0].dm === 'ca-phe', JSON.stringify(st.chi));
  assert(!JSON.stringify(st).includes('cà phê 45k'), 'không được lưu nguyên câu');
  assert((await chuTatCa(m, '[data-testid=gan-day] li')).some((t) => t.includes('45.000')), 'danh sách');
  await bamChu(m, 'Hoàn tác', '.toast button');
  await sleep(300);
  st = await state(m);
  assert(st.chi.length === 0, 'hoàn tác chưa xóa');
});

await step('Ghi nhanh: nhiều câu (tiền nhà 3tr5 hôm qua, grab 85 nghìn), câu lỗi báo thân thiện', async () => {
  await go(m, '.voice-in', 'grab 85 nghìn hôm qua'); await m.keyboard.press('Enter'); await sleep(250);
  await go(m, '.voice-in', 'ăn trưa 2 người 150k'); await m.keyboard.press('Enter'); await sleep(250);
  await go(m, '.voice-in', 'abc xyz'); await m.keyboard.press('Enter'); await sleep(200);
  const err = await chu(m, '.voice-status');
  assert(err.includes('Chưa thấy số tiền'), 'lỗi: ' + err);
  const st = await state(m);
  assert(st.chi.length === 2, 'số khoản ' + st.chi.length);
  const grab = st.chi.find((c) => c.dm === 'di-lai');
  assert(grab && grab.ngay === '2026-10-14' && grab.soTien === 85000, JSON.stringify(grab));
});

await step('Giọng nói (giả lập): nút mic đổi trạng thái nghe -> xử lý (xoay) -> kết quả điền vào ô', async () => {
  await m.evaluate(() => { window.__sr.mode = 'ok'; window.__sr.texto = 'bún bò hai mươi lăm nghìn'; });
  await m.$eval('.mic', (e) => e.scrollIntoView({ block: 'center' }));
  await m.click('.mic');
  await m.waitForSelector('.mic.live', { timeout: 2000 });
  assert((await chu(m, '.voice-status')).includes('Đang nghe'), 'đang nghe');
  assert(await m.$eval('.mic', (e) => e.getAttribute('aria-pressed')) === 'true', 'aria-pressed');
  await L.chup(m, '03-mic-dang-nghe-390');
  await m.waitForSelector('.mic.busy', { timeout: 2000 });
  assert(await m.$('.mic .spin'), 'thiếu spinner');
  assert((await chu(m, '.voice-status')).includes('Đang xử lý'), 'đang xử lý');
  await L.chup(m, '04-mic-dang-xu-ly-390');
  await sleep(1200);
  assert(await m.$eval('.voice-in', (e) => e.value) === 'bún bò hai mươi lăm nghìn', 'điền ô');
  assert((await chu(m, '.preview')).includes('25.000'), 'xem trước');
  assert(!(await m.$('.mic.live')) && !(await m.$('.mic.busy')), 'mic phải về nghỉ');
  await bam(m, '[data-testid=ghi]'); await sleep(300);
  assert((await state(m)).chi.some((c) => c.soTien === 25000 && c.dm === 'an-uong'), 'đã ghi');
});

await step('Giọng nói: lỗi không cho micro, im lặng, và không hỗ trợ', async () => {
  await m.evaluate(() => { window.__sr.mode = 'error:not-allowed'; });
  await m.click('.mic'); await sleep(500);
  assert((await chu(m, '.voice-status')).includes('quyền micro'), 'lỗi quyền: ' + await chu(m, '.voice-status'));
  await m.evaluate(() => { window.__sr.mode = 'silence'; });
  await m.click('.mic'); await sleep(1300);
  assert((await chu(m, '.voice-status')).includes('Chưa nghe rõ'), 'im lặng: ' + await chu(m, '.voice-status'));
  assert(!(await m.$('.mic.live, .mic.busy')), 'mic về nghỉ');
  const k = await trangMoi('khong-sr', { stubSR: false });
  await mo(k);
  await k.evaluate(() => window.P9);
  await k.evaluate(async () => { const { datLai } = await import('./js/lib/store.js'); datLai({ hoso: { net: 15000000, ngayLuong: 1 } }); });
  await sleep(300);
  await k.click('.mic'); await sleep(200);
  assert((await chu(k, '.voice-status')).includes('chưa hỗ trợ'), 'không hỗ trợ');
  assert(await k.$('.mic.off'), 'mic mờ');
  await k.close();
});

await step('Lương: gross 30tr -> net 26.215.000, thuế 635.000, từng bước, so sánh mới/cũ', async () => {
  await di(m, '#/luong');
  await go(m, '#o-chinh', '30tr');
  await sleep(300);
  const chinh = await chu(m, '[data-testid=kq-chinh]');
  assert(tien(chinh) === 26215000, 'net ' + chinh);
  const buoc = (await chuTatCa(m, '[data-testid=tung-buoc] li')).join(' | ');
  assert(buoc.includes('BHXH 8%') && buoc.includes('2.400.000') && buoc.includes('Giảm trừ gia cảnh bản thân') && buoc.includes('15.500.000') && buoc.includes('635.000'), buoc);
  assert(buoc.includes('Luật 109/2025/QH15 Điều 9'), 'thiếu căn cứ điều luật');
  assert(buoc.includes('Đã đối chiếu văn bản gốc') && buoc.includes('Nguồn thứ cấp'), 'thiếu nhãn xác minh');
  const ss = (await chuTatCa(m, '[data-testid=so-sanh] tr')).join(' | ');
  assert(ss.includes('635.000') && ss.includes('1.627.500'), 'so sánh ' + ss);
  assert((await chu(m, '[data-testid=so-sanh-chu]')).includes('992.500'), 'câu so sánh');
  await khongCuonNgang(m, 'luong');
  await chup(m, '05-luong-390');
  await L.chupDay(m, '05b-luong-full-390');
});

await step('Lương: người phụ thuộc, vùng, quy định cũ, net sang gross, thưởng, OT, ăn trưa', async () => {
  await bamChu(m, '+', '.stepper button'); await bamChu(m, '+', '.stepper button');
  await sleep(200);
  assert(tien(await chu(m, '[data-testid=kq-chinh]')) > 26215000, 'phụ thuộc tăng net');
  let st = await state(m); assert(st.luong.phuThuoc === 2);
  // 2 người phụ thuộc, gross 30tr: tntt = 30 - 3.15 - 15.5 - 12.4 = -1.05 => thuế 0, net 26.85tr
  assert(tien(await chu(m, '[data-testid=kq-chinh]')) === 26850000, 'net 2 PT ' + await chu(m, '[data-testid=kq-chinh]'));
  await bamChu(m, 'Cũ ≤2025', '.seg button'); await sleep(250);
  assert((await chu(m, '#view')).includes('không còn áp dụng cho kỳ tính thuế 2026'), 'cảnh báo cũ');
  await bamChu(m, 'Mới 2026', '.seg button');
  await bamChu(m, 'Net → Gross', '.seg button'); await sleep(200);
  await go(m, '#o-chinh', '26850000'); await sleep(300);
  assert(tien(await chu(m, '[data-testid=kq-chinh]')) === 30000000, 'gross từ net ' + await chu(m, '[data-testid=kq-chinh]'));
  await bamChu(m, 'Gross → Net', '.seg button'); await sleep(200);
  await bamChu(m, 'Thêm khoản khác', 'summary');
  await go(m, '#o-thuong', '30tr'); await sleep(250);
  assert((await chu(m, '#view')).includes('Phần thưởng bị thuế bao nhiêu'), 'thưởng');
  await go(m, '#o-an', '1500000'); await sleep(250);
  const buoc = (await chuTatCa(m, '[data-testid=tung-buoc] li')).join(' | ');
  assert(buoc.includes('miễn thuế tối đa 1.200.000') || buoc.includes('730.000'), 'ăn trưa: ' + buoc.slice(0, 300));
  await m.select('#o-vung', '4'); await sleep(200);
  st = await state(m); assert(st.luong.vung === 4 && st.luong.thuong === 30000000 && st.luong.anTrua === 1500000, JSON.stringify(st.luong));
  await m.click('[data-testid=dung-cho-tien]'); await sleep(250);
  assert((await state(m)).hoso.net > 0, 'dùng cho tiền');
  await khongCuonNgang(m, 'luong2');
  await chup(m, '06-luong-nang-cao-390');
});

await step('Lương: trang nguồn quy định hiển thị đủ nhóm và nhãn xác minh', async () => {
  await di(m, '#/luong/nguon');
  const nhom = await m.$$('[data-testid=nguon-nhom]');
  assert(nhom.length >= 5, 'số nhóm ' + nhom.length);
  const t = await chu(m, '#view');
  assert(t.includes('109/2025/QH15') && t.includes('Chưa xác minh') && t.includes('Nguồn thứ cấp'), 'nội dung');
  await chup(m, '07-nguon-390');
});

await step('Tiền: hũ, dự báo, chi tiêu; chỉnh hũ 6 hũ; khoản cố định; số liệu khớp', async () => {
  await di(m, '#/tien/cai-dat');
  await bamChu(m, '6 hũ', '.seg button'); await sleep(200);
  assert((await chu(m, '[data-testid=tong-hu]')).includes('100%'), 'tổng 100%');
  await go(m, '#cd-ten', 'Thuê nhà');
  await go(m, '#cd-tien', '5tr');
  await bam(m, '[data-testid=them-co-dinh]'); await sleep(250);
  assert((await chuTatCa(m, '[data-testid=co-dinh] li')).join().includes('5.000.000'), 'khoản cố định');
  await go(m, '#hu-huong-thu', '40'); await sleep(150);
  assert((await chu(m, '[data-testid=tong-hu]')).includes('130%') || (await chu(m, '[data-testid=tong-hu]')).includes('vượt'), 'tổng vượt: ' + await chu(m, '[data-testid=tong-hu]'));
  await go(m, '#hu-huong-thu', '10');
  await di(m, '#/tien');
  const txt = await chu(m, '#view');
  assert(txt.includes('Dự báo cuối kỳ') && txt.includes('Thiết yếu') && txt.includes('Hưởng thụ') && txt.includes('Học tập'), 'hũ');
  await khongCuonNgang(m, 'tien');
  await chup(m, '08-tien-390');
  await L.chupDay(m, '08b-tien-full-390');
});

await step('Tiền: dự báo theo tốc độ chi (dữ liệu dựng sẵn) và cảnh báo nhẹ nhàng', async () => {
  await m.evaluate(async () => {
    const { datLai } = await import('./js/lib/store.js');
    const chi = [];
    for (let d = 1; d <= 14; d++) chi.push({ id: 'x' + d, ngay: `2026-10-${String(d).padStart(2, '0')}`, soTien: 300000, dm: 'mua-sam' });
    datLai({ hoso: { net: 15000000, ngayLuong: 1 }, chi });
  });
  await di(m, '#/tien'); await sleep(300);
  const dd = await chu(m, '[data-testid=du-bao]');
  assert(/Hơi sát|vượt|Không sao|đi đúng nhịp|dư/.test(dd), dd);
  // hũ hưởng thụ 20% của 15tr = 3tr, đã chi 4,2tr trong 14 ngày -> vượt
  const huong = await chu(m, '[data-hu=huong-thu]');
  assert(huong.includes('Vượt'), 'hũ hưởng thụ phải báo vượt: ' + huong);
  assert(!/lãng phí|tồi|tệ|đáng trách/i.test(await chu(m, '#view')), 'lời lẽ phải nhẹ nhàng');
  await chup(m, '09-tien-vuot-390');
});

await step('Mục tiêu: thêm mục tiêu, số cần để dành mỗi tháng; xóa và hoàn tác', async () => {
  await di(m, '#/muctieu');
  await go(m, '#mt-ten', 'Quỹ dự phòng');
  await go(m, '#mt-muc', '120tr');
  await m.evaluate(() => { const i = document.getElementById('mt-han'); i.value = '2028-10-15'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await bam(m, '[data-testid=them-muc-tieu]'); await sleep(300);
  const t = await chu(m, '[data-testid=ds-muc-tieu]');
  assert(t.includes('Quỹ dự phòng') && t.includes('Cần để dành') && t.includes('24 tháng'), t);
  assert(t.includes('4.764.567') || t.includes('4.76'), 'số tiền mỗi tháng ' + t);
  await khongCuonNgang(m, 'muctieu');
  await chup(m, '10-muctieu-390');
  await bamChu(m, 'Xóa', '[data-testid=ds-muc-tieu] button'); await sleep(200);
  assert((await state(m)).mucTieu.length === 0);
  await bamChu(m, 'Hoàn tác', '.toast button'); await sleep(250);
  assert((await state(m)).mucTieu.length === 1, 'hoàn tác mục tiêu');
});

await step('Vay: 1 tỷ, 9%, 240 tháng; trả nợ sớm; lưu khoản vay; thêm vào cố định', async () => {
  await di(m, '#/muctieu/vay');
  await go(m, '#vay-so', '1000000000');
  await go(m, '#vay-lai', '9'); await go(m, '#vay-ky', '240'); await sleep(300);
  const kd = tien(await chu(m, '[data-testid=vay-ky-dau]'));
  assert(Math.abs(kd - 8997259) <= 3, 'PMT ' + kd);
  await go(m, '#ts-tien', '200tr'); await sleep(300);
  assert((await chu(m, '[data-testid=tra-som]')).includes('Tiết kiệm được'), 'trả sớm: ' + await chu(m, '[data-testid=tra-som]'));
  await go(m, '#vay-ten', 'Vay mua nhà');
  await bam(m, '[data-testid=luu-vay]'); await sleep(300);
  assert((await state(m)).vay.length === 1, 'lưu vay');
  assert(tien(await chu(m, '[data-testid=vay-ky-dau]')) === kd, 'form không được xóa sau khi lưu');
  await bamChu(m, 'Thêm vào khoản cố định', 'button'); await sleep(250);
  assert((await state(m)).coDinh.some((c) => c.ten === 'Trả Vay mua nhà'), 'cố định');
  await khongCuonNgang(m, 'vay');
  await chup(m, '11-vay-390');
});

await step('Gửi lãi kép: 100tr + 5tr/tháng, 6%/năm, 5 năm', async () => {
  await di(m, '#/muctieu/gui');
  await go(m, '#gui-von', '100tr'); await go(m, '#gui-gop', '5tr'); await sleep(300);
  const tong = tien(await chu(m, '[data-testid=gui-tong]'));
  const im = Math.pow(1.005, 1) - 1; let s = 1e8; for (let i = 0; i < 60; i++) s = s * (1 + im) + 5e6;
  assert(Math.abs(tong - Math.round(s)) <= 2, `tổng ${tong} vs ${Math.round(s)}`);
  await chup(m, '12-gui-390');
});

await step('Quyết toán: 12 tháng gross 30tr năm 2026 -> hoàn 1.905.000; checklist lưu; hạn nộp có nguồn', async () => {
  await di(m, '#/luong'); await go(m, '#o-chinh', '30tr');
  await m.evaluate(async () => { const { sua } = await import('./js/lib/store.js'); sua((s) => { s.luong.phuThuoc = 0; s.luong.thuong = 0; s.luong.anTrua = 0; s.luong.vung = 1; }, { im: true }); });
  await di(m, '#/them/quyettoan');
  await sleep(400);
  const kq = await chu(m, '[data-testid=qt-ket-qua]');
  assert(tien(kq) === 1905000, 'hoàn ' + kq);
  const txt = await chu(m, '#view');
  assert(txt.includes('136.200.000') && txt.includes('7.620.000'), 'chi tiết');
  assert(txt.includes('31/03/2027') && txt.includes('30/04/2027') && txt.includes('Chưa xác minh'), 'hạn nộp');
  await go(m, '#qt-khau-tru', '7000000'); await sleep(300);
  assert((await chu(m, '#view')).includes('Còn phải nộp thêm') || (await chu(m, '#view')).includes('phải nộp thêm'), 'nộp thêm');
  await m.evaluate(() => document.querySelector('[data-testid=checklist] input').click()); await sleep(300);
  assert((await state(m)).quyetToan.checklist['ct-khautru'] === true, 'checklist');
  await bamChu(m, 'Thêm nhắc hạn này vào Lịch'); await sleep(250);
  assert((await state(m)).lich.some((x) => x.id === 'qt-2026'), 'nhắc hạn');
  await khongCuonNgang(m, 'quyettoan');
  await chup(m, '13-quyettoan-390');
});

await step('Lịch: thêm nhắc thẻ ngày 25, hiện trong app khi đến hạn, xuất .ics có VALARM', async () => {
  await di(m, '#/them/lich');
  await go(m, '#lich-ten', 'Đóng thẻ Vietcombank');
  await m.select('#lich-loai', 'the');
  await m.select('#lich-ngay-thang', '18'); // 15/10 giả định hôm nay: còn 3 ngày
  await bam(m, '[data-testid=them-nhac]'); await sleep(300);
  const ds = await chu(m, '[data-testid=ds-lich]');
  assert(ds.includes('Đóng thẻ Vietcombank') && ds.includes('Còn 3 ngày'), ds);
  await bam(m, '[data-testid=xuat-ics]'); await sleep(400);
  const ics = await m.evaluate(async () => await window.__blobs[window.__blobs.length - 1].text());
  assert(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.includes('BEGIN:VALARM') && ics.includes('Đóng thẻ Vietcombank') && ics.includes('RRULE:FREQ=MONTHLY') && ics.includes('TRIGGER:'), ics.slice(0, 300));
  fs.writeFileSync(path.join(L.GOC, 'shots', '_mau.ics'), ics);
  await di(m, '#/');
  assert((await chu(m, '#view')).includes('Cần nhớ') && (await chu(m, '#view')).includes('Đóng thẻ Vietcombank'), 'nhắc trong app');
  await di(m, '#/them/lich');
  await chup(m, '14-lich-390');
});

await step('Dữ liệu của tôi: xuất JSON, xóa sạch cần gõ XÓA, nhập lại khớp', async () => {
  await di(m, '#/them/du-lieu');
  const truoc = await state(m);
  await bam(m, '[data-testid=xuat-json]'); await sleep(400);
  const json = await m.evaluate(async () => await window.__blobs[window.__blobs.length - 1].text());
  const o = JSON.parse(json);
  assert(o.ung_dung === '9payday' && o.du_lieu.hoso.net === truoc.hoso.net, 'xuất');
  await bam(m, '[data-testid=xoa-sach]'); await sleep(250);
  assert(await m.$eval('[data-testid=xoa-xac-nhan]', (b) => b.disabled), 'nút xóa phải bị khóa');
  await m.type('#xoa-go', 'xóa'); await sleep(100);
  await bam(m, '[data-testid=xoa-xac-nhan]'); await sleep(500);
  let st = await state(m);
  assert(st.hoso.net === 0 && st.chi.length === 0 && st.mucTieu.length === 0, 'đã xóa');
  // nhập lại qua ô chọn tệp
  const tmp = path.join(L.GOC, 'shots', '_sao-luu.json'); fs.writeFileSync(tmp, json);
  const input = await m.$('#nhap-tep');
  await input.uploadFile(tmp); await sleep(400);
  await m.waitForSelector('dialog[open]');
  await bamChu(m, 'Nhập và thay thế', 'dialog button'); await sleep(600);
  st = await state(m);
  assert(st.hoso.net === truoc.hoso.net && st.mucTieu.length === truoc.mucTieu.length && st.lich.length === truoc.lich.length, 'nhập lại khớp');
  // tệp sai
  fs.writeFileSync(tmp, '{"khong":"phai"}');
  await (await m.$('#nhap-tep')).uploadFile(tmp); await sleep(400);
  assert((await chu(m, '#view')).includes('không phải tệp sao lưu'), 'từ chối tệp sai');
  fs.rmSync(tmp);
  await chup(m, '15-du-lieu-390');
});

await step('Dữ liệu còn sau khi tải lại trang (IndexedDB)', async () => {
  const truoc = await state(m);
  await L.flush(m);
  await m.reload({ waitUntil: 'load' }); await m.waitForSelector('#view > *'); await sleep(300);
  const sau = await state(m);
  assert(sau.hoso.net === truoc.hoso.net && sau.mucTieu.length === truoc.mucTieu.length, 'mất dữ liệu sau tải lại');
});

await step('Chữ lớn: bật rồi vẫn không tràn ngang; kích thước chữ tăng', async () => {
  await di(m, '#/');
  const truoc = await m.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await m.click('#nut-chu-lon'); await sleep(250);
  const sau = await m.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  assert(sau > truoc, `font ${truoc} -> ${sau}`);
  for (const h of ['#/', '#/luong', '#/tien', '#/muctieu/vay', '#/them/quyettoan']) { await di(m, h); await khongCuonNgang(m, 'chữ lớn ' + h); }
  await di(m, '#/luong'); await chup(m, '16-chu-lon-390');
  await m.click('#nut-chu-lon'); await sleep(200);
});

await step('Kích thước chạm >= 44px và chữ >= 14px trên mọi màn (390px, sáng)', async () => {
  const tat = [];
  for (const h of ['#/', '#/luong', '#/tien', '#/tien/cai-dat', '#/muctieu', '#/muctieu/vay', '#/muctieu/gui', '#/them', '#/them/quyettoan', '#/them/lich', '#/them/du-lieu', '#/luong/nguon', '#/them/gioi-thieu']) {
    await di(m, h); await sleep(200);
    const loi = await L.kiemTraKichThuoc(m);
    loi.forEach((l) => tat.push(`${h}: ${l}`));
  }
  assert(!tat.length, [...new Set(tat)].slice(0, 12).join('\n       '));
});

await step('Tương phản AA (sáng và tối) trên mọi màn', async () => {
  const tat = [];
  for (const dark of [false, true]) {
    const p = await trangMoi('tuong-phan-' + dark, { dark });
    await mo(p);
    await p.evaluate(async () => { const { datLai } = await import('./js/lib/store.js'); datLai({ hoso: { net: 15000000, ngayLuong: 1 }, luong: { gross: 30000000, thuong: 5000000, anTrua: 1500000 }, chi: [{ id: 'a', ngay: '2026-10-03', soTien: 4000000, dm: 'mua-sam' }, { id: 'b', ngay: '2026-10-04', soTien: 50000, dm: 'an-uong' }], mucTieu: [{ id: 'g', ten: 'Du lịch', mucTieu: 30000000, daCo: 5000000, han: '2027-06-01', laiNam: 5 }] }); });
    for (const h of ['#/', '#/luong', '#/tien', '#/tien/cai-dat', '#/muctieu', '#/muctieu/vay', '#/muctieu/gui', '#/them', '#/them/quyettoan', '#/them/lich', '#/them/du-lieu', '#/luong/nguon']) {
      await di(p, h); await sleep(200);
      (await L.kiemTraTuongPhan(p)).forEach((l) => tat.push(`${dark ? 'tối' : 'sáng'} ${h}: ${l}`));
    }
    await p.close();
  }
  assert(!tat.length, [...new Set(tat)].slice(0, 15).join('\n       '));
});

await step('Ảnh chụp: 3 cỡ x sáng/tối cho các màn chính, không tràn ngang, không lỗi console', async () => {
  for (const view of ['m390', 'm360', 'd1280']) for (const dark of [false, true]) {
    const p = await trangMoi(`${view}-${dark ? 'toi' : 'sang'}`, { view, dark });
    await mo(p);
    await p.evaluate(async () => { const { datLai } = await import('./js/lib/store.js'); datLai({ hoso: { net: 24000000, ngayLuong: 5 }, luong: { gross: 30000000, che: 'gross', phuThuoc: 1 }, coDinh: [{ id: 'n', ten: 'Thuê nhà', soTien: 6000000, hu: 'thiet-yeu' }], chi: [{ id: 'a', ngay: '2026-10-08', soTien: 45000, dm: 'ca-phe' }, { id: 'b', ngay: '2026-10-09', soTien: 350000, dm: 'an-uong' }, { id: 'c', ngay: '2026-10-12', soTien: 1200000, dm: 'mua-sam' }, { id: 'd', ngay: '2026-10-14', soTien: 85000, dm: 'di-lai' }], mucTieu: [{ id: 'g', ten: 'Quỹ dự phòng', mucTieu: 90000000, daCo: 20000000, han: '2027-10-15', laiNam: 5 }] }); });
    for (const [h, ten] of [['#/', 'hom-nay'], ['#/luong', 'luong'], ['#/tien', 'tien'], ['#/muctieu', 'muctieu'], ['#/them/quyettoan', 'quyettoan'], ['#/them', 'them']]) {
      await di(p, h); await sleep(250);
      await khongCuonNgang(p, `${view} ${h}`);
      if (view === 'm390' || ['hom-nay', 'luong', 'tien'].includes(ten)) await chup(p, `${view}-${dark ? 'toi' : 'sang'}-${ten}`);
    }
    await p.close();
  }
});

await step('Ngoại tuyến: service worker lưu vỏ, tải lại khi mất mạng vẫn chạy', async () => {
  const p = await trangMoi('offline', { hanChe: ['sw.js'] });
  await mo(p);
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  await sleep(1200);
  const cached = await p.evaluate(async () => (await caches.keys()).length);
  assert(cached >= 1, 'chưa có cache');
  await p.setOfflineMode(true);
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('#view > *'); await sleep(400);
  assert((await p.title()).includes('9payday'), 'tải offline');
  await di(p, '#/luong');
  assert((await chu(p, '#view')).includes('Gross'), 'màn Lương offline');
  await p.setOfflineMode(false);
  await p.close();
});

await step('Không lưu được (IndexedDB bị chặn): app vẫn chạy và báo rõ', async () => {
  const p = await trangMoi('khong-luu');
  await p.evaluateOnNewDocument(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  await mo(p);
  assert(await p.$('[data-testid=khong-luu-duoc]'), 'thiếu cảnh báo');
  await p.type('.card input[inputmode="decimal"]', '12tr'); await bam(p, '[data-testid=bat-dau]'); await sleep(300);
  assert(await p.$('[data-testid=con-lai]'), 'vẫn dùng được');
  await p.close();
});

await step('Máy tính để bàn 1280x800: bố cục, không tràn, nav giữa', async () => {
  const p = await trangMoi('d1280', { view: 'd1280' });
  await mo(p);
  await p.evaluate(async () => { const { datLai } = await import('./js/lib/store.js'); datLai({ hoso: { net: 24000000, ngayLuong: 5 } }); });
  await di(p, '#/luong'); await go(p, '#o-chinh', '45tr'); await sleep(300);
  await khongCuonNgang(p, 'desktop');
  await chup(p, 'd1280-sang-luong-chi-tiet');
  await p.close();
});

await L.ketThuc();
const hong = results.filter((r) => !r.ok);
console.log(`\nKết quả: ${results.length - hong.length}/${results.length} bước đạt.`);
if (hong.length) { hong.forEach((r) => console.log(' - ' + r.ten + ': ' + r.loi.split('\n')[0])); process.exit(1); }
