// Công cụ nội bộ của Osin: dùng ngay, không cần app khác. Tất cả chỉ đọc, thuần tính toán/tra cứu, không đụng dữ liệu người dùng.
import { nowVN } from '../util.js';
import { duongSangAm, amSangDuong, canChiNam, canChiNgay, soNgayThangAm } from './vendor/lunar.js';
import { quetDonVi, doi, layDonVi, ghiChuCap, NHOM } from './vendor/units.js';
import { khoaTim } from './vendor/text.js';
import { evaluate, formatNumber, CalcError } from './calc.js';
import { searchFeatures } from './search.js';

const fail = (msg) => Object.assign(new Error(msg), { osinCode: 'invalid_args' });
const pad = (n) => String(n).padStart(2, '0');

function validGregorian(d, m, y) {
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export function lunarText(a) { return `ngày ${a.ngay} tháng ${a.thang}${a.nhuan ? ' (nhuận)' : ''} năm ${canChiNam(a.nam)} (${a.nam})`; }

export function convertLunar(args) {
  const { chieu, ngay, thang, nam, nhuan = false } = args;
  if (chieu === 'duong_sang_am') {
    if (!validGregorian(ngay, thang, nam)) throw fail('Ngày dương lịch không hợp lệ (năm hỗ trợ từ 1900 đến 2100).');
    const a = duongSangAm(ngay, thang, nam);
    return { ngay_am: a.ngay, thang_am: a.thang, nam_am: a.nam, nhuan: a.nhuan, can_chi_ngay: canChiNgay(ngay, thang, nam), hien_thi: `${pad(ngay)}/${pad(thang)}/${nam} dương lịch là ${lunarText(a)}, ngày ${canChiNgay(ngay, thang, nam)}.` };
  }
  if (chieu === 'am_sang_duong') {
    if (!Number.isInteger(ngay) || !Number.isInteger(thang) || !Number.isInteger(nam) || nam < 1900 || nam > 2100 || thang < 1 || thang > 12 || ngay < 1 || ngay > 30) throw fail('Ngày âm lịch không hợp lệ (năm hỗ trợ từ 1900 đến 2100).');
    const d = amSangDuong(ngay, thang, nam, !!nhuan);
    if (!d) throw fail(`Ngày ${ngay} tháng ${thang}${nhuan ? ' nhuận' : ''} năm ${nam} âm lịch không tồn tại (tháng này chỉ có ${soNgayThangAm(thang, nam, !!nhuan) || 'không có'} ngày).`);
    return { ngay_duong: d.ngay, thang_duong: d.thang, nam_duong: d.nam, hien_thi: `Ngày ${ngay} tháng ${thang}${nhuan ? ' (nhuận)' : ''} năm ${canChiNam(nam)} âm lịch là ngày ${pad(d.ngay)}/${pad(d.thang)}/${d.nam} dương lịch.` };
  }
  throw fail('chieu phải là duong_sang_am hoặc am_sang_duong');
}

function resolveUnit(text) {
  const direct = layDonVi(String(text).trim());
  if (direct) return { id: direct.id };
  const tokens = khoaTim(String(text)).split(' ').filter(Boolean);
  if (!tokens.length || tokens.length > 8) return null;
  const hit = quetDonVi(tokens, 0);
  if (!hit || hit.soTu !== tokens.length) return null;
  return hit;
}
const fmt = (n) => formatNumber(n, Math.abs(n) >= 1 ? 6 : 10);

export function convertUnit({ gia_tri, tu, den }) {
  const a = resolveUnit(tu); const b = resolveUnit(den);
  if (!a) throw fail(`Mình chưa nhận ra đơn vị "${String(tu).slice(0, 40)}".`);
  if (!b) throw fail(`Mình chưa nhận ra đơn vị "${String(den).slice(0, 40)}".`);
  let kq;
  try { kq = doi(gia_tri, a.id, b.id); } catch { throw fail(`"${layDonVi(a.id).ten}" và "${layDonVi(b.id).ten}" khác loại nên không đổi được.`); }
  const A = layDonVi(a.id); const B = layDonVi(b.id);
  const notes = [...ghiChuCap(a.id, b.id), ...(a.canhBao ? [a.canhBao] : []), ...(b.canhBao ? [b.canhBao] : [])];
  return { ket_qua: Number(kq.toPrecision(12)), tu: A.ten, den: B.ten, ghi_chu: notes, hien_thi: `${fmt(gia_tri)} ${A.kh} = ${fmt(kq)} ${B.kh}` + (notes.length ? '\n' + notes.join(' ') : '') };
}

const T = (name, description, parameters, run) => ({ id: 'osin__' + name, appId: 'osin', name, description, parameters, readOnly: true, confirm: false, sensitive: false, summaryTemplate: '', internal: true, run });

export function internalTools({ searchEntries = [], now = () => Date.now() } = {}) {
  return [
    T('thoi_gian', 'Cho biết ngày giờ hiện tại theo giờ Việt Nam (thứ, ngày, giờ) và ngày âm lịch tương ứng. Dùng khi người dùng hỏi hôm nay/bây giờ là ngày nào, thứ mấy, mấy giờ.', { type: 'object', properties: {} }, async () => {
      const t = nowVN(now());
      const a = duongSangAm(t.ngay, t.thang, t.nam);
      return { duong_lich: t.text, am_lich: lunarText(a), hien_thi: `Bây giờ là ${t.text}. Âm lịch: ${lunarText(a)}.` };
    }),
    T('doi_lich', 'Đổi ngày giữa dương lịch và âm lịch (năm 1900 đến 2100). chieu=duong_sang_am: nhập ngày/tháng/năm dương. chieu=am_sang_duong: nhập ngày/tháng/năm âm (nhuan=true nếu là tháng nhuận).', {
      type: 'object',
      properties: { chieu: { type: 'string', enum: ['duong_sang_am', 'am_sang_duong'], description: 'Hướng đổi' }, ngay: { type: 'integer', minimum: 1, maximum: 31 }, thang: { type: 'integer', minimum: 1, maximum: 12 }, nam: { type: 'integer', minimum: 1900, maximum: 2100 }, nhuan: { type: 'boolean', description: 'Chỉ dùng khi đổi từ âm lịch và tháng đó là tháng nhuận' } },
      required: ['chieu', 'ngay', 'thang', 'nam'],
    }, async (a) => convertLunar(a)),
    T('may_tinh', 'Máy tính chính xác. Dùng cho MỌI phép tính số học (cộng, trừ, nhân, chia, lũy thừa ^, phần trăm %, ngoặc, hàm sqrt, abs, round, floor, ceil, min, max, pow). Viết số thập phân bằng dấu chấm, ví dụ 12.5*(3+4). Không tự tính nhẩm.', {
      type: 'object', properties: { bieu_thuc: { type: 'string', maxLength: 200, description: 'Biểu thức, ví dụ 1200000*8%' } }, required: ['bieu_thuc'],
    }, async ({ bieu_thuc }) => {
      try { const v = evaluate(bieu_thuc); return { ket_qua: v, hien_thi: `${bieu_thuc.trim()} = ${formatNumber(v)}` }; } catch (e) {
        if (e instanceof CalcError) throw fail(e.message);
        throw e;
      }
    }),
    T('quy_doi_don_vi', 'Quy đổi đơn vị kiểu Việt Nam và thông dụng: vàng (chỉ, lượng/cây, phân, ounce), đất (sào Bắc/Trung Bộ, mẫu, công, héc-ta), khối lượng, độ dài, thể tích, nhiệt độ, tốc độ. Ví dụ gia_tri=3, tu="chỉ vàng", den="gam".', {
      type: 'object', properties: { gia_tri: { type: 'number' }, tu: { type: 'string', maxLength: 60, description: 'Đơn vị gốc, nói như người Việt: "chỉ vàng", "sào Bắc Bộ", "m2"' }, den: { type: 'string', maxLength: 60, description: 'Đơn vị đích' } }, required: ['gia_tri', 'tu', 'den'],
    }, async (a) => convertUnit(a)),
    T('tim_chuc_nang', 'Tìm chức năng trong các app 9app (ví dụ "văn khấn", "lịch giải chạy", "đặt cơm") và trả liên kết để mở thẳng. Dùng khi người dùng hỏi app nào làm được việc gì hoặc muốn mở một chức năng.', {
      type: 'object', properties: { tu_khoa: { type: 'string', maxLength: 100 } }, required: ['tu_khoa'],
    }, async ({ tu_khoa }) => {
      const hits = searchFeatures(searchEntries, tu_khoa, 5);
      if (!hits.length) return { ket_qua: [], hien_thi: 'Mình chưa tìm thấy chức năng nào khớp với "' + tu_khoa.slice(0, 60) + '".' };
      return {
        ket_qua: hits.map((h) => ({ app: h.appName, chuc_nang: h.name, mo_ta: h.blurb })),
        links: hits.map((h) => ({ label: `${h.appName}: ${h.name}`, path: h.link })),
        hien_thi: hits.map((h) => `${h.appName}: ${h.name}`).join('\n'),
      };
    }),
  ];
}
export const UNIT_GROUPS = NHOM.map((n) => n.ten);
