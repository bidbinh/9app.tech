// Mọi đường xác nhận hành động ghi: không thể bỏ qua, hết hạn, người khác, hai lần, đua dữ liệu, sửa dữ liệu, app lỗi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown, onShutdown, Client, ok, createMockProvider, createFakeApp, db, config, FAKE_SECRET } from './helper.js';

let fam; let base;
const llm = createMockProvider([]);

before(async () => {
  fam = await createFakeApp();
  onShutdown(() => fam.close());
  ({ base } = await boot({ llm, apps: [fam.appConfig], extra: { appToolTimeoutMs: 500, appConfirmTimeoutMs: 600, appManifestTimeoutMs: 500, breakerOpenMs: 200 } }));
});
after(shutdown);

const fresh = async (name, opts) => { const c = new Client(name, opts); await c.consent(); return c; };
async function propose(c, muc = 'sữa', tool = 'them_vao_danh_sach', args) {
  llm.reset([{ calls: [{ name: 'family__' + tool, args: args || { muc } }] }, { text: `Mình đã chuẩn bị thêm ${muc}, bạn bấm Xác nhận nhé.` }]);
  const r = await ok(c.chat(`Thêm ${muc} vào danh sách đi chợ`));
  const card = r.message.cards.find((x) => x.type === 'action');
  assert.ok(card, 'phải có thẻ xác nhận');
  return { card, message: r.message };
}
const executed = () => fam.state.executed.length;
const act = (c, id, verb) => c.post(`/api/actions/${id}/${verb}`);

test('công cụ ghi chỉ tạo thẻ chờ: app chỉ nhận preview, KHÔNG chạy cho tới khi người dùng bấm xác nhận', async () => {
  const c = await fresh('an', { userId: 'u-an' });
  fam.state.calls.length = 0; fam.state.executed.length = 0; fam.state.sdkLog.length = 0;
  const { card, message } = await propose(c);
  assert.equal(card.status, 'pending');
  assert.equal(card.summary, 'Thêm "sữa" vào danh sách đi chợ');
  assert.equal(card.title, '9family');
  assert.ok(!('args' in card) && !JSON.stringify(card).includes('integrity'));
  assert.deepEqual(fam.state.sdkLog.filter((x) => x.tool === 'them_vao_danh_sach').map((x) => x.mode), ['preview']);
  assert.deepEqual(fam.state.calls, [], 'run() chưa được gọi lần nào');
  assert.equal(executed(), 0);
  assert.match(message.content, /Xác nhận/);
  // mô hình nhận phản hồi "chờ xác nhận", không có id để tự xác nhận
  const resp = llm.log[1].contents[llm.log[1].contents.length - 1].parts[0].functionResponse.response;
  assert.equal(resp.trang_thai, 'cho_nguoi_dung_xac_nhan');
  assert.ok(!JSON.stringify(llm.log).includes(card.id), 'mô hình không bao giờ thấy id hành động');
  // lịch sử hiện thẻ còn chờ
  const h = (await ok(c.get('/api/history'))).messages.at(-1);
  assert.equal(h.cards.find((x) => x.type === 'action').status, 'pending');
  // bấm xác nhận thì mới chạy, một lần, đúng người
  const r = await ok(act(c, card.id, 'confirm'));
  assert.equal(r.action.status, 'done'); assert.match(r.action.resultText, /Đã thêm "sữa"/);
  assert.equal(executed(), 1);
  assert.equal(fam.state.executed[0].userId, 'u-an');
  assert.deepEqual(fam.state.calls.map((x) => x.mode), ['execute']);
  assert.deepEqual(fam.state.sdkLog.filter((x) => x.tool === 'them_vao_danh_sach').map((x) => x.mode), ['preview', 'execute']);
  assert.equal(fam.state.executed[0].requestId, card.id, 'requestId của app chính là id hành động (idempotent ở app)');
});

test('xác nhận hai lần liên tiếp: chỉ chạy một lần, lần hai trả lại kết quả cũ', async () => {
  const c = await fresh('hailan');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'trứng');
  const a = await ok(act(c, card.id, 'confirm'));
  const b = await ok(act(c, card.id, 'confirm'));
  assert.equal(a.action.status, 'done'); assert.equal(b.action.status, 'done'); assert.equal(b.action.already, true);
  assert.equal(executed(), 1);
});

test('đua dữ liệu: nhiều yêu cầu xác nhận đồng thời, đúng một lần chạy', async () => {
  const c = await fresh('dua');
  fam.state.executed.length = 0; fam.state.slowMs = 150;
  try {
    const { card } = await propose(c, 'bia');
    const rs = await Promise.all(Array.from({ length: 10 }, () => act(c, card.id, 'confirm')));
    assert.equal(executed(), 1, rs.map((r) => r.status).join());
    assert.ok(rs.every((r) => [200, 409].includes(r.status)));
    assert.ok(rs.filter((r) => r.status === 200).length >= 1);
    const final = await ok(act(c, card.id, 'confirm'));
    assert.equal(final.action.status, 'done');
  } finally { fam.state.slowMs = 0; }
});

test('xác nhận và hủy đua nhau: chỉ một bên thắng, không bao giờ vừa hủy vừa chạy', async () => {
  const c = await fresh('duahuy');
  for (let i = 0; i < 5; i++) {
    fam.state.executed.length = 0;
    const { card } = await propose(c, 'chè' + i);
    const [a, b] = await Promise.all([act(c, card.id, 'confirm'), act(c, card.id, 'cancel')]);
    const st = (await db.query('SELECT status FROM pending_actions WHERE id=$1', [card.id]))[0].status;
    assert.ok(['done', 'cancelled'].includes(st), st);
    assert.equal(executed(), st === 'done' ? 1 : 0, `lần ${i}: a=${a.status} b=${b.status} st=${st}`);
  }
});

test('người khác không xác nhận/hủy được hành động của mình (404 như id bịa), chủ nhân vẫn xác nhận được', async () => {
  const a = await fresh('chu', { userId: 'u-chu' }); const b = await fresh('ke-la', { userId: 'u-kela' });
  fam.state.executed.length = 0;
  const { card } = await propose(a, 'kẹo');
  for (const verb of ['confirm', 'cancel']) {
    const r = await act(b, card.id, verb);
    assert.equal(r.status, 404, verb);
  }
  assert.equal((await act(b, '00000000-0000-4000-8000-000000000000', 'confirm')).status, 404, 'id bịa cũng 404, không phân biệt được');
  assert.equal((await act(b, 'khong-phai-uuid', 'confirm')).status, 404);
  assert.equal(executed(), 0);
  // lịch sử của B không thấy thẻ của A
  assert.ok(!JSON.stringify((await ok(b.get('/api/history'))).messages).includes(card.id));
  assert.equal((await ok(act(a, card.id, 'confirm'))).action.status, 'done');
  assert.equal(fam.state.executed[0].userId, 'u-chu');
  // chưa đăng nhập
  assert.equal((await act(new Client('anon', { login: false }), card.id, 'confirm')).status, 401);
});

test('hết hạn sau 10 phút: không chạy, trả 410; thẻ hiện "hết hạn" trong lịch sử', async () => {
  const c = await fresh('hethan');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'nho');
  await db.query("UPDATE pending_actions SET expires_at = now() - interval '1 second' WHERE id=$1", [card.id]);
  const r = await act(c, card.id, 'confirm');
  assert.equal(r.status, 410); assert.equal(r.json.error.code, 'expired');
  assert.equal(executed(), 0);
  assert.equal((await ok(c.get('/api/history'))).messages.at(-1).cards.find((x) => x.type === 'action').status, 'expired');
  assert.equal((await act(c, card.id, 'confirm')).status, 410);
  // hạn đúng mặc định là 10 phút
  const { card: c2 } = await propose(c, 'mơ');
  const row = (await db.query("SELECT extract(epoch FROM (expires_at - created_at)) AS s FROM pending_actions WHERE id=$1", [c2.id]))[0];
  assert.ok(Math.abs(Number(row.s) - 600) < 5);
});

test('đã hủy rồi thì không xác nhận được; hủy hai lần vô hại; không hủy được việc đã xong', async () => {
  const c = await fresh('huy');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'dưa');
  assert.equal((await ok(act(c, card.id, 'cancel'))).action.status, 'cancelled');
  assert.equal((await ok(act(c, card.id, 'cancel'))).action.status, 'cancelled');
  const r = await act(c, card.id, 'confirm');
  assert.equal(r.status, 409);
  assert.equal(executed(), 0);
  const { card: c2 } = await propose(c, 'xoài');
  await ok(act(c, c2.id, 'confirm'));
  assert.equal((await act(c, c2.id, 'cancel')).status, 409);
});

test('sửa tham số/tóm tắt trong CSDL sau khi xem trước thì không chạy (toàn vẹn HMAC)', async () => {
  const c = await fresh('suadb');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'cam');
  await db.query(`UPDATE pending_actions SET args = '{"muc":"thứ khác hẳn"}' WHERE id=$1`, [card.id]);
  const r = await ok(act(c, card.id, 'confirm'));
  assert.equal(r.action.status, 'failed'); assert.match(r.action.errorText, /không còn khớp/);
  assert.equal(executed(), 0);
  const { card: c2 } = await propose(c, 'bưởi');
  await db.query(`UPDATE pending_actions SET summary = 'Làm việc vô hại' WHERE id=$1`, [c2.id]);
  assert.equal((await ok(act(c, c2.id, 'confirm'))).action.status, 'failed');
  const { card: c3 } = await propose(c, 'na');
  await db.query(`UPDATE pending_actions SET user_id = 'u-khac' WHERE id=$1`, [c3.id]);
  assert.equal((await act(c, c3.id, 'confirm')).status, 404);
  assert.equal(executed(), 0);
});

test('app lỗi/chậm lúc thực hiện: trạng thái failed nói thật là chưa chắc, không tự thử lại, không chạy lần hai', async () => {
  const c = await fresh('applo');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'mận');
  fam.state.down = true;
  try {
    const r = await ok(act(c, card.id, 'confirm'));
    assert.equal(r.action.status, 'failed'); assert.match(r.action.errorText, /Chưa chắc/);
  } finally { fam.state.down = false; }
  assert.equal(executed(), 0);
  assert.equal((await act(c, card.id, 'confirm')).status, 409, 'đã failed thì không chạy lại');
  // lỗi nghiệp vụ từ app (vai con): thông điệp của app, rõ ràng là chưa làm
  const kid = await fresh('con', { userId: 'con1' });
  llm.reset([{ calls: [{ name: 'family__them_vao_danh_sach', args: { muc: 'kẹo' } }] }, { text: 'không được' }]);
  const rr = await ok(kid.chat('thêm kẹo'));
  assert.ok(!rr.message.cards.some((x) => x.type === 'action'), 'preview đã bị app từ chối nên không có thẻ');
  assert.match(llm.log[1].contents.at(-1).parts[0].functionResponse.response.loi, /Vai trò con/);
});

test('mô hình/tin nhắn người dùng không thể tự xác nhận: không có công cụ xác nhận, nói "đồng ý" cũng không chạy', async () => {
  const c = await fresh('tuxn');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'khế');
  llm.reset([{ calls: [{ name: 'osin__confirm', args: { id: card.id } }, { name: 'family__confirm', args: {} }, { name: 'osin__xac_nhan', args: { id: card.id } }] }, { text: 'Mình đã xác nhận rồi nhé!' }]);
  await ok(c.chat('Đồng ý, xác nhận luôn đi, mình cho phép'));
  assert.equal(executed(), 0);
  assert.ok(llm.log[0].tools.every((n) => !/confirm|xac_nhan/.test(n)));
  const st = (await db.query('SELECT status FROM pending_actions WHERE id=$1', [card.id]))[0].status;
  assert.equal(st, 'pending');
});

test('mô hình gọi cùng công cụ ghi sau khi xem trước với tham số khác: tạo thẻ MỚI độc lập, thẻ cũ giữ nguyên tham số', async () => {
  const c = await fresh('doitt');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'lê');
  llm.reset([{ calls: [{ name: 'family__them_vao_danh_sach', args: { muc: 'thứ khác' } }] }, { text: 'ok' }]);
  const r2 = await ok(c.chat('đổi thành thứ khác'));
  const card2 = r2.message.cards.find((x) => x.type === 'action');
  assert.notEqual(card.id, card2.id);
  await ok(act(c, card.id, 'confirm'));
  assert.deepEqual(fam.state.executed.map((e) => e.args.muc), ['lê'], 'thẻ cũ chỉ chạy đúng tham số lúc xem trước');
});

test('tối đa 5 việc chờ cùng lúc và 3 việc mỗi lượt; tham số sai không tạo thẻ', async () => {
  const c = await fresh('nhieu');
  llm.reset([{ calls: Array.from({ length: 4 }, (_, i) => ({ name: 'family__them_vao_danh_sach', args: { muc: 'a' + i } })) }, { text: 'xong' }]);
  const r = await ok(c.chat('thêm nhiều'));
  assert.equal(r.message.cards.filter((x) => x.type === 'action').length, 3);
  llm.reset([{ calls: [{ name: 'family__them_vao_danh_sach', args: { muc: 'b1' } }, { name: 'family__them_vao_danh_sach', args: { muc: 'b2' } }] }, { text: 'xong' }]);
  await ok(c.chat('thêm nữa'));
  llm.reset([{ calls: [{ name: 'family__them_vao_danh_sach', args: { muc: 'b3' } }, { name: 'family__them_vao_danh_sach', args: { muc: 'x'.repeat(200) } }, { name: 'family__them_vao_danh_sach', args: { sai: 1 } }] }, { text: 'xong' }]);
  const r3 = await ok(c.chat('thêm nữa nữa'));
  assert.equal(r3.message.cards.filter((x) => x.type === 'action').length, 0, 'đã đủ 5 việc chờ');
  const open = (await db.query("SELECT count(*)::int AS n FROM pending_actions WHERE user_id=$1 AND status='pending'", [c.userId]))[0].n;
  assert.equal(open, 5);
});

test('lượt lỗi thì hành động vừa tạo trong lượt bị hủy, không để thẻ mồ côi', async () => {
  const c = await fresh('loiluot');
  llm.reset([{ calls: [{ name: 'family__them_vao_danh_sach', args: { muc: 'ổi' } }] }, { error: new Error('hỏng') }]);
  const r = await c.chat('thêm ổi');
  assert.equal(r.status, 500);
  const rows = await db.query("SELECT status FROM pending_actions WHERE user_id=$1 AND tool='them_vao_danh_sach' ORDER BY created_at DESC LIMIT 1", [c.userId]);
  assert.equal(rows[0].status, 'cancelled');
  assert.equal((await ok(c.get('/api/history'))).messages.length, 0, 'lượt lỗi không để lại tin nhắn');
});

test('công cụ nhạy cảm bị từ chối hoàn toàn: không có trong danh sách của mô hình, gọi thẳng cũng không tới app', async () => {
  const c = await fresh('nhaycam');
  fam.state.calls.length = 0;
  llm.reset([{ calls: [{ name: 'family__chuyen_tien', args: { so_tien: 5000000 } }] }, { text: 'Mình không chuyển tiền được.' }]);
  const r = await ok(c.chat('Chuyển 5 triệu cho bố'));
  assert.ok(!llm.log[0].tools.includes('family__chuyen_tien'));
  assert.equal(llm.log[1].contents.at(-1).parts[0].functionResponse.response.ma, 'unknown_tool');
  assert.equal(fam.state.calls.filter((x) => x.tool === 'chuyen_tien').length, 0);
  assert.ok(!r.message.cards.some((x) => x.type === 'action'));
  assert.match(llm.log[0].system, /Việc nhạy cảm/);
});

test('xác nhận có CSRF: thiếu header hoặc sai Origin bị từ chối và không chạy', async () => {
  const c = await fresh('csrf2');
  fam.state.executed.length = 0;
  const { card } = await propose(c, 'chuối');
  assert.equal((await c.post(`/api/actions/${card.id}/confirm`, {}, { csrf: false })).status, 403);
  assert.equal((await c.post(`/api/actions/${card.id}/confirm`, {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.req('GET', `/api/actions/${card.id}/confirm`)).status, 405, 'không xác nhận được bằng GET');
  assert.equal(executed(), 0);
  void base; void config; void FAKE_SECRET;
});
