// Suy ra tốc độ tối đa cho phép tại vị trí hiện tại.
//
// Thứ tự ưu tiên:
//   1. Tag maxspeed cụ thể cho loại xe (maxspeed:hgv, maxspeed:motorcycle...)
//   2. Tag maxspeed theo chiều đi (maxspeed:forward / :backward)
//   3. Tag maxspeed chung của đường
//   4. Suy luận theo Thông tư 31/2019/TT-BGTVT dựa trên loại đường + khu đông dân cư
//
// Kết quả luôn bị chặn trên bởi trần tốc độ của loại phương tiện.

import { VEHICLES } from './config.js';
import { isOneway, bbox } from './matcher.js';
import { distance, METERS_PER_LAT, metersPerLon } from './geoutils.js';

const MPH = 1.609344;

/** Đọc giá trị tag maxspeed của OSM về km/h. Trả về null nếu không xác định. */
export function parseMaxspeed(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === 'none' || v === 'signals' || v === 'variable' || v === 'unknown') return null;
  if (v === 'walk') return 5;

  const mph = v.match(/^([\d.]+)\s*mph$/);
  if (mph) return Math.round(parseFloat(mph[1]) * MPH);

  const knots = v.match(/^([\d.]+)\s*knots?$/);
  if (knots) return Math.round(parseFloat(knots[1]) * 1.852);

  const kmh = v.match(/^([\d.]+)(\s*km\/?h)?$/);
  if (kmh) {
    const n = parseFloat(kmh[1]);
    return Number.isFinite(n) && n > 0 && n <= 200 ? Math.round(n) : null;
  }
  return null; // dạng "VN:urban" xử lý riêng ở getZoneType
}

/** Nhận diện tag kiểu "VN:urban" / "VN:rural" / "VN:motorway". */
function getZoneType(tags) {
  const candidates = [tags['maxspeed:type'], tags['source:maxspeed'], tags['zone:maxspeed'], tags.maxspeed];
  for (const c of candidates) {
    if (!c) continue;
    const v = String(c).toLowerCase();
    if (v.includes('urban') || v.includes('nsl_restricted')) return 'urban';
    if (v.includes('rural') || v.includes('nsl_single') || v.includes('nsl_dual')) return 'rural';
    if (v.includes('motorway')) return 'motorway';
    if (v.includes('living_street')) return 'living';
  }
  return null;
}

const VEHICLE_TAG_KEYS = {
  car: ['maxspeed:motorcar', 'maxspeed:motor_vehicle'],
  moto: ['maxspeed:motorcycle', 'maxspeed:motor_vehicle'],
  truck: ['maxspeed:hgv', 'maxspeed:goods', 'maxspeed:motor_vehicle'],
  bus: ['maxspeed:bus', 'maxspeed:psv', 'maxspeed:hgv', 'maxspeed:motor_vehicle'],
  moped: ['maxspeed:moped', 'maxspeed:motorcycle'],
};

function wayNearPosition(way, lat, lon, radius) {
  const geom = way.geom;
  if (!geom || geom.length === 0) return false;
  const b = bbox(way);
  const padLat = radius / METERS_PER_LAT;
  const padLon = radius / Math.max(1, metersPerLon(lat));
  if (lat < b.minLat - padLat || lat > b.maxLat + padLat ||
      lon < b.minLon - padLon || lon > b.maxLon + padLon) return false;
  const step = Math.max(1, Math.floor(geom.length / 4));
  for (let i = 0; i < geom.length; i += step) {
    if (distance(lat, lon, geom[i].lat, geom[i].lon) < radius) return true;
  }
  const last = geom[geom.length - 1];
  return distance(lat, lon, last.lat, last.lon) < radius;
}

function densityNeed(highway) {
  if (highway === 'trunk' || highway === 'trunk_link') return { radius: 250, min: 12 };
  if (highway === 'primary' || highway === 'primary_link' || highway === 'secondary') {
    return { radius: 300, min: 8 };
  }
  return { radius: 350, min: 6 };
}

const RES_GRID = 0.005;
let _resIdx = { ways: null, size: -1, at: 0, grid: null };

function residentialGrid(ways) {
  const now = Date.now();
  if (_resIdx.ways === ways && _resIdx.size === ways.size && now - _resIdx.at < 8000 && _resIdx.grid) {
    return _resIdx.grid;
  }
  const grid = new Map();
  for (const w of ways.values()) {
    const t = w.tags.highway;
    if (t !== 'residential' && t !== 'living_street') continue;
    const b = bbox(w);
    const i0 = Math.floor(b.minLat / RES_GRID);
    const i1 = Math.floor(b.maxLat / RES_GRID);
    const j0 = Math.floor(b.minLon / RES_GRID);
    const j1 = Math.floor(b.maxLon / RES_GRID);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(w);
      }
    }
  }
  _resIdx = { ways, size: ways.size, at: now, grid };
  return grid;
}

function countNearbyResidential(position, ways, radius, min) {
  const grid = residentialGrid(ways);
  const dLat = radius / METERS_PER_LAT;
  const dLon = radius / Math.max(1, metersPerLon(position.lat));
  const seen = new Set();
  let nearby = 0;
  for (let i = Math.floor((position.lat - dLat) / RES_GRID); i <= Math.floor((position.lat + dLat) / RES_GRID); i++) {
    for (let j = Math.floor((position.lon - dLon) / RES_GRID); j <= Math.floor((position.lon + dLon) / RES_GRID); j++) {
      const bucket = grid.get(`${i},${j}`);
      if (!bucket) continue;
      for (const w of bucket) {
        if (seen.has(w)) continue;
        seen.add(w);
        if (wayNearPosition(w, position.lat, position.lon, radius)) {
          nearby++;
          if (nearby >= min) return nearby;
        }
      }
    }
  }
  return nearby;
}

/**
 * Đoán xe có đang trong khu đông dân cư không.
 * OSM Việt Nam hiếm khi gắn maxspeed:type nên phải dùng nhiều dấu hiệu gián tiếp.
 */
export function detectUrban(way, position, ways) {
  const zone = getZoneType(way.tags);
  if (zone === 'urban' || zone === 'living') return { urban: true, why: 'tag khu vực OSM' };
  if (zone === 'rural' || zone === 'motorway') return { urban: false, why: 'tag khu vực OSM' };

  const hw = way.tags.highway;
  if (hw === 'living_street' || hw === 'residential' || hw === 'service') {
    return { urban: true, why: 'đường khu dân cư' };
  }
  if (hw === 'motorway' || hw === 'motorway_link') {
    return { urban: false, why: 'đường cao tốc' };
  }

  if (ways && position) {
    const { radius, min } = densityNeed(hw);
    const nearby = countNearbyResidential(position, ways, radius, min);
    if (nearby >= min) return { urban: true, why: 'mật độ đường dân sinh cao' };
  }
  return { urban: false, why: 'mặc định ngoài khu đông dân cư' };
}

function tagPresent(v) {
  if (v == null || v === '' || v === 'no' || v === '0' || v === 'false') return false;
  return true;
}

/** Đường đôi hoặc một chiều từ 2 làn trở lên (nhóm tốc độ cao hơn theo TT31). */
export function isMultiLane(way) {
  const t = way.tags;
  if (t.dual_carriageway === 'yes' || t.dual_carriageway === '1') return true;
  if (tagPresent(t.divider) || tagPresent(t.median)) return true;
  if (t.highway === 'motorway' || t.highway === 'motorway_link') return true;
  const lanes = parseInt(t.lanes, 10);
  if (!Number.isFinite(lanes)) return false;
  if (isOneway(way) && lanes >= 2) return true;
  // Hai chiều 4 làn ≈ 2+2, TT31 nhóm đường đôi
  if (lanes >= 4) return true;
  return false;
}

const ROAD_CLASS_VI = {
  motorway: 'Đường cao tốc',
  motorway_link: 'Nhánh cao tốc',
  trunk: 'Quốc lộ',
  trunk_link: 'Nhánh quốc lộ',
  primary: 'Đường chính',
  primary_link: 'Nhánh đường chính',
  secondary: 'Đường liên tỉnh',
  secondary_link: 'Nhánh đường liên tỉnh',
  tertiary: 'Đường liên huyện',
  tertiary_link: 'Nhánh đường liên huyện',
  unclassified: 'Đường không phân loại',
  residential: 'Đường nội bộ',
  living_street: 'Đường nhường bộ hành',
  service: 'Đường nội bộ/ngõ',
  road: 'Đường chưa phân loại',
};

/**
 * @param {object} match kết quả từ matchRoad()
 * @param {string} vehicleKey khoá trong VEHICLES
 * @param {Map} ways toàn bộ đường đã tải (dùng cho heuristic khu đông dân cư)
 * @param {{lat:number,lon:number}} position
 */
export function resolveSpeedLimit(match, vehicleKey, ways, position) {
  const vehicle = VEHICLES[vehicleKey] || VEHICLES.car;
  if (!match) {
    return {
      limit: null, source: 'none', confidence: 'low',
      detail: 'Chưa xác định được đường', roadName: null, roadClass: null, urban: null,
    };
  }

  const tags = match.way.tags;
  const roadName = tags.name || tags.ref || tags['name:vi'] || null;
  const roadClass = ROAD_CLASS_VI[tags.highway] || tags.highway || null;
  const cap = (v) => (v === null ? null : Math.min(v, vehicle.hardCap));

  // 1. maxspeed riêng cho loại xe
  for (const key of (VEHICLE_TAG_KEYS[vehicleKey] || [])) {
    const parsed = parseMaxspeed(tags[key]);
    if (parsed !== null) {
      return { limit: cap(parsed), source: 'osm', confidence: 'high',
        detail: `Biển riêng cho ${vehicle.short} (OSM ${key})`, roadName, roadClass, urban: null };
    }
  }

  // 2. maxspeed theo chiều đi
  const dirKey = match.forward ? 'maxspeed:forward' : 'maxspeed:backward';
  const dirVal = parseMaxspeed(tags[dirKey]);
  if (dirVal !== null) {
    return { limit: cap(dirVal), source: 'osm', confidence: 'high',
      detail: 'Biển báo theo chiều đi (OSM)', roadName, roadClass, urban: null };
  }

  // 3. maxspeed chung
  const general = parseMaxspeed(tags.maxspeed);
  if (general !== null) {
    return { limit: cap(general), source: 'osm', confidence: 'high',
      detail: 'Biển báo ghi nhận trên OSM', roadName, roadClass, urban: null };
  }

  // 4. Suy luận theo luật
  if (tags.highway === 'living_street') {
    const limit = Math.min(30, vehicle.hardCap);
    return { limit, source: 'law', confidence: 'medium',
      detail: 'Đường nhường bộ hành', roadName, roadClass, urban: true };
  }
  if (tags.highway === 'motorway') {
    const limit = cap(vehicle.motorway ?? vehicle.ruralMulti);
    return {
      limit, source: 'law', confidence: 'low',
      detail: 'Cao tốc: trần TT31 (chưa có biển OSM)',
      roadName, roadClass, urban: false,
    };
  }
  if (tags.highway === 'motorway_link') {
    const limit = cap(vehicle.motorwayLink ?? 60);
    return {
      limit, source: 'law', confidence: 'low',
      detail: 'Nhánh cao tốc (chưa có biển OSM)',
      roadName, roadClass, urban: false,
    };
  }

  const { urban, why } = detectUrban(match.way, position, ways);
  const multi = isMultiLane(match.way);
  const limit = urban
    ? (multi ? vehicle.urbanMulti : vehicle.urbanSingle)
    : (multi ? vehicle.ruralMulti : vehicle.ruralSingle);

  const zoneText = urban ? 'khu đông dân cư' : 'ngoài khu đông dân cư';
  const laneText = multi ? 'đường đôi / 1 chiều ≥ 2 làn' : 'đường 2 chiều / 1 chiều 1 làn';
  return {
    limit: cap(limit),
    source: 'law',
    confidence: 'medium',
    detail: `Suy luận TT31: ${zoneText}, ${laneText} (${why})`,
    roadName, roadClass, urban,
  };
}
