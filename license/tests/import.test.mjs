import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, rowsToQuestions, buildSets } from '../tools/import-questions.mjs';
import { validateData } from '../tools/lib/validate.mjs';

const csv = `id,ch,q,opt1,opt2,opt3,opt4,answer,crit,hang,img
1,1,"Câu hỏi có, dấu phẩy ""trích""?",Một,Hai,Cả hai ý trên,,3,1,A1|A|B1|B,
2,5,Biển nào?,Biển 1,Biển 2,,,2,,*,x.webp
`;

test('nhập CSV: đọc đúng dấu phẩy trong ngoặc kép, đáp án 1-based chuyển sang 0-based', () => {
  const items = rowsToQuestions(parseCSV(csv));
  assert.equal(items.length, 2);
  assert.equal(items[0].q, 'Câu hỏi có, dấu phẩy "trích"?');
  assert.deepEqual(items[0].opts, ['Một', 'Hai', 'Cả hai ý trên']);
  assert.equal(items[0].a, 2);
  assert.equal(items[0].crit, 1);
  assert.equal(items[1].img, 'x.webp');
  assert.deepEqual(items[1].hang, ['*']);
});

test('nhập CSV: sinh tập theo hạng và kiểm tra hợp lệ', () => {
  const items = rowsToQuestions(parseCSV(csv));
  const sets = buildSets(items);
  assert.deepEqual(sets.A.pool, [1, 2]);
  assert.deepEqual(sets.B1.crit, [1]);
  const questions = items.map(({ hang, _row, ...q }) => q);
  const r = validateData({ questions, sets, imgExists: () => true });
  assert.deepEqual(r.errors, []);
  const bad = validateData({ questions, sets, imgExists: () => false });
  assert.ok(bad.errors.some((e) => e.includes('ảnh')));
});

test('nhập CSV: thiếu cột bắt buộc thì báo lỗi', () => {
  assert.throws(() => rowsToQuestions(parseCSV('id,ch,q\n1,1,x\n')));
});
