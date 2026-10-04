// Loại bữa (trưa, cà phê, sáng, tiệc), quán theo loại, tùy chọn đồ uống trong phiếu, chốt đơn khóa danh sách, người chốt đơn
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeTeam, ok, db } from './helper.js';
import { buildSlip } from '../src/slip.js';

before(boot);
after(shutdown);

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 7 * 3600_000 - n * 86400000).toISOString().slice(0, 10);

test('phiếu đặt: cà phê tách dòng theo ghi chú (đường, đá), cơm trưa vẫn gộp ghi chú', () => {
  const items = [
    { name: 'Trà đào', price: 45000, qty: 1, note: 'M, 50% đường, đá ít' },
    { name: 'Trà đào', price: 45000, qty: 1, note: 'M, 50% đường, đá ít' },
    { name: 'Trà đào', price: 45000, qty: 1, note: 'M, 100% đường, đá vừa' },
  ];
  const cafe = buildSlip(items, { kind: 'cafe' });
  assert.equal(cafe.lines.length, 2);
  assert.deepEqual(cafe.lines.map((l) => l.qty).sort(), [1, 2]);
  assert.match(cafe.text, /2 x Trà đào \(M, 50% đường, đá ít\)/);
  assert.match(cafe.text, /1 x Trà đào \(M, 100% đường, đá vừa\)/);
  const trua = buildSlip(items, { kind: 'trua' });
  assert.equal(trua.lines.length, 1);
  assert.equal(trua.lines[0].qty, 3);
});

test('tạo bữa theo loại: kiểm tra giá trị, mỗi loại có bữa riêng trong ngày, cùng loại thì vào bữa đang có', async () => {
  const t = await makeTeam(['Chủ', 'An']);
  const [chu, an] = t.clients;
  assert.equal((await chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'bia' })).status, 400);
  const trua = await ok(chu.post(`/api/teams/${t.teamId}/meals`, {}));
  assert.equal((await ok(chu.get(`/api/meals/${trua.mealId}`))).meal.kind, 'trua');
  const cafe = await ok(an.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe' }));
  assert.notEqual(cafe.mealId, trua.mealId);
  const again = await chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe' });
  assert.equal(again.status, 409); assert.equal(again.json.error.details.mealId, cafe.mealId);
  for (const k of ['sang', 'tiec']) await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: k }));
  const team = await ok(chu.get(`/api/teams/${t.teamId}`));
  assert.deepEqual(team.activeMeals.map((m) => m.kind).sort(), ['cafe', 'sang', 'tiec', 'trua']);
});

test('quán lưu theo loại: gợi ý ngẫu nhiên và quy tắc 3 ngày tính riêng từng loại', async () => {
  const { rng } = await import('../src/routes/meals.js');
  const t = await makeTeam(['Chủ', 'An']);
  const [chu] = t.clients;
  const mk = async (kind, venue, day, status) => {
    const m = await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind }));
    await ok(chu.post(`/api/meals/${m.mealId}/proposals`, { name: venue }));
    await ok(chu.post(`/api/meals/${m.mealId}/status`, { to: 'dat_mon' }));
    await db.query('UPDATE meals SET status=$2, day=$3 WHERE id=$1', [m.mealId, status, day]);
    return m.mealId;
  };
  await mk('cafe', 'Highlands', today(), 'xong');         // vừa uống hôm nay: bị loại khỏi gợi ý cà phê
  await mk('cafe', 'Phúc Long', daysAgo(10), 'xong');
  await mk('trua', 'Cơm Niêu', daysAgo(10), 'xong');
  rng.fn = () => 0;
  const c2 = await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe', day: daysAgo(0) }));
  const r1 = await ok(chu.post(`/api/meals/${c2.mealId}/random`));
  assert.equal(r1.name, 'Phúc Long');
  assert.equal((await chu.post(`/api/meals/${c2.mealId}/random`)).status, 409, 'Highlands vừa uống nên bị loại, không còn quán nào');
  const t2 = await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'trua' }));
  const r2 = await ok(chu.post(`/api/meals/${t2.mealId}/random`));
  assert.equal(r2.name, 'Cơm Niêu', 'quán cơm trưa không lẫn quán cà phê');
  const sang = await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'sang' }));
  const r3 = await chu.post(`/api/meals/${sang.mealId}/random`);
  assert.equal(r3.status, 409, 'chưa có quán bữa sáng nào');
  rng.fn = Math.random;
  const kinds = (await db.query('SELECT DISTINCT kind FROM proposals WHERE team_id=$1 ORDER BY kind', [t.teamId])).map((r) => r.kind);
  assert.deepEqual(kinds, ['cafe', 'trua']);
});

test('đồ uống: tùy chọn nằm trong ghi chú, phiếu tách đúng dòng, "như thường lệ" nhớ cả tùy chọn', async () => {
  const t = await makeTeam(['Chủ', 'An']);
  const [chu, an] = t.clients;
  const drink = async (day, venue) => {
    const m = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe', day }))).mealId;
    await ok(chu.post(`/api/meals/${m}/proposals`, { name: venue }));
    await ok(chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
    return m;
  };
  const m1 = await drink(daysAgo(1), 'Phúc Long');
  await ok(an.post(`/api/meals/${m1}/items`, { name: 'Trà đào', price: 49000, qty: 1, note: 'L, 30% đường, đá ít, + trân châu' }));
  await ok(chu.post(`/api/meals/${m1}/items`, { name: 'Trà đào', price: 49000, qty: 1, note: 'M, 100% đường, đá vừa' }));
  await ok(chu.post(`/api/meals/${m1}/items`, { name: 'Trà đào', price: 49000, qty: 1, note: 'M, 100% đường, đá vừa' }));
  const v = (await ok(an.get(`/api/meals/${m1}`))).meal;
  assert.equal(v.slip.lines.length, 2);
  assert.ok(v.slip.lines.some((l) => l.qty === 2 && l.notes[0].note === 'M, 100% đường, đá vừa'));
  await db.query("UPDATE meals SET status='xong' WHERE id=$1", [m1]);
  const m2 = await drink(today(), 'Phúc Long');
  const v2 = (await ok(an.get(`/api/meals/${m2}`))).meal;
  assert.equal(v2.repeat.count, 1);
  await ok(an.post(`/api/meals/${m2}/items/repeat`));
  const again = (await ok(an.get(`/api/meals/${m2}`))).meal;
  assert.equal(again.items[0].note, 'L, 30% đường, đá ít, + trân châu');
});

test('chốt đơn: khóa danh sách món và tạo phiếu; nhập phí thực tế rồi mới chia tiền; mở khóa được', async () => {
  const t = await makeTeam(['Chủ', 'An', 'Bình'], { bankFor: ['Chủ', 'An'] });
  const [chu, an, binh] = t.clients;
  const m = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe' }))).mealId;
  await ok(chu.post(`/api/meals/${m}/proposals`, { name: 'The Coffee House' }));
  await ok(chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
  assert.equal((await chu.post(`/api/meals/${m}/lock`)).json.error.code, 'no_items');
  const it = (await ok(an.post(`/api/meals/${m}/items`, { name: 'Cà phê sữa', price: 35000, qty: 1, note: 'S, 70% đường, đá vừa' }))).itemId;
  await ok(binh.post(`/api/meals/${m}/items`, { name: 'Trà vải', price: 45000, qty: 2 }));
  // người thường không chốt được; không dán được link đặt món
  assert.equal((await binh.post(`/api/meals/${m}/lock`)).status, 403);
  assert.equal((await binh.post(`/api/meals/${m}/settings`, { orderUrl: 'https://grab.example/group/abc' })).status, 403);
  assert.equal((await chu.post(`/api/meals/${m}/settings`, { orderUrl: 'javascript:alert(1)' })).status, 400);
  const withLink = (await ok(chu.post(`/api/meals/${m}/settings`, { orderUrl: 'https://food.grab.com/vn/group-order/xyz' }))).meal;
  assert.equal(withLink.orderUrl, 'https://food.grab.com/vn/group-order/xyz');
  // người chốt đơn: mặc định là người ứng tiền, đổi được
  assert.equal(withLink.orderer, null);
  await ok(chu.post(`/api/meals/${m}/settings`, { payerId: t.ids['Chủ'] }));
  assert.equal((await meal(chu, m)).orderer.name, 'Chủ');
  assert.equal((await binh.post(`/api/meals/${m}/settings`, { ordererId: t.ids['An'] })).status, 403);
  assert.equal((await binh.post(`/api/meals/${m}/settings`, { ordererId: t.ids['Bình'] })).status, 403, 'đã có người ứng nên không tự giành chốt đơn');
  assert.equal((await ok(chu.post(`/api/meals/${m}/settings`, { ordererId: t.ids['Bình'] }))).meal.orderer.name, 'Bình');
  assert.equal((await meal(chu, m)).orderer.isDefault, false);
  // chốt đơn
  const locked = (await ok(binh.post(`/api/meals/${m}/lock`))).meal; // người chốt đơn có quyền chốt
  assert.equal(locked.locked, true); assert.equal(locked.orderOpen, false);
  assert.equal((await an.post(`/api/meals/${m}/items`, { name: 'Thêm', price: 1000, qty: 1 })).json.error.code, 'order_closed');
  assert.equal((await an.post(`/api/items/${it}`, { name: 'Sửa', price: 1000, qty: 1 })).json.error.code, 'order_closed');
  assert.equal((await an.del(`/api/items/${it}`)).json.error.code, 'order_closed');
  assert.equal((await an.post(`/api/meals/${m}/items/repeat`)).status, 409);
  // phiếu đặt vẫn xem được; phí thực tế nhập sau khi đã chốt
  assert.match((await meal(an, m)).slip.text, /Cà phê sữa \(S, 70% đường, đá vừa\)/);
  const fees = (await ok(binh.post(`/api/meals/${m}/settings`, { fees: { ship: 18000, service: 3000, discount: 12000 } }))).meal;
  assert.equal(fees.preview.total, 35000 + 90000 + 18000 + 3000 - 12000);
  // mở khóa để sửa rồi chốt lại
  assert.equal((await ok(chu.post(`/api/meals/${m}/lock`, { locked: false }))).meal.locked, false);
  await ok(an.post(`/api/items/${it}`, { name: 'Cà phê sữa', price: 35000, qty: 2, note: 'S, 70% đường, đá vừa' }));
  await ok(chu.post(`/api/meals/${m}/lock`));
  // chia tiền: người ứng tiền cần tài khoản; sau chốt đơn mới chia
  const v = (await ok(chu.post(`/api/meals/${m}/status`, { to: 'thanh_toan' }))).meal;
  assert.equal(v.status, 'thanh_toan');
  assert.equal(v.charges.reduce((s, c) => s + c.amount, 0), 70000 + 90000 + 18000 + 3000 - 12000);
  assert.equal((await chu.post(`/api/meals/${m}/lock`)).status, 409, 'hết bước gọi món thì không còn chốt đơn');
});

test('thống kê và lịch sử lọc theo loại bữa', async () => {
  const t = await makeTeam(['Chủ', 'An'], { bankFor: ['Chủ'] });
  const [chu, an] = t.clients;
  const run = async (kind, venue, dish, price) => {
    const m = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind }))).mealId;
    await ok(chu.post(`/api/meals/${m}/proposals`, { name: venue }));
    await ok(chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
    await ok(an.post(`/api/meals/${m}/items`, { name: dish, price, qty: 1 }));
    await ok(chu.post(`/api/meals/${m}/settings`, { payerId: t.ids['Chủ'] }));
    await ok(chu.post(`/api/meals/${m}/status`, { to: 'thanh_toan' }));
    await ok(chu.post(`/api/meals/${m}/status`, { to: 'xong' }));
  };
  await run('trua', 'Cơm Tấm', 'Cơm', 40000);
  await run('cafe', 'Highlands', 'Cà phê', 30000);
  const all = await ok(chu.get(`/api/teams/${t.teamId}/stats`));
  assert.equal(all.meals.length, 2); assert.equal(all.spent.find((s) => s.name === 'An').amount, 70000);
  const cafe = await ok(chu.get(`/api/teams/${t.teamId}/stats?kind=cafe`));
  assert.equal(cafe.kind, 'cafe');
  assert.deepEqual(cafe.meals.map((m) => m.venueName), ['Highlands']);
  assert.equal(cafe.spent.find((s) => s.name === 'An').amount, 30000);
  assert.deepEqual(cafe.favorites.map((f) => f.name), ['Highlands']);
  const bad = await ok(chu.get(`/api/teams/${t.teamId}/stats?kind=xyz`));
  assert.equal(bad.meals.length, 2, 'loại lạ bị bỏ qua');
});

async function meal(c, id) { return (await ok(c.get(`/api/meals/${id}`))).meal; }

test('gợi ý người ứng tiền: loại người vắng (không gọi món), ưu tiên người có tài khoản, có lý do', async () => {
  const t = await makeTeam(['Chủ', 'An', 'Bình', 'Chi'], { bankFor: ['Chủ', 'An', 'Bình', 'Chi'] });
  const [chu, an, binh] = t.clients;
  const m = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, {}))).mealId;
  const s0 = (await ok(chu.get(`/api/meals/${m}`))).meal.suggestedPayer;
  assert.ok(s0.reason.length > 5);
  await ok(chu.post(`/api/meals/${m}/proposals`, { name: 'Q' }));
  await ok(chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
  await ok(an.post(`/api/meals/${m}/items`, { name: 'x', price: 1000, qty: 1 }));
  await ok(binh.post(`/api/meals/${m}/items`, { name: 'y', price: 1000, qty: 1 }));
  const s1 = (await ok(chu.get(`/api/meals/${m}`))).meal.suggestedPayer;
  assert.ok([t.ids['An'], t.ids['Bình']].includes(s1.id), 'chỉ gợi ý người có mặt trong bữa này');
  // An vừa ứng một bữa => lần sau gợi ý Bình
  await ok(chu.post(`/api/meals/${m}/settings`, { payerId: t.ids['An'] }));
  await ok(chu.post(`/api/meals/${m}/status`, { to: 'thanh_toan' }));
  await ok(chu.post(`/api/meals/${m}/status`, { to: 'xong' }));
  const m2 = (await ok(chu.post(`/api/teams/${t.teamId}/meals`, { kind: 'cafe' }))).mealId;
  await ok(chu.post(`/api/meals/${m2}/proposals`, { name: 'Q2' }));
  await ok(chu.post(`/api/meals/${m2}/status`, { to: 'dat_mon' }));
  await ok(an.post(`/api/meals/${m2}/items`, { name: 'x', price: 1000, qty: 1 }));
  await ok(binh.post(`/api/meals/${m2}/items`, { name: 'y', price: 1000, qty: 1 }));
  const s2 = (await ok(chu.get(`/api/meals/${m2}`))).meal.suggestedPayer;
  assert.equal(s2.id, t.ids['Bình']);
  assert.match(s2.reason, /Chưa ứng lần nào/);
});
