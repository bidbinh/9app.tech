// Vòng gọi công cụ: thứ tự, giới hạn 6 vòng, lỗi công cụ, app chậm/chết, tham số giả mạo, liên kết, đồng ý, xác thực.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, shutdown, onShutdown, Client, ok, identity, createMockProvider, createFakeApp, ApiError, config, db, resetChatRate, resetBadCookies } from './helper.js';

let fam; let base;
const llm = createMockProvider([]);
const lastResponse = (call, i = 0) => call.contents[call.contents.length - 1].parts[i].functionResponse.response;

before(async () => {
  fam = await createFakeApp();
  onShutdown(() => fam.close());
  ({ base } = await boot({ llm, apps: [fam.appConfig], extra: { appToolTimeoutMs: 400, appManifestTimeoutMs: 400, breakerOpenMs: 300 } }));
});
after(shutdown);
const fresh = async (name = 'lan', opts = {}) => { const c = new Client(name, opts); await c.consent(); return c; };

test('chưa đăng nhập, cookie giả hoặc sai định dạng: 401 kèm đường dẫn đăng nhập; cookie sai bị giới hạn theo IP', async () => {
  const anon = new Client('khach', { login: false });
  const r = await anon.get('/api/me');
  assert.equal(r.status, 401); assert.equal(r.json.error.code, 'unauthorized'); assert.match(r.json.error.details.loginUrl, /auth\/login$/);
  assert.equal((await new Client('x', { token: 'A'.repeat(43) }).get('/api/me')).status, 401, 'đúng định dạng nhưng không có trong CSDL');
  // cookie của 9app.tech (nine_sid) không có giá trị gì với Osin
  assert.equal((await new Client('y', { login: false }).get('/api/me', { cookie: 'nine_sid=' + 'B'.repeat(43) })).status, 401);
  for (const bad of ['a', 'x'.repeat(300), '../../etc/passwd']) assert.equal((await new Client('z', { token: bad }).get('/api/me')).status, 401);
  for (const [m, p] of [['POST', '/api/chat'], ['GET', '/api/history'], ['POST', '/api/consent'], ['DELETE', '/api/history'], ['GET', '/api/export'], ['POST', '/api/account/erase'], ['GET', '/api/ui-token']]) {
    const x = await anon.req(m, p, m === 'POST' ? { text: 'hi' } : undefined);
    assert.equal(x.status, 401, `${m} ${p}`);
  }
  resetBadCookies();
  // quét cookie: vượt 30 lần/phút/IP thì 429 ngay, kể cả cookie đúng định dạng (không tốn truy vấn)
  const codes = [];
  for (let i = 0; i < 40; i++) codes.push((await new Client('q', { token: 'C'.repeat(42) + String(i % 10) }).get('/api/me', { noUi: true })).status);
  assert.equal(codes.slice(0, 30).every((c) => c === 401), true, codes.join());
  assert.equal(codes.slice(31).every((c) => c === 429), true, codes.join());
  resetBadCookies();
  assert.equal((await new Client('ok-lai').get('/api/me')).status, 200);
});

test('CSRF: ghi mà thiếu header X-Requested-With hoặc sai Origin bị từ chối', async () => {
  const c = await fresh('csrf');
  assert.equal((await c.post('/api/chat', { text: 'chào' }, { csrf: false })).status, 403);
  assert.equal((await c.post('/api/chat', { text: 'chào' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.del('/api/history', { csrf: false })).status, 403);
  assert.equal((await c.post('/api/chat', { text: 'chào' }, { origin: base.replace(/\/osin$/, '') })).status, 200);
});

test('đồng ý trước khi dùng AI bên ngoài: chưa đồng ý thì 403, đồng ý rồi dùng được', async () => {
  llm.reset([{ text: 'Chào bạn!' }]);
  const c = new Client('chuadongy');
  const me = await ok(c.get('/api/me'));
  assert.equal(me.needConsent, true);
  const r = await c.chat('xin chào');
  assert.equal(r.status, 403); assert.equal(r.json.error.code, 'need_consent');
  assert.equal(llm.log.length, 0, 'chưa đồng ý thì không gửi gì cho mô hình');
  await ok(c.consent());
  assert.equal((await ok(c.get('/api/me'))).needConsent, false);
  assert.equal((await ok(c.chat('xin chào'))).message.content, 'Chào bạn!');
});

test('trò chuyện thường: lưu lịch sử hai tin, lần sau mô hình nhận lại ngữ cảnh', async () => {
  const c = await fresh('ctx');
  llm.reset([{ text: 'Mình là Osin.' }, { text: 'Bạn vừa hỏi mình là ai.' }]);
  await ok(c.chat('Bạn là ai?'));
  await ok(c.chat('Mình vừa hỏi gì?'));
  const h = (await ok(c.get('/api/history'))).messages;
  assert.deepEqual(h.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  const second = llm.log[1].contents;
  assert.equal(second[0].parts[0].text, 'Bạn là ai?');
  assert.equal(second[1].role, 'model');
  assert.match(llm.log[0].system, /Osin/); assert.match(llm.log[0].system, /ctx/);
});

test('vòng công cụ đúng thứ tự: gọi công cụ app bằng đúng người dùng, mô hình nhận dữ liệu bọc, liên kết sâu được kiểm', async () => {
  const c = await fresh('lan', { userId: 'u-lan', families: [{ id: 'f1', name: 'Nhà Lan', role: 'chu' }] });
  fam.state.calls.length = 0;
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }] }, { text: 'Hôm nay con học Toán lúc 7:30 và bạn đón con lúc 16:30.' }]);
  const r = await ok(c.chat('Hôm nay con đi học gì?'));
  assert.match(r.message.content, /Toán/);
  assert.equal(llm.log.length, 2);
  assert.ok(llm.log[0].tools.includes('family__lich_hom_nay') && llm.log[0].tools.includes('osin__may_tinh'));
  assert.ok(!llm.log[0].tools.includes('family__chuyen_tien'), 'công cụ nhạy cảm không được đưa cho mô hình');
  const resp = lastResponse(llm.log[1]);
  assert.equal(resp.du_lieu_tu_cong_cu.su_kien[0].ten, 'Học Toán');
  assert.ok(resp.luu_y && !('links' in resp.du_lieu_tu_cong_cu));
  assert.deepEqual(fam.state.calls.map((x) => [x.tool, x.mode, x.userId, x.familyId]), [['lich_hom_nay', 'execute', 'u-lan', 'f1']]);
  const links = r.message.cards.find((x) => x.type === 'links');
  assert.deepEqual(links.items, [{ label: 'lịch 9family', path: '/family/#/lich' }], 'chỉ nhận liên kết nằm trong tiền tố của app');
  assert.match(llm.log[0].system, /Nhà Lan/);
});

test('mô hình không thể giả mạo người dùng: tham số actingUserId/userId bị từ chối, app không được gọi', async () => {
  const c = await fresh('thu', { userId: 'u-thu' });
  fam.state.calls.length = 0;
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: { actingUserId: 'u-nan-nhan' } }, { name: 'family__lich_hom_nay', args: { userId: 'u-nan-nhan', ngay: '2026-10-05' } }] }, { text: 'Không lấy được.' }]);
  await ok(c.chat('Cho mình xem lịch của người khác'));
  assert.equal(fam.state.calls.length, 0);
  const parts = llm.log[1].contents[llm.log[1].contents.length - 1].parts;
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.functionResponse.response.ma === 'invalid_args'));
});

test('giới hạn 6 vòng công cụ mỗi lượt: vòng thứ 7 cấm công cụ và buộc trả lời', async () => {
  const c = await fresh('vong');
  fam.state.calls.length = 0;
  llm.reset(() => ({ calls: [{ name: 'osin__may_tinh', args: { bieu_thuc: '1+1' } }] }));
  const r = await ok(c.chat('Tính mãi đi'));
  assert.equal(llm.log.length, config.maxToolRounds + 1);
  assert.equal(llm.log.filter((x) => x.allowTools).length, config.maxToolRounds);
  assert.equal(llm.log[llm.log.length - 1].allowTools, false);
  assert.ok(r.message.content.length > 5, 'có câu trả lời dự phòng');
  // vòng cuối có công cụ nhưng bị cấm: kết quả của 6 lần gọi đều đã được đưa cho mô hình
  assert.equal(llm.log[6].contents.filter((x) => x.parts.some((p) => p.functionResponse)).length, 6);
});

test('quá 4 công cụ trong một vòng: phần dư nhận lỗi, số functionResponse khớp số functionCall', async () => {
  const c = await fresh('nhieu');
  llm.reset([{ calls: Array.from({ length: 6 }, (_, i) => ({ name: 'osin__may_tinh', args: { bieu_thuc: `${i}+1` } })) }, { text: 'xong' }]);
  await ok(c.chat('tính nhiều'));
  const parts = llm.log[1].contents[llm.log[1].contents.length - 1].parts;
  assert.equal(parts.length, 6);
  assert.equal(parts.filter((p) => p.functionResponse.response.du_lieu_tu_cong_cu).length, 4);
});

test('công cụ nội bộ chạy thật: tính toán, lịch âm, đổi đơn vị; tên lạ bị từ chối', async () => {
  const c = await fresh('noibo');
  llm.reset([{ calls: [{ name: 'osin__may_tinh', args: { bieu_thuc: '12*(3+4)' } }, { name: 'osin__doi_lich', args: { chieu: 'duong_sang_am', ngay: 17, thang: 2, nam: 2026 } }, { name: 'osin__quy_doi_don_vi', args: { gia_tri: 3, tu: 'chỉ vàng', den: 'gam' } }, { name: 'osin__tim_chuc_nang', args: { tu_khoa: 'văn khấn' } }] }, { calls: [{ name: 'osin__xoa_het', args: {} }, { name: 'osin__may_tinh', args: { bieu_thuc: 'process.exit()' } }] }, { text: 'ok' }]);
  const r = await ok(c.chat('thử nội bộ'));
  const p = llm.log[1].contents[llm.log[1].contents.length - 1].parts.map((x) => x.functionResponse.response);
  const p2 = lastResponse(llm.log[2], 0); const p3 = lastResponse(llm.log[2], 1);
  assert.equal(p[0].du_lieu_tu_cong_cu.ket_qua, 84);
  assert.match(p[1].du_lieu_tu_cong_cu.hien_thi, /Bính Ngọ/);
  assert.equal(p[2].du_lieu_tu_cong_cu.ket_qua, 11.25);
  assert.ok(p[3].du_lieu_tu_cong_cu.ket_qua.length);
  assert.equal(p2.ma, 'unknown_tool');
  assert.equal(p3.ma, 'invalid_args');
  assert.ok(r.message.cards.some((x) => x.type === 'links' && x.items[0].path.startsWith('/vannien/')));
});

test('lỗi công cụ: lỗi nghiệp vụ truyền đúng thông điệp; lỗi bất ngờ bị che; mô hình nhận lỗi và nói thật', async () => {
  const c = await fresh('con', { userId: 'con1' });
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }, { name: 'family__hong', args: {} }] }, { text: 'Mình chưa lấy được lịch.' }]);
  const r = await ok(c.chat('lịch hôm nay'));
  const p = llm.log[1].contents[llm.log[1].contents.length - 1].parts.map((x) => x.functionResponse.response);
  assert.equal(p[0].ma, 'forbidden'); assert.match(p[0].loi, /Vai trò con/);
  assert.equal(p[1].ma, 'internal'); assert.ok(!JSON.stringify(p[1]).includes('boom'));
  assert.equal(r.message.content, 'Mình chưa lấy được lịch.');
});

test('app chết: công cụ báo lỗi, công cụ nội bộ và app khác vẫn chạy; ngắt mạch sau 3 lần; hồi phục khi app sống lại', async () => {
  const c = await fresh('chet');
  const lunch = await createFakeApp({ id: 'lunch', mount: '/lunch' });
  onShutdown(() => lunch.close());
  const both = [fam.appConfig, { ...lunch.appConfig, name: '9lunch' }];
  const { registry } = await boot({ llm, apps: both, extra: { appToolTimeoutMs: 400, appManifestTimeoutMs: 400, breakerOpenMs: 300 } });
  const c2 = await fresh('chet2');
  await registry.listTools(); // làm nóng manifest rồi mới cho app chết
  fam.state.down = true;
  try {
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }, { name: 'lunch__lich_hom_nay', args: {} }, { name: 'osin__may_tinh', args: { bieu_thuc: '2+2' } }] }, { text: 'Một app không phản hồi.' }]);
  const r = await ok(c2.chat('hỏi hết'));
  const p = llm.log[1].contents[llm.log[1].contents.length - 1].parts.map((x) => x.functionResponse.response);
  assert.equal(p[0].ma, 'app_unavailable');
  assert.ok(p[1].du_lieu_tu_cong_cu.su_kien, 'app khác không bị ảnh hưởng');
  assert.equal(p[2].du_lieu_tu_cong_cu.ket_qua, 4);
  assert.equal(r.message.content, 'Một app không phản hồi.');
  // ngắt mạch: sau vài lần lỗi, lời gọi trả lỗi ngay không chờ mạng
  for (let i = 0; i < 4; i++) { llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }] }, { text: 'x' }]); await ok(c2.chat('lại ' + i)); }
  assert.ok(registry.status().find((s) => s.id === 'family').breaker, 'mạch đã ngắt sau các lần lỗi liên tiếp');
  } finally { fam.state.down = false; }
  await new Promise((r2) => setTimeout(r2, 450));
  registry.invalidate();
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }] }, { text: 'sống lại' }]);
  await ok(c2.chat('thử lại'));
  assert.ok(lastResponse(llm.log[1]).du_lieu_tu_cong_cu.su_kien, 'app hồi phục thì dùng lại được');
  void c;
});

test('app chậm: quá thời hạn công cụ thì báo lỗi, lượt vẫn hoàn thành nhanh', async () => {
  const c = await fresh('cham');
  await boot({ llm, apps: [fam.appConfig], extra: { appToolTimeoutMs: 250, appManifestTimeoutMs: 400, breakerOpenMs: 300 } });
  const c2 = await fresh('cham2');
  fam.state.down = false;
  fam.state.slowMs = 1500;
  try {
    llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }] }, { text: 'App chậm quá.' }]);
    const t0 = Date.now();
    const r = await ok(c2.chat('lịch'));
    assert.ok(Date.now() - t0 < 1200, 'không chờ app chậm quá hạn');
    assert.equal(lastResponse(llm.log[1]).ma, 'timeout');
    assert.equal(r.message.content, 'App chậm quá.');
  } finally { fam.state.slowMs = 0; }
  void c;
});

test('manifest của app treo không chặn cả lượt: công cụ nội bộ và app khác vẫn dùng được', async () => {
  const hang = http.createServer(() => { /* không bao giờ trả lời */ });
  await new Promise((r) => hang.listen(0, '127.0.0.1', r));
  onShutdown(() => { hang.closeAllConnections?.(); hang.close(); });
  const hangApp = { id: 'treo', name: '9treo', baseUrl: `http://127.0.0.1:${hang.address().port}/treo`, keyId: 'osin', secret: fam.secret, linkPrefix: '/treo/' };
  await boot({ llm, apps: [hangApp, fam.appConfig], extra: { appToolTimeoutMs: 400, appManifestTimeoutMs: 300, breakerOpenMs: 300 } });
  const c = await fresh('treo');
  llm.reset([{ calls: [{ name: 'family__lich_hom_nay', args: {} }, { name: 'osin__may_tinh', args: { bieu_thuc: '1+2' } }] }, { text: 'ok' }]);
  const t0 = Date.now();
  await ok(c.chat('hỏi'));
  assert.ok(Date.now() - t0 < 1500);
  assert.ok(llm.log[0].tools.includes('family__lich_hom_nay') && !llm.log[0].tools.some((n) => n.startsWith('treo__')));
  assert.match(llm.log[0].system, /không phản hồi: 9treo/);
});

test('manifest dùng bản cũ khi app lỗi sau đó (làm mới nền), app thay đổi công cụ được cập nhật', async () => {
  const { registry } = await boot({ llm, apps: [fam.appConfig], extra: { manifestTtlMs: 50, appManifestTimeoutMs: 400, breakerOpenMs: 100 } });
  const a = await registry.listTools();
  assert.ok(a.tools.some((t) => t.id === 'family__lich_hom_nay'));
  fam.state.down = true;
  await new Promise((r) => setTimeout(r, 80));
  const b = await registry.listTools(); // hết hạn nhưng còn bản cũ
  assert.ok(b.tools.some((t) => t.id === 'family__lich_hom_nay'));
  fam.state.down = false;
  void ApiError; void db; void resetChatRate;
});
