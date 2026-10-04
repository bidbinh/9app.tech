// Kiểm tra data/races.json (schema tự viết). Trả về mảng lỗi; rỗng nghĩa là hợp lệ.
import { isISODate, isHttpsUrl } from './util.js';

export const TYPE_VALUES = ['road', 'trail', 'tri'];
export const REGION_VALUES = ['vn-bac', 'vn-trung', 'vn-nam', 'sea', 'asia', 'world'];
export const REG_STATUS_VALUES = ['soon', 'open', 'closed', 'soldout', 'unknown'];
export const FORMAT_VALUES = ['70.3', 'full', 'multi'];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateRaces(doc) {
  const errs = [];
  const err = (where, msg) => errs.push(`${where}: ${msg}`);
  if (!doc || typeof doc !== 'object') return ['Gốc phải là object'];
  if (doc.schema !== 1) err('schema', 'phải bằng 1');
  if (!isISODate(doc.updatedAt)) err('updatedAt', 'phải là ngày YYYY-MM-DD hợp lệ');
  if (!Array.isArray(doc.races)) { err('races', 'phải là mảng'); return errs; }

  const seen = new Set();
  doc.races.forEach((r, i) => {
    const w = `races[${i}]${r && r.id ? ` (${r.id})` : ''}`;
    if (!r || typeof r !== 'object') { err(w, 'phải là object'); return; }

    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) err(w, 'id phải là chữ thường, số, gạch ngang');
    else if (seen.has(r.id)) err(w, 'id trùng');
    else seen.add(r.id);

    if (typeof r.name !== 'string' || !r.name.trim()) err(w, 'thiếu name');
    if (!TYPE_VALUES.includes(r.type)) err(w, `type phải thuộc ${TYPE_VALUES.join('|')}`);
    if (!REGION_VALUES.includes(r.region)) err(w, `region phải thuộc ${REGION_VALUES.join('|')}`);
    if (typeof r.country !== 'string' || !/^[A-Z]{2}$/.test(r.country)) err(w, 'country phải là mã 2 chữ hoa');
    else if ((r.country === 'VN') !== String(r.region).startsWith('vn-')) err(w, 'country VN phải đi với region vn-*');
    if (typeof r.city !== 'string' || !r.city.trim()) err(w, 'thiếu city');

    if (!isISODate(r.startDate)) err(w, 'startDate không hợp lệ');
    if (r.endDate != null) {
      if (!isISODate(r.endDate)) err(w, 'endDate không hợp lệ');
      else if (isISODate(r.startDate) && r.endDate < r.startDate) err(w, 'endDate trước startDate');
    }
    if (r.raceDay != null) {
      const end = r.endDate || r.startDate;
      if (!isISODate(r.raceDay)) err(w, 'raceDay không hợp lệ');
      else if (isISODate(r.startDate) && (r.raceDay < r.startDate || r.raceDay > end)) err(w, 'raceDay ngoài khoảng ngày giải');
    }

    if (!Array.isArray(r.distances)) err(w, 'distances phải là mảng');
    else for (const d of r.distances) if (typeof d !== 'number' || !(d > 0 && d <= 400)) err(w, `cự ly không hợp lệ: ${d}`);
    if (r.format != null && !FORMAT_VALUES.includes(r.format)) err(w, `format phải thuộc ${FORMAT_VALUES.join('|')} hoặc null`);
    if (r.type === 'tri' && !r.format) err(w, 'giải tri phải có format');
    if (r.elevation != null && !(typeof r.elevation === 'number' && r.elevation >= 0)) err(w, 'elevation phải là số >= 0 hoặc null');
    if (!Array.isArray(r.tags) || r.tags.some((t) => typeof t !== 'string')) err(w, 'tags phải là mảng chuỗi');

    for (const k of ['priceFrom', 'priceTo']) {
      if (r[k] != null && !(typeof r[k] === 'number' && r[k] >= 0)) err(w, `${k} phải là số >= 0 hoặc null`);
    }
    if (r.priceFrom != null && r.priceTo != null && r.priceFrom > r.priceTo) err(w, 'priceFrom > priceTo');
    if ((r.priceFrom != null || r.priceTo != null) && (typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency))) err(w, 'có giá thì currency phải là mã 3 chữ hoa');

    for (const k of ['website', 'registerUrl']) {
      if (r[k] != null && !isHttpsUrl(r[k])) err(w, `${k} phải là URL https hoặc null`);
    }
    if (!isHttpsUrl(r.source)) err(w, 'source phải là URL https');
    if (typeof r.verified !== 'boolean') err(w, 'verified phải là boolean');

    if (!REG_STATUS_VALUES.includes(r.regStatus)) err(w, `regStatus phải thuộc ${REG_STATUS_VALUES.join('|')}`);
    for (const k of ['regOpens', 'regCloses']) {
      if (r[k] != null && !isISODate(r[k])) err(w, `${k} không hợp lệ`);
    }
    if (r.regOpens && r.regCloses && r.regCloses < r.regOpens) err(w, 'regCloses trước regOpens');
    if (r.regCloses && isISODate(r.startDate) && r.regCloses > (r.endDate || r.startDate)) err(w, 'regCloses sau ngày giải');
    if (r.bibPickup != null) {
      const b = r.bibPickup;
      if (typeof b !== 'object' || !isISODate(b.start) || (b.end != null && (!isISODate(b.end) || b.end < b.start))) err(w, 'bibPickup không hợp lệ');
    }

    if (!isISODate(r.updatedAt)) err(w, 'updatedAt không hợp lệ');
    else if (isISODate(doc.updatedAt) && r.updatedAt > doc.updatedAt) err(w, 'updatedAt giải mới hơn updatedAt tổng');
    if (r.note != null && typeof r.note !== 'string') err(w, 'note phải là chuỗi hoặc null');
  });
  return errs;
}
