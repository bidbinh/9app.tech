// Lớp bọc Leaflet: mũi tên vị trí, tô sáng đường đang đi, đánh dấu biển báo.
// Live GPS: khoá zoom, bám xe. Mô phỏng: mở zoom để xem cả nước / Hoàng Sa · Trường Sa.

import { MAP } from './config.js';
import { addVietnamIslands } from './vnislands.js';

const POI_EMOJI = {
  camera: '📷', speed: '🚸', warning: '⚠️', railway: '🚂',
  bump: '🚧', stop: '🛑', prohibit: '🚫', zone: '🏙️',
};

export class MapView {
  constructor(elementId, { onMapClick, onMapLongPress } = {}) {
    this.map = L.map(elementId, {
      zoomControl: false,
      attributionControl: true,
      tap: true,
      minZoom: MAP.minZoom,
      maxZoom: MAP.maxZoom,
      maxBounds: MAP.maxBounds,
      maxBoundsViscosity: 0.85,
      worldCopyJump: false,
      scrollWheelZoom: false,
      touchZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
    }).setView(MAP.center, MAP.zoom);

    L.tileLayer(MAP.tileUrl, {
      minZoom: MAP.minZoom,
      maxZoom: MAP.maxZoom,
      bounds: MAP.maxBounds,
      attribution: MAP.attribution,
    }).addTo(this.map);

    this.zoomControl = L.control.zoom({ position: 'bottomleft' });
    this._explore = false;
    addVietnamIslands(this.map);

    this.marker = L.marker(MAP.center, {
      icon: L.divIcon({
        className: 'veh-icon',
        html: '<div class="veh-arrow"></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(this.map);

    this.accuracyCircle = L.circle(MAP.center, {
      radius: 0, color: '#38bdf8', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.12,
    }).addTo(this.map);

    this.roadLine = L.polyline([], {
      color: '#22d3ee', weight: 9, opacity: 0.45, lineCap: 'round',
    }).addTo(this.map);

    this.poiLayer = L.layerGroup().addTo(this.map);
    this.poiMarkers = new Map();

    this.follow = true;
    this._programmaticMove = false;

    // Người dùng tự kéo bản đồ thì tạm dừng bám theo xe
    this.map.on('dragstart', () => {
      if (!this._programmaticMove && this.onFollowChange) this.onFollowChange(false);
    });
    if (onMapClick) this.map.on('click', (e) => onMapClick(e.latlng.lat, e.latlng.lng));
    // Leaflet phát 'contextmenu' cho cả chuột phải lẫn nhấn giữ trên cảm ứng
    if (onMapLongPress) {
      this.map.on('contextmenu', (e) => onMapLongPress(e.latlng.lat, e.latlng.lng));
    }
  }

  setFollow(v) { this.follow = v; }

  /**
   * Mô phỏng: cho zoom (xem Hoàng Sa / Trường Sa). Live GPS: khoá zoom lái xe.
   * @param {boolean} on
   */
  setExploreMode(on) {
    on = !!on;
    if (this._explore === on) return;
    this._explore = on;
    if (on) {
      this.zoomControl.addTo(this.map);
      this.map.scrollWheelZoom.enable();
      this.map.touchZoom.enable();
      this.map.doubleClickZoom.enable();
      this.map.boxZoom.enable();
    } else {
      this.map.removeControl(this.zoomControl);
      this.map.scrollWheelZoom.disable();
      this.map.touchZoom.disable();
      this.map.doubleClickZoom.disable();
      this.map.boxZoom.disable();
      this.map.setZoom(MAP.zoom);
    }
  }

  updatePosition(fix) {
    const ll = [fix.lat, fix.lon];
    this.marker.setLatLng(ll);
    this.accuracyCircle.setLatLng(ll).setRadius(fix.accuracy || 0);

    const arrow = this.marker.getElement()?.querySelector('.veh-arrow');
    if (arrow) {
      const h = Number.isFinite(fix.heading) ? fix.heading : 0;
      arrow.style.transform = `rotate(${h}deg)`;
    }
    if (this.follow) {
      this._programmaticMove = true;
      this.map.panTo(ll, { animate: true, duration: 0.5 });
      setTimeout(() => { this._programmaticMove = false; }, 600);
    }
  }

  highlightRoad(match) {
    if (!match) { this.roadLine.setLatLngs([]); return; }
    this.roadLine.setLatLngs(match.way.geom.map((p) => [p.lat, p.lon]));
  }

  /** Vẽ/cập nhật các điểm cảnh báo đang ở gần. */
  renderPois(items) {
    const seen = new Set();
    for (const item of items) {
      const id = item.node.id;
      seen.add(id);
      if (!this.poiMarkers.has(id)) {
        const emoji = POI_EMOJI[item.info.icon] || '⚠️';
        const marker = L.marker([item.node.lat, item.node.lon], {
          icon: L.divIcon({
            className: 'poi-icon',
            html: `<div class="poi-bubble sev-${item.info.severity}">${emoji}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).bindPopup(`<b>${item.info.label}</b>`);
        marker.addTo(this.poiLayer);
        this.poiMarkers.set(id, marker);
      }
    }
    for (const [id, marker] of this.poiMarkers) {
      if (!seen.has(id)) { this.poiLayer.removeLayer(marker); this.poiMarkers.delete(id); }
    }
  }

  invalidate() { this.map.invalidateSize(); }
}
