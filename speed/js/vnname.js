// Chuẩn hoá tên đường tiếng Việt để đối chiếu với tên trong OpenStreetMap.
//
// Vấn đề thực tế: danh sách camera công bố viết "Điện Biên Phủ", OSM ghi
// "Đường Điện Biên Phủ"; nguồn viết "Quốc lộ 1A", OSM ghi "Quốc lộ 1"; có nơi
// gõ không dấu. Cả hai phía đều phải đưa về cùng một dạng rồi mới so.

/** Bỏ dấu tiếng Việt, kể cả chữ đ. */
export function stripDiacritics(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Tiền tố chỉ loại đường - bỏ đi ở cả hai phía cho đồng nhất.
// Lưu ý: KHÔNG bỏ "xa lộ", "đại lộ", "quốc lộ", "tỉnh lộ" vì chúng là một phần
// của tên riêng ("Xa lộ Hà Nội" mà bỏ tiền tố sẽ thành "Hà Nội").
const PREFIXES = [
  'tuyến đường', 'tuyến phố', 'đường phố', 'đường', 'phố', 'ngõ', 'hẻm',
];

// Tên gọi khác thường gặp giữa văn bản hành chính và OSM
const ALIASES = new Map([
  ['quốc lộ 1a', 'quốc lộ 1'],
  ['ql1a', 'quốc lộ 1'],
  ['ql1', 'quốc lộ 1'],
  ['ql 1a', 'quốc lộ 1'],
  ['ql22', 'quốc lộ 22'],
  ['ql 22', 'quốc lộ 22'],
  ['đường láng', 'láng'],
  ['la thành', 'đê la thành'],
  ['cầu giấy', 'cầu giấy'],
]);

/**
 * Đưa tên đường về dạng chuẩn để so sánh.
 * @param {string} raw
 * @returns {string} chuỗi thường, đã bỏ tiền tố, gộp khoảng trắng
 */
export function normalizeRoadName(raw) {
  if (!raw) return '';
  let s = String(raw)
    .toLowerCase()
    .replace(/[–—]/g, '-')            // gạch dài trong văn bản tiếng Việt
    .replace(/[.,;:"'()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (ALIASES.has(s)) s = ALIASES.get(s);

  for (const p of PREFIXES) {
    if (s.startsWith(p + ' ')) { s = s.slice(p.length + 1); break; }
  }

  s = s.replace(/\s+/g, ' ').trim();
  return ALIASES.get(s) || s;
}

/** Dạng không dấu, dùng làm phương án đối chiếu dự phòng. */
export function normalizeLoose(raw) {
  return stripDiacritics(normalizeRoadName(raw)).replace(/\s+/g, ' ').trim();
}

/**
 * Mọi tên của một way trong OSM (name, name:vi, ref) đã chuẩn hoá.
 * Trả về mảng vì một con đường có thể mang nhiều tên gọi.
 */
export function wayNames(tags) {
  const out = [];
  for (const key of ['name', 'name:vi', 'ref', 'alt_name', 'old_name']) {
    const v = tags[key];
    if (!v) continue;
    // ref có thể là "QL1;AH1" - tách ra
    for (const part of String(v).split(';')) {
      const n = normalizeRoadName(part);
      if (n) out.push(n);
    }
  }
  return out;
}
