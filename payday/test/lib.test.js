// Kiểm thử: đọc số tiền / ghi nhanh chi tiêu, hũ và dự báo, ngày kỳ lương, vay và mục tiêu, tệp .ics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { goiYTiLe, phanTichChiTieu, docTien, tinhHu, duBao, huCuaKhoan, MAU_HU, THU_TU_HU } from '../js/lib/spend.js';
import { chuKy, lanKeTiep, soThangDen, ngayTrongThang, congNgay, soNgayGiua } from '../js/lib/dates.js';
import { canDeDanh, soSanhTraSom, bangTraNo, guiTietKiem, laiKep, tyLeTraNo } from '../js/lib/vay.js';
import { taoICS, gapDong, triggerNgay, thoatChu } from '../js/lib/ics.js';

const HOM = '2026-10-05';

// ---------- Giọng nói / câu ghi chi tiêu ----------
const CAU = [
  ['cà phê 45k', 45000, 'ca-phe', HOM],
  ['Cà phê bốn mươi lăm nghìn', 45000, 'ca-phe', HOM],
  ['cafe 45 ngàn', 45000, 'ca-phe', HOM],
  ['trà sữa 55.000', 55000, 'ca-phe', HOM],
  ['ăn trưa 2 người 150k', 150000, 'an-uong', HOM],
  ['bún bò hai mươi lăm nghìn', 25000, 'an-uong', HOM],
  ['grab 85 nghìn hôm qua', 85000, 'di-lai', '2026-10-04'],
  ['đổ xăng 70k hôm kia', 70000, 'di-lai', '2026-10-03'],
  ['tiền nhà 3tr5', 3500000, 'nha-o', HOM],
  ['tiền nhà ba triệu rưỡi', 3500000, 'nha-o', HOM],
  ['điện 1 triệu 2', 1200000, 'nha-o', HOM],
  ['biếu ba 2 triệu', 2000000, 'gia-dinh', HOM],
  ['mua giày 1.200.000đ', 1200000, 'mua-sam', HOM],
  ['gửi tiết kiệm 2 triệu rưỡi', 2500000, 'tiet-kiem', HOM],
  ['netflix 260,000', 260000, 'giai-tri', HOM],
  ['một trăm hai mươi nghìn xăng', 120000, 'di-lai', HOM],
  ['khám bệnh 350k', 350000, 'suc-khoe', HOM],
  ['sách 99k', 99000, 'hoc-tap', HOM],
  ['linh tinh 30k', 30000, 'khac', HOM],
  ['2tr5 mua quần áo', 2500000, 'mua-sam', HOM],
];
for (const [cau, tien, dm, ngay] of CAU) {
  test(`Câu ghi nhanh: "${cau}"`, () => {
    const kq = phanTichChiTieu(cau, HOM);
    assert.equal(kq.ok, true, kq.loi);
    assert.equal(kq.soTien, tien);
    assert.equal(kq.dm, dm);
    assert.equal(kq.ngay, ngay);
    assert.equal(Object.keys(kq).some((k) => /cau|goc|text/i.test(k)), false, 'không được lưu nguyên câu');
  });
}
test('Số trần nhỏ hơn 1000 hiểu là nghìn đồng và đánh dấu ngầm', () => {
  const kq = phanTichChiTieu('cà phê 45', HOM);
  assert.equal(kq.soTien, 45000); assert.equal(kq.ngam, true);
});
test('Câu lỗi trả thông báo thân thiện, không ném lỗi', () => {
  for (const c of ['', '   ', 'cà phê', 'abc xyz', 'ba người đi ăn']) {
    const kq = phanTichChiTieu(c, HOM);
    assert.equal(kq.ok, false); assert.ok(kq.loi.length > 5);
  }
});
test('Ô nhập tiền: docTien', () => {
  assert.equal(docTien('12tr'), 12_000_000);
  assert.equal(docTien('12 triệu 5'), 12_500_000);
  assert.equal(docTien('12.500.000'), 12_500_000);
  assert.equal(docTien('15000000'), 15_000_000);
  assert.equal(docTien('hai triệu rưỡi'), 2_500_000);
  assert.equal(docTien('12', 1e6), 12_000_000);
  assert.ok(Number.isNaN(docTien('')));
  assert.ok(Number.isNaN(docTien('abc')));
});

// ---------- Hũ và dự báo ----------
test('Hũ: 4 hũ trên net 20tr, thiết yếu trừ khoản cố định rồi trừ chi tiêu', () => {
  const r = tinhHu({
    net: 20_000_000, hu: MAU_HU['4-hu'].hu,
    coDinh: [{ soTien: 6_000_000, hu: 'thiet-yeu' }],
    chi: [{ soTien: 1_500_000, dm: 'an-uong', ngay: HOM }, { soTien: 400_000, dm: 'ca-phe', ngay: HOM }, { soTien: 1_000_000, dm: 'tiet-kiem', ngay: HOM }],
  });
  const j = Object.fromEntries(r.ds.map((x) => [x.id, x]));
  assert.equal(j['thiet-yeu'].phanBo, 10_000_000);
  assert.equal(j['thiet-yeu'].conLai, 2_500_000);
  assert.equal(j['huong-thu'].phanBo, 4_000_000); assert.equal(j['huong-thu'].conLai, 3_600_000);
  assert.equal(j['tiet-kiem'].phanBo, 4_000_000); assert.equal(j['tiet-kiem'].conLai, 3_000_000);
  assert.equal(r.tongTyLe, 100);
  assert.equal(r.tongConLai, 2_500_000 + 3_600_000);
});
test('Hũ: khoản chi thuộc hũ không còn tồn tại rơi về thiết yếu; thứ tự hũ ổn định', () => {
  const hu = MAU_HU['50-30-20'].hu;
  assert.equal(huCuaKhoan({ dm: 'hoc-tap' }, hu), 'thiet-yeu');
  assert.equal(huCuaKhoan({ dm: 'hoc-tap', hu: 'huong-thu' }, hu), 'huong-thu');
  const r = tinhHu({ net: 10e6, hu, coDinh: [], chi: [] });
  assert.deepEqual(r.ds.map((x) => x.id), THU_TU_HU.filter((k) => hu[k] !== undefined));
});
test('Hũ: khoản cố định vượt hũ thiết yếu được báo', () => {
  const r = tinhHu({ net: 10e6, hu: MAU_HU['50-30-20'].hu, coDinh: [{ soTien: 6e6, hu: 'thiet-yeu' }], chi: [] });
  assert.deepEqual(r.chiVuotCoDinh, ['thiet-yeu']);
});
test('Mọi mẫu hũ cộng đúng 100%', () => {
  for (const m of Object.values(MAU_HU)) assert.equal(Object.values(m.hu).reduce((a, b) => a + b, 0), 100, m.ten);
});
test('Dự báo theo tốc độ chi', () => {
  // 3 triệu sau 10/30 ngày -> ước 9 triệu
  let d = duBao({ daChi: 3e6, duocChi: 8e6, ngayDaQua: 10, soNgay: 30 });
  assert.equal(d.uocCuoiKy, 9e6); assert.equal(d.mucDo, 'sat'); assert.equal(d.tocMoiNgay, 300000);
  assert.equal(d.ngayCon, 20); assert.equal(d.duocChiMoiNgay, 238095); assert.equal(d.duKienDu, -1e6);
  d = duBao({ daChi: 2e6, duocChi: 8e6, ngayDaQua: 10, soNgay: 30 });
  assert.equal(d.mucDo, 'tot'); assert.equal(d.uocCuoiKy, 6e6); assert.equal(d.duKienDu, 2e6);
  d = duBao({ daChi: 9e6, duocChi: 8e6, ngayDaQua: 20, soNgay: 30 });
  assert.equal(d.mucDo, 'vuot'); assert.equal(d.duocChiMoiNgay, 0);
});
test('Dự báo: 2 ngày đầu kỳ chưa ngoại suy', () => {
  const d = duBao({ daChi: 500000, duocChi: 8e6, ngayDaQua: 2, soNgay: 30 });
  assert.equal(d.du, false); assert.equal(d.uocCuoiKy, 500000); assert.equal(d.mucDo, 'tot');
});
test('Dự báo: không có ngân sách', () => {
  assert.equal(duBao({ daChi: 0, duocChi: 0, ngayDaQua: 5, soNgay: 30 }).mucDo, 'tot');
  assert.equal(duBao({ daChi: 10, duocChi: 0, ngayDaQua: 5, soNgay: 30 }).mucDo, 'vuot');
});

// ---------- Ngày ----------
test('Kỳ lương: ngày lương 5', () => {
  let k = chuKy('2026-10-05', 5);
  assert.deepEqual([k.tu, k.luongKe, k.soNgay, k.ngayDaQua, k.ngayCon, k.den], ['2026-10-05', '2026-11-05', 31, 1, 30, '2026-11-04']);
  k = chuKy('2026-10-04', 5);
  assert.deepEqual([k.tu, k.luongKe, k.soNgay, k.ngayDaQua, k.ngayCon], ['2026-09-05', '2026-10-05', 30, 30, 0]);
});
test('Kỳ lương: ngày 1 là tháng dương lịch; ngày 31 gặp tháng 2; năm nhuận; qua năm', () => {
  let k = chuKy('2026-10-15', 1);
  assert.deepEqual([k.tu, k.den, k.soNgay], ['2026-10-01', '2026-10-31', 31]);
  k = chuKy('2026-02-10', 31);
  assert.deepEqual([k.tu, k.luongKe, k.soNgay], ['2026-01-31', '2026-02-28', 28]);
  k = chuKy('2028-02-29', 'cuoi');
  assert.deepEqual([k.tu, k.luongKe], ['2028-02-29', '2028-03-31']);
  k = chuKy('2027-01-02', 15);
  assert.deepEqual([k.tu, k.luongKe], ['2026-12-15', '2027-01-15']);
});
test('Ngày: tiện ích', () => {
  assert.equal(ngayTrongThang(2026, 2, 31), '2026-02-28');
  assert.equal(congNgay('2026-12-31', 1), '2027-01-01');
  assert.equal(soNgayGiua('2026-10-05', '2026-11-05'), 31);
  assert.equal(lanKeTiep('2026-10-05', 3), '2026-11-03');
  assert.equal(lanKeTiep('2026-10-05', 5), '2026-10-05');
  assert.equal(soThangDen('2026-10-05', '2027-10-05'), 12);
  assert.equal(soThangDen('2026-10-05', '2027-10-06'), 13);
});

// ---------- Vay, mục tiêu, lãi kép ----------
test('Mục tiêu: không lãi thì chia đều', () => {
  const r = canDeDanh({ mucTieu: 120e6, daCo: 0, soThang: 24, laiNam: 0 });
  assert.equal(r.moiThang, 5e6);
});
test('Mục tiêu: có lãi thì số góp đủ chạm mục tiêu và số nhỏ hơn một đồng thì không đủ', () => {
  const p = { mucTieu: 120e6, daCo: 10e6, soThang: 24, laiNam: 5 };
  const r = canDeDanh(p);
  const i = 0.05 / 12;
  const fv = (pm) => { let s = p.daCo; for (let k = 0; k < p.soThang; k++) s = s * (1 + i) + pm; return s; };
  assert.ok(fv(r.moiThang) >= p.mucTieu);
  assert.ok(fv(r.moiThang - 1) < p.mucTieu);
  assert.ok(r.moiThang < (p.mucTieu - p.daCo) / p.soThang);
});
test('Mục tiêu: đã có đủ', () => {
  assert.equal(canDeDanh({ mucTieu: 10e6, daCo: 20e6, soThang: 12, laiNam: 3 }).daDu, true);
});
test('Mục tiêu: đầu vào sai ném lỗi tiếng Việt', () => {
  assert.throws(() => canDeDanh({ mucTieu: 0, soThang: 12 }), /lớn hơn 0/);
  assert.throws(() => canDeDanh({ mucTieu: 1e6, soThang: 0 }), /tháng/);
});
test('Trả nợ sớm: gốc đều 12tr, lãi 12%/năm, trả thêm 6tr cuối tháng 6', () => {
  const r = soSanhTraSom({ soTien: 12e6, laiNam: 12, soThang: 12, kieu: 'goc-deu', thangTra: 6, soTienTra: 6e6 });
  assert.equal(r.goc.tongLai, 780000);
  assert.equal(r.som.tongLai, 570000);
  assert.equal(r.tietKiemLai, 210000);
  assert.equal(r.som.soKy, 6); assert.equal(r.rutKy, 6);
});
test('Trả nợ sớm: phí trả trước hạn trừ vào tiết kiệm', () => {
  const r = soSanhTraSom({ soTien: 12e6, laiNam: 12, soThang: 12, kieu: 'goc-deu', thangTra: 6, soTienTra: 6e6, phiPhanTram: 2 });
  assert.equal(r.phi, 120000); assert.equal(r.tietKiemRong, 90000);
});
test('Trả nợ sớm: niên kim giữ kỳ hạn thì kỳ không đổi và vẫn tiết kiệm lãi', () => {
  const r = soSanhTraSom({ soTien: 500e6, laiNam: 10, soThang: 120, kieu: 'niemkim', thangTra: 12, soTienTra: 100e6, cach: 'giam-tien-tra' });
  assert.equal(r.som.soKy, 120); assert.ok(r.tietKiemLai > 0);
  const r2 = soSanhTraSom({ soTien: 500e6, laiNam: 10, soThang: 120, kieu: 'niemkim', thangTra: 12, soTienTra: 100e6, cach: 'rut-ky-han' });
  assert.ok(r2.som.soKy < 120 && r2.tietKiemLai > r.tietKiemLai);
});
test('Niên kim: khớp công thức PMT và gốc đều giảm dần', () => {
  const b = bangTraNo({ soTien: 100e6, laiNam: 12, soThang: 12, kieu: 'niemkim' });
  assert.ok(Math.abs(b.kyDau - 8_884_879) <= 2, 'PMT ' + b.kyDau);
  const g = bangTraNo({ soTien: 12e6, laiNam: 12, soThang: 12, kieu: 'goc-deu' });
  assert.equal(g.tongLai, 780000); assert.equal(g.kyDau, 1_120_000); assert.equal(g.kyCuoi, 1_010_000);
});
test('Lãi kép và gửi tiết kiệm', () => {
  assert.equal(guiTietKiem({ soTien: 100e6, laiNam: 6, soThang: 12 }).lai, 6_000_000);
  const k = laiKep({ von: 100e6, laiNam: 6, soNam: 1, kyGhep: 12, gopThang: 0 });
  assert.equal(k.tong, Math.round(100e6 * Math.pow(1.005, 12)));
});
test('Tỉ lệ trả nợ trên thu nhập', () => {
  assert.equal(tyLeTraNo(3e6, 20e6).muc, 'nhe');
  assert.equal(tyLeTraNo(8e6, 20e6).muc, 'vua');
  assert.equal(tyLeTraNo(12e6, 20e6).muc, 'nang');
  assert.equal(tyLeTraNo(1, 0), null);
});

// ---------- .ics ----------
test('ICS: cấu trúc, CRLF, lặp tháng, VALARM', () => {
  const s = taoICS([
    { id: 'luong-1', ten: 'Nhận lương', ngay: '2026-10-05', lap: 'thang', nhacTruoc: [0, 1] },
    { id: 'the-1', ten: 'Đóng thẻ tín dụng, hạn cuối', ngay: '2026-10-25', lap: 'thang', nhacTruoc: 3, moTa: 'Dòng 1\nDòng 2; có dấu chấm phẩy' },
    { id: 'cuoi', ten: 'Trả góp xe', ngay: '2026-10-31', lap: 'thang', nhacTruoc: 1 },
    { id: 'mot-lan', ten: 'Hạn quyết toán', ngay: '2027-04-30', lap: 'khong', nhacTruoc: 7 },
  ], { now: new Date(Date.UTC(2026, 9, 5, 1, 2, 3)) });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n') && s.endsWith('END:VCALENDAR\r\n'));
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.equal((s.match(/END:VEVENT/g) || []).length, 4);
  assert.equal((s.match(/BEGIN:VALARM/g) || []).length, 5);
  assert.ok(s.includes('DTSTAMP:20261005T010203Z'));
  assert.ok(s.includes('DTSTART;VALUE=DATE:20261005') && s.includes('DTEND;VALUE=DATE:20261006'));
  assert.ok(s.includes('RRULE:FREQ=MONTHLY\r\n'));
  assert.ok(s.includes('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'));
  assert.ok(s.includes('TRIGGER:PT9H') && s.includes('TRIGGER:-P0DT15H') && s.includes('TRIGGER:-P2DT15H') && s.includes('TRIGGER:-P6DT15H'));
  assert.ok(s.includes('DESCRIPTION:Dòng 1\\nDòng 2\\; có dấu chấm phẩy'));
  assert.ok(s.includes('SUMMARY:Đóng thẻ tín dụng\\, hạn cuối'));
  assert.ok(!/[^\r]\n/.test(s), 'mọi xuống dòng phải là CRLF');
  const enc = new TextEncoder();
  for (const dong of s.split('\r\n')) assert.ok(enc.encode(dong).length <= 75, 'dòng quá 75 octet: ' + dong);
});
test('ICS: gập dòng không làm mất chữ', () => {
  const dai = 'SUMMARY:' + 'Trả nợ vay mua nhà ngân hàng '.repeat(8);
  const gap = gapDong(dai);
  assert.equal(gap.replace(/\r\n /g, ''), dai);
  assert.ok(gap.includes('\r\n '));
});
test('ICS: trigger và thoát chữ', () => {
  assert.equal(triggerNgay(0), 'PT9H'); assert.equal(triggerNgay(1), '-P0DT15H'); assert.equal(triggerNgay(3), '-P2DT15H');
  assert.equal(thoatChu('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});
test('ICS: bỏ qua sự kiện sai ngày, không ném lỗi', () => {
  const s = taoICS([{ id: 'x', ten: 'Sai', ngay: 'abc' }]);
  assert.ok(!s.includes('BEGIN:VEVENT'));
});

test('Gợi ý tỉ lệ khi khoản cố định gần hết hũ Thiết yếu', () => {
  const g = goiYTiLe({ net: 31_153_750, hu: MAU_HU['6-hu'].hu, coDinh: [{ soTien: 15_500_000, hu: 'thiet-yeu' }] });
  assert.equal(g.can, 65); assert.equal(Object.values(g.tyLe).reduce((a, b) => a + b, 0), 100);
  assert.equal(goiYTiLe({ net: 30e6, hu: MAU_HU['4-hu'].hu, coDinh: [{ soTien: 3e6, hu: 'thiet-yeu' }] }), null);
  assert.equal(goiYTiLe({ net: 0, hu: MAU_HU['4-hu'].hu, coDinh: [] }), null);
});
