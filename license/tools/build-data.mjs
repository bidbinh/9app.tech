#!/usr/bin/env node
// Dựng data/questions.json + data/sets.json từ:
//   - tools/source/questions.raw.json  (kết quả extract-600.py, bộ 600 câu của Cục CSGT)
//   - tools/source/cong-van-2262-phu-luc.txt (Phụ lục I, II, III của Công văn 2262/CSGT-P5)
// Kiểm tra chéo số lượng với con số công bố trong chính Công văn. Sai là dừng, không ghi dữ liệu.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'tools/source/questions.raw.json'), 'utf8'));
const pl = fs.readFileSync(path.join(root, 'tools/source/cong-van-2262-phu-luc.txt'), 'utf8');

function fail(m) { console.error('LỖI:', m); process.exit(1); }

const i2 = pl.indexOf('PHỤ LỤC 2');
const i3 = pl.indexOf('PHỤ LỤC 3');
if (i2 < 0 || i3 < 0) fail('không thấy ranh giới phụ lục');
const pl1 = pl.slice(pl.indexOf('PHỤ LỤC 1'), i2);
const pl2 = pl.slice(i2, i3);
const pl3 = pl.slice(i3);

function groups(text) {
  // tách theo "N. Nhóm ..."
  const parts = text.split(/(?:^|\s)(?=[1-6]\.\s+[Nn]hóm)/m).filter((p) => /^[1-6]\.\s+[Nn]hóm/.test(p.trim()));
  return parts.map((p) => {
    p = p.trim();
    const head = p.match(/\((\d+) câu trong bộ\s+600/);
    const crit = p.match(/Nhóm (\d+) câu\/60 câu/);
    const expect = head ? +head[1] : crit ? +crit[1] : null;
    let body = p.replace(/^[1-6]\.\s+[Nn]hóm[^()]*\([^)]*\)/, '').replace(/^[1-6]\.\s+Nhóm [^\n]*nghiêm trọng/, '');
    const nums = (body.match(/\d+/g) || []).map(Number);
    return { expect, nums };
  });
}

const g1 = groups(pl1);
const g2 = groups(pl2);
if (g1.length !== 6 || g2.length !== 6) fail(`số nhóm phụ lục: ${g1.length}, ${g2.length}`);
for (const [name, g] of [['PL1', g1], ['PL2', g2]]) {
  g.forEach((x, i) => { if (x.nums.length !== x.expect) fail(`${name} nhóm ${i + 1}: đếm được ${x.nums.length}, văn bản ghi ${x.expect}`); });
}
const A = g1.slice(0, 5).flatMap((x) => x.nums);
const B1 = g2.slice(0, 5).flatMap((x) => x.nums);
const critA = g1[5].nums;
const critB1 = g2[5].nums;
const crit = (pl3.replace(/^[^\n]*\n[^\n]*\n[^\n]*\n/, '').match(/\d+/g) || []).map(Number);
if (A.length !== 250) fail('A1/A phải 250 câu, có ' + A.length);
if (B1.length !== 300) fail('B1 phải 300 câu, có ' + B1.length);
if (critA.length !== 20) fail('điểm liệt A1/A phải 20');
if (critB1.length !== 30) fail('điểm liệt B1 phải 30');
if (crit.length !== 60) fail('điểm liệt phải 60, có ' + crit.length + ': ' + crit.join(','));
for (const [n, arr] of [['A', A], ['B1', B1], ['critA', critA], ['critB1', critB1], ['crit', crit]]) {
  if (new Set(arr).size !== arr.length) fail(n + ' có số trùng');
  if (arr.some((x) => x < 1 || x > 600)) fail(n + ' có số ngoài 1..600');
}
const critSet = new Set(crit);
if (!critA.every((x) => critSet.has(x)) || !critB1.every((x) => critSet.has(x))) fail('điểm liệt con không thuộc 60 câu');
if (!critA.every((x) => A.includes(x)) || !critB1.every((x) => B1.includes(x))) fail('điểm liệt không nằm trong tập hạng');

// chương theo cấu trúc bộ đề của Công văn: nhóm 1..5 của PL1 ứng với chương 1,2,3,5,6
const chOf = (n) => (n <= 180 ? 1 : n <= 205 ? 2 : n <= 263 ? 3 : n <= 300 ? 4 : n <= 485 ? 5 : 6);
if (!g1[0].nums.every((n) => chOf(n) === 1) || !g1[1].nums.every((n) => chOf(n) === 2) || !g1[2].nums.every((n) => chOf(n) === 3) || !g1[3].nums.every((n) => chOf(n) === 5) || !g1[4].nums.every((n) => chOf(n) === 6)) fail('PL1: số câu không khớp chương');

// Chuẩn hóa đơn vị bị tách chỉ số trên trong PDF: "cm 3" -> "cm³" (chỉ đổi cách viết, không đổi nghĩa/đáp án).
const SUP = { 2: '²', 3: '³' };
const fixUnits = (t) => t.replace(/(?<![A-Za-z])(cm|dm|mm|km) ?([23])(?![\d])/g, (_, u, n) => u + SUP[n]);
const questions = raw.map((q0) => {
  const q = { ...q0, q: fixUnits(q0.q), opts: q0.opts.map(fixUnits) };
  const o = { id: q.id, ch: q.ch, q: q.q, opts: q.opts, a: q.a };
  if (critSet.has(q.id)) o.crit = 1;
  if (q.img) o.img = q.img;
  return o;
});
if (questions.length !== 600) fail('cần 600 câu');
questions.forEach((q, i) => { if (q.id !== i + 1) fail('id lệch tại ' + i); });

const sets = {
  note: 'Tập câu hỏi theo hạng, lấy nguyên từ Phụ lục I, II, III của Công văn 2262/CSGT-P5 ngày 07/5/2025 (Cục CSGT, Bộ Công an).',
  A1: { pool: A.slice().sort((a, b) => a - b), crit: critA },
  A: { pool: A.slice().sort((a, b) => a - b), crit: critA },
  B1: { pool: B1.slice().sort((a, b) => a - b), crit: critB1 },
  all: { pool: questions.map((q) => q.id), crit },
};
fs.writeFileSync(path.join(root, 'data/questions.json'), JSON.stringify(questions));
fs.writeFileSync(path.join(root, 'data/sets.json'), JSON.stringify(sets));
console.log('OK: 600 câu | A1/A', A.length, '| B1', B1.length, '| điểm liệt', crit.length, `(A1/A ${critA.length}, B1 ${critB1.length})`);
