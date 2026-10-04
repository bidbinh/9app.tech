// Quy định thi lý thuyết GPLX: cấu trúc đề từng hạng, theo văn bản đã đối chiếu (xem data/meta.json và trang "Về dữ liệu").
// Thuần dữ liệu + hàm nhỏ, chạy được cả trong trình duyệt lẫn node:test.

export const HANG_LIST = ['A1', 'A', 'B1', 'B', 'C1', 'C', 'D1', 'D2', 'D'];

export const HANGS = {
  A1: { ten: 'A1', mota: 'Mô tô hai bánh đến 125 cm³ hoặc công suất động cơ điện đến 11 kW', loai: 'xemay', pool: 'A' },
  A: { ten: 'A', mota: 'Mô tô hai bánh trên 125 cm³ hoặc công suất động cơ điện trên 11 kW', loai: 'xemay', pool: 'A' },
  B1: { ten: 'B1', mota: 'Mô tô ba bánh (tên hạng mới từ 01/01/2025)', loai: 'xemay', pool: 'B1' },
  B: { ten: 'B', mota: 'Ô tô chở người đến 8 chỗ (không kể người lái), ô tô tải đến 3.500 kg', loai: 'oto', pool: 'all' },
  C1: { ten: 'C1', mota: 'Ô tô tải trên 3.500 kg đến 7.500 kg', loai: 'oto', pool: 'all' },
  C: { ten: 'C', mota: 'Ô tô tải trên 7.500 kg', loai: 'oto', pool: 'all' },
  D1: { ten: 'D1', mota: 'Ô tô chở người (cả người lái) trên 8 chỗ đến 16 chỗ', loai: 'oto', pool: 'all' },
  D2: { ten: 'D2', mota: 'Ô tô chở người (cả người lái) trên 16 chỗ đến 29 chỗ', loai: 'oto', pool: 'all' },
  D: { ten: 'D', mota: 'Ô tô chở người (cả người lái) trên 29 chỗ', loai: 'oto', pool: 'all' },
};

// Nhóm câu trong một đề. Khóa nhóm: rules (chương I), crit (điểm liệt), culture (II), tech (III; xe máy gộp cả IV),
// build (IV, chỉ ô tô), signs (V), sahinh (VI).
const G_MOTO = { rules: 8, crit: 1, culture: 1, tech: 1, signs: 8, sahinh: 6 };
const G_B = { rules: 8, crit: 1, culture: 1, tech: 1, build: 1, signs: 9, sahinh: 9 };
const G_C1 = { rules: 10, crit: 1, culture: 1, tech: 2, build: 1, signs: 10, sahinh: 10 };
const G_C = { rules: 10, crit: 1, culture: 1, tech: 2, build: 1, signs: 14, sahinh: 11 };
const G_D = { rules: 10, crit: 1, culture: 1, tech: 2, build: 1, signs: 16, sahinh: 14 };

export const PROFILES = {
  'hien-hanh': {
    id: 'hien-hanh',
    ten: 'Hiện hành',
    tuNgay: '2025-06-01',
    denNgay: '2027-02-28',
    vanBan: 'Thông tư 12/2025/TT-BCA (28/02/2025); cơ cấu đề theo Công văn 2262/CSGT-P5 (07/5/2025)',
    kiemTra: 'da-doi-chieu-van-ban-goc',
    exams: {
      A1: { n: 25, min: 19, pass: 21, groups: G_MOTO },
      A: { n: 25, min: 19, pass: 23, groups: G_MOTO },
      B1: { n: 25, min: 19, pass: 23, groups: G_MOTO },
      B: { n: 30, min: 20, pass: 27, groups: G_B },
      C1: { n: 35, min: 22, pass: 32, groups: G_C1 },
      C: { n: 40, min: 24, pass: 36, groups: G_C },
      D1: { n: 45, min: 26, pass: 41, groups: G_D },
      D2: { n: 45, min: 26, pass: 41, groups: G_D },
      D: { n: 45, min: 26, pass: 41, groups: G_D },
    },
  },
  moi: {
    id: 'moi',
    ten: 'Mới từ 01/3/2027',
    tuNgay: '2027-03-01',
    denNgay: null,
    vanBan: 'Thông tư 108/2026/TT-BCA (29/6/2026), Phụ lục I và III; nội dung sát hạch lý thuyết áp dụng từ 01/3/2027',
    kiemTra: 'qua-bai-tong-hop',
    ghiChu: 'Chưa có cơ cấu chương chi tiết cho đề mới: app chia theo tỉ lệ cơ cấu đề hiện hành. Số câu, thời gian, điểm đạt lấy từ bài tổng hợp văn bản, hạng B1 chưa đối chiếu được văn bản gốc.',
    exams: {
      A1: { n: 40, min: 27, pass: 36, groups: null },
      A: { n: 40, min: 27, pass: 36, groups: null },
      B1: { n: 50, min: 33, pass: 45, groups: null, canLuuY: true },
      B: { n: 50, min: 33, pass: 45, groups: null },
      C1: { n: 60, min: 40, pass: 54, groups: null },
      C: { n: 70, min: 47, pass: 63, groups: null },
      D1: { n: 80, min: 53, pass: 72, groups: null },
      D2: { n: 80, min: 53, pass: 72, groups: null },
      D: { n: 80, min: 53, pass: 72, groups: null },
    },
  },
};

export const NGAY_DOI_QUY_DINH = '2027-03-01';

export function defaultProfile(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return t >= Date.parse(NGAY_DOI_QUY_DINH + 'T00:00:00') ? 'moi' : 'hien-hanh';
}

// Chia n câu theo tỉ lệ của cơ cấu cơ sở (phương pháp phần dư lớn nhất); nhóm điểm liệt luôn là 1 câu.
export function scaleGroups(base, n) {
  const keys = Object.keys(base);
  const out = {};
  let rest = n;
  if (base.crit) { out.crit = 1; rest -= 1; }
  const other = keys.filter((k) => k !== 'crit');
  const baseSum = other.reduce((s, k) => s + base[k], 0);
  const raw = other.map((k) => ({ k, v: (base[k] * rest) / baseSum }));
  let used = 0;
  for (const r of raw) { out[r.k] = Math.floor(r.v); used += out[r.k]; }
  raw.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || other.indexOf(a.k) - other.indexOf(b.k));
  for (let i = 0; used < rest; i++, used++) out[raw[i % raw.length].k]++;
  return out;
}

export function examSpec(profileId, hang) {
  const p = PROFILES[profileId];
  if (!p) throw new Error('profile không tồn tại: ' + profileId);
  const e = p.exams[hang];
  if (!e) throw new Error('hạng không tồn tại: ' + hang);
  let groups = e.groups;
  if (!groups) {
    const base = PROFILES['hien-hanh'].exams[hang].groups;
    groups = scaleGroups(base, e.n);
  }
  return { hang, profile: profileId, n: e.n, min: e.min, pass: e.pass, groups, canLuuY: !!e.canLuuY };
}
