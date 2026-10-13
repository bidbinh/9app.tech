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
      db.tx((c) => blockNights(c, { unitId: w.unitId, nights: [night], kind: 'owner_use' })),
    ]);
    assert.ok(!(bk.status === 'fulfilled' && bl.status === 'fulfilled'), `vòng ${i}: đặt và chặn cùng thành công ở đêm ${night}`);
    assert.ok(bk.status === 'fulfilled' || bl.status === 'fulfilled', `vòng ${i}: cả hai cùng thất bại`);
    const [rel] = await db.query('SELECT kind FROM owner_releases WHERE unit_id=$1 AND night=$2', [w.unitId, night]);
    const [rn] = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE unit_id=$1 AND night=$2 AND active', [w.unitId, night]);
    if (bk.status === 'fulfilled') { assert.equal(rel.kind, 'open'); assert.equal(rn.n, 1); }
    else { assert.equal(rel.kind, 'owner_use'); assert.equal(rn.n, 0); }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('xác định: chủ đang giữ giao dịch chặn đêm thì đặt phòng phải đợi rồi bị từ chối unit_blocked', async () => {
  const blocking = db.tx(async (c) => {
    await blockNights(c, { unitId: w.unitId, nights: ['2026-11-12'], kind: 'owner_use' });
    await sleep(500); // giữ khóa dòng, chưa commit
  });
  await sleep(150);
  const booking = book({ checkin: '2026-11-12', checkout: '2026-11-13' });
  await blocking;
  await assert.rejects(booking, (e) => e.code === 'unit_blocked');
  const rn = await db.query('SELECT count(*)::int AS n FROM room_nights WHERE unit_id=$1 AND active', [w.unitId]);
  assert.equal(rn[0].n, 0);
});

test('xác định: đặt phòng đang giữ giao dịch thì chủ chặn đêm phải đợi rồi bị từ chối night_booked', async () => {
  const booking = db.tx(async (c) => {
    const r = await createBooking(c, { orgId: w.orgId, unitId: w.unitId, checkin: '2026-11-12', checkout: '2026-11-13', guestName: 'K', adults: 1 }, { now: NOW });
    await sleep(500); // giữ khóa dòng, chưa commit
    return r;
  });
  await sleep(150);
  const blocking = db.tx((c) => blockNights(c, { unitId: w.unitId, nights: ['2026-11-12'], kind: 'owner_use' }));
  await booking;
  await assert.rejects(blocking, (e) => e.code === 'night_booked');
  const [rel] = await db.query("SELECT kind FROM owner_releases WHERE unit_id=$1 AND night='2026-11-12'", [w.unitId]);
  assert.equal(rel.kind, 'open');
});

test('đổi chéo: hai đơn dời đồng thời vào đêm của nhau không bị kẹt (deadlock) và không tạo trùng', async () => {
  const a = await book({ unitId: w.unitId, checkin: '2026-11-05', checkout: '2026-11-07' });
  const b = await book({ unitId: w.unit2Id, checkin: '2026-11-05', checkout: '2026-11-07' });
  const results = await Promise.allSettled([
    db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: a.id, unitId: w.unit2Id, checkin: '2026-11-05', checkout: '2026-11-07' }, { now: NOW })),
    db.tx((c) => moveBooking(c, { orgId: w.orgId, bookingId: b.id, unitId: w.unitId, checkin: '2026-11-05', checkout: '2026-11-07' }, { now: NOW })),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') assert.ok(['unit_taken', '40P01'].includes(r.reason.code), 'lỗi bất ngờ: ' + r.reason.code);
  }
  const dup = await db.query('SELECT unit_id, night, count(*)::int AS n FROM room_nights WHERE active GROUP BY unit_id, night HAVING count(*) > 1');
  assert.equal(dup.length, 0);
});

test('hàng rào cuối: dù bỏ qua khóa dòng, chèn trực tiếp hai dòng hoạt động cùng căn cùng đêm vẫn bị DB từ chối', async () => {
  const a = await book();
  const [bk2] = await db.query("INSERT INTO bookings(org_id,code,guest_name,adults,status) VALUES($1,'X1','K',1,'giu') RETURNING id", [w.orgId]);
  await assert.rejects(
    db.query("INSERT INTO room_nights(booking_id,unit_id,night) VALUES($1,$2,'2026-11-12')", [bk2.id, w.unitId]),
    (e) => e.code === '23505',
  );
  assert.ok(a.id);
});
