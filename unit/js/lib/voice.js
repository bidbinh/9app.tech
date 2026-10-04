// Bộ phân tích lời nói tiếng Việt cho máy tính giọng nói. Thuần hàm, không phụ thuộc trình duyệt.
//
// Cách làm: bỏ dấu và hạ chữ thường toàn bộ câu rồi so khớp. Nhờ vậy sai thanh điệu của nhận dạng
// (cộng/cọng, năm/nằm, bảy/bẩy...) không còn là lỗi. Trường hợp trùng sau khi bỏ dấu (mười/mươi,
// căn/cân, cộng/công) được phân giải theo vị trí trong câu.
import { khoaTim, docSo, dinhDangSo, dinhDangGon, chuanHoaSoChuoi } from './text.js';
import { tinh, moTa, LoiTinh } from './calc.js';
import { quetDonVi, doi, layDonVi, MAC_DINH_DICH, ghiChuCap } from './units.js';

// ---------- Bảng từ ----------
const CHU_SO = {
  khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9,
};
const THANG = { nghin: 1e3, ngan: 1e3, ngin: 1e3, trieu: 1e6, chieu: 1e6, cu: 1e6, ty: 1e9, ti: 1e9 };
const TU_LE = new Set(['le', 'linh']);
const TU_RUOI = new Set(['ruoi', 'ruoi']);

// Cụm từ nhiều chữ -> token (khớp dài nhất trước)
const CUM_TU = [
  ['phan tram', { t: 'pct' }],
  ['phan tram cua', [{ t: 'pct' }, { t: 'of' }]],
  ['binh phuong', { t: 'sq' }],
  ['lap phuong', { t: 'cube' }],
  ['luy thua', { t: 'pow' }],
  ['mu', { t: 'pow' }],
  ['can bac hai', { t: 'sqrt' }],
  ['can bac ba', { t: 'cbrt' }],
  ['can bac 2', { t: 'sqrt' }],
  ['can bac 3', { t: 'cbrt' }],
  ['can', { t: 'sqrt' }],
  ['chia doi', { t: 'half' }],
  ['chia deu hai', { t: 'half' }],
  ['mot nua', { t: 'half' }],
  ['nua', { t: 'half' }],
  ['gap doi', { t: 'gap', k: 2 }],
  ['gap ba', { t: 'gap', k: 3 }],
  ['gap bon', { t: 'gap', k: 4 }],
  ['gap nam', { t: 'gap', k: 5 }],
  ['gap ruoi', { t: 'gap', k: 1.5 }],
  ['mo ngoac', { t: 'lp' }],
  ['dong ngoac', { t: 'rp' }],
  ['nhan voi', { t: 'op', v: '*' }],
  ['nhan cho', { t: 'op', v: '*' }],
  ['nhan', { t: 'op', v: '*' }],
  ['lan', { t: 'op', v: '*' }],
  ['x', { t: 'op', v: '*' }],
  ['chia cho', { t: 'op', v: '/' }],
  ['chia', { t: 'op', v: '/' }],
  ['cong them', { t: 'op', v: '+' }],
  ['cong', { t: 'op', v: '+' }],
  ['them', { t: 'op', v: '+' }],
  ['tang', { t: 'op', v: '+' }],
  ['tru di', { t: 'op', v: '-' }],
  ['tru', { t: 'op', v: '-' }],
  ['bot di', { t: 'op', v: '-' }],
  ['bot', { t: 'op', v: '-' }],
  ['giam', { t: 'op', v: '-' }],
  ['am', { t: 'neg' }],
  ['cua', { t: 'of' }],
  ['cho', { t: 'cho' }],
];
const BANG_CUM = new Map(CUM_TU.map(([k, v]) => [k, v]));
const MAX_CUM = Math.max(...CUM_TU.map(([k]) => k.split(' ').length));

// Từ đệm: bỏ qua, không báo lỗi
const TU_DEM = new Set([
  'bang', 'la', 'bao', 'nhieu', 'may', 'ket', 'qua', 'tinh', 'giup', 'minh', 'toi', 'oi', 'xin', 'hay',
  'voi', 'di', 'nhe', 'nha', 'a', 'vay', 'duoc', 'khong?', 'bang?', 'dau', 'tat', 'ca', 'tong', 'hoi',
  'doi', 'quy', 'sang', 'ra', 'thanh', 've',
]);
// Từ nối trong câu hỏi quy đổi
const TU_NOI = new Set(['bang', 'bao', 'nhieu', 'la', 'doi', 'ra', 'sang', 'qua', 'thanh', 've', 'den', 'tuong', 'duong', 'mat', 'may', 'gi', 'het', 'se', 'thi', 'cho', 'minh', 'toi', 'oi', 'nhe', 'nha', 'hay', 'giup', 'xin', 'vay', 'a']);
const TU_DAU_CAU = new Set(['doi', 'quy', 'tinh', 'cho', 'minh', 'toi', 'oi', 'hay', 'giup', 'xin', 'hoi', 'cau', 'luc', 'no', 'dang']);

// ---------- Chuẩn hóa câu ----------
/** Chuẩn hóa câu nói thành mảng từ đã bỏ dấu, chữ thường. */
export function chuanHoaCau(text) {
  let s = String(text ?? '').normalize('NFC').toLowerCase();
  s = s.replace(/[−–—]/g, '-').replace(/²/g, '2').replace(/³/g, '3').replace(/°/g, ' ').replace(/×/g, ' x ').replace(/÷/g, ' / ');
  s = khoaTim(s);
  s = s.replace(/km\s*\/\s*h/g, ' km tren gio ').replace(/\bm\s*\/\s*s\b/g, ' met tren giay ');
  s = s.replace(/(\d)\s*x\s*(\d)/g, '$1 x $2');
  // 2tr5, 500k, 3ty
  s = s.replace(/(\d)(tr|ty|ti|k)(?=\d|\b)/g, '$1 $2 ');
  s = s.replace(/\b(tr)\b/g, 'trieu').replace(/\bk\b/g, 'nghin');
  // dấu và ký hiệu thành từ riêng
  s = s.replace(/([+*/%^()])/g, ' $1 ');
  s = s.replace(/(^|[\s(])-(?=[\s\d(])/g, '$1 - ').replace(/(\d)-(\d)/g, '$1 - $2');
  s = s.replace(/[!?;:"'…]/g, ' ').replace(/[,.](?!\d)/g, ' ');
  s = s.replace(/(?<=[a-z])-(?=[a-z])/g, ' ');
  return s.split(/\s+/).filter(Boolean);
}

const RE_SO = /^\d+(?:[.,]\d+)*$/;
const laSo = (w) => RE_SO.test(w);

function giaTriSo(w) {
  const c = chuanHoaSoChuoi(w);
  if (c === '') return null;
  const v = Number(c);
  return Number.isFinite(v) ? v : null;
}

// ---------- Phân loại một từ thành "mảnh số" ----------
/** Trả {k,...} nếu từ là một phần của số, ngược lại null. `truoc` là mảnh số đứng ngay trước (để phân giải mười/mươi). */
function manhSo(w, truoc) {
  if (laSo(w)) {
    const v = giaTriSo(w);
    return v === null ? null : { k: 'lit', v, w };
  }
  if (w in CHU_SO && Object.prototype.hasOwnProperty.call(CHU_SO, w)) return { k: 'd', v: CHU_SO[w], w };
  if (w === 'muoi') {
    const sauSo = truoc && ((truoc.k === 'd' && truoc.v >= 2) || (truoc.k === 'lit' && truoc.v >= 2 && truoc.v <= 9));
    return sauSo ? { k: 'tens', w } : { k: 'ten', w };
  }
  if (w === 'tram') return { k: 'tram', w };
  if (w === 'chuc') return { k: 'chuc', w };
  if (TU_LE.has(w)) return { k: 'le', w };
  if (TU_RUOI.has(w)) return { k: 'ruoi', w };
  if (Object.prototype.hasOwnProperty.call(THANG, w)) return { k: 'scale', v: THANG[w], w };
  return null;
}

// ---------- Đọc một cụm mảnh số thành giá trị ----------
function duoiMuoi(m) { // phần "chục + đơn vị" (0..99) từ danh sách mảnh; null nếu sai khuôn
  const L = m.length;
  const so = (x) => x && (x.k === 'd' || x.k === 'lit');
  if (L === 0) return 0;
  if (L === 1) {
    if (so(m[0])) return m[0].v;
    if (m[0].k === 'ten') return 10;
    if (m[0].k === 'chuc') return 10;
    return null;
  }
  if (L === 2) {
    if (m[0].k === 'le' && so(m[1])) return m[1].v;
    if (m[0].k === 'ten' && so(m[1])) return 10 + m[1].v;
    if (so(m[0]) && (m[1].k === 'tens' || m[1].k === 'chuc')) return m[0].v * 10;
    return null;
  }
  if (L === 3 && so(m[0]) && m[1].k === 'tens' && so(m[2])) return m[0].v * 10 + m[2].v;
  if (L === 3 && so(m[0]) && m[1].k === 'chuc' && so(m[2])) return m[0].v * 10 + m[2].v;
  return null;
}

// Giá trị một nhóm không có từ nghìn/triệu/tỷ. Trả {v, leLe, ghiChu} hoặc null.
function nhomGiaTri(items) {
  let m = items.slice();
  let half = false;
  const ghiChu = [];
  if (m.length && m[m.length - 1].k === 'ruoi') { half = true; m = m.slice(0, -1); }
  if (!m.length) return { v: 0, nuaThoi: true, ghiChu };
  const leLe = m[0].k === 'le';
  const tramIdx = m.findIndex((x) => x.k === 'tram');
  let v;
  let cuoiTram = false;
  if (tramIdx >= 0) {
    const truoc = m.slice(0, tramIdx);
    let h;
    if (truoc.length === 0) h = 1;
    else if (truoc.length === 1 && (truoc[0].k === 'd' || truoc[0].k === 'lit')) h = truoc[0].v;
    else return null;
    const sau = m.slice(tramIdx + 1);
    let t;
    if (sau.length === 1 && sau[0].k === 'd' && sau[0].v !== 0) {
      // "ba trăm tám" nói tắt là 380 (bỏ "mươi")
      t = sau[0].v * 10;
      ghiChu.push(`Hiểu "${m.slice(0, tramIdx + 2).map((x) => x.w).join(' ')}" là ${h * 100 + t} (nói tắt, bỏ "mươi"). Muốn ${h * 100 + sau[0].v} hãy nói "${docSo(h)} trăm lẻ ${docSo(sau[0].v)}".`);
    } else {
      t = duoiMuoi(sau);
      if (t === null) return null;
    }
    v = h * 100 + t;
    cuoiTram = sau.length === 0;
  } else if (m.length >= 2 && m[0].k !== 'le' && m.every((x) => x.k === 'd' || x.k === 'le')) {
    // đọc từng chữ số: "hai lẻ năm" = 205, "không chín ba" = 093, "hai lăm" = 25
    if (m[m.length - 1].k === 'le') return null;
    v = Number(m.map((x) => (x.k === 'le' ? 0 : x.v)).join(''));
  } else {
    v = duoiMuoi(m);
    if (v === null) return null;
  }
  if (half) {
    if (cuoiTram) v += 50;
    else if (m[m.length - 1].k === 'chuc') v += 5;
    else v += 0.5;
  }
  const leTram = m[0].k === 'd' && m[0].v === 0 && tramIdx === 1;
  return { v, leLe: leLe || leTram, soDon: m.length === 1 && (m[0].k === 'd' || m[0].k === 'lit') || (half && m.length === 1), coTram: tramIdx >= 0, ghiChu };
}

const THANG_DS = [1e9, 1e6, 1e3];
function capDo(items, cha, ghiChu) {
  for (const S of THANG_DS) {
    let idx = -1;
    for (let i = items.length - 1; i >= 0; i--) if (items[i].k === 'scale' && items[i].v === S) { idx = i; break; }
    if (idx < 0) continue;
    const trai = items.slice(0, idx);
    const phai = items.slice(idx + 1);
    let tv = 1;
    if (trai.length) { tv = capDo(trai, null, ghiChu); if (tv === null) return null; }
    let pv = 0;
    if (phai.length) { pv = capDo(phai, S, ghiChu); if (pv === null) return null; }
    return tv * S + pv;
  }
  // nhóm cuối: không còn từ thang
  if (items.length === 1 && items[0].k === 'ruoi') return cha ? 0.5 * cha : 0.5;
  const g = nhomGiaTri(items);
  if (!g) return null;
  g.ghiChu.forEach((x) => ghiChu.push(x));
  if (!cha) return g.v;
  if (g.leLe) return g.v * (cha / 1000);
  if (!g.coTram && g.v < 10) return g.v * (cha / 10);
  if (Number.isInteger(g.v) && g.v >= 1000 && !g.coTram) return g.v; // số đã viết đủ
  return g.v * (cha / 1000);
}

/** Đọc một dãy mảnh số thành số. Trả {v, ghiChu} hoặc null. */
export function docDayManh(items) {
  const ghiChu = [];
  const v = capDo(items, null, ghiChu);
  return v === null ? null : { v, ghiChu };
}

// ---------- Cắt câu thành token có kiểu ----------
function cutToken(tu) {
  // 1. cụm từ -> token; 2. dãy mảnh số -> num; 3. còn lại: bỏ qua và ghi vào boQua
  const out = []; // token hoặc {w}
  let i = 0;
  while (i < tu.length) {
    const w = tu[i];
    // dấu toán
    if (w === '+') { out.push({ t: 'op', v: '+' }); i++; continue; }
    if (w === '-') { out.push({ t: 'op', v: '-' }); i++; continue; }
    if (w === '*') { out.push({ t: 'op', v: '*' }); i++; continue; }
    if (w === '/') { out.push({ t: 'op', v: '/' }); i++; continue; }
    if (w === '%') { out.push({ t: 'pct' }); i++; continue; }
    if (w === '^') { out.push({ t: 'pow' }); i++; continue; }
    if (w === '(') { out.push({ t: 'lp' }); i++; continue; }
    if (w === ')') { out.push({ t: 'rp' }); i++; continue; }

    if (w === 'mot' && tu[i + 1] === 'nua') { out.push({ t: 'half' }); i += 2; continue; }

    // dãy mảnh số (ưu tiên trước cụm từ vì "can", "nam", "x"... không trùng số)
    const run = [];
    let j = i;
    let prev = null;
    while (j < tu.length) {
      const m = manhSo(tu[j], prev);
      if (!m) break;
      // "le"/"ruoi" chỉ nằm trong dãy nếu dãy đã bắt đầu hoặc là "ruoi" đứng một mình
      if (!run.length && m.k === 'le') break;
      run.push(m); prev = m; j++;
    }
    if (run.length) {
      out.push({ chay: run, w: tu.slice(i, j).join(' ') });
      i = j; continue;
    }

    // cụm từ
    let tim = null;
    for (let n = Math.min(MAX_CUM, tu.length - i); n >= 1; n--) {
      const k = tu.slice(i, i + n).join(' ');
      if (BANG_CUM.has(k)) { tim = { n, v: BANG_CUM.get(k) }; break; }
    }
    if (tim) {
      const v = tim.v;
      (Array.isArray(v) ? v : [v]).forEach((x) => out.push({ ...x }));
      i += tim.n; continue;
    }
    out.push({ boQua: w });
    i++;
  }
  return out;
}

function laToanTu(x) { return x && x.t === 'op'; }

/** Chuyển token thô sang danh sách token tính và danh sách toán hạng để soát. */
function dungToken(raw, ghiChu) {
  const toks = [];
  const toanHang = [];
  const boQua = [];
  for (const x of raw) {
    if (x.chay) {
      const kq = docDayManh(x.chay);
      if (!kq) { boQua.push(x.w); continue; }
      kq.ghiChu.forEach((g) => ghiChu.push(g));
      toks.push({ t: 'num', v: kq.v });
      toanHang.push({ chu: docSo(Number(kq.v.toFixed(8))), so: kq.v });
    } else if (x.boQua !== undefined) {
      if (!TU_DEM.has(x.boQua)) boQua.push(x.boQua);
    } else toks.push(x);
  }
  // "âm" đứng sau toán tử/đầu câu là số âm; "cho" sau toán tử là từ đệm; "chia cho" đã gộp; "chia A cho B" đầu câu
  let cleaned = [];
  for (let i = 0; i < toks.length; i++) {
    const x = toks[i];
    const truoc = cleaned[cleaned.length - 1];
    if (x.t === 'cho') {
      if (laToanTu(truoc)) continue;
      // "chia 100 cho 4": phép chia mở đầu
      if (cleaned.length && cleaned[0].t === 'op' && cleaned[0].v === '/' && !cleaned.some((y, idx) => idx > 0 && y.t === 'op')) {
        cleaned = cleaned.slice(1);
        cleaned.push({ t: 'op', v: '/' });
        continue;
      }
      continue;
    }
    cleaned.push(x);
  }
  // "chia A cho B" mà chưa xử lý (không có cho): giữ nguyên
  return { toks: cleaned, toanHang, boQua };
}

// ---------- Ý định quy đổi đơn vị ----------
function timYDinhDonVi(tu, ghiChuChung) {
  // bỏ từ đệm đầu câu
  let s = 0;
  while (s < tu.length && TU_DAU_CAU.has(tu[s])) s++;
  let neg = false;
  if (tu[s] === 'am') { neg = true; s++; }
  if (tu[s] === '-' ) { neg = true; s++; }
  // dãy mảnh số
  const run = [];
  let j = s; let prev = null;
  while (j < tu.length) {
    const m = manhSo(tu[j], prev);
    if (!m) break;
    if (!run.length && m.k === 'le') break;
    run.push(m); prev = m; j++;
  }
  if (!run.length) return null;
  const donVi1 = quetDonVi(tu, j);
  if (!donVi1) return null;
  const sau = tu.slice(j + donVi1.soTu);
  if (donVi1.khoa === 'cong' && sau.length === 0) return null; // "ba cộng" chưa nói xong, không phải công đất
  // "ba công" + số = cộng; chỉ nhận đơn vị mơ hồ khi phần sau không bắt đầu bằng số
  if (sau.length && (manhSo(sau[0], null) || ['+', '-', '*', '/', 'x', 'nhan', 'chia', 'tru', 'cong'].includes(sau[0]))) {
    // "hai mét" + "cộng ..." không phải quy đổi
    return null;
  }
  const kq = docDayManh(run);
  if (!kq) return null;
  const goc = layDonVi(donVi1.id);
  // phần còn lại: bỏ từ nối, tìm đơn vị đích
  let r = sau.filter((w) => !TU_NOI.has(w));
  let dichId = null;
  let canhBao = [];
  if (donVi1.canhBao) canhBao.push(donVi1.canhBao);
  if (r.length) {
    const d = quetDonVi(r, 0);
    if (!d || d.soTu !== r.length) {
      // thử bỏ từ lạ ở cuối/đầu: chỉ chấp nhận khi tất cả còn lại là một đơn vị
      return null;
    }
    dichId = d.id;
    if (d.canhBao) canhBao.push(d.canhBao);
  } else {
    dichId = MAC_DINH_DICH[goc.id];
    if (!dichId) return null;
  }
  const dich = layDonVi(dichId);
  if (goc.nhom !== dich.nhom) {
    return { ok: false, loi: `Không đổi được ${goc.ten} sang ${dich.ten} vì khác loại.`, kind: 'unit' };
  }
  const gt = (neg ? -1 : 1) * kq.v;
  const ketQua = doi(gt, goc.id, dich.id);
  return {
    ok: true,
    kind: 'unit',
    gt, tu: goc.id, den: dich.id,
    value: ketQua,
    ghiChu: [...ghiChuChung, ...kq.ghiChu, ...canhBao, ...ghiChuCap(goc.id, dich.id)],
    macDinhDich: !r.length,
  };
}

// ---------- Hàm chính ----------
/**
 * Phân tích một câu nói/gõ.
 * @param {string} text
 * @param {{ans?:number|null}} opt
 * @returns kết quả có `ok`; khi ok: kind 'calc' hoặc 'unit'.
 */
export function phanTichLoiNoi(text, opt = {}) {
  const goc = String(text ?? '').trim();
  if (!goc) return { ok: false, loi: 'Chưa có lời nói nào để tính.', kind: 'rong' };
  const tu = chuanHoaCau(goc);
  if (!tu.length) return { ok: false, loi: 'Chưa có lời nói nào để tính.', kind: 'rong' };
  const ghiChu = [];

  // 1. Quy đổi đơn vị
  try {
    const u = timYDinhDonVi(tu, ghiChu);
    if (u) {
      if (!u.ok) return { ...u, nguon: goc };
      const g = layDonVi(u.tu); const d = layDonVi(u.den);
      return {
        ...u,
        nguon: goc,
        moTa: `${dinhDangSo(u.gt)} ${g.kh} = ${dinhDangGon(u.value)} ${d.kh}`,
        bangChu: docSo(Number(u.value.toPrecision(10))) ,
      };
    }
  } catch (e) {
    return { ok: false, loi: e.message, kind: 'unit', nguon: goc };
  }

  // 2. Tính toán
  const raw = cutToken(tu);
  const { toks, toanHang, boQua } = dungToken(raw, ghiChu);
  if (!toanHang.length && !toks.some((x) => x.t === 'num') && !(Number.isFinite(opt.ans) && toks.length)) {
    // "rưỡi" riêng đã thành num; còn lại không có số
    return { ok: false, loi: 'Không tìm thấy số nào trong câu. Hãy nói kiểu "ba triệu cộng hai trăm nghìn".', kind: 'calc', nguon: goc, boQua };
  }
  try {
    const { value, tokens } = tinh(toks, { ans: opt.ans });
    const ketQuaLamTron = Number(value.toPrecision(12));
    return {
      ok: true,
      kind: 'calc',
      nguon: goc,
      value: ketQuaLamTron,
      moTa: moTa(tokens),
      bangChu: docSo(Number(ketQuaLamTron.toFixed(8))),
      toanHang,
      boQua,
      ghiChu,
      dungAns: tokens[0] && tokens[0].tuAns === true,
    };
  } catch (e) {
    if (e instanceof LoiTinh) return { ok: false, loi: e.message, kind: 'calc', nguon: goc, boQua, moTa: moTa(toks), toanHang };
    throw e;
  }
}
