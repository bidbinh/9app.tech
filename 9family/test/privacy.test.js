// Quyền riêng tư: nhật ký máy chủ không chứa tên con, nội dung sự kiện, ghi chú; không lưu ảnh.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, makeFamily, addChild, ok, clock, scheduler, at, Client } from './helper.js';

before(async () => { await boot(); });
after(shutdown);

test('nhật ký (console) không chứa tên con, nội dung sự kiện, ghi chú, ngay cả khi có lỗi', async () => {
  const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
  try {
    clock.set(at('2026-10-05', '06:00'));
    const fam = await makeFamily(['MẹBíMật', 'BốBíMật']);
    const kid = await addChild(fam, 'ConBíMật', { note: 'GhiChúYTếBíMật' });
    await ok(fam.owner.post(`${fam.F}/events`, { title: 'SựKiệnBíMật', startDate: '2026-10-05', start: '07:00', note: 'NộiDungBíMật', notifyOffsets: [0], location: 'ĐịaĐiểmBíMật' }));
    await ok(fam.owner.post(`${fam.F}/rides`, { childId: kid.id, dir: 'don', weekdays: [1], time: '07:10', p0: fam.ids['MẹBíMật'] }));
    await scheduler.tick(at('2026-10-05', '07:00'));
    await scheduler.tick(at('2026-10-05', '07:20'));
    // các lỗi người dùng và lỗi máy chủ
    await fam.owner.post(`${fam.F}/events`, { title: 'SựKiệnBíMật', startDate: 'sai' });
    await fam.owner.post(`${fam.F}/children`, { name: 'ConBíMật' });
    await new Client().get(`${fam.F}`);
    await fam.owner.req('POST', `${fam.F}/events`, undefined, { headers: { 'content-type': 'application/json' } });
    const r = await fetch(fam.owner.constructor === Client ? (await import('./helper.js')).base + `${fam.F}/events` : '', { method: 'POST', headers: { 'x-requested-with': '9family', cookie: fam.owner.cookie, 'content-type': 'application/json' }, body: '{"title": "SựKiệnBíMật' });
    assert.equal(r.status, 400);
  } finally { Object.assign(console, orig); clock.set(null); }
  const text = logs.join('\n');
  for (const secret of ['BíMật']) assert.ok(!text.includes(secret), 'nhật ký lộ dữ liệu: ' + text.slice(0, 300));
});
