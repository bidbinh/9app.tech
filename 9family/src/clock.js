// Đồng hồ của app. Kiểm thử đưa đồng hồ giả vào bằng set(); chạy thật thì là giờ hệ thống.
let fixed = null;
export const clock = {
  now: () => (fixed === null ? Date.now() : fixed),
  set(ms) { fixed = ms === null ? null : Number(ms); },
  advance(ms) { fixed = (fixed === null ? Date.now() : fixed) + ms; },
  iso: () => new Date(clock.now()).toISOString(),
};
