import test from 'node:test';
import assert from 'node:assert/strict';
import { BAI_THEO_ID, BAI_TAP } from '../js/data/exercises.js';
import { CHUONG_TRINH } from '../js/data/programs.js';
import { CHUOI, KHO, QUY_TAC } from '../js/data/routines.js';
import { DUNG_CU, TAI_NHA } from '../js/data/ex-base.js';
import { baiCuaBuoi, hiepDaLam, khoiLuongTheoNhom, tongKhoiLuong, ngayLienKe, canNghi48h, mucConHan, sRPE, kepRPE } from '../js/lib/calc.js';
import { danhGiaSangLoc, CAU_HOI } from '../js/lib/parq.js';
import { choPhepBai, choPhepChuongTrinh, choPhepTest, thieuBaiNen, laBaiHanChe, BAI_NEN } from '../js/lib/an-toan.js';
import { buoi as sBuoi, lamSachMang, kehoach as sKeHoach } from '../js/lib/schema.js';
import { kiemTraGoi } from '../js/lib/db.js';
import { BAI_TEST, hopLeTest } from '../js/lib/fitness.js';
import { dungChuoi } from '../js/lib/routine.js';

const khong = Object.fromEntries(CAU_HOI.map((c) => [c.id, false]));

test('C1: chỉ hiệp đã bấm xong hoặc tự nhập mới tính; giá trị điền sẵn không tính', () => {
  const sets = [{ lan: 12, kg: 20, xong: true }, { lan: 12, kg: 20 }, { lan: 12, kg: 20, tay: true }, { lan: 12, kg: 20, xong: false }];
  assert.equal(hiepDaLam(sets).length, 2);
  const ba = [{ lan: 12, kg: 20, xong: true }, { lan: 12, kg: 20, xong: false }, { lan: 12, kg: 20, xong: false }];
  const b = { ngay: '2026-10-06', bai: [{ ex: 'squat-goblet', sets: hiepDaLam(ba) }] };
  assert.equal(b.bai[0].sets.length, 1);
  assert.equal(tongKhoiLuong(b.bai[0].sets), 240);
  assert.equal(khoiLuongTheoNhom([b], BAI_THEO_ID, '2026-10-05')['dui-truoc'].hiep, 1);
});

test('C3: sàng lọc 3 mức, thai kỳ, trẻ em, tuổi cao, bệnh mạn tính', () => {
  assert.equal(danhGiaSangLoc(30, khong).ketQua, 'duoc-phep');
  assert.equal(danhGiaSangLoc(NaN, khong).ketQua, 'thieu');
  assert.equal(danhGiaSangLoc(130, khong).ketQua, 'thieu');
  assert.equal(danhGiaSangLoc(30, { ...khong, tim: undefined }).ketQua, 'thieu');
  for (const c of CAU_HOI) {
    const r = danhGiaSangLoc(30, { ...khong, [c.id]: true });
    const mong = c.muc === 'dung' ? 'dung-lai' : c.muc === 'hoi' ? 'hoi-bac-si' : 'duoc-phep';
    assert.equal(r.ketQua, mong, c.id);
  }
  assert.ok(danhGiaSangLoc(30, { ...khong, 'it-van-dong': true }).luuY.length === 1);
  const tre = danhGiaSangLoc(14, khong);
  assert.equal(tre.ketQua, 'dung-lai');
  assert.ok(tre.huongDan.join(' ').includes('huấn luyện viên'));
  assert.ok(tre.huongDan.join(' ').includes('phụ huynh'));
  assert.ok(danhGiaSangLoc(28, { ...khong, thai: true }).huongDan.join(' ').includes('bác sĩ sản'));
  assert.equal(danhGiaSangLoc(70, khong).ketQua, 'hoi-bac-si');
  assert.equal(danhGiaSangLoc(40, { ...khong, 'man-tinh': true }).ketQua, 'hoi-bac-si');
  assert.equal(danhGiaSangLoc(40, { ...khong, thuoc: true, tim: true }).ketQua, 'dung-lai');
  assert.ok(CAU_HOI.some((c) => /12 tháng/.test(c.chu)));
  const thuoc = CAU_HOI.find((c) => c.id === 'thuoc').chu;
  assert.ok(thuoc.includes('tiểu đường') && thuoc.includes('chống đông') && thuoc.includes('động kinh'));
});

test('C2: chính sách theo mức sàng lọc', () => {
  const nordic = BAI_THEO_ID.get('nordic-ho-tro'); const nhay = BAI_THEO_ID.get('squat-nhay'); const plank = BAI_THEO_ID.get('plank');
  assert.ok(laBaiHanChe(nordic) && laBaiHanChe(nhay) && !laBaiHanChe(plank));
  assert.equal(choPhepBai('dung-lai', plank).ok, false);
  for (const m of ['chua', 'hoi-bac-si']) { assert.equal(choPhepBai(m, nordic).ok, false); assert.equal(choPhepBai(m, nhay).ok, false); assert.equal(choPhepBai(m, plank).ok, true); }
  assert.equal(choPhepBai('duoc-phep', nordic).ok, true);
  const ct = (id) => CHUONG_TRINH.find((c) => c.id === id);
  assert.equal(choPhepChuongTrinh('dung-lai', ct('linh-hoat-2t'), BAI_THEO_ID), false);
  assert.equal(choPhepChuongTrinh('chua', ct('linh-hoat-2t'), BAI_THEO_ID), false);
  assert.equal(choPhepChuongTrinh('hoi-bac-si', ct('bong-da-4t'), BAI_THEO_ID), false);
  assert.equal(choPhepChuongTrinh('hoi-bac-si', ct('cau-long-4t'), BAI_THEO_ID), false);
  for (const id of ['linh-hoat-2t', 'phuc-hoi-2t', 'van-dong-nhe-3t']) assert.equal(choPhepChuongTrinh('hoi-bac-si', ct(id), BAI_THEO_ID), true, id);
  assert.equal(choPhepChuongTrinh('duoc-phep', ct('bong-da-4t'), BAI_THEO_ID), true);
  assert.equal(choPhepTest('chua', BAI_TEST.cooper), false);
  assert.equal(choPhepTest('chua', BAI_TEST['chay-1600']), false);
  assert.equal(choPhepTest('chua', BAI_TEST.plank), true);
  assert.equal(choPhepTest('hoi-bac-si', BAI_TEST.cooper), false);
  assert.equal(choPhepTest('dung-lai', BAI_TEST.plank), false);
  assert.equal(choPhepTest('duoc-phep', BAI_TEST.cooper), true);
});

function tongHiepTuan(ct, khoi, giamTai = false) {
  return ct.phien.reduce((a, _, i) => a + baiCuaBuoi(ct, { khoi, phienIdx: i, giamTai }, BAI_THEO_ID).reduce((x, b) => x + b.dem.hiep, 0), 0);
}
test('T1/T2: tổng hiệp mỗi tuần không tăng quá 15 phần trăm; tuần giảm tải thấp hơn rõ', () => {
  for (const ct of CHUONG_TRINH) {
    const tong = ct.tuanPlan.map((t, k) => tongHiepTuan(ct, k, !!t.giamTai));
    for (let k = 1; k < tong.length; k++) {
      if (ct.tuanPlan[k].giamTai) { assert.ok(tong[k] <= tong[k - 1] * 0.8, `${ct.id} tuần ${k + 1}`); continue; }
      assert.ok(tong[k] <= tong[k - 1] * 1.15 + 1e-9, `${ct.id}: tuần ${k + 1} tăng ${(tong[k] / tong[k - 1]).toFixed(2)}`);
    }
  }
});

test('T3: bật nhảy, nhanh nhẹn đứng trước bài sức mạnh trong mỗi buổi', () => {
  for (const ct of CHUONG_TRINH) for (const p of ct.phien) {
    const loai = p.bai.map(([id]) => BAI_THEO_ID.get(id).loai);
    const dau = loai.indexOf('suc-manh');
    if (dau < 0) continue;
    loai.forEach((l, i) => { if ((l === 'bat-nhay' || l === 'nhanh-nhen') && i > dau) assert.fail(`${ct.id} ${p.ten}: ${p.bai[i][0]} sau bài sức mạnh`); });
  }
});

test('T4: ngày liền kề và chương trình cần nghỉ 48 giờ', () => {
  assert.deepEqual(ngayLienKe([0, 2, 4]), []);
  assert.deepEqual(ngayLienKe([0, 1, 2]), [[0, 1], [1, 2]]);
  assert.deepEqual(ngayLienKe([6, 0]), [[6, 0]]);
  assert.ok(canNghi48h(CHUONG_TRINH.find((c) => c.id === 'bong-da-4t'), BAI_THEO_ID));
  assert.ok(!canNghi48h(CHUONG_TRINH.find((c) => c.id === 'phuc-hoi-2t'), BAI_THEO_ID));
});

test('T6: bài khó giảm liều khởi điểm, không dồn một buổi; bài nền; sửa mức độ và dụng cụ', () => {
  const bd = CHUONG_TRINH.find((c) => c.id === 'bong-da-4t');
  const w1 = baiCuaBuoi(bd, { khoi: 0, phienIdx: 0, giamTai: false }, BAI_THEO_ID);
  assert.equal(w1.find((b) => b.ex === 'nordic-ho-tro').dem.hiep, 2);
  for (const ct of CHUONG_TRINH) for (const p of ct.phien) {
    const kho = p.bai.map(([id]) => id).filter((id) => BAI_THEO_ID.get(id).mucDo >= 3 && BAI_THEO_ID.get(id).loai === 'suc-manh');
    assert.ok(kho.length <= 1, `${ct.id} ${p.ten}: ${kho.join(',')}`);
  }
  assert.equal(BAI_THEO_ID.get('nhay-co-chan').mucDo, 2);
  assert.equal(BAI_THEO_ID.get('nhay-day').mucDo, 2);
  for (const ct of CHUONG_TRINH) for (const p of ct.phien) for (const [id] of p.bai) assert.ok(!['nhay-co-chan', 'nhay-day'].includes(id), ct.id);
  assert.ok(!BAI_THEO_ID.get('bat-len-bac').dungCu.includes('ghe'));
  assert.ok(DUNG_CU.bac);
  assert.ok(BAI_THEO_ID.get('ta-am-vung').dem.hiep <= 3);
  assert.ok(BAI_THEO_ID.get('hit-dat-vo-tay').de.includes('đầy đủ'));
  for (const [b, nen] of Object.entries(BAI_NEN)) { assert.ok(BAI_THEO_ID.has(b) && BAI_THEO_ID.has(nen), b); assert.notEqual(b, nen); }
  assert.equal(thieuBaiNen('nhay-1-chan', []), 'tiep-dat-em');
  assert.equal(thieuBaiNen('nhay-1-chan', [{ bai: [{ ex: 'tiep-dat-em', sets: [{ lan: 5 }] }] }]), null);
  assert.equal(thieuBaiNen('plank', []), null);
});

test('T7: giới hạn bài kiểm tra Cooper', () => {
  assert.equal(hopLeTest('cooper', 2400), true);
  for (const v of [-5, 0, 799, 4501, 99999, NaN]) assert.equal(hopLeTest('cooper', v), false, String(v));
  assert.equal(hopLeTest('chay-1600', 120), false);
  assert.ok(BAI_TEST.cooper.bienThe.includes('Chạy') && BAI_TEST.cooper.bienThe.includes('Đi nhanh'));
});

test('L5: dữ liệu hỏng không làm sập, bị lọc khi nhập', () => {
  assert.equal(lamSachMang('buoi', [1, null, 'x', { ngay: null }, { ngay: '2026-10-05', bai: 'abc' }, { ngay: '2026-10-06', bai: [null, { ex: 1 }, { ex: 'plank', sets: [{ giay: 30 }, 5] }] }]).ds.length, 2);
  const b = sBuoi({ ngay: '2026-10-06', bai: [null, { ex: 'plank', sets: [{ giay: 30, rpe: 99 }, 'x'] }] });
  assert.equal(b.bai.length, 1); assert.equal(b.bai[0].sets.length, 1); assert.equal(b.bai[0].sets[0].rpe, 10);
  assert.equal(lamSachMang('dodac', [{ ngay: null }, { ngay: '2026-10-06', kg: 60 }]).ds.length, 1);
  assert.equal(sKeHoach({ ctId: 'x', muc: 'abc' }), null);
  assert.equal(sKeHoach('abc'), null);
  assert.equal(sKeHoach({ ctId: 'cau-long-4t', muc: [1, { key: 'a', ngay: '2026-10-06', khoi: 0, phienIdx: 0 }] }).muc.length, 1);
  const kt = kiemTraGoi({ ungDung: '9fit', phienBan: 1, duLieu: { buoi: [1, null, 'x', { ngay: '2026-10-06', bai: [] }], dodac: [{ ngay: null }], kehoach: { ctId: 'x', muc: 'abc' } } });
  assert.equal(kt.ok, true); assert.equal(kt.soMuc, 1); assert.ok(kt.bo >= 4);
  assert.equal(kiemTraGoi({ ungDung: '9fit', phienBan: 1, duLieu: { buoi: 'abc' } }).ok, false);
});

test('L2: RPE kẹp 1 đến 10', () => {
  assert.equal(kepRPE(15), 10); assert.equal(kepRPE(-3), 1); assert.equal(kepRPE(7), 7);
  assert.equal(sRPE(50, 60), 600);
});

test('L6-L11: nội dung bài, dụng cụ cho lọc tại nhà, nhóm cổ, thuật ngữ', () => {
  const taiNha = (b) => b.dungCu.includes('khong') || b.dungCu.every((d) => TAI_NHA.includes(d));
  for (const id of ['kiem-got-1-chan', 'dung-1-chan', 'ha-got-cham', 'squat-than-nguoi']) assert.ok(taiNha(BAI_THEO_ID.get(id)), id);
  assert.ok(BAI_THEO_ID.get('kiem-got-1-chan').dungCu.includes('tuong'));
  assert.ok(BAI_THEO_ID.get('ha-got-cham').dungCu.includes('bac'));
  assert.ok(BAI_THEO_ID.get('gian-co-ben').nhomChinh.includes('co'));
  assert.ok(BAI_THEO_ID.has('gian-khep-hong-buom') && !BAI_THEO_ID.has('gian-khep-hong-ech'));
  assert.ok(!/kiễng|Cầu mông|cầu mông một chân/.test(JSON.stringify(BAI_TAP)));
  assert.ok(!BAI_THEO_ID.get('lan-con-lan-bap').buoc.join(' ').includes('từ gót'));
  const x = BAI_THEO_ID.get('keo-dui-sau-khan');
  assert.notEqual(x.de, x.kho);
  assert.ok(BAI_THEO_ID.get('di-xach-ta').buoc.join(' ').includes('30 giây'));
  for (const id of ['ha-tay-ghe', 'nang-chan-nam', 'xoay-nga', 'duoi-tay-sau']) assert.ok(/vai|lưng/.test(BAI_THEO_ID.get(id).luuY), id);
});

test('L12: chỉ nhắc các buổi chưa làm và chưa quá hạn', () => {
  const kh = { muc: [{ key: 'a', ngay: '2026-10-01' }, { key: 'b', ngay: '2026-10-05' }, { key: 'c', ngay: '2026-10-07' }, { key: 'd', ngay: '2026-10-09' }], xong: { c: 'x' } };
  assert.deepEqual(mucConHan(kh, '2026-10-05').map((m) => m.key), ['b', 'd']);
});

test('L13/L14: khởi động kết thúc bằng bài nâng nhịp tim; bài đi bộ không lặp; yoga có thư giãn cuối', () => {
  for (const c of CHUOI) {
    const buoc = dungChuoi(KHO[c.kho], c.phut, BAI_THEO_ID, QUY_TAC[c.kho]);
    const q = QUY_TAC[c.kho];
    const ids = buoc.map((b) => b.ex);
    for (const id of [...q.dau, ...q.cuoi]) assert.equal(ids.filter((x) => x === id).length, 1, `${c.id}: ${id}`);
    if (q.cuoi.length) assert.equal(ids[ids.length - 1], q.cuoi[q.cuoi.length - 1], c.id);
    if (c.phut <= 10) assert.equal(new Set(buoc.map((b) => `${b.ex}|${b.ben}`)).size, buoc.length, `${c.id} lặp bài`);
    if (c.loai === 'khoi-dong') assert.ok(['nhay-sao-nhe', 'chay-a-skip'].includes(ids[ids.length - 1]), c.id);
    buoc.filter((b) => b.vong > 1).forEach((b) => assert.ok(!q.dau.includes(b.ex) && !q.cuoi.includes(b.ex)));
  }
  assert.ok(QUY_TAC.yoga.cuoi.includes('tho-bung'));
});

test('L15/L16 và T5: mô tả khớp nội dung', () => {
  assert.ok(!CHUONG_TRINH.find((c) => c.id === 'linh-hoat-2t').mota.includes('4 buổi mỗi tuần'));
  assert.ok(BAI_TEST['chay-1600'].mo.includes('1.600 m'));
  const mn = CHUONG_TRINH.find((c) => c.id === 'van-dong-nhe-3t');
  assert.ok(mn.mota.includes('150') && mn.mota.includes('WHO'));
  for (const p of mn.phien) for (const [id] of p.bai) assert.ok(!laBaiHanChe(BAI_THEO_ID.get(id)), id);
  assert.ok(!JSON.stringify(mn).includes('Đi bộ nhanh xen kẽ'));
});
