// Dựng hệ thống THẬT để kiểm tích hợp 9id <-> Osin trong một tiến trình:
//   - hai PostgreSQL nhúng (cổng ngẫu nhiên >= 16000), một cho 9id, một cho Osin
//   - 9id thật (OTP mock, OAUTH_CLIENTS cho osin, INTERNAL_KEYS có khóa osin, EDGE_SECRET) qua "edge" mô phỏng nginx:
//       thêm X-Edge-Secret/X-Forwarded-For, chặn /id/internal/ từ trình duyệt
//   - "chaos" proxy giữa Osin và 9id (mạng nội bộ): pass | 429 | 503 | destroy | slow (mô phỏng 9id bận / sập)
//   - app giả dùng SDK Osin (test/fake-app.js) với receiptSecret
//   - Osin thật: OSIN_IDENTITY=9id, nhà cung cấp AI giả kịch bản hóa, registry đọc từ OSIN_APPS
// Hai dịch vụ có `src/config.js` riêng nên nạp lần lượt, mỗi lần đặt biến môi trường trước khi import.
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const OSIN = path.join(here, '..', '..');
const ID = path.join(OSIN, '..', '9id');
const imp = (p) => import(new URL('file:///' + p.replace(/\\/g, '/')).href);

export const ID_SECRET = 'int-secret-osin-0123456789abcdef-0123456789ab';
export const EDGE_SECRET = 'int-edge-secret-0123456789abcdef-QwErTy9876';

function tryBind(port) {
  return new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, () => s.close(() => resolve(true))); });
}
export async function pickPort() {
  for (let i = 0; i < 200; i++) {
    const p = 16000 + Math.floor(Math.random() * 40000);
    if (await tryBind(p)) return p;
  }
  throw new Error('không tìm được cổng trống');
}

function listen(server, port) { return new Promise((r) => server.listen(port, () => r())); }
const closeServer = (s) => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); });

/** Proxy ngược nhỏ. mutate(req, headers) sửa header gửi đi; intercept(req,res) trả true nếu đã tự xử lý. */
function makeProxy(targetPort, { mutate, intercept } = {}) {
  const log = [];
  const server = http.createServer((req, res) => {
    log.push({ method: req.method, url: req.url, at: Date.now() });
    if (intercept && intercept(req, res)) return;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const headers = { ...req.headers };
      if (mutate) mutate(req, headers);
      const up = http.request({ host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers }, (ur) => {
        res.writeHead(ur.statusCode, ur.headers);
        ur.pipe(res);
      });
      up.on('error', () => { try { res.writeHead(502); res.end('bad gateway'); } catch { /* */ } });
      up.end(Buffer.concat(chunks));
    });
  });
  return { server, log };
}

export async function boot({ sessionCheckMs = 1500, requireConsent = true } = {}) {
  const { startEmbedded } = await imp(path.join(OSIN, 'scripts', 'embedded-pg.js'));
  const pgId = await startEmbedded({ database: 'id_int' });
  const pgOsin = await startEmbedded({ database: 'osin_int' });

  const idPort = await pickPort();       // 9id thật (mạng nội bộ)
  const edgePort = await pickPort();     // "nginx" công khai cho trình duyệt: http://localhost:<edgePort>/id/
  const chaosPort = await pickPort();    // đường nội bộ Osin -> 9id
  const osinPort = await pickPort();     // Osin: http://127.0.0.1:<osinPort>/
  const OSIN_ORIGIN = `http://127.0.0.1:${osinPort}`;
  const ID_PUBLIC = `http://localhost:${edgePort}`;   // host KHÁC với Osin để cookie hai bên tách nhau như hai tên miền

  // ---------- 9id thật ----------
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: pgId.url, OTP_PROVIDER: 'mock', EDGE_SECRET,
    INTERNAL_KEYS: `osin:${ID_SECRET},family:int-secret-family-0123456789abcdef-0123456`,
    OAUTH_CLIENTS: `osin=${OSIN_ORIGIN}/auth/callback`,
    OAUTH_REQUIRE_CONSENT: requireConsent ? '1' : '0',
    INTERNAL_DELEGATE_APPS: 'osin',
    POW_BITS: '10', OTP_RESEND_SEC: '0', OTP_DAILY_PER_PHONE: '1000', OTP_DAILY_PER_IP: '100000', VERIFY_PER_IP_HOUR: '1000000',
    RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000', SESSION_LIMIT_PER_MIN: '1000000', INTERNAL_LIMIT_PER_MIN: '1000000',
    TRUSTED_PROXY_HOPS: '1',
  });
  const idDb = await imp(path.join(ID, 'src', 'db.js'));
  const idCfg = (await imp(path.join(ID, 'src', 'config.js'))).config;
  const idSrv = await imp(path.join(ID, 'src', 'server.js'));
  const idProvider = await imp(path.join(ID, 'src', 'otp-provider.js'));
  const idPow = await imp(path.join(ID, 'src', 'pow.js'));
  const idUtil = await imp(path.join(ID, 'src', 'util.js'));
  await idDb.migrate();
  const idApp = idSrv.buildApp();
  // 9id thật nghe ở cổng nội bộ cố định
  await new Promise((r) => idApp.listen(idPort).then(r));

  // edge (mô phỏng nginx): trình duyệt -> 9id, chặn /id/internal/
  const edge = makeProxy(idPort, {
    mutate: (req, h) => { h['x-edge-secret'] = EDGE_SECRET; h['x-forwarded-for'] = req.socket.remoteAddress.replace('::ffff:', ''); },
    intercept: (req, res) => { if (req.url.startsWith('/id/internal/')) { res.writeHead(404); res.end('nginx: not found'); return true; } return false; },
  });
  await listen(edge.server, edgePort);

  // chaos: Osin -> 9id (mạng docker nội bộ)
  const chaos = { mode: 'pass', delayMs: 0, hits: [] };
  const chaosProxy = makeProxy(idPort, {
    intercept: (req, res) => {
      chaos.hits.push({ method: req.method, url: req.url, mode: chaos.mode });
      if (chaos.mode === '429') { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' }); res.end('{"error":{"code":"rate_limited","message":"Quá nhiều yêu cầu"}}'); return true; }
      if (chaos.mode === '503') { res.writeHead(503); res.end('{}'); return true; }
      if (chaos.mode === 'destroy') { req.socket.destroy(); return true; }
      if (chaos.mode === 'html200') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>login</html>'); return true; }
      return false;
    },
  });
  await listen(chaosProxy.server, chaosPort);

  // ---------- app giả dùng SDK Osin ----------
  const { createFakeApp } = await imp(path.join(OSIN, 'test', 'fake-app.js'));
  const fam = await createFakeApp();

  // ---------- Osin thật ----------
  Object.assign(process.env, {
    DATABASE_URL: pgOsin.url, NODE_ENV: 'test',
    OSIN_IDENTITY: '9id', OSIN_ID_URL: `http://127.0.0.1:${chaosPort}/id`, OSIN_ID_KEY_ID: 'osin', OSIN_ID_SECRET: ID_SECRET,
    OSIN_ID_AUTHORIZE_URL: `${ID_PUBLIC}/id/authorize`,
    OSIN_SESSION_CHECK_MS: String(sessionCheckMs),
    OSIN_SECRET: 'int-osin-secret-0123456789abcdef-0123456789',
    OSIN_APPS: JSON.stringify([fam.appConfig]),
    OSIN_PUBLIC_ORIGIN: OSIN_ORIGIN,
    OSIN_AI_PROVIDER: 'mock',
    RATE_LIMIT_PER_MIN: '1000000', ROUTE_LIMIT_FACTOR: '1000', SESSION_LIMIT_PER_MIN: '1000000', OSIN_CHAT_PER_MIN: '1000000',
  });
  delete process.env.BASE_PATH; // Osin ở gốc tên miền riêng; BASE_PATH của 9id đã được đọc xong (mặc định /id)
  const osinCfg = (await imp(path.join(OSIN, 'src', 'config.js'))).config;
  const osinDb = await imp(path.join(OSIN, 'src', 'db.js'));
  const osinSrv = await imp(path.join(OSIN, 'src', 'server.js'));
  const { createMockProvider } = await imp(path.join(OSIN, 'src', 'llm', 'mock.js'));
  await osinDb.migrate();

  // LLM giả: lịch -> công cụ đọc; sữa -> công cụ ghi (cần xác nhận)
  const llm = createMockProvider(async ({ contents }) => {
    const last = contents[contents.length - 1];
    const fr = last.parts.find((p) => p.functionResponse);
    const userText = (() => { for (let i = contents.length - 1; i >= 0; i--) { const t = contents[i].role === 'user' && contents[i].parts.find((p) => p.text); if (t) return t.text.toLowerCase(); } return ''; })();
    if (fr) {
      const r = fr.functionResponse.response;
      if (r.trang_thai === 'cho_nguoi_dung_xac_nhan') return { text: 'Mình đã chuẩn bị xong. Bạn kiểm tra thẻ bên dưới rồi bấm **Xác nhận** nhé.' };
      const ev = r.du_lieu_tu_cong_cu && r.du_lieu_tu_cong_cu.su_kien;
      if (ev) return { text: 'Hôm nay có:\n' + ev.map((e) => `- **${e.gio}** ${e.ten}`).join('\n') };
      return { text: 'Mình chưa lấy được kết quả.' };
    }
    if (userText.includes('con đi học')) return { calls: [{ name: 'family__lich_hom_nay', args: {} }] };
    if (userText.includes('sữa')) return { calls: [{ name: 'family__them_vao_danh_sach', args: { muc: 'sữa tươi', so_luong: 2 } }] };
    return { text: 'Mình là **Osin**.' };
  });
  const osinApp = osinSrv.buildApp({ llm });
  await osinApp.listen(osinPort);

  const ctx = {
    idPort, edgePort, chaosPort, osinPort, OSIN_ORIGIN, ID_PUBLIC, ID_DIRECT: `http://127.0.0.1:${idPort}`,
    idCfg, osinCfg, idDb, osinDb, idProvider, idPow, idUtil, fam, llm, chaos, edge, chaosProxy,
    idApp, osinApp, identity: osinApp.deps.identity,
    async stop() {
      try { await osinApp.close(); } catch { /* */ }
      try { await idApp.close(); } catch { /* */ }
      await closeServer(edge.server); await closeServer(chaosProxy.server);
      await fam.close();
      try { await osinDb.close(); } catch { /* */ }
      try { await idDb.close(); } catch { /* */ }
      await pgOsin.stop(); await pgId.stop();
    },
  };
  return ctx;
}

/** Đăng ký một tài khoản 9id bằng API (qua edge), trả { phone, password, cookie(nine_sid), userId }. */
export async function apiSignup(sys, { name = 'Lan', phone, password = 'MatKhau-Tot-1' } = {}) {
  const base = `${sys.ID_PUBLIC}/id`;
  const jar = {};
  const call = async (method, p, body) => {
    const h = { 'x-requested-with': '9id', origin: sys.ID_PUBLIC };
    if (body !== undefined) h['content-type'] = 'application/json';
    const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (ck) h.cookie = ck;
    const r = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (/Max-Age=0/i.test(c)) delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: r.status, json, headers: r.headers, text };
  };
  phone = phone || ('09' + String(Math.floor(30_000_000 + Math.random() * 60_000_000)));
  const ch = (await call('GET', '/api/otp/challenge')).json;
  const powSol = { challenge: ch.challenge, counter: sys.idPow.solve(ch.challenge, ch.bits) };
  const rq = await call('POST', '/api/otp/request', { phone, pow: powSol });
  if (rq.status !== 200) throw new Error('otp/request ' + rq.status + ' ' + rq.text);
  const code = sys.idProvider.lastOtp(sys.idUtil.normalizePhone(phone));
  const v = await call('POST', '/api/otp/verify', { phone, code });
  const reg = await call('POST', '/api/register', { ticket: v.json.ticket, phone, name, password });
  if (reg.status !== 200) throw new Error('register ' + reg.status + ' ' + reg.text);
  return { phone, password, jar, call, userId: reg.json.user.id, name };
}
