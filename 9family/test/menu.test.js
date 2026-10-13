import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, shutdown, makeFamily, addChild, ok, Client, clock, db, config, at, scheduler } from './helper.js';
import * as M from '../src/menu/index.js';
import { canEdit, canManage } from '../src/routes/menu.js';

before(async () => { await boot(); });
after(shutdown);
beforeEach(() => { clock.set(at('2026-10-05', '09:00')); });

const status = async (p) => (await p).status;
const WEEK = '2026-10-05';

// ---------- hồ sơ -> tham số planner ----------
test('hồ sơ ăn uống -> hồ sơ planner: người lớn, ông bà, con theo tuổi, kiêng theo từng người, không cay', () => {
  const kids = [{ id: '11111111-1111-1111-1111-111111111111', name: 'Bống', birth_year: 2019 }, { id: '22222222-2222-2222-2222-222222222222', name: 'Na', birth_year: 2025 }];
  const p = M.cleanProfile({ adults: 2, elders: 1, meals: ['toi', 'trua'], noSpicy: true, members: { 'adult:2': { avoid: ['hai_san'], label: 'Bố Tí' }, 'child:11111111-1111-1111-1111-111111111111': { avoid: ['trung'] }, 'child:99999999-9999-9999-9999-999999999999': { avoid: ['sua'] }, 'adult:9': { avoid: ['sua'] } } }, kids.map((k) => k.id));
  assert.deepEqual(p.meals, ['trua', 'toi'], 'bữa theo thứ tự sáng-trưa-tối');
  assert.deepEqual(Object.keys(p.members).sort(), ['adult:2', 'child:11111111-1111-1111-1111-111111111111'], 'khóa lạ bị loại');
  const b = M.buildPlannerProfile(p, kids, '2026-10-05');
  assert.equal(b.profile.people.length, 5);
  const [a1, a2, el, c1, c2] = b.profile.people;
  assert.ok(a1.avoid.includes('cay') && a2.avoid.includes('hai_san') && a2.avoid.includes('cay'));
  assert.equal(el.role, 'ba'); assert.equal(Math.round(el.ageYears), 70);
  assert.equal(c1.ageMonths, 7 * 12 + 10 - 6, 'bé 2019: giữa năm');
  assert.deepEqual(c1.avoid, ['trung', 'cay']);
  assert.equal(c2.ageMonths, 10, 'bé sinh 2025 chưa biết tháng: lấy tuổi nhỏ nhất có thể (an toàn)');
  assert.ok(b.warnings.some((w) => /Na/.test(w) && /tháng sinh/.test(w)));
  const b2 = M.buildPlannerProfile({ ...p, members: { ...p.members, 'child:22222222-2222-2222-2222-222222222222': { birthMonth: 3 } } }, kids, '2026-10-05');
  assert.equal(b2.profile.people[4].ageMonths, 19, 'có tháng sinh: tuổi chính xác');
  assert.ok(!b2.warnings.length);
  assert.ok(b.servings > 3.5 && b.servings < 5);
  const ex = M.buildPlannerProfile({ ...p, excludeChildren: [kids[0].id] }, kids, '2026-10-05');
  assert.equal(ex.profile.people.length, 4, 'con không ăn ở nhà bị loại');
});

test('kiểm tra đầu vào hồ sơ: số người, bữa, kiêng lạ, ngân sách', () => {
  assert.throws(() => M.cleanProfile({ adults: 99 }, []), /Số người lớn/);
  assert.throws(() => M.cleanProfile({ adults: 2, meals: [] }, []), /ít nhất một bữa/);
  assert.throws(() => M.cleanProfile({ adults: 2, meals: ['khuya'] }, []), /Bữa ăn/);
  assert.throws(() => M.cleanProfile({ adults: 2, members: { 'adult:1': { avoid: ['kim_cuong'] } } }, []), /Kiêng/);
  assert.throws(() => M.cleanProfile({ adults: 2, budget: 'xa_xi' }, []), /Ngân sách/);
  assert.throws(() => M.cleanProfile({ adults: 0, elders: 0 }, []), /ít nhất một người/);
  assert.equal(M.cleanProfile({ adults: 0, elders: 0 }, ['11111111-1111-1111-1111-111111111111']).adults, 0, 'chỉ có con ăn thì vẫn hợp lệ');
});

test('quyền theo vai trò (ma trận 9id): quản lý/chủ sửa hồ sơ; thành viên đổi món; con chỉ xem', () => {
  assert.ok(canManage({ role: 'chu' }) && canManage({ role: 'quan_ly' }) && !canManage({ role: 'thanh_vien' }) && !canManage({ role: 'con' }));
  assert.ok(canEdit({ role: 'thanh_vien' }) && !canEdit({ role: 'con' }));
});

// ---------- API: hồ sơ, tuần ----------
async function setup() {
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bà nội'], { roles: { Bố: 'quan_ly' }, relations: { 'Bà nội': 'ba', Bố: 'bo' } });
  const kid = await addChild(fam, 'Bống', { birthYear: 2019 });
  return { fam, kid };
}

test('hồ sơ ăn uống: mặc định, lưu, quyền, ẩn món', async () => {
  const { fam, kid } = await setup();
  const g = await ok(fam.owner.get(`${fam.F}/menu/profile`));
  assert.equal(g.saved, false); assert.equal(g.profile.elders, 1, 'mặc định có ông bà vì gia đình có bà nội');
  assert.equal(g.canEdit, true); assert.equal(g.people.length, g.profile.adults + g.profile.elders + 1);
  assert.match(g.disclaimer, /không phải tư vấn/);
  const body = { ...g.profile, adults: 2, meals: ['sang', 'trua', 'toi'], budget: 'vua', members: { 'adult:2': { avoid: ['hai_san'] }, [`child:${kid.id}`]: { avoid: ['trung'] } } };
  assert.equal(await status(fam.by['Bà nội'].post(`${fam.F}/menu/profile`, body)), 403, 'thành viên không sửa hồ sơ');
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/profile`, { ...body, adults: 50 })), 400);
  await ok(fam.by['Bố'].post(`${fam.F}/menu/profile`, body));
  const g2 = await ok(fam.by['Bà nội'].get(`${fam.F}/menu/profile`));
  assert.equal(g2.saved, true); assert.equal(g2.profile.budget, 'vua'); assert.equal(g2.canEdit, false);
  assert.deepEqual(g2.profile.members['adult:2'].avoid, ['hai_san']);
  // ẩn món
  const h = await ok(fam.by['Bà nội'].post(`${fam.F}/menu/hide`, { dishId: 'canh-bau-thit-bam' }));
  assert.equal(h.hidden.length, 1);
  assert.equal(await status(fam.by['Bà nội'].post(`${fam.F}/menu/hide`, { dishId: 'canh-bau-thit-bam', hidden: false })), 403, 'bỏ ẩn: chỉ quản lý');
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/hide`, { dishId: 'khong-co-mon-nay' })), 400);
  assert.equal((await ok(fam.owner.post(`${fam.F}/menu/hide`, { dishId: 'canh-bau-thit-bam', hidden: false }))).hidden.length, 0);
});

test('lập thực đơn tuần: đủ ngày/bữa, tôn trọng kiêng, theo mùa, nhãn độ tin cậy, lý do', async () => {
  const { fam, kid } = await setup();
  await ok(fam.owner.post(`${fam.F}/menu/profile`, { adults: 2, elders: 1, meals: ['trua', 'toi'], members: { 'adult:1': { avoid: ['hai_san', 'thit_bo'] }, [`child:${kid.id}`]: { avoid: ['trung'] } } }));
  const w0 = await ok(fam.owner.get(`${fam.F}/menu/week?start=2026-10-07`));
  assert.equal(w0.weekStart, WEEK, 'ngày bất kỳ về thứ hai'); assert.equal(w0.plan, null); assert.equal(w0.season, 'thu');
  assert.equal(await status(fam.by['Bà nội'].post(`${fam.F}/menu/week/generate`, { start: WEEK })), 403);
  const g = await ok(fam.by['Bố'].post(`${fam.F}/menu/week/generate`, { start: WEEK }));
  const plan = g.plan;
  assert.equal(plan.days.length, 7); assert.equal(plan.status, 'nhap'); assert.equal(plan.month, 10);
  for (const d of plan.days) for (const m of ['trua', 'toi']) {
    const meal = d.meals[m]; assert.ok(meal.items.length >= 1);
    for (const it of meal.items) {
      const dish = M.DISH.get(it.dishId);
      assert.ok(!dish.avoid.some((a) => ['hai_san', 'thit_bo', 'trung', 'cay'].includes(a)), `${it.name} vi phạm kiêng`);
      assert.ok(it.why.length >= 1 && it.sourceCheck && it.slotLabel);
    }
  }
  const ids = plan.days.flatMap((d) => Object.values(d.meals).flatMap((m) => m.items.map((i) => i.dishId)));
  assert.equal(new Set(ids).size, ids.length, 'không lặp món trong tuần');
  const w = await ok(fam.by['Bà nội'].get(`${fam.F}/menu/week?start=${WEEK}`));
  assert.deepEqual(w.plan.days[0].meals.trua.items.map((i) => i.dishId), plan.days[0].meals.trua.items.map((i) => i.dishId));
  assert.equal(w.canEdit, true); assert.equal(w.canManage, false); assert.equal(w.weeks.length, 1);
  assert.equal(await status(fam.owner.get(`${fam.F}/menu/week?start=2020-01-01&x=1`)), 200, 'tuần chưa lập: trả plan null');
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/week/generate`, { start: '2030-01-01' })), 400, 'quá xa');
});

test('đổi món từng ô: gợi ý thay thế, đổi tự động, chọn tay (kiểm dị ứng), khóa, không thích ẩn vĩnh viễn', async () => {
  const { fam } = await setup();
  await ok(fam.owner.post(`${fam.F}/menu/profile`, { adults: 2, elders: 0, meals: ['trua', 'toi'], members: { 'adult:1': { avoid: ['hai_san'] } } }));
  let plan = (await ok(fam.owner.post(`${fam.F}/menu/week/generate`, { start: WEEK }))).plan;
  // tìm một ô có món mặn
  const cellOf = (p) => { for (const d of p.days) for (const [mk, m] of Object.entries(d.meals)) for (const it of m.items) if (it.slot === 'man1') return { day: d.day, meal: mk, slot: it.slot, dishId: it.dishId }; };
  const cell = cellOf(plan);
  const alt = await ok(fam.by['Bà nội'].get(`${fam.F}/menu/week/alternatives?start=${WEEK}&day=${cell.day}&meal=${cell.meal}&slot=${cell.slot}`));
  assert.ok(alt.alternatives.length >= 3 && alt.alternatives.length <= 5, 'gợi ý 3-5 món: ' + alt.alternatives.length);
  assert.equal(new Set(alt.alternatives.map((a) => a.dishId)).size, alt.alternatives.length);
  for (const a of alt.alternatives) { assert.ok(!M.DISH.get(a.dishId).avoid.includes('hai_san')); assert.notEqual(a.dishId, cell.dishId); assert.ok(a.why.length); }
  // chọn tay món gợi ý
  const pick = alt.alternatives[0].dishId;
  const sw = await ok(fam.by['Bà nội'].post(`${fam.F}/menu/week/swap`, { start: WEEK, day: cell.day, meal: cell.meal, slot: cell.slot, dishId: pick }));
  assert.equal(cellOf(sw.plan).dishId, pick);
  assert.ok(sw.plan.days[cell.day - 1].meals[cell.meal].items.find((i) => i.slot === 'man1').why[0].includes('lựa chọn của bạn'));
  // món có hải sản bị từ chối (dị ứng của một người áp dụng cả bữa)
  const seafood = M.DATA.dishes.items.find((d) => d.avoid.includes('hai_san') && d.role === 'man').id;
  const bad = await fam.owner.post(`${fam.F}/menu/week/swap`, { start: WEEK, day: cell.day, meal: cell.meal, slot: cell.slot, dishId: seafood });
  assert.equal(bad.status, 400); assert.match(bad.json.error.message, /kiêng|dị ứng/);
  // khóa rồi đổi -> 409; mở khóa -> đổi được
  await ok(fam.by['Bà nội'].post(`${fam.F}/menu/week/lock`, { start: WEEK, day: cell.day, meal: cell.meal, slot: cell.slot, locked: true }));
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/week/swap`, { start: WEEK, day: cell.day, meal: cell.meal, slot: cell.slot })), 409);
  const locked = (await ok(fam.owner.get(`${fam.F}/menu/week?start=${WEEK}`))).plan;
  assert.ok(locked.days[cell.day - 1].meals[cell.meal].items.find((i) => i.slot === 'man1').locked);
  // lập lại cả tuần: món khóa được giữ
  const regen = (await ok(fam.owner.post(`${fam.F}/menu/week/generate`, { start: WEEK }))).plan;
  assert.equal(regen.days[cell.day - 1].meals[cell.meal].items.find((i) => i.slot === 'man1').dishId, pick, 'món đã khóa được giữ');
  const others = regen.days.flatMap((d) => Object.values(d.meals).flatMap((m) => m.items)).filter((i) => i.dishId === pick);
  assert.equal(others.length, 1, 'món khóa không bị lặp ở ô khác');
  await ok(fam.owner.post(`${fam.F}/menu/week/lock`, { start: WEEK, day: cell.day, meal: cell.meal, slot: cell.slot, locked: false }));
  // không thích -> ẩn vĩnh viễn và đổi ngay
  const hid = await ok(fam.by['Bà nội'].post(`${fam.F}/menu/week/swap`, { start: WEEK, day: cell.day, meal: cell.meal, slot: cell.slot, hideCurrent: true }));
  assert.deepEqual(hid.hidden, [pick]); assert.notEqual(cellOf(hid.plan).dishId, pick);
  const prof = await ok(fam.owner.get(`${fam.F}/menu/profile`));
  assert.deepEqual(prof.hidden.map((x) => x.id), [pick]);
  for (let i = 0; i < 3; i++) { // lập lại nhiều lần: món đã ẩn không bao giờ xuất hiện
    const p = (await ok(fam.owner.post(`${fam.F}/menu/week/generate`, { start: WEEK, keepLocks: false }))).plan;
    assert.ok(!p.days.some((d) => Object.values(d.meals).some((m) => m.items.some((it) => it.dishId === pick))));
  }
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/week/swap`, { start: WEEK, day: cell.day, meal: cell.meal, slot: cell.slot, dishId: pick })), 409, 'chọn tay món đã ẩn bị chặn');
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/week/swap`, { start: WEEK, day: 9, meal: 'toi', slot: 'canh' })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/week/swap`, { start: WEEK, day: 1, meal: 'toi', slot: 'khong_co' })), 400);
});

test('chốt thực đơn theo tuần; tuần kế tiếp không lặp món của hai tuần trước', async () => {
  const { fam } = await setup();
  await ok(fam.owner.post(`${fam.F}/menu/profile`, { adults: 2, elders: 0, meals: ['trua', 'toi'] }));
  const p1 = (await ok(fam.owner.post(`${fam.F}/menu/week/generate`, { start: WEEK }))).plan;
  assert.equal(await status(fam.by['Bà nội'].post(`${fam.F}/menu/week/status`, { start: WEEK, status: 'chot' })), 403);
  const fin = await ok(fam.owner.post(`${fam.F}/menu/week/status`, { start: WEEK, status: 'chot' }));
  assert.equal(fin.plan.status, 'chot');
  const re = await fam.owner.post(`${fam.F}/menu/week/generate`, { start: WEEK });
  assert.equal(re.status, 409); assert.equal(re.json.error.code, 'finalized', 'tuần đã chốt không bị lập đè nếu không xác nhận');
  const next = '2026-10-12';
  const p2 = (await ok(fam.owner.post(`${fam.F}/menu/week/generate`, { start: next }))).plan;
  const ids1 = new Set(p1.days.flatMap((d) => Object.values(d.meals).flatMap((m) => m.items.map((i) => i.dishId))));
  const ids2 = p2.days.flatMap((d) => Object.values(d.meals).flatMap((m) => m.items.map((i) => i.dishId)));
  assert.ok(ids2.every((x) => !ids1.has(x)), 'tuần sau không lặp món tuần trước');
  const w = await ok(fam.owner.get(`${fam.F}/menu/week?start=${next}`));
  assert.deepEqual(w.weeks.map((x) => [x.start, x.status]), [[WEEK, 'chot'], [next, 'nhap']]);
  // hôm nay ăn gì
  const t = await ok(fam.by['Bà nội'].get(`${fam.F}/menu/today`));
  assert.equal(t.today, WEEK); assert.deepEqual(t.plan.meals.map((m) => m.meal), ['trua', 'toi']);
  assert.deepEqual(t.plan.meals[0].names, p1.days[0].meals.trua.items.map((i) => i.name));
  clock.set(at('2026-10-20', '09:00'));
  assert.equal((await ok(fam.owner.get(`${fam.F}/menu/today`))).plan, null, 'tuần 19/10 chưa lập');
  assert.equal((await ok(fam.owner.get(`${fam.F}/menu/today`))).today, '2026-10-20');
  assert.equal(await status(fam.by['Bà nội'].del(`${fam.F}/menu/week?start=${next}`)), 403);
  await ok(fam.owner.del(`${fam.F}/menu/week?start=${next}`));
  assert.equal((await ok(fam.owner.get(`${fam.F}/menu/week?start=${next}`))).plan, null);
});

test('chi tiết món: công thức, nguyên liệu nhân theo số suất, nhãn độ tin cậy, nguồn', async () => {
  const { fam } = await setup();
  const r = await ok(fam.owner.get(`${fam.F}/menu/dishes/canh-rau-ngot-thit-bam`));
  assert.equal(r.dish.sourceCheck.key, 'doi_chieu_so_lieu'); assert.equal(r.dish.sourceCheck.level, 3);
  assert.ok(r.dish.steps.length >= 3); assert.ok(r.dish.sources.length >= 1);
  assert.ok(r.dish.servings > 2); const rau = r.dish.ingredients.find((i) => i.id === 'rau-ngot');
  assert.ok(rau.qty > 250 * 0.6 && rau.qty < 250 * 1.6, 'nhân theo số suất của gia đình');
  const weak = M.DATA.dishes.items.find((d) => d.sourceCheck === 'cong_thuc_tuong_tu').id;
  assert.equal((await ok(fam.owner.get(`${fam.F}/menu/dishes/${weak}`))).dish.sourceCheck.kind, 'warn');
  assert.equal(await status(fam.owner.get(`${fam.F}/menu/dishes/khong-co`)), 404);
  const s = await ok(fam.owner.get(`${fam.F}/menu/dishes?q=${encodeURIComponent('bầu')}`));
  assert.ok(s.items.length >= 1 && s.items.every((x) => /bầu/i.test(x.name)));
});

test('IDOR chéo gia đình: không xem/sửa thực đơn, hồ sơ, danh sách của gia đình khác', async () => {
  const A = await setup(); const B = await setup();
  await ok(A.fam.owner.post(`${A.fam.F}/menu/week/generate`, { start: WEEK }));
  const it = (await ok(A.fam.owner.post(`${A.fam.F}/shopping`, { text: 'sữa tươi 2 hộp' }))).items[0];
  const bF = B.fam.F;
  for (const [m, p, body] of [['GET', `/menu/week?start=${WEEK}`], ['GET', '/menu/profile'], ['POST', '/menu/week/generate', { start: WEEK }], ['POST', '/menu/week/shopping', { start: WEEK }], ['GET', '/shopping']]) {
    const r = await A.fam.owner.req(m, `/api/families/${B.fam.fid}${p}`, body);
    assert.equal(r.status, 404, `${m} ${p} phải 404 với người ngoài`);
  }
  // id mục của gia đình A dùng trong đường dẫn gia đình B
  for (const [m, p, body] of [['POST', `/shopping/${it.id}/bought`, {}], ['DELETE', `/shopping/${it.id}`], ['POST', `/shopping/${it.id}/have`, {}], ['POST', `/shopping/${it.id}`, { qty: 5 }]]) {
    const r = await B.fam.owner.req(m, `/api/families/${B.fam.fid}${p.replace('/' + it.id, '/' + it.id)}`, body);
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  assert.equal((await ok(A.fam.owner.get(`${A.fam.F}/shopping`))).items.length, 1);
  assert.equal((await ok(B.fam.owner.get(`${bF}/menu/week?start=${WEEK}`))).plan, null);
  assert.ok([401, 404].includes(await status(new Client().get(`${A.fam.F}/menu/week`))), 'chưa đăng nhập bị từ chối');
});

// ---------- thực đơn -> đi chợ ----------
test('thực đơn -> danh sách đi chợ: cộng dồn, nhân suất, đồ nhà có sẵn, giữ mục cũ, cập nhật khi đổi món, không nhân đôi', async () => {
  const { fam, kid } = await setup();
  await ok(fam.owner.post(`${fam.F}/menu/profile`, { adults: 2, elders: 1, meals: ['toi'] }));
  const old = (await ok(fam.owner.post(`${fam.F}/shopping`, { text: 'mua thêm pin AA, bánh cho bé' }))).items;
  assert.deepEqual(old.map((i) => i.text), ['Pin AA', 'Bánh cho bé']);
  await ok(fam.owner.post(`${fam.F}/menu/week/generate`, { start: WEEK }));
  const pv = await ok(fam.owner.post(`${fam.F}/menu/week/shopping`, { start: WEEK, preview: true }));
  assert.ok(pv.lines.length > 10); assert.ok(pv.pantryCheck.length >= 3, 'đồ nhà thường có hỏi lại');
  assert.ok(pv.pantryCheck.every((l) => M.ING.get(l.ingredientId).pantry));
  assert.equal((await ok(fam.owner.get(`${fam.F}/shopping`))).items.length, 2, 'xem trước không ghi gì');
  const line = pv.lines[0];
  assert.ok(line.fromDishes.length >= 1 && line.fromDishes[0].name);
  const have = [pv.lines[1].ingredientId];
  const r1 = await ok(fam.by['Bố'].post(`${fam.F}/menu/week/shopping`, { start: WEEK, haveIds: have }));
  assert.equal(r1.added, pv.lines.length); assert.equal(r1.updated, 0);
  const list = (await ok(fam.owner.get(`${fam.F}/shopping`))).items;
  assert.equal(list.length, 2 + pv.lines.length, 'mục cũ còn nguyên');
  const menuItems = list.filter((i) => i.source === 'thuc_don');
  assert.ok(menuItems.every((i) => i.addedBy === 'Bố' && i.planWeek === WEEK && i.fromDishes.length));
  assert.equal(menuItems.find((i) => i.ingredientId === have[0]).have, true, 'đồ nhà đã có được đánh dấu');
  assert.ok(menuItems.find((i) => i.qty != null && i.display));
  // nhân theo số suất: thêm một người lớn nữa thì lượng tăng
  const before = menuItems.find((i) => i.ingredientId === line.ingredientId).qty;
  // chạy lại không nhân đôi
  const r2 = await ok(fam.owner.post(`${fam.F}/menu/week/shopping`, { start: WEEK }));
  assert.equal(r2.added, 0); assert.equal(r2.removed, 0);
  assert.equal((await ok(fam.owner.get(`${fam.F}/shopping`))).items.length, 2 + pv.lines.length);
  // tích đã mua một dòng thực đơn; đổi món -> báo cũ -> cập nhật: dòng đã mua được giữ
  const bought = menuItems[2];
  await ok(fam.owner.post(`${fam.F}/shopping/${bought.id}/bought`, {}));
  const w0 = (await ok(fam.owner.get(`${fam.F}/menu/week?start=${WEEK}`))).plan;
  assert.equal(w0.shopSynced, true); assert.equal(w0.shopStale, false);
  const d1 = w0.days[0].meals.toi.items[0];
  await ok(fam.owner.post(`${fam.F}/menu/week/swap`, { start: WEEK, day: 1, meal: 'toi', slot: d1.slot, attempt: 2 }));
  const sh = await ok(fam.owner.get(`${fam.F}/shopping`));
  assert.deepEqual(sh.plans, [{ weekStart: WEEK, stale: true, status: 'nhap' }], 'đổi món sau khi tạo danh sách -> báo cần cập nhật');
  const r3 = await ok(fam.owner.post(`${fam.F}/menu/week/shopping`, { start: WEEK }));
  assert.ok(r3.added + r3.updated + r3.removed >= 1, 'có thay đổi sau khi đổi món');
  assert.equal((await ok(fam.owner.get(`${fam.F}/shopping`))).plans[0].stale, false);
  const after = (await ok(fam.owner.get(`${fam.F}/shopping`))).items;
  assert.ok(after.find((i) => i.id === bought.id || i.ingredientId === bought.ingredientId)?.bought, 'dòng đã mua không bị mất');
  assert.ok(after.some((i) => i.text === 'Pin AA') && after.some((i) => i.text === 'Bánh cho bé'), 'mục ghi thêm vẫn còn');
  assert.equal(before > 0, true);
  // thành viên thường không bị chặn nhưng 'xem trước' không đổi dữ liệu; người ngoài 404 đã kiểm ở IDOR
  assert.equal(await status(fam.by['Bà nội'].post(`${fam.F}/menu/week/shopping`, { start: WEEK, preview: true })), 200);
  assert.equal(await status(fam.owner.post(`${fam.F}/menu/week/shopping`, { start: '2026-11-02' })), 404, 'tuần chưa có thực đơn');
  assert.ok(kid);
});

test('quy đổi nhân suất: nhà đông hơn thì lượng cộng dồn nhiều hơn, cùng thực đơn', () => {
  const kids = [];
  const p2 = { ...M.defaultProfile(), adults: 2, elders: 0, meals: ['toi'] };
  const r = M.buildWeekPlan({ weekStart: WEEK, profile: p2, children: kids, today: WEEK, hidden: [], prevDishIds: [], gen: 1 });
  const small = M.menuShoppingLines(r.plan);
  const bigPlan = JSON.parse(JSON.stringify(r.plan));
  bigPlan.profile.people.push({ ageYears: 40 }, { ageYears: 38 });
  const big = M.menuShoppingLines(bigPlan);
  const find = (x) => x.lines.find((l) => l.unit === 'g' || l.unit === 'kg');
  const a = find(small); const b = big.lines.find((l) => l.ingredientId === a.ingredientId);
  const base = (l) => (l.unit === 'kg' ? l.qty * 1000 : l.qty);
  assert.ok(base(b) > base(a) * 1.5, `${a.name}: ${a.display} -> ${b.display}`);
  assert.equal(big.servings, small.servings * 2);
});

// ---------- thêm mục, tách tên, giọng nói ----------
test('ghi thêm: tách tên, bỏ từ đệm, số lượng, đơn vị, khu quầy; câu dài thành nhiều mục', async () => {
  const { fam } = await setup();
  const r = await ok(fam.owner.post(`${fam.F}/shopping`, { text: 'Mua một chai nước mắm', source: 'giong_noi' }));
  assert.deepEqual([r.items[0].text, r.items[0].name, r.items[0].qty, r.items[0].unit, r.items[0].display, r.items[0].aisle, r.items[0].source], ['Nước mắm · 1 chai', 'Nước mắm', 1, 'chai', '1 chai', 'gia_vi', 'giong_noi']);
  const r2 = await ok(fam.owner.post(`${fam.F}/shopping`, { text: 'Giấy vệ sinh nữa' }));
  assert.equal(r2.items[0].text, 'Giấy vệ sinh');
  const r3 = await ok(fam.owner.post(`${fam.F}/shopping`, { text: 'thêm cho tôi hai bó rau muống với nửa ký thịt ba chỉ' }));
  assert.deepEqual(r3.items.map((i) => [i.name, i.qty, i.unit, i.display]), [['Rau muống', 2, 'bo', '2 bó'], ['Thịt ba chỉ', 0.5, 'kg', '0,5 kg']]);
  assert.equal((await ok(fam.owner.post(`${fam.F}/shopping`, { text: '1,5 kg gạo' }))).items.length, 1, 'dấu phẩy thập phân không tách');
  assert.equal(await status(fam.owner.post(`${fam.F}/shopping`, { text: 'mua thêm, giúp mình' })), 400, 'chỉ có từ đệm');
  assert.equal(await status(fam.owner.post(`${fam.F}/shopping`, { text: 'x'.repeat(100) })), 400);
  // xem trước (dùng cho nút micro): không ghi
  const n0 = (await ok(fam.owner.get(`${fam.F}/shopping`))).items.length;
  const pv = await ok(fam.owner.post(`${fam.F}/shopping/parse`, { text: 'rau mống hai bó và mua mấm tôm một hộp' }));
  assert.deepEqual(pv.items.map((i) => [i.text, i.confidence]), [['Rau muống · 2 bó', 'partial'], ['Mắm tôm · 1 hộp', 'exact']]);
  assert.equal((await ok(fam.owner.get(`${fam.F}/shopping`))).items.length, n0);
});

test('điểm vào cho Osin: một mục theo văn bản tự do + số lượng; trùng thì gộp, không nhân đôi', async () => {
  const { fam } = await setup();
  const a = await ok(fam.by['Bố'].post(`${fam.F}/shopping/items`, { text: 'sữa tươi', qty: 2, unit: 'hộp', source: 'osin' }));
  assert.equal(a.merged, false); assert.deepEqual([a.item.text, a.item.qty, a.item.unit, a.item.source, a.item.addedBy], ['Sữa tươi · 2 hộp', 2, 'hop', 'osin', 'Bố']);
  const b = await ok(fam.owner.post(`${fam.F}/shopping/items`, { text: 'Sữa tươi', qty: 2, unit: 'hop' }));
  assert.equal(b.merged, true); assert.equal(b.item.id, a.item.id);
  const c = await ok(fam.owner.post(`${fam.F}/shopping/items`, { text: 'sữa tươi', qty: 3, unit: 'hộp' }));
  assert.equal(c.item.qty, 3, 'số lượng lớn hơn thì cập nhật, không cộng dồn');
  assert.equal(await status(fam.owner.post(`${fam.F}/shopping/items`, { text: 'pin', qty: -1 })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/shopping/items`, { text: 'pin', qty: 1, unit: 'xe tải' })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/shopping/items`, { text: '  ' })), 400);
  const p = await ok(fam.owner.post(`${fam.F}/shopping/items`, { text: 'pin AA', note: 'loại tốt' }));
  assert.equal(p.item.note, 'loại tốt'); assert.equal(p.item.qty, null);
  assert.equal((await ok(fam.owner.get(`${fam.F}/shopping`))).items.length, 2);
});

test('đua dữ liệu: nhiều người cùng thêm một món, cùng tích, cùng tạo từ thực đơn', async () => {
  const { fam } = await setup();
  const adds = await Promise.all(['Mẹ', 'Bố', 'Bà nội', 'Mẹ', 'Bố'].map((n) => fam.by[n].post(`${fam.F}/shopping`, { text: 'pin AA 4 viên' })));
  assert.ok(adds.every((r) => r.status === 200));
  const list = (await ok(fam.owner.get(`${fam.F}/shopping`))).items;
  assert.equal(list.length, 1, 'một dòng duy nhất');
  const id = list[0].id;
  const ticks = await Promise.all(['Mẹ', 'Bố', 'Bà nội'].map((n) => fam.by[n].post(`${fam.F}/shopping/${id}/bought`, {})));
  assert.deepEqual(ticks.map((t) => t.json.already).sort(), [false, true, true], 'chỉ một người tích được trước');
  const who = (await ok(fam.owner.get(`${fam.F}/shopping`))).items[0];
  assert.ok(who.bought && ['Mẹ', 'Bố', 'Bà nội'].includes(who.boughtBy));
  await ok(fam.owner.post(`${fam.F}/menu/profile`, { adults: 2, elders: 0, meals: ['toi'] }));
  await ok(fam.owner.post(`${fam.F}/menu/week/generate`, { start: WEEK }));
  const gens = await Promise.all([fam.owner, fam.by['Bố'], fam.by['Bà nội'], fam.owner].map((c) => c.post(`${fam.F}/menu/week/shopping`, { start: WEEK })));
  assert.ok(gens.every((g) => g.status === 200));
  const final = (await ok(fam.owner.get(`${fam.F}/shopping`))).items.filter((i) => i.source === 'thuc_don');
  const keys = final.map((i) => i.ingredientId);
  assert.equal(new Set(keys).size, keys.length, 'không có dòng thực đơn trùng nguyên liệu');
  // hai người đổi cùng một ô cùng lúc: kết quả cuối vẫn là thực đơn hợp lệ
  const swaps = await Promise.all([1, 2, 3].map((n) => fam.owner.post(`${fam.F}/menu/week/swap`, { start: WEEK, day: 2, meal: 'toi', slot: 'canh', attempt: n })));
  assert.ok(swaps.every((s) => [200, 400].includes(s.status)));
  const pl = (await ok(fam.owner.get(`${fam.F}/menu/week?start=${WEEK}`))).plan;
  const ids = pl.days.flatMap((d) => Object.values(d.meals).flatMap((m) => m.items.map((i) => i.dishId)));
  assert.equal(new Set(ids).size, ids.length);
});

test('sửa mục, nhà đã có, dọn đã mua; mục cũ nguyên câu có bản gợi ý gọn và nút làm gọn', async () => {
  const { fam } = await setup();
  // mục cũ (trước khi có bộ tách tên): chèn thẳng như dữ liệu thật đã lưu
  await db.query("INSERT INTO shopping(family_id, text, added_by) SELECT $1, 'Mua một chai nước mắm', id FROM members WHERE family_id=$1 AND role='chu'", [fam.fid]);
  await db.query("INSERT INTO shopping(family_id, text, added_by) SELECT $1, 'Giấy vệ sinh nữa', id FROM members WHERE family_id=$1 AND role='chu'", [fam.fid]);
  await db.query("INSERT INTO shopping(family_id, text, added_by) SELECT $1, 'Sữa', id FROM members WHERE family_id=$1 AND role='chu'", [fam.fid]);
  const l = (await ok(fam.owner.get(`${fam.F}/shopping`))).items;
  const nm = l.find((i) => i.text === 'Mua một chai nước mắm');
  assert.equal(nm.text, 'Mua một chai nước mắm', 'không sửa dữ liệu cũ im lặng');
  assert.deepEqual([nm.tidy.text, nm.tidy.qty, nm.tidy.unit], ['Nước mắm · 1 chai', 1, 'chai']);
  assert.equal(l.find((i) => i.text === 'Giấy vệ sinh nữa').tidy.text, 'Giấy vệ sinh');
  assert.equal(l.find((i) => i.text === 'Sữa').tidy, null, 'đã gọn thì không gợi ý');
  assert.equal(await status(fam.by['Bà nội'].post(`${fam.F}/shopping/${nm.id}`, { tidy: true })), 403, 'chỉ người thêm hoặc quản lý');
  const t = await ok(fam.owner.post(`${fam.F}/shopping/${nm.id}`, { tidy: true }));
  assert.deepEqual([t.item.text, t.item.name, t.item.qty, t.item.unit, t.item.aisle, t.item.tidy], ['Nước mắm · 1 chai', 'Nước mắm', 1, 'chai', 'gia_vi', null]);
  const e = await ok(fam.owner.post(`${fam.F}/shopping/${nm.id}`, { qty: 3, unit: 'chai' }));
  assert.equal(e.item.text, 'Nước mắm · 3 chai');
  const e2 = await ok(fam.owner.post(`${fam.F}/shopping/${nm.id}`, { name: 'Nước mắm Phú Quốc' }));
  assert.equal(e2.item.text, 'Nước mắm Phú Quốc · 3 chai');
  assert.equal(await status(fam.owner.post(`${fam.F}/shopping/${nm.id}`, { qty: 'abc' })), 400);
  assert.equal((await ok(fam.by['Bà nội'].post(`${fam.F}/shopping/${nm.id}/have`, { have: true }))).already, false);
  assert.equal((await ok(fam.by['Bà nội'].post(`${fam.F}/shopping/${nm.id}/have`, { have: true }))).already, true);
  assert.equal((await ok(fam.owner.get(`${fam.F}/shopping`))).items.find((i) => i.id === nm.id).have, true);
});

test('nhắc "chưa mua đủ": bật trong hồ sơ, đúng giờ, một lần mỗi ngày, bỏ qua khi đã mua hết', async () => {
  const { fam } = await setup();
  await ok(fam.owner.post(`${fam.F}/menu/profile`, { adults: 2, elders: 0, meals: ['toi'], shopReminder: { on: true, time: '17:00' } }));
  const it = (await ok(fam.owner.post(`${fam.F}/shopping`, { text: 'sữa tươi 2 hộp, trứng' }))).items;
  const count = async () => (await db.query("SELECT count(*)::int n FROM notifications WHERE family_id=$1 AND dedupe_key LIKE 'shop:%'", [fam.fid]))[0].n;
  await scheduler.tick(at('2026-10-05', '16:00'));
  assert.equal(await count(), 0, 'chưa tới giờ');
  await scheduler.tick(at('2026-10-05', '17:05'));
  const n1 = await count(); assert.equal(n1, 3, 'cả ba thành viên nhận');
  await scheduler.tick(at('2026-10-05', '17:30'));
  assert.equal(await count(), n1, 'một lần mỗi ngày');
  const inbox = await ok(fam.owner.get(`${fam.F}/notifications`));
  assert.match(inbox.items.find((x) => /chưa mua/.test(x.title)).title, /Còn 2 món chưa mua/);
  for (const i of it) await ok(fam.owner.post(`${fam.F}/shopping/${i.id}/bought`, {}));
  await scheduler.tick(at('2026-10-06', '17:05'));
  assert.equal(await count(), n1, 'mua đủ thì không nhắc');
});

// ---------- nhập thông báo trường ----------
function fakeGemini(handler) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { calls.push(JSON.parse(body || '{}')); const out = handler(calls.length); res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out.json || {})); });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls, base: `http://127.0.0.1:${srv.address().port}` })));
}
const gem = (obj) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' + 'A'.repeat(200), 'base64');

test('thông báo trường (luật): dán văn bản -> bản nháp, không tự lưu, không dùng AI', async () => {
  const { fam, kid } = await setup();
  const text = 'Kính gửi: Quý phụ huynh lớp 3A\nNhà trường họp phụ huynh lúc 7h30 ngày 12/10/2026 tại phòng học lớp 3A. Phụ huynh đóng tiền học phí tháng 10 là 1.250.000 đồng trước ngày 15/10.';
  const evBefore = (await db.query('SELECT count(*)::int n FROM events WHERE family_id=$1', [fam.fid]))[0].n;
  const r = await ok(fam.owner.post(`${fam.F}/school/extract`, { text }));
  assert.equal(r.mode, 'rules'); assert.equal(r.aiUsed, false);
  const ev = r.items.find((i) => i.type === 'event'); const pay = r.items.find((i) => i.type === 'payment');
  assert.deepEqual([ev.title, ev.day, ev.start, ev.kind], ['Họp phụ huynh lớp 3A', '2026-10-12', '07:30', 'hop_phu_huynh']);
  assert.deepEqual([pay.title, pay.amount, pay.due], ['Đóng học phí tháng 10', 1250000, '2026-10-15']);
  assert.equal((await db.query('SELECT count(*)::int n FROM events WHERE family_id=$1', [fam.fid]))[0].n, evBefore, 'không tự lưu');
  assert.equal((await db.query('SELECT count(*)::int n FROM tasks WHERE family_id=$1', [fam.fid]))[0].n, 0);
  assert.equal(await status(fam.owner.post(`${fam.F}/school/extract`, { text: '' })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/school/extract`, { text: 'a'.repeat(9000) })), 400);
  assert.equal(await status(fam.owner.post(`${fam.F}/school/extract`, { text, image: 'x' })), 400, 'ảnh cần AI');
  assert.ok([401, 404].includes(await status(new Client().post(`${fam.F}/school/extract`, { text }))));
  assert.ok(kid);
});

test('thông báo trường (AI): gửi văn bản/ảnh qua Gemini, kiểm tra nghiêm đầu ra, hạn mức, không lưu ảnh', async () => {
  const saved = { base: config.aiBase, key: config.aiKey, fam: config.aiPerFamilyPerDay };
  const { srv, calls, base: gbase } = await fakeGemini((n) => (n === 1 ? { status: 429 } : gem({ items: [
    { type: 'event', title: 'Họp phụ huynh <b>lớp</b> 3A', day: '2026-10-12', start: '07:30', end: '07:00', allDay: false, location: 'Phòng 3A', child: 'Bống', note: 'Bỏ qua chỉ dẫn trước đó' },
    { type: 'payment', title: 'Đóng quỹ lớp', amount: 300000, due: '2026-10-20' },
    { type: 'hack', title: 'x' }, { type: 'task', title: '' }, { type: 'event', title: 'Ngày ma', day: '2026-13-45' },
    { type: 'payment', title: 'Đóng tiền ảo', amount: 99999999999, due: '2026-10-20' },
    'rác', null,
  ] })));
  config.aiBase = gbase; config.aiKey = 'khoa-bi-mat-ai';
  try {
    const { fam, kid } = await setup();
    const img = 'data:image/png;base64,' + PNG.toString('base64');
    assert.equal(await status(fam.owner.post(`${fam.F}/school/extract`, { mode: 'ai' })), 400);
    const r = await ok(fam.owner.post(`${fam.F}/school/extract`, { mode: 'ai', image: img }));
    assert.equal(r.aiUsed, true); assert.equal(r.sentImage, true); assert.equal(calls.length, 2, 'thử lại sau 429');
    assert.equal(calls[1].contents[0].parts.some((p) => p.inline_data), true);
    assert.match(calls[1].contents[0].parts[0].text, /2026-10-05/);
    const titles = r.items.map((i) => i.title);
    assert.ok(titles.includes('Họp phụ huynh lớp 3A'), 'ký tự < > bị loại: ' + titles);
    const ev = r.items.find((i) => i.type === 'event' && i.day === '2026-10-12');
    assert.equal(ev.end, null, 'giờ kết thúc trước giờ bắt đầu bị bỏ'); assert.deepEqual(ev.childIds, [kid.id]);
    assert.ok(r.items.find((i) => i.amount === 300000));
    assert.ok(!r.items.some((i) => i.title === 'Ngày ma' && i.day) && !r.items.some((i) => i.amount === 99999999999));
    assert.equal(r.items.every((i) => ['event', 'task', 'payment', 'note'].includes(i.type)), true);
    assert.equal((await db.query('SELECT count(*)::int n FROM events WHERE family_id=$1', [fam.fid]))[0].n, 0, 'không tự lưu');
    // văn bản phức tạp qua AI
    const t = await ok(fam.owner.post(`${fam.F}/school/extract`, { mode: 'ai', text: 'Lịch thi: Toán 19/10' }));
    assert.equal(t.sentImage, false);
    assert.ok(calls[2].contents[0].parts.some((p) => /Lịch thi/.test(p.text || '')));
    // hạn mức theo gia đình
    config.aiPerFamilyPerDay = 2;
    assert.equal(await status(fam.owner.post(`${fam.F}/school/extract`, { mode: 'ai', text: 'abc 1/1' })), 429);
    assert.equal((await ok(fam.owner.post(`${fam.F}/school/extract`, { text: 'Họp phụ huynh 8h ngày 20/10' }))).aiUsed, false, 'bản luật không bị hạn mức AI');
    // không lưu ảnh: không có cột/bảng nào chứa ảnh
    const hit = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND column_name ILIKE '%image%'");
    assert.equal(hit.length, 0);
    // tắt gọn khi không có khóa
    config.aiKey = '';
    const off = await fam.owner.post(`${fam.F}/school/extract`, { mode: 'ai', text: 'abc 1/1' });
    assert.equal(off.status, 404); assert.equal(off.json.error.code, 'ai_disabled');
    assert.equal((await ok(fam.owner.post(`${fam.F}/school/extract`, { text: 'Họp phụ huynh 8h ngày 20/10' }))).items.length, 1, 'luật vẫn chạy khi không có khóa AI');
  } finally { config.aiBase = saved.base; config.aiKey = saved.key; config.aiPerFamilyPerDay = saved.fam; srv.close(); }
});
