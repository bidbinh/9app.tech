// Map matching: xác định xe đang chạy trên con đường nào.
//
// Điểm số của mỗi đường = khoảng cách vuông góc (m) + phạt lệch hướng.
// Đường đang bám được cộng thêm ưu đãi (sticky) để không nhảy qua lại giữa
// hai làn song song hay giữa đường chính và đường gom.

import { MATCHER } from './config.js';
import {
  project, pointToSegment, bearing, angleDelta, angleDeltaBidirectional,
  METERS_PER_LAT, metersPerLon, distance, projectOntoPolyline,
} from './geoutils.js';

export function bbox(way) {
  if (way._bbox) return way._bbox;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of way.geom) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  way._bbox = { minLat, maxLat, minLon, maxLon };
  return way._bbox;
}

export function isOneway(way) {
  const v = way.tags.oneway;
  return v === 'yes' || v === '1' || v === '-1' || way.tags.junction === 'roundabout';
}

/** oneway=-1: chiều đi hợp lệ ngược với chiều vẽ geometry. */
export function onewayAgainstGeom(way) {
  return way.tags.oneway === '-1';
}

function orientedGeom(way, forward) {
  return forward ? way.geom : [...way.geom].reverse();
}

/** Khoá phân biệt hai mảnh cùng OSM id (cắt theo ô tile). Cache trên object way. */
export function fragmentKey(way) {
  if (way._fragKey) return way._fragKey;
  const g = way.geom;
  const a = g[0], b = g[g.length - 1];
  way._fragKey = `${way.id}:${a.lat.toFixed(6)},${a.lon.toFixed(6)}:${b.lat.toFixed(6)},${b.lon.toFixed(6)}`;
  return way._fragKey;
}

const JOIN_TOLERANCE = 8; // m — hai way coi là nối nhau
const END_CELL = 0.0002; // ~22 m — ô lưới chỉ mục đầu mút

function endCell(lat, lon) {
  return `${Math.floor(lat / END_CELL)},${Math.floor(lon / END_CELL)}`;
}

const _epIndex = new WeakMap(); // ways Map → { size, byEnd }

function endpointIndex(ways) {
  const hit = _epIndex.get(ways);
  const gen = ways._epGen || 0;
  if (hit && hit.size === ways.size && hit.gen === gen) return hit.byEnd;

  const byEnd = new Map();
  for (const w of ways.values()) {
    const g = w.geom;
    if (!g || g.length < 2) continue;
    fragmentKey(w);
    const head = endCell(g[0].lat, g[0].lon);
    const tail = endCell(g[g.length - 1].lat, g[g.length - 1].lon);
    let bucket = byEnd.get(head);
    if (!bucket) { bucket = []; byEnd.set(head, bucket); }
    bucket.push(w);
    if (tail !== head) {
      let tBucket = byEnd.get(tail);
      if (!tBucket) { tBucket = []; byEnd.set(tail, tBucket); }
      tBucket.push(w);
    }
  }
  _epIndex.set(ways, { size: ways.size, gen, byEnd });
  return byEnd;
}

function waysNearEnd(end, ways) {
  const byEnd = endpointIndex(ways);
  const i0 = Math.floor(end.lat / END_CELL);
  const j0 = Math.floor(end.lon / END_CELL);
  const nearby = new Set();
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const bucket = byEnd.get(`${i0 + di},${j0 + dj}`);
      if (!bucket) continue;
      for (const w of bucket) nearby.add(w);
    }
  }
  return nearby;
}

/**
 * Mọi way nối vào đầu mút (turn ≤ 110°), ưu tiên cùng OSM id rồi đi thẳng.
 * Sim lấy phần tử đầu; POI duyệt cả danh sách để không sót nhánh rẽ.
 */
export function connectedWays(currentWay, end, heading, ways, usedKeys) {
  const out = [];
  const currentKey = fragmentKey(currentWay);

  for (const w of waysNearEnd(end, ways)) {
    const key = fragmentKey(w);
    if (key === currentKey || usedKeys.has(key)) continue;
    const g = w.geom;
    if (!g || g.length < 2) continue;

    const dHead = distance(end.lat, end.lon, g[0].lat, g[0].lon);
    const dTail = distance(end.lat, end.lon, g[g.length - 1].lat, g[g.length - 1].lon);
    let reverse = null;
    if (dHead <= JOIN_TOLERANCE) reverse = false;
    else if (dTail <= JOIN_TOLERANCE) reverse = true;
    else continue;

    const pts = reverse ? [...g].reverse() : g;
    const outBearing = bearing(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon);
    const turn = angleDelta(heading, outBearing);
    if (turn > 110) continue;

    const score = turn + (w.id === currentWay.id ? -40 : 0);
    out.push({ way: w, reverse, key, score });
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}

export function nextConnectedWay(currentWay, end, heading, ways, usedKeys) {
  return connectedWays(currentWay, end, heading, ways, usedKeys)[0] || null;
}

function walkFragment(way, forward, fromPoint, remaining, first, pts) {
  const geom = orientedGeom(way, forward);
  let cursor;
  let fromIdx = 1;
  let heading = 0;

  if (first) {
    const proj = projectOntoPolyline(fromPoint.lat, fromPoint.lon, geom);
    if (proj) {
      cursor = { lat: proj.lat, lon: proj.lon };
      fromIdx = proj.index;
    } else {
      cursor = { lat: fromPoint.lat, lon: fromPoint.lon };
    }
    if (pts.length === 0) pts.push({ lat: cursor.lat, lon: cursor.lon });
  } else {
    cursor = { lat: geom[0].lat, lon: geom[0].lon };
    fromIdx = 1;
  }

  for (let i = fromIdx; i < geom.length && remaining > 0; i++) {
    const nxt = geom[i];
    const seg = distance(cursor.lat, cursor.lon, nxt.lat, nxt.lon);
    if (seg < 0.01) continue;
    if (seg <= remaining) {
      pts.push({ lat: nxt.lat, lon: nxt.lon });
      heading = bearing(cursor.lat, cursor.lon, nxt.lat, nxt.lon);
      remaining -= seg;
      cursor = { lat: nxt.lat, lon: nxt.lon };
    } else {
      const t = remaining / seg;
      const lat = cursor.lat + (nxt.lat - cursor.lat) * t;
      const lon = cursor.lon + (nxt.lon - cursor.lon) * t;
      pts.push({ lat, lon });
      heading = bearing(cursor.lat, cursor.lon, nxt.lat, nxt.lon);
      remaining = 0;
      cursor = { lat, lon };
    }
  }
  return { cursor, remaining, heading, pts };
}

/**
 * Mọi polyline phía trước trong tầm lookahead: đi thẳng và các nhánh rẽ hợp lý.
 * Không phải lộ trình — thà báo thừa ở ngã ba còn hơn im camera trên đường sắp rẽ.
 */
export function pathsAhead(match, ways, maxMeters) {
  if (!match?.way?.geom || maxMeters <= 0) return [];

  const snapped = match.snapped || match.way.geom[0];
  const seed = {
    way: match.way,
    forward: match.forward !== false,
    from: { lat: snapped.lat, lon: snapped.lon },
    remaining: maxMeters,
    heading: match.courseBearing ?? 0,
    used: new Set(),
    pts: [],
    first: true,
  };

  const paths = [];
  const queue = [seed];
  let expand = 0;
  const MAX_PATHS = 6;
  const MAX_EXPAND = 48;

  while (queue.length && paths.length < MAX_PATHS && expand++ < MAX_EXPAND) {
    const st = queue.shift();
    const used = new Set(st.used);
    used.add(fragmentKey(st.way));
    const pts = st.pts.slice();
    const walked = walkFragment(st.way, st.forward, st.from, st.remaining, st.first, pts);
    const heading = walked.heading || st.heading;

    if (walked.remaining <= 0) {
      if (walked.pts.length >= 2) paths.push(walked.pts);
      continue;
    }

    const hops = connectedWays(st.way, walked.cursor, heading, ways, used);
    if (hops.length === 0) {
      if (walked.pts.length >= 2) paths.push(walked.pts);
      continue;
    }

    for (const hop of hops.slice(0, 3)) {
      queue.push({
        way: hop.way,
        forward: !hop.reverse,
        from: walked.cursor,
        remaining: walked.remaining,
        heading,
        used: new Set(used),
        pts: walked.pts.slice(),
        first: false,
      });
    }
  }

  return paths;
}

export function polylineAhead(match, ways, maxMeters) {
  const paths = pathsAhead(match, ways, maxMeters);
  return paths[0] || [];
}

/**
 * @param {{lat:number, lon:number, heading:number|null, speed:number}} pos
 * @param {Map<number,object>} ways
 * @param {number|null} previousWayId
 * @returns {null | {way:object, distance:number, snapped:{lat:number,lon:number},
 *                   courseBearing:number, forward:boolean, score:number}}
 */
export function matchRoad(pos, ways, previousWayId = null) {
  if (!ways || ways.size === 0) return null;

  const origin = { lat: pos.lat, lon: pos.lon };
  const p = { x: 0, y: 0 }; // vị trí hiện tại là gốc toạ độ
  const padLat = MATCHER.maxSnapDistance / METERS_PER_LAT;
  const padLon = MATCHER.maxSnapDistance / Math.max(1, metersPerLon(pos.lat));
  const useHeading = pos.heading !== null && Number.isFinite(pos.heading) &&
    pos.speed >= MATCHER.headingMinSpeed;

  let best = null;

  for (const way of ways.values()) {
    const b = bbox(way);
    if (pos.lat < b.minLat - padLat || pos.lat > b.maxLat + padLat ||
        pos.lon < b.minLon - padLon || pos.lon > b.maxLon + padLon) continue;

    const pts = way.geom;
    if (!pts || pts.length < 2) continue;
    let bestSeg = null;
    let prev = project(pts[0].lat, pts[0].lon, origin);
    for (let i = 1; i < pts.length; i++) {
      const cur = project(pts[i].lat, pts[i].lon, origin);
      const r = pointToSegment(p, prev, cur);
      if (!bestSeg || r.dist < bestSeg.dist) bestSeg = { ...r, i };
      prev = cur;
    }
    if (!bestSeg || bestSeg.dist > MATCHER.maxSnapDistance) continue;

    const a = pts[bestSeg.i - 1], c = pts[bestSeg.i];
    const segBearing = bearing(a.lat, a.lon, c.lat, c.lon);
    const oneway = isOneway(way);
    // Chiều đi hợp lệ: ngược geometry khi oneway=-1
    const travelBearing = onewayAgainstGeom(way) ? (segBearing + 180) % 360 : segBearing;

    let score = bestSeg.dist + (MATCHER.classPenalty[way.tags.highway] || 0);
    let forward = true;
    if (useHeading) {
      const delta = oneway
        ? angleDelta(pos.heading, travelBearing)
        : angleDeltaBidirectional(pos.heading, segBearing);
      score += delta * MATCHER.headingPenaltyPerDeg;
      forward = angleDelta(pos.heading, segBearing) <= 90;
    }
    if (way.id === previousWayId) score -= MATCHER.stickyBonus;

    if (!best || score < best.score) {
      best = {
        way,
        distance: bestSeg.dist,
        // đổi ngược điểm chiếu từ hệ mét về toạ độ địa lý
        snapped: {
          lat: origin.lat + bestSeg.cy / METERS_PER_LAT,
          lon: origin.lon + bestSeg.cx / Math.max(1, metersPerLon(origin.lat)),
        },
        courseBearing: forward ? segBearing : (segBearing + 180) % 360,
        forward,
        score,
      };
    }
  }

  return best;
}
