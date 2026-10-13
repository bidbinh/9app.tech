// Nhận khung tài liệu trực tiếp trên hình camera: vẽ viền xanh, và (nếu bật "Tự chụp") tự bấm chụp khi khung đứng yên.
import { detectDocument } from './edges.js';
import { StableTracker } from './stable.js';
import { makeCanvas } from './render.js';

const EDGE = 300;

export class LiveDetect {
  /** opts: { video, canvas (lớp vẽ viền), status (phần tử chữ), onFire(), auto() -> boolean } */
  constructor(opts) {
    Object.assign(this, opts);
    this.tracker = new StableTracker();
    this.timer = null;
    this.busy = false;
    this.work = null;
    this.last = null;
  }

  start() { this.stop(); this.tracker.reset(); this.timer = setInterval(() => this.tick(), 420); }

  stop() {
    clearInterval(this.timer); this.timer = null;
    this.clear();
    if (this.status) this.status.hidden = true;
  }

  clear() {
    const c = this.canvas;
    if (c) { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); }
  }

  tick() {
    const v = this.video;
    if (this.busy || !v || !v.videoWidth || v.readyState < 2) return;
    this.busy = true;
    try {
      const s = EDGE / Math.max(v.videoWidth, v.videoHeight);
      if (!this.work) this.work = makeCanvas(v.videoWidth * s, v.videoHeight * s);
      if (this.work.width !== Math.round(v.videoWidth * s)) this.work = makeCanvas(v.videoWidth * s, v.videoHeight * s);
      const ctx = this.work.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, this.work.width, this.work.height);
      const img = ctx.getImageData(0, 0, this.work.width, this.work.height);
      const r = detectDocument(img, { maxEdge: EDGE });
      const norm = r.corners.map((p) => ({ x: p.x / this.work.width, y: p.y / this.work.height }));
      const sure = r.found && r.score >= 0.7;
      this.last = { corners: norm, sure };
      const auto = this.auto ? this.auto() : false;
      const t = this.tracker.push(sure ? norm : null);
      this.draw(norm, sure, auto ? t.progress : 0);
      this.say(sure, auto, t.progress);
      if (auto && t.fire && this.onFire) this.onFire();
    } catch (e) { /* bỏ qua một khung lỗi */ }
    this.busy = false;
  }

  say(sure, auto, progress) {
    const el = this.status;
    if (!el) return;
    if (!sure) { el.hidden = false; el.textContent = 'Đưa tờ giấy vào khung, nền tương phản với giấy sẽ dễ nhận hơn'; return; }
    el.hidden = false;
    el.textContent = auto ? (progress >= 1 ? 'Đang chụp…' : 'Giữ yên máy để tự chụp') : 'Đã nhận khung tài liệu';
  }

  // đổi tọa độ video (object-fit: cover) sang tọa độ vùng hiển thị
  draw(norm, sure, progress) {
    const c = this.canvas, v = this.video;
    const cw = c.clientWidth, ch = c.clientHeight;
    if (!cw || !ch) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, cw, ch);
    const k = Math.max(cw / v.videoWidth, ch / v.videoHeight);
    const ox = (cw - v.videoWidth * k) / 2, oy = (ch - v.videoHeight * k) / 2;
    const pts = norm.map((p) => ({ x: ox + p.x * v.videoWidth * k, y: oy + p.y * v.videoHeight * k }));
    x.lineJoin = 'round';
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath();
    x.fillStyle = sure ? 'rgba(34,197,94,0.18)' : 'rgba(250,204,21,0.10)'; x.fill();
    x.lineWidth = 3; x.strokeStyle = sure ? '#22c55e' : '#facc15'; x.stroke();
    if (sure) for (const p of pts) { x.beginPath(); x.arc(p.x, p.y, 6, 0, 7); x.fillStyle = '#22c55e'; x.fill(); }
    if (progress > 0 && progress < 1) {
      x.beginPath(); x.arc(cw / 2, ch / 2, 28, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      x.lineWidth = 5; x.strokeStyle = '#fff'; x.stroke();
    }
  }
}
