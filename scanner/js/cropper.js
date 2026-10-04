// Màn hình chỉnh 4 góc: ảnh + đa giác + 4 tay nắm kéo được (có kính lúp khi kéo).
import { isConvexQuad, toPixels } from './geom.js';
import { makeCanvas } from './render.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export class Cropper {
  constructor(stage, { onChange } = {}) {
    this.stage = stage; this.onChange = onChange || (() => {});
    this.corners = []; this.img = null;
    stage.textContent = '';
    this.imgEl = makeCanvas(1, 1); this.imgEl.className = 'crop-img';
    this.svg = document.createElementNS(SVGNS, 'svg'); this.svg.setAttribute('class', 'crop-poly');
    this.poly = document.createElementNS(SVGNS, 'polygon'); this.svg.appendChild(this.poly);
    this.loupe = makeCanvas(104, 104); this.loupe.className = 'crop-loupe'; this.loupe.hidden = true;
    stage.append(this.imgEl, this.svg, this.loupe);
    this.handles = [];
    for (let i = 0; i < 4; i++) {
      const h = document.createElement('div');
      h.className = 'crop-handle'; h.dataset.i = i;
      h.setAttribute('role', 'slider'); h.setAttribute('aria-label', ['Góc trên trái', 'Góc trên phải', 'Góc dưới phải', 'Góc dưới trái'][i]);
      h.tabIndex = 0;
      h.addEventListener('pointerdown', (e) => this.start(e, i));
      h.addEventListener('pointermove', (e) => this.drag(e, i));
      h.addEventListener('pointerup', (e) => this.end(e, i));
      h.addEventListener('pointercancel', (e) => this.end(e, i));
      h.addEventListener('keydown', (e) => this.key(e, i));
      stage.appendChild(h); this.handles.push(h);
    }
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(stage);
  }

  setImage(canvas, corners) {
    this.src = canvas;
    this.imgEl.width = canvas.width; this.imgEl.height = canvas.height;
    this.imgEl.getContext('2d').drawImage(canvas, 0, 0);
    this.corners = corners.map((c) => ({ x: c.x, y: c.y }));
    this.layout();
  }
  setCorners(c) { this.corners = c.map((p) => ({ x: p.x, y: p.y })); this.update(); }
  getCorners() { return this.corners.map((p) => ({ x: p.x, y: p.y })); }
  isValid() {
    if (this.corners.length !== 4 || !this.src) return false;
    return isConvexQuad(toPixels(this.corners, this.src.width, this.src.height));
  }

  layout() {
    if (!this.src) return;
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pad = 22; // chừa chỗ cho tay nắm ở sát mép
    const s = Math.min((r.width - pad * 2) / this.src.width, (r.height - pad * 2) / this.src.height);
    const dw = this.src.width * s, dh = this.src.height * s;
    this.box = { x: (r.width - dw) / 2, y: (r.height - dh) / 2, w: dw, h: dh };
    Object.assign(this.imgEl.style, { left: this.box.x + 'px', top: this.box.y + 'px', width: dw + 'px', height: dh + 'px' });
    this.svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    this.update();
  }

  toScreen(p) { return { x: this.box.x + p.x * this.box.w, y: this.box.y + p.y * this.box.h }; }

  update() {
    if (!this.box) return;
    const pts = this.corners.map((p) => this.toScreen(p));
    this.poly.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
    this.poly.setAttribute('class', this.isValid() ? '' : 'bad');
    pts.forEach((p, i) => { this.handles[i].style.left = p.x + 'px'; this.handles[i].style.top = p.y + 'px'; });
  }

  start(e, i) {
    e.preventDefault();
    this.handles[i].setPointerCapture(e.pointerId);
    this.handles[i].classList.add('on');
    this.dragging = true;
    this.drag(e, i);
  }
  drag(e, i) {
    if (!this.dragging || !this.handles[i].hasPointerCapture(e.pointerId)) return;
    e.preventDefault();
    const r = this.stage.getBoundingClientRect();
    const x = (e.clientX - r.left - this.box.x) / this.box.w;
    const y = (e.clientY - r.top - this.box.y) / this.box.h;
    this.corners[i] = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    this.update();
    this.showLoupe(this.corners[i], e.clientX - r.left < r.width / 2);
    this.onChange(this.getCorners());
  }
  end(e, i) {
    this.dragging = false;
    this.handles[i].classList.remove('on');
    this.loupe.hidden = true;
  }
  key(e, i) {
    const step = e.shiftKey ? 0.02 : 0.004;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const c = this.corners[i];
    this.corners[i] = { x: Math.min(1, Math.max(0, c.x + d[0])), y: Math.min(1, Math.max(0, c.y + d[1])) };
    this.update(); this.onChange(this.getCorners());
  }

  showLoupe(p, fingerLeft) {
    const L = this.loupe, ctx = L.getContext('2d');
    L.hidden = false;
    L.classList.toggle('right', fingerLeft);
    const zoom = 3, half = L.width / zoom / 2;
    const sx = p.x * this.src.width, sy = p.y * this.src.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, L.width, L.height);
    const k = this.src.width / this.box.w; // điểm ảnh nguồn trên mỗi điểm màn hình
    ctx.drawImage(this.src, sx - half * k, sy - half * k, half * 2 * k, half * 2 * k, 0, 0, L.width, L.height);
    ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L.width / 2, 0); ctx.lineTo(L.width / 2, L.height); ctx.moveTo(0, L.height / 2); ctx.lineTo(L.width, L.height / 2); ctx.stroke();
  }

  destroy() { this.ro.disconnect(); this.stage.textContent = ''; }
}
