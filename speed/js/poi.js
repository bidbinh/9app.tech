// Nhận diện & theo dõi điểm dễ bị phạt phía trước.
//
// Giữ hẹp: camera / đèn phạt, cắt đường sắt, biển cấm (rẽ, quay đầu, ngược
// chiều, đường cấm). Biển phụ, gờ giảm tốc, dừng, khu dân cư — HUD tốc độ lo.

import { POI } from './config.js';
import { distance, bearing, angleDelta, projectOntoPolyline } from './geoutils.js';
import { parseMaxspeed } from './speedlimit.js';
import { pathsAhead } from './matcher.js';
import { hoursApplies, hoursFromTags, hoursShort, hoursSpans } from './hours.js';

const RAIL_SIGN = new Set([210, 211, 242]);

const EXCEPT_VEH = {
  motorcar: 'car', vehicle: 'car',
  motorcycle: 'moto', moped: 'moto',
  hgv: 'truck', goods: 'truck',
  bus: 'bus', psv: 'bus',
};

function blobOf(tags) {
  const t = tags || {};
  const parts = [];
  for (const [k, v] of Object.entries(t)) {
    if (v == null || v === '') continue;
    if (k === 'restriction' || k.startsWith('restriction') || k === 'traffic_sign'
      || k === 'description' || k === 'note' || k === 'name') {
      parts.push(String(v));
    }
  }
  return parts.join(' ').toLowerCase();
}

function vnCodes(tags) {
  const raw = String(tags.traffic_sign || '');
  const out = [];
  const re = /(?:vn:)?(\d{3})/gi;
  let m;
  while ((m = re.exec(raw))) out.push(Number(m[1]));
  return out;
}

function exceptVehicles(tags) {
  const raw = String(tags.except || '').toLowerCase();
  if (!raw) return [];
  const set = new Set();
  for (const [token, veh] of Object.entries(EXCEPT_VEH)) {
    if (raw.includes(token)) set.add(veh);
  }
  return [...set];
}

function restrictionVehicle(tags) {
  const t = tags || {};
  const keys = Object.keys(t).filter((k) => k === 'restriction' || k.startsWith('restriction:'));
  if (!keys.length) return null;
  const onlyHgv = keys.every((k) => /:hgv|:goods/.test(k));
  if (onlyHgv) return ['truck'];
  const onlyMoto = keys.every((k) => /:motorcycle|:moped/.test(k));
  if (onlyMoto) return ['moto'];
  const onlyBus = keys.every((k) => /:bus|:psv/.test(k));
  if (onlyBus) return ['bus'];
  return null;
}

function turnBan(tags) {
  const blob = blobOf(tags);
  const codes = vnCodes(tags);
  if (/no_u_turn|u_turn/.test(blob) || codes.includes(124)) {
    return { speak: 'Cấm quay đầu', label: 'Cấm quay đầu' };
  }
  if (/no_right_turn/.test(blob) || /rẽ phải/.test(blob)) {
    return { speak: 'Cấm rẽ phải', label: 'Cấm rẽ phải' };
  }
  if (/no_left_turn/.test(blob) || /rẽ trái/.test(blob)) {
    return { speak: 'Cấm rẽ trái', label: 'Cấm rẽ trái' };
  }
  if (/no_entry|no_straight_on/.test(blob) || codes.includes(102)) {
    return { speak: 'Cấm đi ngược chiều', label: 'Cấm ngược chiều' };
  }
  if (codes.includes(101)) return { speak: 'Đường cấm', label: 'Đường cấm' };
  if (codes.includes(103)) {
    return { speak: 'Cấm ô tô', label: 'Cấm ô tô', vehicles: ['car', 'truck', 'bus'] };
  }
  if (codes.includes(104)) {
    return { speak: 'Cấm mô tô', label: 'Cấm mô tô', vehicles: ['moto'] };
  }
  if (codes.includes(105)) {
    return { speak: 'Cấm ô tô mô tô', label: 'Cấm ô tô và mô tô' };
  }
  if (codes.includes(125)) return { speak: 'Cấm vượt', label: 'Cấm vượt' };
  if (codes.includes(123) || /\bno_right\b|\bno_left\b/.test(blob)) {
    return { speak: 'Cấm rẽ', label: 'Cấm rẽ' };
  }
  if (tHasRestriction(tags) && /no_/.test(blob)) {
    return { speak: 'Cấm rẽ', label: 'Cấm rẽ' };
  }
  return null;
}

function tHasRestriction(tags) {
  return Object.keys(tags || {}).some((k) => k === 'restriction' || k.startsWith('restriction:'));
}

function withHours(info, tags) {
  const hours = hoursFromTags(tags);
  if (!hours) return info;
  const short = hoursShort(hours);
  return {
    ...info,
    hours,
    hoursSpans: hoursSpans(hours),
    hoursLabel: short,
    label: short ? `${info.label} ${short}` : info.label,
  };
}

/**
 * Phân loại một node OSM thành cảnh báo. Null = bỏ qua.
 * @returns {null | {type:string, label:string, icon:string, severity:number, speed:number|null}}
 */
export function classifyNode(node) {
  const t = node.tags || {};

  if (t.highway === 'speed_camera' || t.enforcement === 'maxspeed') {
    const sp = parseMaxspeed(t.maxspeed);
    return {
      type: 'camera', icon: 'camera', severity: 3,
      label: sp ? `Camera tốc độ ${sp} km/h` : 'Camera tốc độ',
      speed: sp,
    };
  }
  if (t.enforcement === 'traffic_signals') {
    return {
      type: 'camera', icon: 'camera', severity: 3,
      label: 'Đèn phạt nguội', speed: null,
    };
  }
  if (t.railway === 'level_crossing') {
    return { type: 'railway', icon: 'railway', severity: 3, label: 'Giao cắt đường sắt', speed: null };
  }

  const codes = vnCodes(t);
  if (codes.some((n) => RAIL_SIGN.has(n))) {
    return { type: 'railway', icon: 'railway', severity: 3, label: 'Giao cắt đường sắt', speed: null };
  }

  const ban = turnBan(t);
  if (ban) {
    return withHours({
      type: 'ban',
      icon: 'prohibit',
      severity: 3,
      label: ban.label,
      speak: ban.speak,
      speed: null,
      vehicles: ban.vehicles || restrictionVehicle(t),
      except: exceptVehicles(t),
    }, t);
  }

  return null;
}

function isOverlayNode(node) {
  const id = String(node.id);
  return id.startsWith('ov:') || id.startsWith('my:');
}

function isPriority(info) {
  return info.type === 'camera' || info.type === 'railway' || info.type === 'ban';
}

export function banApplies(info, { vehicle = 'car', now = new Date() } = {}) {
  if (info.vehicles?.length && !info.vehicles.includes(vehicle)) return false;
  if (info.except?.includes(vehicle)) return false;
  if (!hoursApplies(info.hours, now, 10)) return false;
  return true;
}

/**
 * Tính danh sách cảnh báo phía trước và quyết định cái nào cần đọc thành tiếng.
 * Mỗi điểm chỉ đọc một lần cho tới khi xe đi xa hẳn rồi quay lại.
 *
 * Khi đã bắt được đường: chiếu POI lên polyline phía trước (theo cua), không
 * dùng nón 2D — tránh báo camera đường song song và sót camera sau khúc cua.
 */
export class PoiTracker {
  constructor() {
    this.announced = new Map(); // id -> khoảng cách gần nhất từng đạt được
  }

  /**
   * @param {{lat:number, lon:number, heading:number|null, speed:number}} pos
   * @param {Map<number,object>} nodes
   * @param {{match?:object, ways?:Map, vehicle?:string, now?:Date}} [ctx]
   * @returns {{ahead:Array, newAlerts:Array}}
   */
  update(pos, nodes, ctx = {}) {
    const lookahead = Math.max(
      POI.minLookahead,
      Math.min(POI.maxLookahead, pos.speed * POI.lookaheadSeconds),
    );
    const paths = ctx.match && ctx.ways
      ? pathsAhead(ctx.match, ctx.ways, lookahead)
      : [];
    const usePath = paths.some((p) => p.length >= 2);
    const vehicle = ctx.vehicle || 'car';
    const now = ctx.now || new Date();

    const ahead = [];
    const newAlerts = [];

    for (const node of nodes.values()) {
      const info = node._poi !== undefined ? node._poi : (node._poi = classifyNode(node));
      if (!info || !isPriority(info)) continue;
      if (info.type === 'ban' && !banApplies(info, { vehicle, now })) {
        this.announced.delete(node.id);
        continue;
      }

      const dEu = distance(pos.lat, pos.lon, node.lat, node.lon);

      if (dEu > POI.rearmDistance) {
        this.announced.delete(node.id);
        continue;
      }

      let keep = false;
      let d = dEu;

      if (usePath) {
        const lateralMax = (isOverlayNode(node) || info.type === 'ban')
          ? POI.junctionLateral
          : POI.roadLateral;
        let best = null;
        for (const path of paths) {
          if (path.length < 2) continue;
          const proj = projectOntoPolyline(node.lat, node.lon, path);
          if (!proj || proj.along < -15 || proj.along > lookahead) continue;
          if (!best || proj.dist < best.dist) best = proj;
        }
        if (best && best.dist <= lateralMax) {
          keep = true;
          d = Math.max(0, best.along);
        }
      } else if (dEu <= lookahead) {
        const hasHeading = pos.heading !== null && Number.isFinite(pos.heading);
        keep = true;
        if (hasHeading) {
          const brg = bearing(pos.lat, pos.lon, node.lat, node.lon);
          keep = dEu < 40 || angleDelta(pos.heading, brg) <= POI.coneDeg;
        }
      }
      if (!keep) continue;

      const item = { node, info, distance: d };
      ahead.push(item);

      if (!this.announced.has(node.id)) {
        this.announced.set(node.id, d);
        newAlerts.push(item);
      }
    }

    ahead.sort((a, b) => a.distance - b.distance);
    newAlerts.sort((a, b) => a.distance - b.distance);
    return { ahead, newAlerts };
  }

  reset() {
    this.announced.clear();
  }
}
