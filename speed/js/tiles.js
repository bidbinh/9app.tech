// Nguồn dữ liệu đường từ bộ tile tĩnh dựng sẵn (tools/build-tiles.mjs).
//
// Thay cho việc gọi Overpass: tải roads.json một lần (vài chục KB) để biết vị
// trí từng khối, rồi dùng HTTP Range lấy đúng vài chục KB của ô đang cần.
// Không có lượt gọi API, không có rate limit, dùng được khi mất mạng nhờ cache.
//
// Lớp này phơi ra đúng giao diện của RoadData trong overpass.js (ways, nodes,
// ensureCoverage) nên app.js dùng cái nào cũng được.

import { cacheGet, cacheSet } from './store.js';
import { destination, distance, METERS_PER_LAT, metersPerLon } from './geoutils.js';

// Bán kính cần phủ quanh xe (m) - đủ cho cảnh báo xa nhất 700 m cộng dự phòng
const COVER_RADIUS = 1300;
const PREFETCH_AHEAD = 800;
const MAX_CELLS = 48;          // giữ tối đa bấy nhiêu ô trong bộ nhớ
const DROP_DISTANCE = 6000;    // ô cách xa hơn mức này thì bỏ (m)
const CACHE_TTL = 180 * 24 * 3600 * 1000; // tile tĩnh: giữ tới khi dựng lại

async function gunzip(buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Trình duyệt không hỗ trợ DecompressionStream');
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/**
 * Giải mã nội dung một ô về dạng {ways, nodes} mà matcher dùng được.
 * Hàm thuần, không đụng API trình duyệt, nên kiểm thử được bằng Node.
 *
 * Toạ độ trong ô lưu bằng số nguyên delta so với góc ô, đơn vị 1/precision độ.
 *
 * @param {{p:Array, w:Array, n:Array}} payload
 * @param {number} i chỉ số ô theo vĩ độ
 * @param {number} j chỉ số ô theo kinh độ
 * @param {number} cell kích thước ô (độ)
 * @param {number} precision số đơn vị trên một độ
 */
export function decodeCell(payload, i, j, cell, precision) {
  const originLat = i * cell, originLon = j * cell;
  const cellKey = `${i},${j}`;
  const ways = [];
  const nodes = [];

  (payload.w || []).forEach(([id, propIdx, coords], n) => {
    const tags = payload.p[propIdx] || {};
    const geom = [];
    let y = 0, x = 0;
    for (let k = 0; k < coords.length; k += 2) {
      y += coords[k];
      x += coords[k + 1];
      geom.push({ lat: originLat + y / precision, lon: originLon + x / precision });
    }
    if (geom.length < 2) return;
    // Một con đường bị cắt qua nhiều ô: khoá phải là duy nhất, nhưng way.id giữ
    // nguyên id OSM gốc để matcher vẫn coi các đoạn là cùng một con đường.
    ways.push([`${cellKey}#${n}`, { id, tags, geom }]);
  });

  (payload.n || []).forEach(([dy, dx, tags], n) => {
    const key = `${cellKey}!${n}`;
    nodes.push([key, {
      id: key,
      tags,
      lat: originLat + dy / precision,
      lon: originLon + dx / precision,
    }]);
  });

  return { ways, nodes };
}

export class TileRoadData {
  /**
   * @param {{baseUrl?:string, onStatus?:Function}} options
   */
  constructor({ baseUrl = 'data/', onStatus } = {}) {
    this.baseUrl = baseUrl;
    this.onStatus = onStatus || (() => {});
    this.ways = new Map();
    this.nodes = new Map();

    this.manifest = null;
    this.superIndex = new Map();  // "si,sj" -> {offset, length}
    this.cellIndex = new Map();   // "i,j"   -> {offset, length}
    this.loadedSupers = new Set();
    this.cellContents = new Map(); // "i,j" -> {wayKeys, nodeKeys, lat, lon}
    this.inFlight = new Map();
    this.failed = new Map();
    this.ready = false;
  }

  get stats() {
    return { ways: this.ways.size, nodes: this.nodes.size, cells: this.cellContents.size };
  }

  /** Tải bản kê. Trả về false nếu không có bộ tile -> app sẽ dùng Overpass. */
  async init() {
    try {
      // Không dùng force-cache: bản kê phải được kiểm tra lại với máy chủ, nếu
      // không thì dựng lại dữ liệu xong client vẫn bám vào bản kê cũ mãi mãi.
      const res = await fetch(`${this.baseUrl}roads.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json();
      if (manifest.format !== '9speed-roads-2') throw new Error(`Định dạng lạ: ${manifest.format}`);
      this.manifest = manifest;
      for (const [si, sj, offset, length] of manifest.superIndex) {
        this.superIndex.set(`${si},${sj}`, { si, sj, offset, length });
      }
      this.ready = true;
      this.onStatus({ state: 'ok', ...this.stats, built: manifest.built });
      return true;
    } catch (err) {
      this.onStatus({ state: 'unavailable', message: err.message });
      return false;
    }
  }

  /** Vị trí có nằm trong vùng dữ liệu đã dựng không. */
  covers(lat, lon) {
    if (!this.ready) return false;
    const s = this.manifest.super;
    return this.superIndex.has(`${Math.floor(lat / s)},${Math.floor(lon / s)}`);
  }

  #superUrl(sKey) {
    const [si, sj] = sKey.split(',');
    return `${this.baseUrl}${this.manifest.dir}${si}_${sj}.bin`;
  }

  async #fetchRange(sKey, offset, length) {
    const res = await fetch(this.#superUrl(sKey), {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (res.status !== 206) {
      // Máy chủ bỏ qua Range và trả cả file - cắt ra để vẫn chạy được, nhưng
      // đây là cấu hình sai và rất tốn băng thông.
      if (buf.byteLength > length) {
        console.warn('Máy chủ không hỗ trợ HTTP Range — đang tải thừa dữ liệu.');
        return buf.slice(offset, offset + length);
      }
    }
    return buf;
  }

  async #loadSuper(sKey) {
    if (this.loadedSupers.has(sKey)) return true;
    const entry = this.superIndex.get(sKey);
    if (!entry) return false;
    const key = `super:${sKey}`;
    if (this.inFlight.has(key)) return this.inFlight.get(key);

    const job = (async () => {
      const cacheKey = `si_${this.manifest.built}_${sKey}`;
      let list = await cacheGet(cacheKey, CACHE_TTL);
      if (!list) {
        const buf = await this.#fetchRange(sKey, entry.offset, entry.length);
        list = JSON.parse(await gunzip(buf));
        await cacheSet(cacheKey, list);
      }
      for (const [i, j, offset, length] of list) {
        // Nhớ luôn siêu ô: vị trí byte chỉ có nghĩa bên trong file của nó
        this.cellIndex.set(`${i},${j}`, { sKey, offset, length });
      }
      this.loadedSupers.add(sKey);
      return true;
    })().finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, job);
    return job;
  }

  async #loadCell(cellKey) {
    if (this.cellContents.has(cellKey)) return;
    if (this.inFlight.has(cellKey)) return this.inFlight.get(cellKey);
    const failedAt = this.failed.get(cellKey);
    if (failedAt && Date.now() - failedAt < 20000) return;

    const entry = this.cellIndex.get(cellKey);
    if (!entry) {
      // Ô không có trong chỉ mục nghĩa là vùng đó không có đường nào - ghi nhận
      // để khỏi hỏi lại liên tục.
      this.cellContents.set(cellKey, { wayKeys: [], nodeKeys: [], empty: true, ...this.#cellCentre(cellKey) });
      return;
    }

    const job = (async () => {
      const cacheKey = `tc_${this.manifest.built}_${cellKey}`;
      let payload = await cacheGet(cacheKey, CACHE_TTL);
      if (!payload) {
        const buf = await this.#fetchRange(entry.sKey, entry.offset, entry.length);
        payload = JSON.parse(await gunzip(buf));
        await cacheSet(cacheKey, payload);
      }
      this.#merge(cellKey, payload);
    })().catch((err) => {
      this.failed.set(cellKey, Date.now());
      this.onStatus({ state: 'error', message: err.message });
    }).finally(() => this.inFlight.delete(cellKey));

    this.inFlight.set(cellKey, job);
    return job;
  }

  #cellCentre(cellKey) {
    const [i, j] = cellKey.split(',').map(Number);
    const c = this.manifest.cell;
    return { lat: (i + 0.5) * c, lon: (j + 0.5) * c };
  }

  #merge(cellKey, payload) {
    const [i, j] = cellKey.split(',').map(Number);
    const { ways, nodes } = decodeCell(payload, i, j, this.manifest.cell, this.manifest.precision);

    const wayKeys = [];
    const nodeKeys = [];
    for (const [key, way] of ways) { this.ways.set(key, way); wayKeys.push(key); }
    for (const [key, node] of nodes) { this.nodes.set(key, node); nodeKeys.push(key); }

    this.cellContents.set(cellKey, { wayKeys, nodeKeys, ...this.#cellCentre(cellKey) });
    this.ways._epGen = (this.ways._epGen || 0) + 1;
    this.onStatus({ state: 'ok', ...this.stats, built: this.manifest.built });
  }

  /** Danh sách ô phủ hình tròn bán kính r quanh một điểm. */
  #cellsAround(lat, lon, radius) {
    const cell = this.manifest.cell;
    const dLat = radius / METERS_PER_LAT;
    const dLon = radius / Math.max(1, metersPerLon(lat));
    const keys = [];
    for (let i = Math.floor((lat - dLat) / cell); i <= Math.floor((lat + dLat) / cell); i++) {
      for (let j = Math.floor((lon - dLon) / cell); j <= Math.floor((lon + dLon) / cell); j++) {
        keys.push(`${i},${j}`);
      }
    }
    return keys;
  }

  /**
   * Đảm bảo vùng quanh vị trí đã có dữ liệu.
   * @returns {Promise<boolean>} false nếu vị trí nằm ngoài vùng dữ liệu
   */
  async ensureCoverage(lat, lon, heading = null) {
    if (!this.ready) return false;
    if (!this.covers(lat, lon)) return false;

    const s = this.manifest.super;
    const wanted = new Set(this.#cellsAround(lat, lon, COVER_RADIUS));
    if (heading !== null && Number.isFinite(heading)) {
      const ahead = destination(lat, lon, heading, PREFETCH_AHEAD);
      for (const k of this.#cellsAround(ahead.lat, ahead.lon, 400)) wanted.add(k);
    }

    // Mỗi ô cần chỉ mục cấp 2 của siêu ô chứa nó
    const supers = new Set();
    const cellSize = this.manifest.cell;
    for (const key of wanted) {
      const [i, j] = key.split(',').map(Number);
      supers.add(`${Math.floor(i * cellSize / s)},${Math.floor(j * cellSize / s)}`);
    }
    await Promise.all([...supers].map((sk) => this.#loadSuper(sk).catch(() => false)));

    await Promise.all([...wanted].map((k) => this.#loadCell(k)));
    this.#prune(lat, lon);
    return true;
  }

  /** Bỏ các ô ở xa để bộ nhớ không phình theo chuyến đi. */
  #prune(lat, lon) {
    if (this.cellContents.size <= MAX_CELLS) return;
    let dropped = false;
    for (const [key, content] of this.cellContents) {
      if (distance(lat, lon, content.lat, content.lon) < DROP_DISTANCE) continue;
      for (const k of content.wayKeys) this.ways.delete(k);
      for (const k of content.nodeKeys) this.nodes.delete(k);
      this.cellContents.delete(key);
      dropped = true;
    }
    if (dropped) this.ways._epGen = (this.ways._epGen || 0) + 1;
  }
}
