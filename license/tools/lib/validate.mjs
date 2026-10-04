// Kiểm tra bộ dữ liệu câu hỏi. Dùng chung cho tools/validate.mjs, công cụ nhập và test.
// Trả về { errors: [], warnings: [] }. Có lỗi thì KHÔNG được phát hành dữ liệu.

export function validateData({ questions, sets, imgExists = () => true, expectCount = null }) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!Array.isArray(questions) || !questions.length) {
    err('questions phải là mảng không rỗng');
    return { errors, warnings };
  }
  const seen = new Set();
  const byId = new Map();
  for (const [i, q] of questions.entries()) {
    const at = `câu #${i} (id=${q && q.id})`;
    if (!q || typeof q !== 'object') { err(`${at}: không phải object`); continue; }
    if (!Number.isInteger(q.id) || q.id < 1) { err(`${at}: id phải là số nguyên dương`); continue; }
    if (seen.has(q.id)) err(`id trùng: ${q.id}`);
    seen.add(q.id);
    byId.set(q.id, q);
    if (!Number.isInteger(q.ch) || q.ch < 1 || q.ch > 6) err(`${at}: ch phải 1..6`);
    if (typeof q.q !== 'string' || q.q.trim().length < 5) err(`${at}: thiếu nội dung câu hỏi`);
    if (!Array.isArray(q.opts) || q.opts.length < 2 || q.opts.length > 4) err(`${at}: cần 2 đến 4 đáp án`);
    else {
      if (q.opts.some((o) => typeof o !== 'string' || !o.trim())) err(`${at}: có đáp án rỗng`);
      if (new Set(q.opts.map((o) => o.trim())).size !== q.opts.length) warn(`${at}: có hai đáp án giống hệt nhau`);
    }
    if (!Number.isInteger(q.a) || !Array.isArray(q.opts) || q.a < 0 || q.a >= q.opts.length) err(`${at}: đáp án đúng (a=${q.a}) không thuộc danh sách lựa chọn`);
    if (q.img !== undefined) {
      if (typeof q.img !== 'string' || !/^[\w.-]+\.(webp|png|jpe?g|svg)$/i.test(q.img)) err(`${at}: tên ảnh không hợp lệ`);
      else if (!imgExists(q.img)) err(`${at}: ảnh không tồn tại: ${q.img}`);
    }
    if (q.crit !== undefined && q.crit !== 1) err(`${at}: crit chỉ được là 1 hoặc bỏ trống`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(q.q + (q.opts || []).join(''))) err(`${at}: có ký tự điều khiển`);
    if (/CHƯƠNG [IVX]+/.test(q.q + (q.opts || []).join(' '))) err(`${at}: lẫn tiêu đề chương vào nội dung`);
  }
  if (expectCount !== null && questions.length !== expectCount) err(`số câu ${questions.length} khác kỳ vọng ${expectCount}`);

  if (!sets || typeof sets !== 'object') {
    err('thiếu sets');
    return { errors, warnings };
  }
  for (const key of ['A', 'B1', 'all']) {
    const s = sets[key];
    if (!s || !Array.isArray(s.pool) || !Array.isArray(s.crit)) { err(`sets.${key} thiếu pool/crit`); continue; }
    if (new Set(s.pool).size !== s.pool.length) err(`sets.${key}.pool có id trùng`);
    if (new Set(s.crit).size !== s.crit.length) err(`sets.${key}.crit có id trùng`);
    for (const id of s.pool) if (!byId.has(id)) err(`sets.${key}.pool: id ${id} không có trong questions`);
    const pool = new Set(s.pool);
    for (const id of s.crit) {
      if (!byId.has(id)) err(`sets.${key}.crit: id ${id} không có trong questions`);
      else if (!pool.has(id)) err(`sets.${key}.crit: id ${id} không nằm trong pool`);
      else if (!byId.get(id).crit) err(`sets.${key}.crit: câu ${id} chưa gắn cờ crit trong questions`);
    }
  }
  if (sets.all && Array.isArray(sets.all.crit)) {
    const allCrit = new Set(sets.all.crit);
    for (const q of questions) if (q.crit && !allCrit.has(q.id)) err(`câu ${q.id} gắn crit nhưng không có trong sets.all.crit`);
  }
  // mỗi chương dùng trong đề phải đủ câu (cảnh báo nếu bộ nhỏ)
  const perCh = {};
  for (const q of questions) perCh[q.ch] = (perCh[q.ch] || 0) + 1;
  for (let c = 1; c <= 6; c++) if (!perCh[c]) warn(`chương ${c} chưa có câu nào: không dựng được đề thi đủ cấu trúc`);
  return { errors, warnings };
}
