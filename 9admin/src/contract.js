// Giao thức kết nối v1 giữa 9app Console và các app (xem docs/ADMIN-API.md).
// File này vừa ký yêu cầu, vừa kiểm tra mọi phản hồi từ app: dữ liệu từ app được coi là không tin cậy.
import crypto from 'node:crypto';

export const KINDS = ['cash_in', 'cash_out', 'revenue', 'expense'];
export const BALANCE_KINDS = ['cash', 'customer_funds', 'receivable'];
export const FORMATS = ['text', 'int', 'money', 'date', 'datetime', 'status', 'phone', 'link'];
export const CAPABILITIES = ['users', 'money', 'panels'];
const TONES = ['ok', 'warn', 'bad', 'info'];
const LEVELS = ['info', 'warn', 'bad'];
const ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/;
const ACTION_RE = /^[a-z0-9_.-]{1,60}$/;

export class ContractError extends Error {}
const bad = (path, msg) => { throw new ContractError(`${path}: ${msg}`); };

// ---------- ký / xác minh ----------
export const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const canonicalString = (ts, method, pathWithQuery, body) => `${ts}\n${String(method).toUpperCase()}\n${pathWithQuery}\n${sha256hex(body || '')}`;
export const sign = (secret, ts, method, pathWithQuery, body = '') => crypto.createHmac('sha256', secret).update(canonicalString(ts, method, pathWithQuery, body)).digest('hex');

// ---------- bộ kiểm tra cơ bản ----------
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
function str(path, v, { max = 300, min = 0, optional = false } = {}) {
  if (v === undefined || v === null) { if (optional) return ''; bad(path, 'thiếu'); }
  if (typeof v !== 'string') bad(path, 'phải là chuỗi');
  if (v.length < min || v.length > max) bad(path, `độ dài ngoài ${min}..${max}`);
  return v;
}
function intv(path, v, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isSafeInteger(v) || v < min || v > max) bad(path, 'phải là số nguyên hợp lệ');
  return v;
}
function oneOf(path, v, list) { if (!list.includes(v)) bad(path, `phải thuộc ${list.join('|')}`); return v; }
function arr(path, v, max) { if (!Array.isArray(v)) bad(path, 'phải là mảng'); if (v.length > max) bad(path, `tối đa ${max} phần tử`); return v; }
function date(path, v, optional = false) {
  if (v === undefined || v === null || v === '') { if (optional) return null; bad(path, 'thiếu thời gian'); }
  const d = new Date(v);
  if (typeof v !== 'string' || isNaN(d)) bad(path, 'thời gian không hợp lệ');
  return d.toISOString();
}
function scalar(path, v) {
  if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
    if (typeof v === 'string' && v.length > 2000) bad(path, 'chuỗi quá dài');
    if (typeof v === 'number' && !Number.isFinite(v)) bad(path, 'số không hợp lệ');
    return v;
  }
  return bad(path, 'chỉ nhận chuỗi, số, boolean, null');
}
const link = (path, v) => { if (typeof v === 'string' && v && !/^(https:\/\/|\/)/.test(v)) bad(path, 'liên kết chỉ nhận https hoặc đường dẫn nội bộ'); return v; };

// ---------- phản hồi ----------
export function manifest(x) {
  if (!isObj(x) || !isObj(x.app)) bad('manifest', 'sai cấu trúc');
  return {
    app: { id: str('app.id', x.app.id, { max: 30, min: 2 }), name: str('app.name', x.app.name, { max: 60, min: 1 }), version: str('app.version', x.app.version, { max: 40, optional: true }) },
    capabilities: arr('capabilities', x.capabilities, 10).map((c, i) => oneOf(`capabilities[${i}]`, c, CAPABILITIES)),
    currency: str('currency', x.currency || 'VND', { max: 5 }),
    adminUrl: link('adminUrl', x.adminUrl ? str('adminUrl', x.adminUrl, { max: 300 }) : ''),
  };
}

export function health(x) {
  if (!isObj(x)) bad('health', 'sai cấu trúc');
  return { ok: x.ok === true, details: str('details', x.details, { max: 300, optional: true }) };
}

export function summary(x) {
  if (!isObj(x)) bad('summary', 'sai cấu trúc');
  return {
    kpis: arr('kpis', x.kpis || [], 40).map((k, i) => ({
      id: str(`kpis[${i}].id`, k.id, { max: 60, min: 1 }), label: str(`kpis[${i}].label`, k.label, { max: 80, min: 1 }),
      value: scalar(`kpis[${i}].value`, k.value), format: oneOf(`kpis[${i}].format`, k.format || 'text', ['text', 'int', 'money']),
      hint: str(`kpis[${i}].hint`, k.hint, { max: 160, optional: true }), tone: k.tone ? oneOf(`kpis[${i}].tone`, k.tone, TONES) : '',
    })),
    alerts: arr('alerts', x.alerts || [], 50).map((a, i) => ({
      level: oneOf(`alerts[${i}].level`, a.level, LEVELS), text: str(`alerts[${i}].text`, a.text, { max: 300, min: 1 }),
      panel: str(`alerts[${i}].panel`, a.panel, { max: 60, optional: true }),
    })),
  };
}

export function usersPage(x) {
  if (!isObj(x)) bad('users', 'sai cấu trúc');
  return {
    items: arr('items', x.items, 1000).map((u, i) => ({
      id: str(`items[${i}].id`, String(u.id), { max: 100, min: 1 }), phone: str(`items[${i}].phone`, u.phone, { max: 20, optional: true }),
      name: str(`items[${i}].name`, u.name, { max: 120, optional: true }), status: str(`items[${i}].status`, u.status || 'active', { max: 30 }),
      createdAt: date(`items[${i}].createdAt`, u.createdAt, true), lastSeenAt: date(`items[${i}].lastSeenAt`, u.lastSeenAt, true),
      extra: isObj(u.extra) ? Object.fromEntries(Object.entries(u.extra).slice(0, 20).map(([k, v]) => [str('extra.key', k, { max: 40, min: 1 }), scalar('extra.' + k, v)])) : {},
    })),
    next: x.next === null || x.next === undefined ? null : str('next', String(x.next), { max: 200 }),
    hasMore: x.hasMore === true,
  };
}

export function userDetail(x) {
  if (!isObj(x)) bad('userDetail', 'sai cấu trúc');
  return {
    title: str('title', x.title, { max: 120, optional: true }),
    fields: arr('fields', x.fields || [], 60).map((f, i) => ({ label: str(`fields[${i}].label`, f.label, { max: 80, min: 1 }), value: scalar(`fields[${i}].value`, f.value), format: oneOf(`fields[${i}].format`, f.format || 'text', FORMATS) })),
  };
}

export function cashPage(x) {
  if (!isObj(x)) bad('cash', 'sai cấu trúc');
  return {
    items: arr('items', x.items, 1000).map((c, i) => ({
      id: str(`items[${i}].id`, String(c.id), { max: 100, min: 1 }), at: date(`items[${i}].at`, c.at),
      kind: oneOf(`items[${i}].kind`, c.kind, KINDS), amount: intv(`items[${i}].amount`, c.amount, { min: 1, max: 1e13 }),
      category: str(`items[${i}].category`, c.category, { max: 60, optional: true }), description: str(`items[${i}].description`, c.description, { max: 300, optional: true }),
      ref: str(`items[${i}].ref`, c.ref, { max: 100, optional: true }), phone: str(`items[${i}].phone`, c.phone, { max: 20, optional: true }),
    })),
    next: x.next === null || x.next === undefined ? null : str('next', String(x.next), { max: 200 }),
    hasMore: x.hasMore === true,
  };
}

export function balances(x) {
  if (!isObj(x)) bad('balances', 'sai cấu trúc');
  return {
    items: arr('items', x.items || [], 50).map((b, i) => ({
      id: str(`items[${i}].id`, b.id, { max: 60, min: 1 }), label: str(`items[${i}].label`, b.label, { max: 100, min: 1 }),
      amount: intv(`items[${i}].amount`, b.amount, { min: -1e13, max: 1e13 }), kind: oneOf(`items[${i}].kind`, b.kind, BALANCE_KINDS),
    })),
  };
}

function inputs(path, list) {
  return arr(path, list || [], 10).map((n, i) => ({
    name: str(`${path}[${i}].name`, n.name, { max: 40, min: 1 }), label: str(`${path}[${i}].label`, n.label, { max: 80, min: 1 }),
    type: oneOf(`${path}[${i}].type`, n.type || 'text', ['text', 'number', 'textarea']), required: n.required !== false,
  }));
}

export function panels(x) {
  if (!isObj(x)) bad('panels', 'sai cấu trúc');
  return {
    items: arr('items', x.items || [], 30).map((p, i) => ({
      id: oneOfRe(`items[${i}].id`, p.id, ACTION_RE), title: str(`items[${i}].title`, p.title, { max: 80, min: 1 }),
      description: str(`items[${i}].description`, p.description, { max: 300, optional: true }), searchable: p.searchable === true,
      columns: arr(`items[${i}].columns`, p.columns, 20).map((c, j) => ({ key: str(`columns[${j}].key`, c.key, { max: 40, min: 1 }), label: str(`columns[${j}].label`, c.label, { max: 60, min: 1 }), format: oneOf(`columns[${j}].format`, c.format || 'text', FORMATS) })),
      rowActions: arr(`items[${i}].rowActions`, p.rowActions || [], 10).map((a, j) => ({
        id: oneOfRe(`rowActions[${j}].id`, a.id, ACTION_RE), label: str(`rowActions[${j}].label`, a.label, { max: 40, min: 1 }),
        tone: a.tone ? oneOf(`rowActions[${j}].tone`, a.tone, ['danger', 'primary', 'ghost']) : 'ghost',
        confirm: str(`rowActions[${j}].confirm`, a.confirm, { max: 200, optional: true }), inputs: inputs(`rowActions[${j}].inputs`, a.inputs),
        when: isObj(a.when) ? { key: str('when.key', a.when.key, { max: 40 }), in: arr('when.in', a.when.in || [], 20).map((v) => String(v).slice(0, 60)) } : null,
      })),
    })),
  };
}
function oneOfRe(path, v, re) { if (typeof v !== 'string' || !re.test(v)) bad(path, 'định danh không hợp lệ'); return v; }

export function panelData(x) {
  if (!isObj(x)) bad('panelData', 'sai cấu trúc');
  return {
    rows: arr('rows', x.rows, 500).map((r, i) => {
      if (!isObj(r)) bad(`rows[${i}]`, 'phải là đối tượng');
      const out = {};
      for (const [k, v] of Object.entries(r).slice(0, 40)) out[str(`rows[${i}] key`, k, { max: 40, min: 1 })] = scalar(`rows[${i}].${k}`, v);
      if (out._id === undefined || out._id === null) bad(`rows[${i}]`, 'thiếu _id');
      out._id = String(out._id).slice(0, 100);
      return out;
    }),
    total: intv('total', x.total, { min: 0, max: 1e9 }), page: intv('page', x.page || 1, { min: 1, max: 1e6 }), pageSize: intv('pageSize', x.pageSize || x.rows.length || 1, { min: 1, max: 500 }),
  };
}

export function actionResult(x) {
  if (!isObj(x)) bad('actionResult', 'sai cấu trúc');
  return { ok: x.ok === true, message: str('message', x.message, { max: 300, optional: true }) };
}

export const validators = { manifest, health, summary, usersPage, userDetail, cashPage, balances, panels, panelData, actionResult };
export { ID_RE, ACTION_RE };
