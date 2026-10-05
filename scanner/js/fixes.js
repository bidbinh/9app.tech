// Làm sạch trang trước khi lọc: xóa ngón tay/vật cản (inpaint.js) rồi nắn phẳng trang cong (dewarp.js).
// Chế độ theo trang: page.clean, page.dewarp = 'auto' (mặc định: tự bật khi phát hiện rõ) | 'on' (người dùng ép bật) | 'off'.
import { detectObstacles, removeObstacles } from './inpaint.js';
import { estimateDewarp, applyField } from './dewarp.js';

export const fixMode = (v) => (v === 'on' || v === 'off' ? v : 'auto');

/**
 * Áp dụng các bước làm sạch lên img (đã nắn phối cảnh và xoay đúng chiều). Trả về { img, info }.
 * Kết quả dò được nhớ trong page._fix theo hình học trang để kéo thả/đổi lọc không phải dò lại.
 */
export function applyFixes(img, page) {
  const cm = fixMode(page.clean), dm = fixMode(page.dewarp);
  const info = { clean: { mode: cm, found: false, applied: false, area: 0, overlapsText: false }, dewarp: { mode: dm, found: false, applied: false, usable: false, auto: false, curvature: 0, after: 0, coherence: 0 } };
  if (cm === 'off' && dm === 'off') return { img, info };
  const key = `${page.corners.map((c) => Math.round(c.x * 1e4) + ',' + Math.round(c.y * 1e4)).join(';')}|${page.rot || 0}`;
  const cache = page._fix && page._fix.key === key ? page._fix : (page._fix = { key });

  if (cm !== 'off') {
    const mode = cm === 'on' ? 'on' : 'auto';
    const slot = mode === 'on' ? 'detOn' : 'detAuto';
    if (!cache[slot]) cache[slot] = detectObstacles(img, { interior: mode === 'on' });
    const det = cache[slot];
    info.clean.found = det.found; info.clean.area = det.area; info.clean.overlapsText = det.overlapsText; info.clean.blobs = det.blobs.length; info.clean.debug = det.debug;
    if (det.found) { removeObstacles(img, det); info.clean.applied = true; }
  }
  if (dm !== 'off') {
    const ck = `est${info.clean.applied ? 'C' : 'N'}`;
    if (!cache[ck]) cache[ck] = estimateDewarp(img);
    const est = cache[ck];
    Object.assign(info.dewarp, { found: est.found, usable: est.usable, auto: est.auto, curvature: est.curvature, coherence: est.coherence, after: est.after ? est.after.curvature : 0, nTracks: est.nTracks });
    if (est.field && ((dm === 'on' && est.usable) || (dm === 'auto' && est.auto))) {
      img = applyField(img, est.field);
      info.dewarp.applied = true;
    }
  }
  return { img, info };
}
