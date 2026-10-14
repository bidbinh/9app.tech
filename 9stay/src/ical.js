import crypto from 'node:crypto';
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { addDays, isDate, todayVN } from './time.js';
import { blockNights } from './inventory.js';

const MAX_BYTES = 1024 * 1024;
const MAX_NIGHTS_PER_FEED = 2000;

// ---- Phân tích iCalendar (RFC 5545, phần tối thiểu) ----
const dayNo = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86_400_000);
function unfold(text) { return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); }
function dateOf(v) {
  // dạng UTC (…T170000Z) đổi sang ngày giờ Việt Nam (+7) để không lệch một ngày
  const u = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (u) {
    const d = new Date(Date.UTC(+u[1], +u[2] - 1, +u[3], +u[4] + 7, +u[5], +u[6]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  return isDate(d) ? d : null;
}

// Trả các đêm bị chiếm: [DTSTART, DTEND) theo ngày. Sự kiện CANCELLED bị bỏ; DTEND thiếu thì 1 đêm. Dạng có giờ lấy phần ngày.
export function parseIcsNights(text, { from, to }) {
  const nights = new Set();
  let ev = null;
  for (const line of unfold(String(text))) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev && ev.start && ev.status !== 'CANCELLED') {
        const end = ev.end && ev.end > ev.start ? ev.end : addDays(ev.start, 1);
        // cắt vào [from, to) TRƯỚC khi lặp: sự kiện dài hay bắt đầu từ lâu không tốn thời gian và không bị bỏ sót
        // tính theo số ngày nguyên (không tạo Date mỗi đêm) và bỏ qua sự kiện đã phủ trọn khoảng đã có
        const lo = dayNo(ev.start > from ? ev.start : from);
        const hi = dayNo(end < to ? end : to);
        for (let n = lo; n < hi && n - lo < 800; n += 1) nights.add(n);
      }
      ev = null; continue;
    }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const name = line.slice(0, i).split(';')[0].toUpperCase();
    const val = line.slice(i + 1).trim();
    if (name === 'DTSTART') ev.start = dateOf(val);
    else if (name === 'DTEND') ev.end = dateOf(val);
    else if (name === 'STATUS') ev.status = val.toUpperCase();
  }
  return [...nights].sort((a, b) => a - b).map((n) => new Date(n * 86_400_000).toISOString().slice(0, 10));
}

// ---- Chống SSRF: chỉ https, cổng 443, và địa chỉ thật sự kết nối phải là IP công cộng ----
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    // IPv6 nhúng IPv4 (mapped/compat/NAT64/6to4), loopback, link/site-local, unique-local, multicast: coi là riêng tư
    if (s === '::1' || s === '::' || /^(fe[89ab]|fec|fed|fee|fef|fc|fd|ff)/.test(s) || s.startsWith('::ffff:') || /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2002:')) return true;
    return false;
  }
  return true;
}

export function validateFeedUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new AppError('bad_url', 'Địa chỉ iCal không hợp lệ'); }
  if (u.protocol !== 'https:' || (u.port && u.port !== '443') || u.username || u.password) throw new AppError('bad_url', 'Chỉ nhận địa chỉ https (cổng 443), không kèm tài khoản');
  if (net.isIP(u.hostname) && isPrivateIp(u.hostname)) throw new AppError('bad_url', 'Địa chỉ nội bộ không được phép');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new AppError('bad_url', 'Địa chỉ nội bộ không được phép');
  return u;
}

export function fetchIcs(raw) {
  const u = validateFeedUrl(raw);
  return new Promise((resolve, reject) => {
    const lookup = (host, opts, cb) => dns.lookup(host, { ...opts, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: 4 }];
      if (!list.length || list.some((a) => isPrivateIp(a.address))) return cb(new Error('private_address'));
      return opts && opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
    });
    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search, lookup, timeout: 10_000, headers: { accept: 'text/calendar, */*', 'user-agent': '9stay-ical/1' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new AppError('feed_http', `Nguồn iCal trả mã ${res.statusCode}`, 502)); return; }
      const chunks = []; let size = 0;
      res.on('data', (d) => { size += d.length; if (size > MAX_BYTES) { req.destroy(); reject(new AppError('feed_big', 'Tệp iCal quá lớn', 502)); } else chunks.push(d); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    const hard = setTimeout(() => { req.destroy(); reject(new AppError('feed_timeout', 'Nguồn iCal phản hồi quá chậm', 504)); }, 20_000);
    req.on('close', () => clearTimeout(hard));
    req.on('timeout', () => { req.destroy(); reject(new AppError('feed_timeout', 'Nguồn iCal phản hồi quá chậm', 504)); });
    req.on('error', (e) => reject(e instanceof AppError ? e : new AppError('feed_error', 'Không tải được nguồn iCal', 502)));
  });
}

// ---- Nguồn nhập ----
export async function addFeed(c, { orgId, unitId, name, url }) {
  assertUuid(unitId, 'căn');
  if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new AppError('bad_feed', 'Tên nguồn không hợp lệ');
  validateFeedUrl(url);
  const [u] = await c.query('SELECT 1 FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!u) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  const [f] = await c.query('INSERT INTO ical_feeds(org_id, unit_id, name, url) VALUES($1, $2, $3, $4) RETURNING id', [orgId, unitId, name.trim(), url]);
  return { id: f.id };
}

export async function listFeeds(c, { orgId }) {
  const rows = await c.query(
    `SELECT f.id, f.name, f.status, f.last_sync_at, f.last_error, f.last_conflicts, u.code AS unit_code, (SELECT count(*)::int FROM ical_nights n WHERE n.feed_id = f.id) AS blocked_nights
       FROM ical_feeds f JOIN units u ON u.id = f.unit_id WHERE f.org_id = $1 ORDER BY u.code, f.name`, [orgId]);
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status, unitCode: r.unit_code, lastSyncAt: r.last_sync_at, lastError: r.last_error, lastConflicts: r.last_conflicts, blockedNights: r.blocked_nights }));
}

// Giải phóng các đêm một nguồn đang giữ. Đếm tham chiếu theo căn: chỉ hoàn lại trạng thái cũ khi KHÔNG còn nguồn nào khác của căn giữ đêm đó.
async function releaseFeedNights(c, { feedId, unitId, nights }) {
  if (!nights.length) return 0;
  const mine = new Map((await c.query('SELECT night, prev_kind FROM ical_nights WHERE feed_id = $1 AND night = ANY($2::date[])', [feedId, nights])).map((r) => [r.night, r.prev_kind]));
  await c.query('DELETE FROM ical_nights WHERE feed_id = $1 AND night = ANY($2::date[])', [feedId, nights]);
  const others = new Set((await c.query(
    'SELECT DISTINCT n.night FROM ical_nights n JOIN ical_feeds f ON f.id = n.feed_id WHERE f.unit_id = $1 AND n.night = ANY($2::date[])', [unitId, nights])).map((r) => r.night));
  let released = 0;
  for (const [n, prev] of mine) {
    if (others.has(n)) continue;
    released += 1;
    if (prev === null) await c.query("DELETE FROM owner_releases WHERE unit_id = $1 AND night = $2 AND source = 'ical' AND kind = 'blocked_by_anstay'", [unitId, n]);
    else await c.query("UPDATE owner_releases SET kind = $3, source = 'app', updated_at = now() WHERE unit_id = $1 AND night = $2 AND source = 'ical' AND kind = 'blocked_by_anstay'", [unitId, n, prev]);
  }
  return released;
}

// Tắt nguồn thì hoàn lại các đêm nó đang chặn (nếu không, đêm kẹt vĩnh viễn vì chủ không mở được đêm Anstay khóa).
export async function setFeedStatus(c, { orgId, feedId, status }) {
  assertUuid(feedId, 'nguồn');
  if (!['active', 'disabled'].includes(status)) throw new AppError('bad_status', 'Trạng thái không hợp lệ');
  const [f] = await c.query('SELECT id, unit_id FROM ical_feeds WHERE id = $1 AND org_id = $2', [feedId, orgId]);
  if (!f) throw new AppError('not_found', 'Không tìm thấy nguồn', 404);
  await c.query('SELECT 1 FROM units WHERE id = $1 FOR UPDATE', [f.unit_id]);
  if (status === 'disabled') {
    const nights = (await c.query('SELECT night FROM ical_nights WHERE feed_id = $1', [feedId])).map((r) => r.night);
    await releaseFeedNights(c, { feedId, unitId: f.unit_id, nights });
  }
  await c.query('UPDATE ical_feeds SET status = $2 WHERE id = $1', [feedId, status]);
}

// Đồng bộ một nguồn: chặn các đêm mới, hoàn lại đêm nguồn không còn, báo đêm đã có khách (xung đột đặt trùng với OTA).
// Phải chạy trong db.tx. text là nội dung iCal đã tải (tách riêng để kiểm thử, không chạm mạng trong giao dịch dài).
export async function applyFeed(c, { orgId, feedId, text }, { now = new Date() } = {}) {
  const [f] = await c.query("SELECT id, unit_id FROM ical_feeds WHERE id = $1 AND org_id = $2 AND status = 'active'", [feedId, orgId]);
  if (!f) throw new AppError('not_found', 'Không tìm thấy nguồn đang bật', 404);
  // Khóa theo căn: các nguồn của cùng một căn (và việc chặn/mở ngày) xếp hàng, nên đếm tham chiếu không bị đua.
  await c.query('SELECT 1 FROM units WHERE id = $1 FOR UPDATE', [f.unit_id]);
  const today = todayVN(now);
  const want = parseIcsNights(text, { from: today, to: addDays(today, 540) });
  if (want.length > MAX_NIGHTS_PER_FEED) throw new AppError('feed_big', 'Nguồn iCal chặn quá nhiều đêm', 422);
  const wantSet = new Set(want);
  const tracked = new Map((await c.query('SELECT night, prev_kind FROM ical_nights WHERE feed_id = $1', [feedId])).map((r) => [r.night, r.prev_kind]));

  // 1) hoàn lại đêm nguồn không còn
  const gone = [...tracked.keys()].filter((n) => !wantSet.has(n) && n >= today);
  const released = await releaseFeedNights(c, { feedId, unitId: f.unit_id, nights: gone });
  await c.query('DELETE FROM ical_nights WHERE feed_id = $1 AND night < $2::date', [feedId, today]);

  // 2) đêm cần chặn: đêm mới, và đêm đã theo dõi nhưng quản lý đã mở tay (dòng không còn là khóa Anstay) thì chặn lại
  const rel = new Map((await c.query('SELECT night, kind, source FROM owner_releases WHERE unit_id = $1 AND night = ANY($2::date[])', [f.unit_id, want])).map((r) => [r.night, r]));
  const fresh = want.filter((n) => !tracked.has(n));
  const reopened = want.filter((n) => tracked.has(n) && !(rel.get(n) && rel.get(n).kind === 'blocked_by_anstay'));
  const candidates = [...fresh, ...reopened];
  let conflicts = 0;
  if (candidates.length) {
    const booked = new Set((await c.query('SELECT night FROM room_nights WHERE unit_id = $1 AND active AND night = ANY($2::date[])', [f.unit_id, candidates])).map((r) => r.night));
    // đêm đã có khách là xung đột; đêm Anstay đã khóa tay (không phải do iCal) thì giữ nguyên, không giành quyền
    const toBlock = candidates.filter((n) => !booked.has(n) && !(rel.get(n) && rel.get(n).kind === 'blocked_by_anstay' && rel.get(n).source !== 'ical'));
    if (toBlock.length) {
      // trạng thái gốc trước iCal: lấy từ nguồn khác của căn nếu đã giữ đêm đó, không thì từ dòng hiện tại
      const orig = new Map((await c.query(
        'SELECT DISTINCT ON (n.night) n.night, n.prev_kind FROM ical_nights n JOIN ical_feeds g ON g.id = n.feed_id WHERE g.unit_id = $1 AND n.feed_id <> $2 AND n.night = ANY($3::date[]) ORDER BY n.night', [f.unit_id, feedId, toBlock])).map((r) => [r.night, r.prev_kind]));
      const prevOf = (n) => (orig.has(n) ? orig.get(n) : (rel.get(n) ? rel.get(n).kind : null));
      await blockNights(c, { orgId, unitId: f.unit_id, nights: toBlock, kind: 'blocked_by_anstay', source: 'ical', now });
      const newOnes = toBlock.filter((n) => !tracked.has(n));
      if (newOnes.length) {
        await c.query('INSERT INTO ical_nights(feed_id, night, prev_kind) SELECT $1::uuid, n, p FROM unnest($2::date[], $3::text[]) AS t(n, p)', [feedId, newOnes, newOnes.map(prevOf)]);
      }
    }
    conflicts = candidates.filter((n) => booked.has(n)).length;
  }
  await c.query('UPDATE ical_feeds SET last_sync_at = $2, last_error = NULL, last_conflicts = $3 WHERE id = $1', [feedId, now, conflicts]);
  return { blocked: want.length, released, conflicts };
}

export async function recordFeedError(c, { feedId, message, now = new Date() }) {
  await c.query('UPDATE ical_feeds SET last_sync_at = $2, last_error = $3 WHERE id = $1', [feedId, now, String(message).slice(0, 200)]);
}

// ---- Lịch xuất cho OTA ----
export async function ensureExportToken(c, { orgId, unitId }) {
  assertUuid(unitId, 'căn');
  const [u] = await c.query('SELECT 1 FROM units WHERE id = $1 AND org_id = $2', [unitId, orgId]);
  if (!u) throw new AppError('unit_not_found', 'Không tìm thấy căn', 404);
  const token = crypto.randomBytes(24).toString('hex');
  await c.query('INSERT INTO ical_exports(unit_id, org_id, token) VALUES($1, $2, $3) ON CONFLICT (unit_id) DO NOTHING', [unitId, orgId, token]);
  const [r] = await c.query('SELECT token FROM ical_exports WHERE unit_id = $1', [unitId]);
  return r.token;
}

// Xuất các đêm đã bán/giữ/chặn của căn (gộp đêm liên tiếp). Không có tên khách. Không xuất đêm do chính iCal nhập (tránh vòng lặp).
export async function exportIcs(c, { token }, { now = new Date() } = {}) {
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) throw new AppError('not_found', 'Không tìm thấy', 404);
  const [e] = await c.query('SELECT e.unit_id, e.org_id, u.code FROM ical_exports e JOIN units u ON u.id = e.unit_id WHERE e.token = $1', [token]);
  if (!e) throw new AppError('not_found', 'Không tìm thấy', 404);
  const today = todayVN(now);
  // Mặc định đêm là ĐÓNG: xuất mọi đêm trong 540 ngày tới trừ đêm chủ đã mở bán và chưa có khách. (Đêm do iCal nhập cũng xuất, để đơn
  // đặt ở OTA này chặn được OTA khác; OTA nhận lại đêm của chính nó thì vô hại.)
  const rows = await c.query(
    `SELECT g::date::text AS night FROM generate_series($2::date, $2::date + 539, interval '1 day') g
      WHERE NOT (EXISTS (SELECT 1 FROM owner_releases r WHERE r.unit_id = $1 AND r.night = g::date AND r.kind = 'open')
                 AND NOT EXISTS (SELECT 1 FROM room_nights rn JOIN bookings b ON b.id = rn.booking_id WHERE rn.unit_id = $1 AND rn.active AND rn.night = g::date AND b.status IN ('giu', 'da_coc', 'da_nhan')))
      ORDER BY 1`, [e.unit_id, today]);
  const runs = [];
  for (const { night } of rows) {
    const last = runs[runs.length - 1];
    if (last && last.end === night) last.end = addDays(night, 1); else runs.push({ start: night, end: addDays(night, 1) });
  }
  const ymd = (d) => d.replaceAll('-', '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9stay//ical//VI', 'CALSCALE:GREGORIAN'];
  for (const r of runs) {
    lines.push('BEGIN:VEVENT', `UID:${e.code}-${ymd(r.start)}@9stay`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(r.start)}`, `DTEND;VALUE=DATE:${ymd(r.end)}`, 'SUMMARY:Not available', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
