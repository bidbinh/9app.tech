// Dựng máy chủ cục bộ (PostgreSQL nhúng, cổng ngẫu nhiên, đồng hồ giả) và gieo dữ liệu MẪU BỊA để chụp ảnh giao diện.
// Không bao giờ đụng tới máy chủ thật. Dùng cho scripts/ux-shots.js.
// Tài khoản/gia đình nằm ở 9id: ở đây dùng 9id GIẢ trong bộ nhớ (test/fake-id.js); phiên là cookie nine_sid. Các lệnh gọi tới /id/api (thêm con, mời...) KHÔNG chạy trong chế độ này
// (không có 9id thật): gieo dữ liệu trực tiếp vào 9id giả. Muốn chụp luồng đăng nhập/mời thật dùng scripts/e2e-id.js.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';
import { createFakeId } from '../test/fake-id.js';

export const TODAY = '2026-10-05'; // thứ hai

export async function boot({ now = '14:05', day = TODAY, seed = true } = {}) {
  const pg = await startEmbedded({ database: 'family_ux' });
  process.env.DATABASE_URL = pg.url;
  process.env.RATE_LIMIT_PER_MIN = '1000000'; process.env.ROUTE_LIMIT_FACTOR = '1000'; process.env.SESSION_LIMIT_PER_MIN = '1000000';
  const { start } = await import('../src/server.js');
  const { config } = await import('../src/config.js');
  const idmod = await import('../src/id.js');
  const fake = createFakeId();
  idmod.setIdClient(fake.client);
  config.idCacheMs = 1500;
  const { clock } = await import('../src/clock.js');
  const vn = await import('../src/vn.js');
  const db = await import('../src/db.js');
  config.port = 0;
  const app = await start({ scheduler: false });
  const port = app.server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const base = `${origin}${config.basePath}/`;
  clock.set(vn.atMs(day, now));

  const mk = (label, displayName = label) => {
    const u = fake.signup(displayName);
    const jar = { token: u.token, userId: u.userId };
    const call = async (method, p, body) => {
      const r = await fetch(new URL(p, base), { method, headers: { 'X-Requested-With': '9family', 'Content-Type': 'application/json', cookie: 'nine_sid=' + jar.token }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`${label} ${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
      return j;
    };
    return { jar, call, label };
  };
  const out = { origin, base, app, clock, vn, db, config, mk, day, fake, async close() { try { await app.close(); await db.close(); } catch { /* bỏ qua */ } await pg.stop(); } };
  if (seed) Object.assign(out, await seedFamily(out));
  return out;
}

// Gia đình hư cấu: 2 con (Mía, Sóc), bố mẹ và bà
export async function seedFamily(h) {
  const me = h.mk('me', 'Chị Lan Anh'); const bo = h.mk('bo', 'Anh Hùng'); const ba = h.mk('ba', 'Bà Tư');
  const fid = h.fake.createFamily(me.jar.userId, 'Nhà Cây Sồi');
  const F = (p) => `api/families/${fid}${p || ''}`;
  await me.call('GET', F('')); // 9family đọc gia đình từ 9id
  await me.call('POST', F(`/members/${(await me.call('GET', F(''))).me.id}`), { relation: 'me' });
  const addKid = async (name, birthYear, ext) => {
    const k = h.fake.addChild(fid, { name, birthYear });
    await me.call('POST', F('/resync'));
    return (await me.call('POST', F(`/children/${k.id}`), ext)).child;
  };
  const mia = await addKid('Mía', 2017, { school: 'Tiểu học Cầu Vồng', grade: '4B', color: 'hong', note: 'Dị ứng tôm. Chờ ở cổng B.' });
  const soc = await addKid('Sóc', 2021, { school: 'Mầm non Ánh Dương', grade: 'Lá 2', color: 'xanh' });
  const invite = async (who, relation) => {
    h.fake.addMember(fid, who.jar.userId, 'thanh_vien');
    const m = (await who.call('GET', F(''))).me;
    await who.call('POST', F(`/members/${m.id}`), { relation });
    return m;
  };
  const mBo = await invite(bo, 'bo');
  const mBa = await invite(ba, 'ba');
  const coll = (await me.call('POST', F('/members'), { name: 'Cô Hoa hàng xóm', external: true, phone: '0900 000 123', note: 'Áo xanh, xe Vision' })).member;
  const fam = await me.call('GET', F(''));
  const meId = fam.me.id;

  const ev = (b) => me.call('POST', F('/events'), { notifyOffsets: [30], checklist: [], memberIds: [], childIds: [], location: '', note: '', allDay: false, recType: 'none', ...b });
  const d = h.day;
  const add = (n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  await ev({ title: 'Toán tư duy', kind: 'hoc_them', childIds: [mia.id], memberIds: [meId], startDate: add(5), start: '09:30', end: '11:30', recType: 'weekly', recDays: [6], location: 'Trung tâm Sao Mai', checklist: ['Sách bài tập', 'Bút chì'] });
  await ev({ title: 'Tiếng Anh online', kind: 'hoc_them', childIds: [soc.id], startDate: add(1), start: '18:00', end: '18:45', recType: 'weekly', recDays: [2, 4], location: 'Ở nhà' });
  await ev({ title: 'Piano', kind: 'nang_khieu', childIds: [mia.id], memberIds: [mBo.id], startDate: add(2), start: '17:00', end: '17:45', recType: 'weekly', recDays: [3], location: 'Nhạc viện Hoa Mai' });
  await ev({ title: 'Bóng rổ', kind: 'nang_khieu', childIds: [soc.id, mia.id], startDate: add(6), start: '08:00', end: '09:30', recType: 'weekly', recDays: [7], location: 'Sân Thể Công' });
  await ev({ title: 'Khám răng', kind: 'kham', childIds: [mia.id], memberIds: [meId], startDate: add(3), start: '14:00', location: 'Nha khoa Nụ Cười' });
  await ev({ title: 'Họp phụ huynh', kind: 'hop_phu_huynh', childIds: [mia.id], memberIds: [meId, mBo.id], startDate: add(4), start: '19:30', end: '20:30', location: 'Trường Cầu Vồng, phòng 4B' });
  await ev({ title: 'Học bơi', kind: 'nang_khieu', childIds: [soc.id], memberIds: [mBa.id], startDate: d, start: '15:30', end: '16:15', recType: 'weekly', recDays: [1, 5], location: 'Bể bơi Thanh Xuân' });
  await ev({ title: 'Sinh nhật Mía', kind: 'ngay_quan_trong', childIds: [mia.id], startDate: '2017-10-09', allDay: true, recType: 'yearly', notifyOffsets: [1440] });
  await ev({ title: 'Giỗ cụ nội', kind: 'ngay_quan_trong', startDate: add(0), allDay: true, recType: 'yearly_lunar', lunarDay: 25, lunarMonth: 8, notifyOffsets: [1440] });

  const ride = (b) => me.call('POST', F('/rides'), { place: '', p0: null, p1: null, p2: null, ...b });
  const wk = [1, 2, 3, 4, 5];
  await ride({ childId: mia.id, dir: 'dua', weekdays: wk, time: '07:00', place: 'Cổng trường', p0: mBo.id, p1: meId });
  await ride({ childId: mia.id, dir: 'don', weekdays: wk, time: '16:30', place: 'Cổng B', p0: meId, p1: mBo.id, p2: mBa.id });
  await ride({ childId: soc.id, dir: 'dua', weekdays: wk, time: '07:30', place: 'Cổng mầm non', p0: meId });
  await ride({ childId: soc.id, dir: 'don', weekdays: wk, time: '11:00', place: 'Cổng mầm non', p0: coll.id });
  await ride({ childId: soc.id, dir: 'don', weekdays: [6], time: '12:00', place: 'Lớp năng khiếu' });

  const task = (title, extra = {}) => me.call('POST', F('/tasks'), { title, ...extra });
  await task('Đóng tiền học phí tháng 10', { due: add(1), assigneeId: meId });
  await task('Mua quà sinh nhật cho Mía', { due: add(3) });
  await task('Ký sổ liên lạc của Sóc');
  const shop = (text) => me.call('POST', F('/shopping'), { text });
  await shop('Sữa tươi, trứng gà, bánh mì, cà chua, thịt bò, rau muống, nước giặt');

  // buổi sáng đã đi xong để màn Hôm nay trông thật: các ca trước giờ hiện tại đã có người báo xong
  const nowMs = h.clock.now();
  const board = async () => (await me.call('GET', F('/rides/board'))).rides;
  const doneAt = async (hhmm, time, who, body = {}) => {
    h.clock.set(h.vn.atMs(d, hhmm));
    const r = (await board()).find((x) => x.time === time && x.dir === (time === '11:00' || time === '16:30' ? 'don' : 'dua'));
    if (!r || nowMs < h.vn.atMs(d, time)) return;
    await who.call('POST', F('/ride-days/' + r.id + '/claim'), body);
    await who.call('POST', F('/ride-days/' + r.id + '/done'), body);
  };
  await doneAt('07:03', '07:00', bo);
  await doneAt('07:28', '07:30', me);
  await doneAt('11:05', '11:00', me, { forId: coll.id });
  h.clock.set(nowMs);

  return { fid, F, sessions: { me, bo, ba }, kids: { mia, soc }, members: { meId, mBo, mBa, coll } };
}

export async function launch() {
  const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
  const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const { default: puppeteer } = await import(PPT);
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'], defaultViewport: null });
}

export const here = path.dirname(fileURLToPath(import.meta.url));
