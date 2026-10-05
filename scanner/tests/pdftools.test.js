import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPdfLibNode, pdfTexts } from './helpers/libs.js';
import { mergePdfs, arrangePdf, splitPdf, parseRanges, compressPdf, stampPdf, protectPdf, pageCount } from '../js/pdftools.js';
import { md5, rc4 } from '../js/pdfcrypt.js';

const L = loadPdfLibNode();
const hexOf = (u) => Buffer.from(u).toString('hex');

async function makePdf(label, n) {
  const doc = await L.PDFDocument.create();
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = doc.addPage([420, 595]);
    p.drawText(`${label} page ${i}`, { x: 50, y: 500, size: 24, font });
  }
  return doc.save();
}

test('md5 và rc4 đúng với vector chuẩn', () => {
  assert.equal(hexOf(md5(new TextEncoder().encode(''))), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(hexOf(md5(new TextEncoder().encode('abc'))), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(hexOf(md5(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))), '9e107d9d372bb6826bd81d3542a419d6');
  assert.equal(hexOf(rc4(new TextEncoder().encode('Key'), new TextEncoder().encode('Plaintext'))), 'bbf316e8d940af0ad3');
});

test('parseRanges: dải, trang lẻ, mở đầu/cuối, trùng lặp và lỗi', () => {
  assert.deepEqual(parseRanges('1-3, 5', 10), [0, 1, 2, 4]);
  assert.deepEqual(parseRanges('8-', 10), [7, 8, 9]);
  assert.deepEqual(parseRanges('-2', 10), [0, 1]);
  assert.deepEqual(parseRanges('3,3,2-3', 10), [2, 1]);
  assert.deepEqual(parseRanges('3-1', 5), [2, 1, 0]);
  assert.throws(() => parseRanges('11', 10), /ngoài tệp/);
  assert.throws(() => parseRanges('a', 10), /không phải số trang/);
  assert.throws(() => parseRanges('', 10), /nhập số trang/);
  assert.throws(() => parseRanges('0', 10), /ngoài tệp/);
});

test('gộp PDF: đúng số trang, đúng thứ tự và nội dung', async () => {
  const a = await makePdf('Alpha', 2), b = await makePdf('Beta', 3);
  const m = await mergePdfs([{ name: 'a.pdf', bytes: a }, { name: 'b.pdf', bytes: b }]);
  assert.equal(await pageCount(m), 5);
  const t = await pdfTexts(m);
  assert.deepEqual(t, ['Alpha page 1', 'Alpha page 2', 'Beta page 1', 'Beta page 2', 'Beta page 3']);
});

test('sắp xếp/xóa/xoay trang và tách tệp', async () => {
  const src = await makePdf('Doc', 5);
  const out = await arrangePdf(src, [{ index: 4 }, { index: 0, rotate: 90 }, { index: 2 }]);
  assert.deepEqual(await pdfTexts(out), ['Doc page 5', 'Doc page 1', 'Doc page 3']);
  const doc = await L.PDFDocument.load(out);
  assert.deepEqual(doc.getPages().map((p) => p.getRotation().angle), [0, 90, 0]);
  const parts = await splitPdf(src, [[0, 1], [2], [3, 4]]);
  assert.deepEqual(await Promise.all(parts.map((p) => pageCount(p))), [2, 1, 2]);
  assert.deepEqual(await pdfTexts(parts[2]), ['Doc page 4', 'Doc page 5']);
  await assert.rejects(() => arrangePdf(src, []), /Chưa chọn trang/);
});

test('tệp hỏng hoặc không phải PDF cho thông báo tiếng Việt', async () => {
  await assert.rejects(() => mergePdfs([{ name: 'x.pdf', bytes: new TextEncoder().encode('khong phai pdf') }]), /Không đọc được “x.pdf”/);
});

test('đóng dấu chữ: ảnh PNG được vẽ lên mọi trang', async () => {
  const src = await makePdf('Stamp', 2);
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const out = await stampPdf(src, { png, aspect: 4, position: 'center', opacity: 0.4 });
  const doc = await L.PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 2);
  const xo = doc.getPages().map((p) => p.node.Resources().lookup(L.PDFName.of('XObject')));
  assert.ok(xo.every((x) => x && x.keys().length === 1));
  assert.deepEqual(await pdfTexts(out), ['Stamp page 1', 'Stamp page 2']);
});

test('nén ảnh trong PDF: thay JPEG lớn bằng JPEG nhỏ, giữ chữ', async () => {
  const doc = await L.PDFDocument.create();
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  const p = doc.addPage([400, 400]);
  p.drawText('Giu chu', { x: 20, y: 300, size: 20, font });
  const big = new Uint8Array(200000).fill(7);
  const dict = doc.context.obj({ Type: 'XObject', Subtype: 'Image', Width: 3000, Height: 2000, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode', Length: big.length });
  const ref = doc.context.register(L.PDFRawStream.of(dict, big));
  p.node.Resources().set(L.PDFName.of('XObject'), doc.context.obj({ Im0: ref }));
  const src = await doc.save();
  const calls = [];
  const r = await compressPdf(src, 'medium', async (bytes, cfg) => { calls.push(cfg); return { bytes: new Uint8Array(30000).fill(9), width: 1700, height: 1133 }; });
  assert.equal(r.replaced, 1);
  assert.ok(r.bytes.length < src.length - 150000, `${r.bytes.length} vs ${src.length}`);
  assert.equal(calls[0].maxEdge, 1700);
  const back = await L.PDFDocument.load(r.bytes);
  const img = [...back.context.enumerateIndirectObjects()].map(([, o]) => o).find((o) => o.dict && o.dict.get(L.PDFName.of('Subtype')) === L.PDFName.of('Image'));
  assert.equal(img.dict.get(L.PDFName.of('Width')).asNumber(), 1700);
  assert.deepEqual(await pdfTexts(r.bytes), ['Giu chu']);
  const r2 = await compressPdf(src, 'light', async () => ({ bytes: new Uint8Array(199000), width: 10, height: 10 }));
  assert.equal(r2.replaced, 0);
});

test('đặt mật khẩu: mở đúng với mật khẩu, sai mật khẩu bị từ chối, chữ vẫn đọc được', async () => {
  const src = await makePdf('Bi mat', 3);
  const enc = await protectPdf(src, 'matkhau123');
  const s = Buffer.from(enc).toString('latin1');
  assert.match(s, /\/Encrypt \d+ 0 R/);
  assert.match(s, /\/CFM \/AESV2/);
  assert.deepEqual(await pdfTexts(enc, 'matkhau123'), ['Bi mat page 1', 'Bi mat page 2', 'Bi mat page 3']);
  await assert.rejects(() => pdfTexts(enc, 'saimatkhau'), /password/i);
  await assert.rejects(() => pdfTexts(enc), /password/i);
  await assert.rejects(() => protectPdf(enc, 'x'), /đã có mật khẩu/);
  await assert.rejects(() => mergePdfs([{ name: 'k.pdf', bytes: enc }]), /có mật khẩu/);
  await assert.rejects(() => protectPdf(src, 'mậtkhẩu'), /chữ không dấu/);
  const enc2 = await protectPdf(src, 'P@ss w0rd!');
  assert.equal((await pdfTexts(enc2, 'P@ss w0rd!')).length, 3);
});
