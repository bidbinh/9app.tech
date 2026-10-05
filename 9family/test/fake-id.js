// 9id GIẢ cho kiểm thử đơn vị: cùng giao diện với máy khách thật (src/nine-id.js) nhưng chạy trong bộ nhớ.
// Giữ đúng ràng buộc quan trọng của 9id thật: verify theo token; users/families/members/children phải kèm token của chính người đó (sai -> 401 token_mismatch);
// người ngoài gia đình -> 404; vai 'con' chỉ thấy hồ sơ của mình và không thấy các con khác, không có note. Bản THẬT được kiểm riêng ở test/integration.
import crypto from 'node:crypto';
import { NineIdError } from '../src/nine-id.js';

export function createFakeId() {
  const users = new Map();      // userId -> { id, displayName }
  const sessions = new Map();   // token -> userId
  const families = new Map();   // fid -> { id, name, members: [{ userId, role }], children: [{ id, name, birthYear, linkedUserId, note }] }
  const pending = new Map();    // userId -> số lời mời chờ (do kiểm thử đặt)
  const approvals = new Map();
  const calls = [];
  const state = { down: false, delayMs: 0 };

  const uuid = () => crypto.randomUUID();
  const log = (name, args) => calls.push({ name, ...args });
  async function gate() {
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    if (state.down) throw new NineIdError(503, 'unavailable', 'giả lập: 9id không với tới được');
  }
  function bind(uid, token) {
    if (token === undefined || token === null || token === '') throw new NineIdError(401, 'token_required', 'Thiếu header X-9ID-Token');
    if (sessions.get(token) !== uid) throw new NineIdError(401, 'token_mismatch', 'Token phiên không khớp');
  }
  const member = (f, uid) => f.members.find((m) => m.userId === uid);

  const client = {
    async verify(token) {
      await gate(); log('verify', { token });
      const uid = sessions.get(token);
      if (!uid) return null;
      const u = users.get(uid);
      return { userId: u.id, displayName: u.displayName };
    },
    async userFamilies(uid, token) {
      await gate(); log('userFamilies', { uid, token }); bind(uid, token);
      const fams = [...families.values()].filter((f) => member(f, uid));
      return {
        families: fams.map((f) => ({ id: f.id, name: f.name, role: member(f, uid).role, memberCount: f.members.length, childCount: member(f, uid).role === 'con' ? null : f.children.length })),
        pendingInvitations: pending.get(uid) || 0, pendingApprovals: approvals.get(uid) || 0,
      };
    },
    async members(fid, as, token) {
      await gate(); log('members', { fid, as, token }); bind(as, token);
      const f = families.get(fid); const me = f && member(f, as);
      if (!me) throw new NineIdError(404, 'not_found', 'Không tìm thấy');
      return { role: me.role, members: f.members.filter((m) => me.role !== 'con' || m.role !== 'con' || m.userId === as).map((m) => ({ userId: m.userId, displayName: users.get(m.userId).displayName, role: m.role, joinedAt: '2026-10-01T00:00:00Z' })) };
    },
    async children(fid, as, token) {
      await gate(); log('children', { fid, as, token }); bind(as, token);
      const f = families.get(fid); const me = f && member(f, as);
      if (!me) throw new NineIdError(404, 'not_found', 'Không tìm thấy');
      const kids = me.role === 'con' ? f.children.filter((k) => k.linkedUserId === as) : f.children;
      return { role: me.role, notesHidden: false, children: kids.map((k) => ({ id: k.id, name: k.name, birthYear: k.birthYear ?? null, linkedUserId: k.linkedUserId || null, ...(me.role === 'con' || k.note === undefined ? {} : { note: k.note }) })) };
    },
    // nhập gia đình (cho scripts/export-to-9id.js)
    imports: [],
    async importFamily(p) {
      await gate(); log('importFamily', { id: p.family.id });
      if (families.has(p.family.id)) throw new NineIdError(409, 'exists', 'Gia đình này đã được nhập');
      families.set(p.family.id, { id: p.family.id, name: p.family.name, members: [], children: p.children.map((k) => ({ ...k, linkedUserId: null })) });
      const claimCode = 'ABCDE-FGHJK-LMNPQ-' + crypto.randomBytes(3).toString('hex').toUpperCase().replace(/[01OI]/g, 'X').slice(0, 5);
      const r = { familyId: p.family.id, claimId: uuid(), claimCode, expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() };
      client.imports.push({ payload: JSON.parse(JSON.stringify(p)), ...r });
      return r;
    },
    async reissueClaim(fid) {
      await gate(); const f = families.get(fid);
      if (!f) throw new NineIdError(404, 'not_found', 'Không tìm thấy');
      if (f.members.some((m) => m.role === 'chu')) throw new NineIdError(409, 'claimed', 'Gia đình này đã có chủ');
      return { familyId: fid, claimId: uuid(), claimCode: 'ZZZZZ-FGHJK-LMNPQ-RSTUV', expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() };
    },
  };

  const api = {
    client, calls, state, users, sessions, families,
    signup(displayName) {
      const id = uuid(); users.set(id, { id, displayName });
      const token = crypto.randomBytes(32).toString('base64url'); sessions.set(token, id);
      return { userId: id, token, displayName };
    },
    login(userId) { const token = crypto.randomBytes(32).toString('base64url'); sessions.set(token, userId); return token; },
    revokeSession(token) { sessions.delete(token); },
    deleteUser(userId) { users.delete(userId); for (const [t, u] of [...sessions]) if (u === userId) sessions.delete(t); for (const f of families.values()) f.members = f.members.filter((m) => m.userId !== userId); },
    rename(userId, name) { users.get(userId).displayName = name; },
    createFamily(userId, name = 'Nhà Cún', fid = uuid()) { families.set(fid, { id: fid, name, members: [{ userId, role: 'chu' }], children: [] }); return fid; },
    addMember(fid, userId, role = 'thanh_vien') { families.get(fid).members.push({ userId, role }); },
    removeMember(fid, userId) { const f = families.get(fid); f.members = f.members.filter((m) => m.userId !== userId); for (const k of f.children) if (k.linkedUserId === userId) k.linkedUserId = null; },
    setRole(fid, userId, role) {
      const f = families.get(fid);
      if (role === 'chu') for (const m of f.members) if (m.role === 'chu') m.role = 'quan_ly';
      member(f, userId).role = role;
    },
    addChild(fid, { name = 'Bống', birthYear = null, linkedUserId = null, note, id = uuid() } = {}) {
      const k = { id, name, birthYear, linkedUserId, ...(note === undefined ? {} : { note }) };
      families.get(fid).children.push(k); if (linkedUserId && !member(families.get(fid), linkedUserId)) families.get(fid).members.push({ userId: linkedUserId, role: 'con' });
      return k;
    },
    renameChild(fid, cid, name) { families.get(fid).children.find((k) => k.id === cid).name = name; },
    archiveChild(fid, cid) { const f = families.get(fid); f.children = f.children.filter((k) => k.id !== cid); },
    renameFamily(fid, name) { families.get(fid).name = name; },
    setPending(userId, n) { pending.set(userId, n); },
    setApprovals(userId, n) { approvals.set(userId, n); },
    tokenCalls: (name) => calls.filter((c) => c.name === name),
  };
  return api;
}
