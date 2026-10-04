// Toán cho bảng vẽ chữ ký: nét lưu theo đơn vị "chiều cao bảng" nên vẽ lại đúng khi đổi kích thước/xoay màn hình.

/** Hệ số co k (<=1) để toàn bộ nét nằm gọn trong chiều rộng W khi chiều cao bảng là H. */
export function fitScale(strokes, W, H) {
  let maxX = 0;
  for (const s of strokes) for (const p of s.pts) if (p.x > maxX) maxX = p.x;
  if (maxX <= 0) return 1;
  return Math.min(1, (0.97 * W) / (maxX * H));
}

/** Đổi điểm ảnh <-> đơn vị bảng (k là hệ số co hiện hành). */
export const toUnits = (px, H, k) => px / (H * k);
export const toPixels = (u, H, k) => u * H * k;
