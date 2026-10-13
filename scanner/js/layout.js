// Dựng bố cục tài liệu từ kết quả OCR (từ + hộp chữ): dòng -> đoạn văn / tiêu đề / bảng, theo đúng thứ tự đọc.
// Thuần JS, không phụ thuộc trình duyệt (kiểm thử được trong Node). Dùng cho xuất Word, Excel và văn bản thuần.
//
// Đầu vào: words = [{text, x0, y0, x1, y1, conf?}] theo điểm ảnh của trang, width/height của trang.
// Đầu ra: { width, height, lines, blocks, bodySize, margins } với
//   block = { type:'para', text, align:'left'|'center'|'right'|'both', size(pt), bold, level(0|1|2), indent(0..1), y0, y1 }
//         | { type:'table', rows:string[][], cols:[{x0,x1}], y0, y1 }

const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const NOISE = /^[|¦\\/_~=—–-]{1,3}$/;

export function cleanWords(words, minConf = 35) {
  return words
    .filter((w) => w && w.text && String(w.text).trim() && (w.conf == null || w.conf >= minConf))
    .map((w) => ({ text: String(w.text).trim(), x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, conf: w.conf }))
    .filter((w) => w.x1 > w.x0 && w.y1 > w.y0 && !(NOISE.test(w.text) && (w.y1 - w.y0) > (w.x1 - w.x0) * 1.2));
}

/** Gom từ thành dòng theo mức chồng lấn theo chiều dọc. */
export function groupLines(words) {
  const ws = words.slice().sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines = [];
  for (const w of ws) {
    const wh = w.y1 - w.y0, wc = (w.y0 + w.y1) / 2;
    let hit = null;
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 6; i--) {
      const L = lines[i];
      const ov = Math.min(w.y1, L.y1) - Math.max(w.y0, L.y0);
      if (ov >= 0.5 * Math.min(wh, L.y1 - L.y0) && Math.abs(wc - L.cy) < 0.6 * Math.max(wh, L.y1 - L.y0)) { hit = L; break; }
    }
    if (!hit) { hit = { words: [], y0: w.y0, y1: w.y1, cy: wc }; lines.push(hit); }
    hit.words.push(w);
    const n = hit.words.length;
    hit.y0 = (hit.y0 * (n - 1) + w.y0) / n; hit.y1 = (hit.y1 * (n - 1) + w.y1) / n; hit.cy = (hit.y0 + hit.y1) / 2;
  }
  for (const L of lines) {
    L.words.sort((a, b) => a.x0 - b.x0);
    L.x0 = L.words[0].x0; L.x1 = Math.max(...L.words.map((w) => w.x1));
    L.h = median(L.words.map((w) => w.y1 - w.y0));
  }
  return lines.sort((a, b) => a.cy - b.cy);
}

function joinWords(ws) {
  return ws.map((w) => w.text).join(' ');
}

/** Cắt một dòng thành các đoạn rời nhau bởi khoảng trắng lớn (ứng viên ô bảng). */
function segments(line, gapThr) {
  const segs = [];
  let cur = null;
  for (const w of line.words) {
    if (cur && w.x0 - cur.x1 <= gapThr) { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x1); } else { cur = { words: [w], x0: w.x0, x1: w.x1 }; segs.push(cur); }
  }
  return segs;
}

/** Dò các đoạn dòng liên tiếp có dạng bảng. Trả về [{from, to(không gồm), cols}] */
export function detectTables(lines, pageW) {
  const medH = median(lines.map((l) => l.h)) || 20;
  const gapThr = Math.max(medH * 1.25, pageW * 0.012);
  const segs = lines.map((l) => segments(l, gapThr));
  const multi = segs.map((s) => s.length >= 2);
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (!multi[i]) { i++; continue; }
    let j = i, nMulti = 0, last = i;
    while (j < lines.length) {
      if (multi[j]) { nMulti++; last = j; j++; continue; }
      // dòng đơn lẻ nằm giữa các dòng nhiều ô (ô xuống dòng) vẫn thuộc bảng
      if (j + 1 < lines.length && multi[j + 1] && lines[j].cy - lines[j - 1].cy < medH * 2.2) { j++; continue; }
      break;
    }
    const end = last + 1;
    if (nMulti >= 3) {
      const cols = findColumns(lines.slice(i, end), gapThr, segs.slice(i, end));
      // hai cột chữ dài (báo, tạp chí) không phải bảng: ô của bảng thường ngắn
      const nSeg = segs.slice(i, end).reduce((a, x) => a + x.length, 0);
      const nWords = lines.slice(i, end).reduce((a, l) => a + l.words.length, 0);
      const textColumns = cols.length === 2 && nWords / Math.max(1, nSeg) >= 5;
      if (cols.length >= 2 && !textColumns) tables.push({ from: i, to: end, cols });
    }
    i = Math.max(end, i + 1);
  }
  return tables;
}

// Cột = khoảng x được phủ bởi chữ của các hàng; khe trắng dọc xuyên qua mọi hàng là ranh giới cột.
function findColumns(lines, gapThr) {
  const iv = [];
  for (const l of lines) for (const w of l.words) iv.push([w.x0, w.x1]);
  iv.sort((a, b) => a[0] - b[0]);
  const cols = [];
  for (const [a, b] of iv) {
    const c = cols[cols.length - 1];
    if (c && a - c.x1 < gapThr * 0.9) c.x1 = Math.max(c.x1, b); else cols.push({ x0: a, x1: b });
  }
  // bỏ cột chỉ có rất ít chữ (rác)
  const count = (c) => lines.reduce((n, l) => n + (l.words.some((w) => w.x0 < c.x1 && w.x1 > c.x0) ? 1 : 0), 0);
  return cols.filter((c) => count(c) >= Math.max(2, lines.length * 0.25));
}

function tableFromLines(lines, cols) {
  const bounds = cols.map((c, i) => (i === 0 ? -Infinity : (cols[i - 1].x1 + c.x0) / 2));
  const colOf = (w) => {
    const cx = (w.x0 + w.x1) / 2;
    let k = 0;
    for (let i = 0; i < bounds.length; i++) if (cx >= bounds[i]) k = i;
    return k;
  };
  const rows = [];
  for (const l of lines) {
    const row = cols.map(() => []);
    for (const w of l.words) row[colOf(w)].push(w);
    rows.push(row.map((ws) => joinWords(ws)));
  }
  // dòng chỉ có chữ ở một cột, sát dòng trên: là phần xuống dòng của ô, ghép vào hàng trên
  const medDy = median(lines.slice(1).map((l, i) => l.cy - lines[i].cy)) || 1;
  const merged = [];
  for (let r = 0; r < rows.length; r++) {
    const filled = rows[r].filter(Boolean).length;
    const prev = merged[merged.length - 1];
    if (prev && filled === 1 && lines[r].cy - lines[r - 1].cy < medDy * 1.15 && prev.cells.filter(Boolean).length > 1 && rows[r][0] === '') {
      const k = rows[r].findIndex(Boolean);
      prev.cells[k] = (prev.cells[k] ? prev.cells[k] + ' ' : '') + rows[r][k];
    } else merged.push({ cells: rows[r] });
  }
  return merged.map((m) => m.cells);
}

/** Tìm khe dọc giữa hai cột chữ (báo, tạp chí). Trả về hoành độ giữa khe hoặc null. */
function findGutter(lines, pageW) {
  const gutterMin = pageW * 0.035;
  if (lines.length < 8) return null;
  const x0 = Math.min(...lines.map((l) => l.x0)), x1 = Math.max(...lines.map((l) => l.x1));
  const BINS = 200, k = BINS / pageW;
  const cover = new Uint16Array(BINS);
  for (const l of lines) for (const w of l.words) for (let b = Math.floor(w.x0 * k); b <= Math.min(BINS - 1, Math.floor(w.x1 * k)); b++) cover[b]++;
  let best = null, s = -1;
  for (let b = Math.floor(x0 * k) + 5; b <= Math.ceil(x1 * k) - 5; b++) {
    if (cover[b] <= lines.length * 0.03) { if (s < 0) s = b; } else if (s >= 0) {
      if ((b - s) / k >= gutterMin && (!best || b - s > best.e - best.s)) best = { s, e: b };
      s = -1;
    }
  }
  if (!best) return null;
  const gx = (best.s + best.e) / 2 / k;
  const both = lines.filter((l) => l.words.some((w) => w.x1 <= gx) && l.words.some((w) => w.x0 >= gx)).length;
  const onlyL = lines.filter((l) => l.x1 <= gx).length, onlyR = lines.filter((l) => l.x0 >= gx).length;
  if (both + onlyL < 4 || both + onlyR < 4) return null;
  if (both + onlyL + onlyR < lines.length * 0.7) return null;
  return gx;
}

function makeLine(words) {
  const y0 = Math.min(...words.map((w) => w.y0)), y1 = Math.max(...words.map((w) => w.y1));
  return { words, y0, y1, cy: (y0 + y1) / 2, x0: words[0].x0, x1: Math.max(...words.map((w) => w.x1)), h: median(words.map((w) => w.y1 - w.y0)) };
}

function buildParagraphs(lines, ctx) {
  const { pageW, bodyH, L, R } = ctx;
  if (!lines.length) return [];
  const dys = [];
  for (let i = 1; i < lines.length; i++) { const d = lines[i].cy - lines[i - 1].cy; if (d > 0 && d < bodyH * 3) dys.push(d); }
  const medDy = median(dys) || bodyH * 1.3;
  const paras = [];
  let cur = null;
  const full = (l) => l.x1 >= R - pageW * 0.045;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let brk = !cur;
    if (cur) {
      const p = cur.lines[cur.lines.length - 1];
      const dy = l.cy - p.cy;
      const sizeChange = Math.max(l.h, p.h) / Math.max(1, Math.min(l.h, p.h)) > 1.28;
      const indent = l.x0 > L + bodyH * 1.6 && p.x0 <= L + bodyH * 1.2;
      const prevShort = !full(p) && !(Math.abs((p.x0 + p.x1) / 2 - (l.x0 + l.x1) / 2) < pageW * 0.03 && Math.abs(p.x0 - l.x0) > pageW * 0.02);
      const alignJump = Math.abs(l.x0 - p.x0) > pageW * 0.06 && !(full(p) && l.x0 <= L + bodyH * 1.2);
      brk = dy > medDy * 1.5 || sizeChange || indent || prevShort || alignJump;
    }
    if (brk) { cur = { lines: [l] }; paras.push(cur); } else cur.lines.push(l);
  }
  return paras.map((p) => finishPara(p.lines, ctx));
}

function finishPara(ls, ctx) {
  const { pageW, bodyH, L, R } = ctx;
  let text = '';
  for (let i = 0; i < ls.length; i++) {
    const t = joinWords(ls[i].words);
    if (i === 0) text = t;
    else if (/[a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]-$/i.test(text) && /^[a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/.test(t)) text = text.slice(0, -1) + t;
    else text += ' ' + t;
  }
  const h = median(ls.map((l) => l.h));
  const x0 = Math.min(...ls.map((l) => l.x0)), x1 = Math.max(...ls.map((l) => l.x1));
  const ratio = h / bodyH;
  const cx = (x0 + x1) / 2, midPage = (L + R) / 2;
  const centered = ls.every((l) => Math.abs((l.x0 + l.x1) / 2 - midPage) < pageW * 0.035) && x0 > L + pageW * 0.05 && (x1 - x0) < (R - L) * 0.92;
  const rightAl = !centered && ls.every((l) => l.x1 >= R - pageW * 0.03) && x0 > L + (R - L) * 0.3;
  const fullLines = ls.filter((l, i) => i < ls.length - 1 && l.x1 >= R - pageW * 0.035 && l.x0 <= L + pageW * 0.035).length;
  let align = centered ? 'center' : rightAl ? 'right' : (ls.length >= 3 && fullLines >= ls.length - 2) ? 'both' : 'left';
  const letters = text.replace(/[^\p{L}]/gu, '');
  const upper = letters.length >= 4 && letters === letters.toUpperCase();
  let level = 0;
  if (ls.length <= 3 && text.length <= 160) {
    if (ratio >= 1.5) level = 1;
    else if (ratio >= 1.22) level = 2;
    else if (upper && (centered || ls.length === 1) && text.length <= 90 && ratio >= 1.05) level = 2;
  }
  const bold = level > 0;
  const sizePt = Math.round((h / pageW) * 595.28 * 0.93 * 2) / 2;
  const indent = align === 'left' || align === 'both' ? Math.max(0, (x0 - L) / pageW) : 0;
  void cx;
  return { type: 'para', text, align, size: sizePt, bold, level, indent: indent > 0.025 ? indent : 0, y0: ls[0].y0, y1: ls[ls.length - 1].y1, bodyRatio: ratio };
}

/**
 * Bảng có đường kẻ: dựng lưới ô từ các đường kẻ ngang/dọc (lấy từ ocrprep.removeRuling), gán từ vào ô theo tâm.
 * Chính xác hơn dò theo khoảng trắng, xử lý được ô nhiều dòng. Trả về { tables, rest } (rest = từ ngoài bảng).
 */
export function gridTables(words, rules, pageW) {
  const hl = (rules.hLines || []).slice().sort((a, b) => a.y - b.y), vl = (rules.vLines || []).slice();
  const groups = [];
  for (const l of hl) {
    const g = groups.find((x) => Math.min(x.x1, l.x1) - Math.max(x.x0, l.x0) > 0.7 * Math.min(x.x1 - x.x0, l.x1 - l.x0) && l.y - x_last(x) < pageW * 0.5);
    if (g) { g.lines.push(l); g.x0 = Math.min(g.x0, l.x0); g.x1 = Math.max(g.x1, l.x1); } else groups.push({ lines: [l], x0: l.x0, x1: l.x1 });
  }
  const tables = [];
  let rest = words;
  for (const g of groups) {
    if (g.lines.length < 2) continue;
    const ys = dedupe(g.lines.map((l) => l.y), 6);
    const top = ys[0], bot = ys[ys.length - 1];
    const vs = vl.filter((v) => v.x >= g.x0 - 6 && v.x <= g.x1 + 6 && Math.min(v.y1, bot) - Math.max(v.y0, top) > 0.5 * (bot - top)).map((v) => v.x);
    const xs = dedupe(vs, 8);
    if (xs.length < 2 || ys.length < 2) continue; // thiếu đường dọc: để dò theo khoảng trắng
    const inCell = (w) => { const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2; return cx >= xs[0] - 4 && cx <= xs[xs.length - 1] + 4 && cy >= top - 4 && cy <= bot + 4; };
    const inside = rest.filter(inCell);
    if (!inside.length) continue;
    rest = rest.filter((w) => !inCell(w));
    const nR = ys.length - 1, nC = xs.length - 1;
    const cells = Array.from({ length: nR }, () => Array.from({ length: nC }, () => []));
    for (const w of inside) {
      const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
      let r = 0, c = 0;
      for (let i = 0; i < nR; i++) if (cy >= ys[i]) r = i;
      for (let j = 0; j < nC; j++) if (cx >= xs[j]) c = j;
      cells[r][c].push(w);
    }
    const rows = cells.map((row) => row.map((ws) => groupLines(ws).map((l) => joinWords(l.words)).join(' ')));
    tables.push({ type: 'table', rows, cols: xs.slice(0, -1).map((x, i) => ({ x0: x, x1: xs[i + 1] })), y0: top, y1: bot, ruled: true });
  }
  return { tables, rest };
}
function x_last(g) { return g.lines[g.lines.length - 1].y; }
function dedupe(a, tol) {
  const s = a.slice().sort((x, y) => x - y), out = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/** Dựng bố cục cho một trang. opts: { minConf, noTables, noColumns, rules: {hLines, vLines} } */
export function layoutPage({ words, width, height }, opts = {}) {
  let ws = cleanWords(words || [], opts.minConf ?? 35);
  let ruled = [];
  if (opts.rules && !opts.noTables) { const g = gridTables(ws, opts.rules, width); ws = g.tables.length ? g.rest : ws; ruled = g.tables; }
  const lines = groupLines(ws);
  const out = { width, height, lines, blocks: [], bodySize: 12, margins: { left: 0.1, right: 0.1, top: 0.08, bottom: 0.08 } };
  if (!lines.length) { out.blocks.push(...ruled); return out; }
  const bodyH = median(lines.map((l) => l.h)) || 20;
  const tabs = opts.noTables ? [] : detectTables(lines, width);
  const L = pct(lines.filter((l) => l.words.length > 1 || l.x1 - l.x0 > width * 0.3).map((l) => l.x0), 0.12) ?? lines[0].x0;
  const R = pct(lines.map((l) => l.x1), 0.92);
  const ctx = { pageW: width, bodyH, L: Math.min(L, R - 1), R };
  out.margins = { left: Math.max(0.04, Math.min(0.22, ctx.L / width)), right: Math.max(0.04, Math.min(0.22, 1 - R / width)), top: Math.max(0.03, Math.min(0.15, lines[0].y0 / height)), bottom: 0.07 };
  out.bodySize = Math.round((bodyH / width) * 595.28 * 0.93 * 2) / 2;

  // các vùng: dòng thường (nhóm theo cột chữ) xen kẽ bảng, giữ thứ tự dọc
  const segs = [];
  let idx = 0;
  const flush = (from, to) => { if (to > from) segs.push({ type: 'text', lines: lines.slice(from, to) }); };
  for (const t of tabs) {
    flush(idx, t.from);
    segs.push({ type: 'table', lines: lines.slice(t.from, t.to), cols: t.cols });
    idx = t.to;
  }
  flush(idx, lines.length);

  for (const s of segs) {
    if (s.type === 'table') {
      const rows = tableFromLines(s.lines, s.cols);
      out.blocks.push({ type: 'table', rows, cols: s.cols, y0: s.lines[0].y0, y1: s.lines[s.lines.length - 1].y1 });
    } else {
      const gx = opts.noColumns ? null : findGutter(s.lines, width);
      if (gx != null) {
        // dòng vắt qua khe (tiêu đề) đứng riêng; còn lại đọc hết cột trái rồi sang cột phải
        let left = [], right = [];
        const flushCols = () => {
          if (left.length) out.blocks.push(...buildParagraphs(left, { ...ctx, L: Math.min(...left.map((l) => l.x0)), R: Math.min(gx, Math.max(...left.map((l) => l.x1)) + width * 0.02) }));
          if (right.length) out.blocks.push(...buildParagraphs(right, { ...ctx, L: Math.min(...right.map((l) => l.x0)), R: ctx.R }));
          left = []; right = [];
        };
        for (const l of s.lines) {
          if (l.words.some((w) => w.x0 < gx && w.x1 > gx)) { flushCols(); out.blocks.push(...buildParagraphs([l], ctx)); continue; }
          const lw = l.words.filter((w) => w.x1 <= gx), rw = l.words.filter((w) => w.x0 >= gx);
          if (lw.length) left.push(makeLine(lw));
          if (rw.length) right.push(makeLine(rw));
        }
        flushCols();
      } else out.blocks.push(...buildParagraphs(s.lines, ctx));
    }
  }
  if (ruled.length) out.blocks = out.blocks.concat(ruled).sort((a, b) => a.y0 - b.y0);
  return out;
}

/** Văn bản thuần của bố cục (bảng thành các dòng cách nhau bằng tab). */
export function layoutToText(lay) {
  const out = [];
  for (const b of lay.blocks) {
    if (b.type === 'table') out.push(b.rows.map((r) => r.join('\t')).join('\n'));
    else out.push(b.text);
  }
  return out.join('\n\n');
}

/** Số liệu cho bảng tính: mỗi bảng thành một lưới; nếu không có bảng, chia từng dòng thành ô theo khoảng trắng lớn. */
export function tablesForSheet(lay, { fallbackLines = true } = {}) {
  const tabs = lay.blocks.filter((b) => b.type === 'table').map((b) => ({ rows: b.rows, approx: false }));
  if (tabs.length || !fallbackLines) return tabs;
  const rows = [];
  const medH = median(lay.lines.map((l) => l.h)) || 20;
  const gap = Math.max(medH * 1.25, lay.width * 0.012);
  for (const l of lay.lines) rows.push(segments(l, gap).map((s) => joinWords(s.words)));
  if (!rows.length) return [];
  return [{ rows, approx: true }];
}

/** Chuẩn hóa chuỗi số kiểu Việt (1.234.567 hoặc 1.234,5) thành số; null nếu không phải. Giữ nguyên mã có số 0 đầu (điện thoại, mã số). */
export function parseVnNumber(s) {
  const t = String(s).trim();
  if (!t) return null;
  if (/^-?(0|[1-9]\d{0,2}(\.\d{3})+|[1-9]\d{0,8})(,\d+)?$/.test(t)) {
    const v = Number(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  }
  if (/^-?0,\d+$/.test(t)) return Number(t.replace(',', '.'));
  return null;
}
