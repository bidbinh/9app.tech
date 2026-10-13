// Nạp dữ liệu từ data/*.json trong Node (không dùng trong trình duyệt).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const rd = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));

/** Đọc dishes/ingredients/seasonal. @returns {import('./common.js').MenuData} */
export function loadData() {
  return { dishes: rd('dishes.json'), ingredients: rd('ingredients.json'), seasonal: rd('seasonal.json') };
}
