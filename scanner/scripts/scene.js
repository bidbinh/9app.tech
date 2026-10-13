// Dựng ảnh "chụp tài liệu" giả lập sát thực tế bên trong trang web (dùng canvas thật, phông thật, tiếng Việt có dấu).
// Hàm tự chứa: được tiêm vào trang bằng page.evaluate(sceneInPage, d) (lab.js, e2e.js).
// d: { bg: 'wood'|'dark'|'white'|'gray'|'green', rot, persp, scale, shadow: 'grad'|'hand'|'none', blur, light, warm, W, H, seed, table: bool }
// Trả về { b64 (JPEG), corners (4 góc tờ giấy chuẩn hóa 0..1, thứ tự TL,TR,BR,BL của tờ giấy), W, H, text (chữ gốc), table (mảng 2 chiều) }
export async function sceneInPage(d) {
  const { homography, applyH } = await import('/scanner/js/geom.js');
  const LINES = [
    ['h', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
    ['h2', 'Độc lập - Tự do - Hạnh phúc'],
    ['title', 'BIÊN BẢN BÀN GIAO TÀI SẢN'],
    ['p', 'Hôm nay, ngày 4 tháng 10 năm 2026, tại văn phòng công ty, chúng tôi gồm có các bên như sau.'],
    ['p', 'Bên giao: ông Nguyễn Văn An, chức vụ trưởng phòng hành chính, đại diện cho bên giao tài sản.'],
    ['p', 'Bên nhận: bà Trần Thị Bình, chức vụ kế toán trưởng, đại diện cho bên nhận tài sản.'],
    ['p', 'Hai bên cùng kiểm tra và thống nhất bàn giao các tài sản dưới đây, tình trạng sử dụng tốt.'],
    ['table', null],
    ['p', 'Biên bản được lập thành hai bản có giá trị như nhau, mỗi bên giữ một bản để làm căn cứ.'],
    ['sign', 'Bên giao                                   Bên nhận'],
  ];
  const TABLE = [['STT', 'Tên tài sản', 'Số lượng', 'Tình trạng'], ['1', 'Máy tính xách tay', '02', 'Tốt'], ['2', 'Bàn làm việc', '05', 'Tốt'], ['3', 'Ghế xoay', '05', 'Cũ']];

  function pageCanvas(d) {
    const PW = 1240, PH = 1754;
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const x = c.getContext('2d');
    const pp = d.paper || [248, 246, 240];
    x.fillStyle = `rgb(${pp[0]},${pp[1]},${pp[2]})`; x.fillRect(0, 0, PW, PH);
    if (d.bleed) { // chữ mặt sau thấm qua giấy mỏng: chữ phản gương, rất nhạt
      x.save(); x.translate(PW, 0); x.scale(-1, 1); x.fillStyle = `rgba(60,60,70,${d.bleed})`; x.font = '28px "Times New Roman", serif'; x.textBaseline = 'top';
      for (let i = 0; i < 24; i++) x.fillText('Nội dung mặt sau của tờ giấy mỏng, chữ thấm qua mặt trước và làm bẩn nền trang', 110, 90 + i * 66);
      x.restore();
    }
    x.fillStyle = '#14141a'; x.textBaseline = 'top';
    let y = 120; const truth = [];
    const wrap = (t, font, width) => { x.font = font; const out = []; let cur = ''; for (const w of t.split(' ')) { const test = cur ? cur + ' ' + w : w; if (x.measureText(test).width > width && cur) { out.push(cur); cur = w; } else cur = test; } out.push(cur); return out; };
    for (const [kind, text] of LINES) {
      if (kind === 'h' || kind === 'h2' || kind === 'title') {
        const font = (kind === 'title' ? 'bold 44px' : kind === 'h' ? 'bold 31px' : 'italic 30px') + ' "Times New Roman", serif';
        x.font = font; const w = x.measureText(text).width;
        x.fillText(text, (PW - w) / 2, y); truth.push(text); y += kind === 'title' ? 100 : 48;
        if (kind === 'h2') y += 18;
      } else if (kind === 'p') {
        const font = '28px "Times New Roman", serif';
        for (const ln of wrap(text, font, PW - 240)) { x.font = font; x.fillText(ln, 120, y); truth.push(ln); y += 46; }
        y += 14;
      } else if (kind === 'table') {
        const cols = [120, 260, 700, 880, 1120]; const rh = 56;
        x.strokeStyle = '#222'; x.lineWidth = 2;
        TABLE.forEach((row, ri) => {
          row.forEach((cell, ci) => { x.font = (ri === 0 ? 'bold ' : '') + '28px "Times New Roman", serif'; x.fillText(cell, cols[ci] + 12, y + 12 + ri * rh); });
        });
        for (let r = 0; r <= TABLE.length; r++) { x.beginPath(); x.moveTo(cols[0], y + r * rh); x.lineTo(cols[4], y + r * rh); x.stroke(); }
        for (const cx of cols) { x.beginPath(); x.moveTo(cx, y); x.lineTo(cx, y + TABLE.length * rh); x.stroke(); }
        for (const row of TABLE) truth.push(row.join(' '));
        y += TABLE.length * rh + 40;
      } else if (kind === 'sign') {
        x.font = 'bold 28px "Times New Roman", serif'; x.fillText('Bên giao', 200, y); x.fillText('Bên nhận', 800, y); truth.push('Bên giao Bên nhận'); y += 40;
        x.strokeStyle = '#1d3a8a'; x.lineWidth = 3; x.beginPath(); x.moveTo(190, y + 60); x.bezierCurveTo(230, y, 260, y + 120, 300, y + 40); x.bezierCurveTo(330, y + 10, 340, y + 90, 380, y + 50); x.stroke();
        x.fillStyle = 'rgba(200,35,42,0.75)'; x.beginPath(); x.arc(900, y + 60, 58, 0, 7); x.fill(); x.fillStyle = '#f8f6f0'; x.beginPath(); x.arc(900, y + 60, 44, 0, 7); x.fill();
        x.fillStyle = '#14141a';
      }
    }
    if (d.faint) { // chữ nhạt: bút chì và bút mực xanh nhạt
      x.font = '28px "Times New Roman", serif'; x.textBaseline = 'top';
      const pc = d.faint.pencil || [150, 150, 158], bl = d.faint.blue || [120, 150, 225];
      y += 20;
      x.fillStyle = `rgb(${pc[0]},${pc[1]},${pc[2]})`; x.fillText('Ghi chú bút chì: nộp hồ sơ trước ngày 15 tháng 10 năm 2026.', 120, y); truth.push('Ghi chú bút chì: nộp hồ sơ trước ngày 15 tháng 10 năm 2026.'); y += 46;
      x.fillStyle = `rgb(${bl[0]},${bl[1]},${bl[2]})`; x.fillText('Bút xanh nhạt: đã kiểm tra, đạt yêu cầu về hồ sơ.', 120, y); truth.push('Bút xanh nhạt: đã kiểm tra, đạt yêu cầu về hồ sơ.'); y += 46;
    }
    if (d.inkLight) { // mực phai: nâng các điểm tối lên
      const id = x.getImageData(0, 0, PW, PH);
      for (let i = 0; i < id.data.length; i += 4) { const l = id.data[i] * 0.299 + id.data[i + 1] * 0.587 + id.data[i + 2] * 0.114; if (l < 170) { const k = d.inkLight * (1 - l / 200); for (let c = 0; c < 3; c++) id.data[i + c] += (pp[c] - id.data[i + c]) * Math.max(0, k); } }
      x.putImageData(id, 0, 0);
    }
    return { canvas: c, truth: truth.join('\n') };
  }

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  async function scene(name, d, doc) {
    const W = d.W || 2400, H = d.H || 1800;
    const PW = doc.canvas.width, PH = doc.canvas.height;
    const pd = doc.canvas.getContext('2d').getImageData(0, 0, PW, PH);
    const rand = rng(name.length * 977 + 13);
    const cx = W / 2, cy = H / 2, hh = H * d.scale / 2, hw = hh * PW / PH;
    const a = d.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const base = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const dst = base.map(([x, yy], i) => { const sx = 1 - d.persp * (i < 2 ? 0.22 : 0), sy = 1 + (i === 1 || i === 2 ? d.persp * 0.05 : 0); const px = x * sx, py = yy * sy; return { x: cx + px * ca - py * sa, y: cy + px * sa + py * ca }; });
    const Hinv = homography(dst, [{ x: 0, y: 0 }, { x: PW, y: 0 }, { x: PW, y: PH }, { x: 0, y: PH }]);
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
    const sctx = sc.getContext('2d'); const img = sctx.createImageData(W, H);
    const bgc = { wood: [150, 105, 60], dark: [38, 40, 46], white: [226, 226, 222], gray: [120, 124, 128], green: [60, 110, 80] }[d.bg];
    for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) {
      const o = (yy * W + x) * 4, p = applyH(Hinv, x + 0.5, yy + 0.5);
      let r, gg, b;
      // chiếu sáng không đều + tối góc
      const dx = (x - W / 2) / W, dy = (yy - H / 2) / H;
      let light = d.light * (1.08 - 0.5 * (dx * dx + dy * dy)) * (1 + 0.16 * (-dx) + 0.08 * (-dy));
      const inPage = p.x >= 0 && p.x < PW - 1 && p.y >= 0 && p.y < PH - 1 && pd.data[((p.y | 0) * PW + (p.x | 0)) * 4 + 3] > 200 && pd.data[(((p.y | 0) + 1) * PW + (p.x | 0) + 1) * 4 + 3] > 200;
      if (inPage) {
        const x0 = p.x | 0, y0 = p.y | 0, fx = p.x - x0, fy = p.y - y0;
        const i00 = (y0 * PW + x0) * 4, i10 = i00 + 4, i01 = i00 + PW * 4, i11 = i01 + 4;
        const px = (c) => pd.data[i00 + c] * (1 - fx) * (1 - fy) + pd.data[i10 + c] * fx * (1 - fy) + pd.data[i01 + c] * (1 - fx) * fy + pd.data[i11 + c] * fx * fy;
        r = px(0); gg = px(1); b = px(2);
        let k = light;
        if (d.shadow === 'grad') k *= 1 - 0.42 * Math.max(0, (p.x / PW - 0.35) * 1.6);
        if (d.shadow === 'hand') { const ex = (p.x / PW - 0.75) / 0.28, ey = (p.y / PH - 0.35) / 0.4; const s = Math.exp(-(ex * ex + ey * ey) * 1.3); k *= 1 - 0.55 * s; }
        r *= k; gg *= k; b *= k;
        if (d.glare) { const gx = (p.x / PW - d.glare.x) / d.glare.rx, gy = (p.y / PH - d.glare.y) / d.glare.ry; const sg = Math.exp(-(gx * gx + gy * gy) * 2.2) * d.glare.strength; r += 330 * sg; gg += 330 * sg; b += 330 * sg; }
      } else {
        const tex = d.bg === 'wood' ? 1 + 0.12 * Math.sin(yy * 0.2 + Math.sin(x * 0.01) * 4) + 0.04 * Math.sin(x * 0.9) : d.bg === 'white' ? 1 + 0.02 * Math.sin(x * 0.3 + yy * 0.2) : 1;
        const k = tex * light;
        r = bgc[0] * k; gg = bgc[1] * k; b = bgc[2] * k;
        // bóng của tờ giấy đổ xuống nền
      }
      if (d.warm) { r *= 1.08; b *= 0.8; }
      const nz = (rand() - 0.5) * (d.noiseAmp || 16);
      img.data[o] = r + nz; img.data[o + 1] = gg + nz; img.data[o + 2] = b + nz; img.data[o + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    // mờ nhẹ (lấy nét không hoàn hảo) rồi nén JPEG
    const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
    const bx = bc.getContext('2d'); bx.filter = `blur(${d.blur * 1.4}px)`; bx.drawImage(sc, 0, 0);
    const blob = await new Promise((res) => bc.toBlob(res, 'image/jpeg', 0.8));
    return { blob, truth: dst.map((p) => ({ x: p.x / W, y: p.y / H })), W, H };
  }


  const doc = pageCanvas(d);
  // ---- ngón tay đè lên giấy (vẽ trên trang phẳng, trước khi uốn cong/chụp) ----
  // d.fingers: [{ tone:[r,g,b], side:'left'|'right'|'bottom'|'top', along:0..1 (vị trí dọc mép), width (px trên trang 1240), len (px nhô vào trang) }]
  if (d.fingers && d.fingers.length) {
    const ctx = doc.canvas.getContext('2d');
    const PW0 = doc.canvas.width, PH0 = doc.canvas.height;
    let fseed = 99;
    const fr = () => { fseed = (fseed * 1664525 + 1013904223) >>> 0; return fseed / 4294967296; };
    for (const f of d.fingers) {
      ctx.save();
      // quy về hệ tọa độ "ngón tay chỉ sang phải từ x=0": xoay theo cạnh
      const cx0 = f.side === 'left' ? 0 : f.side === 'right' ? PW0 : f.along * PW0;
      const cy0 = f.side === 'bottom' ? PH0 : f.side === 'top' ? 0 : f.along * PH0;
      const ang = { left: 0, right: Math.PI, top: Math.PI / 2, bottom: -Math.PI / 2 }[f.side] + (f.tilt || 0);
      ctx.translate(cx0, cy0); ctx.rotate(ang);
      const L = f.len, Wd = f.width, [r, g, b] = f.tone;
      const path = () => { ctx.beginPath(); ctx.moveTo(-80, -Wd / 2); ctx.lineTo(L - Wd / 2, -Wd / 2); ctx.arc(L - Wd / 2, 0, Wd / 2, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-80, Wd / 2); ctx.closePath(); };
      // bóng đổ xuống giấy
      ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 34; ctx.shadowOffsetX = 10; ctx.shadowOffsetY = 14;
      path(); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill();
      ctx.shadowColor = 'transparent';
      const grad = ctx.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
      const sh = (k) => `rgb(${Math.max(0, Math.min(255, r * k))},${Math.max(0, Math.min(255, g * k))},${Math.max(0, Math.min(255, b * k))})`;
      grad.addColorStop(0, sh(0.78)); grad.addColorStop(0.35, sh(1.08)); grad.addColorStop(0.65, sh(1.0)); grad.addColorStop(1, sh(0.74));
      path(); ctx.fillStyle = grad; ctx.fill();
      // móng tay + nếp da + hạt
      ctx.fillStyle = `rgba(${Math.min(255, r + 14)},${Math.min(255, g + 8)},${Math.min(255, b + 10)},0.85)`;
      ctx.beginPath(); ctx.ellipse(L - Wd * 0.72, 0, Wd * 0.34, Wd * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${r * 0.6},${g * 0.5},${b * 0.45},0.35)`; ctx.lineWidth = 2;
      for (const kx of [0.3, 0.45]) { ctx.beginPath(); ctx.moveTo(L * kx, -Wd * 0.32); ctx.quadraticCurveTo(L * kx + 6, 0, L * kx, Wd * 0.32); ctx.stroke(); }
      for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${r * 0.7},${g * 0.6},${b * 0.55},${0.05 + fr() * 0.08})`; ctx.fillRect(fr() * L - 40, (fr() - 0.5) * Wd, 2 + fr() * 3, 2 + fr() * 3); }
      ctx.restore();
    }
  }
  // ---- trang cong: d.curve = { kind: 'book'|'wave'|'lift', amp (tỉ lệ chiều cao trang) } ----
  if (d.curve) {
    const src = doc.canvas, PW0 = src.width, PH0 = src.height, M = 90;
    const sd = src.getContext('2d').getImageData(0, 0, PW0, PH0);
    const out = document.createElement('canvas'); out.width = PW0 + 2 * M; out.height = PH0 + 2 * M;
    const octx = out.getContext('2d'); const od = octx.createImageData(out.width, out.height);
    const f = { book: (u) => Math.pow(2 * u - 1, 2), wave: (u) => Math.sin(2 * Math.PI * u), lift: (u) => u * u, roll: (u) => 0.6 * Math.sin(Math.PI * u) }[d.curve.kind];
    for (let Y = 0; Y < out.height; Y++) for (let X = 0; X < out.width; X++) {
      const px = X - M, u = Math.min(1, Math.max(0, px / PW0));
      const sy = Y - M - d.curve.amp * PH0 * f(u);
      if (px < 0 || px >= PW0 - 1 || sy < 0 || sy >= PH0 - 1) continue;
      const y0 = sy | 0, t = sy - y0, o = (Y * out.width + X) * 4, i0 = (y0 * PW0 + px) * 4, i1 = i0 + PW0 * 4;
      for (let c = 0; c < 3; c++) od.data[o + c] = sd.data[i0 + c] * (1 - t) + sd.data[i1 + c] * t;
      od.data[o + 3] = 255;
    }
    octx.putImageData(od, 0, 0);
    doc.canvas = out;
  }
  if (d.flat) {
    const blob = await new Promise((res) => doc.canvas.toBlob(res, 'image/jpeg', 0.9));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { b64: btoa(bin), corners: [], W: doc.canvas.width, H: doc.canvas.height, text: doc.truth, table: TABLE };
  }
  const sc = await scene('x', { W: 2400, H: 1800, seed: 7, ...d }, doc);
  const buf = new Uint8Array(await sc.blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { b64: btoa(bin), corners: sc.truth, W: sc.W, H: sc.H, text: doc.truth, table: TABLE };
}
