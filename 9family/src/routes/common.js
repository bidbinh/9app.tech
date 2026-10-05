import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { requireSession, requireMember, forbidden } from '../auth.js';
import { withIdem } from '../idem.js';
import { bump } from '../notify.js';
import { uuidParam } from '../util.js';

// Định tuyến cho mọi endpoint thuộc một gia đình: kiểm tra đăng nhập 9id (chưa đăng nhập: 401), thành viên (người ngoài nhận 404), ghi thì tăng rev.
// `me` = hàng members của người gọi + { userId (id 9id), memberId, role (theo 9id: chu | quan_ly | thanh_vien | con), isExternal, childIds }.
// Vai 'con' MẶC ĐỊNH bị từ chối ở mọi tuyến (an toàn cho module mới); tuyến nào con được dùng phải khai opts.con = true và tự lọc dữ liệu theo me.childIds / me.id.
export function famRoutes(app) {
  function add(method, path, handler, opts = {}) {
    const wrapped = async (ctx) => {
      requireSession(ctx);
      const fid = uuidParam(ctx.params.fid);
      const me = await requireMember(query, ctx, fid);
      if (me.role === 'con' && !opts.con) throw forbidden('Tài khoản của con chỉ xem được lịch, việc và đưa đón của mình');
      ctx.fid = fid; ctx.me = me;
      const out = await handler(ctx, me, fid);
      if (method !== 'GET' && !ctx.noBump) await bump(query, fid);
      return out;
    };
    app.route(method, '/api/families/:fid' + path, method === 'GET' ? wrapped : withIdem(wrapped, { noBody: !!opts.noIdemBody }), opts);
  }
  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    del: (p, h, o) => add('DELETE', p, h, o),
  };
}

export const publicPost = (app, p, h, o = {}) => app.route('POST', p, withIdem(h, { noBody: !!o.noIdemBody }), o);

export const uniqueViolation = (e) => e && e.code === '23505';

export async function countOf(q, sql, params) { return (await q(sql, params))[0].n; }

// Số điện thoại/ghi chú nhận dạng của người đón hộ không trả cho tài khoản của con
export const memberOut = (m, me) => ({
  id: m.id, name: m.name, relation: m.relation, role: m.role, external: m.external,
  phone: me.role === 'con' ? '' : m.phone, note: me.role === 'con' ? '' : m.note, pending: false, isMe: m.id === me.id,
});
// note = ghi chú đưa đón riêng của 9family (không phải ghi chú sức khỏe của 9id); tài khoản của con không thấy
export const childOut = (c, me) => ({ id: c.id, name: c.name, birthYear: c.birth_year, school: c.school, grade: c.grade, color: c.color, note: me && me.role === 'con' ? '' : c.note, linked: !!c.linked_user_id });

export function need(cond, status, code, msg) { if (!cond) throw new ApiError(status, code, msg); }
