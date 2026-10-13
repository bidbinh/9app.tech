// Tự trải nghiệm: 3 người dùng giả lập làm trọn các luồng bằng trình duyệt thật (gõ, bấm như người thật). In ra số liệu để soát và chụp ảnh persona-*.png.
import * as L from './lib-e2e.js';

const { sleep, go, bam, bamChu, di, mo, chup, chu, chuTatCa, trangMoi, state, khongCuonNgang } = L;
await L.khoiDong();
const nhat = [];
const ghi = (ai, s) => { nhat.push(`[${ai}] ${s}`); console.log(`[${ai}] ${s}`); };
const chuA = (p, s) => chu(p, s).catch(() => '(không có)');
const loiTrang = () => L.problems.forEach((x) => console.log('PROBLEM', x));
async function taps(p) { return p.evaluate(() => window.__taps || 0); }
async function dem(p) { await p.evaluateOnNewDocument(() => { window.__taps = 0; document.addEventListener('click', () => { window.__taps++; }, true); }); }
async function kiem(p, ai, nhan) {
  await khongCuonNgang(p, nhan);
  const a = await L.kiemTraKichThuoc(p); if (a.length) ghi(ai, `KÍCH THƯỚC ${nhan}: ${[...new Set(a)].slice(0, 4).join(' ; ')}`);
}

// ---------- 1. Minh, 24 tuổi, lương 12 triệu, độc thân ----------
{
  const ai = 'Minh';
  const p = await trangMoi('minh'); await dem(p); await mo(p);
  await chup(p, 'persona-minh-01-mo-lan-dau');
  await bamChu(p, 'Tính từ gross');
  await go(p, '#o-chinh', '12000000'); await sleep(300);
  ghi(ai, 'Gross 12tr -> ' + await chuA(p, '[data-testid=kq-chinh]') + ' | ' + await chuA(p, '[data-testid=kq-phu]'));
  await chup(p, 'persona-minh-02-luong');
  await bam(p, '[data-testid=dung-cho-tien]');
  await di(p, '#/');
  ghi(ai, 'Hôm nay (chưa nhập ngày lương, mặc định ngày 1): ' + (await chuA(p, '[data-testid=con-lai]')));
  for (const c of ['cà phê 35k', 'cơm tấm 45k', 'grab 60k', 'trà sữa 55k', 'ăn tối với bạn 220k', 'Netflix 260k']) { await go(p, '.voice-in', c); await p.keyboard.press('Enter'); await sleep(250); }
  ghi(ai, 'Sau 6 khoản: ' + await chuA(p, '[data-testid=con-lai]') + ' | ' + (await chuA(p, '.note[role=status]')));
  await chup(p, 'persona-minh-03-hom-nay');
  await di(p, '#/tien/cai-dat');
  await go(p, '#cd-ten', 'Thuê phòng'); await go(p, '#cd-tien', '3tr'); await bam(p, '[data-testid=them-co-dinh]');
  await di(p, '#/tien'); await chup(p, 'persona-minh-04-tien');
  ghi(ai, 'Tiền: ' + (await chuA(p, '[data-hu=thiet-yeu]')));
  await di(p, '#/muctieu'); await go(p, '#mt-ten', 'Quỹ dự phòng 3 tháng'); await go(p, '#mt-muc', '30tr');
  await p.evaluate(() => { const i = document.getElementById('mt-han'); i.value = '2027-10-15'; });
  await bam(p, '[data-testid=them-muc-tieu]'); await sleep(300);
  ghi(ai, 'Mục tiêu: ' + await chuA(p, '[data-testid=ds-muc-tieu]'));
  await chup(p, 'persona-minh-05-muctieu');
  await di(p, '#/them/lich'); await chup(p, 'persona-minh-06-lich');
  await kiem(p, ai, 'cuối');
  ghi(ai, `Tổng số lần bấm: ${await taps(p)}`);
  await p.close();
}

// ---------- 2. Hà và Nam, 2 con, lương 35 triệu ----------
{
  const ai = 'Ha-Nam';
  const p = await trangMoi('hanam'); await dem(p); await mo(p);
  await di(p, '#/luong');
  await go(p, '#o-chinh', '35000000');
  await bamChu(p, '+', '.stepper button'); await bamChu(p, '+', '.stepper button'); await sleep(250);
  ghi(ai, 'Gross 35tr, 2 phụ thuộc -> ' + await chuA(p, '[data-testid=kq-chinh]') + ' | ' + await chuA(p, '[data-testid=kq-phu]'));
  ghi(ai, 'So sánh: ' + await chuA(p, '[data-testid=so-sanh-chu]'));
  await chup(p, 'persona-hanam-01-luong');
  await bam(p, '[data-testid=dung-cho-tien]');
  await di(p, '#/tien/cai-dat');
  await bamChu(p, '6 hũ', '.seg button');
  const khoan = [['Thuê nhà', '9tr'], ['Trả góp xe', '3tr'], ['Gửi gia đình', '2tr'], ['Bảo hiểm', '1500000']];
  for (const [t, s] of khoan) { await go(p, '#cd-ten', t); await go(p, '#cd-tien', s); await bam(p, '[data-testid=them-co-dinh]'); await sleep(200); }
  await chup(p, 'persona-hanam-02-cai-dat');
  await di(p, '#/');
  for (const c of ['đi chợ 450k', 'học phí con 3tr5', 'xăng 150k', 'siêu thị 1tr2', 'điện nước 900k', 'biếu ba mẹ 2 triệu']) { await go(p, '.voice-in', c); await p.keyboard.press('Enter'); await sleep(250); }
  ghi(ai, 'Hôm nay: ' + await chuA(p, '[data-testid=con-lai]') + ' | ' + await chuA(p, '.note[role=status]'));
  await chup(p, 'persona-hanam-03-hom-nay');
  await di(p, '#/tien'); await chup(p, 'persona-hanam-04-tien');
  const hu = await chuTatCa(p, '.jar'); hu.forEach((t) => ghi(ai, 'Hũ: ' + t.slice(0, 140)));
  await di(p, '#/muctieu/vay');
for (const [sl, v] of [['#vay-so', '2000000000'], ['#vay-lai', '9.5'], ['#vay-ky', '240']]) { await go(p, sl, v); ghi(ai, 'DBG ' + sl + ' ' + await p.evaluate(() => ['vay-so', 'vay-lai', 'vay-ky'].map((i) => document.getElementById(i).value).join(' | '))); }
await sleep(300);
  if (!(await p.$('[data-testid=vay-ky-dau]'))) ghi(ai, 'LỖI vay: ' + (await chuA(p, '#view')).slice(0, 700));
  ghi(ai, 'Vay 2 tỷ: ' + await chuA(p, '[data-testid=vay-ky-dau]').catch(() => '(không có)') + ' | ' + (await chuA(p, '.note')));
  await chup(p, 'persona-hanam-05-vay');
  await di(p, '#/them/quyettoan'); await sleep(400);
  ghi(ai, 'Quyết toán 2026: ' + await chuA(p, '[data-testid=qt-ket-qua]'));
  await chup(p, 'persona-hanam-06-quyettoan');
  await di(p, '#/them/lich');
  await go(p, '#lich-ten', 'Đóng thẻ tín dụng'); await p.select('#lich-ngay-thang', '20'); await bam(p, '[data-testid=them-nhac]'); await sleep(300);
  await bam(p, '[data-testid=xuat-ics]'); await sleep(400);
  const ics = await p.evaluate(async () => window.__blobs[window.__blobs.length - 1].text());
  ghi(ai, `ICS ${ics.split('BEGIN:VEVENT').length - 1} sự kiện, ${ics.split('BEGIN:VALARM').length - 1} báo thức`);
  await kiem(p, ai, 'cuối');
  ghi(ai, `Tổng số lần bấm: ${await taps(p)}`);
  await p.close();
}

// ---------- 3. Long, lương 80 triệu, thưởng và OT ----------
{
  const ai = 'Long';
  const p = await trangMoi('long'); await dem(p); await mo(p);
  await di(p, '#/luong');
  await go(p, '#o-chinh', '80000000');
  ghi(ai, 'Gross 80tr -> ' + await chuA(p, '[data-testid=kq-chinh]') + ' | ' + await chuA(p, '[data-testid=kq-phu]'));
  await bamChu(p, 'Thêm khoản khác', 'summary');
  await go(p, '#o-an', '1200000'); await go(p, '#o-thuong', '80tr');
  for (let i = 0; i < 3; i++) await p.evaluate(() => { const b = [...document.querySelectorAll('.stepper')].find((s) => s.getAttribute('aria-label').includes('150%')).querySelectorAll('button')[1]; b.click(); });
  for (let i = 0; i < 2; i++) await p.evaluate(() => { const b = [...document.querySelectorAll('.stepper')].find((s) => s.getAttribute('aria-label').includes('200%')).querySelectorAll('button')[1]; b.click(); });
  await sleep(300);
  ghi(ai, 'Thêm thưởng 80tr + OT: ' + await chuA(p, '[data-testid=kq-chinh]') + ' | ' + await chuA(p, '[data-testid=kq-phu]'));
  ghi(ai, 'So sánh: ' + await chuA(p, '[data-testid=so-sanh-chu]'));
  await chup(p, 'persona-long-01-luong');
  await p.$eval('[data-testid=tung-buoc]', (e) => e.scrollIntoView({ block: 'start' })); await chup(p, 'persona-long-02-tung-buoc');
  await bamChu(p, 'Net → Gross', '.seg button'); await go(p, '#o-chinh', '100000000'); await sleep(300);
  ghi(ai, 'Net 100tr (kèm thưởng/OT trên) -> ' + await chuA(p, '[data-testid=kq-chinh]') + ' | ' + await chuA(p, '[data-testid=kq-phu]'));
  await bamChu(p, 'Gross → Net', '.seg button');
  await di(p, '#/them/quyettoan');
  await sleep(300);
  await go(p, '#qt-thuong-cuoi', '80tr'); await sleep(400);
  ghi(ai, 'Quyết toán (gross 80tr x12, thưởng 80tr tháng 12): ' + await chuA(p, '[data-testid=qt-ket-qua]') + ' | ' + (await chuA(p, '[aria-label="Kết quả ước tính"] .small')));
  await chup(p, 'persona-long-03-quyettoan');
  await di(p, '#/muctieu/gui'); await go(p, '#gui-von', '500tr'); await go(p, '#gui-gop', '20tr'); await sleep(300);
  ghi(ai, 'Lãi kép: ' + await chuA(p, '[data-testid=gui-tong]'));
  await kiem(p, ai, 'cuối');
  ghi(ai, `Tổng số lần bấm: ${await taps(p)}`);
  await p.close();
}
loiTrang();
await L.ketThuc();
console.log('\nXong. Ảnh ở shots/persona-*.png');
