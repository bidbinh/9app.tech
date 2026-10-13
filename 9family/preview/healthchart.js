/* 9family: biểu đồ SVG tự vẽ (không thư viện ngoài, tuân CSP: chỉ thuộc tính SVG và lớp CSS, không style nội tuyến).
   F9.chart.line(opts) -> <svg>. F9.chart.bars(opts) -> <svg> cột ngang/dọc đơn giản. Màu và nét ở health.css (sáng/tối, tương phản). */
(function () {
  'use strict';
  var F9 = window.F9 = window.F9 || {};
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function niceStep(span, n) {
    var raw = span / n; var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)); var m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  function fmt(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }

  /* opts: { title, desc, xMin, xMax, yMin, yMax, xTicks:[{v,label}], yUnit,
             bands:[{from,to,cls}], lines:[{cls, points:[[x,y]], dots, label}], refs:[{y, cls, label}] } */
  function line(o) {
    var W = 340; var H = 230; var L = 44; var R = 10; var T = 12; var B = 34;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': o.title + '. ' + (o.desc || '') , focusable: 'false' });
    svg.appendChild(el('title', {}, o.title));
    var x0 = o.xMin; var x1 = o.xMax > o.xMin ? o.xMax : o.xMin + 1;
    var y0 = o.yMin; var y1 = o.yMax > o.yMin ? o.yMax : o.yMin + 1;
    var X = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - R); };
    var Y = function (v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); };
    (o.bands || []).forEach(function (b) {
      var a = Y(Math.min(b.to, y1)); var c = Y(Math.max(b.from, y0));
      if (c > a) svg.appendChild(el('rect', { x: L, y: a, width: W - L - R, height: c - a, class: 'ch-band ' + (b.cls || '') }));
    });
    var step = niceStep(y1 - y0, 4);
    for (var yv = Math.ceil(y0 / step) * step; yv <= y1 + 1e-9; yv += step) {
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: Y(yv), y2: Y(yv), class: 'ch-grid' }));
      svg.appendChild(el('text', { x: L - 6, y: Y(yv) + 5, class: 'ch-t ch-ty', 'text-anchor': 'end' }, fmt(yv)));
    }
    (o.xTicks || []).forEach(function (t) {
      if (t.v < x0 || t.v > x1) return;
      svg.appendChild(el('line', { x1: X(t.v), x2: X(t.v), y1: T, y2: H - B, class: 'ch-grid ch-gx' }));
      svg.appendChild(el('text', { x: X(t.v), y: H - 10, class: 'ch-t', 'text-anchor': 'middle' }, t.label));
    });
    svg.appendChild(el('line', { x1: L, x2: L, y1: T, y2: H - B, class: 'ch-axis' }));
    svg.appendChild(el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'ch-axis' }));
    (o.refs || []).forEach(function (r) {
      if (r.y < y0 || r.y > y1) return;
      svg.appendChild(el('line', { x1: L, x2: W - R, y1: Y(r.y), y2: Y(r.y), class: 'ch-ref ' + (r.cls || '') }));
    });
    (o.lines || []).forEach(function (ln) {
      var pts = ln.points.filter(function (p) { return p[0] >= x0 && p[0] <= x1; });
      if (!pts.length) return;
      if (pts.length > 1) svg.appendChild(el('polyline', { points: pts.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' '), class: 'ch-line ' + (ln.cls || '') }));
      if (ln.dots) pts.forEach(function (p, i) {
        var c = el('circle', { cx: X(p[0]).toFixed(1), cy: Y(p[1]).toFixed(1), r: i === pts.length - 1 ? 6 : 4.5, class: 'ch-dot ' + (ln.cls || '') + ((p[2] || '') ? ' ' + p[2] : '') });
        svg.appendChild(c);
      });
    });
    return svg;
  }

  // Cột ngang: items [{label, value, cls}], max tự tính. Trả <svg>; nhãn đặt ngoài (danh sách HTML) nên ở đây chỉ vẽ thanh.
  function bars(o) {
    var rowH = 14; var gap = 8; var W = 300;
    var items = o.items; var max = o.max || Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var H = items.length * (rowH + gap);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart bars', role: 'img', 'aria-label': o.title, focusable: 'false' });
    svg.appendChild(el('title', {}, o.title));
    items.forEach(function (it, i) {
      var y = i * (rowH + gap);
      svg.appendChild(el('rect', { x: 0, y: y, width: W, height: rowH, rx: 7, class: 'ch-track' }));
      var w = Math.max(it.value > 0 ? 6 : 0, it.value / max * W);
      if (w) svg.appendChild(el('rect', { x: 0, y: y, width: w.toFixed(1), height: rowH, rx: 7, class: 'ch-bar ' + (it.cls || '') }));
    });
    return svg;
  }

  // Cột đứng theo tháng: items [{label, value, cls}]
  function columns(o) {
    var W = 320; var H = 150; var B = 22; var items = o.items;
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': o.title, focusable: 'false' });
    svg.appendChild(el('title', {}, o.title));
    var slot = W / items.length;
    items.forEach(function (it, i) {
      var h = it.value / max * (H - B - 8);
      svg.appendChild(el('rect', { x: i * slot + slot * 0.18, y: H - B - h, width: slot * 0.64, height: Math.max(it.value > 0 ? 3 : 0, h), rx: 4, class: 'ch-bar ' + (it.cls || '') }));
      svg.appendChild(el('text', { x: i * slot + slot / 2, y: H - 5, class: 'ch-t', 'text-anchor': 'middle' }, it.label));
    });
    return svg;
  }

  // Nhãn trục tuổi (tháng): "6 th", "1 tuổi", "2 tuổi"...
  function ageTicks(lo, hi) {
    var span = hi - lo; var step = span <= 14 ? 3 : span <= 30 ? 6 : span <= 72 ? 12 : span <= 150 ? 24 : 36;
    var out = [];
    for (var m = Math.ceil(lo / step) * step; m <= hi; m += step) out.push({ v: m, label: m === 0 ? 'Sinh' : m < 24 && m % 12 ? m + ' th' : m % 12 === 0 ? (m / 12) + ' tuổi' : m + ' th' });
    return out;
  }
  // Nhãn trục ngày: "05/10"
  function dayTicks(days, n) {
    var out = []; var step = Math.max(1, Math.ceil(days.length / n));
    days.forEach(function (d, i) { if (i % step === 0 || i === days.length - 1) out.push({ v: d.v, label: d.label }); });
    return out;
  }

  F9.chart = { line: line, bars: bars, columns: columns, ageTicks: ageTicks, dayTicks: dayTicks, fmt: fmt };
})();
