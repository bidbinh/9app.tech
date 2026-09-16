// 9speed — điều phối toàn bộ app.
//
// Vòng đời một bản định vị:
//   fix → tải dữ liệu OSM quanh đó → bắt đường (map matching) →
//   suy ra giới hạn tốc độ → so với tốc độ hiện tại → cảnh báo → vẽ giao diện.

import { VEHICLES, SPEED, MAP } from './config.js';
import { loadSettings, saveSettings, cacheClear } from './store.js';
import { RoadData } from './overpass.js';
import { TileRoadData } from './tiles.js';
import { Overlay } from './overlay.js';
import { matchRoad } from './matcher.js';
import { resolveSpeedLimit } from './speedlimit.js';
import { PoiTracker } from './poi.js';
import { Alerts } from './alerts.js';
import { GpsSource } from './geo.js';
import { SimSource } from './sim.js';
import { MapView } from './mapview.js';
import { distance, kmh } from './geoutils.js';

const $ = (id) => document.getElementById(id);

const ui = {
  hero: $('hero'),
  speedValue: $('speed-value'),
  speedSub: $('speed-sub'),
  limitSign: $('limit-sign'),
  limitValue: $('limit-value'),
  limitSource: $('limit-source'),
  chipGps: $('chip-gps'), gpsText: $('gps-text'),
  chipData: $('chip-data'), dataText: $('data-text'),
  chipRoad: $('chip-road'),
  chipCorridor: $('chip-corridor'),
  overlayNote: $('overlay-note'), btnExportPoi: $('btn-export-poi'),
  alerts: $('alerts'), alertMain: $('alert-main'), alertIcon: $('alert-icon'),
  alertText: $('alert-text'), alertDist: $('alert-dist'),
  btnStart: $('btn-start'), btnSound: $('btn-sound'), btnSim: $('btn-sim'),
  btnSettings: $('btn-settings'), btnRecenter: $('btn-recenter'),
  sheet: $('sheet'), sheetBackdrop: $('sheet-backdrop'), btnCloseSheet: $('btn-close-sheet'),
  selVehicle: $('sel-vehicle'), chkSound: $('chk-sound'), chkVoice: $('chk-voice'),
  voiceNote: $('voice-note'),
  chkAwake: $('chk-awake'), chkFollow: $('chk-follow'),
  simControls: $('sim-controls'), rngSimSpeed: $('rng-sim-speed'), simSpeedLabel: $('sim-speed-label'),
  simHint: $('sim-hint'), btnClearCache: $('btn-clear-cache'), cacheNote: $('cache-note'),
};

const state = {
  settings: loadSettings(),
  running: false,
  simMode: false,
  lastFix: null,
  matchedWayId: null,
  limit: null,
  announcedLimit: null,
  overSince: 0,
  lastOverAlert: 0,
  wasOver: false,
  lastCoverageAt: 0,
  lastCoverageAt_pos: null,
  wakeLock: null,
  fixWatchdog: null,
  corridorName: null,
  overlayCounts: null,
};

const alerts = new Alerts(state.settings);
const poiTracker = new PoiTracker();

// Hai nguồn dữ liệu đường. Bộ tile tĩnh là nguồn chính: không tốn lượt gọi API,
// không dính rate limit, chạy được khi mất mạng. Overpass chỉ dùng khi ra ngoài
// vùng đã dựng sẵn (tức là ra khỏi Việt Nam) hoặc khi chưa dựng bộ tile.
const tileData = new TileRoadData({ onStatus: onDataStatus });
const overpassData = new RoadData({ onStatus: onDataStatus });
let roadData = overpassData;

function pickSource(lat, lon) {
  const next = tileData.ready && tileData.covers(lat, lon) ? tileData : overpassData;
  if (next !== roadData) {
    roadData = next;
    state.matchedWayId = null;
    poiTracker.reset();
  }
  return roadData;
}

// Lớp camera tự quản, chồng lên dữ liệu OSM (OSM chỉ có 45 điểm camera cả nước)
const overlay = new Overlay({ onStatus: onOverlayStatus });

const mapView = new MapView('map', {
  onMapClick: (lat, lon) => {
    if (!state.simMode) return;
    simSource.setStart(lat, lon);
    ui.simHint.hidden = true;
    if (!state.running) toggleRun(true);
  },
  onMapLongPress: (lat, lon) => {
    // Nhấn giữ lên điểm mình đã đánh dấu thì xoá, chỗ trống thì thêm mới
    const removed = overlay.removeMyPointNear(lat, lon);
    if (removed) {
      alerts.cue('clear');
      refreshOverlayNote(`Đã xoá “${removed.label}”.`);
      return;
    }
    const label = prompt('Đánh dấu điểm camera — mô tả ngắn:', 'Camera phạt nguội');
    if (!label) return;
    overlay.addMyPoint(lat, lon, label.trim());
    alerts.cue('camera');
    refreshOverlayNote('Đã thêm điểm. Nhấn giữ lại lên điểm đó để xoá.');
    if (state.lastFix) onFix(state.lastFix);
  },
});
mapView.onFollowChange = (v) => {
  state.settings.followMap = v;
  ui.chkFollow.checked = v;
  mapView.setFollow(v);
  ui.btnRecenter.hidden = v;
  saveSettings(state.settings);
};

const gpsSource = new GpsSource({ onFix, onError: onGpsError });
const simSource = new SimSource({ onFix, getWays: () => roadData.ways });

/* ------------------------------------------------------------------ */
/* Xử lý mỗi bản định vị                                               */
/* ------------------------------------------------------------------ */

function onFix(fix) {
  state.lastFix = fix;
  armFixWatchdog();
  setGpsChip('live', fix.source === 'sim'
    ? 'Mô phỏng'
    : `GPS ±${Math.round(fix.accuracy ?? 0)} m`);

  pickSource(fix.lat, fix.lon);
  const pending = requestCoverage(fix);
  const dataSig = roadData.ways.size + roadData.nodes.size;
  applyFix(fix);
  const missedRoad = !state.matchedWayId;
  if (pending) {
    pending.then(() => {
      if (!state.lastFix) return;
      const grew = roadData.ways.size + roadData.nodes.size !== dataSig;
      if (missedRoad || grew) applyFix(state.lastFix);
    }).catch(() => { /* tải lỗi đã hiện trên chip dữ liệu */ });
  }
}

function applyFix(fix) {
  pickSource(fix.lat, fix.lon);
  const match = matchRoad(fix, roadData.ways, state.matchedWayId);
  state.matchedWayId = match ? match.way.id : null;

  const limitInfo = resolveSpeedLimit(match, state.settings.vehicle, roadData.ways, fix);

  // Trộn điểm camera tự quản vào cùng tập điểm cảnh báo của OSM
  const extra = overlay.nodesNear(fix.lat, fix.lon, 1500);
  const nodes = extra.length ? new Map([...roadData.nodes, ...extra]) : roadData.nodes;
  const { ahead, newAlerts } = poiTracker.update(fix, nodes, {
    match, ways: roadData.ways, vehicle: state.settings.vehicle,
  });

  const corridor = overlay.corridorFor(match?.way, fix.lat, fix.lon);

  handleSpeedAlerts(fix, limitInfo);
  handlePoiAlerts(newAlerts);
  handleCorridor(corridor);

  render(fix, match, limitInfo, ahead, corridor);
}

/** Vào/ra tuyến giám sát: chỉ báo một lần mỗi lần đổi tuyến. */
function handleCorridor(corridor) {
  const name = corridor ? corridor.name : null;
  if (name === state.corridorName) return;
  state.corridorName = name;
}

/**
 * Nạp dữ liệu quanh vị trí, có tiết chế theo quãng đường đã đi.
 * Bộ tile tĩnh rẻ nên kiểm tra dày hơn; Overpass thì phải giãn ra.
 */
function requestCoverage(fix) {
  const now = Date.now();
  const prev = state.lastCoverageAt_pos;
  const moved = prev ? distance(prev.lat, prev.lon, fix.lat, fix.lon) : Infinity;
  const onTiles = roadData === tileData;
  if (moved < (onTiles ? 250 : 120) && now - state.lastCoverageAt < (onTiles ? 2000 : 5000)) return null;
  state.lastCoverageAt = now;
  state.lastCoverageAt_pos = { lat: fix.lat, lon: fix.lon };
  return roadData.ensureCoverage(fix.lat, fix.lon, fix.heading);
}

function handleSpeedAlerts(fix, limitInfo) {
  const speedKmh = kmh(fix.speed);
  const limit = limitInfo.limit;
  const now = Date.now();

  if (limit !== null && limit !== state.announcedLimit && fix.speed > SPEED.stopThreshold) {
    state.announcedLimit = limit;
  }
  if (limit === null) state.announcedLimit = null;
  state.limit = limit;

  if (limit === null) { state.overSince = 0; state.wasOver = false; return; }

  const over = speedKmh > limit + SPEED.tolerance;
  if (over) {
    if (!state.overSince) state.overSince = now;
    const sustained = now - state.overSince >= SPEED.overSpeedDebounce;
    const dueAgain = now - state.lastOverAlert >= SPEED.overSpeedRepeat;
    if (sustained && dueAgain) {
      state.lastOverAlert = now;
      state.wasOver = true;
      alerts.overSpeed(Math.round(speedKmh), limit);
    }
  } else {
    if (state.wasOver && state.overSince) alerts.backToLimit();
    state.overSince = 0;
    state.wasOver = false;
  }
}

function handlePoiAlerts(newAlerts) {
  if (newAlerts[0]) alerts.poi(newAlerts[0]);
}

/* ------------------------------------------------------------------ */
/* Vẽ giao diện                                                        */
/* ------------------------------------------------------------------ */

function render(fix, match, limitInfo, ahead, corridor) {
  const speedKmh = kmh(fix.speed);
  ui.speedValue.textContent = String(Math.round(speedKmh));

  const over = limitInfo.limit !== null && speedKmh > limitInfo.limit + SPEED.tolerance;
  ui.hero.classList.toggle('over', over && state.overSince > 0);

  // Biển giới hạn
  if (limitInfo.limit === null) {
    ui.limitValue.textContent = '--';
    ui.limitSign.className = 'limit-sign unknown';
    ui.limitSource.textContent = match ? 'chưa có dữ liệu biển báo' : 'chưa bắt được đường';
  } else {
    ui.limitValue.textContent = String(limitInfo.limit);
    ui.limitSign.className = 'limit-sign' + (limitInfo.source === 'law' ? ' law' : '');
    ui.limitSource.textContent = limitInfo.source === 'osm' ? 'biển báo' : 'ước lượng';
  }

  const roadLabel = [limitInfo.roadName, limitInfo.roadClass].filter(Boolean).join(' · ') || 'Không rõ đường';
  ui.chipRoad.textContent = roadLabel;
  ui.speedSub.textContent = match
    ? (match.distance > 25 ? `lệch ${Math.round(match.distance)} m` : roadLabel)
    : 'Đang tìm đường…';

  ui.chipCorridor.hidden = !corridor;

  if (ahead.length === 0) {
    ui.alerts.hidden = true;
  } else {
    const top = ahead[0];
    ui.alerts.hidden = false;
    ui.alertMain.className = 'alert-item sev-' + top.info.severity;
    ui.alertIcon.textContent = top.info.type === 'railway' ? '🚂'
      : top.info.type === 'ban' ? '🚫' : '⚠';
    ui.alertText.textContent = top.info.type === 'railway'
      ? 'Cắt đường sắt'
      : top.info.type === 'ban'
        ? (top.info.label || 'Cấm rẽ')
        : (top.info.speed ? `Phạt tốc độ ${top.info.speed}` : 'Phạt nguội');
    ui.alertDist.textContent = `${Math.round(top.distance)} m`;
  }

  mapView.updatePosition(fix);
  mapView.highlightRoad(match);
  mapView.renderPois(ahead);
}

function onDataStatus(s) {
  const src = roadData === tileData ? 'Offline' : 'Overpass';
  if (s.state === 'loading') {
    ui.dataText.textContent = `${src}: đang tải…`;
    ui.chipData.className = 'chip stale';
  } else if (s.state === 'error') {
    ui.dataText.textContent = `${src}: lỗi tải`;
    ui.chipData.className = 'chip err';
    ui.chipData.title = s.message || '';
  } else if (s.state === 'unavailable') {
    ui.dataText.textContent = 'Overpass (chưa có bộ offline)';
    ui.chipData.className = 'chip stale';
    ui.chipData.title = s.message || '';
  } else {
    ui.dataText.textContent = `${src}: ${s.ways} đường · ${s.nodes} biển`;
    ui.chipData.className = 'chip';
    if (s.built) ui.chipData.title = `Dữ liệu OSM dựng ngày ${new Date(s.built).toLocaleDateString('vi-VN')}`;
  }
}

function onOverlayStatus(s) {
  state.overlayCounts = s;
  refreshOverlayNote(s.state === 'unavailable' ? 'Chưa dựng lớp overlay (chạy: npm run build:overlay).' : null);
}

function refreshOverlayNote(extra) {
  const c = state.overlayCounts;
  if (!c) return;
  const parts = [`${c.points} điểm camera`, `${c.corridors} tuyến giám sát`];
  if (c.mine) parts.push(`${c.mine} điểm của bạn`);
  ui.overlayNote.textContent = parts.join(' · ') + (extra ? ` — ${extra}` : '');
}

function setGpsChip(cls, text) {
  ui.chipGps.className = 'chip ' + cls;
  ui.gpsText.textContent = text;
}

function onGpsError(err) {
  const messages = {
    1: 'Bị từ chối quyền vị trí',
    2: 'Không lấy được vị trí',
    3: 'Hết thời gian chờ GPS',
  };
  setGpsChip('err', messages[err.code] || err.message || 'Lỗi định vị');
  if (err.code === 1) {
    ui.speedSub.textContent = 'Hãy cho phép truy cập vị trí trong cài đặt trình duyệt.';
  }
}

/** Không nhận được fix mới trong 8 giây thì báo tín hiệu yếu. */
function armFixWatchdog() {
  clearTimeout(state.fixWatchdog);
  state.fixWatchdog = setTimeout(() => {
    if (state.running) setGpsChip('stale', 'Tín hiệu yếu');
  }, 8000);
}

/* ------------------------------------------------------------------ */
/* Điều khiển                                                          */
/* ------------------------------------------------------------------ */

async function toggleRun(force) {
  const next = force !== undefined ? force : !state.running;
  if (next === state.running) return;

  if (next) {
    await alerts.unlock();
    poiTracker.reset();
    state.announcedLimit = null;
    if (state.simMode) {
      if (!simSource.pos) {
        const c = mapView.map.getCenter();
        simSource.setStart(c.lat, c.lng);
      }
      simSource.setSpeedKmh(Number(ui.rngSimSpeed.value));
      simSource.start();
      setGpsChip('live', 'Mô phỏng');
      // Nạp sẵn dữ liệu quanh điểm xuất phát để xe ảo có đường mà bám
      pickSource(simSource.pos.lat, simSource.pos.lon);
      roadData.ensureCoverage(simSource.pos.lat, simSource.pos.lon, null);
    } else {
      if (!gpsSource.start()) return;
      setGpsChip('stale', 'Đang định vị…');
    }
    await requestWakeLock();
    state.running = true;
    ui.btnStart.textContent = 'Dừng hành trình';
    ui.btnStart.classList.add('on');
  } else {
    gpsSource.stop();
    simSource.stop();
    alerts.stopAll();
    releaseWakeLock();
    clearTimeout(state.fixWatchdog);
    state.running = false;
    ui.btnStart.textContent = 'Bắt đầu hành trình';
    ui.btnStart.classList.remove('on');
    setGpsChip('', 'Đã dừng');
  }
}

function toggleSim() {
  const wasRunning = state.running;
  if (wasRunning) toggleRun(false);
  state.simMode = !state.simMode;
  ui.btnSim.classList.toggle('active', state.simMode);
  ui.btnSim.setAttribute('aria-pressed', String(state.simMode));
  ui.simControls.hidden = !state.simMode;
  ui.simHint.hidden = !state.simMode;
  mapView.setExploreMode(state.simMode);
  if (!state.simMode) simSource.stop();
  setGpsChip('', state.simMode ? 'Mô phỏng — chọn điểm xuất phát' : 'Đã dừng');
}

async function requestWakeLock() {
  if (!state.settings.keepAwake || !('wakeLock' in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
  } catch {
    /* một số trình duyệt chặn khi tab không hiển thị */
  }
}

function releaseWakeLock() {
  try { state.wakeLock?.release(); } catch { /* đã nhả rồi */ }
  state.wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.running && !state.wakeLock) requestWakeLock();
});

/* ------------------------------------------------------------------ */
/* Khởi tạo giao diện                                                  */
/* ------------------------------------------------------------------ */

function initSettingsUi() {
  for (const [key, v] of Object.entries(VEHICLES)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = v.label;
    ui.selVehicle.appendChild(opt);
  }
  ui.selVehicle.value = state.settings.vehicle;
  ui.chkSound.checked = state.settings.sound;
  ui.chkVoice.checked = state.settings.voice;
  alerts.onVoiceInfo = refreshVoiceNote;
  refreshVoiceNote();
  ui.chkAwake.checked = state.settings.keepAwake;
  ui.chkFollow.checked = state.settings.followMap;
  mapView.setFollow(state.settings.followMap);
  ui.btnRecenter.hidden = state.settings.followMap;
  ui.btnSound.classList.toggle('off', !state.settings.sound);
  ui.btnSound.setAttribute('aria-pressed', String(state.settings.sound));

  const persist = () => saveSettings(state.settings);

  ui.selVehicle.addEventListener('change', () => {
    state.settings.vehicle = ui.selVehicle.value;
    state.announcedLimit = null;
    persist();
    if (state.lastFix) onFix(state.lastFix);
  });
  ui.chkSound.addEventListener('change', () => {
    state.settings.sound = ui.chkSound.checked;
    ui.btnSound.classList.toggle('off', !state.settings.sound);
  ui.btnSound.setAttribute('aria-pressed', String(state.settings.sound));
    persist();
  });
  ui.chkVoice.addEventListener('change', () => {
    state.settings.voice = ui.chkVoice.checked;
    persist();
    if (state.settings.voice) {
      alerts.unlock().then(() => {
        if (state.settings.voice) alerts.voiceOn();
      });
    } else {
      alerts.stopAll();
    }
  });
  ui.chkAwake.addEventListener('change', () => {
    state.settings.keepAwake = ui.chkAwake.checked;
    persist();
    if (state.settings.keepAwake && state.running) requestWakeLock();
    else releaseWakeLock();
  });
  ui.chkFollow.addEventListener('change', () => {
    state.settings.followMap = ui.chkFollow.checked;
    mapView.setFollow(ui.chkFollow.checked);
    ui.btnRecenter.hidden = ui.chkFollow.checked;
    persist();
  });

  ui.rngSimSpeed.addEventListener('input', () => {
    ui.simSpeedLabel.textContent = ui.rngSimSpeed.value;
    simSource.setSpeedKmh(Number(ui.rngSimSpeed.value));
  });

  ui.btnExportPoi.addEventListener('click', () => {
    if (overlay.myPoints.length === 0) {
      refreshOverlayNote('Bạn chưa đánh dấu điểm nào.');
      return;
    }
    const blob = new Blob([overlay.exportMine()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `9speed-diem-cua-toi-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    refreshOverlayNote(`Đã xuất ${overlay.myPoints.length} điểm — gửi file này để bổ sung vào overlay/cameras.json.`);
  });

  ui.btnClearCache.addEventListener('click', async () => {
    const ok = await cacheClear();
    ui.cacheNote.textContent = ok
      ? 'Đã xoá bộ nhớ đệm bản đồ (ô đường và ảnh nền). Vỏ ứng dụng giữ nguyên để mở được khi mất mạng.'
      : 'Không xoá được bộ nhớ đệm trên trình duyệt này.';
  });
}

function refreshVoiceNote(info) {
  const el = ui.voiceNote;
  if (!el) return;
  const v = info || alerts.voiceInfo();
  if (v.via === 'he-thong') {
    el.textContent = `Đang dùng giọng máy: ${v.name}.`;
    el.className = 'note';
  } else if (v.via === 'hoai-my') {
    el.textContent = 'Đang dùng giọng tiếng Việt có sẵn (Hoài My). Không dùng giọng Anh của Windows.';
    el.className = 'note';
  } else {
    el.textContent = 'Bấm bắt đầu hành trình để tải giọng tiếng Việt. Máy này không có gói vi-VN — sẽ không dùng giọng Anh.';
    el.className = 'note warn';
  }
}

function openSheet(open) {
  ui.sheet.hidden = !open;
  ui.sheetBackdrop.hidden = !open;
  ui.btnSettings.setAttribute('aria-expanded', String(open));
  $('app').inert = open;
  if (open) ui.btnCloseSheet.focus();
  else ui.btnSettings.focus();
}

document.addEventListener('keydown', (event) => {
  if (ui.sheet.hidden) return;
  if (event.key === 'Escape') openSheet(false);
  if (event.key === 'Tab') {
    const items = [...ui.sheet.querySelectorAll('button, select, input')].filter(el => el.getClientRects().length && !el.disabled);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

ui.btnStart.addEventListener('click', () => toggleRun());
ui.btnSim.addEventListener('click', toggleSim);
ui.btnSettings.addEventListener('click', () => openSheet(true));
ui.btnCloseSheet.addEventListener('click', () => openSheet(false));
ui.sheetBackdrop.addEventListener('click', () => openSheet(false));
ui.btnSound.addEventListener('click', () => {
  ui.chkSound.checked = !ui.chkSound.checked;
  ui.chkSound.dispatchEvent(new Event('change'));
  alerts.unlock().then(() => { if (state.settings.sound) alerts.preview(); });
});
ui.btnRecenter.addEventListener('click', () => {
  ui.chkFollow.checked = true;
  ui.chkFollow.dispatchEvent(new Event('change'));
  if (state.lastFix) mapView.map.panTo([state.lastFix.lat, state.lastFix.lon]);
});

window.addEventListener('resize', () => mapView.invalidate());
requestAnimationFrame(() => mapView.invalidate());
document.addEventListener('touchstart', () => alerts.unlock(), { once: true, passive: true });

initSettingsUi();

// Nạp bản kê bộ dữ liệu offline. Không có cũng chạy được - app tự lùi về Overpass.
// Lớp camera tự quản nạp song song, thiếu cũng không sao.
await Promise.all([tileData.init(), overlay.init()]);

// Định vị một lần khi mở app để bản đồ nhảy về đúng khu vực người dùng
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    (p) => {
      if (state.running) return;
      mapView.map.setView([p.coords.latitude, p.coords.longitude], MAP.zoom);
      pickSource(p.coords.latitude, p.coords.longitude);
      roadData.ensureCoverage(p.coords.latitude, p.coords.longitude, null);
    },
    () => { /* chưa cấp quyền cũng không sao, bấm Bắt đầu sẽ hỏi lại */ },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
  );
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* không bắt buộc */ });
}
