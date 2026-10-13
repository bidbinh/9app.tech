// Migration sang tài khoản 9app: dựng CSDL bằng lược đồ CŨ (001, 002) với dữ liệu mẫu BỊA, chạy migration mới, kiểm dữ liệu còn nguyên;
// rồi chạy quy trình nhập gia đình (export-to-9id + nhận mã + nối chủ) với 9id giả. Quy trình với 9id THẬT: test/integration/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { boot, shutdown, db, config, fake, ok, Client, newUser, idmod, clock } from './helper.js';
import { exportFamilies, buildPayload } from '../scripts/export-to-9id.js';

const baseUrl = process.env.DATABASE_URL;
const dbName = 'mig_' + crypto.randomBytes(4).toString('hex');
const migUrl = baseUrl.replace(/\/[^/]+$/, '/' + dbName);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');
const files = fs.readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
const OLD = files.filter((f) => /^00[12]_/.test(f)); // lược đồ đang chạy thật trên máy chủ trước khi chuyển sang 9id

const ID = {
  fam: '11111111-1111-4111-8111-111111111111', me: '22222222-2222-4222-8222-222222222221', bo: '22222222-2222-4222-8222-222222222222', ext: '22222222-2222-4222-8222-222222222223',
  k1: '33333333-3333-4333-8333-333333333331', k2: '33333333-3333-4333-8333-333333333332',
  ev1: '44444444-4444-4444-8444-444444444441', ev2: '44444444-4444-4444-8444-444444444442',
  ride: '55555555-5555-4555-8555-555555555551', rd: '66666666-6666-4666-8666-666666666661',
};
let raw; // pg.Client tới CSDL migration

async function adminQuery(sql) { const c = new pg.Client({ connectionString: baseUrl }); await c.connect(); try { return await c.query(sql); } finally { await c.end(); } }

before(async () => {
  await adminQuery(`CREATE DATABASE ${dbName}`);
  raw = new pg.Client({ connectionString: migUrl }); await raw.connect();
  await raw.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
  for (const f of OLD) { await raw.query(fs.readFileSync(path.join(dir, f), 'utf8')); await raw.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]); }
});
after(async () => {
  try { await raw.end(); } catch { /* */ }
  try { await shutdown(); } catch { /* */ }
  await adminQuery(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
});

const q = (sql, p) => raw.query(sql, p).then((r) => r.rows);
async function seedOld() {
  // dữ liệu mẫu BỊA, dựng theo lược đồ cũ: 1 gia đình, 2 người lớn + 1 người đón hộ, 2 con, sự kiện lặp có ngoại lệ, ca đưa đón, việc, mua sắm, thông báo, đẩy
  await q("INSERT INTO families(id, name, created_by_hash, created_ip, settings, rev) VALUES($1,'Nhà Cây Sồi','h-bịa','10.0.0.1','{\"esc\":{\"t1\":40,\"t2\":25,\"t3\":12,\"t4\":6,\"after\":15}}',17)", [ID.fam]);
  await q("INSERT INTO members(id, family_id, name, relation, role, joined_at, ics_token, recovery_hash) VALUES($1,$2,'Mẹ Thử','me','chu',now(),'ics-chu-bia','rec-hash-bia')", [ID.me, ID.fam]);
  await q("INSERT INTO members(id, family_id, name, relation, role, joined_at, ics_token) VALUES($1,$2,'Bố Thử','bo','quan_ly',now(),'ics-bo-bia')", [ID.bo, ID.fam]);
  await q("INSERT INTO members(id, family_id, name, relation, role, external, phone, note, joined_at) VALUES($1,$2,'Cô Hàng Xóm','don_ho','thanh_vien',true,'0900000000','áo xanh',now())", [ID.ext, ID.fam]);
  await q("INSERT INTO sessions(token_hash, member_id, label) VALUES('hash-phien-me',$1,'Điện thoại Android'),('hash-phien-bo',$2,'iPhone/iPad')", [ID.me, ID.bo]);
  await q("INSERT INTO invites(family_id, member_id, kind, code_hash, expires_at, created_by) VALUES($1,$2,'moi','code-hash-bia', now() + interval '3 days', $3)", [ID.fam, ID.bo, ID.me]);
  await q("INSERT INTO children(id, family_id, name, birth_year, school, grade, color, note) VALUES($1,$3,'Bé Một',2017,'Trường Thử A','4B','xanh','Chờ ở cổng B'),($2,$3,'Bé Hai',2020,'Mầm non Thử','Lá','cam','')", [ID.k1, ID.k2, ID.fam]);
  await q("INSERT INTO events(id, family_id, title, kind, start_date, start_time, end_time, rec_type, rec_days, notify_offsets, child_ids, member_ids, created_by) VALUES($1,$2,'Học bơi','nang_khieu','2026-09-01','15:30','16:30','weekly','{2,4}','{30}',$3,$4,$5)", [ID.ev1, ID.fam, [ID.k1], [ID.me], ID.me]);
  await q("INSERT INTO events(id, family_id, title, kind, start_date, all_day, rec_type, lunar_month, lunar_day, created_by) VALUES($1,$2,'Giỗ cụ','ngay_quan_trong','2026-01-01',true,'yearly_lunar',8,15,$3)", [ID.ev2, ID.fam, ID.me]);
  for (let i = 0; i < 6; i++) await q("INSERT INTO events(family_id, title, kind, start_date, start_time, created_by) VALUES($1,$2,'khac',$3,'09:00',$4)", [ID.fam, 'Việc lẻ ' + i, '2026-10-' + String(10 + i), ID.bo]);
  await q("INSERT INTO event_exceptions(event_id, day, action) VALUES($1,'2026-10-08','skip')", [ID.ev1]);
  await q("INSERT INTO event_exceptions(event_id, day, action, title, start_time) VALUES($1,'2026-10-13','edit','Học bơi (dời)','16:00')", [ID.ev1]);
  await q("INSERT INTO event_fires(event_id, day, offset_min) VALUES($1,'2026-10-06',30)", [ID.ev1]);
  await q("INSERT INTO rides(id, family_id, child_id, dir, weekday, at_time, place, p0, p1) VALUES($1,$2,$3,'don',1,'16:30','Cổng B',$4,$5)", [ID.ride, ID.fam, ID.k1, ID.ext, ID.bo]);
  await q("INSERT INTO ride_days(id, family_id, ride_id, child_id, dir, day, at_time, at_ts, place, p0, p1, state, claimed_by, claimed_at) VALUES($1,$2,$3,$4,'don','2026-10-05','16:30','2026-10-05T09:30:00Z','Cổng B',$5,$6,'da_nhan',$6,now())", [ID.rd, ID.fam, ID.ride, ID.k1, ID.ext, ID.bo]);
  await q("INSERT INTO ride_steps(ride_day_id, step) VALUES($1,1),($1,2)", [ID.rd]);
  await q("INSERT INTO tasks(family_id, title, assignee_id, due_date, created_by) VALUES($1,'Đóng học phí',$2,'2026-10-12',$3)", [ID.fam, ID.bo, ID.me]);
  await q("INSERT INTO shopping(family_id, text, added_by) VALUES($1,'Sữa tươi',$2),($1,'Trứng gà',$2)", [ID.fam, ID.me]);
  await q("INSERT INTO notifications(family_id, member_id, type, title, body, link, dedupe_key) VALUES($1,$2,'ride','Sắp tới giờ đón','Còn 30 phút','#/x','dd-1'),($1,$2,'task','Việc mới','','#/t',NULL)", [ID.fam, ID.bo]);
  await q("INSERT INTO push_subs(member_id, sid, endpoint, p256dh, auth) VALUES($1,'hash-phien-me','https://fcm.googleapis.com/fcm/send/bia','pk-bia-0123456789012345','au-bia-0123456')", [ID.me]);
  await q("INSERT INTO push_outbox(sub_id, payload) SELECT id, '{\"title\":\"x\"}'::jsonb FROM push_subs");
  await q("INSERT INTO timetables(child_id, family_id, periods, cells, start_date) VALUES($1,$2,'[]','[]','2026-09-01')", [ID.k1, ID.fam]);
  await q("INSERT INTO idem(scope, key, status, body) VALUES('hash-phien-me','k|POST /x',200,'{\"ok\":true}')");
  await q("INSERT INTO ai_usage(family_id, day, n) VALUES($1,'2026-10-01',3)", [ID.fam]);
}
const TABLES = ['families', 'members', 'sessions', 'invites', 'children', 'events', 'event_exceptions', 'event_fires', 'rides', 'ride_days', 'ride_steps', 'tasks', 'shopping', 'notifications', 'push_subs', 'push_outbox', 'timetables', 'idem', 'ai_usage'];
const counts = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await q(`SELECT count(*)::int n FROM ${t}`))[0].n])));
const dump = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await q(`SELECT * FROM ${t}`)])));
// so dữ liệu cũ với dữ liệu sau migration theo đúng các cột cũ (cột mới được phép thêm), không phụ thuộc thứ tự dòng.
// Mảng chỉ được phép lớn thêm (migration của tính năng khác có thể thêm loại thông báo vào push_subs.types).
function sameOldData(before, after) {
  for (const t of TABLES) {
    const cols = Object.keys(before[t][0] || {});
    const key = (r) => JSON.stringify([r[cols[0]], t === 'ride_steps' || t === 'event_exceptions' || t === 'event_fires' || t === 'ai_usage' || t === 'idem' ? r[cols[1]] : null]);
    const byKey = new Map(after[t].map((r) => [key(r), r]));
    assert.equal(after[t].length, before[t].length, 'số dòng ' + t);
    for (const r of before[t]) {
      const x = byKey.get(key(r));
      assert.ok(x, `${t}: mất dòng ${key(r)}`);
      for (const c of cols) {
        if (Array.isArray(r[c]) && Array.isArray(x[c])) assert.ok(r[c].every((v) => x[c].includes(v)), `${t}.${c} mất phần tử`);
        else assert.deepEqual(x[c], r[c], `${t}.${c}`);
      }
    }
  }
}

test('migration 010: cộng thêm, giữ nguyên dữ liệu cũ, chạy lại được nhiều lần', async () => {
  await seedOld();
  const before = await counts();
  assert.deepEqual([before.families, before.members, before.children], [1, 3, 2]);
  assert.ok(before.events >= 8, '~8 sự kiện');
  // cột mới chưa có trước migration
  assert.equal((await q("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='members' AND column_name='user_id'"))[0].n, 0);
  const dumpBefore = await dump();

  config.databaseUrl = migUrl; await db.close();
  await db.migrate();
  const applied = (await q('SELECT name FROM schema_migrations ORDER BY name')).map((r) => r.name);
  assert.ok(applied.includes('010_nine_id.sql'));
  assert.deepEqual(await counts(), before, 'số dòng mọi bảng không đổi');

  // toàn bộ dữ liệu cũ y nguyên (so từng cột cũ; cột mới được thêm)
  sameOldData(dumpBefore, await dump());
  // cột mới: rỗng, không làm hỏng truy vấn cũ
  const m = await q('SELECT * FROM members ORDER BY created_at, seq');
  assert.ok(m.every((x) => x.user_id === null));
  assert.equal((await q('SELECT count(*)::int n FROM children WHERE archived_at IS NULL AND linked_user_id IS NULL'))[0].n, 2);
  // truy vấn cũ: lịch, đưa đón, thông báo, đẩy
  assert.equal((await q('SELECT count(*)::int n FROM ride_days rd JOIN children c ON c.id=rd.child_id JOIN members m ON m.id=rd.claimed_by WHERE rd.day=$1', ['2026-10-05']))[0].n, 1);
  assert.equal((await q("SELECT count(*)::int n FROM notifications WHERE member_id=$1 AND read_at IS NULL", [ID.bo]))[0].n, 2);
  assert.equal((await q("SELECT count(*)::int n FROM push_subs s JOIN push_outbox o ON o.sub_id=s.id WHERE s.member_id=$1", [ID.me]))[0].n, 1);
  assert.equal((await q("SELECT count(*)::int n FROM events e JOIN event_exceptions x ON x.event_id=e.id WHERE e.id=$1", [ID.ev1]))[0].n, 2);
  // truy vấn mới: vai trò 'con', chỉ mục "mỗi tài khoản một thành viên", chỉ mục "một chủ" vẫn còn
  await q("INSERT INTO members(family_id, name, role, user_id, joined_at) VALUES($1,'Tài khoản con','con','99999999-9999-4999-8999-999999999999',now())", [ID.fam]);
  await assert.rejects(q("INSERT INTO members(family_id, name, role, user_id, joined_at) VALUES($1,'Trùng','thanh_vien','99999999-9999-4999-8999-999999999999',now())", [ID.fam]), /duplicate key/);
  await assert.rejects(q("INSERT INTO members(family_id, name, role, joined_at) VALUES($1,'Chủ thứ hai','chu',now())", [ID.fam]), /duplicate key/);
  await assert.rejects(q("INSERT INTO members(family_id, name, role) VALUES($1,'Sai vai','ông vua')", [ID.fam]), /violates check/);
  await q("DELETE FROM members WHERE role='con'");

  // chạy lại chính tệp SQL hai lần nữa: không lỗi, không đổi gì (idempotent)
  const sql = fs.readFileSync(path.join(dir, '010_nine_id.sql'), 'utf8');
  await raw.query(sql); await raw.query(sql);
  assert.deepEqual(await counts(), before);
  await db.migrate(); // cũng không làm lại
  assert.equal((await q("SELECT count(*)::int n FROM schema_migrations WHERE name='010_nine_id.sql'"))[0].n, 1);
});

test('nhập gia đình thật: export-to-9id (không gửi thông tin nhạy cảm), nhận mã, nối chủ, chế độ chỉ-đọc trước khi nối', async () => {
  await boot({ keepDb: true, legacy: true });
  const id = fake;
  // trước khi xuất: người dùng cũ (chỉ có phiên ẩn danh fsid) xem được nhưng KHÔNG ghi được
  const tokenMe = 'A'.repeat(43);
  await q("UPDATE sessions SET token_hash=$1 WHERE token_hash='hash-phien-me'", [crypto.createHash('sha256').update(tokenMe).digest('hex')]);
  const old = new Client(); old.extraCookie = 'fsid=' + tokenMe;
  const me0 = await ok(old.get('/api/me'));
  assert.equal(me0.legacy, true); assert.equal(me0.families[0].id, ID.fam);
  const core0 = await ok(old.get(`/api/families/${ID.fam}`));
  assert.equal(core0.family.name, 'Nhà Cây Sồi'); assert.equal(core0.children.length, 2);
  assert.equal((await old.post(`/api/families/${ID.fam}/tasks`, { title: 'Không ghi được' })).status, 423);
  assert.equal((await old.post(`/api/families/${ID.fam}/settings`, { esc: { t1: 30, t2: 20, t3: 10, t4: 5, after: 10 } })).status, 423);
  assert.equal((await ok(old.get(`/api/families/${ID.fam}/today`))).events.length >= 0, true);
  assert.equal((await new Client().get(`/api/families/${ID.fam}`)).status, 401, 'không phiên: 401');

  // chạy lệnh xuất (9id giả)
  const lines = [];
  const dry = await exportFamilies({ dryRun: true, client: id.client, out: (l) => lines.push(l) });
  assert.equal(dry[0].status, 'se_xuat'); assert.equal(id.client.imports.length, 0);
  const res = await exportFamilies({ client: id.client, out: (l) => lines.push(l) });
  assert.equal(res[0].status, 'da_xuat_moi'); assert.match(res[0].claimCode, /^[A-Z0-9]{5}-/);
  const sent = id.client.imports[0].payload;
  assert.equal(sent.family.id, ID.fam); assert.equal(sent.family.name, 'Nhà Cây Sồi');
  assert.deepEqual(sent.children.map((k) => Object.keys(k).sort()), [['birthYear', 'id', 'name'], ['birthYear', 'id', 'name']]);
  assert.deepEqual(sent.children.map((k) => k.id).sort(), [ID.k1, ID.k2]);
  const blob = JSON.stringify(sent);
  for (const secret of ['Cổng B', 'Trường Thử', 'Mẹ Thử', 'Bố Thử', '0900000000', 'ics-', 'rec-hash', 'hash-phien', 'code-hash', 'áo xanh']) assert.ok(!blob.includes(secret), 'không gửi ' + secret);
  assert.ok(lines.some((l) => l.includes(res[0].claimCode)), 'mã in ra màn hình');
  assert.equal((await q('SELECT count(*)::int n FROM id_import WHERE family_id=$1', [ID.fam]))[0].n, 1);
  assert.ok(!JSON.stringify(await q('SELECT * FROM id_import')).includes(res[0].claimCode), 'mã không nằm trong CSDL');
  // chạy lại: bỏ qua; --reissue cấp mã mới
  const again = await exportFamilies({ client: id.client, out: () => {} });
  assert.equal(again[0].status, 'da_xuat');
  assert.equal(buildPayload({ id: 'x', name: 'N'.repeat(100) }, [{ id: 'k', name: 'T'.repeat(80), birth_year: 1800 }]).children[0].birthYear, null);

  // trong 9id: gia đình đã nhập, CHƯA có chủ, nên chưa ai thấy; chủ đăng ký tài khoản 9app rồi nhận gia đình (mô phỏng nhập mã)
  const owner = newUser('Mẹ Mới Đăng Ký');
  assert.equal((await owner.client.get(`/api/families/${ID.fam}`)).status, 404, 'chưa nhận: người lạ không thấy');
  id.addMember(ID.fam, owner.userId, 'chu');
  // mở app lần đầu sau khi nhận: /api/me tự nối thành viên "chu" cũ với tài khoản mới
  const me1 = await ok(owner.client.get('/api/me'));
  assert.deepEqual(me1.families.map((f) => [f.id, f.role]), [[ID.fam, 'chu']]);
  assert.equal(me1.families[0].memberId, ID.me, 'giữ nguyên memberId cũ nên mọi tham chiếu còn đúng');
  const rowMe = (await q('SELECT * FROM members WHERE id=$1', [ID.me]))[0];
  assert.equal(rowMe.user_id, owner.userId); assert.equal(rowMe.recovery_hash, null); assert.equal(rowMe.name, 'Mẹ Mới Đăng Ký');
  assert.equal((await q('SELECT count(*)::int n FROM sessions WHERE member_id=$1', [ID.me]))[0].n, 0, 'phiên ẩn danh của chủ bị xóa');
  assert.equal((await q('SELECT user_id FROM push_subs WHERE member_id=$1', [ID.me]))[0].user_id, owner.userId, 'đăng ký đẩy của chủ gắn user_id');
  assert.equal((await q('SELECT count(*)::int n FROM members WHERE family_id=$1 AND role=$2 AND left_at IS NULL', [ID.fam, 'chu']))[0].n, 1);
  // dữ liệu nghiệp vụ vẫn nguyên và dùng được với tài khoản mới
  const core = await ok(owner.client.get(`/api/families/${ID.fam}`));
  assert.equal(core.me.id, ID.me); assert.equal(core.me.role, 'chu'); assert.equal(core.family.esc.t1, 40, 'thiết lập leo thang còn');
  assert.equal(core.children.length, 2); assert.equal(core.children.find((k) => k.id === ID.k1).school, 'Trường Thử A', 'phần mở rộng của con còn');
  assert.equal(core.children.find((k) => k.id === ID.k1).note, 'Chờ ở cổng B');
  const ridesNow = (await ok(owner.client.get(`/api/families/${ID.fam}/rides`))).rides;
  assert.equal(ridesNow.length, 1); assert.equal(ridesNow[0].p0, ID.ext); assert.equal(ridesNow[0].p1, ID.bo);
  const cal = await ok(owner.client.get(`/api/families/${ID.fam}/calendar?from=2026-10-01&to=2026-10-31`));
  assert.ok(cal.events.some((e) => e.title === 'Học bơi'), 'sự kiện lặp còn');
  assert.ok(!cal.events.some((e) => e.title === 'Học bơi' && e.day === '2026-10-08'), 'ngoại lệ bỏ qua còn hiệu lực');
  assert.ok(cal.events.some((e) => e.title === 'Học bơi (dời)' && e.day === '2026-10-13'), 'ngoại lệ sửa còn hiệu lực');
  assert.equal((await ok(owner.client.get(`/api/families/${ID.fam}/lists`))).shopping.length, 2);
  await ok(owner.client.post(`/api/families/${ID.fam}/tasks`, { title: 'Ghi được sau khi nối' }));
  // phiên ẩn danh cũ của gia đình đã có chủ: hết quyền xem (chế độ tương thích chỉ cho gia đình chưa nhận)
  assert.equal((await old.get(`/api/families/${ID.fam}`)).status, 401, 'phiên ẩn danh của chủ đã bị xóa khi nối tài khoản');
  // người lớn cũ chưa có tài khoản: còn là "thành viên chưa nối", mời ở 9id rồi gộp
  const placeholder = core.members.find((x) => x.id === ID.bo);
  assert.equal(placeholder.pending, true);
  const bo = newUser('Bố Mới Đăng Ký'); id.addMember(ID.fam, bo.userId, 'quan_ly');
  const newBo = (await ok(bo.client.get(`/api/families/${ID.fam}`))).me.id;
  await ok(owner.client.post(`/api/families/${ID.fam}/members/${ID.bo}/merge`, { into: newBo }));
  assert.equal((await q('SELECT p1 FROM rides WHERE id=$1', [ID.ride]))[0].p1, newBo);
  const nb2 = await q('SELECT title, dedupe_key FROM notifications WHERE member_id=$1 ORDER BY id', [newBo]);
  assert.ok(nb2.some((n) => n.title === 'Sắp tới giờ đón') && nb2.some((n) => n.title === 'Việc mới'), 'thông báo cũ của bố chuyển sang tài khoản mới: ' + JSON.stringify(nb2));
  assert.equal((await q('SELECT claimed_by FROM ride_days WHERE id=$1', [ID.rd]))[0].claimed_by, newBo);
  // đồng bộ lại nhiều lần không nhân đôi gì
  for (let i = 0; i < 3; i++) await ok(owner.client.get(`/api/families/${ID.fam}`));
  assert.equal((await q('SELECT count(*)::int n FROM members WHERE family_id=$1 AND left_at IS NULL', [ID.fam]))[0].n, 3);
  assert.equal((await q('SELECT count(*)::int n FROM children WHERE family_id=$1', [ID.fam]))[0].n, 2);
  void idmod; void clock;
});
