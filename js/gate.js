// Cổng ẩn domain app riêng: trình duyệt chỉ thấy /giapha/ /pick/ trên 9app.
// Không import file này từ launcher.

export const GATES = [
  { prefix: '/giapha', origin: 'https://hotranvanxomtrai.com' },
  { prefix: '/9pick', origin: 'https://9pick.tech' },
  { prefix: '/9quy', origin: 'http://127.0.0.1:8088' },
];

const TEXT_TYPE = /^(text\/|application\/(javascript|json|xml|manifest|x-javascript|ld\+json))/i;
const DROP_REQ = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'content-length']);
const DROP_RES = new Set(['content-security-policy', 'x-frame-options', 'content-length', 'transfer-encoding', 'content-encoding', 'strict-transport-security']);

export function matchGate(pathname) {
  for (const g of GATES) {
    if (pathname === g.prefix || pathname.startsWith(`${g.prefix}/`)) return g;
  }
  return null;
}

function alreadyPrefixed(rest, name) {
  return rest === name
    || rest.startsWith(`${name}/`)
    || rest.startsWith(`${name}?`)
    || rest.startsWith(`${name}#`)
    || rest.startsWith(`${name}"`)
    || rest.startsWith(`${name}'`)
    || rest.startsWith(`${name}\``);
}

export function rewriteText(text, prefix, origin) {
  const host = new URL(origin).host;
  const name = prefix.slice(1);
  let s = text
    .split(origin).join(prefix)
    .split(`https://${host}`).join(prefix)
    .split(`http://${host}`).join(prefix)
    .split(`//${host}`).join(prefix);

  const root = (lead) => (m, a, offset, src) => {
    const rest = src.slice(offset + m.length);
    if (alreadyPrefixed(rest, name)) return m;
    return `${a}${prefix}/`;
  };

  s = s.replace(/((?:href|src|action|poster|formaction|data-src)=["'`])\/(?!\/)/gi, root());
  s = s.replace(/(url\(["']?)\/(?!\/)/gi, root());
  s = s.replace(/(\b(?:fetch|axios)\(\s*["'`])\/(?!\/)/g, root());
  s = s.replace(/(\blocation(?:\.href)?\s*=\s*["'`])\/(?!\/)/g, root());
  s = s.replace(/(\blocation\.(?:assign|replace)\(\s*["'`])\/(?!\/)/g, root());
  return s;
}

function rewriteCookie(c, prefix, secure) {
  let out = c.replace(/;\s*Domain=[^;]*/gi, '');
  if (/;\s*Path=/i.test(out)) out = out.replace(/;\s*Path=[^;]*/i, `; Path=${prefix}/`);
  else out += `; Path=${prefix}/`;
  if (!secure) out = out.replace(/;\s*Secure/gi, '');
  return out;
}

function rewriteLocation(loc, prefix, origin) {
  if (!loc) return loc;
  if (loc.startsWith(origin)) return prefix + loc.slice(origin.length);
  const host = new URL(origin).host;
  if (loc.startsWith(`https://${host}`)) return prefix + loc.slice(`https://${host}`.length);
  if (loc.startsWith('/')) return prefix + loc;
  return loc;
}

export function proxyGate(req, res, gate, { secure = false } = {}) {
  const incoming = new URL(req.url, 'http://x');
  const rest = incoming.pathname === gate.prefix || incoming.pathname === `${gate.prefix}/`
    ? '/'
    : incoming.pathname.slice(gate.prefix.length);
  const upstream = new URL(rest + incoming.search, gate.origin);
  const lib = upstream.protocol === 'https:' ? https : http;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (DROP_REQ.has(k.toLowerCase())) continue;
    headers[k] = v;
  }
  headers.host = upstream.host;
  headers['accept-encoding'] = 'identity';
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = secure ? 'https' : 'http';
  headers['x-forwarded-prefix'] = gate.prefix;

  const pReq = lib.request(upstream, {
    method: req.method,
    headers,
  }, (pRes) => {
    const type = String(pRes.headers['content-type'] || '');
    const loc = pRes.headers.location;
    const outHeaders = {};
    for (const [k, v] of Object.entries(pRes.headers)) {
      const key = k.toLowerCase();
      if (DROP_RES.has(key) || key === 'set-cookie' || key === 'location') continue;
      outHeaders[k] = v;
    }
    if (loc) outHeaders.location = rewriteLocation(loc, gate.prefix, gate.origin);

    const cookies = pRes.headers['set-cookie'];
    if (cookies) {
      outHeaders['set-cookie'] = (Array.isArray(cookies) ? cookies : [cookies])
        .map((c) => rewriteCookie(c, gate.prefix, secure));
    }

    if (!TEXT_TYPE.test(type.split(';')[0].trim() + (type.includes('javascript') || type.includes('json') || type.startsWith('text/') ? '' : ''))) {
      // fall through: still treat as text if javascript/json/text
    }
    const rewrite = TEXT_TYPE.test(type);
    if (!rewrite) {
      res.writeHead(pRes.statusCode || 502, outHeaders);
      pRes.pipe(res);
      return;
    }
    const chunks = [];
    pRes.on('data', (c) => chunks.push(c));
    pRes.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = rewriteText(raw, gate.prefix, gate.origin);
      const buf = Buffer.from(body, 'utf8');
      outHeaders['content-type'] = type;
      outHeaders['content-length'] = buf.length;
      res.writeHead(pRes.statusCode || 502, outHeaders);
      res.end(buf);
    });
  });

  pReq.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end('Không mở được app.');
  });
  req.pipe(pReq);
}

import http from 'node:http';
import https from 'node:https';
