import test from 'node:test';
import assert from 'node:assert/strict';
import { safeName, filterWords, avgConfidence } from '../js/textutil.js';
import { setJfifDpi, readJfifDensity } from '../js/jpeg.js';
import { fitScale, toUnits, toPixels } from '../js/signmath.js';
import { rotateSigns } from '../js/geom.js';
import { buildPdf, pageBox } from '../js/pdf.js';
import { parsePdf, fakeJpeg } from './helpers/pdfparse.js';

test('safeName: tên dành riêng Windows, dấu chấm cuối, cắt không đứt cặp surrogate', () => {
  assert.equal(safeName('CON'), '_CON');
  assert.equal(safeName('com1.txt'), '_com1.txt');
  assert.equal(safeName('Hóa đơn.  '), 'Hóa đơn');
  assert.equal(safeName('a/b:c*d'), 'abcd');
  assert.equal(safeName('...'), 'tai-lieu');
  const long = '😀'.repeat(100);
  const out = safeName(long);
  assert.equal(Array.from(out).length, 80);
  assert.ok(!/[\ud800-\udbff]$/.test(out), 'không kết thúc bằng nửa cặp surrogate');
});

test('filterWords bỏ từ độ tin cậy thấp; avgConfidence', () => {
  const w = [{ text: 'a', conf: 90 }, { text: 'b', conf: 20 }, { text: 'c' }];
  assert.deepEqual(filterWords(w).map((x) => x.text), ['a', 'c']);
  assert.equal(avgConfidence([{ confidence: 80 }, { confidence: 60 }, null]), 70);
  assert.equal(avgConfidence([]), null);
});

test('JPEG: ghi JFIF density 300 dpi (có sẵn APP0 và chưa có APP0) rồi đọc lại', () => {
  const withJfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const a = setJfifDpi(withJfif, 300);
  assert.deepEqual(readJfifDensity(a), { units: 1, x: 300, y: 300 });
  assert.equal(a.length, withJfif.length);
  const noJfif = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xd9]);
  const b = setJfifDpi(noJfif, 300);
  assert.deepEqual(readJfifDensity(b), { units: 1, x: 300, y: 300 });
  assert.equal(b.length, noJfif.length + 18);
  assert.deepEqual(Array.from(b.slice(-8)), Array.from(noJfif.slice(-8)));
  assert.throws(() => setJfifDpi(new Uint8Array([1, 2, 3])));
});

test('signmath: nét lưu theo đơn vị; xoay dọc -> ngang giữ đúng hình, ngang -> dọc co lại cho vừa', () => {
  const strokes = [{ pts: [{ x: 0.2, y: 0.5 }, { x: 2.4, y: 0.6 }] }]; // rộng 2,4 lần chiều cao
  // ngang 700x220: vừa
  assert.equal(fitScale(strokes, 700, 220), 1);
  // dọc 358x220: tối đa 1.6 đơn vị -> phải co
  const k = fitScale(strokes, 358, 220);
  assert.ok(k < 0.7 && k > 0.5, String(k));
  assert.ok(toPixels(2.4, 220, k) <= 358);
  // vòng đổi điểm ảnh <-> đơn vị
  assert.ok(Math.abs(toUnits(toPixels(1.3, 220, k), 220, k) - 1.3) < 1e-9);
  assert.equal(fitScale([], 100, 100), 1);
});

test('rotateSigns: xoay 90 rồi 270 trở lại; chữ ký ở góc dưới-phải sang góc đúng', () => {
  const s = [{ sigId: 'x', cx: 0.8, cy: 0.9, w: 0.3 }];
  const r = rotateSigns(s, 90, 0.7); // trang dọc rộng/cao = 0.7
  assert.ok(Math.abs(r[0].cx - 0.1) < 1e-9 && Math.abs(r[0].cy - 0.8) < 1e-9);
  assert.ok(Math.abs(r[0].w - 0.21) < 1e-9);
  const back = rotateSigns(r, 270, 1 / 0.7);
  assert.ok(Math.abs(back[0].cx - 0.8) < 1e-9 && Math.abs(back[0].cy - 0.9) < 1e-9 && Math.abs(back[0].w - 0.3) < 1e-9);
  assert.deepEqual(rotateSigns(s, 0, 1)[0], s[0]);
  assert.equal(rotateSigns(undefined, 90, 1).length, 0);
});

test('Lớp chữ PDF: ký tự đặc biệt \ ( ) không làm hỏng PDF (dùng chuỗi hex)', () => {
  const words = [{ text: 'a\\b', x0: 10, y0: 10, x1: 80, y1: 40 }, { text: '(x)', x0: 100, y0: 10, x1: 160, y1: 40 }];
  const pdf = buildPdf([{ jpeg: fakeJpeg(60), imgW: 500, imgH: 700, ...pageBox(500, 700, 'a4'), words }]);
  const r = parsePdf(pdf);
  assert.equal((r.pages[0].content.match(/ Tj/g) || []).length, 2);
  assert.ok(!r.pages[0].content.split('BT')[1].includes('(x)'), 'nội dung chữ phải ở dạng hex');
});
