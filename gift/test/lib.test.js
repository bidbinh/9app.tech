import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { duongSangAm, soNgayThangAm } from '../js/lib/lunar.js';
import { amCua, congNgay, chenhNgay, iso, ngayThuTrongThang, thuTrongTuan } from '../js/lib/ngay.js';
import { lanKeTiep, sapToi, taoIcs, ngayDip } from '../js/lib/nhac.js';
import { tinhNoLe, thongKe, sangCsv, lamSachCsv, goiYDapLe, canDapLe } from '../js/lib/le.js';
import { phanTichCau, phanTichTien } from '../js/lib/cau.js';
import { docOTien, docOTienNoi, tienGon } from '../js/lib/tien.js';
import { timNguoi, timKhoanLe } from '../js/lib/tim.js';
import { QUA, goiYQua, KIENG_KY } from '../js/data/qua.js';
import { LOI_CHUC, layLoiChuc, dienLoi } from '../js/data/loichuc.js';
import { DIP, DIP_LE, QUAN_HE } from '../js/data/dip.js';
import { LAM_SACH, xuat } from '../js/lib/kho.js';

// ---------- Nhắc ngày âm ----------
test('sinh nhật âm 15/8: mỗi năm 2024-2040 đều rơi đúng 15 tháng 8 âm', () => {
  let tu = '2024-01-01';
  for (let y = 2024; y <= 2040; y++) {
    const r = lanKeTiep({ kieu: 'am', ngay: 15, thang: 8 }, tu);
    const a = amCua(r.iso);
    assert.deepEqual([a.ngay, a.thang, a.nhuan], [15, 8, false], `năm ${y}: ${r.iso}`);
    assert.equal(r.namAm, a.nam);
    assert.equal(r.namAm, y);
    tu = congNgay(r.iso, 1);
  }
});

test('ngày âm trong tháng nhuận: nhắc theo tháng thường cùng số (2020 nhuận 4)', () => {
  // Sinh/mất ngày 1 tháng 4 nhuận -> nhắc 1 tháng 4 thường mỗi năm. 2020: 1/4 thường = 23/4/2020.
  const r = lanKeTiep({ kieu: 'am', ngay: 1, thang: 4, nhuan: true }, '2020-01-01');
  assert.equal(r.iso, '2020-04-23');
  const a = amCua(r.iso);
  assert.deepEqual([a.ngay, a.thang, a.nhuan], [1, 4, false]);
  // năm sau vẫn là 1 tháng 4 thường
  const r2 = lanKeTiep({ kieu: 'am', ngay: 1, thang: 4, nhuan: true }, '2020-06-01');
  assert.equal(amCua(r2.iso).thang, 4);
  assert.equal(r2.namAm, 2021);
});

test('mọi tháng nhuận 2000-2040: ngày lặp lại không bao giờ rơi vào tháng nhuận', () => {
  for (let y = 2001; y <= 2040; y++) {
    for (let m = 1; m <= 12; m++) {
      const r = lanKeTiep({ kieu: 'am', ngay: 10, thang: m, nhuan: true }, `${y}-01-01`);
      const a = amCua(r.iso);
      assert.equal(a.nhuan, false, `${r.iso}`);
      assert.equal(a.thang, m);
    }
  }
});

test('ngày 30 âm gặp tháng thiếu: dùng ngày 29 (tháng Chạp 2025 chỉ có 29 ngày)', () => {
  assert.equal(soNgayThangAm(12, 2025), 29);
  const r = lanKeTiep({ kieu: 'am', ngay: 30, thang: 12 }, '2026-01-01');
  assert.equal(r.iso, '2026-02-16');
  assert.equal(r.namAm, 2025);
});

test('ngày 30 âm: duyệt nhiều năm, ngày nhắc là 30 nếu tháng đủ, 29 nếu thiếu', () => {
  for (let m = 1; m <= 12; m++) {
    let tu = '2025-01-01';
    for (let k = 0; k < 14; k++) {
      const r = lanKeTiep({ kieu: 'am', ngay: 30, thang: m }, tu);
      const a = amCua(r.iso);
      const mong = soNgayThangAm(m, r.namAm) === 30 ? 30 : 29;
      assert.deepEqual([a.ngay, a.thang, a.nhuan], [mong, m, false], `${r.iso} tháng ${m}`);
      tu = congNgay(r.iso, 1);
    }
  }
});

test('giỗ ngày 23/12 âm, nhiều năm liên tiếp tăng dần và đúng ngày âm', () => {
  let tu = '2026-01-01'; let truoc = '';
  for (let i = 0; i < 20; i++) {
    const r = lanKeTiep({ kieu: 'am', ngay: 23, thang: 12 }, tu);
    assert.ok(r.iso > truoc);
    const a = amCua(r.iso);
    assert.deepEqual([a.ngay, a.thang], [23, 12]);
    truoc = r.iso; tu = congNgay(r.iso, 1);
  }
});

test('nhắc đúng ngày chọn nếu hôm nay là ngày đó (>=), và sang năm sau nếu đã qua', () => {
  assert.equal(lanKeTiep({ kieu: 'duong', ngay: 5, thang: 10 }, '2026-10-05').iso, '2026-10-05');
  assert.equal(lanKeTiep({ kieu: 'duong', ngay: 5, thang: 10 }, '2026-10-06').iso, '2027-10-05');
});

test('sinh nhật dương 29/2: năm không nhuận nhắc 28/2', () => {
  assert.equal(lanKeTiep({ kieu: 'duong', ngay: 29, thang: 2 }, '2027-01-01').iso, '2027-02-28');
  assert.equal(lanKeTiep({ kieu: 'duong', ngay: 29, thang: 2 }, '2028-01-01').iso, '2028-02-29');
});

test('ngày không hợp lệ không làm hỏng', () => {
  assert.equal(lanKeTiep({ kieu: 'duong', ngay: 31, thang: 4 }, '2026-01-01'), null);
  assert.equal(lanKeTiep({ kieu: 'am', ngay: 31, thang: 4 }, '2026-01-01'), null);
  assert.equal(lanKeTiep(null, '2026-01-01'), null);
});

test('dịp lễ: Tết 2027 = 6/2/2027, Ngày của Mẹ 2026 = 10/5, của Cha 2026 = 21/6, Vu Lan và Trung thu 2026', () => {
  const d = (id, y) => ngayDip(DIP_LE.find((x) => x.id === id), y);
  assert.equal(d('tet-nguyen-dan', 2027), '2027-02-06');
  assert.equal(d('tet-nguyen-dan', 2026), '2026-02-17');
  assert.equal(d('ngay-cua-me', 2026), '2026-05-10');
  assert.equal(d('ngay-cua-cha', 2026), '2026-06-21');
  assert.equal(amCua(d('trung-thu', 2026)).thang, 8);
  assert.equal(amCua(d('vu-lan', 2026)).ngay, 15);
  assert.equal(d('quoc-te-phu-nu', 2026), '2026-03-08');
});

test('sapToi: sinh nhật dương, giỗ âm và dịp lễ trong 30 ngày, có nhắc chuẩn bị', () => {
  const people = [
    { id: 'a', ten: 'Mai', sinh: { kieu: 'duong', ngay: 12, thang: 10, nam: 1990 } },
    { id: 'b', ten: 'Ông nội', sinh: null },
  ];
  const dates = [{ id: 'g', personId: 'b', loai: 'gio', kieu: 'am', ngay: 1, thang: 9, nam: 2015 }];
  const ds = sapToi({ people, dates, tu: '2026-10-05', soNgay: 30 });
  const sn = ds.find((e) => e.key === 'sn:a');
  assert.equal(sn.iso, '2026-10-12');
  assert.equal(sn.conLai, 7);
  assert.match(sn.phu, /36 tuổi/);
  const gio = ds.find((e) => e.key === 'd:g');
  assert.ok(gio, 'có giỗ');
  assert.equal(amCua(gio.iso).ngay, 1);
  assert.equal(amCua(gio.iso).thang, 9);
  assert.match(gio.phu, /giỗ lần thứ/);
  assert.ok(ds.every((e, i) => i === 0 || ds[i - 1].iso <= e.iso), 'sắp theo ngày');
  // 20/10 (Phụ nữ VN) bật mặc định, truoc 4: còn 15 ngày -> chưa cần chuẩn bị
  const pn = ds.find((e) => e.dipId === 'phu-nu-vn');
  assert.equal(pn.iso, '2026-10-20');
  assert.equal(pn.canChuanBi, false);
  const sau = sapToi({ people, dates, tu: '2026-10-17', soNgay: 30 }).find((e) => e.dipId === 'phu-nu-vn');
  assert.equal(sau.canChuanBi, true);
  // sinh nhật còn 7 ngày, nhắc trước 3 -> chưa; tu 10/10 -> còn 2 ngày -> có
  assert.equal(sn.canChuanBi, false);
  assert.equal(sapToi({ people, dates: [], tu: '2026-10-10', soNgay: 30 }).find((e) => e.key === 'sn:a').canChuanBi, true);
});

test('sapToi: sinh nhật âm của người sinh tháng nhuận vẫn ra mỗi năm', () => {
  const people = [{ id: 'x', ten: 'Bà', sinh: { kieu: 'am', ngay: 15, thang: 4, nam: 1950, nhuan: true } }];
  let tu = '2026-01-01'; let dem = 0;
  for (let i = 0; i < 12; i++) {
    const e = sapToi({ people, tu, soNgay: 400 }).find((x) => x.key === 'sn:x');
    assert.ok(e, tu);
    assert.equal(amCua(e.iso).thang, 4);
    dem++;
    tu = congNgay(e.iso, 1);
  }
  assert.equal(dem, 12);
});

test('dịp lễ có thể tắt bằng dipBat', () => {
  const ds = sapToi({ people: [], dates: [], dipBat: new Set(['nha-giao']), tu: '2026-11-01', soNgay: 30 });
  assert.deepEqual(ds.map((e) => e.dipId), ['nha-giao']);
});

// ---------- .ics ----------
test('.ics: có VALARM, CRLF, UID duy nhất, dòng gấp không quá 75 octet', () => {
  const people = [{ id: 'a', ten: 'Nguyễn Thị Hồng Nhung Rất Là Dài Cho Chắc Chắn Gấp Dòng', sinh: { kieu: 'am', ngay: 5, thang: 5, nam: 1980 } }];
  const dates = [{ id: 'g', personId: null, ten: 'Ông, bà; nội', loai: 'gio', kieu: 'am', ngay: 3, thang: 3, nam: 2010 }];
  const ev = sapToi({ people, dates, tu: '2026-10-05', soNgay: 400 });
  const ics = taoIcs(ev, { now: new Date('2026-10-05T01:02:03Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'chỉ có CRLF');
  const soEvent = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(soEvent, ev.length);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, soEvent);
  assert.ok((ics.match(/BEGIN:VALARM/g) || []).length >= soEvent);
  const uids = ics.match(/^UID:.*$/gm);
  assert.equal(new Set(uids).size, uids.length);
  for (const dong of ics.split('\r\n')) assert.ok(new TextEncoder().encode(dong).length <= 75, dong);
  assert.match(ics, /DTSTART;VALUE=DATE:\d{8}/);
  assert.match(ics, /TRIGGER:-P\d+DT15H/);
  assert.match(ics, /Ông\\, bà\\; nội/);
  assert.match(ics, /DTSTAMP:20261005T010203Z/);
  // gỡ gấp dòng rồi kiểm tên dài còn nguyên
  const phang = ics.replace(/\r\n /g, '');
  assert.ok(phang.includes('Nguyễn Thị Hồng Nhung Rất Là Dài Cho Chắc Chắn Gấp Dòng'));
});

// ---------- Sổ nợ lễ ----------
const E = (id, huong, ngay, personId, soTien, suKien = 'cuoi', extra = {}) => ({ id, huong, ngay, personId, tenNguoi: '', suKien, soTien, ...extra });

test('sổ nợ lễ: họ mừng mình chưa đáp, mình mừng họ chưa nhận lại', () => {
  const ds = [
    E('1', 'den', '2022-05-01', 'hung', 1000000),         // Hùng mừng mình -> mình chưa đáp
    E('2', 'di', '2023-03-01', 'lan', 500000),            // mình mừng Lan -> Lan chưa mừng lại
    E('3', 'den', '2021-01-01', 'mai', 500000),           // Mai mừng mình
    E('4', 'di', '2024-01-01', 'mai', 1000000, 'tanGia'), // mình đáp Mai -> hết
  ];
  const r = tinhNoLe(ds);
  assert.deepEqual(r.chuaDap.map((e) => e.id), ['1']);
  assert.deepEqual(r.chuaNhan.map((e) => e.id), ['2']);
});

test('sổ nợ lễ: ghép theo thứ tự thời gian, nhiều khoản cùng người', () => {
  const ds = [
    E('a', 'den', '2020-01-01', 'p', 1), E('b', 'den', '2021-01-01', 'p', 1), E('c', 'di', '2022-01-01', 'p', 1),
  ];
  const r = tinhNoLe(ds);
  assert.deepEqual(r.chuaDap.map((e) => e.id), ['b']);
  assert.equal(r.chuaNhan.length, 0);
});

test('sổ nợ lễ: tang lễ không ghép với đám cưới; sinh nhật, lì xì mặc định không tính nợ; khongDap tắt/bật được', () => {
  const ds = [
    E('1', 'den', '2020-01-01', 'p', 1, 'tang'), E('2', 'di', '2021-01-01', 'p', 1, 'cuoi'),
    E('3', 'den', '2020-02-01', 'q', 1, 'sinhNhat'), E('4', 'den', '2020-02-01', 'r', 1, 'liXi'),
    E('5', 'den', '2020-03-01', 's', 1, 'sinhNhat', { khongDap: false }), E('6', 'den', '2020-03-01', 't', 1, 'cuoi', { khongDap: true }),
  ];
  const r = tinhNoLe(ds);
  assert.deepEqual(r.chuaDap.map((e) => e.id).sort(), ['1', '5']);
  assert.deepEqual(r.chuaNhan.map((e) => e.id), ['2']);
  assert.equal(canDapLe(ds[2]), false);
  assert.equal(canDapLe(ds[4]), true);
});

test('sổ nợ lễ: người chưa có trong danh bạ ghép theo tên không dấu', () => {
  const ds = [
    { id: '1', huong: 'den', ngay: '2020-01-01', personId: null, tenNguoi: 'Chị Lan', suKien: 'cuoi', soTien: 1 },
    { id: '2', huong: 'di', ngay: '2021-01-01', personId: null, tenNguoi: 'chi lan', suKien: 'tanGia', soTien: 1 },
    { id: '3', huong: 'den', ngay: '2021-01-01', personId: null, tenNguoi: '', suKien: 'cuoi', soTien: 1 },
  ];
  const r = tinhNoLe(ds);
  assert.equal(r.chuaDap.length, 0);
  assert.equal(r.chuaNhan.length, 0);
});

test('gợi ý đáp lễ: bằng số đã nhận, làm tròn lên 100 nghìn, mức nhập tùy ý', () => {
  assert.deepEqual(goiYDapLe(1250000), { bangSoNhan: 1250000, lamTron: 1300000, muc: null });
  assert.deepEqual(goiYDapLe(1000000, 1500000), { bangSoNhan: 1000000, lamTron: 1000000, muc: 1500000 });
  assert.deepEqual(goiYDapLe(0), { bangSoNhan: 0, lamTron: 0, muc: null });
});

// ---------- Thống kê, CSV ----------
test('thống kê theo năm và theo loại sự kiện', () => {
  const ds = [
    E('1', 'di', '2024-03-01', 'a', 500000, 'cuoi'), E('2', 'di', '2024-04-01', 'b', 300000, 'tang'), E('3', 'den', '2024-05-01', 'c', 1000000, 'cuoi'),
    E('4', 'di', '2025-01-01', 'd', 200000, 'cuoi'), E('5', 'den', '2025-02-01', 'e', 400000, 'liXi'),
  ];
  const t = thongKe(ds);
  assert.deepEqual(t.theoNam.map((x) => [x.nam, x.di, x.den]), [[2024, 800000, 1000000], [2025, 200000, 400000]]);
  assert.equal(t.tongDi, 1000000);
  assert.equal(t.tongDen, 1400000);
  assert.equal(t.soDi, 3);
  const cuoi = t.theoSuKien.find((x) => x.suKien === 'cuoi');
  assert.deepEqual([cuoi.di, cuoi.den, cuoi.soLan], [700000, 1000000, 3]);
  assert.equal(t.theoSuKien[0].suKien, 'cuoi');
  assert.deepEqual(thongKe([]).theoNam, []);
});

test('CSV: BOM, dấu phẩy và nháy được thoát, chống chèn công thức', () => {
  const csv = sangCsv([
    { id: '1', huong: 'di', ngay: '2026-01-02', personId: null, tenNguoi: '=HYPERLINK("x")', suKien: 'cuoi', soTien: 500000, qua: 'Trà, bánh', ghiChu: 'Anh "Tư"' },
  ]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\""));
  assert.ok(csv.includes('"Trà, bánh"'));
  assert.ok(csv.includes('"Anh ""Tư"""'));
  assert.equal(lamSachCsv('+84'), "'+84");
  assert.equal(lamSachCsv('ok'), 'ok');
});

// ---------- Bộ phân tích câu / giọng nói ----------
const NG = [{ id: 'h', ten: 'Nguyễn Văn Hùng', cachGoi: 'anh Hùng' }, { id: 'l', ten: 'Trần Thị Lan', cachGoi: '' }];
const HN = '2026-10-05';
test('đọc tiền: 1 triệu 2, 2tr5, 500k, rưỡi, trăm, số có dấu chấm', () => {
  const c = [['1 triệu 2', 1200000], ['một triệu hai', 1200000], ['2tr5', 2500000], ['500k', 500000], ['500 nghìn', 500000], ['hai triệu rưỡi', 2500000],
    ['một triệu hai trăm', 1200000], ['một triệu hai trăm nghìn', 1200000], ['1.200.000', 1200000], ['1,5 triệu', 1500000], ['3 triệu 25', 3250000],
    ['hai trăm năm mươi nghìn', 250000], ['năm trăm', 500000], ['1 triệu 250', 1250000], ['mười triệu', 10000000], ['hai mươi lăm nghìn', 25000], ['1tr', 1000000], ['một tỷ', 1e9], ['1tr250', 1250000], ['2 triệu 5 trăm nghìn', 2500000]];
  for (const [s, v] of c) assert.equal(phanTichTien(s), v, s);
  assert.ok(Number.isNaN(phanTichTien('mừng cưới anh Ba')));
});

test('câu: "mừng cưới anh Hùng 1 triệu 2"', () => {
  const r = phanTichCau('mừng cưới anh Hùng 1 triệu 2', { nguoi: NG, homNay: HN });
  assert.deepEqual([r.huong, r.suKien, r.soTien, r.personId, r.tenNguoi, r.ngay], ['di', 'cuoi', 1200000, 'h', 'anh Hùng', HN]);
  assert.deepEqual(r.canSoat, []);
});
test('câu: mình nhận (chị Lan mừng mình), tách hướng', () => {
  const r = phanTichCau('chị Lan mừng mình 2 triệu đám cưới', { nguoi: NG, homNay: HN });
  assert.deepEqual([r.huong, r.suKien, r.soTien, r.personId], ['den', 'cuoi', 2000000, 'l']);
  assert.equal(phanTichCau('nhận phong bì cưới của Lan 1tr5', { nguoi: NG, homNay: HN }).huong, 'den');
  assert.equal(phanTichCau('anh Tư mừng 500k sinh nhật', { nguoi: [], homNay: HN }).huong, 'den');
});
test('câu: tên là số (bác Ba, chú Tư, chị Sáu) không bị nhầm thành số tiền', () => {
  let r = phanTichCau('phúng viếng bác Ba 500k', { nguoi: [], homNay: HN });
  assert.deepEqual([r.suKien, r.soTien, r.tenNguoi], ['tang', 500000, 'bác Ba']);
  r = phanTichCau('mừng tân gia chú Tư hai triệu rưỡi', { nguoi: [], homNay: HN });
  assert.deepEqual([r.suKien, r.soTien, r.tenNguoi], ['tanGia', 2500000, 'chú Tư']);
  r = phanTichCau('mừng cưới chị Sáu năm trăm', { nguoi: [], homNay: HN });
  assert.deepEqual([r.soTien, r.tenNguoi], [500000, 'chị Sáu']);
});
test('câu: sự kiện, ngày, trường hợp thiếu thông tin cần soát', () => {
  assert.equal(phanTichCau('mừng thôi nôi con anh Nam 1 triệu 250', { homNay: HN }).suKien, 'thoiNoi');
  assert.equal(phanTichCau('mừng sinh nhật cháu Bi 200 nghìn', { homNay: HN }).soTien, 200000);
  assert.equal(phanTichCau('lì xì cháu Na 100k', { homNay: HN }).suKien, 'liXi');
  assert.equal(phanTichCau('mừng cưới hôm qua anh Hùng 1tr', { nguoi: NG, homNay: HN }).ngay, '2026-10-04');
  assert.equal(phanTichCau('mừng cưới bạn Thảo 12/10 1tr', { homNay: HN }).ngay, '2026-10-12');
  const r = phanTichCau('mừng cưới', { homNay: HN });
  assert.ok(r.canSoat.includes('khong-co-tien') && r.canSoat.includes('khong-co-nguoi'));
  const n = phanTichCau('mừng cưới anh Hùng 500', { nguoi: NG, homNay: HN });
  assert.equal(n.soTien, 500000);
  assert.ok(n.ngamNghin && n.canSoat.includes('ngam-nghin'));
  assert.equal(phanTichCau('', { homNay: HN }).soTien, null);
});
test('câu: nhận dạng giọng nói sai thanh điệu vẫn đọc được', () => {
  const r = phanTichCau('mung cuoi anh hung mot trieu hai', { nguoi: NG, homNay: HN });
  assert.deepEqual([r.suKien, r.soTien, r.personId], ['cuoi', 1200000, 'h']);
});

test('ô nhập tiền: kiểu Việt và số trần hiểu là nghìn', () => {
  assert.equal(docOTien('1.200.000'), 1200000);
  assert.equal(docOTien('1,2tr'), 1200000);
  assert.equal(docOTien('500k'), 500000);
  assert.ok(Number.isNaN(docOTien('abc')));
  assert.deepEqual(docOTienNoi('500'), { v: 500000, ngam: true });
  assert.deepEqual(docOTienNoi('1.500.000'), { v: 1500000, ngam: false });
  assert.equal(tienGon(1250000), '1,25 triệu');
  assert.equal(tienGon(500000), '500 nghìn');
});

// ---------- Tìm không dấu ----------
test('tìm không dấu trong danh bạ và sổ lễ', () => {
  const ps = [{ id: '1', ten: 'Nguyễn Văn Hùng', cachGoi: 'anh Hùng', nhom: 'Họ nội', quanHe: 'anh-chi-em', ghiChu: 'dị ứng tôm' }, { id: '2', ten: 'Đặng Thị Lụa', nhom: 'Công ty', quanHe: 'dong-nghiep' }];
  assert.deepEqual(timNguoi(ps, 'hung').map((p) => p.id), ['1']);
  assert.deepEqual(timNguoi(ps, 'dang lua').map((p) => p.id), ['2']);
  assert.deepEqual(timNguoi(ps, 'ho noi').map((p) => p.id), ['1']);
  assert.deepEqual(timNguoi(ps, 'di ung tom').map((p) => p.id), ['1']);
  assert.deepEqual(timNguoi(ps, 'dong nghiep').map((p) => p.id), ['2']);
  assert.equal(timNguoi(ps, 'xyz').length, 0);
  assert.equal(timNguoi(ps, '').length, 2);
  const es = [{ id: 'e', huong: 'di', ngay: '2026-01-01', personId: '1', suKien: 'tanGia', soTien: 1, qua: 'Nồi chiên' }];
  assert.equal(timKhoanLe(es, ps, 'tan gia hung').length, 1);
  assert.equal(timKhoanLe(es, ps, 'noi chien').length, 1);
});

// ---------- Dữ liệu gợi ý quà và lời chúc ----------
test('gợi ý quà: không rỗng, không trùng, có mẹo, mọi dịp có ít nhất 3 món', () => {
  assert.ok(QUA.length >= 50);
  const ten = QUA.map((q) => q.ten);
  assert.equal(new Set(ten).size, ten.length, 'trùng tên quà');
  const tip = QUA.map((q) => q.tip);
  assert.equal(new Set(tip).size, tip.length, 'trùng mẹo');
  const dipIds = new Set(DIP.map((d) => d.id));
  const nhomOk = new Set(['cha-me', 'nguoi-yeu', 'tre-em', 'anh-chi-em', 'ban-be', 'dong-nghiep', 'cap-tren', 'thay-co', 'hang-xom']);
  for (const q of QUA) {
    assert.ok(q.ten.length > 5 && q.tip.length > 20, q.ten);
    assert.ok(q.g.length && q.g.every((x) => nhomOk.has(x)), q.ten);
    assert.ok(q.d.length && q.d.every((x) => dipIds.has(x)), q.ten);
    assert.ok(q.m.length && q.m.every((x) => [1, 2, 3].includes(x)), q.ten);
    assert.ok(!/https?:|www\.|\.vn\b|\.com\b/.test(q.ten + q.tip), 'không được có liên kết');
    assert.ok(!/\d[\d.,]*\s?(đ|đồng|nghìn|triệu|k)\b/.test(q.ten + q.tip), `không nêu giá: ${q.ten}`);
  }
  for (const d of DIP) assert.ok(goiYQua({ dip: d.id }).length >= 3, `dịp ${d.id} thiếu quà`);
  for (const n of nhomOk) assert.ok(goiYQua({ nhom: n }).length >= 4, `nhóm ${n} thiếu quà`);
  assert.ok(KIENG_KY.length >= 3);
  const lanTang = goiYQua({ nhom: 'ban-be', dip: 'sinhNhat', daTang: ['hoa tươi'] });
  assert.ok(lanTang.some((q) => q.daTang));
});

test('lời chúc: mọi dịp x giọng đã khai có ít nhất 3 lời, không rỗng, không trùng', () => {
  const tat = [];
  for (const d of DIP) {
    for (const g of d.giong) {
      const ds = layLoiChuc(d.id, g);
      assert.ok(ds.length >= 3, `${d.id}/${g} chỉ có ${ds.length}`);
      for (const x of ds) { assert.ok(x.t.trim().length >= 40, `${d.id}/${g} quá ngắn: ${x.t}`); tat.push(x.t); }
    }
    for (const g of Object.keys(LOI_CHUC[d.id])) assert.ok(d.giong.includes(g), `${d.id}/${g} chưa khai trong DIP`);
  }
  assert.equal(new Set(tat).size, tat.length, 'có lời chúc trùng nhau');
  assert.ok(tat.length >= 120);
  // không lặp quá nhiều câu sáo rỗng
  const dem = (re) => tat.filter((t) => re.test(t)).length;
  assert.ok(dem(/vạn sự như ý/i) <= 1);
  assert.ok(dem(/tiền vô như nước/i) === 0);
});

test('lời chúc: chỗ trống hợp lệ, điền xong không còn dấu ngoặc nhọn, câu bắt đầu viết hoa', () => {
  for (const d of Object.values(LOI_CHUC)) {
    for (const ds of Object.values(d)) {
      for (const x of ds) {
        const t = typeof x === 'string' ? x : x.t;
        const du = dienLoi(t, { ten: 'anh Hùng', xung: 'con' });
        assert.ok(!/[{}]/.test(du), du);
        assert.ok(/^\p{Lu}/u.test(du), `không viết hoa đầu: ${du}`);
        assert.ok(!/\. \p{Ll}/u.test(du), `chữ thường sau dấu chấm: ${du}`);
        assert.ok(t.includes('{ten}'), `thiếu {ten}: ${t}`);
      }
    }
  }
  assert.equal(dienLoi('{Toi} chúc {ten}', { ten: 'Lan', xung: 'em' }), 'Em chúc Lan');
});

test('lời chia buồn: chỉ giọng trang trọng/thân mật, không có từ chúc mừng, vui, hạnh phúc', () => {
  assert.deepEqual(Object.keys(LOI_CHUC.tang).sort(), ['thanMat', 'trangTrong']);
  for (const g of Object.values(LOI_CHUC.tang)) {
    for (const x of g) {
      const t = (typeof x === 'string' ? x : x.t).toLowerCase();
      assert.ok(!/chúc mừng|vui|hạnh phúc|cười|sinh nhật|chúc .*(khỏe|may mắn|thành công)|haha|:\)/.test(t), t);
    }
  }
  for (const k of ['thamBenh', 'vuLan']) assert.ok(!LOI_CHUC[k].haiHuoc, `${k} không nên có giọng hài`);
  assert.ok(layLoiChuc('tang', 'trangTrong').some((x) => /Phật/.test(x.nhan || '')));
});

test('quan hệ và dịp: id duy nhất', () => {
  for (const ds of [QUAN_HE, DIP, DIP_LE]) assert.equal(new Set(ds.map((x) => x.id)).size, ds.length);
  for (const d of DIP_LE) assert.ok(d.dip === null || DIP.some((x) => x.id === d.dip), d.id);
});

// ---------- Làm sạch dữ liệu nhập, tìm kiếm, ngày ----------
test('làm sạch dữ liệu nhập: bỏ bản ghi hỏng, cắt độ dài, ép kiểu', () => {
  assert.equal(LAM_SACH.people({ id: 'a', ten: '   ' }), null);
  assert.equal(LAM_SACH.people({ id: 'a b!', ten: 'X' }), null);
  const p = LAM_SACH.people({ id: 'a', ten: 'X'.repeat(500), quanHe: 'sai', sinh: { kieu: 'duong', ngay: 31, thang: 2 } });
  assert.equal(p.ten.length, 80); assert.equal(p.quanHe, 'khac'); assert.equal(p.sinh, null);
  const e = LAM_SACH.entries({ id: 'e', ngay: '2026-02-30', huong: 'di' });
  assert.equal(e, null);
  const e2 = LAM_SACH.entries({ id: 'e', ngay: '2026-02-28', huong: 'xyz', soTien: -5, suKien: '<img>' });
  assert.deepEqual([e2.huong, e2.soTien, e2.suKien], ['di', 0, 'khac']);
  assert.equal(LAM_SACH.dates({ id: 'd', kieu: 'am', ngay: 31, thang: 1 }), null);
  assert.equal(xuat().app, '9gift');
});

test('ngày: cộng trừ, thứ trong tuần, Chủ nhật thứ N', () => {
  assert.equal(congNgay('2026-12-31', 1), '2027-01-01');
  assert.equal(congNgay('2028-03-01', -1), '2028-02-29');
  assert.equal(chenhNgay('2026-10-05', '2026-11-04'), 30);
  assert.equal(thuTrongTuan('2026-10-05'), 1); // thứ hai
  assert.equal(ngayThuTrongThang(2026, 5, 0, 2), '2026-05-10');
  assert.equal(iso(5, 1, 2), '0005-01-02');
  assert.deepEqual(duongSangAm(17, 2, 2026), { ngay: 1, thang: 1, nam: 2026, nhuan: false });
});

// ---------- Chỉ mục tìm kiếm, manifest ----------
test('search-index.json: đúng định dạng SEARCH-INDEX của Vạn Niên', () => {
  const idx = JSON.parse(fs.readFileSync(new URL('../search-index.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(idx) && idx.length >= 8);
  const paths = new Set(); const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  for (const e of idx) {
    assert.deepEqual(Object.keys(e).sort(), ['blurb', 'keywords', 'name', 'path']);
    assert.match(e.path, /^#\//);
    assert.ok(!paths.has(e.path), `trùng path ${e.path}`); paths.add(e.path);
    assert.ok(e.blurb.length > 10 && e.name.length > 2);
    assert.equal(new Set(e.keywords).size, e.keywords.length);
    for (const k of e.keywords) {
      assert.equal(k, k.toLowerCase());
      if (fold(k) !== k) assert.ok(e.keywords.includes(fold(k)), `thiếu bản không dấu của "${k}"`);
    }
  }
});

test('manifest và tệp cần thiết có đủ', () => {
  const root = new URL('../', import.meta.url);
  const m = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(m.lang, 'vi');
  for (const i of m.icons) assert.ok(fs.existsSync(new URL(i.src, root)), i.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  const sw = fs.readFileSync(new URL('sw.js', root), 'utf8');
  const lst = [...sw.matchAll(/'\.\/([^']+)'/g)].map((x) => x[1]);
  for (const f of lst) assert.ok(fs.existsSync(new URL(f, root)), `sw.js liệt kê tệp không có: ${f}`);
});

test('soNgayThangAm có sẵn', () => { assert.ok([29, 30].includes(soNgayThangAm(1, 2026))); });
