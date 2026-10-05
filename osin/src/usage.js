// Trần chi phí: token/ngày theo người và toàn hệ, tin nhắn/ngày. Hạn mức được ĐẶT TRƯỚC trong giao dịch có khóa
// (khóa tư vấn toàn cục + khóa hàng) nên gửi đồng thời không vượt trần; sau lượt thì điều chỉnh theo số token thật.
import { config } from './config.js';
import { tx, query } from './db.js';
import { ApiError } from './errors.js';
import { hmacHex, todayVN, logEvent } from './util.js';

export const userKey = (userId) => hmacHex(config.secret, 'u:' + userId);

/** Trần token/ngày hiệu lực của một người: không quá userTokensPerDay và không quá 4% trần toàn hệ; người mới (< 24 giờ) thấp hơn. */
export function userLimitFor(newcomer) {
  const base = Math.min(config.userTokensPerDay, Math.floor(config.globalTokensPerDay * config.userMaxShare));
  return Math.max(1, Math.floor(base * (newcomer ? config.newUserFactor : 1)));
}

// cảnh báo mức dùng toàn hệ 50% và 80% (ghi log một lần mỗi mức mỗi ngày; Console summary cũng hiện)
const warned = new Set();
export const resetBudgetWarnings = () => warned.clear();
function warnGlobal(day, total) {
  for (const pct of [50, 80]) {
    const k = day + ':' + pct;
    if (total >= config.globalTokensPerDay * pct / 100 && !warned.has(k)) { warned.add(k); logEvent('budget_warn', { pct, total }); }
  }
  if (warned.size > 20) for (const k of warned) if (!k.startsWith(day)) warned.delete(k);
}

export async function reserve(userId, { estimate = config.turnReserveTokens, newcomer = false } = {}) {
  const key = userKey(userId); const day = todayVN();
  const limit = userLimitFor(newcomer);
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(9204)');
    await c.query('INSERT INTO usage_daily(day, user_key) VALUES($1,$2) ON CONFLICT DO NOTHING', [day, key]);
    const u = (await c.query('SELECT tokens, msgs FROM usage_daily WHERE day=$1 AND user_key=$2 FOR UPDATE', [day, key]))[0];
    const g = (await c.query('SELECT COALESCE(sum(tokens),0)::bigint AS t FROM usage_daily WHERE day=$1', [day]))[0].t;
    if (u.msgs >= config.userMsgsPerDay) throw new ApiError(429, 'daily_msgs', 'Hôm nay bạn đã nhắn Osin nhiều rồi (giới hạn trong ngày). Mai bạn quay lại nhé.');
    if (u.tokens >= limit) throw new ApiError(429, 'daily_tokens', 'Bạn đã dùng hết hạn mức trò chuyện với Osin hôm nay. Mai bạn quay lại nhé.');
    if (Number(g) + estimate > config.globalTokensPerDay) throw new ApiError(503, 'global_budget', 'Osin đang quá tải trong hôm nay. Bạn thử lại sau nhé.');
    await c.query('UPDATE usage_daily SET tokens = tokens + $3, msgs = msgs + 1 WHERE day=$1 AND user_key=$2', [day, key, estimate]);
    warnGlobal(day, Number(g) + estimate);
    return { day, key, estimate, userBefore: Number(u.tokens), limit };
  });
}

/** Lần đầu Osin thấy người dùng này (để áp hạn mức thấp hơn trong 24 giờ đầu). Trả mốc thời gian (ms). */
export async function touchUser(userId) {
  const r = (await query('INSERT INTO user_prefs(user_id) VALUES($1) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING first_seen_at', [userId]))[0];
  return new Date(r.first_seen_at).getTime();
}

/** Điều chỉnh theo số token thật (có thể hoàn lại phần ước lượng thừa) và ghi số lần gọi công cụ/lỗi. */
export async function settle(r, { actual = 0, toolCalls = 0, errored = false }) {
  await query('UPDATE usage_daily SET tokens = GREATEST(0, tokens + $3), tool_calls = tool_calls + $4, errors = errors + $5 WHERE day=$1 AND user_key=$2',
    [r.day, r.key, actual - r.estimate, toolCalls, errored ? 1 : 0]);
}

// Giới hạn số lượt mỗi phút theo người dùng (trượt 60 giây, trong bộ nhớ; chỉ một tiến trình)
const recent = new Map();
export function chatRateLimited(userId, now = Date.now()) {
  const key = userKey(userId);
  const arr = (recent.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= config.chatPerMin) { recent.set(key, arr); return true; }
  arr.push(now); recent.set(key, arr);
  if (recent.size > 20000) for (const [k, v] of recent) if (!v.length || now - v[v.length - 1] > 60_000) recent.delete(k);
  return false;
}
export const resetChatRate = () => recent.clear();
