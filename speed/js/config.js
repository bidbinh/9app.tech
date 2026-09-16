// Cấu hình chung của 9speed
// Mọi hằng số "điều chỉnh được" nằm ở đây để dễ tinh chỉnh ngoài thực địa.

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const OVERPASS = {
  // Truy vấn hai tầng. Đo thực tế tại Cầu Giấy (Hà Nội):
  //   một tầng, bán kính 1000 m, mọi loại đường -> 1294 way, 798 KB, 10,5 s
  //   hai tầng 500/1200 m                        ->  442 way, 329 KB,  3,3 s
  // Kết quả khớp đường y hệt nhau, nên luôn dùng hai tầng.
  //
  // Tầng gần: mọi loại đường, đủ để bắt đúng con đường đang chạy (kể cả ngõ).
  radiusNear: 500,
  // Tầng xa: chỉ đường chính + toàn bộ biển báo, phục vụ cảnh báo phía trước.
  radiusFar: 1200,
  // Khoảng cách tối thiểu giữa 2 lần gọi API (ms) - tôn trọng rate limit của Overpass
  minInterval: 9000,
  // Bị máy chủ chặn (429/504) thì nghỉ hẳn bấy nhiêu ms trước khi thử lại
  throttleBackoff: 30000,
  timeoutMs: 25000,
  // Thời gian sống của cache (ms) - 3 ngày
  cacheTtl: 3 * 24 * 3600 * 1000,
};

export const MATCHER = {
  // Bỏ qua way cách vị trí hiện tại xa hơn mức này (m)
  maxSnapDistance: 45,
  // Phạt lệch hướng: mỗi độ lệch tính thêm bao nhiêu "mét ảo"
  headingPenaltyPerDeg: 0.6,
  // Chỉ tin heading khi tốc độ đủ lớn (m/s) - đứng yên thì heading GPS rất nhiễu
  headingMinSpeed: 2.2,
  // Ưu tiên giữ way cũ: trừ điểm phạt để tránh nhảy qua lại giữa 2 đường song song
  stickyBonus: 12,
  // Phạt theo cấp đường (mét ảo). Đường gom, ngõ, lối vào bãi xe hay chạy sát
  // đường chính và dễ "cướp" kết quả khớp, nên bị phạt nặng hơn.
  classPenalty: {
    service: 20,
    road: 8,
    residential: 4,
    living_street: 4,
    unclassified: 3,
  },
};

export const SPEED = {
  // Làm mượt tốc độ (hệ số EMA 0..1, càng nhỏ càng mượt)
  smoothing: 0.35,
  // Dưới ngưỡng này coi như đứng yên (m/s ~ 2.5 km/h)
  stopThreshold: 0.7,
  // Vượt quá giới hạn bao nhiêu km/h thì mới cảnh báo (bù sai số đồng hồ)
  tolerance: 5,
  // Phải vượt liên tục bấy nhiêu ms mới kêu, tránh báo do nhiễu GPS
  overSpeedDebounce: 2500,
  // Lặp lại cảnh báo vượt tốc mỗi bấy nhiêu ms nếu vẫn còn vượt
  overSpeedRepeat: 12000,
};

export const POI = {
  // Camera, cắt đường sắt, biển cấm (rẽ / khung giờ). Xem classifyNode.
  // Khoảng cách cảnh báo tối thiểu / tối đa (m)
  minLookahead: 180,
  maxLookahead: 700,
  // Thời gian tới điểm (giây) dùng để tính lookahead động theo tốc độ
  lookaheadSeconds: 14,
  // Nón phía trước — chỉ dùng khi chưa bắt được đường
  coneDeg: 55,
  // Vuông góc tối đa tới đường đang đi: camera OSM sát làn; điểm overlay ở nút giao
  roadLateral: 20,
  junctionLateral: 45,
  // Vượt qua điểm rồi, đi xa hơn mức này thì cho phép cảnh báo lại
  rearmDistance: 900,
};

// Bảng tốc độ tối đa theo Thông tư 31/2019/TT-BGTVT.
// urbanMulti : trong khu đông dân cư, đường đôi hoặc một chiều >= 2 làn
// urbanSingle: trong khu đông dân cư, đường hai chiều hoặc một chiều 1 làn
// ruralMulti / ruralSingle: tương tự nhưng ngoài khu đông dân cư
// hardCap    : trần tuyệt đối của loại xe (áp cả trên cao tốc)
export const VEHICLES = {
  car: {
    label: 'Ô tô con / tải ≤ 3,5 tấn',
    short: 'Ô tô con',
    urbanMulti: 60, urbanSingle: 50,
    ruralMulti: 90, ruralSingle: 80,
    // Trần TT31 trên cao tốc khi OSM chưa có biển — không dùng bảng đường trường (90)
    motorway: 120,
    // Nhánh ra/vào không phải trần cao tốc; chưa có biển thì lấy 60
    motorwayLink: 60,
    hardCap: 120,
  },
  moto: {
    label: 'Xe mô tô (> 50 cm³)',
    short: 'Xe máy',
    urbanMulti: 60, urbanSingle: 50,
    ruralMulti: 70, ruralSingle: 60,
    motorway: 70,
    motorwayLink: 60,
    hardCap: 70,
  },
  truck: {
    label: 'Ô tô tải > 3,5 tấn / khách > 30 chỗ',
    short: 'Xe tải',
    urbanMulti: 60, urbanSingle: 50,
    ruralMulti: 80, ruralSingle: 70,
    motorway: 80,
    motorwayLink: 60,
    hardCap: 90,
  },
  bus: {
    label: 'Xe buýt / đầu kéo sơ mi rơ moóc',
    short: 'Xe buýt',
    urbanMulti: 60, urbanSingle: 50,
    ruralMulti: 70, ruralSingle: 60,
    motorway: 80,
    motorwayLink: 60,
    hardCap: 80,
  },
  moped: {
    label: 'Xe gắn máy ≤ 50 cm³ / xe máy chuyên dùng',
    short: 'Xe gắn máy',
    urbanMulti: 40, urbanSingle: 40,
    ruralMulti: 40, ruralSingle: 40,
    motorway: 40,
    motorwayLink: 40,
    hardCap: 40,
  },
};

export const DEFAULT_SETTINGS = {
  vehicle: 'car',
  sound: true,
  voice: true,
  keepAwake: true,
  followMap: true,
  units: 'kmh',
};

export const MAP = {
  center: [21.028511, 105.804817], // Hà Nội - dùng khi chưa có GPS
  zoom: 16,
  minZoom: 5,
  maxZoom: 19,
  // Toàn bộ lãnh thổ VN, gồm quần đảo Hoàng Sa và Trường Sa — không cắt khi zoom/pan
  maxBounds: [[6.0, 101.8], [23.6, 117.8]],
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

/** Tọa độ dùng để vẽ nhãn khi zoom xa (mô phỏng). Không thay thế biên giới pháp lý chi tiết. */
export const VN_ISLANDS = {
  hoangSa: {
    name: 'Quần đảo Hoàng Sa',
    admin: 'Đà Nẵng',
    center: [16.55, 112.35],
    bounds: [[15.72, 111.05], [17.18, 113.02]],
  },
  truongSa: {
    name: 'Quần đảo Trường Sa',
    admin: 'Khánh Hòa',
    center: [9.55, 114.35],
    bounds: [[6.55, 111.55], [12.05, 117.25]],
  },
  // Zoom nhỏ hơn mức này thì hiện nhãn trên bản đồ (chỉ mô phỏng mới zoom được)
  labelMaxZoom: 10,
};
