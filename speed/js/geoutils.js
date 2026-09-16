// Các phép toán hình học trên mặt cầu + chiếu phẳng cục bộ.
// Ở phạm vi vài km quanh vị trí, chiếu phẳng (equirectangular) sai số dưới 0,1%
// nên dùng thoải mái cho việc bắt điểm vào đường (map matching).

const R = 6371008.8; // bán kính Trái Đất trung bình (m)
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function toRad(deg) { return deg * D2R; }
export function toDeg(rad) { return rad * R2D; }

/** Khoảng cách haversine giữa 2 toạ độ, đơn vị mét. */
export function distance(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Phương vị từ điểm 1 tới điểm 2, độ, 0 = Bắc, thuận chiều kim đồng hồ. */
export function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Chênh lệch góc nhỏ nhất giữa 2 phương vị, trả về 0..180. */
export function angleDelta(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Chênh lệch hướng khi coi đường là hai chiều: nếu đi ngược chiều vẽ của way
 * thì lệch 180° vẫn là "cùng đường". Trả về 0..90.
 */
export function angleDeltaBidirectional(a, b) {
  const d = angleDelta(a, b);
  return d > 90 ? 180 - d : d;
}

/** Hệ số quy đổi 1 độ kinh độ ra mét tại vĩ độ cho trước. */
export function metersPerLon(lat) { return 111320 * Math.cos(toRad(lat)); }
export const METERS_PER_LAT = 110574;

/** Chiếu toạ độ địa lý về hệ mét phẳng lấy `origin` làm gốc. */
export function project(lat, lon, origin) {
  return {
    x: (lon - origin.lon) * metersPerLon(origin.lat),
    y: (lat - origin.lat) * METERS_PER_LAT,
  };
}

/**
 * Khoảng cách từ điểm P tới đoạn thẳng AB (đơn vị mét) + điểm chiếu vuông góc.
 * Tất cả điểm đều ở hệ mét phẳng.
 */
export function pointToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.x - a.x, wy = p.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * vx, cy = a.y + t * vy;
  const dx = p.x - cx, dy = p.y - cy;
  return { dist: Math.hypot(dx, dy), t, cx, cy };
}

/**
 * Chiếu một toạ độ lên polyline. Trả về khoảng cách vuông góc (m) và
 * khoảng cách dọc theo đường từ điểm đầu (m).
 */
export function projectOntoPolyline(lat, lon, points) {
  if (!points || points.length < 2) return null;
  const origin = { lat: points[0].lat, lon: points[0].lon };
  const p = project(lat, lon, origin);
  let acc = 0;
  let best = null;
  let prev = project(points[0].lat, points[0].lon, origin);
  for (let i = 1; i < points.length; i++) {
    const cur = project(points[i].lat, points[i].lon, origin);
    const r = pointToSegment(p, prev, cur);
    const segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (!best || r.dist < best.dist) {
      const t = r.t;
      best = {
        dist: r.dist,
        along: acc + t * segLen,
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
        lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * t,
        index: i,
        t,
      };
    }
    acc += segLen;
    prev = cur;
  }
  return best;
}

/** Điểm cách (lat,lon) một khoảng `dist` mét theo phương vị `brg` độ. */
export function destination(lat, lon, brg, dist) {
  const δ = dist / R, θ = toRad(brg);
  const φ1 = toRad(lat), λ1 = toRad(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  );
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 };
}

/** Tổng chiều dài một chuỗi điểm {lat,lon}, mét. */
export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return total;
}

/** Nội suy điểm nằm cách đầu chuỗi `target` mét dọc theo polyline. */
export function interpolateAlong(points, target) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = distance(a.lat, a.lon, b.lat, b.lon);
    if (acc + seg >= target) {
      const t = seg === 0 ? 0 : (target - acc) / seg;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        heading: bearing(a.lat, a.lon, b.lat, b.lon),
        done: false,
      };
    }
    acc += seg;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2] || last;
  return {
    lat: last.lat, lon: last.lon,
    heading: bearing(prev.lat, prev.lon, last.lat, last.lon),
    done: true,
  };
}

export const kmh = (mps) => mps * 3.6;
export const mps = (kmhVal) => kmhVal / 3.6;
