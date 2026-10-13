// Bảng vẽ chữ ký: nét mượt (đường cong bậc hai qua trung điểm), xóa/hoàn tác, xuất PNG nền trong suốt đã cắt sát nét.
import { makeCanvas, canvasToBlob } from './render.js';
import { fitScale, toUnits, toPixels } from './signmath.js';

export class SignPad {
  constructor(canvas, { color = '#111827' } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.color = color; this.strokes = []; this.cur = null; this.k = 1;
    this.fit();
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    const up = (e) => this.up(e);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.style.touchAction = 'none';
    // đổi cỡ/xoay màn hình: cỡ bộ đệm theo cỡ hiển thị rồi vẽ lại từ tọa độ lưu theo đơn vị
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(canvas);
    window.addEventListener('orientationchange', () => setTimeout(() => this.fit(), 150));
  }

  /** Đặt kích thước bộ đệm theo kích thước hiển thị (nét nét hơn trên màn hình độ phân giải cao). */
  fit() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width <= 0) return;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.k = fitScale(this.strokes, w, h);
      this.redraw();
    }
  }

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const H = this.canvas.height;
    return { x: toUnits(((e.clientX - r.left) / r.width) * this.canvas.width, H, this.k), y: toUnits(((e.clientY - r.top) / r.height) * H, H, this.k) };
  }
  lineWidth() { return Math.max(3, this.canvas.height * 0.03 * this.k); }

  down(e) {
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
    this.cur = { color: this.color, pts: [this.pos(e)] };
    this.strokes.push(this.cur);
    this.redraw();
  }
  move(e) {
    if (!this.cur) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) this.cur.pts.push(this.pos(ev));
    this.redraw();
  }
  up() { this.cur = null; if (this.onChange) this.onChange(); }

  drawStroke(s) {
    const ctx = this.ctx, H = this.canvas.height, k = this.k;
    const p = s.pts.map((q) => ({ x: toPixels(q.x, H, k), y: toPixels(q.y, H, k) }));
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = this.lineWidth();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }
  redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const s of this.strokes) this.drawStroke(s);
  }
  setColor(c) { this.color = c; }
  clear() { this.strokes = []; this.cur = null; this.redraw(); if (this.onChange) this.onChange(); }
  undo() { this.strokes.pop(); this.redraw(); if (this.onChange) this.onChange(); }
  get empty() { return this.strokes.length === 0; }

  /** PNG nền trong suốt, cắt sát nét vẽ (chừa lề nhỏ). null nếu chưa vẽ. */
  async toBlob() {
    if (this.empty) return null;
    const { width: W, height: H } = this.canvas;
    const d = this.ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < x0) return null;
    const pad = Math.round(this.lineWidth());
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext('2d').drawImage(this.canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return canvasToBlob(out, 'image/png');
  }
}
