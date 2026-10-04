import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { requireSession, requireMember } from '../auth.js';
import { withIdem } from '../idem.js';
import { bump } from '../notify.js';
import { uuidParam } from '../util.js';

// Định tuyến cho mọi endpoint thuộc một gia đình: kiểm tra phiên, thành viên (người ngoài nhận 404), ghi thì tăng rev.
export function famRoutes(app) {
  function add(method, path, handler, opts = {}) {
    const wrapped = async (ctx) => {
      requireSession(ctx);
      const fid = uuidParam(ctx.params.fid);
      const me = await requireMember(query, ctx, fid);
      ctx.fid = fid; ctx.me = me;
      const out = await handler(ctx, me, fid);
      if (method !== 'GET' && !ctx.noBump) await bump(query, fid);
      return out;
    };
    app.route(method, '/api/families/:fid' + path, method === 'GET' ? wrapped : withIdem(wrapped), opts);
  }
  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    del: (p, h, o) => add('DELETE', p, h, o),
  };
}

export const publicPost = (app, p, h, o = {}) => app.route('POST', p, withIdem(h), o);

export const uniqueViolation = (e) => e && e.code === '23505';

export async function countOf(q, sql, params) { return (await q(sql, params))[0].n; }

export const memberOut = (m, me) => ({
  id: m.id, name: m.name, relation: m.relation, role: m.role, external: m.external,
  phone: m.phone, note: m.note, pending: !m.external && !m.joined_at, isMe: m.id === me.id,
});
export const childOut = (c) => ({ id: c.id, name: c.name, birthYear: c.birth_year, school: c.school, grade: c.grade, color: c.color, note: c.note });

export function need(cond, status, code, msg) { if (!cond) throw new ApiError(status, code, msg); }
