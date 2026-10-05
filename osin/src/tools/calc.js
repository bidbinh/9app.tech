// Máy tính an toàn: bộ phân tích riêng (đệ quy hạ xuống), KHÔNG dùng eval/Function. Chỉ nhận số, toán tử, ngoặc, vài hàm toán học.
// Số nguyên được tính CHÍNH XÁC bằng BigInt (cộng, trừ, nhân, lũy thừa, chia hết); khi phải dùng số thực mà kết quả nguyên vượt 2^53
// thì báo lỗi mất độ chính xác thay vì trả số sai. Dấu ":" không còn là phép chia (dùng "/" hoặc "÷").
export class CalcError extends Error {}

const MAX_LEN = 200;
const MAX_TOKENS = 120;
const MAX_DEPTH = 30;
const MAX_DIGITS = 60; // số nguyên chính xác tối đa 60 chữ số
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const isBig = (v) => typeof v === 'bigint';
const absBig = (v) => (v < 0n ? -v : v);
function fitBig(v) {
  if (absBig(v).toString().length > MAX_DIGITS) throw new CalcError('Kết quả quá lớn (tối đa ' + MAX_DIGITS + ' chữ số)');
  return v;
}
function fitNum(v) {
  if (!Number.isFinite(v)) throw new CalcError('Kết quả không xác định hoặc quá lớn');
  if (Number.isInteger(v) && Math.abs(v) > Number.MAX_SAFE_INTEGER) throw new CalcError('Kết quả vượt 2^53 nên không còn chính xác, hãy chia nhỏ phép tính');
  return v;
}
function toNum(v) {
  if (!isBig(v)) return v;
  if (absBig(v) > SAFE) throw new CalcError('Số quá lớn để dùng trong phép tính số thực mà vẫn chính xác');
  return Number(v);
}
// kết quả số thực nguyên nhỏ thì đưa về BigInt để các phép sau vẫn chính xác
const norm = (n) => (Number.isSafeInteger(n) ? BigInt(n) : n);

const FUNCS = {
  sqrt: { min: 1, max: 1, f: (x) => Math.sqrt(x) },
  abs: { min: 1, max: 1, f: (x) => Math.abs(x) },
  floor: { min: 1, max: 1, f: (x) => Math.floor(x) },
  ceil: { min: 1, max: 1, f: (x) => Math.ceil(x) },
  round: { min: 1, max: 2, f: (x, n = 0) => { const k = 10 ** Math.max(0, Math.min(12, Math.trunc(n))); return Math.round(x * k) / k; } },
  min: { min: 1, max: 8, f: (...a) => Math.min(...a) },
  max: { min: 1, max: 8, f: (...a) => Math.max(...a) },
  ln: { min: 1, max: 1, f: (x) => Math.log(x) },
  log: { min: 1, max: 1, f: (x) => Math.log10(x) },
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const s = String(src).trim();
  if (!s) throw new CalcError('Biểu thức trống');
  if (s.length > MAX_LEN) throw new CalcError('Biểu thức quá dài');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
      if (!m) throw new CalcError('Số không hợp lệ');
      if (m[0].replace('.', '').length > (m[0].includes('.') ? 15 : 30)) throw new CalcError('Số quá dài (tối đa 15 chữ số thập phân hoặc 30 chữ số nguyên)');
      out.push({ t: 'num', v: m[0].includes('.') ? Number(m[0]) : BigInt(m[0]) }); i += m[0].length;
    } else if ('+-*/^%(),;'.includes(c)) { out.push({ t: c === ';' ? ',' : c }); i++; }
    else if (c === '×' || c === '·') { out.push({ t: '*' }); i++; }
    else if (c === '÷') { out.push({ t: '/' }); i++; }
    else if (c === ':') throw new CalcError('Dấu ":" không dùng để chia, hãy dùng "/" hoặc "÷"');
    else if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(s.slice(i))[0].toLowerCase();
      // "2x3": x là dấu nhân khi đứng giữa hai toán hạng
      if (m === 'x') { out.push({ t: '*' }); i += 1; continue; }
      if (m !== 'mod' && m !== 'pow' && !(m in FUNCS) && !(m in CONSTS)) throw new CalcError(`Không hỗ trợ "${m.slice(0, 20)}"`);
      out.push({ t: 'id', v: m }); i += m.length;
    } else throw new CalcError('Ký tự không được hỗ trợ');
    if (out.length > MAX_TOKENS) throw new CalcError('Biểu thức quá phức tạp');
  }
  return out;
}

function add(a, b, sign) {
  if (isBig(a) && isBig(b)) return fitBig(sign > 0 ? a + b : a - b);
  const r = sign > 0 ? toNum(a) + toNum(b) : toNum(a) - toNum(b);
  return norm(fitNum(r));
}
function mul(a, b) {
  if (isBig(a) && isBig(b)) return fitBig(a * b);
  return norm(fitNum(toNum(a) * toNum(b)));
}
function div(a, b) {
  if ((isBig(b) && b === 0n) || b === 0) throw new CalcError('Không thể chia cho 0');
  if (isBig(a) && isBig(b) && a % b === 0n) return a / b;
  const r = toNum(a) / toNum(b);
  if (r === 0 && !(isBig(a) && a === 0n) && a !== 0) throw new CalcError('Kết quả quá nhỏ (tràn dưới)');
  return norm(fitNum(r));
}
function pow(a, b) {
  if (isBig(a) && isBig(b) && b >= 0n) {
    if (b > 1000n) throw new CalcError('Số mũ quá lớn');
    if (a === 0n || a === 1n || a === -1n) return a ** b;
    // ước lượng số chữ số trước khi tính để không tốn CPU
    if (b * BigInt(absBig(a).toString().length - 1) > BigInt(MAX_DIGITS)) throw new CalcError('Kết quả quá lớn (tối đa ' + MAX_DIGITS + ' chữ số)');
    return fitBig(a ** b);
  }
  const r = toNum(a) ** toNum(b);
  if (!Number.isFinite(r)) throw new CalcError('Kết quả quá lớn hoặc không xác định');
  if (r === 0 && toNum(a) !== 0) throw new CalcError('Kết quả quá nhỏ (tràn dưới)');
  return norm(fitNum(r));
}

export function evaluate(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const eat = (t) => { if (tk[p] && tk[p].t === t) { p++; return true; } return false; };
  const need = (t) => { if (!eat(t)) throw new CalcError('Biểu thức chưa đúng cú pháp'); };
  const guard = (d) => { if (d > MAX_DEPTH) throw new CalcError('Biểu thức lồng quá sâu'); };

  function expr(d) {
    guard(d);
    let v = term(d + 1);
    while (peek() && (peek().t === '+' || peek().t === '-')) { const op = tk[p++].t; const r = term(d + 1); v = add(v, r, op === '+' ? 1 : -1); }
    return v;
  }
  function term(d) {
    guard(d);
    let v = unary(d + 1);
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = tk[p++].t; const r = unary(d + 1);
      v = op === '/' ? div(v, r) : mul(v, r);
    }
    return v;
  }
  function unary(d) {
    guard(d);
    if (eat('-')) { const v = unary(d + 1); return isBig(v) ? -v : -v; }
    if (eat('+')) return unary(d + 1);
    return power(d + 1);
  }
  function power(d) {
    guard(d);
    const base = postfix(d + 1);
    if (eat('^')) return pow(base, unary(d + 1));
    return base;
  }
  function postfix(d) {
    let v = primary(d + 1);
    while (eat('%')) v = div(v, 100n);
    return v;
  }
  function primary(d) {
    guard(d);
    const t = tk[p++];
    if (!t) throw new CalcError('Biểu thức chưa đầy đủ');
    if (t.t === 'num') return t.v;
    if (t.t === '(') { const v = expr(d + 1); need(')'); return v; }
    if (t.t === 'id') {
      if (t.v in CONSTS) return CONSTS[t.v];
      need('(');
      const args = [expr(d + 1)];
      while (eat(',')) args.push(expr(d + 1));
      need(')');
      if (t.v === 'pow') { if (args.length !== 2) throw new CalcError('Hàm pow cần 2 tham số'); return pow(args[0], args[1]); }
      if (t.v === 'mod') {
        if (args.length !== 2) throw new CalcError('Hàm mod cần 2 tham số');
        if (isBig(args[0]) && isBig(args[1])) { if (args[1] === 0n) throw new CalcError('Không thể chia cho 0'); return args[0] % args[1]; }
        return norm(fitNum(toNum(args[0]) % toNum(args[1])));
      }
      const fn = FUNCS[t.v];
      if (!fn) throw new CalcError(`Không hỗ trợ "${t.v}"`);
      if (args.length < fn.min || args.length > fn.max) throw new CalcError(`Hàm ${t.v} cần ${fn.min === fn.max ? fn.min : fn.min + ' đến ' + fn.max} tham số`);
      return norm(fitNum(fn.f(...args.map(toNum))));
    }
    throw new CalcError('Biểu thức chưa đúng cú pháp');
  }

  const v = expr(0);
  if (p !== tk.length) throw new CalcError('Biểu thức chưa đúng cú pháp');
  if (isBig(v)) return absBig(v) <= SAFE ? Number(v) : v.toString(); // số lớn trả về dạng chuỗi chữ số chính xác
  if (!Number.isFinite(v)) throw new CalcError('Kết quả không xác định hoặc quá lớn');
  return Number(v.toPrecision(12));
}

export const formatNumber = (n, max = 8) => (typeof n === 'string' ? BigInt(n).toLocaleString('vi-VN') : n.toLocaleString('vi-VN', { maximumFractionDigits: max }));
