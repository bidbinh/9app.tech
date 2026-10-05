// Lưu trữ: lịch sử hội thoại, cài đặt, xuất/xóa dữ liệu. MỌI truy vấn đều lọc theo user_id của người dùng đang đăng nhập.
import { config } from './config.js';
import { query, tx } from './db.js';
import { hydrateCards } from './pending.js';

export async function getPrefs(userId) {
  const r = (await query('SELECT family_id, consent_at, consent_version FROM user_prefs WHERE user_id=$1', [userId]))[0];
  return { familyId: r ? r.family_id : null, consentAt: r && r.consent_at ? new Date(r.consent_at).toISOString() : null, consentVersion: r ? r.consent_version : 0 };
}
export async function setConsent(userId) {
  await query('INSERT INTO user_prefs(user_id, consent_at, consent_version) VALUES($1, now(), $2) ON CONFLICT (user_id) DO UPDATE SET consent_at = now(), consent_version = $2, updated_at = now()', [userId, config.consentVersion]);
}
export async function setFamily(userId, familyId) {
  await query('INSERT INTO user_prefs(user_id, family_id) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET family_id = $2, updated_at = now()', [userId, familyId]);
}

/** Tin gần đây làm ngữ cảnh cho mô hình (chỉ văn bản). */
export async function recentContext(userId) {
  const rows = await query(
    `SELECT role, content FROM messages WHERE user_id=$1 AND flagged = false AND created_at > now() - make_interval(days => $2) ORDER BY id DESC LIMIT $3`,
    [userId, config.historyDays, config.historyContextMsgs]);
  const list = rows.reverse();
  while (list.length && list[0].role !== 'user') list.shift();
  const contents = [];
  for (const m of list) {
    const role = m.role === 'user' ? 'user' : 'model';
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n' + m.content; else contents.push({ role, parts: [{ text: m.content }] });
  }
  return contents;
}

/** Lưu cặp tin nhắn của một lượt thành công, rồi dọn tin quá hạn/quá số của người này. */
export async function saveTurn(userId, userText, assistantText, cards, { flagged = false, clientId = null } = {}) {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['hist:' + userId]);
    await c.query("INSERT INTO messages(user_id, role, content, client_id) VALUES($1,'user',$2,$3)", [userId, userText, clientId]);
    const a = (await c.query("INSERT INTO messages(user_id, role, content, cards, flagged) VALUES($1,'assistant',$2,$3,$4) RETURNING id, created_at", [userId, assistantText, JSON.stringify(cards), flagged]))[0];
    await c.query('DELETE FROM messages WHERE user_id=$1 AND (created_at < now() - make_interval(days => $2) OR id NOT IN (SELECT id FROM messages WHERE user_id=$1 ORDER BY id DESC LIMIT $3))', [userId, config.historyDays, config.historyMax]);
    return { id: a.id, createdAt: new Date(a.created_at).toISOString() };
  });
}

export async function history(userId, { limit = 50, before } = {}) {
  const lim = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
  const b = /^\d{1,15}$/.test(String(before || '')) ? String(before) : null;
  const rows = await query(
    `SELECT id, role, content, cards, created_at FROM messages WHERE user_id=$1 AND created_at > now() - make_interval(days => $2) ${b ? 'AND id < $4' : ''} ORDER BY id DESC LIMIT $3`,
    b ? [userId, config.historyDays, lim + 1, b] : [userId, config.historyDays, lim + 1]);
  const more = rows.length > lim;
  const items = rows.slice(0, lim).reverse();
  const out = [];
  for (const m of items) out.push({ id: m.id, role: m.role, content: m.content, cards: m.role === 'assistant' ? await hydrateCards(userId, m.cards) : [], createdAt: new Date(m.created_at).toISOString() });
  return { messages: out, hasMore: more };
}

/** Xóa thật lịch sử và mọi hành động (kể cả đã xong) của người này. */
export async function clearHistory(userId) {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['hist:' + userId]);
    const m = await c.query('DELETE FROM messages WHERE user_id=$1 RETURNING 1', [userId]);
    const p = await c.query("DELETE FROM pending_actions WHERE user_id=$1 AND status <> 'running' RETURNING 1", [userId]);
    return { messages: m.length, actions: p.length };
  });
}
/** Xóa mọi dữ liệu Osin của người này (lịch sử, hành động, cài đặt, đồng ý). Bộ đếm token dùng khóa băm nên giữ tới khi hết hạn. */
export async function eraseUser(userId) {
  const r = await clearHistory(userId);
  await query('DELETE FROM user_prefs WHERE user_id=$1', [userId]);
  await query("DELETE FROM pending_actions WHERE user_id=$1", [userId]);
  await query('DELETE FROM osin_sessions WHERE user_id=$1', [userId]);
  return r;
}
export async function exportUser(userId) {
  const prefs = await getPrefs(userId);
  const msgs = await query('SELECT id, role, content, cards, created_at FROM messages WHERE user_id=$1 ORDER BY id', [userId]);
  const acts = await query('SELECT id, app_id, tool, title, summary, status, result_text, error_text, created_at, expires_at, decided_at FROM pending_actions WHERE user_id=$1 ORDER BY created_at', [userId]);
  return { exportedAt: new Date().toISOString(), prefs, messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: new Date(m.created_at).toISOString() })), actions: acts.map((a) => ({ ...a, created_at: new Date(a.created_at).toISOString(), expires_at: new Date(a.expires_at).toISOString(), decided_at: a.decided_at ? new Date(a.decided_at).toISOString() : null })) };
}

// Dọn dữ liệu hết hạn
export async function maintenance() {
  await query("DELETE FROM messages WHERE created_at < now() - make_interval(days => $1)", [config.historyDays]);
  await query("UPDATE pending_actions SET status='expired', decided_at=now() WHERE status='pending' AND expires_at < now()");
  await query("UPDATE pending_actions SET status='failed', error_text='Không rõ kết quả (máy chủ bị gián đoạn). Hãy kiểm tra trong app.' WHERE status='running' AND decided_at < now() - interval '5 minutes'");
  await query("DELETE FROM pending_actions WHERE created_at < now() - make_interval(days => $1)", [config.historyDays]);
  await query("DELETE FROM usage_daily WHERE day < current_date - 35");
  await query("DELETE FROM osin_sessions WHERE last_used_at < now() - make_interval(days => $1)", [config.sessionDays]);
}

/** Tin đã xử lý với clientId này (thử lại sau khi mất mạng): trả lại câu trả lời đã lưu, kèm thẻ hiện trạng. */
export async function findByClientId(userId, clientId) {
  const u = (await query("SELECT id FROM messages WHERE user_id=$1 AND client_id=$2 AND role='user'", [userId, clientId]))[0];
  if (!u) return null;
  const a = (await query("SELECT id, content, cards, created_at FROM messages WHERE user_id=$1 AND role='assistant' AND id > $2 ORDER BY id LIMIT 1", [userId, u.id]))[0];
  if (!a) return null;
  return { id: a.id, role: 'assistant', content: a.content, cards: await hydrateCards(userId, a.cards), createdAt: new Date(a.created_at).toISOString() };
}
