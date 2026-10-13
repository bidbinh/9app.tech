#!/usr/bin/env node
// Kiểm tra dữ liệu app: node tools/validate.mjs [thư-mục-data] [--count=600]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from './lib/validate.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(root, 'data'));
const cnt = args.find((a) => a.startsWith('--count='));
const questions = JSON.parse(fs.readFileSync(path.join(dir, 'questions.json'), 'utf8'));
const sets = JSON.parse(fs.readFileSync(path.join(dir, 'sets.json'), 'utf8'));
const { errors, warnings } = validateData({
  questions,
  sets,
  imgExists: (f) => fs.existsSync(path.join(dir, 'img', f)),
  expectCount: cnt ? +cnt.split('=')[1] : null,
});
// ảnh mồ côi
const used = new Set(questions.map((q) => q.img).filter(Boolean));
const imgDir = path.join(dir, 'img');
if (fs.existsSync(imgDir)) {
  const orphan = fs.readdirSync(imgDir).filter((f) => !used.has(f));
  if (orphan.length) warnings.push(`${orphan.length} ảnh không câu nào dùng (vd ${orphan[0]})`);
}
for (const w of warnings) console.warn('CẢNH BÁO:', w);
for (const e of errors) console.error('LỖI:', e);
console.log(`${questions.length} câu, ${errors.length} lỗi, ${warnings.length} cảnh báo`);
process.exit(errors.length ? 1 : 0);
