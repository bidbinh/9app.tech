import { query } from './db.js';
import { ApiError } from './errors.js';
import * as box from './cryptobox.js';
import { assertAllowedUrl, ConnectorError } from './connector.js';

const ID_RE = /^[a-z0-9_-]{2,30}$/;

export const publicApp = (a) => ({
  id: a.id, name: a.name, baseUrl: a.base_url, keyId: a.key_id, enabled: a.enabled, sort: a.sort, note: a.note,
  manifest: a.manifest || null, panels: (a.panels && a.panels.items) || [], adminUrl: a.admin_url || '',
});

export async function listApps({ all = false } = {}) {
  return query(`SELECT * FROM apps ${all ? '' : 'WHERE enabled'} ORDER BY sort, id`);
}

export async function getApp(id) {
  const r = (await query('SELECT * FROM apps WHERE id=$1', [String(id)]))[0];
  if (!r) throw new ApiError(404, 'app_not_found', 'Không có app này');
  return r;
}

export async function upsertApp({ id, name, baseUrl, keyId, secret, note = '', sort = 100, enabled = true }) {
  if (!ID_RE.test(String(id))) throw new ApiError(400, 'invalid_request', 'Mã app gồm 2-30 ký tự a-z, 0-9, _ hoặc -', { field: 'id' });
  const n = String(name || '').trim();
  if (n.length < 1 || n.length > 60) throw new ApiError(400, 'invalid_request', 'Tên app cần 1-60 ký tự', { field: 'name' });
  try { assertAllowedUrl(baseUrl); } catch (e) { if (e instanceof ConnectorError) throw new ApiError(400, e.code, e.message, { field: 'baseUrl' }); throw e; }
  const key = String(keyId || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(key)) throw new ApiError(400, 'invalid_request', 'Mã khóa gồm chữ, số, . _ - (tối đa 60 ký tự)', { field: 'keyId' });
  const existing = (await query('SELECT secret_enc FROM apps WHERE id=$1', [id]))[0];
  let sealed = existing && existing.secret_enc;
  if (secret) {
    if (String(secret).length < 24) throw new ApiError(400, 'invalid_request', 'Bí mật cần ít nhất 24 ký tự', { field: 'secret' });
    sealed = box.seal(secret);
  }
  if (!sealed) throw new ApiError(400, 'invalid_request', 'Thiếu bí mật kết nối', { field: 'secret' });
  await query(
    `INSERT INTO apps(id, name, base_url, key_id, secret_enc, note, sort, enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, base_url=EXCLUDED.base_url, key_id=EXCLUDED.key_id,
       secret_enc=EXCLUDED.secret_enc, note=EXCLUDED.note, sort=EXCLUDED.sort, enabled=EXCLUDED.enabled`,
    [id, n, String(baseUrl).replace(/\/+$/, ''), key, sealed, String(note).slice(0, 300), Number.isInteger(sort) ? sort : 100, Boolean(enabled)]);
  await query('INSERT INTO app_status(app_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
  return publicApp(await getApp(id));
}

export async function removeApp(id) {
  await getApp(id);
  await query('DELETE FROM apps WHERE id=$1', [id]);
}

// Nạp danh sách app từ biến môi trường CONSOLE_APPS (JSON) khi khởi động — tiện cho triển khai.
export async function seedFromEnv(json = process.env.CONSOLE_APPS) {
  if (!json) return 0;
  let list;
  try { list = JSON.parse(json); } catch { throw new Error('CONSOLE_APPS không phải JSON hợp lệ'); }
  for (const a of list) await upsertApp({ id: a.id, name: a.name, baseUrl: a.baseUrl, keyId: a.keyId, secret: a.secret, note: a.note, sort: a.sort });
  return list.length;
}
