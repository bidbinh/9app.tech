// Lớp dữ liệu camera tự quản, chồng lên dữ liệu OSM.
//
// Gồm hai phần khác hẳn nhau về bản chất:
//   - Điểm: nút giao có camera, định vị được chính xác -> cảnh báo theo khoảng cách
//   - Tuyến: cả con đường có camera giám sát, không có điểm cụ thể -> báo trạng
//     thái khi đang chạy trên tuyến đó, không đọc khoảng cách
//
// Ngoài ra người dùng tự đánh dấu được điểm riêng, lưu trong máy và xuất ra
// file JSON để đóng góp ngược lại cho overlay/cameras.json.

import { distance, METERS_PER_LAT, metersPerLon } from './geoutils.js';
import { normalizeRoadName, wayNames } from './vnname.js';

const MY_POI_KEY = '9speed.mypoi';
const GRID = 0.05; // độ (~5,5 km) - ô băm để tra điểm gần

export class Overlay {
  constructor({ baseUrl = 'data/', onStatus } = {}) {
    this.baseUrl = baseUrl;
    this.onStatus = onStatus || (() => {});
    this.ready = false;
    this.data = null;
    this.grid = new Map();       // "i,j" -> [node]
    this.corridors = new Map();  // tên chuẩn hoá -> [corridor]
    this.myPoints = [];
  }

  get counts() {
    return {
      points: [...this.grid.values()].reduce((s, a) => s + a.length, 0),
      corridors: this.corridors.size,
      mine: this.myPoints.length,
    };
  }

  async init() {
    this.loadMine();
    try {
      const res = await fetch(`${this.baseUrl}overlay.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.load(await res.json());
      this.onStatus({ state: 'ok', ...this.counts });
      return true;
    } catch (err) {
      // Không có lớp overlay thì app vẫn chạy bình thường với dữ liệu OSM
      this.onStatus({ state: 'unavailable', message: err.message, ...this.counts });
      return false;
    } finally {
      this.#indexMine();
    }
  }

  /** Nạp dữ liệu overlay đã giải mã. Tách riêng khỏi init() để kiểm thử được. */
  load(data) {
    if (data.format !== '9speed-overlay-1') throw new Error(`Định dạng lạ: ${data.format}`);
    this.data = data;

    for (const [lat, lon, label, confidence, source] of data.points) {
      this.#addPoint({
        id: `ov:${this.counts.points}`,
        lat, lon, label, confidence, source,
        // Điểm chắc chắn báo như camera thật; điểm còn mơ hồ hạ một bậc
        severity: confidence === 'high' ? 3 : 2,
      });
    }

    for (const c of data.corridors || []) {
      if (!this.corridors.has(c.name)) this.corridors.set(c.name, []);
      this.corridors.get(c.name).push(c);
    }

    this.ready = true;
    return this;
  }

  #cellKey(lat, lon) {
    return `${Math.floor(lat / GRID)},${Math.floor(lon / GRID)}`;
  }

  #addPoint(p) {
    const node = {
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      tags: { highway: 'speed_camera', 'x:source': p.source || '' },
      // Đặt sẵn kết quả phân loại để giữ nguyên nhãn do mình biên tập,
      // thay vì để classifyNode() sinh nhãn chung chung.
      _poi: {
        type: 'camera',
        icon: 'camera',
        severity: p.severity ?? 3,
        label: p.label,
        speed: null,
        confidence: p.confidence,
      },
    };
    const key = this.#cellKey(p.lat, p.lon);
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(node);
    return node;
  }

  /* ---------------- Điểm do người dùng tự đánh dấu ---------------- */

  loadMine() {
    try {
      const raw = localStorage.getItem(MY_POI_KEY);
      this.myPoints = raw ? JSON.parse(raw) : [];
    } catch {
      this.myPoints = [];
    }
  }

  #saveMine() {
    try {
      localStorage.setItem(MY_POI_KEY, JSON.stringify(this.myPoints));
    } catch {
      /* chế độ riêng tư có thể chặn - điểm vẫn dùng được trong phiên này */
    }
  }

  #indexMine() {
    this.myPoints.forEach((p, i) => {
      this.#addPoint({
        id: `my:${i}`,
        lat: p.lat, lon: p.lon,
        label: p.label || 'Điểm tôi đánh dấu',
        confidence: 'manual',
        source: 'tôi đánh dấu',
        severity: 3,
      });
    });
  }

  addMyPoint(lat, lon, label) {
    const p = { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), label, ts: Date.now() };
    this.myPoints.push(p);
    this.#saveMine();
    this.#addPoint({
      id: `my:${this.myPoints.length - 1}`,
      lat: p.lat, lon: p.lon,
      label, confidence: 'manual', source: 'tôi đánh dấu', severity: 3,
    });
    this.onStatus({ state: 'ok', ...this.counts });
    return p;
  }

  /** Xoá điểm tự đánh dấu gần toạ độ cho trước nhất (trong bán kính m). */
  removeMyPointNear(lat, lon, radius = 60) {
    let bestIdx = -1, bestD = Infinity;
    this.myPoints.forEach((p, i) => {
      const d = distance(lat, lon, p.lat, p.lon);
      if (d < bestD && d <= radius) { bestD = d; bestIdx = i; }
    });
    if (bestIdx < 0) return null;
    const [removed] = this.myPoints.splice(bestIdx, 1);
    this.#saveMine();
    this.#rebuildGrid();
    this.onStatus({ state: 'ok', ...this.counts });
    return removed;
  }

  #rebuildGrid() {
    this.grid.clear();
    if (this.data) {
      this.data.points.forEach(([lat, lon, label, confidence, source], i) => {
        this.#addPoint({ id: `ov:${i}`, lat, lon, label, confidence, source, severity: confidence === 'high' ? 3 : 2 });
      });
    }
    this.#indexMine();
  }

  /** Số điểm đến từ lớp biên tập (không tính điểm người dùng tự thêm). */
  get publishedCount() {
    return this.data ? this.data.points.length : 0;
  }

  /** Xuất điểm tự đánh dấu ra JSON đúng khuôn overlay/cameras.json. */
  exportMine() {
    return JSON.stringify({
      version: 1,
      exported: new Date().toISOString(),
      note: 'Điểm do người dùng 9speed tự đánh dấu. Chưa kiểm chứng.',
      entries: this.myPoints.map((p) => ({
        kind: 'point',
        lat: p.lat,
        lon: p.lon,
        label: p.label,
        source: 'người dùng đóng góp',
      })),
    }, null, 2);
  }

  /* ---------------- Tra cứu khi đang chạy ---------------- */

  /**
   * Các điểm overlay quanh vị trí, trả về dạng [id, node] để trộn thẳng vào Map
   * node mà PoiTracker đang dùng.
   */
  nodesNear(lat, lon, radius = 1500) {
    const out = [];
    const dLat = radius / METERS_PER_LAT;
    const dLon = radius / Math.max(1, metersPerLon(lat));
    for (let i = Math.floor((lat - dLat) / GRID); i <= Math.floor((lat + dLat) / GRID); i++) {
      for (let j = Math.floor((lon - dLon) / GRID); j <= Math.floor((lon + dLon) / GRID); j++) {
        const bucket = this.grid.get(`${i},${j}`);
        if (!bucket) continue;
        for (const node of bucket) {
          if (distance(lat, lon, node.lat, node.lon) <= radius) out.push([node.id, node]);
        }
      }
    }
    return out;
  }

  /**
   * Con đường đang chạy có nằm trong tuyến giám sát không.
   * Phải khớp cả tên lẫn vị trí: tên đường ở Việt Nam trùng lặp rất nhiều nên
   * chỉ so tên sẽ báo nhầm ở tỉnh khác.
   */
  corridorFor(way, lat, lon) {
    if (!way) return null;
    for (const name of wayNames(way.tags)) {
      const list = this.corridors.get(normalizeRoadName(name));
      if (!list) continue;
      for (const c of list) {
        const b = c.bbox;
        if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) return c;
      }
    }
    return null;
  }
}
