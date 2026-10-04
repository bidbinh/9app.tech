import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { questions, sets, root } from './helpers.mjs';
import { validateData } from '../tools/lib/validate.mjs';

const imgOk = (f) => fs.existsSync(path.join(root, 'data/img', f));
const miniSets = { A: { pool: [1], crit: [] }, B1: { pool: [1], crit: [] }, all: { pool: [1], crit: [] } };

test('dữ liệu thật: hợp lệ, 600 câu, id duy nhất, đáp án thuộc lựa chọn, ảnh tồn tại', () => {
  const r = validateData({ questions, sets, imgExists: imgOk, expectCount: 600 });
  assert.deepEqual(r.errors, []);
  assert.equal(new Set(questions.map((q) => q.id)).size, 600);
  for (const q of questions) {
    assert.ok(q.a >= 0 && q.a < q.opts.length, 'đáp án ngoài lựa chọn ở câu ' + q.id);
    if (q.img) assert.ok(imgOk(q.img), 'thiếu ảnh ' + q.img);
  }
});

test('dữ liệu thật: số câu theo chương đúng bố cục Công văn 2262/CSGT-P5', () => {
  const per = {};
  for (const q of questions) per[q.ch] = (per[q.ch] || 0) + 1;
  assert.deepEqual(per, { 1: 180, 2: 25, 3: 58, 4: 37, 5: 185, 6: 115 });
  const range = { 1: [1, 180], 2: [181, 205], 3: [206, 263], 4: [264, 300], 5: [301, 485], 6: [486, 600] };
  for (const q of questions) assert.ok(q.id >= range[q.ch][0] && q.id <= range[q.ch][1], 'câu ' + q.id + ' sai chương');
});

test('dữ liệu thật: câu chương 5 và 6 đều có hình', () => {
  for (const q of questions) if (q.ch >= 5) assert.ok(q.img, 'thiếu hình ở câu ' + q.id);
});

test('dữ liệu thật: 60 câu điểm liệt đúng danh sách Phụ lục III', () => {
  const expected = [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 32, 34, 35, 47, 48, 52, 53, 55, 58, 63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 74, 85, 86, 87, 88, 89, 90, 91, 92, 93, 97, 98, 102, 117, 163, 165, 167, 197, 198, 206, 215, 226, 234, 245, 246, 252, 253, 254, 255, 260];
  assert.deepEqual(questions.filter((q) => q.crit).map((q) => q.id), expected);
  assert.deepEqual(sets.all.crit.slice().sort((a, b) => a - b), expected);
});

test('dữ liệu thật: điểm liệt của A1/A (20) và B1 (30) là tập con của tập hạng', () => {
  const critSet = new Set(sets.all.crit);
  for (const k of ['A', 'B1']) {
    const pool = new Set(sets[k].pool);
    for (const id of sets[k].crit) {
      assert.ok(pool.has(id));
      assert.ok(critSet.has(id));
    }
  }
});

test('dữ liệu thật: không lẫn tiêu đề chương, khoảng trắng thừa hay ký tự lạ vào nội dung', () => {
  for (const q of questions) {
    for (const s of [q.q, ...q.opts]) {
      assert.ok(!/CHƯƠNG/.test(s), 'câu ' + q.id);
      assert.ok(s === s.trim() && !/\s{2,}/.test(s), 'khoảng trắng ở câu ' + q.id);
      assert.ok(!/�/.test(s), 'ký tự lỗi ở câu ' + q.id);
    }
  }
});

test('validateData bắt lỗi: id trùng', () => {
  const r = validateData({ questions: [questions[0], { ...questions[0] }], sets: miniSets });
  assert.ok(r.errors.some((e) => e.includes('id trùng')));
});

test('validateData bắt lỗi: đáp án đúng không thuộc lựa chọn, thiếu lựa chọn', () => {
  let r = validateData({ questions: [{ ...questions[0], a: 7 }], sets: miniSets });
  assert.ok(r.errors.some((e) => e.includes('không thuộc danh sách lựa chọn')));
  r = validateData({ questions: [{ ...questions[0], opts: ['chỉ một'], a: 0 }], sets: miniSets });
  assert.ok(r.errors.some((e) => e.includes('2 đến 4')));
});

test('validateData bắt lỗi: ảnh không tồn tại', () => {
  const r = validateData({ questions: [{ ...questions[0], img: 'khong-co.webp' }], sets: miniSets, imgExists: () => false });
  assert.ok(r.errors.some((e) => e.includes('ảnh không tồn tại')));
});

test('validateData bắt lỗi: tập tham chiếu id không có, điểm liệt ngoài tập, thiếu cờ crit', () => {
  const q1 = { ...questions[0] };
  delete q1.crit;
  let r = validateData({ questions: [q1], sets: { A: { pool: [1, 99], crit: [] }, B1: { pool: [1], crit: [] }, all: { pool: [1], crit: [] } } });
  assert.ok(r.errors.some((e) => e.includes('id 99')));
  r = validateData({ questions: [q1], sets: { A: { pool: [1], crit: [1] }, B1: { pool: [1], crit: [] }, all: { pool: [1], crit: [] } } });
  assert.ok(r.errors.some((e) => e.includes('chưa gắn cờ crit')));
  r = validateData({ questions: [{ ...q1, crit: 1 }], sets: { A: { pool: [], crit: [1] }, B1: { pool: [1], crit: [] }, all: { pool: [1], crit: [] } } });
  assert.ok(r.errors.some((e) => e.includes('không nằm trong pool')));
});
