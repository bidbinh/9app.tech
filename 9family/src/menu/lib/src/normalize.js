// Chuẩn hóa tên nguyên liệu / ghi chú đi chợ gõ tự do hoặc nói bằng giọng nói thành {name, qty, unit, ingredientId?}.
// Chỉ dùng luật + bí danh (alias) trong danh mục nguyên liệu, không dùng AI.
import { getData, ascii } from './common.js';

/**
 * @typedef {Object} NormalizedItem
 * @property {string} raw            Chuỗi gốc
 * @property {string} name           Tên sau khi tách số lượng/đơn vị và lọc từ đệm
 * @property {string|null} canonicalName  Tên chuẩn trong danh mục (nếu khớp)
 * @property {number|null} qty
 * @property {string|null} unit      Đơn vị chuẩn: g,kg,ml,l,qua,bo,cu,mieng,hop,goi,tui,con,chai,lon,cai,vien...
 * @property {string|null} ingredientId
 * @property {'exact'|'partial'|'none'} confidence  exact: tên khớp nguyên liệu (cho phép gộp); partial: chỉ chứa từ khớp (không gộp tự động)
 * @property {string|null} matchedAlias
 * @property {boolean} [approx]      Số lượng ước chừng ('vài', '2-3')
 * @property {string} [note]
 */

// Bỏ dấu nhưng GIỮ NGUYÊN độ dài chuỗi (để cắt trên bản có dấu theo chỉ số của bản không dấu).
export function fold1(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'đ' || ch === 'Đ') { out += 'd'; continue; }
    const d = ch.normalize('NFD');
    out += d.length > 1 ? d[0] : ch;
  }
  return out.toLowerCase();
}
// Từ đệm đầu/cuối câu, so khớp trên bản không dấu (nên gõ không dấu vẫn nhận). Không đưa vào đây các từ trùng tên nguyên liệu
// khi bỏ dấu: tôi/tỏi, nhớ/nho, cần/cân, chị/chỉ, nửa/nữa.
const LEAD_WORDS = ['nha con thieu', 'nha het', 'con thieu', 'sap het', 'them vao', 'bo sung', 'lay them', 'mua them', 'ghi them', 'minh can', 'toi can', 'cho toi', 'cho minh', 'cho em', 'lam on', 'toi muon', 'minh muon', 'nho mua', 'can mua', 'can them', 'can phai', 'giup toi', 'giup minh', 'giup', 'gium', 'dum', 'ho', 'nho', 'minh', 'em', 'anh', 'cho', 'muon', 'phai', 'mua', 'them', 'lay', 'order', 'dat', 'ghi', 'thieu', 'het'];
const TRAIL_WORDS = ['nha', 'nhe', 'nhe', 'nha', 'nhe', 'a', 'voi', 'di', 'giup', 'gium', 'dum', 'nua', 'thoi', 'nghen', 'luon', 'the', 'cho minh', 'cho em', 'cho toi', 'giup toi', 'giup minh', 'la duoc', 'cung duoc', 'nhe em', 'nhe chi', 'nhe anh', 'nhe con', 'nhe ban'];
const byLen = (a) => [...new Set(a)].sort((x, y) => y.length - x.length);
const LEAD_RE = new RegExp('^(?:(?:' + byLen(LEAD_WORDS.filter((w) => w !== 'nho')).join('|') + ')\\s+)+');
const TRAIL_RE = new RegExp('(?:\\s+(?:' + byLen(TRAIL_WORDS).join('|') + '))+$');
const FILLERS_LEAD = LEAD_RE; // giữ tên cũ để ONLY_FILLER dùng
// "nho" (nhớ) chỉ là từ đệm khi theo sau là "mua"; đứng một mình có thể là nho (trái cây)
export function stripFillers(s) {
  let cur = s;
  for (let k = 0; k < 6; k++) {
    const f = fold1(cur);
    const m = LEAD_RE.exec(f) || /^nho\s+(?=mua\b)/.exec(f);
    const t = TRAIL_RE.exec(f);
    if (!m && !t) break;
    if (m) cur = cur.slice(m[0].length);
    else cur = cur.slice(0, t.index);
    cur = cur.trim();
  }
  return cur;
}
const DESCRIPTORS = new Set(['tuoi', 'ngon', 'sach', 'loai', '1', 'chin', 'song', 'nho', 'to', 'lon', 'vua', 'non', 'gia', 'dep', 'xanh', 'ta', 'nha', 'trong', 'it', 'sach', 'dong', 'lanh', 'ru', 'moi']);

const WORD_DIGIT = { khong: 0, mot: 1, mot_: 1, mot2: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9 };
const UNIT_MAP = {
  g: ['g', 1], gr: ['g', 1], gam: ['g', 1], gram: ['g', 1],
  kg: ['kg', 1], ky: ['kg', 1], kilo: ['kg', 1], kilogam: ['kg', 1], can: ['kg', 1], ki: ['kg', 1],
  lang: ['g', 100], luong: ['g', 100],
  l: ['l', 1], lit: ['l', 1], ml: ['ml', 1],
  qua: ['qua', 1], trai: ['qua', 1],
  bo: ['bo', 1], mo: ['bo', 1], nam: ['bo', 1],
  cu: ['cu', 1], mieng: ['mieng', 1], bia: ['mieng', 1], khoanh: ['mieng', 1],
  hop: ['hop', 1], goi: ['goi', 1], tui: ['tui', 1], bich: ['tui', 1], bao: ['tui', 1],
  con: ['con', 1], chai: ['chai', 1], lon: ['lon', 1], thung: ['thung', 1], loc: ['loc', 1], vi: ['vi', 1],
  cai: ['cai', 1], chiec: ['chiec', 1], vien: ['vien', 1], cuon: ['cuon', 1], doi: ['doi', 1],
  cay: ['cay', 1], tep: ['tep', 1], nhanh: ['tep', 1], thia: ['thia', 1], muong: ['thia', 1],
  chuc: ['chuc', 10], lo: ['lo', 1], nai: ['nai', 1], tuyp: ['tuyp', 1], o: ['o', 1], ly: ['ly', 1],
};

const aliasCache = new WeakMap();
function aliasIndex(data) {
  let ix = aliasCache.get(data);
  if (!ix) {
    const list = [];
    for (const ing of data.ingredients.items) for (const a of ing.aliases) list.push({ alias: ascii(a), id: ing.id });
    // bỏ trùng alias (giữ cái đầu), sắp xếp dài trước
    const seen = new Set();
    const uniq = list.filter((x) => (seen.has(x.alias) ? false : (seen.add(x.alias), true)));
    uniq.sort((a, b) => b.alias.length - a.alias.length);
    ix = { list: uniq, map: new Map(uniq.map((x) => [x.alias, x.id])), ing: new Map(data.ingredients.items.map((i) => [i.id, i])) };
    aliasCache.set(data, ix);
  }
  return ix;
}

/** Số trong chữ số: '3', '1,5', '1.5', '1/2', '2-3', '1.000'. Trả {value, approx} hoặc null. */
function parseDigitToken(t) {
  let m;
  if ((m = t.match(/^(\d{1,3}(?:\.\d{3})+)$/))) return { value: Number(m[1].replace(/\./g, '')) };
  if ((m = t.match(/^(\d+(?:[.,]\d+)?)$/))) return { value: Number(m[1].replace(',', '.')) };
  if ((m = t.match(/^(\d+)\/(\d+)$/)) && Number(m[2]) > 0) return { value: Number(m[1]) / Number(m[2]) };
  if ((m = t.match(/^(\d+(?:[.,]\d+)?)[-–](\d+(?:[.,]\d+)?)$/))) return { value: Math.max(Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))), approx: true };
  return null;
}

/** Số bằng chữ tiếng Việt từ vị trí i (token đã bỏ dấu). Trả {value, next} hoặc null. */
function parseWordNumber(tokens, i) {
  const t = tokens[i];
  const digit = (x) => (x === 'mot' || x === 'mot' ? 1 : WORD_DIGIT[x]);
  if (t === 'nua') return { value: 0.5, next: i + 1 };
  if (t === 'muoi') {
    let v = 10, j = i + 1;
    const u = tokens[j];
    if (u && (WORD_DIGIT[u] !== undefined || u === 'lam') && u !== 'khong') { v += u === 'lam' ? 5 : WORD_DIGIT[u]; j++; }
    return { value: v, next: j };
  }
  if (WORD_DIGIT[t] !== undefined && t !== 'khong') {
    let v = WORD_DIGIT[t], j = i + 1;
    if (tokens[j] === 'muoi') {
      v *= 10; j++;
      const u = tokens[j];
      if (u && (WORD_DIGIT[u] !== undefined || u === 'lam' || u === 'mot') && u !== 'khong') { v += u === 'lam' ? 5 : WORD_DIGIT[u]; j++; }
    } else if (tokens[j] === 'tram') {
      v *= 100; j++;
      if (tokens[j] === 'ruoi') { v += 50; j++; }
    }
    return { value: v, next: j };
  }
  return null;
}

/** Cụm token bắt đầu ở vị trí i có trùng một alias nguyên liệu không (ví dụ 'nấm bào ngư', 'ba chỉ', 'muối')? */
function startsAlias(ix, toks, i) {
  for (const x of ix.list) {
    const parts = x.alias.split(' ');
    if (parts[0] !== toks[i] || parts.length < 2) continue;
    if (toks.slice(i, i + parts.length).join(' ') === x.alias) return true;
  }
  return false;
}

/** Hai chuỗi cách nhau tối đa một lần thêm/bớt/đổi ký tự. */
function within1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const isUnit = (t) => t !== undefined && Object.prototype.hasOwnProperty.call(UNIT_MAP, t);

/**
 * Chuẩn hóa một mục.
 * @param {string} text  Ví dụ '2 bó rau muống', 'sữa tươi 1 hộp', 'nửa ký thịt ba chỉ', 'mua thêm pin'
 * @param {{data?:import('./common.js').MenuData}} [opts]
 * @returns {NormalizedItem}
 */
export function normalizeItem(text, opts = {}) {
  const data = getData(opts.data);
  const ix = aliasIndex(data);
  const raw = String(text == null ? '' : text);
  let s = raw.normalize('NFC').toLowerCase().replace(/[½¼¾]/g, (c) => ({ '½': ' 1/2 ', '¼': ' 1/4 ', '¾': ' 3/4 ' }[c])).replace(/[()"“”!?]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/[.,;:]+$/g, '').trim();
  s = stripFillers(s);
  s = s.replace(/^(?:mua|thêm)\s+/, '').trim();
  const out = { raw, name: '', canonicalName: null, qty: null, unit: null, ingredientId: null, confidence: 'none', matchedAlias: null };
  if (!s) return out;

  // token hóa trên bản không dấu (để nhận dạng), giữ bản có dấu song song để dựng tên
  const toksOrig = s.split(' ');
  const toks = toksOrig.map((t) => ascii(t));
  const used = new Array(toks.length).fill(false);
  let qty = null, unit = null, approx = false, note, chucUnit = null;
  let mult = 1;

  // gõ không dấu "muoi mot goi" = muối một gói (không phải 11 gói)
  if (toksOrig[0] === 'muoi' && toks.length === 3 && WORD_DIGIT[toks[1]] !== undefined && toks[1] !== 'khong' && ['goi', 'hop', 'tui', 'chai', 'kg', 'g', 'lon', 'bich', 'lo'].includes(toks[2])) {
    qty = WORD_DIGIT[toks[1]]; unit = toks[2]; used[1] = used[2] = true;
  }
  // 1) tìm cụm số lượng
  for (let i = 0; i < toks.length && qty == null; i++) {
    const t = toks[i];
    // lượng mơ hồ
    if (t === 'vai' && isUnit(toks[i + 1])) { qty = 3; approx = true; used[i] = true; unit = toks[i + 1]; used[i + 1] = true; break; }
    if ((t === 'mot' && (toks[i + 1] === 'it' || toks[i + 1] === 'chut' || toks[i + 1] === 'xiu')) ) { note = 'một ít'; used[i] = used[i + 1] = true; i++; continue; }
    if (t === 'chut' || t === 'xiu' || t === 'it') { if (!isUnit(toks[i + 1])) { note = 'một ít'; used[i] = true; continue; } }
    // token dạng số + đơn vị dính: 500g, 1.5kg, 2l
    let m = t.match(/^(\d+(?:[.,]\d+)?)([a-z]+)$/);
    if (m && isUnit(m[2])) { qty = Number(m[1].replace(',', '.')); unit = m[2]; used[i] = true; break; }
    const dg = parseDigitToken(t);
    if (dg) {
      let v = dg.value; let j = i + 1;
      // "1 1/2"
      const nxt = toks[j] && parseDigitToken(toks[j]);
      if (nxt && nxt.value < 1 && Number.isInteger(v)) { v += nxt.value; used[j] = true; j++; }
      approx = !!dg.approx;
      qty = v; used[i] = true;
      if (isUnit(toks[j])) { unit = toks[j]; used[j] = true; j++; }
      if (unit === 'chuc' && isUnit(toks[j]) && toks[j] !== 'chuc') { chucUnit = toks[j]; used[j] = true; j++; }
      if (toks[j] === 'ruoi') { used[j] = true; qty = v + (unit ? 0.5 : 0); if (!unit) qty = v; unit = unit; if (unit) { /* x.5 đơn vị */ } }
      break;
    }
    const wn = startsAlias(ix, toks, i) || toksOrig[i] === 'muối' ? null : parseWordNumber(toks, i);
    if (wn) {
      // số bằng chữ chỉ tính khi theo sau là đơn vị (tránh 'ba chỉ', 'năm'...) hoặc 'rưỡi'+đơn vị
      let j = wn.next, v = wn.value;
      // hai số liền nhau: 'ba bốn quả' -> lấy số lớn
      const wn2 = (WORD_DIGIT[toks[j]] !== undefined && toks[j] !== 'khong') ? parseWordNumber(toks, j) : null;
      if (wn2 && isUnit(toks[wn2.next]) && wn.value < 10 && wn2.value < 10 && wn2.value > wn.value) { v = wn2.value; j = wn2.next; approx = true; }
      let k = j;
      if (toks[k] === 'ruoi') { v += 0.5; k++; }
      if (isUnit(toks[k])) {
        qty = v; unit = toks[k]; for (let x = i; x <= k; x++) used[x] = true;
        if (unit === 'chuc' && isUnit(toks[k + 1]) && toks[k + 1] !== 'chuc') { chucUnit = toks[k + 1]; used[k + 1] = true; }
        if (toks[k + 1] === 'ruoi') { used[k + 1] = true; qty = v + 0.5; }
        break;
      }
    }
  }
  if (unit) {
    const [u, mu] = UNIT_MAP[unit];
    mult = mu;
    unit = u;
  }
  if (qty != null) {
    qty = qty * mult;
    if (unit === 'chuc') { unit = chucUnit ? UNIT_MAP[chucUnit][0] : null; }
    qty = Math.round(qty * 1000) / 1000;
  }
  // đổi sang đơn vị chuẩn nhỏ: lạng -> g đã làm; 0.x kg giữ nguyên
  // 2) dựng tên
  const nameToks = toksOrig.filter((_, i) => !used[i]);
  let name = nameToks.join(' ').replace(/^(?:và|với|cho|của|loại)\s+/, '').trim();
  name = stripFillers(name);
  name = name.replace(/\s+/g, ' ');
  out.name = name;
  out.qty = qty;
  out.unit = unit;
  if (approx) out.approx = true;
  if (note) out.note = note;

  // 3) khớp nguyên liệu
  const an = ascii(name);
  if (an) {
    let hit = ix.map.has(an) ? { alias: an, id: ix.map.get(an), exact: true } : null;
    if (!hit) {
      const padded = ' ' + an + ' ';
      for (const x of ix.list) {
        if (x.alias.length < 3) continue;
        if (padded.includes(' ' + x.alias + ' ')) {
          const rest = (' ' + an + ' ').replace(' ' + x.alias + ' ', ' ').trim().split(' ').filter(Boolean);
          const exact = rest.every((w) => DESCRIPTORS.has(w));
          hit = { alias: x.alias, id: x.id, exact };
          break;
        }
      }
    }
    if (!hit && an.length >= 6) {
      // sai một ký tự do nhận dạng giọng nói ('rau mống' -> 'rau muống'): gợi ý, không tự gộp
      for (const x of ix.list) { if (x.alias.length >= 6 && Math.abs(x.alias.length - an.length) <= 1 && within1(an, x.alias)) { hit = { alias: x.alias, id: x.id, exact: false }; out.fuzzy = true; break; } }
    }
    if (hit) {
      out.ingredientId = hit.id;
      out.confidence = hit.exact ? 'exact' : 'partial';
      out.matchedAlias = hit.alias;
      const ing = ix.ing.get(hit.id);
      out.canonicalName = ing.name;
      // không có đơn vị mà nguyên liệu mua theo đơn vị đếm: dùng đơn vị mặc định
      if (qty != null && !out.unit && ing.unitDefault && !['g', 'ml'].includes(ing.unitDefault) && hit.exact) out.unit = ing.unitDefault;
      // 'chục' của trứng/quả
      if (qty != null && unit === null && toks.includes('chuc') && ing.conv && ing.conv.qua) out.unit = 'qua';
    }
  }
  return out;
}

// đoạn chỉ gồm từ đệm (ví dụ "mua", "thêm cho tôi") không phải một mục
const SEP_RE = /\n|;|,(?!\d)|\s+\+\s+|\s+(?:va|voi|roi|cong|them|nua|cung)\s+/gi;

/** Tách câu/dòng chứa nhiều mục: xuống dòng, dấu phẩy (không tách số thập phân), ';', ' và ', ' với ', ' rồi ', ' cộng ', ' thêm ', ' + ' (có dấu hay không dấu). */
export function splitList(text) {
  const src = String(text || '');
  const f = fold1(src);
  const parts = []; let last = 0; let m;
  SEP_RE.lastIndex = 0;
  while ((m = SEP_RE.exec(f))) {
    // "nửa" (0,5) và "nữa" (thêm) bỏ dấu giống nhau: chỉ coi "nữa" có dấu là chỗ ngắt
    if (/^\s+nua\s+$/.test(m[0]) && !/nữa/i.test(src.slice(m.index, m.index + m[0].length))) continue;
    parts.push(src.slice(last, m.index)); last = m.index + m[0].length;
  }
  parts.push(src.slice(last));
  return parts.map((x) => x.trim()).filter((x) => x && stripFillers(x.toLowerCase() + ' ').trim() !== '');
}

/** Chuẩn hóa cả một danh sách gõ/nói. Đoạn chỉ có số lượng ("rồi mua một chục") gán cho món liền trước chưa có số lượng. @returns {NormalizedItem[]} */
export function normalizeList(text, opts = {}) {
  const out = [];
  for (const x of splitList(text)) {
    const it = normalizeItem(x, opts);
    if (!it.name) {
      const prev = out[out.length - 1];
      if (prev && it.qty != null && prev.qty == null) {
        prev.qty = it.qty;
        prev.unit = it.unit || prev.unit;
        if (!prev.unit && prev.ingredientId) {
          const ing = aliasIndex(getData(opts.data)).ing.get(prev.ingredientId);
          if (ing && ing.unitDefault && !['g', 'ml'].includes(ing.unitDefault)) prev.unit = ing.unitDefault;
        }
      }
      continue;
    }
    out.push(it);
  }
  return out;
}
