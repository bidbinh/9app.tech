import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const store = {};
const localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; }
};

const ctx = vm.createContext({
  localStorage,
  indexedDB: undefined,
  Date,
  Math,
  JSON,
  Number,
  String,
  Array,
  Object,
  console,
  setTimeout,
  clearTimeout
});

for (const file of ['js/catalog.js', 'js/graph.js', 'js/engine.js', 'js/id.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

const { Catalog, Graph, Engine, Id, APPS, CATEGORIES } = ctx;

assert(Catalog.byId('vault').name === '9Vault', 'catalog vault');
assert(Catalog.byId('log').home === false, '9log không mặc định trang chủ');
assert(CATEGORIES[0].id === 'life', 'nhóm đời sống trước');
assert(APPS.filter((a) => a.id === 'today').length === 0, '9Today không phải tile');

Graph.resetForTest();
assert(Graph.query('documents').length === 0, 'graph trống lúc đầu');

const extracted = Engine.extractDocument('giay dang kiem xe SH', 'dang-kiem.pdf');
assert(extracted.type === 'inspection', 'nhận đăng kiểm từ tên tệp');

const soon = Date.now() + 2 * 24 * 60 * 60 * 1000;
const doc = Graph.put('documents', {
  title: 'Đăng kiểm xe SH',
  type: 'inspection',
  expiresAt: soon,
  plate: '29A-123.45'
});
const created = Engine.confirmDocument(doc);
assert(created.some((c) => c.store === 'vehicles'), 'xác nhận giấy → tạo xe');
assert(Graph.query('vehicles').length === 1, 'có 1 xe sau xác nhận');

const cards = Engine.today();
assert(cards.some((c) => c.source === 'move' || c.source === 'vault'), 'Hôm nay có việc đăng kiểm');
assert(Engine.unreadCount() > 0, 'có thông báo chưa đọc');

Graph.recordUse('vault');
const rec = Engine.recommend();
assert(!rec.some((r) => r.id === 'vault'), 'không gợi ý app đã mở');

const invoice = Graph.put('documents', {
  title: 'Hoá đơn máy lạnh',
  type: 'invoice-appliance',
  amount: 12000000,
  expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  assetName: 'Máy lạnh phòng khách'
});
const fromBill = Engine.confirmDocument(invoice);
assert(fromBill.some((c) => c.store === 'assets'), 'hoá đơn đồ → tài sản');
assert(fromBill.some((c) => c.store === 'transactions'), 'hoá đơn đồ → giao dịch');
assert(fromBill.some((c) => c.store === 'maintenance'), 'máy lạnh → lịch vệ sinh');

const nha = Graph.put('properties', { name: 'Nhà Long Biên', type: 'Căn hộ', address: 'Long Biên' });
const khach = Graph.put('rooms', { name: 'Phòng khách', propertyId: nha.id });
const bep = Graph.put('rooms', { name: 'Bếp', propertyId: nha.id });
const dieuhoa = Graph.put('assets', { name: 'Điều hòa', category: 'Điện lạnh', roomId: khach.id, propertyId: nha.id });
Graph.put('assets', { name: 'Tủ lạnh', category: 'Điện lạnh', roomId: bep.id, propertyId: nha.id });
assert(Graph.query('rooms', (r) => r.propertyId === nha.id).length === 2, 'nhà có 2 phòng');
assert(Graph.query('assets', (a) => a.roomId === khach.id).length === 1, 'phòng khách có đồ');
const lich = Engine.attachMaint(dieuhoa);
assert(lich && lich.title.indexOf('Vệ sinh') >= 0, 'template bảo trì điều hòa');
Graph.put('maintenance', { assetId: dieuhoa.id, title: lich.title, everyMonths: 6, nextAt: Date.now() + 86400000, status: 'open' });
assert(Engine.homeJobs().some((j) => j.source === 'house'), '9Home có việc cần làm');

Graph.put('obligations', {
  title: 'Điện · 09/2026', kind: 'utility', amount: 450000,
  dueAt: Date.now() + 2 * 86400000, status: 'open'
});
assert(Engine.homeJobs().some((j) => j.title.indexOf('Điện') >= 0), 'hoá đơn điện lên việc nhà');

const ob = Graph.put('obligations', { title: 'Tiền điện', amount: 350000, dueAt: Date.now() + 86400000, status: 'open' });
Engine.markPaid(ob.id);
assert(Graph.get('obligations', ob.id).status === 'paid', 'đánh dấu đã trả');

assert(!Id.session(), 'chưa login thì khách');
const bad = Id.dangKy('123', '1');
assert(!!bad.loi, 'SĐT không hợp lệ');
const ok = Id.dangKy('0966509898', 'secret1');
assert(ok.ok && Id.session().sdt === '0966509898', 'tạo tài khoản 9app');
Id.logout();
assert(!Id.session(), 'đăng xuất');
assert(Id.dangNhap('0966509898', 'sai').loi, 'sai mật khẩu');
assert(Id.dangNhap('0966509898', 'secret1').ok, 'đăng nhập lại');
assert(Id.require(function () {}), 'đã có phiên thì require đi tiếp');

if (failed) {
  console.error(failed + ' lỗi');
  process.exit(1);
}
console.log('Tất cả test Life OS đạt.');
