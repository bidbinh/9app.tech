// Đồng bộ định kỳ từ các app: tình trạng, tóm tắt, bảng quản trị, người dùng, dòng tiền, số dư.
// Mọi thao tác ghi đều idempotent (khóa chính theo (app, id)) nên chạy lại bất kỳ lúc nào cũng an toàn.
import { config } from './config.js';
import { query, tx } from './db.js';
import * as C from './contract.js';
import { call } from './connector.js';
import { listApps, getApp } from './registry.js';

const PAGE = 500;
const MAX_PAGES = 40;
const FULL_USERS_EVERY_H = 24;

export const normPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
  return d;
};

async function setState(appId, stream, patch) {
  await query(
    `INSERT INTO sync_state(app_id, stream, cursor, last_ok_at, last_full_at, last_error, last_count) VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (app_id, stream) DO UPDATE SET cursor=COALESCE($3, sync_state.cursor), last_ok_at=COALESCE($4, sync_state.last_ok_at),
       last_full_at=COALESCE($5, sync_state.last_full_at), last_error=$6, last_count=$7`,
    [appId, stream, patch.cursor ?? null, patch.okAt ?? null, patch.fullAt ?? null, patch.error ?? null, patch.count ?? 0]);
}

async function pull(app, stream, path, validate, store, { reset = false } = {}) {
  const st = (await query('SELECT * FROM sync_state WHERE app_id=$1 AND stream=$2', [app.id, stream]))[0];
  let cursor = reset ? null : (st && st.cursor) || null;
  let total = 0;
  let last = cursor;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await call(app, 'GET', path, { query: { after: cursor, limit: PAGE }, validate });
      if (r.items.length) { await store(app, r.items); total += r.items.length; }
      if (r.next) { cursor = r.next; last = r.next; }
      if (!r.hasMore || !r.items.length) break;
    }
    await setState(app.id, stream, { cursor: last, okAt: new Date(), fullAt: reset ? new Date() : null, error: null, count: total });
    return total;
  } catch (e) {
    await setState(app.id, stream, { error: String(e.message).slice(0, 300), count: total });
    throw e;
  }
}

async function storeUsers(app, items) {
  for (const u of items) {
    await query(
      `INSERT INTO users_index(app_id, app_user_id, phone, name, status, created_at, last_seen_at, extra, synced_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (app_id, app_user_id) DO UPDATE SET phone=EXCLUDED.phone, name=EXCLUDED.name, status=EXCLUDED.status,
         created_at=COALESCE(EXCLUDED.created_at, users_index.created_at), last_seen_at=COALESCE(EXCLUDED.last_seen_at, users_index.last_seen_at),
         extra=EXCLUDED.extra, synced_at=now()`,
      [app.id, u.id, normPhone(u.phone), u.name, u.status, u.createdAt, u.lastSeenAt, JSON.stringify(u.extra)]);
  }
}

async function storeCash(app, items) {
  await tx(async (c) => {
    for (const e of items) {
      await c.query(
        `INSERT INTO cash_entries(app_id, entry_id, at, kind, amount, category, description, ref, phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (app_id, entry_id) DO NOTHING`,
        [app.id, e.id, e.at, e.kind, e.amount, e.category, e.description, e.ref, normPhone(e.phone)]);
    }
  });
}

// Làm mới một app. Trả về kết quả từng bước; không ném lỗi ra ngoài (lỗi được ghi vào trạng thái).
export async function refreshApp(appId, { forceFull = false } = {}) {
  const app = await getApp(appId);
  const out = { app: app.id, steps: {} };
  const step = async (name, fn) => {
    try { out.steps[name] = { ok: true, value: await fn() }; } catch (e) { out.steps[name] = { ok: false, error: String(e.message).slice(0, 300) }; }
  };

  let manifest = null;
  await step('manifest', async () => {
    manifest = await call(app, 'GET', '/manifest', { validate: C.manifest });
    if (manifest.app.id !== app.id) throw new Error(`app tự nhận là "${manifest.app.id}" nhưng khai báo ở cổng là "${app.id}"`);
    await query('UPDATE apps SET manifest=$2, admin_url=$3 WHERE id=$1', [app.id, JSON.stringify(manifest), manifest.adminUrl || null]);
  });
  let healthOk = false; let healthDetail = '';
  await step('health', async () => {
    const h = await call(app, 'GET', '/health', { validate: C.health });
    healthOk = h.ok; healthDetail = h.details;
  });
  if (!out.steps.manifest.ok || !out.steps.health.ok) {
    const why = !out.steps.manifest.ok ? out.steps.manifest.error : out.steps.health.error;
    await query(`INSERT INTO app_status(app_id, ok, detail, checked_at) VALUES($1,false,$2,now())
                 ON CONFLICT (app_id) DO UPDATE SET ok=false, detail=$2, checked_at=now()`, [app.id, why]);
    return out;
  }
  await query(`INSERT INTO app_status(app_id, ok, detail, checked_at) VALUES($1,$2,$3,now())
               ON CONFLICT (app_id) DO UPDATE SET ok=$2, detail=$3, checked_at=now()`, [app.id, healthOk, healthDetail]);

  const caps = manifest.capabilities;
  await step('summary', async () => {
    const s = await call(app, 'GET', '/summary', { validate: C.summary });
    await query('UPDATE app_status SET summary=$2, summary_at=now() WHERE app_id=$1', [app.id, JSON.stringify(s)]);
  });
  if (caps.includes('panels')) {
    await step('panels', async () => {
      const p = await call(app, 'GET', '/panels', { validate: C.panels });
      await query('UPDATE apps SET panels=$2 WHERE id=$1', [app.id, JSON.stringify(p)]);
    });
  }
  if (caps.includes('users')) {
    await step('users', async () => {
      const st = (await query("SELECT last_full_at FROM sync_state WHERE app_id=$1 AND stream='users'", [app.id]))[0];
      const reset = forceFull || !st || !st.last_full_at || (Date.now() - new Date(st.last_full_at)) > FULL_USERS_EVERY_H * 3600_000;
      return pull(app, 'users', '/users', C.usersPage, storeUsers, { reset });
    });
  }
  if (caps.includes('money')) {
    await step('cash', async () => pull(app, 'cash', '/cash', C.cashPage, storeCash));
    await step('balances', async () => {
      const b = await call(app, 'GET', '/balances', { validate: C.balances });
      await tx(async (c) => {
        await c.query('DELETE FROM balances WHERE app_id=$1', [app.id]);
        for (const i of b.items) await c.query('INSERT INTO balances(app_id, item_id, label, amount, kind) VALUES($1,$2,$3,$4,$5)', [app.id, i.id, i.label, i.amount, i.kind]);
      });
    });
  }
  return out;
}

export async function refreshAll(opts) {
  const results = [];
  for (const a of await listApps()) {
    try { results.push(await refreshApp(a.id, opts)); } catch (e) { results.push({ app: a.id, error: String(e.message) }); }
  }
  return results;
}

let timer = null;
export function start() {
  if (timer) return;
  const run = () => refreshAll().catch((e) => console.error('[sync]', e.message));
  setTimeout(run, 3000).unref();
  timer = setInterval(run, config.syncEveryMin * 60_000);
  timer.unref();
}
export function stop() { if (timer) { clearInterval(timer); timer = null; } }

// Tình trạng hiển thị: ok | stale (quá hạn đồng bộ) | down
export function statusOf(row) {
  if (!row.checked_at) return 'unknown';
  if (!row.ok) return 'down';
  return (Date.now() - new Date(row.checked_at)) > config.staleAfterMin * 60_000 ? 'stale' : 'ok';
}
