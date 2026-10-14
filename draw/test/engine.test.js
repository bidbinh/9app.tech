import test from 'node:test';
import assert from 'node:assert/strict';
import { W, FORMATS, BGS, drawStroke, drawSeg, drawTail, replay, parseDoc, serializeDoc } from '../js/lib/engine.js';

function fakeCtx() {
  const log = [];
  const c = new Proxy({}, {
    get(t, k) { return k in t ? t[k] : (...a) => { log.push([k, ...a]); }; },
    set(t, k, v) { t[k] = v; return true; },
  });
  c.log = log;
  return c;
}
const ops = (c, name) => c.log.filter((l) => l[0] === name);

test('khổ giấy rộng 1080, tỉ lệ đúng', () => {
  assert.equal(W, 1080);
  assert.equal(FORMATS['4:5'].h, 1350);
  assert.equal(FORMATS['1:1'].h, 1080);
  assert.equal(FORMATS['9:16'].h, 1920);
  for (const k of Object.keys(BGS)) assert.ok(BGS[k].fill);
});

test('một chạm vẽ chấm tròn', () => {
  const c = fakeCtx();
  drawStroke(c, { t: 'pen', c: '#ff0000', w: 10, p: [5, 6] });
  assert.equal(ops(c, 'arc').length, 1);
  assert.equal(c.fillStyle, '#ff0000');
});

test('bút dạ mờ, tẩy dùng destination-out', () => {
  const c = fakeCtx();
  drawStroke(c, { t: 'hl', c: '#facc15', w: 30, p: [0, 0, 10, 10] });
  assert.equal(c.globalAlpha, 0.35);
  const e = fakeCtx();
  drawStroke(e, { t: 'er', c: '#ffffff', w: 30, p: [0, 0, 10, 10] });
  assert.equal(e.globalCompositeOperation, 'destination-out');
  const l = fakeCtx();
  drawStroke(l, { t: 'hl', c: '#facc15', w: 30, p: [0, 0, 10, 10] }, 1);
  assert.equal(l.globalAlpha, 1);
});

test('vẽ từng đoạn + đuôi cùng điểm đầu-cuối với vẽ cả nét', () => {
  const s = { t: 'pen', c: '#000000', w: 4, p: [0, 0, 10, 0, 20, 10, 30, 10] };
  const whole = fakeCtx(); drawStroke(whole, s);
  const inc = fakeCtx();
  for (let k = 1; k < 4; k++) drawSeg(inc, s, k);
  drawTail(inc, s);
  // 2 đoạn cong (k=1,2) + 1 đuôi; cả nét có 2 quad
  assert.equal(ops(inc, 'quadraticCurveTo').length, 2);
  assert.deepEqual(ops(whole, 'quadraticCurveTo'), ops(inc, 'quadraticCurveTo'));
  assert.deepEqual(ops(inc, 'lineTo').at(-1), ['lineTo', 30, 10]);
  assert.deepEqual(ops(whole, 'lineTo').at(-1), ['lineTo', 30, 10]);
});

test('replay bắt đầu sau lần xóa hết gần nhất', () => {
  const c = fakeCtx();
  const a = { t: 'pen', c: '#000000', w: 4, p: [0, 0, 5, 5] };
  replay(c, [a, a, { t: 'clear' }, a], W, 100);
  assert.equal(ops(c, 'stroke').length, 1);
  assert.equal(ops(c, 'clearRect').length, 1);
  const d = fakeCtx();
  replay(d, [a, { t: 'clear' }], W, 100);
  assert.equal(ops(d, 'stroke').length, 0);
});

test('parseDoc bỏ nét hỏng và giới hạn giá trị', () => {
  const d = parseDoc(JSON.stringify({
    fmt: 'xx', bg: 'grid',
    strokes: [
      { t: 'pen', c: '#ABCDEF', w: 5, p: [1, 2, 3, 4] },
      { t: 'pen', c: 'red', w: 5, p: [1, 2] },
      { t: 'zzz', c: '#000000', w: 5, p: [1, 2] },
      { t: 'pen', c: '#000000', w: 5, p: [1, 2, 3] },
      { t: 'pen', c: '#000000', w: 5000, p: [1, 'a'] },
      { t: 'pen', c: '#000000', w: 5000, p: [1, 2] },
      { t: 'clear' },
      null,
    ],
  }));
  assert.equal(d.fmt, '4:5');
  assert.equal(d.bg, 'grid');
  assert.equal(d.strokes.length, 3);
  assert.equal(d.strokes[0].c, '#abcdef');
  assert.equal(d.strokes[1].w, 200);
});

test('parseDoc chịu được dữ liệu rác; serialize khứ hồi', () => {
  assert.deepEqual(parseDoc('không phải json'), { fmt: '4:5', bg: 'white', strokes: [] });
  assert.deepEqual(parseDoc(null).strokes, []);
  const doc = { fmt: '1:1', bg: 'board', strokes: [{ t: 'hl', c: '#facc15', w: 24, p: [1, 2, 3, 4] }, { t: 'clear' }] };
  assert.deepEqual(parseDoc(serializeDoc(doc)), doc);
});
