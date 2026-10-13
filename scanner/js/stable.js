// Theo dõi độ ổn định của khung tài liệu qua các khung hình camera để tự chụp khi người dùng giữ yên máy.
// Thuần JS (kiểm thử được trong Node). Tọa độ góc chuẩn hóa 0..1.

export class StableTracker {
  /**
   * opts: { needFrames (số khung ổn định liên tiếp), maxMove (dịch chuyển tối đa của mỗi góc giữa hai khung, theo đường chéo),
   *         minArea (diện tích tối thiểu so với khung hình), rearmMove (phải dịch chuyển hơn mức này, hoặc mất khung, mới được chụp tiếp) }
   */
  constructor(opts = {}) {
    this.needFrames = opts.needFrames || 3;
    this.maxMove = opts.maxMove || 0.018;
    this.minArea = opts.minArea || 0.22;
    this.rearmMove = opts.rearmMove || 0.12;
    this.rearmLost = opts.rearmLost || 2;
    this.reset();
  }

  reset() { this.prev = null; this.count = 0; this.fired = false; this.firedCorners = null; this.lost = 0; }

  static area(c) {
    let a = 0;
    for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; a += p.x * q.y - q.x * p.y; }
    return Math.abs(a) / 2;
  }

  static move(a, b) {
    let m = 0;
    for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
    return m / Math.SQRT2; // đường chéo khung chuẩn hóa = sqrt(2)
  }

  /** corners: [4 điểm] nếu thấy tài liệu chắc chắn, ngược lại null. Trả về { progress 0..1, fire: boolean }. */
  push(corners) {
    if (!corners || StableTracker.area(corners) < this.minArea) {
      this.prev = null; this.count = 0;
      if (this.fired && ++this.lost >= this.rearmLost) { this.fired = false; this.firedCorners = null; }
      return { progress: 0, fire: false };
    }
    this.lost = 0;
    if (this.fired) {
      // đã chụp: chờ người dùng đổi sang trang khác (khung dịch xa) hoặc hạ máy xuống
      if (StableTracker.move(corners, this.firedCorners) > this.rearmMove) { this.fired = false; this.firedCorners = null; this.prev = corners; this.count = 0; }
      return { progress: 0, fire: false };
    }
    if (this.prev && StableTracker.move(corners, this.prev) <= this.maxMove) this.count++; else this.count = 0;
    this.prev = corners;
    const progress = Math.min(1, this.count / this.needFrames);
    if (this.count >= this.needFrames) { this.fired = true; this.firedCorners = corners; this.count = 0; return { progress: 1, fire: true }; }
    return { progress, fire: false };
  }
}
