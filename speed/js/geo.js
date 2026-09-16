// Nguồn vị trí thật từ GPS thiết bị.
//
// Trình duyệt trả coords.speed trên đa số điện thoại nhưng hay là null trên
// laptop, nên luôn có phương án tính tốc độ từ quãng đường / thời gian.

import { SPEED } from './config.js';
import { distance, bearing, angleDelta } from './geoutils.js';

/**
 * Một số WebView Android trả heading = 0 khi chưa có compass, không phải hướng Bắc.
 * Chỉ nhận 0 khi hướng suy từ quỹ đạo (hoặc hướng gần nhất) cũng quanh Bắc.
 *
 * @param {number|null} gpsHeading coords.heading đã lọc NaN
 * @param {number|null} derived hướng từ hai điểm GPS
 * @param {number|null} lastHeading hướng tin cậy gần nhất
 */
export function resolveGpsHeading(gpsHeading, derived, lastHeading) {
  if (gpsHeading !== null && gpsHeading !== 0) return gpsHeading;
  if (derived !== null) {
    if (gpsHeading === 0 && angleDelta(derived, 0) <= 25) return 0;
    return derived;
  }
  if (gpsHeading === 0 && lastHeading !== null && angleDelta(lastHeading, 0) <= 25) {
    return 0;
  }
  if (gpsHeading === 0) return null;
  return lastHeading;
}

export class GpsSource {
  constructor({ onFix, onError }) {
    this.onFix = onFix;
    this.onError = onError || (() => {});
    this.watchId = null;
    this.prev = null;
    this.smoothSpeed = 0;
    this.lastHeading = null;
  }

  get running() { return this.watchId !== null; }

  start() {
    if (!('geolocation' in navigator)) {
      this.onError(new Error('Thiết bị/trình duyệt không hỗ trợ định vị'));
      return false;
    }
    if (this.watchId !== null) return true;
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this.#handle(p),
      (e) => this.onError(e),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return true;
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.prev = null;
    this.smoothSpeed = 0;
  }

  #handle(position) {
    const c = position.coords;
    const now = position.timestamp || Date.now();
    const fix = {
      lat: c.latitude,
      lon: c.longitude,
      accuracy: c.accuracy ?? null,
      timestamp: now,
      source: 'gps',
    };

    let raw = Number.isFinite(c.speed) && c.speed !== null ? c.speed : null;
    const gpsHeading = Number.isFinite(c.heading) && c.heading !== null ? c.heading : null;
    let derived = null;

    if (this.prev) {
      const dt = (now - this.prev.timestamp) / 1000;
      const d = distance(this.prev.lat, this.prev.lon, fix.lat, fix.lon);
      if (dt > 0.2 && dt < 30) {
        if (raw === null) raw = d / dt;
        if (d > Math.max(6, (c.accuracy || 10) * 0.7)) {
          derived = bearing(this.prev.lat, this.prev.lon, fix.lat, fix.lon);
        }
      }
    }
    if (raw === null) raw = 0;

    const heading = resolveGpsHeading(gpsHeading, derived, this.lastHeading);

    // Làm mượt EMA; đứng yên thì kéo thẳng về 0 để đồng hồ không "trôi"
    this.smoothSpeed = raw < SPEED.stopThreshold
      ? Math.min(this.smoothSpeed * 0.4, raw)
      : this.smoothSpeed + (raw - this.smoothSpeed) * SPEED.smoothing;

    if (heading !== null) this.lastHeading = heading;
    fix.speed = Math.max(0, this.smoothSpeed);
    fix.rawSpeed = raw;
    fix.heading = this.smoothSpeed >= SPEED.stopThreshold ? (heading ?? this.lastHeading) : this.lastHeading;

    this.prev = fix;
    this.onFix(fix);
  }
}
