// Bộ tính biểu thức dùng chung cho bàn phím số và máy tính giọng nói.
// Đầu vào là mảng "token" có kiểu; đầu ra là giá trị và chuỗi mô tả để người dùng soát.
//
// Token: {t:'num',v} {t:'op',v:'+'|'-'|'*'|'/'} {t:'pow'} {t:'pct'} {t:'sq'} {t:'cube'} {t:'sqrt'} {t:'cbrt'}
//        {t:'of'} {t:'half'} (chia đôi) {t:'gap',k} (gấp k lần) {t:'neg'} {t:'lp'} {t:'rp'}
import { dinhDangSo } from './text.js';

export class LoiTinh extends Error {}

const MAX = 1e300;

/**
 * Tính một mảng token.
 * @param {object[]} toks
 * @param {{ans?:number|null}} opt  ans: kết quả trước, dùng khi biểu thức mở đầu bằng phép toán ("cộng năm mươi nghìn")
 * @returns {{value:number, tokens:object[]}} tokens là mảng đã chèn ans (nếu có)
 */
export function tinh(toks, opt = {}) {
  let t = toks.filter((x) => x && x.t);
  if (!t.length) throw new LoiTinh('Chưa có biểu thức để tính.');
  const first = t[0];
  const ans = opt.ans;
  if (first.t === 'op' && ans !== null && ans !== undefined && Number.isFinite(ans)) {
    t = [{ t: 'num', v: ans, tuAns: true }, ...t];
  } else if (first.t === 'op' && first.v !== '-' && first.v !== '+') {
    throw new LoiTinh('Phép toán thiếu số đứng trước.');
  } else if (first.t === 'half' && t.length === 1 && Number.isFinite(ans)) {
    // "chia đôi" đứng một mình: chia đôi kết quả trước
    t = [{ t: 'num', v: ans, tuAns: true }, ...t];
  }
  let i = 0;
  const peek = () => t[i];
  const next = () => t[i++];

  function parseExpr() {
    let left = parseTerm();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      const right = parseTerm();
      // Quy ước máy tính: 200 + 10% = 220 (phần trăm của số bên trái)
      const r = right.pct ? (left.v * right.raw) / 100 : right.v;
      left = { v: op === '+' ? left.v + r : left.v - r };
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v;
      if (peek() && peek().t === 'cho') next();
      const right = parseUnary();
      if (op === '/') {
        if (right.v === 0) throw new LoiTinh('Không chia được cho 0.');
        left = { v: left.v / right.v };
      } else left = { v: left.v * right.v };
    }
    return left;
  }

  function parseUnary() {
    const p = peek();
    if (!p) throw new LoiTinh('Biểu thức chưa đầy đủ: thiếu số ở cuối.');
    if (p.t === 'op' && (p.v === '-' || p.v === '+')) {
      next();
      const f = parseUnary();
      return { v: p.v === '-' ? -f.v : f.v };
    }
    if (p.t === 'neg') { next(); const f = parseUnary(); return { v: -f.v }; }
    if (p.t === 'half') { next(); if (peek() && peek().t === 'of') next(); const f = parseUnary(); return { v: f.v / 2 }; }
    if (p.t === 'gap') { next(); if (peek() && peek().t === 'of') next(); const f = parseUnary(); return { v: f.v * p.k }; }
    if (p.t === 'sqrt' || p.t === 'cbrt' || p.t === 'sq' || p.t === 'cube') {
      next();
      if (peek() && peek().t === 'of') next();
      const f = parseUnary();
      if (p.t === 'sqrt') {
        if (f.v < 0) throw new LoiTinh('Không lấy căn bậc hai của số âm.');
        return { v: Math.sqrt(f.v) };
      }
      if (p.t === 'cbrt') return { v: Math.cbrt(f.v) };
      if (p.t === 'sq') return { v: f.v * f.v };
      return { v: f.v * f.v * f.v };
    }
    return parsePow();
  }

  function parsePow() {
    let base = parsePostfix();
    if (peek() && peek().t === 'pow') {
      next();
      const e = parseUnary();
      const v = Math.pow(base.v, e.v);
      if (Number.isNaN(v)) throw new LoiTinh('Lũy thừa không hợp lệ.');
      base = { v };
    }
    return base;
  }

  function parsePostfix() {
    let f = parsePrimary();
    for (;;) {
      const p = peek();
      if (!p) break;
      if (p.t === 'pct') {
        next();
        if (peek() && peek().t === 'of') {
          next();
          const rhs = parseUnary();
          f = { v: (f.v / 100) * rhs.v };
        } else f = { v: f.v / 100, pct: true, raw: f.v };
      } else if (p.t === 'sq') { next(); f = { v: f.v * f.v }; }
      else if (p.t === 'cube') { next(); f = { v: f.v * f.v * f.v }; }
      else if (p.t === 'half') { next(); f = { v: f.v / 2 }; }
      else if (p.t === 'gap') { next(); f = { v: f.v * p.k }; }
      else break;
    }
    return f;
  }

  function parsePrimary() {
    const p = next();
    if (!p) throw new LoiTinh('Biểu thức chưa đầy đủ: thiếu số ở cuối.');
    if (p.t === 'num') return { v: p.v };
    if (p.t === 'lp') {
      const e = parseExpr();
      if (peek() && peek().t === 'rp') next();
      return e;
    }
    if (p.t === 'op') throw new LoiTinh('Hai phép toán liền nhau, thiếu số ở giữa.');
    if (p.t === 'rp') throw new LoiTinh('Dư dấu đóng ngoặc.');
    throw new LoiTinh('Không hiểu vị trí của "' + moTaToken(p) + '".');
  }

  const kq = parseExpr();
  if (i < t.length) {
    const p = t[i];
    if (p.t === 'rp') throw new LoiTinh('Dư dấu đóng ngoặc.');
    if (p.t === 'num') throw new LoiTinh('Hai số đứng liền nhau, thiếu phép toán ở giữa.');
    throw new LoiTinh('Không hiểu phần "' + moTaToken(p) + '".');
  }
  if (!Number.isFinite(kq.v) || Math.abs(kq.v) > MAX) throw new LoiTinh('Kết quả quá lớn.');
  // Làm tròn nhiễu dấu phẩy động (0.1+0.2)
  const value = Number(kq.v.toPrecision(14));
  return { value, tokens: t };
}

export function moTaToken(p) {
  switch (p.t) {
    case 'num': return dinhDangSo(p.v);
    case 'op': return { '+': '+', '-': '−', '*': '×', '/': '÷' }[p.v];
    case 'pow': return '^';
    case 'pct': return '%';
    case 'sq': return '²';
    case 'cube': return '³';
    case 'sqrt': return '√';
    case 'cbrt': return '∛';
    case 'of': return 'của';
    case 'half': return '÷ 2';
    case 'gap': return '× ' + dinhDangSo(p.k);
    case 'neg': return '−';
    case 'lp': return '(';
    case 'rp': return ')';
    case 'cho': return 'cho';
    default: return '?';
  }
}

/** Chuỗi mô tả biểu thức để soát: "3.200.000 + 50.000". Đưa các hàm tiền tố (bình phương của 3, chia đôi 480) về dạng quen thuộc. */
export function moTa(toks) {
  const ketThuc = (x) => x && (x.t === 'num' || x.t === 'rp' || x.t === 'pct' || x.t === 'sq' || x.t === 'cube' || x.t === 'half' || x.t === 'gap');
  const t = [];
  for (let i = 0; i < toks.length; i++) {
    const p = toks[i];
    const truoc = t[t.length - 1];
    if ((p.t === 'sq' || p.t === 'cube' || p.t === 'half' || p.t === 'gap') && !ketThuc(truoc)) {
      let j = i + 1;
      if (toks[j] && toks[j].t === 'of') j++;
      if (toks[j] && toks[j].t === 'num') { t.push(toks[j], p); i = j; continue; }
    }
    if (p.t === 'of' && truoc && (truoc.t === 'sqrt' || truoc.t === 'cbrt' || truoc.t === 'neg')) continue;
    t.push(p);
  }
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const p = t[i];
    const nxt = t[i + 1];
    const s = moTaToken(p);
    const dinhTruoc = ['pct', 'sq', 'cube', 'rp', 'pow'].includes(p.t);
    if (dinhTruoc && p.t !== 'pow') out = out.replace(/ $/, '');
    if (p.t === 'pow') out = out.replace(/ $/, '');
    out += s;
    if (nxt) {
      const dinh = ['sqrt', 'cbrt', 'neg', 'lp', 'pow'].includes(p.t) || ['pct', 'sq', 'cube', 'rp', 'pow'].includes(nxt.t);
      if (!dinh) out += ' ';
    }
  }
  return out.trim();
}

/** Tính chuỗi từ bàn phím số. Ký hiệu: 0-9 . + - − × x * ÷ / ( ) % ^ √ ² */
export function tinhChuoi(str, opt = {}) {
  const s = String(str).replace(/\s+/g, '').replace(/,/g, '.');
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      if ((raw.match(/\./g) || []).length > 1 || raw === '.') throw new LoiTinh('Số không hợp lệ: ' + raw);
      toks.push({ t: 'num', v: Number(raw) });
      i = j; continue;
    }
    if (c === '+') toks.push({ t: 'op', v: '+' });
    else if (c === '-' || c === '−' || c === '–') toks.push({ t: 'op', v: '-' });
    else if (c === '×' || c === '*' || c === 'x' || c === 'X') toks.push({ t: 'op', v: '*' });
    else if (c === '÷' || c === '/') toks.push({ t: 'op', v: '/' });
    else if (c === '(') toks.push({ t: 'lp' });
    else if (c === ')') toks.push({ t: 'rp' });
    else if (c === '%') toks.push({ t: 'pct' });
    else if (c === '^') toks.push({ t: 'pow' });
    else if (c === '√') toks.push({ t: 'sqrt' });
    else if (c === '²') toks.push({ t: 'sq' });
    else if (c === '³') toks.push({ t: 'cube' });
    else throw new LoiTinh('Ký tự không hợp lệ: ' + c);
    i++;
  }
  // Nhân ngầm: 2(3+4) và (1+2)(3) và 3√9
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const a = toks[k - 1];
    const b = toks[k];
    if (a && (a.t === 'num' || a.t === 'rp' || a.t === 'sq' || a.t === 'pct' && false) && (b.t === 'lp' || b.t === 'sqrt')) out.push({ t: 'op', v: '*' });
    if (a && a.t === 'rp' && b.t === 'num') out.push({ t: 'op', v: '*' });
    out.push(b);
  }
  // Bỏ phép toán thừa ở cuối khi đang gõ dở
  while (out.length && out[out.length - 1].t === 'op') out.pop();
  // Tự đóng ngoặc còn thiếu
  let open = 0;
  for (const x of out) { if (x.t === 'lp') open++; if (x.t === 'rp') open--; }
  while (open-- > 0) out.push({ t: 'rp' });
  return tinh(out, opt);
}
