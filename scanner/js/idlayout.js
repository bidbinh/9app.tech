// Ảnh thẻ: kích thước chuẩn, khung cắt theo tỉ lệ, bố cục ghép tờ in. Toán thuần, kiểm thử được.

/** Kích thước ảnh thẻ chuẩn (mm). */
export const ID_SIZES = {
  '3x4': { label: '3x4 cm', w: 30, h: 40 },
  '4x6': { label: '4x6 cm', w: 40, h: 60 },
};

/** Khổ giấy in (mm). 10x15 là khổ ảnh 4x6 inch ở tiệm in. */
export const SHEETS = {
  '10x15': { label: 'Ảnh 10x15 cm', w: 100, h: 150 },
  A4: { label: 'Giấy A4', w: 210, h: 297 },
};

export const mmToPx = (mm, dpi = 300) => Math.round((mm / 25.4) * dpi);

/**
 * Khung cắt có tỉ lệ cố định (aspect = w/h) trên ảnh imgW×imgH.
 * zoom >= 1 (1 = khung lớn nhất vừa trong ảnh), (cx, cy) là tâm khung theo điểm ảnh (sẽ được kẹp để khung nằm trong ảnh).
 */
export function cropRect(imgW, imgH, aspect, zoom = 1, cx = imgW / 2, cy = imgH / 2) {
  let w, h;
  if (imgW / imgH > aspect) { h = imgH; w = h * aspect; } else { w = imgW; h = w / aspect; }
  const z = Math.max(1, zoom);
  w /= z; h /= z;
  const x = Math.min(imgW - w, Math.max(0, cx - w / 2));
  const y = Math.min(imgH - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}

/**
 * Xếp các ảnh thẻ (photo mm) lên tờ (sheet mm) thành lưới, căn giữa. Trả về vị trí từng ảnh (mm, gốc trên-trái).
 * copies: số ảnh muốn in; bỏ trống = nhiều nhất có thể. Tự thử xoay ảnh 90 độ nếu xếp được nhiều hơn.
 */
export function layoutSheet(sheet, photo, { gap = 2, margin = 5, copies } = {}) {
  const fit = (pw, ph) => {
    const cols = Math.max(0, Math.floor((sheet.w - 2 * margin + gap) / (pw + gap)));
    const rows = Math.max(0, Math.floor((sheet.h - 2 * margin + gap) / (ph + gap)));
    return { cols, rows, pw, ph };
  };
  const a = fit(photo.w, photo.h), b = fit(photo.h, photo.w);
  const rotated = b.cols * b.rows > a.cols * a.rows;
  const g = rotated ? b : a;
  const max = g.cols * g.rows;
  const count = copies ? Math.min(copies, max) : max;
  const usedCols = Math.min(g.cols, count);
  const usedRows = Math.ceil(count / (g.cols || 1));
  const gridW = usedCols * g.pw + (usedCols - 1) * gap;
  const gridH = usedRows * g.ph + (usedRows - 1) * gap;
  const x0 = (sheet.w - gridW) / 2, y0 = (sheet.h - gridH) / 2;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const c = i % g.cols, r = Math.floor(i / g.cols);
    positions.push({ x: x0 + c * (g.pw + gap), y: y0 + r * (g.ph + gap) });
  }
  return { positions, cols: g.cols, rows: g.rows, max, count, rotated, pw: g.pw, ph: g.ph };
}
