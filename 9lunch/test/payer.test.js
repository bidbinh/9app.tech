// Người ứng tiền thay đổi theo bữa, ngân hàng của từng người, đổi người nhận sau khi sang thu tiền,
// sổ nợ nhiều bữa/nhiều người ứng, bù trừ, đổi tên, rời nhóm, đồng thời và bất biến sau chuỗi thao tác ngẫu nhiên.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { boot, shutdown, makeTeam, mealToPayment, ok, db, Client, BANK2, bankFor } from './helper.js';
import { vietQrPayload } from '../src/transfer.js';
import { netBalances } from '../src/debts.js';

before(boot);
after(shutdown);

const meal = async (c, id) => (await ok(c.get(`/api/meals/${id}`))).meal;
const decodeQr = (buf) => {
  const png = PNG.sync.read(buf);
  const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return r && r.data;
};
const rows = (sql, p) => db.query(sql, p);

test('mỗi người có hồ sơ ngân hàng riêng; người ứng tiền chưa có tài khoản thì không sang thu tiền được', async () => {
  const t = await makeTeam(['Chủ', 'An', 'Bình'], { bankFor: [] });
  const [chu, an] = t.clients;
  const m = await ok(chu.post(`/api/teams/${t.teamId}/meals`, {}));
  await ok(chu.post(`/api/meals/${m.mealId}/proposals`, { name: 'Quán' }));
  await ok(chu.post(`/api/meals/${m.mealId}/status`, { to: 'dat_mon' }));
  await ok(an.post(`/api/meals/${m.mealId}/items`, { name: 'Cơm', price: 30000, qty: 1 }));
  assert.equal((await chu.post(`/api/meals/${m.mealId}/status`, { to: 'thanh_toan' })).json.error.code, 'no_payer');
  await ok(chu.post(`/api/meals/${m.mealId}/settings`, { payerId: t.ids['An'] }));
  const r = await chu.post(`/api/meals/${m.mealId}/status`, { to: 'thanh_toan' });
  assert.equal(r.status, 409); assert.equal(r.json.error.code, 'payer_no_bank'); assert.match(r.json.error.message, /An chưa lưu tài khoản/);
  assert.equal((await rows('SELECT count(*)::int n FROM charges WHERE meal_id IN (SELECT id FROM meals WHERE team_id=$1)', [t.teamId]))[0].n, 0);
  // chủ nhóm KHÔNG cần là người ứng tiền; An lưu ngân hàng của mình rồi mới sang được
  await ok(an.post(`/api/teams/${t.teamId}/me`, { bank: BANK2 }));
  const v = (await ok(chu.post(`/api/meals/${m.mealId}/status`, { to: 'thanh_toan' }))).meal;
  assert.equal(v.payer.name, 'An');
  assert.equal(v.charges.length, 1);
  assert.equal(v.charges[0].isSelf, true); assert.equal(v.charges[0].status, 'da_nhan');
  // bữa khác: payer khác nhau
  await ok(chu.post(`/api/meals/${m.mealId}/status`, { to: 'xong' }));
  const tv = await ok(chu.get(`/api/teams/${t.teamId}`));
  assert.equal(tv.me.bank, null); assert.equal(tv.members.find((x) => x.name === 'An').hasBank, true);
  // xóa tài khoản của mình
  await ok(an.post(`/api/teams/${t.teamId}/me`, { bank: { bin: '', account: '', holder: '' } }));
  assert.equal((await ok(an.get(`/api/teams/${t.teamId}`))).me.bank, null);
  assert.equal((await an.post(`/api/teams/${t.teamId}/me`, { bank: { bin: '970436', account: 'x', holder: 'A' } })).status, 400);
});

test('QR sinh ra giải mã được, đúng số tiền, đúng tài khoản người nhận và nội dung 9L<mã bữa><số thứ tự>', async () => {
  const t = await makeTeam(['Chủ', 'An', 'Bình'], { bankFor: ['Chủ', 'An'] });
  const id = await mealToPayment(t, { payer: 'An', orders: { Chủ: [['Cơm', 40000, 1]], An: [['Phở', 50000, 1]], Bình: [['Bún', 45500, 2]] }, fees: { ship: 15000 } });
  const v = await meal(t.by['Bình'], id);
  const mine = v.charges.find((c) => c.mine);
  const png = await t.by['Bình'].get('/' + mine.pay.qrUrl, { raw: true });
  assert.equal(png.status, 200);
  const data = decodeQr(png.buf);
  const code = (await rows('SELECT code FROM meals WHERE id=$1', [id]))[0].code;
  const seq = (await rows('SELECT seq FROM charges WHERE id=$1', [mine.id]))[0].seq;
  assert.equal(data, vietQrPayload({ bin: bankFor(1).bin, account: bankFor(1).account, amount: mine.amount, content: `9L${code}${String(seq).padStart(2, '0')}` }));
  assert.match(data, /5406\d{6}|5405\d{5}/);
  assert.ok(mine.amount > 0 && data.includes(String(mine.amount)));
  assert.ok(mine.pay.content.length <= 25 && /^[A-Z0-9]+$/.test(mine.pay.content));
  const svg = await t.by['Bình'].get('/' + mine.pay.qrSvgUrl, { raw: true });
  assert.match(svg.headers.get('content-type'), /image\/svg\+xml/); assert.match(svg.buf.toString(), /^<\?xml|^<svg/);
});

async function bigMeal() {
  const t = await makeTeam(['Chủ', 'An', 'Bình', 'Chi', 'Dũng'], { bankFor: ['Chủ', 'An', 'Bình', 'Chi'] });
  const orders = {}; for (const n of ['Chủ', 'An', 'Bình', 'Chi', 'Dũng']) orders[n] = [['Cơm', 40000, 1]];
  const id = await mealToPayment(t, { payer: 'Chủ', orders, fees: { ship: 10000 } });
  return { t, id };
}
const chargeOf = (v, name) => v.charges.find((c) => c.memberName === name);

test('đổi người ứng tiền sau khi sang thu tiền: khoản chưa trả đổi QR, khoản đã báo/đã nhận giữ người nhận cũ', async () => {
  const { t, id } = await bigMeal();
  const [chu, an, binh, chi, dung] = t.clients;
  let v = await meal(chu, id);
  const sum0 = v.charges.reduce((s, c) => s + c.amount, 0);
  await ok(an.post(`/api/charges/${chargeOf(v, 'An').id}/paid`)); // đã báo chuyển cho Chủ, chưa xác nhận
  await ok(binh.post(`/api/charges/${chargeOf(v, 'Bình').id}/paid`));
  await ok(chu.post(`/api/charges/${chargeOf(v, 'Bình').id}/received`)); // đã nhận
  const oldQr = chargeOf(await meal(chi, id), 'Chi').pay;
  assert.equal((await chi.get('/' + oldQr.qrUrl, { raw: true })).status, 200);

  // đổi sang Bình (đã có ngân hàng): chủ nhóm, chủ nhóm đổi giúp (thành viên thường không tự giành được)
  assert.equal((await dung.post(`/api/meals/${id}/settings`, { payerId: t.ids['Bình'] })).status, 403);
  assert.equal((await dung.post(`/api/meals/${id}/settings`, { payerId: t.ids['Chi'] })).status, 403, 'Dũng không phải người ứng, chủ nhóm hay người tạo nên không đặt người khác được');
  assert.equal((await dung.post(`/api/meals/${id}/settings`, { payerId: t.ids['Dũng'] })).status, 403, 'sau thu tiền thành viên thường không tự nhận ứng');
  v = (await ok(chu.post(`/api/meals/${id}/settings`, { payerId: t.ids['Bình'] }))).meal;
  assert.equal(v.payer.name, 'Bình');
  assert.equal(v.charges.length, 5, 'không nhân đôi hay mất khoản');
  assert.equal(v.charges.reduce((s, c) => s + c.amount, 0), sum0);
  const by = (n) => chargeOf(v, n);
  assert.equal(by('An').payeeName, 'Chủ'); assert.equal(by('An').status, 'da_chuyen'); // giữ người nhận cũ
  assert.equal(by('Bình').payeeName, 'Chủ'); assert.equal(by('Bình').status, 'da_nhan');
  assert.equal(by('Chủ').payeeName, 'Bình'); assert.equal(by('Chủ').status, 'chua_tra'); assert.equal(by('Chủ').isSelf, false); // Chủ nay nợ người ứng mới phần của mình
  for (const n of ['Chi', 'Dũng']) { assert.equal(by(n).payeeName, 'Bình'); assert.equal(by(n).status, 'chua_tra'); assert.equal(by(n).qrGen, 2); assert.equal(by(n).payeeChanged, true); }
  assert.equal(by('An').qrGen, 1);
  // QR cũ hết hiệu lực, QR mới trỏ tới Bình
  const gone = await chi.get('/' + oldQr.qrUrl, { raw: true });
  assert.equal(gone.status, 410); assert.equal(JSON.parse(gone.buf.toString()).error.code, 'qr_expired');
  const nv = chargeOf(await meal(chi, id), 'Chi');
  const data = decodeQr((await chi.get('/' + nv.pay.qrUrl, { raw: true })).buf);
  assert.ok(data.includes(bankFor(2).account) && !data.includes(bankFor(0).account));
  assert.equal(nv.pay.account, bankFor(2).account);
  // người nhận cũ (Chủ) vẫn xác nhận được khoản đã báo chuyển; người ứng mới (Bình) thì không
  assert.equal((await binh.post(`/api/charges/${by('An').id}/received`)).status, 403);
  assert.equal((await chu.post(`/api/charges/${by('An').id}/unseen`)).status, 200);
  assert.equal((await chu.post(`/api/charges/${by('An').id}/received`)).status, 200);
  // người ứng mới nhận tiền của Chi
  await ok(chi.post(`/api/charges/${by('Chi').id}/paid`));
  assert.equal((await chu.post(`/api/charges/${by('Chi').id}/received`)).status, 403);
  assert.equal((await binh.post(`/api/charges/${by('Chi').id}/received`)).status, 200);
  // đổi tiếp sang Chi: khoản của Chi chưa nhận lại (đã da_nhan, giữ), Chủ & Dũng chưa trả -> chuyển sang Chi
  v = (await ok(chu.post(`/api/meals/${id}/settings`, { payerId: t.ids['Chi'] }))).meal;
  assert.equal(chargeOf(v, 'Chủ').payeeName, 'Chi'); assert.equal(chargeOf(v, 'Dũng').payeeName, 'Chi');
  assert.equal(chargeOf(v, 'Chi').payeeName, 'Bình'); assert.equal(chargeOf(v, 'Chi').status, 'da_nhan');
  assert.equal(chargeOf(v, 'Chủ').qrGen, 3);
  assert.equal(v.charges.reduce((s, c) => s + c.amount, 0), sum0);
  // đổi sang người chưa có ngân hàng bị chặn, không đổi gì
  const nb = await chu.post(`/api/meals/${id}/settings`, { payerId: t.ids['Dũng'] });
  assert.equal(nb.status, 409); assert.equal(nb.json.error.code, 'payer_no_bank');
  assert.equal((await meal(chu, id)).payer.name, 'Chi');
  // sổ nợ: ai nợ ai theo từng khoản, tổng ròng nhóm bằng 0
  const d = await ok(chu.get(`/api/teams/${t.teamId}/debts`));
  assert.equal(d.balances.reduce((s, b) => s + b.net, 0), 0);
  const audit = await rows("SELECT action FROM charge_events WHERE meal_id=$1 AND action LIKE 'doi_nguoi_nhan%'", [id]);
  assert.ok(audit.length >= 5);
});

test('đổi người ứng tiền trước bước thu tiền thì đổi tự do; quay lại sửa chỉ khi chưa ai báo chuyển', async () => {
  const t = await makeTeam(['Chủ', 'An', 'Bình'], { bankFor: ['Chủ', 'An'] });
  const [chu, an, binh] = t.clients;
  const m = (await ok(binh.post(`/api/teams/${t.teamId}/meals`, {}))).mealId; // Bình tạo bữa, không phải chủ nhóm
  await ok(binh.post(`/api/meals/${m}/proposals`, { name: 'Q' }));
  await ok(binh.post(`/api/meals/${m}/status`, { to: 'dat_mon' }));
  await ok(an.post(`/api/meals/${m}/items`, { name: 'Cơm', price: 50000, qty: 1 }));
  await ok(binh.post(`/api/meals/${m}/items`, { name: 'Phở', price: 50000, qty: 1 }));
  for (const [who, target] of [[chu, 'An'], [an, 'An'], [an, 'Chủ'], [binh, 'Chủ']]) {
    assert.equal((await who.post(`/api/meals/${m}/settings`, { payerId: t.ids[target] })).status, 200);
  }
  await ok(chu.post(`/api/meals/${m}/settings`, { payerId: t.ids['An'] }));
  const v = (await ok(chu.post(`/api/meals/${m}/status`, { to: 'thanh_toan' }))).meal;
  const cb = chargeOf(v, 'Bình');
  await ok(binh.post(`/api/charges/${cb.id}/paid`));
  const blocked = await chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' });
  assert.equal(blocked.status, 409); assert.equal(blocked.json.error.code, 'has_payments');
  await ok(an.post(`/api/charges/${cb.id}/unseen`));
  const back = (await ok(chu.post(`/api/meals/${m}/status`, { to: 'dat_mon' }))).meal;
  assert.equal(back.status, 'dat_mon'); assert.equal((await rows('SELECT count(*)::int n FROM charges WHERE meal_id=$1', [m]))[0].n, 0);
  // chia lại với phí mới rồi sang thu tiền lần nữa
  await ok(chu.post(`/api/meals/${m}/settings`, { fees: { ship: 20000 } }));
  const again = (await ok(chu.post(`/api/meals/${m}/status`, { to: 'thanh_toan' }))).meal;
  assert.equal(again.charges.reduce((s, c) => s + c.amount, 0), 120000);
});

test('sổ nợ qua nhiều bữa, nhiều người ứng: bù trừ A,B,C; QR người nhận; đánh dấu khoản gốc đã thanh toán qua bù trừ', async () => {
  const t = await makeTeam(['A', 'B', 'C'], { bankFor: ['A', 'B', 'C'] });
  const [a, b, c] = t.clients;
  const eat = (payer, amounts) => mealToPayment(t, { payer, venue: 'Quán ' + payer + Math.random(), orders: { A: [['x', amounts[0], 1]], B: [['x', amounts[1], 1]], C: [['x', amounts[2], 1]] } });
  // đã có bữa active trong ngày? mỗi bữa đẩy tới thu tiền nên không chặn bữa sau
  const m1 = await eat('A', [10000, 50000, 30000]); // B nợ A 50, C nợ A 30
  const m2 = await eat('B', [20000, 10000, 40000]); // A nợ B 20, C nợ B 40
  const m3 = await eat('C', [10000, 25000, 10000]); // A nợ C 10, B nợ C 25
  let d = await ok(a.get(`/api/teams/${t.teamId}/debts`));
  assert.deepEqual(d.pairs.map((p) => [p.fromName, p.toName, p.amount]).sort(), [['B', 'A', 30000], ['C', 'A', 20000], ['C', 'B', 15000]]);
  assert.equal(d.balances.reduce((s, x) => s + x.net, 0), 0);
  assert.deepEqual(d.suggestions.map((s) => [s.fromName, s.toName, s.amount]), [['C', 'A', 35000], ['B', 'A', 15000]]);
  // tạo phiên bù trừ: hai người tạo cùng lúc chỉ ra một phiên
  const [n1, n2] = await Promise.all([a.post(`/api/teams/${t.teamId}/netting`), b.post(`/api/teams/${t.teamId}/netting`)]);
  assert.equal(n1.status, 200); assert.equal(n2.status, 200); assert.equal(n1.json.nettingId, n2.json.nettingId);
  assert.equal((await rows("SELECT count(*)::int n FROM nettings WHERE status='cho' AND team_id=$1", [t.teamId]))[0].n, 1);
  d = await ok(a.get(`/api/teams/${t.teamId}/debts`));
  assert.equal(d.netting.transfers.length, 2);
  const tc = d.netting.transfers.find((x) => x.fromName === 'C');
  const cView = (await ok(c.get(`/api/teams/${t.teamId}/debts`))).netting.transfers.find((x) => x.mine);
  const qr = decodeQr((await c.get('/' + cView.pay.qrUrl, { raw: true })).buf);
  assert.equal(qr, vietQrPayload({ bin: bankFor(0).bin, account: bankFor(0).account, amount: 35000, content: cView.pay.content }));
  assert.match(cView.pay.content, /^9N[A-Z0-9]{5}01$/);
  assert.equal((await b.get(`/api/transfers/${tc.id}/qr.png`)).status, 404, 'B không liên quan khoản C -> A');
  // khoản trong phiên bù trừ không bấm riêng lẻ được, không đổi người ứng được
  const cm1 = chargeOf(await meal(c, m1), 'C');
  assert.equal((await c.post(`/api/charges/${cm1.id}/paid`)).json.error.code, 'in_netting');
  assert.equal((await a.post(`/api/meals/${m3}/settings`, { payerId: t.ids['A'] })).json.error.code, 'in_netting');
  // thực hiện bù trừ
  const tb = d.netting.transfers.find((x) => x.fromName === 'B');
  assert.equal((await b.post(`/api/transfers/${tc.id}/paid`)).status, 403);
  await ok(c.post(`/api/transfers/${tc.id}/paid`)); await ok(c.post(`/api/transfers/${tc.id}/paid`));
  await ok(b.post(`/api/transfers/${tb.id}/paid`));
  assert.equal((await b.post(`/api/transfers/${tc.id}/received`)).status, 403);
  assert.equal((await a.post(`/api/nettings/${d.netting.id}/cancel`)).status, 409, 'đã có người báo chuyển thì không hủy được');
  const r1 = await ok(a.post(`/api/transfers/${tc.id}/received`));
  assert.equal(r1.done, false);
  const [r2, r3] = await Promise.all([a.post(`/api/transfers/${tb.id}/received`), a.post(`/api/transfers/${tb.id}/received`)]);
  assert.equal(r2.status, 200); assert.equal(r3.status, 200);
  assert.equal([r2.json, r3.json].filter((x) => x.done).length >= 1, true);
  d = await ok(a.get(`/api/teams/${t.teamId}/debts`));
  assert.equal(d.items.length, 0); assert.equal(d.netting, null);
  const settled = await rows("SELECT count(*)::int n FROM charges WHERE settled_by_netting AND status='da_nhan' AND meal_id IN (SELECT id FROM meals WHERE team_id=$1)", [t.teamId]);
  assert.equal(settled[0].n, 6);
  assert.equal((await rows("SELECT count(*)::int n FROM charge_events WHERE action='da_nhan_bu_tru' AND team_id=$1", [t.teamId]))[0].n, 6, 'có dấu vết kiểm toán, không xóa dữ liệu');
  assert.equal((await rows('SELECT count(*)::int n FROM charges WHERE meal_id IN (SELECT id FROM meals WHERE team_id=$1)', [t.teamId]))[0].n, 9);
  assert.equal((await a.post(`/api/charges/${chargeOf(await meal(a, m1), 'B').id}/unseen`)).json.error.code, 'settled_by_netting');
  assert.equal((await a.post(`/api/teams/${t.teamId}/netting`)).json.error.code, 'nothing_to_net');
});

test('bù trừ: hủy phiên khi chưa ai chuyển; người nhận chưa có ngân hàng thì báo rõ', async () => {
  const t = await makeTeam(['A', 'B', 'C'], { bankFor: ['A'] });
  const [a, b] = t.clients;
  await mealToPayment(t, { payer: 'A', orders: { A: [['x', 10000, 1]], B: [['x', 30000, 1]] } });
  const n = await ok(b.post(`/api/teams/${t.teamId}/netting`));
  assert.equal((await t.by['C'].post(`/api/nettings/${n.nettingId}/cancel`)).status, 403);
  await ok(b.post(`/api/nettings/${n.nettingId}/cancel`));
  assert.equal((await rows('SELECT count(*)::int n FROM charges WHERE netting_id IS NOT NULL AND meal_id IN (SELECT id FROM meals WHERE team_id=$1)', [t.teamId]))[0].n, 0);
  await ok(b.post(`/api/teams/${t.teamId}/me`, { bank: BANK2 }));
  await mealToPayment(t, { payer: 'B', orders: { A: [['x', 10000, 1]], B: [['x', 30000, 1]] }, venue: 'Quán thứ hai' });
  await ok(a.post(`/api/teams/${t.teamId}/me`, { bank: { bin: '', account: '', holder: '' } }));
  const bad = await b.post(`/api/teams/${t.teamId}/netting`);
  assert.equal(bad.status, 409); assert.equal(bad.json.error.code, 'payee_no_bank');
});

test('đổi tên hiển thị: sổ nợ và lịch sử dùng id nên không vỡ; nội dung chuyển khoản không dùng tên', async () => {
  const { t, id } = await bigMeal();
  const before = await meal(t.by['Chi'], id);
  const content = chargeOf(before, 'Chi').pay.content;
  assert.ok(!/CHI/i.test(content.replace(/^9L[A-Z0-9]{5}/, '')));
  await ok(t.by['Chi'].post(`/api/teams/${t.teamId}/me`, { name: 'Chi Mới' }));
  const after = await meal(t.by['An'], id);
  assert.equal(chargeOf(after, 'Chi Mới').id, chargeOf(before, 'Chi').id);
  assert.equal(chargeOf(await meal(t.by['Chi'], id), 'Chi Mới').pay.content, content);
  const d = await ok(t.by['An'].get(`/api/teams/${t.teamId}/debts`));
  assert.ok(d.items.some((x) => x.fromName === 'Chi Mới'));
  assert.equal((await t.by['An'].post(`/api/teams/${t.teamId}/me`, { name: ' chủ ' })).status, 409);
});

test('rời nhóm / bị xóa khi còn nợ hoặc được nợ: bị chặn; khi xong thì giữ lịch sử', async () => {
  const { t, id } = await bigMeal();
  const [chu, an, binh, chi, dung] = t.clients;
  const v = await meal(chu, id);
  let r = await dung.post(`/api/teams/${t.teamId}/leave`);
  assert.equal(r.status, 409); assert.equal(r.json.error.code, 'has_open_money');
  r = await chu.post(`/api/teams/${t.teamId}/members/${t.ids['Dũng']}/remove`);
  assert.equal(r.status, 409);
  r = await an.post(`/api/teams/${t.teamId}/members/${t.ids['Chủ']}/remove`);
  assert.equal(r.status, 403);
  for (const [n, cl] of [['An', an], ['Bình', binh], ['Chi', chi], ['Dũng', dung]]) {
    const cid = chargeOf(v, n).id;
    await ok(cl.post(`/api/charges/${cid}/paid`)); await ok(chu.post(`/api/charges/${cid}/received`));
  }
  await ok(dung.post(`/api/teams/${t.teamId}/leave`));
  const after = await meal(chu, id);
  assert.equal(chargeOf(after, 'Dũng (đã rời nhóm)').status, 'da_nhan', 'lịch sử còn nguyên, hiện là người đã rời');
  assert.equal(after.members.some((m) => m.name === 'Dũng'), false);
  assert.equal((await dung.get(`/api/meals/${id}`)).status, 404);
  // chủ nhóm ứng tiền đang còn người nợ -> không rời được ngay cả khi chuyển quyền: chuyển quyền rồi rời khi hết nợ
  await ok(chu.post(`/api/teams/${t.teamId}/members/${t.ids['An']}/make-owner`));
  assert.equal((await ok(an.get(`/api/teams/${t.teamId}`))).me.role, 'chu');
  await ok(chu.post(`/api/teams/${t.teamId}/leave`));
});

test('đồng thời: hai người cùng đổi người ứng tiền / cùng xác nhận: kết quả nhất quán, không nhân đôi', async () => {
  for (let round = 0; round < 5; round++) {
    const { t, id } = await bigMeal();
    const [chu, an, binh, chi] = t.clients;
    const before = await rows('SELECT count(*)::int n, SUM(amount)::bigint s FROM charges WHERE meal_id=$1', [id]);
    const res = await Promise.all([
      binh.post(`/api/meals/${id}/settings`, { payerId: t.ids['Bình'] }),
      chi.post(`/api/meals/${id}/settings`, { payerId: t.ids['Chi'] }),
      chu.post(`/api/meals/${id}/settings`, { payerId: t.ids['An'] }),
    ]);
    assert.ok(res.every((r) => r.status === 200 || r.status === 403 || r.status === 409));
    const v = await meal(chu, id);
    const after = await rows('SELECT count(*)::int n, SUM(amount)::bigint s FROM charges WHERE meal_id=$1', [id]);
    assert.deepEqual(after, before);
    for (const c of v.charges) {
      if (c.status === 'chua_tra') assert.equal(c.payeeId, v.payer.id, 'khoản chưa trả luôn nợ đúng người ứng hiện tại');
      assert.ok(!(c.memberId === c.payeeId && c.status !== 'da_nhan'));
    }
    // cùng lúc "đã nhận" và "chưa thấy" rồi "đã chuyển" lặp
    const target = v.charges.find((c) => !c.isSelf && c.status === 'chua_tra');
    const payerClient = t.clients[Object.values(t.ids).indexOf(v.payer.id)];
    const debtor = t.clients[Object.values(t.ids).indexOf(target.memberId)];
    await Promise.all([debtor.post(`/api/charges/${target.id}/paid`), debtor.post(`/api/charges/${target.id}/paid`)]);
    await Promise.all([payerClient.post(`/api/charges/${target.id}/received`), payerClient.post(`/api/charges/${target.id}/unseen`), payerClient.post(`/api/charges/${target.id}/received`)]);
    const st = (await rows('SELECT status FROM charges WHERE id=$1', [target.id]))[0].status;
    assert.ok(['da_nhan', 'chua_tra'].includes(st));
  }
});

// ---------- bất biến sau chuỗi thao tác ngẫu nhiên ----------
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function checkInvariants(teamId, recorded) {
  const charges = await rows(`SELECT c.*, m.status AS mstatus, m.payer_id FROM charges c JOIN meals m ON m.id=c.meal_id WHERE m.team_id=$1`, [teamId]);
  // không khoản nào bị mất hay nhân đôi; tổng tiền từng bữa không đổi
  const per = new Map();
  for (const c of charges) { const p = per.get(c.meal_id) || { n: 0, sum: 0, members: new Set() }; p.n++; p.sum += Number(c.amount); p.members.add(c.member_id); per.set(c.meal_id, p); }
  for (const [mealId, rec] of recorded) {
    const p = per.get(mealId);
    if (rec.deleted) { assert.ok(!p, 'bữa đã quay lại sửa thì không còn khoản'); continue; }
    assert.ok(p, 'bữa có khoản');
    assert.equal(p.n, rec.n, 'số khoản của bữa không đổi'); assert.equal(p.members.size, rec.n, 'mỗi người đúng một khoản');
    assert.equal(p.sum, rec.sum, 'tổng tiền bữa không đổi');
  }
  for (const c of charges) {
    if (c.member_id === c.payee_id) assert.equal(c.status, 'da_nhan', 'không ai nợ chính mình');
    else if (c.status !== 'da_nhan') assert.ok(c.payee_account && c.content, 'khoản chưa xong có ảnh chụp tài khoản và nội dung');
    if (c.settled_by_netting) assert.equal(c.status, 'da_nhan');
    assert.ok(Number(c.amount) >= 0);
  }
  // tổng ròng cả nhóm bằng 0 và khớp với tính độc lập từ các khoản chưa xong
  const open = charges.filter((c) => c.status !== 'da_nhan' && c.member_id !== c.payee_id && c.mstatus !== 'huy' && Number(c.amount) > 0);
  const bal = netBalances(open.map((c) => ({ from: c.member_id, to: c.payee_id, amount: Number(c.amount) })));
  assert.equal([...bal.values()].reduce((s, v) => s + v, 0), 0);
  const dbSum = (await rows(`SELECT COALESCE(SUM(amount),0)::bigint s FROM charges c JOIN meals m ON m.id=c.meal_id WHERE m.team_id=$1 AND m.status IN ('thanh_toan','xong') AND c.status<>'da_nhan' AND c.member_id<>c.payee_id`, [teamId]))[0].s;
  assert.equal(Number(dbSum), open.reduce((s, c) => s + Number(c.amount), 0));
  // khoản trong phiên bù trừ đang mở phải còn chưa trả
  const nets = await rows(`SELECT c.status, n.status AS ns FROM charges c JOIN nettings n ON n.id=c.netting_id WHERE n.team_id=$1`, [teamId]);
  for (const x of nets) { if (x.ns === 'cho') assert.equal(x.status, 'chua_tra'); if (x.ns === 'xong') assert.equal(x.status, 'da_nhan'); }
  const ev = (await rows('SELECT count(*)::int n FROM charge_events WHERE team_id=$1', [teamId]))[0].n;
  assert.ok(ev >= charges.length || charges.length === 0);
}

for (const seed of [1, 2, 3, 4]) {
  test(`chuỗi thao tác ngẫu nhiên (hạt giống ${seed}): bất biến sổ nợ luôn đúng`, async () => {
    const r = prng(seed * 7919);
    const names = ['Chủ', 'An', 'Bình', 'Chi', 'Dũng'];
    const t = await makeTeam(names, { bankFor: ['Chủ', 'An', 'Bình', 'Chi'] });
    const idList = names.map((n) => t.ids[n]);
    const recorded = new Map();
    const T = `AND meal_id IN (SELECT id FROM meals WHERE team_id='${t.teamId}')`;
    const meals = []; // { id, state }
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const clientOf = (mid) => t.clients[idList.indexOf(mid)];
    const tryPost = async (cl, path, body) => { const x = await cl.post(path, body); assert.ok(x.status < 500, `${path} -> ${x.status} ${x.buf.toString().slice(0, 200)}`); return x; };
    let day = 0;
    for (let step = 0; step < 70; step++) {
      const op = r();
      if (op < 0.12 || meals.length === 0) {
        // bữa mới tới bước thu tiền
        const orders = {};
        for (const n of names) if (r() < 0.75) orders[n] = [['Món', (1 + Math.floor(r() * 30)) * 1000 + Math.floor(r() * 10) * 100, 1 + Math.floor(r() * 3)]];
        if (!Object.keys(orders).length) orders.An = [['Món', 25000, 1]];
        const payer = pick(['Chủ', 'An', 'Bình', 'Chi']);
        const venue = 'Quán ' + step;
        const id = await (async () => {
          const owner = t.clients[0];
          const m = await ok(owner.post(`/api/teams/${t.teamId}/meals`, { day: new Date(Date.now() + 7 * 3600_000 + (day++ % 10) * 0).toISOString().slice(0, 10) }).then(async (x) => (x.status === 409 ? { json: { mealId: x.json.error.details.mealId }, status: 200, buf: Buffer.from('{}') } : x)));
          const mid = m.mealId;
          await ok(owner.post(`/api/meals/${mid}/proposals`, { name: venue }));
          await ok(owner.post(`/api/meals/${mid}/status`, { to: 'dat_mon' }));
          for (const [n, list] of Object.entries(orders)) for (const [d, p, q] of list) await ok(t.by[n].post(`/api/meals/${mid}/items`, { name: d, price: p, qty: q }));
          await ok(owner.post(`/api/meals/${mid}/settings`, { payerId: t.ids[payer], fees: { ship: Math.floor(r() * 30) * 1000 + Math.floor(r() * 1000), discount: r() < 0.3 ? Math.floor(r() * 20000) : 0 }, splitMode: r() < 0.5 ? 'ty_le' : 'chia_deu' }));
          await ok(owner.post(`/api/meals/${mid}/status`, { to: 'thanh_toan' }));
          return mid;
        })();
        const c = await rows('SELECT count(*)::int n, SUM(amount)::bigint s FROM charges WHERE meal_id=$1', [id]);
        recorded.set(id, { n: c[0].n, sum: Number(c[0].s) });
        meals.push(id);
      } else if (op < 0.30) { // đổi người ứng tiền
        const id = pick(meals); const to = pick(['Chủ', 'An', 'Bình', 'Chi', 'Dũng']);
        await tryPost(pick(t.clients), `/api/meals/${id}/settings`, { payerId: t.ids[to] });
      } else if (op < 0.50) { // đã chuyển
        const open = await rows(`SELECT id, member_id FROM charges WHERE status='chua_tra' AND member_id<>payee_id ${T}`);
        if (open.length) { const c = pick(open); await tryPost(clientOf(c.member_id), `/api/charges/${c.id}/paid`); }
      } else if (op < 0.65) { // đã nhận
        const open = await rows(`SELECT id, payee_id FROM charges WHERE status IN ('da_chuyen','chua_tra') AND member_id<>payee_id ${T}`);
        if (open.length) { const c = pick(open); await tryPost(clientOf(c.payee_id), `/api/charges/${c.id}/received`); }
      } else if (op < 0.72) { // chưa thấy
        const open = await rows(`SELECT id, payee_id FROM charges WHERE status IN ('da_chuyen','da_nhan') AND member_id<>payee_id ${T}`);
        if (open.length) { const c = pick(open); await tryPost(clientOf(c.payee_id), `/api/charges/${c.id}/unseen`); }
      } else if (op < 0.80) { // tạo phiên bù trừ
        await tryPost(pick(t.clients), `/api/teams/${t.teamId}/netting`);
      } else if (op < 0.90) { // tiến hành chuyển bù trừ
        const ts = await rows(`SELECT t.id, t.from_id, t.to_id, t.status FROM netting_transfers t JOIN nettings n ON n.id=t.netting_id WHERE n.status='cho' AND n.team_id='${t.teamId}'`);
        if (ts.length) { const x = pick(ts); if (x.status === 'chua_tra') await tryPost(clientOf(x.from_id), `/api/transfers/${x.id}/paid`); else await tryPost(clientOf(x.to_id), `/api/transfers/${x.id}/received`); }
      } else if (op < 0.94) { // hủy phiên bù trừ
        const n = await rows(`SELECT id, created_by FROM nettings WHERE status='cho' AND team_id='${t.teamId}'`);
        if (n.length) await tryPost(clientOf(n[0].created_by), `/api/nettings/${n[0].id}/cancel`);
      } else if (op < 0.97) { // quay lại sửa rồi sang thu tiền lại
        const id = pick(meals);
        const x = await tryPost(t.clients[0], `/api/meals/${id}/status`, { to: 'dat_mon' });
        if (x.status === 200) {
          await ok(t.clients[0].post(`/api/meals/${id}/status`, { to: 'thanh_toan' }));
          const c = await rows('SELECT count(*)::int n, SUM(amount)::bigint s FROM charges WHERE meal_id=$1', [id]);
          recorded.set(id, { n: c[0].n, sum: Number(c[0].s) });
        }
      } else { // hoàn tất bữa
        await tryPost(t.clients[0], `/api/meals/${pick(meals)}/status`, { to: 'xong' });
      }
      await checkInvariants(t.teamId, recorded);
    }
    // dọn sạch: mọi khoản được nhận -> sổ nợ về 0
    const n = await rows(`SELECT id, created_by FROM nettings WHERE status='cho' AND team_id='${t.teamId}'`);
    if (n.length) {
      const ts = await rows('SELECT * FROM netting_transfers WHERE netting_id=$1 ORDER BY seq', [n[0].id]);
      for (const x of ts) { await clientOf(x.from_id).post(`/api/transfers/${x.id}/paid`); await clientOf(x.to_id).post(`/api/transfers/${x.id}/received`); }
    }
    for (const c of await rows(`SELECT id, payee_id, member_id FROM charges WHERE status<>'da_nhan' AND member_id<>payee_id ${T}`)) {
      await clientOf(c.member_id).post(`/api/charges/${c.id}/paid`);
      const x = await clientOf(c.payee_id).post(`/api/charges/${c.id}/received`);
      assert.equal(x.status, 200);
    }
    const d = await ok(t.clients[0].get(`/api/teams/${t.teamId}/debts`));
    assert.equal(d.items.length, 0); assert.equal(d.pairs.length, 0);
    await checkInvariants(t.teamId, recorded);
  });
}
