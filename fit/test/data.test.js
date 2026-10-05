import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BAI_TAP, BAI_THEO_ID } from '../js/data/exercises.js';
import { NHOM, DUNG_CU, LOAI, MON, docDem } from '../js/data/ex-base.js';
import { CHUONG_TRINH } from '../js/data/programs.js';
import { CHUOI, KHO, QUY_TAC } from '../js/data/routines.js';
import { dungChuoi, tongGiay } from '../js/lib/routine.js';
import { danhSachChucNang } from '../js/data/functions.js';

test('số bài trong khoảng 120 đến 150', () => {
  assert.ok(BAI_TAP.length >= 120 && BAI_TAP.length <= 150, `có ${BAI_TAP.length} bài`);
});

test('id duy nhất, dạng chữ thường gạch nối', () => {
  const ids = new Set();
  for (const b of BAI_TAP) {
    assert.match(b.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, b.id);
    assert.ok(!ids.has(b.id), `trùng id ${b.id}`);
    ids.add(b.id);
  }
});

test('mọi trường bắt buộc, nhóm cơ, dụng cụ, loại, môn hợp lệ', () => {
  for (const b of BAI_TAP) {
    assert.ok(b.ten && b.ten.length >= 3, b.id);
    assert.ok(b.nhomChinh.length >= 1, `${b.id} thiếu nhóm chính`);
    for (const n of [...b.nhomChinh, ...b.nhomPhu]) assert.ok(NHOM[n], `${b.id}: nhóm cơ lạ ${n}`);
    assert.ok(b.dungCu.length >= 1, `${b.id} thiếu dụng cụ`);
    for (const d of b.dungCu) assert.ok(DUNG_CU[d], `${b.id}: dụng cụ lạ ${d}`);
    assert.ok(LOAI[b.loai], `${b.id}: loại lạ ${b.loai}`);
    assert.ok([1, 2, 3].includes(b.mucDo), b.id);
    assert.ok(b.mon.length >= 1, `${b.id} chưa gắn môn`);
    for (const m of b.mon) assert.ok(MON[m], `${b.id}: môn lạ ${m}`);
    assert.ok(b.dem && docDem(b.demMa), `${b.id}: mã đếm sai ${b.demMa}`);
    assert.ok(b.dem.hiep >= 1);
    assert.ok(b.loi.length >= 1 && b.loi.every((l) => l.length > 3), `${b.id} thiếu lỗi thường gặp`);
    assert.ok(b.de && b.kho && b.luuY, `${b.id} thiếu biến thể hoặc lưu ý`);
  }
});

test('mỗi bài có từ 3 đến 6 bước', () => {
  for (const b of BAI_TAP) assert.ok(b.buoc.length >= 3 && b.buoc.length <= 6, `${b.id} có ${b.buoc.length} bước`);
});

test('tham chiếu biến thể dễ và khó trỏ đến bài có thật, không trỏ chính nó', () => {
  for (const b of BAI_TAP) {
    for (const k of ['deId', 'khoId']) {
      if (!b[k]) continue;
      assert.ok(BAI_THEO_ID.has(b[k]), `${b.id}.${k} -> ${b[k]} không có`);
      assert.notEqual(b[k], b.id);
    }
  }
});

test('thư viện đủ loại, mỗi môn có nhiều bài, nhiều bài không dụng cụ', () => {
  for (const l of Object.keys(LOAI)) assert.ok(BAI_TAP.some((b) => b.loai === l), `thiếu loại ${l}`);
  for (const m of Object.keys(MON)) assert.ok(BAI_TAP.filter((b) => b.mon.includes(m)).length >= 40, `môn ${m} ít bài`);
  assert.ok(BAI_TAP.filter((b) => b.dungCu.includes('khong')).length >= 40);
});

test('chương trình: mọi bài tồn tại, 2 đến 4 tuần, mỗi môn có chương trình', () => {
  assert.ok(CHUONG_TRINH.length >= 9);
  const ids = new Set();
  for (const ct of CHUONG_TRINH) {
    assert.ok(!ids.has(ct.id)); ids.add(ct.id);
    assert.ok(ct.tuanPlan.length >= 2 && ct.tuanPlan.length <= 4, ct.id);
    assert.ok(ct.phien.length >= 2, ct.id);
    for (const p of ct.phien) {
      assert.ok(p.bai.length >= 4);
      for (const [id, ghiDe] of p.bai) {
        assert.ok(BAI_THEO_ID.has(id), `${ct.id}: bài ${id} không có`);
        if (ghiDe) assert.ok(docDem(ghiDe), `${ct.id}: đếm sai ${ghiDe}`);
      }
      for (const k of [p.kd, p.ph]) if (k) assert.ok(CHUOI.some((c) => c.id === k), `${ct.id}: chuỗi ${k} không có`);
    }
  }
  for (const m of Object.keys(MON)) assert.ok(CHUONG_TRINH.some((c) => c.mon === m), `môn ${m} thiếu chương trình`);
  for (const g of ['suc-manh', 'giam-mo', 'suc-ben', 'linh-hoat', 'phuc-hoi']) assert.ok(CHUONG_TRINH.some((c) => c.mucTieu === g), g);
  for (const ct of CHUONG_TRINH.filter((c) => c.mon)) assert.ok(ct.giamTaiTruocGiai);
  for (const ct of CHUONG_TRINH.filter((c) => c.tuanPlan.length >= 3)) assert.ok(ct.tuanPlan.some((t) => t.giamTai), `${ct.id} không có tuần giảm tải`);
});

test('chuỗi khởi động: đủ 5/10/15/20/30 phút, yoga 10/20/30, mọi bài tồn tại, thời gian khớp', () => {
  for (const [k, ds] of Object.entries(KHO)) for (const id of ds) assert.ok(BAI_THEO_ID.has(id), `${k}: ${id}`);
  for (const mon of ['cau-long', 'pickleball', 'bong-da', 'chay-bo', 'chung']) {
    for (const p of [5, 10, 15, 20, 30]) {
      assert.ok(CHUOI.some((c) => c.id === `kd-${mon}-${p}`) && CHUOI.some((c) => c.id === `ph-${mon}-${p}`), `${mon} ${p}`);
    }
  }
  for (const p of [10, 20, 30]) assert.ok(CHUOI.some((c) => c.id === `yoga-${p}`));
  for (const c of CHUOI) {
    const buoc = dungChuoi(KHO[c.kho], c.phut, BAI_THEO_ID, QUY_TAC[c.kho]);
    const t = tongGiay(buoc);
    assert.ok(buoc.length >= 3, c.id);
    assert.ok(Math.abs(t - c.phut * 60) <= c.phut * 60 * 0.08, `${c.id}: ${t}s so với ${c.phut * 60}s`);
    assert.ok(buoc.every((b) => b.giay >= 10));
  }
});

test('chỉ mục tìm kiếm đúng định dạng và khớp nguồn', () => {
  const file = JSON.parse(fs.readFileSync(new URL('../search-index.json', import.meta.url), 'utf8'));
  const nguon = danhSachChucNang();
  assert.deepEqual(file, nguon, 'search-index.json cũ: chạy npm run index');
  const paths = new Set();
  for (const e of file) {
    assert.deepEqual(Object.keys(e).sort(), ['blurb', 'keywords', 'name', 'path']);
    assert.match(e.path, /^#\//);
    assert.ok(!e.path.includes('?'));
    assert.ok(!paths.has(e.path), `trùng path ${e.path}`);
    paths.add(e.path);
    assert.equal(new Set(e.keywords).size, e.keywords.length);
    for (const k of e.keywords) assert.equal(k, k.toLowerCase());
  }
});

test('sw.js liệt kê đủ tệp vỏ ứng dụng', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const quet = (d, out = []) => { for (const f of fs.readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })) { if (f.isDirectory()) quet(`${d}/${f.name}`, out); else out.push(`./${d}/${f.name}`); } return out; };
  for (const d of ['css', 'js', 'icons']) for (const f of quet(d)) assert.ok(sw.includes(`"${f}"`), `sw.js thiếu ${f}; chạy npm run sw`);
});
