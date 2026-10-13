// Giới hạn tốc độ trong bộ nhớ, cửa sổ cố định. Không lưu gì ra đĩa.
// offsetMs: lệch múi giờ để cửa sổ ngày đổi đúng 0 giờ giờ Việt Nam (UTC+7).
export const VN_OFFSET_MS = 7 * 3600 * 1000;

export class RateLimiter {
  constructor(now = () => Date.now()) { this.now = now; this.buckets = new Map(); this.lastSweep = now(); }

  _slot(t, windowMs, offsetMs) { const slot = Math.floor((t + offsetMs) / windowMs); return { slot, end: (slot + 1) * windowMs - offsetMs }; }

  // Trả về { ok, retryAfterSec }. Chỉ tăng bộ đếm khi cho qua.
  hit(key, limit, windowMs, offsetMs = 0) {
    const t = this.now();
    this.sweep(t);
    const { slot, end } = this._slot(t, windowMs, offsetMs);
    const b = this.buckets.get(key);
    if (!b || b.slot !== slot) { this.buckets.set(key, { slot, n: 1, end }); return { ok: limit > 0, retryAfterSec: 0 }; }
    if (b.n >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.end - t) / 1000)) };
    b.n++;
    return { ok: true, retryAfterSec: 0 };
  }

  // Đã chạm trần chưa (không tăng bộ đếm)
  blocked(key, limit, windowMs, offsetMs = 0) {
    const t = this.now();
    const { slot } = this._slot(t, windowMs, offsetMs);
    const b = this.buckets.get(key);
    return limit <= 0 || !!(b && b.slot === slot && b.n >= limit);
  }

  // Kiểm tra nhiều giới hạn cùng lúc; nếu bất kỳ cái nào chặn thì không tính vào các cái còn lại.
  check(rules) {
    const t = this.now();
    for (const r of rules) {
      const off = r.offsetMs || 0;
      const { slot, end } = this._slot(t, r.windowMs, off);
      const b = this.buckets.get(r.key);
      if (r.limit <= 0) return { ok: false, retryAfterSec: 60, rule: r.name };
      if (b && b.slot === slot && b.n >= r.limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((end - t) / 1000)), rule: r.name };
    }
    for (const r of rules) this.hit(r.key, r.limit, r.windowMs, r.offsetMs || 0);
    return { ok: true, retryAfterSec: 0 };
  }

  sweep(t) {
    if (t - this.lastSweep < 60_000) return;
    this.lastSweep = t;
    for (const [k, b] of this.buckets) if (b.end <= t) this.buckets.delete(k);
  }
}
