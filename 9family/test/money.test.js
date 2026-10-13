// Tích hợp (PostgreSQL thật + 9id giả): tiền gia đình. Tên toàn BỊA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot, shutdown, makeFamily, addChild, ok, clock, scheduler, at, db, Client } from './helper.js';
import { createDueItem } from '../src/money/api.js';
import { toFinRecords } from '../src/money/fin-export.js';

const query = (...a) => db.query(...a);
before(async () => { await boot(); });
after(shutdown);

async function setup(names = ['Mẹ', 'Bố', 'Bà nội'], opts = {}) {
  clock.set(at('2026-10-05', '06:00'));
  const fam = await makeFamily(names, opts);
  const kid = await addChild(fam, 'Bống');
  return { fam, kid, M: `${fam.F}/money` };
}

test('createDueItem: dữ liệu hợp lệ, chống trùng theo extKey, tạo sự kiện lịch, kiểm tra con thuộc gia đình', async () => {
  const { fam, kid } = await setup();
  const other = await setup(['Chị Hai']);
  const args = { familyId: fam.fid, title: 'Học phí tháng 10', amount: 1500000, dueDate: '2026-10-15', childId: kid.id, source: 'truong', extKey: 'truong:abc:1' };
  const r1 = await db.tx((c) => createDueItem(c, args));
  const r2 = await db.tx((c) => createDueItem(c, args));
  assert.equal(r1.created, true); assert.equal(r2.created, false); assert.equal(r1.id, r2.id);
  assert.equal((await query('SELECT count(*)::int n FROM money_dues WHERE family_id=$1', [fam.fid]))[0].n, 1);
  const ev = (await query('SELECT * FROM events WHERE id=$1', [r1.eventId]))[0];
  assert.equal(ev.start_date, '2026-10-15'); assert.equal(ev.all_day, true); assert.deepEqual(ev.child_ids, [kid.id]); assert.equal(ev.source, 'money');
  assert.equal((await query('SELECT count(*)::int n FROM events WHERE family_id=$1 AND source=$2', [fam.fid, 'money']))[0].n, 1, 'gọi lại không tạo thêm sự kiện');
  // dùng được cả với hàm query thường, không tạo sự kiện nếu withEvent=false
  const r3 = await createDueItem(query, { familyId: fam.fid, title: 'Quỹ lớp', amount: 200000, dueDate: '2026-10-20', withEvent: false });
  assert.equal(r3.eventId, null);
  for (const bad of [{ amount: -1 }, { amount: 1.5 }, { amount: '100' }, { dueDate: '2026-02-30' }, { title: '' }, { childId: other.kid.id }]) {
    await assert.rejects(() => db.tx((c) => createDueItem(c, { ...args, extKey: undefined, ...bad })), (e) => e.status === 400, JSON.stringify(bad));
  }
});

test('khoản phải đóng: chủ/quản lý sửa; thành viên chỉ xem; đánh dấu đã đóng + ghi vào chi tiêu; xóa kèm sự kiện', async () => {
  const { fam, kid, M } = await setup(['Mẹ', 'Bố', 'Bà nội'], { roles: { 'Bố': 'quan_ly' } });
  const d = await ok(fam.owner.post(`${M}/dues`, { title: 'Học phí tháng 10', amount: 1500000, dueDate: '2026-10-15', childId: kid.id }));
  assert.equal((await fam.by['Bà nội'].post(`${M}/dues`, { title: 'x', amount: 1, dueDate: '2026-10-15' })).status, 403);
  assert.equal((await fam.by['Bà nội'].post(`${M}/dues/${d.id}`, { paid: true })).status, 403);
  assert.equal((await fam.by['Bà nội'].del(`${M}/dues/${d.id}`)).status, 403);
  const view = await ok(fam.by['Bà nội'].get(M));
  assert.equal(view.dues.length, 1); assert.equal(view.perm.manage, false);
  assert.equal((await fam.owner.post(`${M}/dues`, { title: 'x', amount: 1.5, dueDate: '2026-10-15' })).status, 400);
  await ok(fam.by['Bố'].post(`${M}/dues/${d.id}`, { paid: true, addExpense: true, paidBy: fam.ids['Bố'] })); // quản lý cũng được
  let v = await ok(fam.owner.get(M));
  assert.equal(v.dues[0].paid, true); assert.equal(v.dues[0].paidBy, fam.ids['Bố']);
  assert.equal(v.summary.byCat.hoc_hanh, 1500000);
  await ok(fam.owner.post(`${M}/dues/${d.id}`, { paid: false }));
  v = await ok(fam.owner.get(M));
  assert.equal(v.dues[0].paid, false);
  await ok(fam.owner.post(`${M}/dues/${d.id}`, { dueDate: '2026-10-18', title: 'Học phí đợt 2' }));
  assert.equal((await query("SELECT start_date FROM events WHERE family_id=$1 AND source='money'", [fam.fid]))[0].start_date, '2026-10-18');
  await ok(fam.owner.del(`${M}/dues/${d.id}`));
  assert.equal((await query("SELECT count(*)::int n FROM events WHERE family_id=$1 AND source='money'", [fam.fid]))[0].n, 0);
});

test('nhắc khoản phải đóng: trước 3 ngày, đúng hạn, sau hạn; mỗi mốc một lần; đã đóng thì thôi', async () => {
  const { fam, kid, M } = await setup(['Mẹ', 'Bố', 'Bà nội'], { roles: { 'Bố': 'quan_ly' } });
  const d = await ok(fam.owner.post(`${M}/dues`, { title: 'Học phí Bịa', amount: 1500000, dueDate: '2026-10-08', childId: kid.id }));
  await query('DELETE FROM notifications');
  await scheduler.tick(at('2026-10-05', '07:00'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='money'"))[0].n, 0, 'chưa 08:00');
  await scheduler.tick(at('2026-10-05', '08:05')); await scheduler.tick(at('2026-10-05', '08:25'));
  const rows = await query("SELECT member_id FROM notifications WHERE type='money' ORDER BY member_id");
  assert.deepEqual(rows.map((r) => r.member_id).sort(), [fam.ids['Mẹ'], fam.ids['Bố']].sort(), 'chỉ chủ và quản lý, một lần');
  await scheduler.tick(at('2026-10-08', '08:01'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='money'"))[0].n, 4);
  await ok(fam.owner.post(`${M}/dues/${d.id}`, { paid: true }));
  await scheduler.tick(at('2026-10-09', '08:01'));
  assert.equal((await query("SELECT count(*)::int n FROM notifications WHERE type='money'"))[0].n, 4, 'đã đóng thì không nhắc quá hạn');
  const n = (await query("SELECT body FROM notifications WHERE type='money' LIMIT 1"))[0];
  assert.match(n.body, /1\.500\.000 đ/);
});

test('chi tiêu chung: thành viên ghi và chỉ thấy của mình; chủ thấy tất cả; sửa/xóa/hoàn tác; IDOR giữa các thành viên', async () => {
  const { fam, M } = await setup();
  const a = await ok(fam.by['Bố'].post(`${M}/expenses`, { amount: 350000, category: 'di_cho', day: '2026-10-05', note: 'Chợ' }));
  const b = await ok(fam.owner.post(`${M}/expenses`, { amount: 1200000, category: 'dien_nuoc', note: 'Điện' }));
  assert.equal((await fam.by['Bố'].post(`${M}/expenses`, { amount: 0 })).status, 400);
  assert.equal((await fam.by['Bố'].post(`${M}/expenses`, { amount: 12.5 })).status, 400);
  assert.equal((await fam.by['Bố'].post(`${M}/expenses`, { amount: 1000, day: '2027-01-01' })).status, 400);
  // thành viên không ghi hộ người khác
  const c = await ok(fam.by['Bố'].post(`${M}/expenses`, { amount: 5000, who: fam.ids['Mẹ'] }));
  assert.equal((await query('SELECT who FROM money_expenses WHERE id=$1', [c.id]))[0].who, fam.ids['Bố']);
  const own = await ok(fam.owner.get(M));
  assert.equal(own.summary.total, 1555000); assert.equal(own.expenses.length, 3);
  assert.equal(Object.keys(own.summary.byWho).length, 2);
  const bo = await ok(fam.by['Bố'].get(M));
  assert.equal(bo.summary.total, 1555000, 'thành viên xem tổng');
  assert.equal(bo.summary.byWho, undefined, 'không xem chi theo từng người');
  assert.equal(bo.expenses.length, 2, 'thành viên chỉ thấy khoản của mình');
  assert.equal((await ok(fam.by['Bà nội'].get(M))).expenses.length, 0);
  // IDOR trong gia đình
  assert.equal((await fam.by['Bố'].post(`${M}/expenses/${b.id}`, { amount: 1 })).status, 404);
  assert.equal((await fam.by['Bố'].del(`${M}/expenses/${b.id}`)).status, 404);
  assert.equal((await fam.by['Bà nội'].del(`${M}/expenses/${a.id}`)).status, 404);
  // sửa, xóa mềm, hoàn tác
  await ok(fam.by['Bố'].post(`${M}/expenses/${a.id}`, { amount: 360000 }));
  await ok(fam.by['Bố'].del(`${M}/expenses/${a.id}`));
  assert.equal((await ok(fam.owner.get(M))).summary.total, 1205000);
  await ok(fam.by['Bố'].post(`${M}/expenses/${a.id}/restore`, {}));
  assert.equal((await ok(fam.owner.get(M))).summary.total, 1565000);
  // chủ sửa được của người khác và đổi người chi
  await ok(fam.owner.post(`${M}/expenses/${a.id}`, { category: 'an_uong', who: fam.ids['Mẹ'] }));
  assert.equal((await query('SELECT who FROM money_expenses WHERE id=$1', [a.id]))[0].who, fam.ids['Mẹ']);
});

test('tổng theo tháng/danh mục, ngân sách nhẹ nhàng, lịch sử 6 tháng', async () => {
  const { fam, M } = await setup();
  for (const [day, amount, category] of [['2026-09-20', 400000, 'an_uong'], ['2026-10-01', 350000, 'di_cho'], ['2026-10-04', 450000, 'di_cho'], ['2026-10-05', 200000, 'y_te']]) {
    await ok(fam.owner.post(`${M}/expenses`, { amount, category, day }));
  }
  let v = await ok(fam.owner.get(M));
  assert.equal(v.summary.total, 1000000); assert.equal(v.summary.byCat.di_cho, 800000); assert.equal(v.summary.byCat.y_te, 200000); assert.equal(v.budgetStatus.level, 'none');
  assert.equal((await ok(fam.owner.get(`${M}?month=2026-09`))).summary.total, 400000);
  assert.deepEqual(v.history.map((h) => h.month), ['2026-09', '2026-10']);
  assert.equal((await fam.by['Bố'].post(`${M}/budget`, { budget: 1000000 })).status, 403);
  await ok(fam.owner.post(`${M}/budget`, { budget: 1100000 }));
  v = await ok(fam.owner.get(M));
  assert.equal(v.budgetStatus.level, 'near');
  const r = await ok(fam.owner.post(`${M}/expenses`, { amount: 300000, category: 'khac', day: '2026-10-05' }));
  assert.equal(r.budgetStatus.level, 'over'); assert.match(r.budgetStatus.text, /vượt ngân sách/);
  assert.doesNotMatch(r.budgetStatus.text, /!|phải|cấm/);
  assert.equal((await fam.owner.get(`${M}?month=2026-13`)).status, 200, 'tháng sai thì dùng tháng hiện tại');
});

test('xuất CSV: chủ xuất tất cả, thành viên chỉ khoản của mình, chặn công thức', async () => {
  const { fam, M } = await setup();
  await ok(fam.owner.post(`${M}/expenses`, { amount: 100000, category: 'khac', note: '=HYPERLINK("x")' }));
  await ok(fam.by['Bố'].post(`${M}/expenses`, { amount: 50000, category: 'an_uong', note: 'Phở, bò' }));
  const all = await fam.owner.get(`${M}/export.csv?month=2026-10`, { raw: true });
  assert.equal(all.status, 200); assert.match(all.headers.get('content-type'), /text\/csv/);
  assert.match(all.text, /Ngày,Số tiền \(đồng\),Danh mục,Người chi,Ghi chú/);
  assert.ok(all.text.includes("'=HYPERLINK"), 'chặn công thức'); assert.ok(all.text.includes('"Phở, bò"'));
  const mine = await fam.by['Bố'].get(`${M}/export.csv`, { raw: true });
  assert.ok(mine.text.includes('Phở') && !mine.text.includes('HYPERLINK'));
  assert.equal((await new Client().get(`${M}/export.csv`)).status, 401);
});

test('tiền tiêu vặt: đặt mức, đưa mỗi kỳ một lần, ghi chi, số dư, mục tiêu, hoàn tác; thành viên không thấy', async () => {
  const { fam, kid, M } = await setup();
  const A = `${M}/allowance/${kid.id}`;
  assert.equal((await fam.owner.post(`${A}/give`, {})).status, 409, 'chưa đặt mức');
  await ok(fam.owner.post(A, { amount: 50000, period: 'tuan', goalName: 'Xe đạp Bịa', goalAmount: 200000 }));
  const g1 = await ok(fam.owner.post(`${A}/give`, {}));
  const g2 = await fam.owner.post(`${A}/give`, {});
  assert.equal(g2.status, 409); assert.equal(g2.json.error.code, 'already_given');
  const ex = await ok(fam.owner.post(`${A}/entries`, { kind: 'chi', amount: 12000, note: 'Kẹo' }));
  let v = await ok(fam.owner.get(M));
  const al = v.allowances.find((x) => x.childId === kid.id);
  assert.equal(al.balance, 38000); assert.equal(al.goalPct, 19); assert.equal(al.givenThisPeriod, true);
  await ok(fam.owner.del(`${M}/allowance/entries/${ex.id}`));
  await ok(fam.owner.del(`${M}/allowance/entries/${g1.id}`));
  v = await ok(fam.owner.get(M));
  assert.equal(v.allowances[0].balance, 0);
  assert.equal((await fam.owner.post(`${A}/give`, {})).status, 200, 'xóa dòng đưa tiền thì ghi lại được');
  await ok(fam.owner.post(`${A}/entries`, { kind: 'dieu_chinh', amount: -5000 }));
  assert.equal((await fam.owner.post(`${A}/entries`, { kind: 'chi', amount: -5 })).status, 400);
  assert.equal((await fam.owner.post(`${A}/entries`, { kind: 'dieu_chinh', amount: 0 })).status, 400);
  // quyền
  assert.equal((await fam.by['Bố'].post(A, { amount: 1 })).status, 403);
  assert.equal((await fam.by['Bố'].post(`${A}/give`, {})).status, 403);
  const bo = await ok(fam.by['Bố'].get(M));
  assert.equal(bo.allowances, undefined); assert.equal(bo.perm.seeAllowance, false);
  // kỳ tháng
  await ok(fam.owner.post(A, { amount: 100000, period: 'thang' }));
  assert.equal((await ok(fam.owner.get(M))).allowances[0].period, 'thang');
});

test('vai "con": chỉ thấy tiền tiêu vặt và khoản phải đóng của mình; không ghi chi tiêu, không xuất, không thấy tổng', async () => {
  clock.set(at('2026-10-05', '06:00'));
  const fam = await makeFamily(['Mẹ', 'Bố', 'Bé Bống'], { roles: { 'Bé Bống': 'con' } });
  const kid = await addChild(fam, 'Bống', { linkedUserId: fam.userIds['Bé Bống'] });
  const kid2 = await addChild(fam, 'Cún');
  const M = `${fam.F}/money`;
  await ok(fam.owner.post(`${M}/allowance/${kid.id}`, { amount: 20000, period: 'tuan' }));
  await ok(fam.owner.post(`${M}/allowance/${kid2.id}`, { amount: 90000, period: 'tuan' }));
  await ok(fam.owner.post(`${M}/allowance/${kid.id}/give`, {}));
  await ok(fam.owner.post(`${M}/dues`, { title: 'Quỹ lớp Bống', amount: 100000, dueDate: '2026-10-20', childId: kid.id }));
  await ok(fam.owner.post(`${M}/dues`, { title: 'Quỹ lớp Cún', amount: 100000, dueDate: '2026-10-20', childId: kid2.id }));
  await ok(fam.owner.post(`${M}/dues`, { title: 'Điện nước chung', amount: 100000, dueDate: '2026-10-20' }));
  await ok(fam.owner.post(`${M}/expenses`, { amount: 777000 }));
  const con = fam.by['Bé Bống'];
  const v = await ok(con.get(M));
  assert.equal(v.role, 'con');
  assert.deepEqual(v.allowances.map((a) => a.childId), [kid.id]);
  assert.deepEqual(v.dues.map((d) => d.title), ['Quỹ lớp Bống']);
  assert.equal(v.summary, undefined); assert.equal(v.expenses, undefined); assert.equal(v.budget, undefined);
  assert.ok(!JSON.stringify(v).includes('777000'));
  assert.equal((await con.post(`${M}/expenses`, { amount: 1000 })).status, 403);
  assert.equal((await con.post(`${M}/allowance/${kid.id}/give`, {})).status, 403);
  assert.equal((await con.post(`${M}/dues`, { title: 'x', amount: 1, dueDate: '2026-10-20' })).status, 403);
  assert.equal((await con.get(`${M}/export.csv`)).status, 403);
});

test('IDOR chéo gia đình cho khoản chi, khoản phải đóng, sổ tiêu vặt', async () => {
  const A = await setup(); const B = await setup(['Chị Hai']);
  const e = await ok(A.fam.owner.post(`${A.M}/expenses`, { amount: 1000 }));
  const d = await ok(A.fam.owner.post(`${A.M}/dues`, { title: 'x', amount: 5, dueDate: '2026-10-20' }));
  await ok(A.fam.owner.post(`${A.M}/allowance/${A.kid.id}`, { amount: 1000 }));
  const g = await ok(A.fam.owner.post(`${A.M}/allowance/${A.kid.id}/entries`, { kind: 'dua', amount: 1000 }));
  assert.equal((await B.fam.owner.get(A.M)).status, 404);
  assert.equal((await B.fam.owner.post(`${B.M}/expenses/${e.id}`, { amount: 5 })).status, 404);
  assert.equal((await B.fam.owner.del(`${B.M}/expenses/${e.id}`)).status, 404);
  assert.equal((await B.fam.owner.post(`${B.M}/dues/${d.id}`, { paid: true })).status, 404);
  assert.equal((await B.fam.owner.del(`${B.M}/dues/${d.id}`)).status, 404);
  assert.equal((await B.fam.owner.post(`${B.M}/allowance/${A.kid.id}/give`, {})).status, 404);
  assert.equal((await B.fam.owner.post(`${B.M}/allowance/${A.kid.id}/entries`, { kind: 'dua', amount: 1 })).status, 404);
  assert.equal((await B.fam.owner.del(`${B.M}/allowance/entries/${g.id}`)).status, 404);
  assert.equal((await B.fam.owner.post(`${B.M}/dues`, { title: 'x', amount: 1, dueDate: '2026-10-20', childId: A.kid.id })).status, 400);
  assert.equal((await ok(A.fam.owner.get(A.M))).expenses.length, 1, 'dữ liệu của A nguyên vẹn');
});

test('định dạng xuất sang 9Fin (chưa nối): ổn định, có externalId, không kèm tiêu vặt', () => {
  const rows = [{ id: 'e1', day: '2026-10-05', amount: '350000', category: 'di_cho', who: 'm1', note: 'Chợ', created_at: '2026-10-05T01:00:00Z', deleted_at: null }, { id: 'e2', day: '2026-10-05', amount: 5, category: 'khac', who: null, note: '', created_at: '2026-10-05T01:00:00Z', deleted_at: '2026-10-06T01:00:00Z' }];
  const r = toFinRecords('f1', rows, new Map([['m1', { user_id: 'u1' }]]));
  assert.equal(r[0].schema, '9family.shared-expense/1'); assert.equal(r[0].externalId, 'f1:e1'); assert.equal(r[0].amount, 350000); assert.equal(r[0].payerUserId, 'u1'); assert.equal(r[0].currency, 'VND');
  assert.equal(r[1].deleted, true); assert.equal(r[1].payerUserId, null);
  assert.deepEqual(toFinRecords('f1', rows, new Map()), toFinRecords('f1', rows, new Map()));
});

test('không rò thông tin tiền qua nhật ký máy chủ', async () => {
  const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
  try {
    const { fam, kid, M } = await setup();
    await ok(fam.owner.post(`${M}/expenses`, { amount: 123456, note: 'GhiChúTiềnBíMật' }));
    await ok(fam.owner.post(`${M}/dues`, { title: 'KhoảnBíMật', amount: 654321, dueDate: '2026-10-06', childId: kid.id }));
    await scheduler.tick(at('2026-10-05', '08:05'));
    await fam.owner.post(`${M}/expenses`, { amount: 'GhiChúTiềnBíMật' });
  } finally { Object.assign(console, orig); clock.set(null); }
  assert.ok(!logs.join('\n').includes('BíMật') && !/123456|654321/.test(logs.join('\n')), 'nhật ký lộ dữ liệu');
});

test('migration 030 không phá bảng cũ: các bảng và cột cũ còn nguyên', async () => {
  const cols = await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('events','children','members','push_subs')");
  for (const [t, c] of [['events', 'child_ids'], ['events', 'source'], ['children', 'name'], ['members', 'role'], ['push_subs', 'types'], ['push_subs', 'hide']]) assert.ok(cols.some((x) => x.table_name === t && x.column_name === c), `${t}.${c}`);
  const sql = fs.readFileSync(new URL('../db/030_health_money.sql', import.meta.url), 'utf8');
  assert.ok(!/DROP\s|DELETE\s+FROM|TRUNCATE|RENAME/i.test(sql.replace(/--.*$/gm, '')), '030 chỉ cộng thêm');
});
