// Hành động chờ xác nhận. Quy tắc cốt lõi: chỉ NGƯỜI DÙNG (qua endpoint riêng, có CSRF, kiểm userId) mới làm hành động chạy;
// tham số được chốt lúc xem trước và bảo vệ bằng HMAC; chiếm hành động bằng một câu UPDATE có điều kiện nên chỉ chạy đúng một lần.
import { config } from './config.js';
import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import { canonicalJson } from '../sdk/osin-sdk.js';
import { hmacHex, newId, safeEqual, softText, uuidParam, logEvent } from './util.js';

export const canonical = canonicalJson;
export function integrityOf(p) {
  return hmacHex(config.secret, ['pending-v1', p.id, p.user_id, p.app_id, p.tool, canonical(p.args), p.family_id || '', p.summary, new Date(p.expires_at).toISOString()].join('\n'));
}

export async function createPending({ userId, appId, tool, args, familyId, title, summary, warning }) {
  const id = newId();
  const expires = new Date(Date.now() + config.pendingTtlMin * 60_000);
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['pend:' + userId]);
    // thử lại/hỏi lại cùng một việc: thẻ cũ chưa xác nhận của đúng việc này bị đóng, chỉ còn thẻ mới
    await c.query("UPDATE pending_actions SET status='cancelled', decided_at=now(), error_text='Đã thay bằng thẻ mới' WHERE user_id=$1 AND app_id=$2 AND tool=$3 AND args=$4::jsonb AND family_id IS NOT DISTINCT FROM $5 AND status='pending'", [userId, appId, tool, JSON.stringify(args), familyId || null]);
    const open = (await c.query("SELECT count(*)::int AS n FROM pending_actions WHERE user_id=$1 AND status='pending' AND expires_at > now()", [userId]))[0].n;
    if (open >= config.maxPendingOpen) throw new ApiError(429, 'too_many_pending', 'Bạn đang có quá nhiều việc chờ xác nhận. Hãy xác nhận hoặc hủy bớt trước.');
    const row = { id, user_id: userId, app_id: appId, tool, args, family_id: familyId || null, title, summary, expires_at: expires };
    const integrity = integrityOf(row);
    await c.query('INSERT INTO pending_actions(id, user_id, app_id, tool, args, family_id, title, summary, integrity, expires_at, warning) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [id, userId, appId, tool, JSON.stringify(args), row.family_id, title, summary, integrity, expires, warning || null]);
    return { id, title, summary, warning: warning || undefined, expiresAt: expires.toISOString() };
  });
}

export async function cancelPendingByIds(userId, ids) {
  if (!ids.length) return;
  await query("UPDATE pending_actions SET status='cancelled', decided_at=now() WHERE user_id=$1 AND id = ANY($2::uuid[]) AND status='pending'", [userId, ids]);
}

const publicOf = (r) => ({ id: r.id, status: r.status, title: r.title, summary: r.summary, expiresAt: new Date(r.expires_at).toISOString(), resultText: r.result_text || undefined, errorText: r.error_text || undefined, warning: r.warning || undefined });

/** Nạp trạng thái hiện tại cho các thẻ hành động của CHÍNH người dùng này. */
export async function hydrateCards(userId, cards) {
  const ids = [...new Set((cards || []).filter((c) => c && c.type === 'action').map((c) => c.id))];
  if (!ids.length) return cards || [];
  const rows = await query('SELECT id, status, title, summary, expires_at, result_text, error_text, warning FROM pending_actions WHERE user_id=$1 AND id = ANY($2::uuid[])', [userId, ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return cards.map((c) => {
    if (c.type !== 'action') return c;
    const r = byId.get(c.id);
    if (!r) return { type: 'action', id: c.id, status: 'gone', summary: 'Hành động này không còn trong lịch sử.', title: '' };
    let st = r.status;
    if (st === 'pending' && new Date(r.expires_at) <= new Date()) st = 'expired';
    return { type: 'action', ...publicOf({ ...r, status: st }) };
  });
}

export async function cancelAction(userId, rawId) {
  const id = uuidParam(rawId);
  const rows = await query("UPDATE pending_actions SET status='cancelled', decided_at=now() WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING id, status, title, summary, expires_at, result_text, error_text", [id, userId]);
  if (rows.length) return publicOf(rows[0]);
  const cur = (await query('SELECT id, status, title, summary, expires_at, result_text, error_text, warning FROM pending_actions WHERE id=$1 AND user_id=$2', [id, userId]))[0];
  if (!cur) throw new ApiError(404, 'not_found', 'Không tìm thấy hành động này');
  if (cur.status === 'cancelled') return publicOf(cur);
  throw new ApiError(409, 'not_pending', cur.status === 'done' ? 'Hành động này đã được thực hiện rồi, không hủy được nữa.' : 'Hành động này không còn chờ xác nhận.');
}

export async function confirmAction(userId, rawId, { registry }) {
  const id = uuidParam(rawId);
  // chiếm hành động: chỉ MỘT yêu cầu thắng dù bấm hai lần hay đua nhau; sai người, hết hạn, đã xử lý đều không chiếm được
  const claimed = await query("UPDATE pending_actions SET status='running', decided_at=now() WHERE id=$1 AND user_id=$2 AND status='pending' AND expires_at > now() RETURNING *", [id, userId]);
  if (!claimed.length) {
    const cur = (await query('SELECT id, status, title, summary, expires_at, result_text, error_text, warning FROM pending_actions WHERE id=$1 AND user_id=$2', [id, userId]))[0];
    if (!cur) throw new ApiError(404, 'not_found', 'Không tìm thấy hành động này');
    if (cur.status === 'pending') { // quá hạn
      await query("UPDATE pending_actions SET status='expired', decided_at=now() WHERE id=$1 AND user_id=$2 AND status='pending'", [id, userId]);
      throw new ApiError(410, 'expired', 'Hành động này đã hết hạn. Bạn nhờ Osin làm lại nhé.');
    }
    if (cur.status === 'done') return { ...publicOf(cur), already: true };
    if (cur.status === 'running') throw new ApiError(409, 'running', 'Hành động đang được thực hiện, đợi một chút.');
    if (cur.status === 'expired') throw new ApiError(410, 'expired', 'Hành động này đã hết hạn. Bạn nhờ Osin làm lại nhé.');
    throw new ApiError(409, 'not_pending', cur.status === 'cancelled' ? 'Hành động này đã bị hủy.' : 'Hành động này đã xử lý xong, không chạy lại.');
  }
  const row = claimed[0];
  const finish = async (status, resultText, errorText) => {
    const r = await query('UPDATE pending_actions SET status=$3, result_text=$4, error_text=$5, decided_at=now() WHERE id=$1 AND user_id=$2 RETURNING id, status, title, summary, expires_at, result_text, error_text, warning', [id, userId, status, resultText || null, errorText || null]);
    // hàng có thể đã bị xóa (người dùng xóa dữ liệu trong lúc hành động đang chạy): vẫn trả kết quả đúng sự thật, không lỗi
    if (!r.length) return { id, status, title: row.title, summary: row.summary, expiresAt: new Date(row.expires_at).toISOString(), resultText: resultText || undefined, errorText: errorText || undefined, deleted: true };
    return publicOf(r[0]);
  };
  // toàn vẹn: tham số/tóm tắt không bị sửa trong CSDL kể từ lúc xem trước
  if (!safeEqual(integrityOf(row), row.integrity)) {
    logEvent('pending_integrity_fail', { id });
    return finish('failed', null, 'Không thực hiện vì dữ liệu hành động không còn khớp. Bạn nhờ Osin làm lại nhé.');
  }
  try {
    await registry.listTools();
    const entry = registry.get(`${row.app_id}__${row.tool}`);
    if (!entry || entry.sensitive) return finish('failed', null, 'Công cụ này không còn khả dụng, chưa có gì được thực hiện.');
    const r = await registry.callApp(entry, { mode: 'execute', args: row.args, userId, familyId: row.family_id, requestId: row.id, timeoutMs: registry.timeouts.confirm, confirmed: true });
    if (r.ok) {
      const msg = r.result && typeof r.result === 'object' && typeof r.result.message === 'string' ? softText(r.result.message, 300) : '';
      return finish('done', msg || `Đã thực hiện: ${row.summary}`, null);
    }
    if (r.transport && !r.notSent) {
      return finish('failed', null, 'Chưa chắc hành động đã được thực hiện (' + r.error.message + ') Hãy kiểm tra trong app trước khi nhờ Osin làm lại.');
    }
    return finish('failed', null, r.error.message || 'Hành động không thực hiện được.');
  } catch (e) {
    logEvent('pending_exec_error', { id, code: e && e.code });
    return finish('failed', null, 'Chưa chắc hành động đã được thực hiện (lỗi bất ngờ). Hãy kiểm tra trong app trước khi nhờ Osin làm lại.');
  }
}
