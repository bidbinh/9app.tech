import test from 'node:test';
import assert from 'node:assert/strict';
import { BAI_THEO_ID } from '../js/data/exercises.js';
import { CHUONG_TRINH } from '../js/data/programs.js';
import { docDem, moTaDem } from '../js/data/ex-base.js';
import {
  dauTuan, thuTrongTuan, congNgay, soNgayGiua, khoiLuongSet, tongKhoiLuong, khoiLuongTheoNhom, sRPE, taiTuan, canhBaoTai,
  goiYTangTa, e1RM, tinhPR, kiemTraPR, lenLich, baiCuaBuoi, taoICS, chuoiTuan, vo2Cooper, chieuCaoBat, rpeBuoi, chuoiTaiTuan,
} from '../js/lib/calc.js';
import { boDau, khoaTim, khop } from '../js/lib/text.js';

test('chuẩn hóa tìm không dấu', () => {
  assert.equal(boDau('Đứng một chân, nhắm mắt'), 'Dung mot chan, nham mat');
  assert.equal(khoaTim('  Hít   ĐẤT '), 'hit dat');
  assert.ok(khop(khoaTim('Squat Bulgaria chân sau gác ghế'), 'chan ghe'));
  assert.ok(khop(khoaTim('Nhón gót một chân'), 'nhon got'));
  assert.ok(!khop(khoaTim('Plank'), 'squat'));
});

test('ngày: đầu tuần là thứ Hai', () => {
  assert.equal(dauTuan('2026-10-05'), '2026-10-05');
  assert.equal(dauTuan('2026-10-11'), '2026-10-05');
  assert.equal(thuTrongTuan('2026-10-07'), 2);
  assert.equal(congNgay('2026-10-31', 1), '2026-11-01');
  assert.equal(soNgayGiua('2026-10-01', '2026-10-08'), 7);
});

test('đọc và mô tả mã đếm', () => {
  assert.deepEqual(docDem('L3x8-12'), { kieu: 'lan', hiep: 3, lanMin: 8, lanMax: 12, moiBen: false });
  assert.equal(moTaDem(docDem('T3x30b')), '3 hiệp × 30 giây mỗi bên');
  assert.equal(docDem('abc'), null);
});

test('khối lượng hiệp × lần × kg và theo nhóm cơ', () => {
  assert.equal(khoiLuongSet({ lan: 10, kg: 20 }), 200);
  assert.equal(khoiLuongSet({ lan: 10, kg: 0 }), 0);
  assert.equal(tongKhoiLuong([{ lan: 10, kg: 20 }, { lan: 8, kg: 22.5 }]), 380);
  const buoi = [
    { ngay: '2026-10-06', bai: [{ ex: 'squat-goblet', sets: [{ lan: 10, kg: 16 }, { lan: 10, kg: 16 }, { lan: 8, kg: 16 }] }] },
    { ngay: '2026-10-12', bai: [{ ex: 'squat-goblet', sets: [{ lan: 10, kg: 16 }] }] },
  ];
  const kq = khoiLuongTheoNhom(buoi, BAI_THEO_ID, '2026-10-05');
  assert.equal(kq['dui-truoc'].hiep, 3);
  assert.equal(kq['dui-truoc'].kg, 28 * 16);
  assert.equal(kq['mong'].hiep, 1.5);
  assert.equal(kq['mong'].kg, 0);
});

test('sRPE và tải tuần gồm buổi tập và buổi chơi', () => {
  assert.equal(sRPE(7, 60), 420);
  assert.equal(sRPE(0, 60), 0);
  const buoi = [{ ngay: '2026-10-05', phut: 50, rpe: 6, bai: [] }, { ngay: '2026-10-08', phut: 40, bai: [{ ex: 'plank', sets: [{ giay: 30, rpe: 8 }, { giay: 30, rpe: 6 }] }] }];
  const choi = [{ ngay: '2026-10-10', phut: 90, rpe: 7 }, { ngay: '2026-10-13', phut: 60, rpe: 5 }];
  const t = taiTuan(buoi, choi, '2026-10-05');
  assert.equal(t.tap, 300 + 280);
  assert.equal(t.choi, 630);
  assert.equal(t.tong, 1210);
  assert.equal(rpeBuoi({ bai: [] }).uoc, true);
  const ch = chuoiTaiTuan(buoi, choi, '2026-10-13', 3);
  assert.equal(ch.length, 3);
  assert.equal(ch[2].tong, 300);
});

test('cảnh báo tăng tải so với trung bình 4 tuần', () => {
  assert.equal(canhBaoTai(500, [400, 400, 400, 400]).muc, 'on');
  assert.equal(canhBaoTai(560, [400, 400, 400, 400]).muc, 'luu-y');
  assert.equal(canhBaoTai(700, [400, 400, 400, 400]).muc, 'cao');
  assert.equal(canhBaoTai(520, [400, 400, 400, 400]).muc, 'on');
  assert.equal(canhBaoTai(900, [0, 0, 0, 400]).muc, 'chua-du');
  assert.equal(canhBaoTai(900, []).muc, 'chua-du');
});

test('gợi ý tăng tạ', () => {
  const dem = docDem('L3x8-12');
  const du = [{ lan: 12, kg: 20, rpe: 7 }, { lan: 12, kg: 20, rpe: 7 }, { lan: 12, kg: 20, rpe: 7 }];
  assert.equal(goiYTangTa(du, dem, false).kg, 22);
  assert.equal(goiYTangTa(du, dem, true).kg, 22);
  const nang = du.map((s) => ({ ...s, kg: 50 }));
  assert.equal(goiYTangTa(nang, dem, true).kg, 55);
  assert.equal(goiYTangTa(nang, dem, false).kg, 52.5);
  assert.equal(goiYTangTa(du, dem, false).loai, 'tang-ta');
  assert.equal(goiYTangTa(du.map((s) => ({ ...s, rpe: 9 })), dem).loai, 'giu');
  assert.equal(goiYTangTa([{ lan: 12, kg: 20 }, { lan: 10, kg: 20 }], dem).loai, 'giu');
  assert.equal(goiYTangTa([{ lan: 12, kg: 8 }], dem).kg, 8.5);
  assert.equal(goiYTangTa([{ lan: 12, kg: 3 }], dem).loai, 'giu');
  for (const kg of [6, 12, 20, 33, 47.5, 80]) { const r = goiYTangTa([{ lan: 12, kg }], dem, kg % 2 === 0); if (r.loai === 'tang-ta') assert.ok(r.kg <= kg * 1.1 + 1e-9, `${kg} -> ${r.kg}`); }
  assert.equal(goiYTangTa([{ giay: 90 }, { giay: 90 }], docDem('T3x30')).loai, 'kho-hon');
  assert.equal(goiYTangTa([{ lan: 12, kg: 0 }], dem).loai, 'kho-hon');
  assert.equal(goiYTangTa([{ lan: 5, kg: 30, rpe: 10 }], dem).loai, 'giam');
  assert.equal(goiYTangTa([], dem).loai, 'moi');
  assert.equal(goiYTangTa([{ giay: 30 }, { giay: 30 }], docDem('T3x30')).loai, 'tang-giay');
});

test('kỷ lục cá nhân', () => {
  assert.equal(e1RM(100, 5), 116.7);
  assert.equal(e1RM(100, 15), 0);
  const ls = [{ ngay: '2026-09-01', sets: [{ lan: 10, kg: 40 }] }, { ngay: '2026-09-08', sets: [{ lan: 8, kg: 45 }] }];
  const pr = tinhPR(ls);
  assert.equal(pr.kg.kg, 45);
  assert.deepEqual(kiemTraPR(ls, { lan: 6, kg: 50 }), ['kg']);
  assert.deepEqual(kiemTraPR(ls, { lan: 10, kg: 40 }), []);
  assert.deepEqual(kiemTraPR([], { lan: 10, kg: 40 }), []);
  const w = [{ ngay: 'a', sets: [{ lan: 15, kg: 0 }] }];
  assert.deepEqual(kiemTraPR(w, { lan: 16, kg: 0 }), ['lan']);
  const t = [{ ngay: 'a', sets: [{ giay: 60 }] }];
  assert.deepEqual(kiemTraPR(t, { giay: 75 }), ['giay']);
});

test('lịch chương trình: ngày chọn, xoay vòng phiên, số buổi', () => {
  const ct = CHUONG_TRINH.find((c) => c.id === 'cau-long-4t');
  const l = lenLich(ct, { batDau: '2026-10-05', thu: [0, 2, 4] });
  assert.equal(l.length, 12);
  assert.deepEqual(l.slice(0, 4).map((x) => x.ngay), ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']);
  assert.deepEqual(l.slice(0, 4).map((x) => x.phienIdx), [0, 1, 2, 0]);
  assert.equal(l[0].khoi, 0);
  assert.equal(l[11].khoi, 3);
  assert.ok(l.slice(9).every((x) => x.giamTai));
  assert.ok(l.slice(0, 9).every((x) => !x.giamTai));
  assert.deepEqual(lenLich(ct, { batDau: '2026-10-05', thu: [] }), []);
  const l2 = lenLich(ct, { batDau: '2026-10-07', thu: [0, 2, 4] });
  assert.equal(l2.length, 12);
  assert.equal(l2[0].ngay, '2026-10-07');
});

test('giảm tải trước giải: 7 ngày trước giảm, 2 ngày liền trước bỏ buổi', () => {
  const ct = CHUONG_TRINH.find((c) => c.id === 'cau-long-4t');
  const l = lenLich(ct, { batDau: '2026-10-05', thu: [0, 1, 2, 3, 4, 5, 6], ngayGiai: '2026-10-20' });
  const theoNgay = Object.fromEntries(l.map((x) => [x.ngay, x]));
  assert.equal(theoNgay['2026-10-20'], undefined);
  assert.equal(theoNgay['2026-10-19'], undefined);
  assert.equal(theoNgay['2026-10-18'], undefined);
  assert.equal(theoNgay['2026-10-17'].giamTai, true);
  assert.equal(theoNgay['2026-10-13'].giamTai, true);
  assert.equal(theoNgay['2026-10-12'].giamTai, false);
  const csm = CHUONG_TRINH.find((c) => c.id === 'suc-manh-tai-nha-4t');
  const l3 = lenLich(csm, { batDau: '2026-10-05', thu: [0, 2, 4], ngayGiai: '2026-10-09' });
  assert.ok(l3.some((x) => x.ngay === '2026-10-09'), 'chương trình không theo môn không bị cắt');
});

test('số hiệp theo tuần và giảm tải', () => {
  const ct = CHUONG_TRINH.find((c) => c.id === 'cau-long-4t');
  const base = baiCuaBuoi(ct, { khoi: 0, phienIdx: 0, giamTai: false }, BAI_THEO_ID);
  const t3 = baiCuaBuoi(ct, { khoi: 2, phienIdx: 0, giamTai: false }, BAI_THEO_ID);
  const gt = baiCuaBuoi(ct, { khoi: 0, phienIdx: 0, giamTai: true }, BAI_THEO_ID);
  const iSm = base.findIndex((b) => BAI_THEO_ID.get(b.ex).loai === 'suc-manh');
  assert.equal(base[iSm].dem.hiep, 3);
  assert.equal(t3[iSm].dem.hiep, 4);
  assert.equal(t3.filter((b, i) => b.dem.hiep > base[i].dem.hiep).length, 2, 'chỉ tăng ở 2 bài chính');
  assert.equal(gt[iSm].dem.hiep, 2);
  assert.equal(base.length, ct.phien[0].bai.length);
});

test('tuần giảm tải đúng bằng khoảng 60 phần trăm số hiệp', () => {
  const ct = CHUONG_TRINH.find((c) => c.id === 'suc-manh-tai-nha-4t');
  const tong = (m) => baiCuaBuoi(ct, m, BAI_THEO_ID).reduce((a, b) => a + b.dem.hiep, 0);
  const th = tong({ khoi: 0, phienIdx: 0, giamTai: false }); const gt = tong({ khoi: 0, phienIdx: 0, giamTai: true });
  assert.ok(gt / th >= 0.5 && gt / th <= 0.7, `${gt}/${th}`);
});

test('sinh .ics có VALARM, CRLF, thoát ký tự, gấp dòng', () => {
  const sk = [
    { key: 'a:2026-10-05', ngay: '2026-10-05', tieuDe: 'Tập 9fit, A; chân', moTa: 'Dòng 1\nDòng 2 ' + 'rất dài '.repeat(30) },
    { key: 'a:2026-10-07', ngay: '2026-10-07', tieuDe: 'Tập B', moTa: 'x' },
  ];
  const s = taoICS(sk, { gio: '23:30', phut: 45, nhacTruoc: 15, now: new Date(Date.UTC(2026, 9, 4, 1, 2, 3)) });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((s.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.ok(s.includes('TRIGGER:-PT15M'));
  assert.ok(s.includes('DTSTART:20261005T233000'));
  assert.ok(s.includes('DTEND:20261006T001500'));
  assert.ok(s.includes('DTSTAMP:20261004T010203Z'));
  assert.ok(s.includes('SUMMARY:Tập 9fit\\, A\\; chân'));
  assert.ok(!/[^\r]\n/.test(s), 'chỉ dùng CRLF');
  for (const dong of s.split('\r\n')) assert.ok(new TextEncoder().encode(dong).length <= 75, 'dòng quá 75 byte: ' + dong);
  const gop = s.replace(/\r\n /g, '');
  assert.ok(gop.includes('Dòng 1\\nDòng 2 rất dài'));
});

test('chuỗi tuần nhẹ nhàng', () => {
  assert.equal(chuoiTuan(['2026-09-22', '2026-09-30', '2026-10-05'], '2026-10-06'), 3);
  assert.equal(chuoiTuan(['2026-09-22', '2026-09-30'], '2026-10-06'), 2);
  assert.equal(chuoiTuan(['2026-09-01'], '2026-10-06'), 0);
  assert.equal(chuoiTuan([], '2026-10-06'), 0);
});

test('bài kiểm tra thể lực', () => {
  assert.equal(vo2Cooper(2400), 42.4);
  assert.equal(chieuCaoBat(210, 255), 45);
  assert.equal(chieuCaoBat(210, 200), null);
});
