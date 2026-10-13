import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, questions } from './helpers.mjs';

const raw = JSON.parse(fs.readFileSync(path.join(root, 'tools/source/questions.raw.json'), 'utf8'));
const tips = JSON.parse(fs.readFileSync(path.join(root, 'data/tips.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(root, 'data/meta.json'), 'utf8'));

test('đơn vị: "cm 3" đã thành cm³, chỉ đúng 5 câu đổi cách viết, đáp án và nghĩa không đổi so với bản trích từ PDF', () => {
  const all = JSON.stringify(questions);
  assert.ok(!/cm 3|cm3/.test(all), 'còn "cm 3"');
  assert.ok(all.includes('cm³'));
  const norm = (t) => t.replace(/(cm|dm|mm|km) ?([23²³])/g, (m, u, n) => u + ({ '²': '2', '³': '3' }[n] || n));
  for (const [i, q] of questions.entries()) {
    assert.equal(q.a, raw[i].a, 'đổi đáp án ở câu ' + q.id);
    assert.equal(q.opts.length, raw[i].opts.length);
    assert.equal(norm(q.q), norm(raw[i].q));
    q.opts.forEach((o, k) => assert.equal(norm(o), norm(raw[i].opts[k]), 'đổi nội dung ở câu ' + q.id));
  }
  const changed = questions.filter((q, i) => JSON.stringify([q.q, q.opts]) !== JSON.stringify([raw[i].q, raw[i].opts])).map((q) => q.id);
  assert.deepEqual(changed, [119, 123, 124, 125, 126]);
});

test('mẹo "Cả hai/ba ý trên": số liệu trong mẹo khớp dữ liệu thật', () => {
  const re = /^Cả (hai|ba) ý trên\.?$/;
  const has = questions.filter((q) => q.opts.some((o) => re.test(o)));
  const ok = has.filter((q) => re.test(q.opts[q.a]));
  const t = tips.chu_de.find((x) => x.id === 'thieu-tuy-tien');
  assert.ok(t.noi_dung.includes(`${has.length} câu`) && t.noi_dung.includes(`${ok.length} câu`), `cần ${has.length} và ${ok.length}`);
  assert.ok(ok.length / has.length > 0.6 && ok.length / has.length < 0.7);
  assert.ok(!/chưa đến một nửa/.test(t.noi_dung));
});

test('mẹo gắn theo chủ đề: mỗi câu được gắn đều có từ khóa của chủ đề (không gắn lệch)', () => {
  const kw = {
    'ruou-bia': /cồn|rượu|bia|ma túy/i,
    'khong-duoc-vuot': /vượt/i,
    'nhuong-duong': /nhường|người đi bộ|vạch kẻ|đường nhánh|dốc|vòng xuyến|giao nhau|đường chính/i,
    'xe-may': /xe mô tô|xe gắn máy|người được chở|xe máy/i,
    'dien-thoai': /điện thoại/i,
    'lui-xe': /lùi|quay đầu/i,
    'phanh-ga': /phanh|ga/i,
    'troi-mua': /mưa|trơn|đường vòng|dốc/i,
    'cau-hep-duong-cong': /tầm nhìn|biển báo nguy hiểm|xe buýt|đường cong|chướng ngại|người đi bộ|phía trước/i,
    'bien-bao-nhom': /biển báo/i,
  };
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const t of tips.chu_de) {
    if (!kw[t.id]) continue;
    for (const id of t.ids) {
      const q = byId.get(id);
      assert.ok(kw[t.id].test(q.q + ' ' + q.opts.join(' ')), `mẹo ${t.id} gắn lệch vào câu ${id}: ${q.q.slice(0, 60)}`);
    }
  }
  const nd = tips.chu_de.find((x) => x.id === 'nhuong-duong');
  assert.ok(!nd.ids.includes(87), 'câu 87 (tránh xe ngược chiều) không thuộc mẹo nhường đường');
});

test('nguồn tái lập: meta và README có link PDF nguồn + SHA-256, ghi rõ không đính kèm PDF', () => {
  assert.match(meta.bo_cau_hoi.pdf_sha256, /^[0-9a-f]{64}$/);
  assert.match(meta.bo_cau_hoi.pdf_url, /^https:\/\//);
  assert.ok(meta.bo_cau_hoi.pdf_ghi_chu.includes('không đính kèm'));
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(readme.includes(meta.bo_cau_hoi.pdf_sha256));
  assert.ok(readme.includes(meta.bo_cau_hoi.pdf_url));
  assert.ok(readme.includes('không đính kèm'));
  assert.ok(!fs.readdirSync(path.join(root, 'tools/source')).some((f) => f.endsWith('.pdf')), 'không lưu PDF trong repo');
});
