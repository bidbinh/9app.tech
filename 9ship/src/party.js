// Chuẩn hóa một bên gửi/nhận (người + địa chỉ). Dùng chung cho đơn hàng và sổ địa chỉ.
import { ApiError } from './errors.js';
import { normalizePhone } from './auth.js';
import { findProvince, canonicalWard } from './geo.js';

const bad = (msg, field) => new ApiError(400, 'invalid_request', msg, { field });

export function cleanParty(p, field) {
  if (!p || typeof p !== 'object') throw bad(`${field} là bắt buộc`, field);
  const prov = findProvince(p.province);
  if (!prov) throw bad(`${field}.province không hợp lệ`, field + '.province');
  const contact = String(p.contact || '').trim();
  const street = String(p.street || '').trim();
  if (contact.length < 2 || contact.length > 80) throw bad('Họ tên cần 2-80 ký tự', field + '.contact');
  if (street.length < 3 || street.length > 200) throw bad('Số nhà, đường cần 3-200 ký tự', field + '.street');
  let phone;
  try { phone = normalizePhone(p.phone); } catch { throw bad('Số điện thoại không hợp lệ', field + '.phone'); }
  const ward = canonicalWard(prov.code, p.ward);
  if (!ward) throw bad(`Hãy chọn phường/xã thuộc ${prov.name}`, field + '.ward');
  return { contact, phone, street, ward, province: prov.code, provinceName: prov.name };
}
