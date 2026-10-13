import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as labels from '../src/labels.js';

const require = createRequire(import.meta.url);
const CODE128B = require('jsbarcode/bin/barcodes/CODE128/CODE128B.js').default || require('jsbarcode/bin/barcodes/CODE128/CODE128B.js');

// Nhị phân của jsbarcode -> chuỗi độ rộng các vạch/khoảng trắng liên tiếp (cùng dạng với bộ mã hóa của ta).
function widthsFromBinary(bin) {
  const out = [];
  let run = 1;
  for (let i = 1; i < bin.length; i++) {
    if (bin[i] === bin[i - 1]) run += 1; else { out.push(run); run = 1; }
  }
  out.push(run);
  return out.join('');
}

test('Code128: mọi mẫu có tổng 11 module, tổng vạch chẵn, không trùng', () => {
  const seen = new Set();
  for (let v = 0; v < 95; v++) {
    const ch = String.fromCharCode(32 + v);
    const w = labels.code128Widths(ch).slice(6, 12);
    assert.equal(w.split('').reduce((a, b) => a + Number(b), 0), 11, 'tổng 11 module');
    assert.equal((Number(w[0]) + Number(w[2]) + Number(w[4])) % 2, 0, 'tổng vạch chẵn');
    assert.ok(!seen.has(w), 'trùng mẫu ' + w);
    seen.add(w);
  }
});

test('Code128: khớp bộ mã hóa jsbarcode trên các chuỗi mẫu', () => {
  for (const text of ['MK100001', 'GHN123456789', 'A', 'Hello World', '9S-ABC123', '~}{|']) {
    const ref = new CODE128B(text, {}).encode().data;
    assert.equal(labels.code128Widths(text), widthsFromBinary(ref), 'khác nhau với ' + text);
  }
});

test('ký và xác minh link nhãn; hết hạn và sai chữ ký bị từ chối', () => {
  const t = labels.signLabel('abc-123', 60, 1_000_000);
  assert.equal(labels.verifyLabel(t, 1_000_000 + 30_000), 'abc-123');
  assert.equal(labels.verifyLabel(t, 1_000_000 + 61_000), null);
  assert.equal(labels.verifyLabel(t.slice(0, -2) + 'xx', 1_000_000), null);
  assert.equal(labels.verifyLabel('rác', 1_000_000), null);
  assert.equal(labels.verifyLabel('', 1_000_000), null);
});

test('nhãn escape HTML, có mã vận đơn và mã vạch', async () => {
  const html = await labels.render({
    id: '11111111-2222-3333-4444-555555555555', tracking_code: 'MK100001', carrier: 'mock-nhanh', goods_type: 'general',
    weight_g: 1500, created_at: new Date().toISOString(),
    sender: { contact: '<script>alert(1)</script>', phone: '0900000000', street: '1 A', province: 'ha-noi', provinceName: 'Hà Nội' },
    receiver: { contact: 'B"><img src=x onerror=1>', phone: '0911111111', street: '2 B', province: 'hue', provinceName: 'Huế' },
  }, { carrierName: 'Mock Nhanh', pickupPoint: { name: 'Bưu cục <b>1</b>', address: 'X' } });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('MK100001'));
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('size: 100mm 150mm'));
  assert.ok(html.includes('&lt;b&gt;1&lt;/b&gt;'));
});

test('nhãn chưa có mã vận đơn thì lỗi', async () => {
  await assert.rejects(labels.render({ id: 'x', carrier: 'c', created_at: new Date().toISOString(), weight_g: 1, sender: {}, receiver: {} }), /chưa có mã/);
});
