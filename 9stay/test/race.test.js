import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, boot, shutdown, seed, NOW } from './helper.js';
import { createBooking, moveBooking } from '../src/bookings.js';
import { blockNights } from '../src/inventory.js';

before(boot);
after(shutdown);
let w;
beforeEach(async () => { await db.resetForTests(); w = await seed(); });

const book = (over = {}) => db.tx((c) => createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-14', guestName: 'K', adults: 1, ...over }, { now: NOW }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));

// Đợi tới khi có một phiên thật sự đang chờ khóa dòng. Không dùng sleep cố định, nên không phụ thuộc tốc độ máy.
// Nếu khóa dòng không hoạt động (phiên kia không chờ) thì ném lỗi, test thất bại thay vì qua nhầm.
async function waitForLockWait(ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const [r] = await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'");
    if (r.n > 0) return;
    await sleep(15);
  }
  throw new Error('không thấy phiên nào chờ khóa: khóa dòng không có tác dụng?');
}
const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };

test('năm đặt đồng thời cùng căn cùng đêm: đúng một thành công, bốn còn lại unit_taken', async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => book({ guestName: 'K' + i })));
  const okRes = results.filter((r) => r.status === 'fulfilled');
  const bad = results.filter((r) => r.status === 'rejected');
  assert.equal(okRes.length, 1);
  assert.equal(bad.length, 4);
  for (const r of bad) assert.equal(r.reason.code, 'unit_taken');
  const n = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE unit_id=$1 AND active', [w.unitId]);
  assert.equal(n[0].n, 2);
});

test('đặt đồng thời gối nhau một phần (12→14 và 13→15): đúng một thành công', async () => {
  const results = await Promise.allSettled([book({ checkin: '2026-11-12', checkout: '2026-11-14' }), book({ checkin: '2026-11-13', checkout: '2026-11-15' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('đặt đồng thời hai căn khác nhau không cản nhau: cả hai thành công, mã đơn khác nhau', async () => {
  const [a, b] = await Promise.all([book({ unitId: w.unitId }), book({ unitId: w.unit2Id })]);
  assert.notEqual(a.code, b.code);
});

test('chủ chặn đêm đồng thời với đặt phòng: không bao giờ cả hai cùng thành công', async () => {
  for (let i = 0; i < 12; i++) {
    const night = `2026-11-${String(10 + i).padStart(2, '0')}`;
    const next = `2026-11-${String(11 + i).padStart(2, '0')}`;
    const [bk, bl] = await Promise.allSettled([
      book({ checkin: night, checkout: next }),
      db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: [night], kind: 'owner_use' })),
    ]);
    assert.ok(!(bk.status === 'fulfilled' && bl.status === 'fulfilled'), `vòng ${i}: đặt và chặn cùng thành công ở đêm ${night}`);
    assert.ok(bk.status === 'fulfilled' || bl.status === 'fulfilled', `vòng ${i}: cả hai cùng thất bại`);
    const [rel] = await db.query('SELECT kind FROM owner_releases WHERE unit_id=$1 AND night=$2', [w.unitId, night]);
    const [rn] = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE unit_id=$1 AND night=$2 AND active', [w.unitId, night]);
    if (bk.status === 'fulfilled') { assert.equal(rel.kind, 'open'); assert.equal(rn.n, 1); }
    else { assert.equal(rel.kind, 'owner_use'); assert.equal(rn.n, 0); }
  }
});

test('xác định: chủ đang giữ giao dịch chặn đêm thì đặt phòng phải CHỜ khóa rồi bị từ chối unit_blocked', async () => {
  const hold = gate(); const started = gate();
  const blocking = db.tx(async (c) => {
    await blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-12'], kind: 'owner_use' });
    started.open();
    await hold.p;
  });
  await started.p;
  const booking = settle(book({ checkin: '2026-11-12', checkout: '2026-11-13' }));
  try { await waitForLockWait(); } finally { hold.open(); }
  await blocking;
  const r = await booking;
  assert.equal(r.error && r.error.code, 'unit_blocked');
  const rn = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE unit_id=$1 AND active', [w.unitId]);
  assert.equal(rn[0].n, 0);
});

test('xác định: đặt phòng đang giữ giao dịch thì chủ chặn đêm phải CHỜ khóa rồi bị từ chối night_booked', async () => {
  const hold = gate(); const started = gate();
  const booking = db.tx(async (c) => {
    const r = await createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-13', guestName: 'K', adults: 1 }, { now: NOW });
    started.open();
    await hold.p;
    return r;
  });
  await started.p;
  const blocking = settle(db.tx((c) => blockNights(c, { orgId: w.orgId, unitId: w.unitId, nights: ['2026-11-12'], kind: 'owner_use' })));
  try { await waitForLockWait(); } finally { hold.open(); }
  await booking;
  const r = await blocking;
  assert.equal(r.error && r.error.code, 'night_booked');
  const [rel] = await db.query("SELECT kind FROM owner_releases WHERE unit_id=$1 AND night='2026-11-12'", [w.unitId]);
  assert.equal(rel.kind, 'open');
});

test('xác định: đặt mới đang giữ khóa đêm thì dời đơn phải CHỜ khóa, không deadlock; đặt mới thua unit_taken, dời thành công', async () => {
  const b = await book({ checkin: '2026-11-12', checkout: '2026-11-14' }); // giữ đêm 12, 13
  const hold = gate(); const started = gate();
  // Mô phỏng nửa đầu của createBooking: lấy khóa release 12, 13, rồi (sau cổng) chèn room_nights đêm 12
  const rival = settle(db.tx(async (c) => {
    await c.query('SELECT 1 FROM owner_releases WHERE unit_id=$1 AND night = ANY($2::date[]) ORDER BY night FOR UPDATE', [w.unitId, ['2026-11-12', '2026-11-13']]);
    started.open();
    await hold.p;
    const [bk] = await c.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'C1','K',1,'giu') RETURNING id", [w.orgId]);
    await c.query("INSERT INTO room_nights(org_id,booking_id,unit_id,night) VALUES($1,$2,$3,'2026-11-12')", [w.orgId, bk.id, w.unitId]);
  }));
  await started.p;
  const moving = settle(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-13', checkout: '2026-11-16' }, { now: NOW })));
  try { await waitForLockWait(); } finally { hold.open(); }
  const [rv, mv] = await Promise.all([rival, moving]);
  assert.equal(mv.error, undefined, 'dời đơn lỗi: ' + (mv.error && (mv.error.code + ' ' + mv.error.message)));
  assert.ok(mv.value.nights.includes('2026-11-15'));
  assert.ok(rv.error && rv.error.code === '23505', 'đặt mới phải thua vì đêm 12 vẫn đang thuộc đơn cũ khi nó chèn, lỗi thực: ' + (rv.error && rv.error.code));
  const dup = await db.query('SELECT unit_id, night FROM room_nights WHERE active GROUP BY unit_id, night HAVING count(*) > 1');
  assert.equal(dup.length, 0);
});

test('đổi chéo: hai đơn dời đồng thời vào đêm của nhau không deadlock, không tạo trùng; cả hai bị unit_taken (đổi chéo cần thao tác riêng)', async () => {
  const a = await book({ unitId: w.unitId, checkin: '2026-11-05', checkout: '2026-11-07' });
  const b = await book({ unitId: w.unit2Id, checkin: '2026-11-05', checkout: '2026-11-07' });
  const results = await Promise.all([
    settle(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: a.id, unitId: w.unit2Id, checkin: '2026-11-05', checkout: '2026-11-07' }, { now: NOW }))),
    settle(db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-05', checkout: '2026-11-07' }, { now: NOW }))),
  ]);
  for (const r of results) {
    assert.ok(r.error, 'không dời nào được thành công vì đêm đích còn thuộc đơn kia');
    assert.equal(r.error.code, 'unit_taken', 'lỗi bất ngờ: ' + r.error.code);
  }
  const dup = await db.query('SELECT unit_id, night, count(*)::int AS n FROM room_nights WHERE active GROUP BY unit_id, night HAVING count(*) > 1');
  assert.equal(dup.length, 0);
});

test('hàng rào cuối: dù bỏ qua khóa dòng, chèn trực tiếp hai dòng hoạt động cùng căn cùng đêm vẫn bị DB từ chối', async () => {
  const a = await book();
  const [bk2] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'X1','K',1,'giu') RETURNING id", [w.orgId]);
  await assert.rejects(
    db.query("INSERT INTO room_nights(org_id,booking_id,unit_id,night) VALUES($1,$2,$3,'2026-11-12')", [w.orgId, bk2.id, w.unitId]),
    (e) => e.code === '23505',
  );
  assert.ok(a.id);
});
