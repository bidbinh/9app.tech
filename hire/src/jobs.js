// Kiểm tra đầu vào tin tuyển dụng, ánh xạ dữ liệu công khai, bộ lọc tìm kiếm.
import { config } from './config.js';
import { ApiError } from './errors.js';
import { KINDS, CATEGORIES, PAY_TYPES, SHIFTS, CITIES, PAY_BOUNDS, keys, labelOf } from './meta.js';
import { cleanText, cleanMultiline, cleanPhone, intIn, normKey, sha256hex, bad } from './util.js';
import { scanFields } from './scam.js';

const FIELD_LABEL = {
  title: 'Vị trí', company: 'Tên quán, cửa hàng', description: 'Mô tả công việc', requirements: 'Yêu cầu', shiftNote: 'Ghi chú ca, giờ làm', district: 'Quận, huyện', contactName: 'Tên người liên hệ',
};

const oneOf = (v, list, field) => {
  if (typeof v !== 'string' || !keys(list).includes(v)) throw bad(field, `${field} không hợp lệ`);
  return v;
};

function optMoney(v, field) {
  if (v === undefined || v === null || v === '') return null;
  return intIn(v, { min: 1000, max: 1_000_000_000, field });
}

// Trả về trường đã làm sạch + risk. Ném ApiError 400 khi sai hoặc dính bộ lọc lừa đảo.
export function validateJob(b, { create = true } = {}) {
  const j = {};
  j.title = cleanText(b.title, { max: 80, min: 4, field: 'Vị trí' });
  j.company = cleanText(b.company, { max: 60, min: 2, field: 'Tên quán, cửa hàng' });
  j.kind = oneOf(b.kind, KINDS, 'Loại việc');
  j.category = oneOf(b.category, CATEGORIES, 'Nhóm nghề');
  j.description = cleanMultiline(b.description, { max: 2000, min: 20, field: 'Mô tả công việc' });
  j.requirements = cleanMultiline(b.requirements, { max: 800, field: 'Yêu cầu' });
  j.payType = oneOf(b.payType, PAY_TYPES, 'Hình thức trả lương');
  const risk = [];
  if (j.payType === 'thoa_thuan') {
    j.payMin = null; j.payMax = null;
  } else {
    j.payMin = optMoney(b.payMin, 'Lương thấp nhất');
    j.payMax = optMoney(b.payMax, 'Lương cao nhất');
    if (j.payMin === null) throw bad('Lương', 'Hãy nhập mức lương thấp nhất, hoặc chọn "Thỏa thuận"');
    if (j.payMax !== null && j.payMax < j.payMin) throw bad('Lương', 'Lương cao nhất phải lớn hơn hoặc bằng lương thấp nhất');
    const bound = PAY_BOUNDS[j.payType];
    const top = j.payMax ?? j.payMin;
    if (top > bound.max) throw bad('Lương', `Mức lương theo ${labelOf(PAY_TYPES, j.payType)} quá cao, hãy kiểm tra lại số tiền`);
    if (top > bound.warn) risk.push('Mức lương cao bất thường so với mặt bằng chung');
    if (j.payMax !== null && j.payMax > j.payMin * 10) throw bad('Lương', 'Khoảng lương quá rộng, hãy ghi khoảng hẹp hơn');
  }
  if (b.shifts !== undefined && b.shifts !== null && !Array.isArray(b.shifts)) throw bad('Ca làm', 'Ca làm không hợp lệ');
  const sh = Array.isArray(b.shifts) ? b.shifts : [];
  if (sh.length > 5 || sh.some((x) => typeof x !== 'string' || !keys(SHIFTS).includes(x))) throw bad('Ca làm', 'Ca làm không hợp lệ');
  j.shifts = [...new Set(sh)];
  j.shiftNote = cleanText(b.shiftNote, { max: 100, field: 'Ghi chú ca, giờ làm' });
  j.city = oneOf(b.city, CITIES, 'Thành phố');
  j.district = cleanText(b.district, { max: 40, min: 2, field: 'Quận, huyện' });
  j.districtKey = normKey(j.district);
  if (!j.districtKey) throw bad('Quận, huyện', 'Quận, huyện không hợp lệ');
  j.address = cleanText(b.address, { max: 120, field: 'Địa chỉ cụ thể' });
  j.contactName = cleanText(b.contactName, { max: 50, min: 2, field: 'Tên người liên hệ' });
  j.contactPhone = cleanPhone(b.contactPhone, 'Số điện thoại liên hệ');
  j.startNow = b.startNow === true;
  j.slots = intIn(b.slots ?? 1, { min: 1, max: 100, field: 'Số lượng cần tuyển' });
  if (create || b.days !== undefined) j.days = intIn(b.days ?? config.defaultDays, { min: 1, max: config.maxDays, field: 'Số ngày đăng' });

  const scanned = scanFields({
    title: j.title, company: j.company, description: j.description, requirements: j.requirements, shiftNote: j.shiftNote, district: j.district, contactName: j.contactName,
  });
  if (scanned.leak.length) {
    const l = scanned.leak[0];
    throw new ApiError(400, 'contact_in_text', `Đừng ghi ${l.what} vào mục "${FIELD_LABEL[l.field]}". Hãy dùng ô liên hệ riêng: người xem sẽ được nhắc cảnh báo an toàn trước khi thấy số.`, { field: FIELD_LABEL[l.field], reason: l.what });
  }
  if (scanned.block.length) {
    const reasons = [...new Set(scanned.block.map((x) => x.reason))];
    throw new ApiError(400, 'scam_blocked',
      `Tin chưa đăng được: có dấu hiệu ${reasons.join('; ')}. 9hire không cho đăng tin yêu cầu người lao động trả tiền, đặt cọc, mua hàng hay phát triển tuyến dưới. Nếu tin của bạn đúng là việc làm bình thường, hãy bỏ các nội dung đó rồi đăng lại.`,
      { fields: [...new Set(scanned.block.map((x) => FIELD_LABEL[x.field]))], rules: [...new Set(scanned.block.map((x) => x.rule))] });
  }
  for (const r of scanned.risk) if (!risk.includes(r)) risk.push(r);
  j.risk = risk.length ? 1 : 0;
  j.riskNotes = risk;
  j.searchKey = normKey([j.title, j.company, labelOf(CATEGORIES, j.category), labelOf(KINDS, j.kind), j.district, labelOf(CITIES, j.city), j.description].join(' '));
  j.contentHash = sha256hex([normKey(j.title), normKey(j.description), j.districtKey, j.city].join('|'));
  return j;
}

export const stateOf = (r, now = Date.now()) => (r.status === 'dang' ? (new Date(r.expires_at).getTime() <= now ? 'het_han' : 'dang') : r.status);

// Dữ liệu công khai của tin: KHÔNG có employer_id, IP, số điện thoại, địa chỉ cụ thể
export function publicJob(r, extra = {}) {
  return {
    id: r.id, seq: r.seq, title: r.title, company: r.company, kind: r.kind, category: r.category,
    description: r.description, requirements: r.requirements,
    payType: r.pay_type, payMin: r.pay_min, payMax: r.pay_max, shifts: r.shifts, shiftNote: r.shift_note,
    city: r.city, district: r.district, startNow: r.start_now, slots: r.slots,
    risk: r.risk, riskNotes: r.risk_notes, hasAddress: !!r.address,
    createdAt: r.created_at, expiresAt: r.expires_at, state: stateOf(r),
    employerSince: r.employer_since ? new Date(r.employer_since).toISOString().slice(0, 10) : undefined,
    ...extra,
  };
}

export function summaryJob(r) {
  const j = publicJob(r);
  // danh sách chỉ cần đoạn đầu mô tả
  j.description = j.description.length > 160 ? j.description.slice(0, 157).replace(/\s+\S*$/, '') + '...' : j.description;
  delete j.requirements;
  return j;
}

const mustKey = (v, list, field) => {
  if (v === undefined || v === '') return null;
  if (typeof v !== 'string' || !keys(list).includes(v)) throw bad(field, `Bộ lọc ${field} không hợp lệ`);
  return v;
};

// Dựng điều kiện WHERE cho danh sách/đếm tin mới. Trả { where, params }
export function filterSql(q) {
  const conds = ["j.status = 'dang'", 'j.expires_at > now()'];
  const params = [];
  const p = (v) => { params.push(v); return '$' + params.length; };
  if (q.q) {
    const toks = normKey(String(q.q).slice(0, 120)).split(' ').filter(Boolean).slice(0, 6);
    for (const t of toks) conds.push(`(' ' || j.search_key) LIKE ${p('% ' + t.slice(0, 30) + '%')}`);
  }
  const city = mustKey(q.city, CITIES, 'thành phố'); if (city) conds.push(`j.city = ${p(city)}`);
  if (q.district) {
    const dk = normKey(String(q.district).slice(0, 60));
    if (dk) conds.push(`j.district_key LIKE ${p(dk + '%')}`);
  }
  const kind = mustKey(q.kind, KINDS, 'loại việc'); if (kind) conds.push(`j.kind = ${p(kind)}`);
  const cat = mustKey(q.category, CATEGORIES, 'nhóm nghề'); if (cat) conds.push(`j.category = ${p(cat)}`);
  const pt = mustKey(q.payType, PAY_TYPES, 'hình thức lương');
  if (pt) {
    conds.push(`j.pay_type = ${p(pt)}`);
    const min = Number.parseInt(q.minPay, 10);
    if (pt !== 'thoa_thuan' && Number.isSafeInteger(min) && min > 0) conds.push(`COALESCE(j.pay_max, j.pay_min) >= ${p(min)}`);
  }
  const sh = mustKey(q.shift, SHIFTS, 'ca làm');
  if (sh) conds.push(`(${p(sh)} = ANY(j.shifts) OR 'linh_hoat' = ANY(j.shifts))`);
  if (q.startNow === '1' || q.startNow === 'true') conds.push('j.start_now = true');
  return { conds, params, p };
}

// Ghi băm nội dung + SĐT liên hệ của tin vi phạm để chặn đăng lại
export async function blockJob(q, j) {
  await q("INSERT INTO blocked(kind, value) VALUES('hash', $1), ('phone', $2) ON CONFLICT DO NOTHING", [j.content_hash, j.contact_phone]);
}
export async function unblockJob(q, j) {
  await q("DELETE FROM blocked WHERE (kind='hash' AND value=$1) OR (kind='phone' AND value=$2)", [j.content_hash, j.contact_phone]);
}
export async function checkBlocked(q, hash, phone) {
  const r = await q("SELECT 1 FROM blocked WHERE (kind='hash' AND value=$1) OR (kind='phone' AND value=$2) LIMIT 1", [hash, phone]);
  if (r.length) throw new ApiError(403, 'blocked', 'Nội dung hoặc số liên hệ này từng bị gỡ vì vi phạm. Nếu bạn cho rằng nhầm lẫn, hãy khiếu nại qua tin bị ẩn hoặc liên hệ quản trị 9app.');
}
