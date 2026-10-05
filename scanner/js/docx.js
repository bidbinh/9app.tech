// Ghi tệp Word (.docx) tối thiểu bằng OOXML tự viết + ZIP tự viết. Mở được bằng Word, LibreOffice, Google Docs.
// Đầu vào là bố cục từ layout.js (đoạn văn, tiêu đề, bảng) của từng trang.
import { buildZip } from './zip.js';

const TW_A4_W = 11906, TW_A4_H = 16838;
const EMU = 914400;

// Bỏ ký tự điều khiển không hợp lệ trong XML 1.0 rồi thoát ký tự đặc biệt.
export function xmlEscape(s) {
  return String(s)
    .replace(/[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const JC = { left: 'left', center: 'center', right: 'right', both: 'both' };

function runXml(text, { size, bold }) {
  const parts = String(text).split('\t');
  let out = '';
  parts.forEach((p, i) => {
    out += `<w:r><w:rPr>${bold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/></w:rPr>${i ? '<w:tab/>' : ''}<w:t xml:space="preserve">${xmlEscape(p)}</w:t></w:r>`;
  });
  return out;
}

function paraXml(b, ctx, pageBreak) {
  const body = ctx.bodySize;
  let size = Math.abs(b.size - body) < 1.1 ? body : clamp(Math.round(b.size), 8, 24);
  if (b.level === 1) size = clamp(Math.max(size, body + 4), body + 2, 24);
  else if (b.level === 2) size = clamp(Math.max(size, body + 1), body, 20);
  const ind = b.indent ? Math.round(clamp(b.indent, 0, 0.5) * TW_A4_W) : 0;
  const style = b.level === 1 ? '<w:pStyle w:val="Heading1"/>' : b.level === 2 ? '<w:pStyle w:val="Heading2"/>' : '';
  return `<w:p><w:pPr>${style}${pageBreak ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="${b.level ? 160 : 120}" w:line="276" w:lineRule="auto"/>${ind ? `<w:ind w:left="${ind}"/>` : ''}<w:jc w:val="${JC[b.align] || 'left'}"/></w:pPr>${runXml(b.text, { size, bold: !!b.bold })}</w:p>`;
}

function tableXml(b, ctx, pageBreak) {
  const textW = ctx.textW;
  const nCols = Math.max(...b.rows.map((r) => r.length), 1);
  let widths;
  if (b.cols && b.cols.length === nCols) {
    const spans = b.cols.map((c) => Math.max(1, c.x1 - c.x0));
    const tot = spans.reduce((a, c) => a + c, 0);
    widths = spans.map((s) => Math.max(500, Math.round((s / tot) * textW)));
  } else widths = Array(nCols).fill(Math.floor(textW / nCols));
  const size = ctx.bodySize;
  let x = '';
  if (pageBreak) x += '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>';
  x += `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  for (const row of b.rows) {
    x += '<w:tr>';
    for (let c = 0; c < nCols; c++) {
      x += `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>${runXml(row[c] || '', { size, bold: false })}</w:p></w:tc>`;
    }
    x += '</w:tr>';
  }
  x += '</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr></w:p>';
  return x;
}

function imageXml(rid, idx, wEmu, hEmu, pageBreak) {
  return `<w:p><w:pPr>${pageBreak ? '<w:pageBreakBefore/>' : ''}<w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:docPr id="${idx}" name="Ảnh trang ${idx}" descr="Ảnh trang quét ${idx}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idx}" name="trang-${idx}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const STYLES = (font) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN" w:eastAsia="vi-VN" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

/**
 * pages: [{ blocks: [...] (từ layoutPage), margins? }]
 * opts: { title, font, bodySize, images?: [{bytes: Uint8Array JPEG, w, h}] (ảnh trang gốc, đặt cuối tài liệu) }
 * Trả về Uint8Array của tệp .docx.
 */
export async function buildDocx(pages, opts = {}) {
  const font = opts.font || 'Times New Roman';
  const sizes = pages.map((p) => p.bodySize).filter((x) => x > 0);
  const bodyPt = opts.bodySize || (sizes.length ? sizes.sort((a, b) => a - b)[sizes.length >> 1] : 13);
  const bodySize = clamp(Math.round(bodyPt), 10, 14);
  const m = pages.map((p) => p.margins).filter(Boolean);
  const avg = (k, d) => (m.length ? m.reduce((a, x) => a + x[k], 0) / m.length : d);
  const mLeft = clamp(Math.round(avg('left', 0.1) * TW_A4_W), 850, 2300), mRight = clamp(Math.round(avg('right', 0.1) * TW_A4_W), 850, 2300);
  const mTop = clamp(Math.round(avg('top', 0.07) * TW_A4_H), 850, 2000), mBot = 1134;
  const textW = TW_A4_W - mLeft - mRight;
  const ctx = { bodySize, textW };

  let body = '';
  pages.forEach((p, pi) => {
    let first = pi > 0;
    if (!p.blocks.length) {
      body += `<w:p><w:pPr>${first ? '<w:pageBreakBefore/>' : ''}</w:pPr>${runXml(`(Trang ${pi + 1}: không đọc được chữ)`, { size: bodySize, bold: false })}</w:p>`;
      return;
    }
    for (const b of p.blocks) {
      body += b.type === 'table' ? tableXml(b, ctx, first) : paraXml(b, ctx, first);
      first = false;
    }
  });

  const files = [];
  const rels = [];
  const images = opts.images || [];
  images.forEach((im, i) => {
    const rid = `rIdImg${i + 1}`;
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/trang${i + 1}.jpg"/>`);
    files.push({ name: `word/media/trang${i + 1}.jpg`, data: im.bytes, store: true });
    const maxW = textW / 1440 * EMU, maxH = (TW_A4_H - mTop - mBot - 400) / 1440 * EMU;
    const s = Math.min(maxW / im.w, maxH / im.h);
    body += imageXml(rid, i + 1, Math.round(im.w * s), Math.round(im.h * s), true);
  });

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="${TW_A4_W}" w:h="${TW_A4_H}"/><w:pgMar w:top="${mTop}" w:right="${mRight}" w:bottom="${mBot}" w:left="${mLeft}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files.unshift(
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: STYLES(xmlEscape(font)) },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(opts.title || 'Tài liệu')}</dc:title><dc:creator>9scanner</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>9scanner</Application></Properties>` },
  );
  return buildZip(files);
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
