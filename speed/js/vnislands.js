// Hoàng Sa và Trường Sa — bắt buộc hiện trên bản đồ Việt Nam khi zoom xa.
// OSM khi zoom phố không vẽ tên hai quần đảo; lớp này gắn nhãn khi zoom ≤ 10
// (chỉ chế độ mô phỏng mới zoom được).

import { VN_ISLANDS } from './config.js';

const BOX_STYLE = {
  color: '#38bdf8',
  weight: 1.5,
  dashArray: '5 4',
  fillColor: '#38bdf8',
  fillOpacity: 0.08,
  pane: 'islands',
};

function labelIcon(title, sub) {
  return L.divIcon({
    className: 'island-label',
    html: `<div class="island-label-inner"><strong>${title}</strong><span>${sub}</span></div>`,
    iconSize: [148, 36],
    iconAnchor: [74, 18],
  });
}

function islandLayers() {
  const group = L.layerGroup();
  for (const key of ['hoangSa', 'truongSa']) {
    const g = VN_ISLANDS[key];
    L.rectangle(g.bounds, BOX_STYLE).addTo(group);
    L.marker(g.center, {
      icon: labelIcon(g.name, `(${g.admin})`),
      interactive: false,
      keyboard: false,
      pane: 'islands',
    }).addTo(group);
  }
  return group;
}

/**
 * @param {L.Map} map
 */
export function addVietnamIslands(map) {
  map.createPane('islands');
  map.getPane('islands').style.zIndex = 350;
  map.getPane('islands').style.pointerEvents = 'none';

  const labels = islandLayers();
  const sync = () => {
    const z = map.getZoom();
    if (z <= VN_ISLANDS.labelMaxZoom) {
      if (!map.hasLayer(labels)) map.addLayer(labels);
    } else if (map.hasLayer(labels)) {
      map.removeLayer(labels);
    }
  };
  map.on('zoomend', sync);
  sync();
}
