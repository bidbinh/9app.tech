import { query } from './db.js';
import * as registry from './carriers/index.js';
import { haversineKm } from './geo.js';

export { PROVINCES } from './geo.js';

// Đồng bộ điểm nhận gửi từ các adapter có năng lực officeList.
export async function syncPickupPoints() {
  let n = 0;
  for (const a of registry.list()) {
    if (!a.capabilities.officeList) continue;
    let pts;
    try { pts = await a.listPickupPoints({}); } catch { continue; }
    for (const p of pts) {
      await query(
        `INSERT INTO pickup_points(id, carrier, type, name, address, lat, lng, hours, source, synced_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, address=EXCLUDED.address, lat=EXCLUDED.lat,
           lng=EXCLUDED.lng, hours=EXCLUDED.hours, source=EXCLUDED.source, synced_at=now()`,
        [p.id, p.carrier, p.type || 'carrier_office', p.name, p.address, p.lat, p.lng, p.hours || '', p.source || ''],
      );
      n += 1;
    }
  }
  return n;
}

// Các điểm của một hãng gần tọa độ, gần nhất trước. radiusKm giới hạn tầm tìm.
export async function nearestPoints(carrier, lat, lng, { limit = 3, radiusKm = 25 } = {}) {
  const rows = await query('SELECT * FROM pickup_points WHERE carrier=$1', [carrier]);
  return rows
    .map((p) => ({ ...p, distanceKm: Math.round(haversineKm(lat, lng, p.lat, p.lng) * 10) / 10 }))
    .filter((p) => p.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export async function pointsNear(lat, lng, { carrier, radiusKm = 10, limit = 30 } = {}) {
  const rows = carrier
    ? await query('SELECT * FROM pickup_points WHERE carrier=$1', [carrier])
    : await query('SELECT * FROM pickup_points');
  return rows
    .map((p) => ({ ...p, distanceKm: Math.round(haversineKm(lat, lng, p.lat, p.lng) * 10) / 10 }))
    .filter((p) => p.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
