// Test cho các lỗi do phản biện độc lập phát hiện (nhắc dịp âm tháng Chạp, .ics nhiều năm, gắn dịp, nhãn tang lễ, khóa prototype, nhập JSON, nội dung).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { duongSangAm, amSangDuong, soNgayThangAm } from '../js/lib/lunar.js';
import { sapToi, taoIcs, ngayDip, lanKeTiep } from '../js/lib/nhac.js';
import { amCua, congNgay } from '../js/lib/ngay.js';
import { DIP, DIP_LE, DIP_THEO_SU_KIEN } from '../js/data/dip.js';
import { LOI_CHUC, layLoiChuc, demLoiChuc, haKinh } from '../js/data/loichuc.js';
import { QUA, goiYQua } from '../js/data/qua.js';
import { tenSuKien, dapLeMacDinh, nhanChieu, dongTuLe, thongKeTheoNhom, sangCsv, SU_KIEN_THEO_ID } from '../js/lib/le.js';
import { LAM_SACH, nhap, luu, layDs, xoaSach, xuat } from '../js/lib/kho.js';
import { phanTichCau } from '../js/lib/cau.js';

const dipId = (ds, id) => ds.filter((e) => e.dipId === id);

// ---------- 1. Dịp âm tháng Chạp ----------
test('Ông Công Ông Táo 23/12 âm hiện đúng ở các thời điểm đầu năm dương (lỗi duyệt năm dương từ t.y)', () => {
  const bat = new Set(['ong-tao']);
  for (const tu of ['2026-12-01', '2027-01-15', '2027-01-25', '2028-01-10']) {
    const ds = dipId(sapToi({ people: [], dates: [], dipBat: bat, tu, soNgay: 90 }), 'ong-tao');
    assert.equal(ds.length, 1, `tu=${tu}`);
    const a = amCua(ds[0].iso);
    assert.deepEqual([a.ngay, a.thang], [23, 12], `tu=${tu} ra ${ds[0].iso}`);
  }
});
test('mọi dịp âm (Tết, Giỗ Tổ, Đoan Ngọ, Vu Lan, Trung thu, Ông Táo) không bao giờ vắng mặt khi quét theo tháng 2025-2031', () => {
  const am = DIP_LE.filter((d) => d.kieu === 'am');
  assert.ok(am.length >= 6);
  const bat = new Set(am.map((d) => d.id));
  for (let y = 2025; y <= 2031; y++) {
    for (let m = 1; m <= 12; m++) {
      const tu = `${y}-${String(m).padStart(2, '0')}-01`;
      const ds = sapToi({ people: [], dates: [], dipBat: bat, tu, soNgay: 400 });
      for (const d of am) assert.ok(dipId(ds, d.id).length >= 1, `${d.id} vắng khi tu=${tu}`);
    }
  }
});

// ---------- 2. .ics nhiều năm ----------
test('xuất .ics 24 tháng có đủ Tết 2027, Tết 2028, sinh nhật 2027, 2028', () => {
  const people = [{ id: 'a', ten: 'Mai', sinh: { kieu: 'duong', ngay: 15, thang: 3, nam: 1990 } }];
  const ev = sapToi({ people, dates: [], dipBat: new Set(['tet-nguyen-dan']), tu: '2026-10-05', soNgay: Math.round(24 * 30.5) });
  const sn = ev.filter((e) => e.key === 'sn:a').map((e) => e.iso);
  const tet = ev.filter((e) => e.dipId === 'tet-nguyen-dan').map((e) => e.iso);
  assert.deepEqual(sn, ['2027-03-15', '2028-03-15']);
  assert.deepEqual(tet, ['2027-02-06', '2028-01-26']);
  const ics = taoIcs(ev, { now: new Date('2026-10-05T00:00:00Z') });
  for (const d of [...sn, ...tet]) assert.ok(ics.includes(`DTSTART;VALUE=DATE:${d.replace(/-/g, '')}`), d);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, ev.length);
  const uid = ics.match(/^UID:.*$/gm); assert.equal(new Set(uid).size, uid.length);
});
test('giỗ âm lặp đủ mỗi năm trong 24 tháng', () => {
  const dates = [{ id: 'g', personId: null, ten: 'Ông', loai: 'gio', kieu: 'am', ngay: 1, thang: 9, nam: 2015 }];
  const ev = sapToi({ people: [], dates, dipBat: new Set(), tu: '2026-10-05', soNgay: 730 });
  assert.equal(ev.length, 2);
  assert.ok(ev.every((e) => amCua(e.iso).ngay === 1 && amCua(e.iso).thang === 9));
});

// ---------- 3. Gắn dịp ----------
test('mỗi dịp lễ gắn đúng dịp lời chúc, hoặc không gắn (null) nếu không có lời phù hợp', () => {
  const dip = (id) => DIP_LE.find((d) => d.id === id).dip;
  assert.equal(dip('thieu-nhi'), 'thieuNhi');
  assert.equal(dip('giang-sinh'), 'giangSinh');
  assert.equal(dip('tet-duong'), 'namMoi');
  assert.equal(dip('ngay-cua-me'), 'ngayMe');
  assert.equal(dip('ngay-cua-cha'), 'ngayCha');
  for (const id of ['quoc-khanh', 'gio-to', 'doan-ngo', 'ong-tao', 'gia-dinh-vn']) assert.equal(dip(id), null, id);
  assert.equal(dip('tet-nguyen-dan'), 'tet');
  for (const d of DIP_LE) assert.ok(d.dip === null || DIP.some((x) => x.id === d.dip), d.id);
  assert.ok(!DIP.some((d) => d.id === 'meCha'), 'đã tách Ngày của Mẹ và của Cha');
  assert.ok(/24\/12/.test(DIP_LE.find((d) => d.id === 'giang-sinh').ten) && /25\/12/.test(DIP_LE.find((d) => d.id === 'giang-sinh').ten));
  assert.equal(DIP_THEO_SU_KIEN.khac, undefined);
});
test('lời chúc Thiếu nhi không phải lời sinh nhật; Giáng sinh không phải lời tình yêu; Ngày của Mẹ không nhắc "Cha"', () => {
  for (const g of ['trangTrong', 'thanMat', 'haiHuoc']) {
    for (const x of layLoiChuc('thieuNhi', g)) assert.ok(!/sinh nhật/i.test(x.t), x.t);
    for (const x of layLoiChuc('giangSinh', g)) assert.ok(/Giáng sinh|Noel/.test(x.t), x.t);
  }
  for (const g of ['trangTrong', 'thanMat']) {
    for (const x of layLoiChuc('ngayMe', g)) assert.ok(!/\bCha\b|Mẹ và/.test(x.t.replace('ngày của Mẹ', '')) , x.t);
    for (const x of layLoiChuc('ngayCha', g)) assert.ok(!/Mẹ/.test(x.t), x.t);
  }
});

// ---------- 4. Nhãn theo nhóm sự kiện ----------
test('tang lễ không dùng chữ "mừng"; việc vui "mừng"; sinh nhật và lễ Tết "tặng"', () => {
  assert.equal(nhanChieu('di', 'tang'), 'Mình phúng viếng');
  assert.equal(nhanChieu('den', 'tang'), 'Họ phúng viếng');
  assert.equal(nhanChieu('di', 'gio'), 'Mình phúng viếng');
  assert.equal(nhanChieu('di', 'cuoi'), 'Mình mừng');
  assert.equal(nhanChieu('den', 'cuoi'), 'Họ mừng');
  assert.equal(nhanChieu('di', 'sinhNhat'), 'Mình tặng');
  assert.equal(nhanChieu('den', 'liXi'), 'Họ tặng mình');
  assert.ok(!/mừng/.test(nhanChieu('di', 'tang') + nhanChieu('den', 'gio')));
  assert.equal(dongTuLe('leTet'), 'tặng');
});
test('tổng tách riêng việc vui, tang lễ, quà khác', () => {
  const ds = [
    { huong: 'di', suKien: 'cuoi', soTien: 500000 }, { huong: 'di', suKien: 'tang', soTien: 300000 },
    { huong: 'den', suKien: 'tang', soTien: 100000 }, { huong: 'di', suKien: 'sinhNhat', soTien: 200000 },
  ];
  const g = thongKeTheoNhom(ds);
  assert.deepEqual(g, { hy: { di: 500000, den: 0 }, hieu: { di: 300000, den: 100000 }, khac: { di: 200000, den: 0 } });
});
test('giao diện không còn chữ "mừng" cho tang lễ: quét mã nguồn màn hình', () => {
  const nguon = fs.readFileSync(new URL('../js/screens/sole.js', import.meta.url), 'utf8');
  assert.ok(!/'Mình mừng'|'Mình đã đi mừng'|Tổng đã đi mừng|'họ đã mừng'|'bạn đã mừng'/.test(nguon));
});

// ---------- 5. Khóa prototype ----------
test('khóa prototype (constructor, __proto__, toString) không lọt qua danh sách trắng', () => {
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(tenSuKien(k), 'Khác', k);
    assert.equal(dapLeMacDinh(k), false, k);
    assert.equal(SU_KIEN_THEO_ID[k], undefined, k);
    assert.equal(nhanChieu('di', k), 'Mình tặng');
    assert.deepEqual(layLoiChuc(k, 'trangTrong'), []);
    assert.deepEqual(layLoiChuc('sinhNhat', k), []);
    assert.deepEqual(goiYQua({ dip: k }), []);
    assert.equal(LAM_SACH.entries({ id: 'x', ngay: '2026-01-01', suKien: k }).suKien, 'khac');
    assert.equal(LAM_SACH.dates({ id: 'x', kieu: 'duong', ngay: 1, thang: 1, loai: k }).loai, 'khac');
    assert.equal(LAM_SACH.people({ id: 'x', ten: 'A', quanHe: k }).quanHe, 'khac');
    const ev = sapToi({ people: [], dates: [{ id: 'x', loai: k, kieu: 'duong', ngay: 6, thang: 10 }], dipBat: new Set(), tu: '2026-10-05', soNgay: 5 });
    assert.equal(ev.length, 1);
    assert.ok(ev[0].tieuDe && ev[0].tieuDe !== 'undefined');
  }
});

// ---------- 6. Nhập JSON, CSV, phủ định ----------
test('nhập JSON báo số khoản bị sửa; tệp toàn bản ghi hỏng không xóa dữ liệu khi Thay thế', async () => {
  await xoaSach();
  luu('people', { id: 'giu', ten: 'Người đang có' });
  const hong = { app: '9gift', version: 1, people: [{ id: 'a b', ten: '' }], entries: [{ id: 'e', ngay: '2026-13-40' }] };
  const r = await nhap(hong, 'thay');
  assert.equal(r.ok, false);
  assert.equal(layDs('people').length, 1, 'dữ liệu cũ phải còn');
  const co = { app: '9gift', version: 1, people: [{ id: 'p1', ten: 'Lan' }], entries: [
    { id: 'e1', ngay: '2026-01-01', huong: 'di', soTien: -5 }, { id: 'e2', ngay: '2026-01-02', huong: 'di', soTien: 2e12 }, { id: 'e3', ngay: '2026-01-03', huong: 'di', soTien: 100000 }, { id: 'e4', ngay: 'sai' },
  ] };
  const r2 = await nhap(co, 'gop');
  assert.equal(r2.ok, true);
  assert.equal(r2.daSua, 2);
  assert.equal(r2.boQua, 1);
  assert.ok(r2.lyDo.some((x) => /số tiền/.test(x)));
  assert.equal(layDs('people').length, 2);
  const r3 = await nhap(co, 'thay');
  assert.equal(r3.ok, true);
  assert.equal(layDs('people').length, 1);
  assert.equal(xuat().entries.length, 3);
  await xoaSach();
});
test('CSV có dòng sep=, và có thể ẩn số tiền', () => {
  const e = [{ id: '1', huong: 'di', ngay: '2026-01-02', personId: null, tenNguoi: 'A', suKien: 'cuoi', soTien: 500000 }];
  const c = sangCsv(e);
  assert.ok(c.replace('﻿', '').startsWith('sep=,\r\n'));
  assert.ok(c.includes(',500000,'));
  const an = sangCsv(e, {}, { anTien: true });
  assert.ok(!an.includes('500000') && an.includes('***'));
});
test('ghi nhanh có phủ định được đánh dấu cần soát', () => {
  assert.ok(phanTichCau('không mừng cưới anh Hùng 1 triệu', { homNay: '2026-10-05' }).canSoat.includes('phu-dinh'));
  assert.ok(phanTichCau('chưa mừng tân gia chị Lan 500k', { homNay: '2026-10-05' }).canSoat.includes('phu-dinh'));
  assert.ok(!phanTichCau('mừng cưới anh Hùng 1 triệu', { homNay: '2026-10-05' }).canSoat.includes('phu-dinh'));
});

// ---------- 7. Nội dung văn hóa ----------
test('"kính chúc" chỉ cho ông bà, cha mẹ, bậc trên, thầy cô; sếp, đồng nghiệp, bạn bè và chưa chọn người dùng "chúc"', () => {
  let coKinh = 0;
  for (const dip of Object.keys(LOI_CHUC)) {
    for (const g of Object.keys(LOI_CHUC[dip])) {
      for (const nhom of [null, 'cap-tren', 'dong-nghiep', 'ban-be', 'nguoi-yeu', 'tre-em', 'anh-chi-em', 'hang-xom']) {
        for (const x of layLoiChuc(dip, g, nhom)) assert.ok(!/kính chúc/i.test(x.t), `${dip}/${g}/${nhom}: ${x.t}`);
      }
      for (const nhom of ['cha-me', 'thay-co']) coKinh += layLoiChuc(dip, g, nhom).filter((x) => /kính chúc/i.test(x.t)).length;
    }
  }
  assert.ok(coKinh >= 8, 'bậc trên vẫn giữ lời kính trọng');
  assert.equal(haKinh('Nhân dịp, tôi xin kính chúc anh. Kính chúc chị'), 'Nhân dịp, tôi xin chúc anh. Chúc chị');
});
test('mọi dịp x giọng x nhóm quan hệ đều còn ít nhất 3 lời chúc', () => {
  for (const d of DIP) for (const g of d.giong) for (const nhom of [null, 'cha-me', 'cap-tren', 'dong-nghiep', 'ban-be', 'nguoi-yeu', 'tre-em', 'anh-chi-em', 'thay-co', 'hang-xom']) {
    assert.ok(layLoiChuc(d.id, g, nhom).length >= 3, `${d.id}/${g}/${nhom}`);
  }
});
test('bỏ các giả định: bé trai, ba mẹ, xinh như hoa, nấu cơm, "rồi sẽ ổn thôi", mang món thích khi thăm bệnh', () => {
  const tat = (dip) => Object.values(LOI_CHUC[dip]).flat().map((x) => (typeof x === 'string' ? x : x.t)).join('\n');
  assert.ok(!/ông chủ nhỏ|ba mẹ/.test(tat('treSoSinh')));
  assert.ok(!/xinh như hoa|nấu cơm|việc nhà/.test(tat('phuNu')));
  assert.ok(!/rồi sẽ ổn thôi|mang theo món/.test(tat('thamBenh')));
  assert.ok(!/nuôi nấng|dạy dỗ/.test(tat('ngayMe') + tat('ngayCha')));
});
test('Vu Lan có lời cho người đã mất cha hoặc mẹ, không giả định cha mẹ còn sống', () => {
  const ds = layLoiChuc('vuLan', 'thanMat').concat(layLoiChuc('vuLan', 'trangTrong'));
  assert.ok(ds.filter((x) => /đã mất/.test(x.nhan || '')).length >= 4);
});
test('giọng hài hước không có ở dịp nhạy cảm và gợi ý quà có cảnh báo thầy cô, tránh "bộ quần áo thọ"', () => {
  for (const id of ['tang', 'thamBenh', 'vuLan', 'ngayMe', 'ngayCha', 'mungTho', 'thayCo']) assert.ok(!LOI_CHUC[id].haiHuoc, id);
  assert.ok(!QUA.some((q) => /quần áo thọ/i.test(q.ten)));
  assert.ok(QUA.some((q) => /Áo dài, áo ấm/.test(q.ten)));
  const thayCo = QUA.filter((q) => q.g.includes('thay-co') && /thẻ quà|Bó hoa|Hộp trà hoặc hộp bánh|Cuốn sách hay/i.test(q.ten));
  assert.ok(thayCo.length >= 3 && thayCo.every((q) => /quy định|đạo đức|hỏi trước/.test(q.tip)), 'cảnh báo thầy cô');
  const hoa = QUA.find((q) => /Bông hồng cài áo/.test(q.ten));
  assert.match(hoa.tip, /hồng đỏ.*còn mẹ.*hồng trắng.*đã mất/);
});

// ---------- 8. Lịch âm ----------
test('quét 1950-2150: mọi ngày dương đổi sang âm đều có ngày 1..30 và đổi ngược được', () => {
  const xau = [];
  for (let t = Date.UTC(1950, 0, 1); t < Date.UTC(2150, 0, 1); t += 864e5 * 1) {
    const d = new Date(t);
    const a = duongSangAm(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
    if (a.ngay < 1 || a.ngay > 30 || a.thang < 1 || a.thang > 12) xau.push(d.toISOString().slice(0, 10));
  }
  assert.deepEqual(xau, []);
  assert.ok(duongSangAm(7, 5, 2054).ngay >= 1);
  assert.ok(duongSangAm(9, 4, 2062).ngay >= 1);
  const r = amSangDuong(1, 1, 2027);
  assert.deepEqual(r, { ngay: 6, thang: 2, nam: 2027 });
  assert.ok(soNgayThangAm(1, 2054) >= 29);
});

// ---------- 9. Số liệu mô tả ----------
test('README ghi đúng số món quà và số lời chúc', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(`${QUA.length} món quà`), `README phải ghi ${QUA.length} món quà`);
  assert.ok(readme.includes(`${demLoiChuc()} lời chúc`), `README phải ghi ${demLoiChuc()} lời chúc`);
  assert.ok(/Cần người am hiểu duyệt/.test(readme));
});
test('sw.js đã tăng phiên bản', () => {
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /CACHE_VERSION = 'v[2-9]/);
});
test('ngayDip/lanKeTiep còn dùng được', () => {
  assert.equal(ngayDip(DIP_LE.find((d) => d.id === 'tet-nguyen-dan'), 2028), '2028-01-26');
  assert.equal(lanKeTiep({ kieu: 'duong', ngay: 1, thang: 1 }, congNgay('2026-12-31', 0)).iso, '2027-01-01');
});
