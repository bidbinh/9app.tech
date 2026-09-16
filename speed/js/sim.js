// Chế độ mô phỏng: cho "xe ảo" chạy trên chính dữ liệu đường thật của OSM.
//
// Dùng để thử app trên máy tính (không có GPS di chuyển) và để kiểm tra logic
// cảnh báo mà không phải ra đường. Xe ảo bám theo hình học của way, tới cuối
// way thì chọn way nối tiếp có hướng thẳng nhất.

import { distance, bearing } from './geoutils.js';
import { matchRoad, nextConnectedWay, fragmentKey } from './matcher.js';

export class SimSource {
  /**
   * @param {{onFix:Function, getWays:Function}} deps
   */
  constructor({ onFix, getWays }) {
    this.onFix = onFix;
    this.getWays = getWays;
    this.timer = null;
    this.targetSpeed = 13.9; // m/s ~ 50 km/h
    this.speed = 0;
    this.pos = null;       // {lat, lon}
    this.heading = 0;
    this.way = null;
    this.segIndex = 1;     // đang ở đoạn (segIndex-1 -> segIndex)
    this.segOffset = 0;    // đã đi được bao nhiêu mét trong đoạn hiện tại
    this.reverse = false;
    this.lastTick = 0;
  }

  get running() { return this.timer !== null; }

  /** Đặt vị trí xuất phát (thường là điểm người dùng chạm trên bản đồ). */
  setStart(lat, lon) {
    this.pos = { lat, lon };
    this.way = null;
    this.segOffset = 0;
    this.segIndex = 1;
  }

  setSpeedKmh(kmh) { this.targetSpeed = kmh / 3.6; }

  start() {
    if (this.timer !== null) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.#tick(), 250);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.speed = 0;
  }

  #tick() {
    if (!this.pos) return;
    const now = performance.now();
    const dt = Math.min(2, (now - this.lastTick) / 1000);
    this.lastTick = now;

    // Tăng/giảm tốc mượt như xe thật (~2 m/s²)
    const diff = this.targetSpeed - this.speed;
    this.speed += Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt);

    if (!this.way) this.#attachToRoad();

    if (this.way) this.#advance(this.speed * dt);

    this.onFix({
      lat: this.pos.lat,
      lon: this.pos.lon,
      accuracy: 5,
      speed: Math.max(0, this.speed),
      rawSpeed: this.speed,
      heading: this.heading,
      timestamp: Date.now(),
      source: 'sim',
    });
  }

  /** Bám xe ảo vào con đường gần nhất (chờ dữ liệu OSM tải xong). */
  #attachToRoad() {
    const ways = this.getWays();
    const match = matchRoad(
      { lat: this.pos.lat, lon: this.pos.lon, heading: null, speed: 0 },
      ways, null,
    );
    if (!match) return;
    this.way = match.way;
    this.reverse = false;
    // Tìm đỉnh gần nhất để biết bắt đầu từ đoạn nào
    let bestI = 1, bestD = Infinity;
    const g = this.way.geom;
    for (let i = 0; i < g.length; i++) {
      const d = distance(this.pos.lat, this.pos.lon, g[i].lat, g[i].lon);
      if (d < bestD) { bestD = d; bestI = Math.max(1, i); }
    }
    this.segIndex = bestI;
    this.segOffset = 0;
    this.pos = { lat: g[bestI - 1].lat, lon: g[bestI - 1].lon };
  }

  #points() {
    const g = this.way.geom;
    return this.reverse ? [...g].reverse() : g;
  }

  #advance(meters) {
    let remaining = meters;
    let guard = 0;
    while (remaining > 0 && guard++ < 200) {
      const pts = this.#points();
      if (this.segIndex >= pts.length) {
        if (!this.#hopToNextWay()) return;
        continue;
      }
      const a = pts[this.segIndex - 1];
      const b = pts[this.segIndex];
      const segLen = distance(a.lat, a.lon, b.lat, b.lon);
      if (segLen < 0.01) { this.segIndex++; continue; }

      if (this.segOffset + remaining < segLen) {
        this.segOffset += remaining;
        remaining = 0;
      } else {
        remaining -= (segLen - this.segOffset);
        this.segOffset = 0;
        this.segIndex++;
        continue;
      }

      const t = this.segOffset / segLen;
      this.pos = {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
      };
      this.heading = bearing(a.lat, a.lon, b.lat, b.lon);
    }
  }

  /** Tới cuối way: chọn way kế tiếp nối vào đầu mút, ưu tiên hướng đi thẳng. */
  #hopToNextWay() {
    const pts = this.#points();
    const end = pts[pts.length - 1];
    const ways = this.getWays();
    const used = new Set([fragmentKey(this.way)]);
    const hop = nextConnectedWay(this.way, end, this.heading, ways, used);

    if (hop) {
      this.way = hop.way;
      this.reverse = hop.reverse;
      this.segIndex = 1;
      this.segOffset = 0;
      const g = this.#points();
      this.pos = { lat: g[0].lat, lon: g[0].lon };
      return true;
    }

    // Cụt đường: quay đầu chạy ngược lại
    this.reverse = !this.reverse;
    this.segIndex = 1;
    this.segOffset = 0;
    return true;
  }
}
