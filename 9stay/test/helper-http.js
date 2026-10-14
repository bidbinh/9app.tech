// Kiểm thử HTTP: máy chủ thật, PostgreSQL thật, 9id giả (cookie nine_sid = "tok:<userId>").
import crypto from 'node:crypto';
import { db, seed, NOW } from './helper.js';
import { buildApp } from '../src/server.js';
import { config } from '../src/config.js';
import { createOwner, createUnit, createContract, openNights } from '../src/inventory.js';
import { ensureRatePlans, setRates } from '../src/pricing.js';
import { createAgent } from '../src/agents.js';

export { NOW };

export const fakeId = {
  async verify(token) {
    if (typeof token !== 'string' || !token.startsWith('tok:')) return null;
    const userId = token.slice(4);
    return { userId, displayName: 'Người ' + userId.slice(0, 4) };
  },
};

export async function startServer({ idClient = fakeId, cfg = config, extra, otpSender, fetchText } = {}) {
  const app = buildApp({ idClient, cfg, clock: () => NOW, ...(otpSender ? { otpSender } : {}), ...(fetchText ? { fetchText } : {}) });
  if (extra) extra(app);
  const port = await app.listen(0);
  return { app, port, base: `http://127.0.0.1:${port}${cfg.basePath}`, origin: `http://127.0.0.1:${port}`, close: () => app.close() };
}

export class Api {
  constructor(srv, userId = null, token = null) {
    this.srv = srv;
    this.userId = userId;
    this.token = token ?? (userId ? 'tok:' + userId : null);
  }

  async req(method, path, body, { csrf = true, origin, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (this.token) h.cookie = `nine_sid=${encodeURIComponent(this.token)}`;
    if (method !== 'GET' && csrf) h['x-requested-with'] = '9stay';
    if (origin) h.origin = origin;
    let payload;
    if (raw !== undefined) { payload = raw; h['content-type'] = 'application/json'; } else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    const r = await fetch(this.srv.base + path, { method, headers: h, body: payload });
    const text = Buffer.from(await r.arrayBuffer()).toString('utf8'); // giữ nguyên BOM (r.text() sẽ cắt BOM)
    let json = null;
    try { json = JSON.parse(text); } catch { /* không phải JSON */ }
    return { status: r.status, json, text, headers: r.headers };
  }

  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}, o) { return this.req('POST', p, b, o); }
  put(p, b = {}, o) { return this.req('PUT', p, b, o); }
}

const uid = () => crypto.randomUUID();

// Org Anstay: 2 chủ (Minh: A1205, A1206; Lan: B1), 2 CTV, giá 650k tháng 11, hợp đồng 70%, và một người của mỗi vai.
export async function apiWorld() {
  const w = await seed();
  const plans = await db.tx((c) => ensureRatePlans(c, { orgId: w.orgId }));
  await db.tx((c) => setRates(c, { orgId: w.orgId, roomTypeId: w.roomTypeId, planId: plans.public, from: '2026-11-01', to: '2026-12-01', price: 650000 }));
  const ag1 = await db.tx((c) => createAgent(c, { orgId: w.orgId, name: 'Hoa', kind: 'ctv', commissionPct: 10 }));
  const ag2 = await db.tx((c) => createAgent(c, { orgId: w.orgId, name: 'Quân', kind: 'ctv', commissionPct: 5 }));
  const lan = await db.tx(async (c) => {
    const o = await createOwner(c, { orgId: w.orgId, name: 'Lan' });
    const u = await createUnit(c, { orgId: w.orgId, buildingId: w.buildingId, ownerId: o.id, roomTypeId: w.roomTypeId, code: 'B1' });
    await openNights(c, { orgId: w.orgId, unitId: u.id, from: '2026-11-01', to: '2026-12-01' });
    return { ownerId: o.id, unitId: u.id };
  });
  for (const [ownerId, unitId] of [[w.ownerId, w.unitId], [w.ownerId, w.unit2Id], [lan.ownerId, lan.unitId]]) {
    await db.tx((c) => createContract(c, { orgId: w.orgId, ownerId, unitId, validFrom: '2026-01-01' }));
  }
  const users = { quanly: uid(), letan: uid(), buongphong: uid(), ctv1: uid(), ctv2: uid(), chu1: uid(), chu2: uid(), outsider: uid() };
  const add = (key, role, extra = {}) => db.query(
    'INSERT INTO members(org_id, user_id, display_name, role, owner_id, agent_id) VALUES($1, $2, $3, $4, $5, $6)',
    [w.orgId, users[key], key, role, extra.ownerId ?? null, extra.agentId ?? null],
  );
  await add('quanly', 'quanly');
  await add('letan', 'letan');
  await add('buongphong', 'buongphong');
  await add('ctv1', 'ctv', { agentId: ag1.id });
  await add('ctv2', 'ctv', { agentId: ag2.id });
  await add('chu1', 'chu', { ownerId: w.ownerId });
  await add('chu2', 'chu', { ownerId: lan.ownerId });
  return { ...w, plans, ag1: ag1.id, ag2: ag2.id, lan, users };
}

export const as = (srv, w, key) => new Api(srv, w.users[key]);
