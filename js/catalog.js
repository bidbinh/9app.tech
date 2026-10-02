// Catalog Life OS. Không dùng export — WebView ô tô cũ không chạy ES module.

var CATEGORIES = [
  { id: 'life', label: 'Đời sống' },
  { id: 'hobby', label: 'Sở thích' },
  { id: 'family', label: 'Gia đình' },
  { id: 'drive', label: 'Lái xe' },
  { id: 'work', label: 'Công việc' }
];

var APPS = [
  {
    id: 'vault',
    name: '9Vault',
    blurb: 'Giấy tờ, hạn, bảo hành',
    href: '#/vault',
    icon: 'icons/vault.svg?v=16',
    category: 'life',
    ready: true,
    core: true,
    module: true
  },
  {
    id: 'house',
    name: '9Home',
    blurb: 'Nhà, phòng, đồ, hoá đơn, bảo trì',
    href: '#/home',
    icon: 'icons/house.svg?v=16',
    category: 'life',
    ready: true,
    core: true,
    module: true
  },
  {
    id: 'fin',
    name: '9Fin',
    blurb: 'Sổ thu chi, hạn thanh toán',
    href: '9fin/',
    icon: 'icons/fin.svg?v=11',
    category: 'family',
    ready: true,
    core: true
  },
  {
    id: 'move',
    name: '9Move',
    blurb: 'Xe, đăng kiểm, bảo hiểm',
    href: '#/move',
    icon: 'icons/move.svg?v=16',
    category: 'drive',
    ready: true,
    core: true,
    module: true
  },
  {
    id: 'care',
    name: '9Care',
    blurb: 'Lịch khám, thuốc, người thân',
    href: '#/care',
    icon: 'icons/care.svg?v=16',
    category: 'family',
    ready: true,
    core: true,
    module: true
  },
  {
    id: 'local',
    name: '9Local',
    blurb: 'Thợ, hẹn, việc nhà quanh đây',
    href: '#/local',
    icon: 'icons/local.svg?v=16',
    category: 'life',
    ready: true,
    core: true,
    module: true
  },
  {
    id: 'speed',
    name: '9speed',
    blurb: 'Cảnh báo tốc độ, biển báo, camera phạt nguội',
    href: 'speed/',
    icon: 'icons/speed.svg?v=11',
    category: 'drive',
    ready: true,
    core: true
  },
  {
    id: 'ship',
    name: '9Ship',
    blurb: 'Gửi hàng nhanh, so giá nhiều hãng, quầy gần bạn',
    href: '9ship/',
    icon: 'icons/ship.svg?v=1',
    category: 'life',
    ready: true
  },
  {
    id: 'vannien',
    name: 'Vạn Niên',
    blurb: 'Lịch âm dương, ngày giờ hoàng đạo, phong thủy',
    href: 'vannien/',
    icon: 'icons/vannien.svg?v=12',
    category: 'life',
    ready: true
  },
  {
    id: 'giapha',
    name: 'Gia phả',
    blurb: 'Gia phả họ Trần — Xóm Trại',
    href: 'https://hotranvanxomtrai.com/?from=9app',
    icon: 'icons/giapha.svg?v=11',
    category: 'family',
    ready: true
  },
  {
    id: 'quy',
    name: 'Hội phụ huynh',
    blurb: 'Hội phụ huynh: thu chi, sự kiện, QR nộp tiền',
    href: '9quy/',
    icon: 'icons/quy.svg?v=11',
    category: 'family',
    ready: true
  },
  {
    id: 'pick',
    name: '9Sport',
    blurb: 'Câu lạc bộ, video sân, chọn đội',
    href: '9pick/',
    icon: 'icons/sport.svg?v=2',
    category: 'hobby',
    ready: true
  },
  {
    id: 'log',
    name: '9log',
    blurb: 'Quản lý vận tải, đơn hàng trên điện thoại',
    href: 'https://mobile.9log.tech/?from=9app',
    icon: 'icons/log.svg?v=11',
    category: 'work',
    ready: true,
    home: false
  }
];

var Catalog = (function () {
  function byId(id) {
    for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i];
    return null;
  }
  function homeDefault(app) {
    if (app.home === false) return false;
    return true;
  }
  function categoryLabel(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].label;
    return id;
  }
  return { byId: byId, homeDefault: homeDefault, categoryLabel: categoryLabel, apps: APPS, categories: CATEGORIES };
})();
