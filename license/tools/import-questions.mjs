#!/usr/bin/env node
// Công cụ nạp bộ đề: chuyển CSV/JSON của bạn sang định dạng của app, kiểm tra, rồi ghi data/questions.json + data/sets.json.
//
//   node tools/import-questions.mjs <file.csv|file.json> [--out=data] [--merge] [--dry]
//
// CSV (UTF-8, dòng đầu là tiêu đề), cột:
//   id        số câu (số nguyên dương, duy nhất)
//   ch        chương 1..6 (1 quy tắc, 2 văn hóa/đạo đức, 3 kỹ thuật lái, 4 cấu tạo/sửa chữa, 5 biển báo, 6 sa hình)
//   q         nội dung câu hỏi
//   opt1..opt4  các đáp án theo ĐÚNG thứ tự trong đề (không đảo, vì có ý "cả hai ý trên")
//   answer    số thứ tự đáp án đúng, 1..4
//   crit      1 nếu là câu điểm liệt, bỏ trống nếu không
//   hang      các hạng dùng câu này, ngăn bằng | hoặc dấu cách: A1|A|B1|B ; "*" là mọi hạng (mặc định "*")
//   img       tên file ảnh nằm trong data/img/ (tùy chọn)
// JSON: mảng đối tượng cùng tên trường, hoặc đã ở dạng chuẩn { id, ch, q, opts[], a (0-based), crit, img, hang }.
//
// Nguồn câu hỏi phải là bộ đề chính thức/được phép sử dụng. Công cụ không tự sinh hay sửa đáp án.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from './lib/validate.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export function rowsToQuestions(rows) {
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  for (const need of ['id', 'ch', 'q', 'opt1', 'opt2', 'answer']) if (col(need) < 0) throw new Error('CSV thiếu cột ' + need);
  return rows.slice(1).map((r, n) => {
    const get = (k) => (col(k) >= 0 ? (r[col(k)] ?? '').trim() : '');
    const opts = ['opt1', 'opt2', 'opt3', 'opt4'].map(get).filter((x) => x !== '');
    const o = { id: +get('id'), ch: +get('ch'), q: get('q'), opts, a: +get('answer') - 1 };
    if (get('crit') === '1') o.crit = 1;
    if (get('img')) o.img = get('img');
    o.hang = get('hang') ? get('hang').split(/[|\s]+/).filter(Boolean) : ['*'];
    o._row = n + 2;
    return o;
  });
}

export function normalize(list) {
  return list.map((x) => {
    if (Array.isArray(x.opts) && Number.isInteger(x.a)) {
      const o = { id: x.id, ch: x.ch, q: x.q, opts: x.opts, a: x.a };
      if (x.crit) o.crit = 1;
      if (x.img) o.img = x.img;
      o.hang = x.hang ? (Array.isArray(x.hang) ? x.hang : String(x.hang).split(/[|\s]+/)) : ['*'];
      return o;
    }
    throw new Error('mục JSON không đúng dạng chuẩn: id=' + x?.id);
  });
}

// Dựng sets.json từ cột hang: A (A1 và A), B1, all (B, C1, C, D1, D2, D).
export function buildSets(items) {
  const has = (it, ...hs) => it.hang.includes('*') || hs.some((h) => it.hang.includes(h));
  const pick = (f) => items.filter(f);
  const mk = (arr) => ({ pool: arr.map((i) => i.id).sort((a, b) => a - b), crit: arr.filter((i) => i.crit).map((i) => i.id).sort((a, b) => a - b) });
  return {
    note: 'Sinh bởi tools/import-questions.mjs từ cột hang/crit.',
    A1: mk(pick((i) => has(i, 'A1', 'A'))),
    A: mk(pick((i) => has(i, 'A1', 'A'))),
    B1: mk(pick((i) => has(i, 'B1'))),
    all: mk(pick((i) => has(i, 'B', 'C1', 'C', 'D1', 'D2', 'D'))),
  };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('Dùng: node tools/import-questions.mjs <file.csv|file.json> [--out=data] [--merge] [--dry]'); process.exit(2); }
  const out = path.resolve(root, (args.find((a) => a.startsWith('--out=')) || '--out=data').slice(6));
  const merge = args.includes('--merge');
  const dry = args.includes('--dry');
  const text = fs.readFileSync(file, 'utf8');
  let items = file.toLowerCase().endsWith('.json') ? normalize(JSON.parse(text)) : rowsToQuestions(parseCSV(text));

  if (merge && fs.existsSync(path.join(out, 'questions.json'))) {
    const old = JSON.parse(fs.readFileSync(path.join(out, 'questions.json'), 'utf8'));
    const oldSets = JSON.parse(fs.readFileSync(path.join(out, 'sets.json'), 'utf8'));
    const hangOf = (id) => {
      const hs = [];
      if (oldSets.A.pool.includes(id)) hs.push('A1', 'A');
      if (oldSets.B1.pool.includes(id)) hs.push('B1');
      if (oldSets.all.pool.includes(id)) hs.push('B', 'C1', 'C', 'D1', 'D2', 'D');
      return hs;
    };
    const ids = new Set(items.map((i) => i.id));
    const kept = old.filter((q) => !ids.has(q.id)).map((q) => ({ ...q, hang: hangOf(q.id) }));
    items = [...kept, ...items];
  }
  items.sort((a, b) => a.id - b.id);
  const questions = items.map(({ hang, _row, ...q }) => q);
  const sets = buildSets(items);
  const { errors, warnings } = validateData({ questions, sets, imgExists: (f) => fs.existsSync(path.join(out, 'img', f)) });
  warnings.forEach((w) => console.warn('CẢNH BÁO:', w));
  if (errors.length) {
    errors.slice(0, 50).forEach((e) => console.error('LỖI:', e));
    console.error(`${errors.length} lỗi: không ghi dữ liệu.`);
    process.exit(1);
  }
  if (dry) { console.log(`OK (chạy thử): ${questions.length} câu, không ghi file.`); return; }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'questions.json'), JSON.stringify(questions));
  fs.writeFileSync(path.join(out, 'sets.json'), JSON.stringify(sets));
  console.log(`Đã ghi ${questions.length} câu vào ${out}. Nhớ: cập nhật data/meta.json (nguồn, số câu) và tăng version trong sw.js.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
