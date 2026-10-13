// Trình hỗ trợ khai báo món ăn gọn. Dùng trong tools/dishes-*.js, build.js sinh data/dishes.json.
// D(id, tên, vai trò, mùa, thẻ, nguyên liệu, các bước, ghi chú, nguồn, ghiChúMùa)
//  - mùa: 'xuan ha thu dong' hoặc 'q' (quanh_nam)
//  - thẻ (cách nhau bằng dấu cách): k13 k412? (mặc định có, 'nok412' để bỏ) eld soft ls lsug lf baby
//      m<tháng> t<phút> c<1-3> @sang @trua @toi @anvat @trangmieng (ghi đè bữa)
//  - nguyên liệu: "id 300g; id 2qua?; id 15ml (ghi chú)"  ('?' = tùy chọn). Macro: +s (gia vị cơ bản), +sl (nhạt)
//  - bước: ngăn bằng '|'
//  - nguồn: khóa trong tools/sources.js, ngăn bằng dấu cách
export const rawDishes = [];

const MACROS = {
  '+s': 'hanh-kho 10g; dau-an 10ml; nuoc-mam 15ml; muoi 2g; tieu 1g',
  '+sl': 'hanh-kho 10g; dau-an 10ml; nuoc-mam 8ml',
  '+k': 'hanh-kho 10g; dau-an 10ml; nuoc-mam 30ml; duong 15g; tieu 1g',
};

export function parseIng(str) {
  const out = [];
  for (let part of str.split(';')) {
    part = part.trim();
    if (!part) continue;
    if (MACROS[part]) { out.push(...parseIng(MACROS[part])); continue; }
    const m = part.match(/^([a-z0-9-]+)\s+([\d.]+)(kg|ml|g|l|qua|bo|cu|mieng|hop|goi|tep|con|thia|tui|cay)\s*(\?)?\s*(?:\((.*)\))?$/);
    if (!m) throw new Error('Nguyên liệu sai cú pháp: "' + part + '"');
    const o = { id: m[1], qty: Number(m[2]), unit: m[3] };
    if (m[4]) o.optional = true;
    if (m[5]) o.note = m[5];
    out.push(o);
  }
  return out;
}

export function D(id, name, role, seasons, tags, ing, steps, notes, src, seasonNote) {
  rawDishes.push({
    id, name, role, seasons, tags: tags || '', ingredients: parseIng(ing),
    steps: steps.split('|').map((s) => s.trim()).filter(Boolean),
    notes: notes || '', src: (src || '').split(/\s+/).filter(Boolean), seasonNote: seasonNote || '',
  });
}
