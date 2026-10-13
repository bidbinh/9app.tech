// Lưu cục bộ (localStorage) có bọc try/catch: trình duyệt chặn hoặc chế độ riêng tư vẫn chạy được (lưu tạm trong bộ nhớ).
const boNho = new Map();
const TIEN_TO = '9unit.';

export function doc(khoa, macDinh) {
  try {
    const v = globalThis.localStorage?.getItem(TIEN_TO + khoa);
    if (v !== null && v !== undefined) return JSON.parse(v);
  } catch { /* bị chặn hoặc dữ liệu hỏng: dùng bộ nhớ tạm */ }
  return boNho.has(khoa) ? boNho.get(khoa) : macDinh;
}

export function ghi(khoa, giaTri) {
  boNho.set(khoa, giaTri);
  try {
    globalThis.localStorage?.setItem(TIEN_TO + khoa, JSON.stringify(giaTri));
    return true;
  } catch {
    return false;
  }
}
