import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf, pageBox, A4 } from '../js/pdf.js';
import { parsePdf, fakeJpeg } from './helpers/pdfparse.js';

test('PDF 1 trang: cấu trúc, xref, stream và ảnh hợp lệ', () => {
  const jpeg = fakeJpeg(321);
  const box = pageBox(1000, 1414, 'a4');
  const pdf = buildPdf([{ jpeg, imgW: 1000, imgH: 1414, ...box }], { title: 'Hồ sơ xin việc' });
  const r = parsePdf(pdf);
  assert.equal(r.pages.length, 1);
  assert.deepEqual(r.pages[0].mediaBox.map((v) => Math.round(v)), [595, 842]);
  assert.equal(r.pages[0].jpeg.length, 321);
  assert.equal(r.pages[0].imgW, 1000);
  assert.equal(r.producer, '9scanner');
  assert.match(r.pages[0].content, /\/Im0 Do/);
});

test('PDF nhiều trang với ảnh khác kích thước và khổ khác nhau', () => {
  const pages = [
    { jpeg: fakeJpeg(50), imgW: 800, imgH: 1100, ...pageBox(800, 1100, 'a4') },
    { jpeg: fakeJpeg(60), imgW: 1200, imgH: 800, ...pageBox(1200, 800, 'a4') },
    { jpeg: fakeJpeg(70), imgW: 500, imgH: 500, ...pageBox(500, 500, 'fit') },
  ];
  const r = parsePdf(buildPdf(pages));
  assert.equal(r.pages.length, 3);
  assert.ok(r.pages[1].mediaBox[0] > r.pages[1].mediaBox[1], 'ảnh ngang -> trang ngang');
  assert.ok(Math.abs(r.pages[2].mediaBox[0] - r.pages[2].mediaBox[1]) < 0.01, 'giữ tỉ lệ vuông');
  assert.deepEqual(r.pages.map((p) => p.jpeg.length), [50, 60, 70]);
});

test('pageBox: ảnh nằm gọn và căn giữa trong A4; không tràn lề', () => {
  const b = pageBox(1000, 2000, 'a4', 10);
  assert.ok(b.x >= 10 - 1e-6 && b.y >= 10 - 1e-6);
  assert.ok(b.x + b.w <= A4.w - 10 + 1e-6 && b.y + b.h <= A4.h - 10 + 1e-6);
  assert.ok(Math.abs(b.w / b.h - 0.5) < 1e-6);
  const custom = pageBox(354, 472, { w: 100 * 72 / 25.4, h: 150 * 72 / 25.4 }, 0);
  assert.ok(Math.abs(custom.pageW - 283.46) < 0.01);
});

test('PDF có lớp chữ OCR: có font Type0, ToUnicode chứa ký tự tiếng Việt, Tj theo đúng từ', () => {
  const words = [
    { text: 'Cộng', x0: 100, y0: 100, x1: 220, y1: 140 },
    { text: 'hòa', x0: 240, y0: 100, x1: 330, y1: 140 },
    { text: 'Đường', x0: 100, y0: 160, x1: 260, y1: 200 },
  ];
  const pdf = buildPdf([{ jpeg: fakeJpeg(80), imgW: 1000, imgH: 1414, ...pageBox(1000, 1414, 'a4'), words }]);
  const r = parsePdf(pdf);
  const text = Buffer.from(pdf).toString('latin1');
  assert.match(text, /\/Subtype \/Type0/);
  assert.match(r.pages[0].content, /3 Tr/);
  assert.equal((r.pages[0].content.match(/ Tj/g) || []).length, 3);
  // ToUnicode: ò = U+00F2, Đ = U+0110, ộ = U+1ED9, ờ = U+1EDD phải xuất hiện
  const cmap = Object.values(r.objs).find((o) => o.stream && /beginbfchar/.test(o.stream.toString('latin1')));
  const cm = cmap.stream.toString('latin1');
  for (const u of ['00F2', '0110', '1ED9', '1EDD']) assert.ok(cm.includes(`<${u}>`), `thiếu ${u}`);
});

test('PDF rỗng bị từ chối', () => {
  assert.throws(() => buildPdf([]));
});

test('Tiêu đề tiếng Việt được mã hóa UTF-16BE trong Info', () => {
  const pdf = buildPdf([{ jpeg: fakeJpeg(40), imgW: 10, imgH: 10, ...pageBox(10, 10, 'a4') }], { title: 'Đơn' });
  const t = Buffer.from(pdf).toString('latin1');
  assert.match(t, /\/Title <FEFF011001A1006E>/);
});
