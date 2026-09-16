// Tải dữ liệu đường & biển báo từ OpenStreetMap qua Overpass API.
//
// Chiến lược: chia mặt đất thành lưới ô ~550 m. Mỗi ô được tải một lần với bán
// kính 1,5 km quanh tâm ô rồi cache lại. Nhờ vậy đi qua đi lại một tuyến đường
// không tạo thêm request nào, và vùng phủ luôn "đi trước" xe khoảng 1 km.

import { OVERPASS, OVERPASS_ENDPOINTS } from './config.js';
import { cacheGet, cacheSet } from './store.js';
import { destination } from './geoutils.js';

const CELL = 0.005; // độ (~550 m)

// Tầng gần lấy mọi loại đường; tầng xa bỏ ngõ/đường nội bộ vì chúng chiếm phần
// lớn dung lượng mà không bao giờ cần cho cảnh báo phía trước.
const ROAD_TYPES_ALL = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'service', 'road',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
].join('|');

const ROAD_TYPES_MAIN = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
].join('|');

// Lối vào bãi xe / lối vào nhà: nhiều vô kể trong đô thị, không phải đường chạy xe.
const EXCLUDE = '["service"!~"^(parking_aisle|driveway|drive-through)$"]["area"!="yes"]';

function cellIndex(lat, lon) {
  return { i: Math.floor(lat / CELL), j: Math.floor(lon / CELL) };
}

function cellCenter({ i, j }) {
  return { lat: (i + 0.5) * CELL, lon: (j + 0.5) * CELL };
}

function cellKey({ i, j }) {
  return `c_${i}_${j}`;
}

function buildQuery(lat, lon) {
  const ll = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const near = `(around:${OVERPASS.radiusNear},${ll})`;
  const far = `(around:${OVERPASS.radiusFar},${ll})`;
  return `[out:json][timeout:${Math.round(OVERPASS.timeoutMs / 1000)}];
(
  way${near}["highway"~"^(${ROAD_TYPES_ALL})$"]${EXCLUDE};
  way${far}["highway"~"^(${ROAD_TYPES_MAIN})$"]${EXCLUDE};
)->.roads;
(
  node${far}["highway"="speed_camera"];
  node${far}["traffic_sign"];
  node${far}["traffic_calming"];
  node${far}["railway"="level_crossing"];
  node${far}["highway"="stop"];
  node${far}["enforcement"];
)->.pois;
(
  rel${far}["type"="restriction"];
)->.restr;
.roads out geom;
.pois out;
.restr out geom;`;
}

function viaPoint(rel) {
  for (const m of rel.members || []) {
    if (m.role !== 'via') continue;
    if (typeof m.lat === 'number' && typeof m.lon === 'number') return { lat: m.lat, lon: m.lon };
    const g = m.geometry;
    if (Array.isArray(g) && g.length) {
      const mid = g[Math.floor(g.length / 2)];
      if (typeof mid.lat === 'number') return { lat: mid.lat, lon: mid.lon };
    }
  }
  return null;
}

/** Chuyển kết quả Overpass thô về cấu trúc gọn để app dùng. */
function normalize(json) {
  const ways = [];
  const nodes = [];
  for (const el of json.elements || []) {
    if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
      ways.push({
        id: el.id,
        tags: el.tags || {},
        geom: el.geometry.map((g) => ({ lat: g.lat, lon: g.lon })),
      });
    } else if (el.type === 'node' && typeof el.lat === 'number') {
      nodes.push({ id: el.id, tags: el.tags || {}, lat: el.lat, lon: el.lon });
    } else if (el.type === 'relation' && el.tags?.type === 'restriction') {
      const via = viaPoint(el);
      if (via) nodes.push({ id: `rel:${el.id}`, tags: el.tags, lat: via.lat, lon: via.lon });
    }
  }
  return { ways, nodes };
}

export class RoadData {
  constructor({ onStatus } = {}) {
    this.ways = new Map();
    this.nodes = new Map();
    this.cellOrigin = new Map(); // key ô -> tâm ô, dùng để dọn dữ liệu ở xa
    this.loading = new Set();
    this.failedAt = new Map();   // key ô -> thời điểm lỗi, để thử lại sau
    this.lastRequestAt = 0;
    this.throttledUntil = 0;
    this.onStatus = onStatus || (() => {});
    this.endpointIndex = 0;
  }

  get stats() {
    return { ways: this.ways.size, nodes: this.nodes.size, cells: this.cellOrigin.size };
  }

  /**
   * Đảm bảo vùng quanh vị trí đã có dữ liệu. Gọi được liên tục, tự giới hạn tần suất.
   * @param {number} lat @param {number} lon
   * @param {number|null} heading hướng đi (độ) để tải trước ô phía trước
   */
  async ensureCoverage(lat, lon, heading = null) {
    if (Date.now() < this.throttledUntil) return;
    const targets = [cellIndex(lat, lon)];
    if (heading !== null && Number.isFinite(heading)) {
      const ahead = destination(lat, lon, heading, 700);
      targets.push(cellIndex(ahead.lat, ahead.lon));
    }
    for (const cell of targets) {
      const key = cellKey(cell);
      if (this.cellOrigin.has(key) || this.loading.has(key)) continue;
      const failedAt = this.failedAt.get(key);
      if (failedAt && Date.now() - failedAt < 30000) continue;
      await this.#loadCell(cell);
    }
    this.#prune(lat, lon);
  }

  async #loadCell(cell) {
    const key = cellKey(cell);
    const center = cellCenter(cell);
    this.loading.add(key);
    try {
      let data = await cacheGet(key);
      if (data) {
        this.#merge(key, center, data);
        this.onStatus({ state: 'cache', ...this.stats });
        return;
      }
      // Giãn cách request để không bị Overpass chặn
      const wait = OVERPASS.minInterval - (Date.now() - this.lastRequestAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));

      this.onStatus({ state: 'loading' });
      this.lastRequestAt = Date.now();
      data = await this.#fetchWithFailover(center.lat, center.lon);
      await cacheSet(key, data);
      this.#merge(key, center, data);
      this.onStatus({ state: 'ok', ...this.stats });
    } catch (err) {
      this.failedAt.set(key, Date.now());
      this.onStatus({ state: 'error', message: err.message });
    } finally {
      this.loading.delete(key);
    }
  }

  async #fetchWithFailover(lat, lon) {
    const body = 'data=' + encodeURIComponent(buildQuery(lat, lon));
    let lastError = null;
    for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length; attempt++) {
      const url = OVERPASS_ENDPOINTS[(this.endpointIndex + attempt) % OVERPASS_ENDPOINTS.length];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OVERPASS.timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
        });
        // 429 = quá nhiều request, 504 = máy chủ quá tải: nghỉ hẳn rồi thử lại
        // ở lần ensureCoverage sau, đổi endpoint ngay không giúp được gì.
        if (res.status === 429 || res.status === 504) {
          this.throttledUntil = Date.now() + OVERPASS.throttleBackoff;
          throw new Error(`Máy chủ Overpass đang quá tải (${res.status})`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // Endpoint nào chạy được thì lần sau ưu tiên dùng luôn
        this.endpointIndex = (this.endpointIndex + attempt) % OVERPASS_ENDPOINTS.length;
        return normalize(json);
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('Không gọi được Overpass');
  }

  #merge(key, center, data) {
    this.cellOrigin.set(key, center);
    for (const w of data.ways) if (!this.ways.has(w.id)) this.ways.set(w.id, w);
    for (const n of data.nodes) if (!this.nodes.has(n.id)) this.nodes.set(n.id, n);
    this.ways._epGen = (this.ways._epGen || 0) + 1;
  }

  /** Xoá dữ liệu cách vị trí hiện tại quá xa để bộ nhớ không phình theo chuyến đi. */
  #prune(lat, lon) {
    const LIMIT_DEG = 0.05; // ~5,5 km
    if (this.cellOrigin.size <= 12) return;
    let changed = false;
    for (const [key, c] of this.cellOrigin) {
      if (Math.abs(c.lat - lat) > LIMIT_DEG || Math.abs(c.lon - lon) > LIMIT_DEG) {
        this.cellOrigin.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    for (const [id, w] of this.ways) {
      // Phải xét toàn bộ hình học: quốc lộ có thể dài hàng chục km nên điểm đầu
      // ở rất xa trong khi xe vẫn đang chạy trên chính way đó.
      let keep = false;
      for (const p of w.geom) {
        if (Math.abs(p.lat - lat) <= LIMIT_DEG && Math.abs(p.lon - lon) <= LIMIT_DEG) { keep = true; break; }
      }
      if (!keep) this.ways.delete(id);
    }
    for (const [id, n] of this.nodes) {
      if (Math.abs(n.lat - lat) > LIMIT_DEG || Math.abs(n.lon - lon) > LIMIT_DEG) this.nodes.delete(id);
    }
    this.ways._epGen = (this.ways._epGen || 0) + 1;
  }
}
