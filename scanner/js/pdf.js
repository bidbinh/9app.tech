// Bộ ghi PDF tối giản, tự viết: mỗi trang là một ảnh JPEG (DCTDecode), tùy chọn có lớp chữ vô hình (kết quả OCR)
// để tìm kiếm/sao chép chữ. Không phụ thuộc thư viện; chạy được trong trình duyệt và Node.

const enc = new TextEncoder();

export const A4 = { w: 595.28, h: 841.89 };
export const MM = 72 / 25.4;

function num(n) {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 1000) / 1000).toString();
}

function pdfStringHex(s) {
  // UTF-16BE có BOM, dạng hex — hợp lệ cho Title mọi ngôn ngữ
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `<${hex}>`;
}

function hex4(n) { return n.toString(16).toUpperCase().padStart(4, '0'); }

class Writer {
  constructor() { this.chunks = []; this.len = 0; this.offsets = []; }
  raw(bytes) { this.chunks.push(bytes); this.len += bytes.length; }
  text(s) { this.raw(enc.encode(s)); }
  beginObj(id) { this.offsets[id] = this.len; this.text(`${id} 0 obj\n`); }
  endObj() { this.text('\nendobj\n'); }
  result() {
    const out = new Uint8Array(this.len);
    let p = 0;
    for (const c of this.chunks) { out.set(c, p); p += c.length; }
    return out;
  }
}

/** Chọn khổ trang cho ảnh. mode: 'a4' (vừa khổ A4, tự chọn dọc/ngang), 'fit' (giữ tỉ lệ ảnh, cạnh dài 842pt), hoặc {w,h} pt. */
export function pageBox(imgW, imgH, mode = 'a4', margin = 0) {
  if (mode && typeof mode === 'object') {
    const pw = mode.w, ph = mode.h;
    return fitInto(pw, ph, imgW, imgH, margin);
  }
  if (mode === 'fit') {
    const s = A4.h / Math.max(imgW, imgH);
    const pw = imgW * s, ph = imgH * s;
    return { pageW: pw, pageH: ph, x: 0, y: 0, w: pw, h: ph };
  }
  const landscape = imgW > imgH;
  const pw = landscape ? A4.h : A4.w, ph = landscape ? A4.w : A4.h;
  return fitInto(pw, ph, imgW, imgH, margin);
}

function fitInto(pw, ph, imgW, imgH, margin) {
  const aw = pw - 2 * margin, ah = ph - 2 * margin;
  const s = Math.min(aw / imgW, ah / imgH);
  const w = imgW * s, h = imgH * s;
  return { pageW: pw, pageH: ph, x: (pw - w) / 2, y: (ph - h) / 2, w, h };
}

/**
 * pages: [{ jpeg: Uint8Array, imgW, imgH, pageW, pageH, x, y, w, h, gray?: boolean, words?: [{text,x0,y0,x1,y1}] }]
 *   (x,y,w,h: vị trí ảnh trong trang, đơn vị pt, gốc dưới-trái; words: hộp chữ theo điểm ảnh của ảnh)
 * opts: { title, producer, lang }
 */
export function buildPdf(pages, opts = {}) {
  if (!pages.length) throw new Error('Không có trang nào');
  const wr = new Writer();
  wr.raw(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + dấu nhị phân

  // Bảng ký tự cho lớp chữ
  const charMap = new Map();
  const chars = [];
  const hasText = pages.some((p) => p.words && p.words.length);
  if (hasText) {
    for (const p of pages) for (const wd of p.words || []) for (const ch of wd.text) {
      if (!charMap.has(ch) && chars.length < 60000) { charMap.set(ch, chars.length + 1); chars.push(ch); }
    }
  }

  let nextId = 1;
  const catalogId = nextId++, pagesId = nextId++, infoId = nextId++;
  let fontId = 0, cidId = 0, descId = 0, cmapId = 0;
  if (hasText) { fontId = nextId++; cidId = nextId++; descId = nextId++; cmapId = nextId++; }
  const pageIds = [];
  const ids = pages.map(() => ({ page: nextId++, content: nextId++, image: nextId++ }));
  ids.forEach((x) => pageIds.push(x.page));

  wr.beginObj(catalogId);
  wr.text(`<< /Type /Catalog /Pages ${pagesId} 0 R${opts.lang ? ` /Lang (${opts.lang})` : ''} >>`);
  wr.endObj();

  wr.beginObj(pagesId);
  wr.text(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] >>`);
  wr.endObj();

  wr.beginObj(infoId);
  const d = new Date();
  const ds = `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
  wr.text(`<< /Producer (${opts.producer || '9scanner'}) /CreationDate (${ds})${opts.title ? ` /Title ${pdfStringHex(opts.title)}` : ''} >>`);
  wr.endObj();

  if (hasText) {
    wr.beginObj(fontId);
    wr.text(`<< /Type /Font /Subtype /Type0 /BaseFont /9scannerOCR /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${cmapId} 0 R >>`);
    wr.endObj();
    wr.beginObj(cidId);
    wr.text(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /9scannerOCR /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /DW 500 /CIDToGIDMap /Identity >>`);
    wr.endObj();
    wr.beginObj(descId);
    wr.text('<< /Type /FontDescriptor /FontName /9scannerOCR /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>');
    wr.endObj();
    // ToUnicode CMap
    let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < chars.length; i += 100) {
      const part = chars.slice(i, i + 100);
      cm += `${part.length} beginbfchar\n`;
      part.forEach((ch, j) => {
        let u = '';
        for (let k = 0; k < ch.length; k++) u += hex4(ch.charCodeAt(k));
        cm += `<${hex4(i + j + 1)}> <${u}>\n`;
      });
      cm += 'endbfchar\n';
    }
    cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    const cmb = enc.encode(cm);
    wr.beginObj(cmapId);
    wr.text(`<< /Length ${cmb.length} >>\nstream\n`);
    wr.raw(cmb);
    wr.text('\nendstream');
    wr.endObj();
  }

  pages.forEach((p, idx) => {
    const id = ids[idx];
    const pw = p.pageW, ph = p.pageH;
    const x = p.x ?? 0, y = p.y ?? 0, w = p.w ?? pw, h = p.h ?? ph;
    wr.beginObj(id.page);
    wr.text(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(pw)} ${num(ph)}] /Resources << /XObject << /Im0 ${id.image} 0 R >>${hasText && p.words && p.words.length ? ` /Font << /F1 ${fontId} 0 R >>` : ''} >> /Contents ${id.content} 0 R >>`);
    wr.endObj();

    let cs = `q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im0 Do Q\n`;
    if (p.words && p.words.length) {
      const sx = w / p.imgW, sy = h / p.imgH;
      cs += 'BT 3 Tr\n';
      for (const wd of p.words) {
        const chs = Array.from(wd.text);
        if (!chs.length) continue;
        const boxW = (wd.x1 - wd.x0) * sx, boxH = (wd.y1 - wd.y0) * sy;
        if (boxW <= 0 || boxH <= 0) continue;
        const fs = Math.max(1, boxH * 0.8);
        const tz = Math.max(1, Math.min(1000, (boxW / (chs.length * 0.5 * fs)) * 100));
        const tx = x + wd.x0 * sx;
        const ty = y + h - wd.y1 * sy + boxH * 0.2;
        let hexs = '';
        for (const ch of chs) hexs += hex4(charMap.get(ch) || 1);
        cs += `/F1 ${num(fs)} Tf ${num(tz)} Tz 1 0 0 1 ${num(tx)} ${num(ty)} Tm <${hexs}> Tj\n`;
      }
      cs += 'ET\n';
    }
    const csb = enc.encode(cs);
    wr.beginObj(id.content);
    wr.text(`<< /Length ${csb.length} >>\nstream\n`);
    wr.raw(csb);
    wr.text('endstream');
    wr.endObj();

    wr.beginObj(id.image);
    wr.text(`<< /Type /XObject /Subtype /Image /Width ${p.imgW} /Height ${p.imgH} /ColorSpace /${p.gray ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    wr.raw(p.jpeg);
    wr.text('\nendstream');
    wr.endObj();
  });

  const xrefPos = wr.len;
  const count = nextId; // số đối tượng + 1 (đối tượng 0)
  let xr = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) xr += `${String(wr.offsets[i]).padStart(10, '0')} 00000 n \n`;
  xr += `trailer\n<< /Size ${count} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  wr.text(xr);
  return wr.result();
}
