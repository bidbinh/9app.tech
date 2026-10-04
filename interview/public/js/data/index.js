import { CHUNG } from './q-chung.js';
import { NGHE } from './q-nghe.js';

export const GROUPS = [
  { id: 'chung', name: 'Chung mọi ngành', short: 'Chung' },
  { id: 'vanphong', name: 'Văn phòng', short: 'Văn phòng' },
  { id: 'ketoan', name: 'Kế toán', short: 'Kế toán' },
  { id: 'kinhdoanh', name: 'Kinh doanh', short: 'Kinh doanh' },
  { id: 'it', name: 'Công nghệ thông tin', short: 'IT' },
  { id: 'cskh', name: 'Chăm sóc khách hàng', short: 'CSKH' },
  { id: 'nhansu', name: 'Nhân sự', short: 'Nhân sự' },
];

export const TYPES = {
  gioithieu: 'Giới thiệu',
  dongluc: 'Động lực',
  hanhvi: 'Hành vi (STAR)',
  tinhhuong: 'Tình huống',
  diemyeu: 'Điểm mạnh, điểm yếu',
  chuyenmon: 'Chuyên môn',
  luong: 'Lương và điều kiện',
  khac: 'Khác',
};

export const QUESTIONS = [...CHUNG, ...NGHE];

export function questionsFor(groupId, type) {
  return QUESTIONS.filter((q) => (!groupId || groupId === 'all' || q.g === groupId) && (!type || type === 'all' || q.t === type));
}

// Bộ luyện cho một nhóm nghề: câu chung chọn lọc + câu nghề, trộn ngẫu nhiên có hạt giống để test được.
export function pickSession(groupId, n = 5, rand = Math.random) {
  const own = QUESTIONS.filter((q) => q.g === groupId && groupId !== 'chung');
  const common = QUESTIONS.filter((q) => q.g === 'chung');
  const pool = groupId === 'chung' ? common.slice() : own.concat(common.filter((q) => ['gioithieu', 'hanhvi', 'diemyeu', 'dongluc'].includes(q.t)));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.min(n, pool.length));
}
