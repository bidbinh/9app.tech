// Nén theo dung lượng mong muốn: tìm (tỉ lệ thu nhỏ, chất lượng JPEG) lớn nhất mà tổng PDF vẫn nằm trong giới hạn.
// Phần tìm kiếm thuần toán học (encode là hàm đo dung lượng do bên gọi cung cấp) nên kiểm thử được độc lập với canvas.

export const QUALITY_PRESETS = {
  high: { label: 'Cao', maxEdge: 2480, quality: 0.9 },
  normal: { label: 'Chuẩn', maxEdge: 1754, quality: 0.8 },
  small: { label: 'Nhỏ', maxEdge: 1240, quality: 0.6 },
};

/** Mục tiêu nén = 97% giới hạn người dùng nhập (KB = 1024 byte), chừa lề an toàn cho cấu trúc PDF. */
export const SAFETY = 0.97;
export const budgetTarget = (limit) => Math.max(1, Math.floor(limit * SAFETY));

export const MIN_QUALITY = 0.15;
export const MAX_QUALITY = 0.92;
const SCALES = [1, 0.85, 0.72, 0.6, 0.5, 0.4, 0.3, 0.22, 0.16, 0.12];

/** Phân tích chuỗi người dùng nhập ("500 KB", "1,5 MB", "2mb") thành số byte. Trả về null nếu không hiểu. */
export function parseSize(text) {
  if (typeof text === 'number') return text > 0 ? Math.round(text) : null;
  const m = String(text || '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)*)\s*(kb|k|mb|m|b)?$/);
  if (!m) return null; // gồm cả "1 500 KB" (khoảng trắng giữa các chữ số)
  let num = m[1];
  if (num.includes('.') && num.includes(',')) {
    // 1.500,5 (kiểu Việt) hoặc 1,500.5 (kiểu Anh): dấu đứng sau cùng là thập phân
    const lastDot = num.lastIndexOf('.'), lastComma = num.lastIndexOf(',');
    num = lastComma > lastDot ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(num)) {
    num = num.replace(/[.,]/g, ''); // "1.500", "1,500", "2.048": đúng 3 chữ số sau dấu = ngăn cách nghìn
  } else {
    num = num.replace(',', '.');
    if ((num.match(/\./g) || []).length > 1) return null;
  }
  const v = parseFloat(num);
  if (!isFinite(v)) return null;
  const unit = m[2] || 'kb';
  const mul = unit === 'mb' || unit === 'm' ? 1048576 : unit === 'b' ? 1 : 1024;
  const bytes = Math.round(v * mul);
  return bytes > 0 && bytes <= 2 * 1073741824 ? bytes : null;
}

/** Giới hạn nhỏ hơn mức này (5 KB) coi như không hợp lý cho một trang ảnh. */
export const MIN_LIMIT_BYTES = 5 * 1024;

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1).replace('.', ',')} GB`;
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1).replace('.', ',')} MB`;
}

/**
 * Tìm cài đặt nén. `measure(scale, quality)` trả về (hoặc Promise) tổng số byte của PDF với cài đặt đó.
 * Trả về { scale, quality, size, ok, tries }. ok=false nghĩa là kể cả cài đặt nhỏ nhất vẫn vượt giới hạn (trả về cài đặt nhỏ nhất).
 * Chiến lược: ưu tiên giữ độ phân giải (scale lớn), chỉ giảm scale khi chất lượng phải xuống dưới 0.5.
 */
export async function fitToBudget(measure, target, { maxQuality = MAX_QUALITY, minQuality = MIN_QUALITY, preferredFloor = 0.5, steps = 6, onProgress } = {}) {
  let tries = 0;
  const run = async (s, q) => { tries++; const size = await measure(s, q); if (onProgress) onProgress({ tries, scale: s, quality: q, size }); return size; };

  let fallback = null;
  for (let si = 0; si < SCALES.length; si++) {
    const scale = SCALES[si];
    // Ở chất lượng tối đa đã đủ nhỏ?
    const top = await run(scale, maxQuality);
    if (top <= target) return { scale, quality: maxQuality, size: top, ok: true, tries };
    const bottom = await run(scale, minQuality);
    fallback = { scale, quality: minQuality, size: bottom, ok: false, tries };
    if (bottom > target) continue; // scale này chưa đủ, thu nhỏ thêm
    // Nhị phân trên chất lượng: lớn nhất mà size <= target
    let lo = minQuality, hi = maxQuality, bestQ = minQuality, bestSize = bottom;
    for (let i = 0; i < steps; i++) {
      const mid = (lo + hi) / 2;
      const size = await run(scale, mid);
      if (size <= target) { lo = mid; bestQ = mid; bestSize = size; } else hi = mid;
    }
    // Nếu chất lượng thấp hơn ngưỡng ưa thích và còn scale nhỏ hơn thì thử scale nhỏ hơn để cân bằng
    if (bestQ < preferredFloor && si < SCALES.length - 1) {
      const next = SCALES[si + 1];
      const probe = await run(next, Math.max(preferredFloor, minQuality));
      if (probe <= target) {
        let l2 = Math.max(preferredFloor, minQuality), h2 = maxQuality, bq = l2, bs = probe;
        for (let i = 0; i < steps; i++) {
          const mid = (l2 + h2) / 2;
          const size = await run(next, mid);
          if (size <= target) { l2 = mid; bq = mid; bs = size; } else h2 = mid;
        }
        return { scale: next, quality: bq, size: bs, ok: true, tries };
      }
    }
    return { scale, quality: bestQ, size: bestSize, ok: true, tries };
  }
  return { ...fallback, tries };
}
