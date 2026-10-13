import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZip, readZip, crc32 } from '../js/zip.js';
import { layoutPage, layoutToText, tablesForSheet, parseVnNumber, groupLines } from '../js/layout.js';
import { buildDocx } from '../js/docx.js';
import { buildXlsx, colName } from '../js/xlsx.js';
import { checkXml, xmlText } from './helpers/xml.js';

// Trang mẫu 1240x1754 (A4 150 dpi). Mỗi "từ" rộng theo số ký tự.
const CH = 12; // bề rộng một ký tự
function line(text, x, y, h = 26, conf = 90) {
  const words = [];
  let cx = x;
  for (const t of text.split(' ')) { const w = t.length * CH; words.push({ text: t, x0: cx, y0: y, x1: cx + w, y1: y + h, conf }); cx += w + CH * 0.6; }
  return words;
}
// dòng căn đều hai bên: giãn khoảng cách từ để chạm mép phải x+width
function justified(text, x, y, width, h = 26) {
  const ts = text.split(' ');
  const tw = ts.reduce((a, t) => a + t.length * CH, 0);
  const gap = (width - tw) / (ts.length - 1);
  const words = [];
  let cx = x;
  for (const t of ts) { words.push({ text: t, x0: cx, y0: y, x1: cx + t.length * CH, y1: y + h, conf: 90 }); cx += t.length * CH + gap; }
  return words;
}
function samplePage() {
  const w = [];
  w.push(...line('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 439, 120, 40));
  w.push(...line('GIẤY XÁC NHẬN', 553, 200, 48));
  const body = [
    'Tôi tên là Nguyễn Văn An, sinh năm 1985, hiện cư trú tại số 25 đường Lê Lợi.',
    'Tôi xin xác nhận đã nhận đầy đủ hồ sơ và giấy tờ liên quan đến việc đăng ký kinh.',
    'Mọi thông tin trong giấy này là đúng sự thật.',
  ];
  let y = 300;
  for (let i = 0; i < body.length; i++) { w.push(...(i < body.length - 1 ? justified(body[i], 110, y, 1020) : line(body[i], 110, y))); y += 40; }
  y += 40;
  w.push(...line('Đoạn thứ hai bắt đầu sau một khoảng trống lớn hơn.', 110, y)); y += 120;
  // bảng 4 cột, 4 hàng
  const rows = [['STT', 'Tên hàng', 'Số lượng', 'Đơn giá'], ['1', 'Giấy A4', '10', '1.500.000'], ['2', 'Bút bi xanh', '25', '12.000'], ['3', 'Kẹp tài liệu', '8', '45.000']];
  const xs = [120, 260, 700, 950];
  for (const r of rows) { r.forEach((c, i) => w.push(...line(c, xs[i], y))); y += 44; }
  y += 60;
  w.push(...line('Thành phố Hồ Chí Minh, ngày 4 tháng 10 năm 2026', 600, y));
  return { words: w, width: 1240, height: 1754 };
}

test('zip: ghi rồi đọc lại, kiểm CRC và tên tiếng Việt', async () => {
  const files = [{ name: 'a.txt', data: 'xin chào' }, { name: 'thư-mục/ảnh đẹp.bin', data: new Uint8Array([1, 2, 3, 4]), store: true }, { name: 'dai.xml', data: '<a>' + 'x'.repeat(5000) + '</a>' }];
  const z = await buildZip(files);
  const back = await readZip(z);
  assert.deepEqual(back.map((f) => f.name), files.map((f) => f.name));
  assert.equal(new TextDecoder().decode(back[0].data), 'xin chào');
  assert.deepEqual([...back[1].data], [1, 2, 3, 4]);
  assert.equal(back[2].data.length, 5007);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.ok(z.length < 5200, 'XML dài phải được nén');
});

test('layout: tiêu đề, đoạn văn, bảng, thứ tự đọc từ trên xuống', () => {
  const lay = layoutPage(samplePage());
  const types = lay.blocks.map((b) => b.type + (b.level ? ':h' + b.level : ''));
  assert.equal(lay.blocks[0].text, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
  assert.ok(lay.blocks[0].level >= 1 && lay.blocks[0].align === 'center', JSON.stringify(types));
  assert.equal(lay.blocks[1].text, 'GIẤY XÁC NHẬN');
  assert.equal(lay.blocks[1].level, 1);
  const paras = lay.blocks.filter((b) => b.type === 'para' && !b.level);
  assert.ok(paras.some((p) => p.text.startsWith('Tôi tên là') && p.text.includes('Tôi xin xác nhận')), 'các dòng liền nhau gộp thành một đoạn');
  assert.ok(paras.some((p) => p.text.startsWith('Đoạn thứ hai')), 'khoảng trống lớn tách đoạn');
  const tbl = lay.blocks.find((b) => b.type === 'table');
  assert.ok(tbl, 'phải dò ra bảng');
  assert.equal(tbl.rows.length, 4);
  assert.deepEqual(tbl.rows[1], ['1', 'Giấy A4', '10', '1.500.000']);
  const ys = lay.blocks.map((b) => b.y0);
  assert.deepEqual(ys, ys.slice().sort((a, b) => a - b), 'thứ tự đọc theo chiều dọc');
  const last = lay.blocks[lay.blocks.length - 1];
  assert.equal(last.type, 'para');
  assert.equal(last.align, 'right', 'dòng ngày tháng căn phải');
  assert.match(layoutToText(lay), /Giấy A4\t10\t1\.500\.000/);
});

test('layout: bỏ từ độ tin cậy thấp và nhiễu gạch dọc; hai cột chữ đọc hết cột trái trước', () => {
  const w = [...line('ok', 100, 100), { text: '|', x0: 300, y0: 90, x1: 306, y1: 140, conf: 90 }, ...line('rác', 400, 100, 26, 10)];
  const lay = layoutPage({ words: w, width: 1000, height: 1000 });
  assert.equal(lay.blocks.map((b) => b.text).join('|'), 'ok');
  const cols = [];
  for (let i = 0; i < 10; i++) { cols.push(...line('nội dung cột trái ở dòng ' + i, 80, 100 + i * 36)); cols.push(...line('nội dung cột phải ở dòng ' + i, 520, 100 + i * 36)); }
  const t = layoutToText(layoutPage({ words: cols, width: 1000, height: 1000 }));
  assert.ok(t.indexOf('trái ở dòng 9') < t.indexOf('phải ở dòng 0'), t);
});

test('parseVnNumber: số Việt, giữ nguyên mã có số 0 đầu và số dài', () => {
  assert.equal(parseVnNumber('1.500.000'), 1500000);
  assert.equal(parseVnNumber('3,5'), 3.5);
  assert.equal(parseVnNumber('0,25'), 0.25);
  assert.equal(parseVnNumber('2026'), 2026);
  assert.equal(parseVnNumber('0912345678'), null);
  assert.equal(parseVnNumber('079085001234'), null);
  assert.equal(parseVnNumber('12.34'), null);
  assert.equal(parseVnNumber('abc'), null);
});

test('docx: cấu trúc OOXML hợp lệ, đọc lại đúng nội dung, tiêu đề, bảng, ảnh kèm theo', async () => {
  const lay = layoutPage(samplePage());
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const bytes = await buildDocx([lay, { blocks: [{ type: 'para', text: 'Trang hai & <đặc biệt> "ký tự"', align: 'left', size: 13, level: 0, bold: false, indent: 0 }], margins: lay.margins, bodySize: lay.bodySize }], { title: 'Hồ sơ "mẫu"', images: [{ bytes: jpeg, w: 1000, h: 1400 }] });
  const files = await readZip(bytes);
  const names = files.map((f) => f.name);
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'word/media/trang1.jpg', 'docProps/core.xml']) assert.ok(names.includes(n), 'thiếu ' + n);
  const get = (n) => new TextDecoder().decode(files.find((f) => f.name === n).data);
  for (const f of files.filter((x) => /\.(xml|rels)$/.test(x.name))) checkXml(new TextDecoder().decode(f.data), f.name);
  const doc = get('word/document.xml');
  const text = xmlText(doc);
  assert.match(text, /GIẤY XÁC NHẬN/);
  assert.match(text, /Tôi tên là Nguyễn Văn An/);
  assert.match(text, /Bút bi xanh/);
  assert.match(text, /Trang hai & <đặc biệt> "ký tự"/);
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(doc, /<w:tbl>/);
  assert.equal((doc.match(/<w:tr>/g) || []).length, 4);
  assert.match(doc, /<w:jc w:val="center"\/>/);
  assert.match(doc, /<w:pageBreakBefore\/>/);
  assert.match(doc, /r:embed="rIdImg1"/);
  assert.match(get('word/_rels/document.xml.rels'), /Id="rIdImg1"[^>]*media\/trang1\.jpg/);
  assert.match(get('docProps/core.xml'), /Hồ sơ &quot;mẫu&quot;/);
  assert.deepEqual([...files.find((f) => f.name === 'word/media/trang1.jpg').data], [...jpeg]);
});

test('docx: loại ký tự điều khiển không hợp lệ khỏi XML', async () => {
  const b = await buildDocx([{ blocks: [{ type: 'para', text: 'a\u0001b\u000bc', align: 'left', size: 13, level: 0, bold: false, indent: 0 }] }]);
  const doc = new TextDecoder().decode((await readZip(b)).find((f) => f.name === 'word/document.xml').data);
  checkXml(doc, 'document.xml');
  assert.match(xmlText(doc), /abc/);
});

test('xlsx: bảng thành ô, số Việt thành số, mã điện thoại giữ chuỗi, nhiều trang thành nhiều sheet', async () => {
  const lay = layoutPage(samplePage());
  const tabs = tablesForSheet(lay);
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].approx, false);
  const bytes = await buildXlsx([
    { name: 'Trang 1 - Bảng 1', rows: tabs[0].rows, headerRow: true },
    { name: 'Trang 2', rows: [['Điện thoại', '0912345678'], ['Ghi chú', 'a & b <c>']] },
  ], { title: 'Bảng mẫu' });
  const files = await readZip(bytes);
  const get = (n) => new TextDecoder().decode(files.find((f) => f.name === n).data);
  for (const f of files.filter((x) => /\.(xml|rels)$/.test(x.name))) checkXml(new TextDecoder().decode(f.data), f.name);
  const wb = get('xl/workbook.xml');
  assert.match(wb, /name="Trang 1 - Bảng 1"/);
  assert.match(wb, /name="Trang 2"/);
  const s1 = get('xl/worksheets/sheet1.xml');
  assert.match(s1, /<c r="D2" s="1"><v>1500000<\/v><\/c>/);
  assert.match(s1, /<c r="B3" s="1" t="inlineStr"><is><t xml:space="preserve">Bút bi xanh<\/t><\/is><\/c>/);
  assert.match(s1, /<c r="A1" s="2" t="inlineStr">/, 'hàng tiêu đề in đậm');
  const s2 = get('xl/worksheets/sheet2.xml');
  assert.match(s2, /<c r="B1" s="1" t="inlineStr"><is><t xml:space="preserve">0912345678</);
  assert.match(s2, /a &amp; b &lt;c&gt;/);
  assert.equal(colName(0), 'A'); assert.equal(colName(25), 'Z'); assert.equal(colName(26), 'AA');
});

test('xlsx: không có bảng thì mỗi dòng chữ thành một hàng, đánh dấu gần đúng; tên sheet trùng/ký tự cấm được xử lý', async () => {
  const lay = layoutPage({ words: [...line('Dòng một   hai', 100, 100), ...line('Dòng hai', 100, 160)], width: 1000, height: 1000 });
  const tabs = tablesForSheet(lay);
  assert.equal(tabs[0].approx, true);
  assert.equal(tabs[0].rows.length, 2);
  const b = await buildXlsx([{ name: 'a/b:c', rows: [['x']] }, { name: 'a b c', rows: [['y']] }, { name: 'A B C', rows: [['z']] }]);
  const wb = new TextDecoder().decode((await readZip(b)).find((f) => f.name === 'xl/workbook.xml').data);
  const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 3);
  assert.ok(names.every((n) => !/[\\/?*[\]:]/.test(n)));
  assert.ok(groupLines([]).length === 0);
});
