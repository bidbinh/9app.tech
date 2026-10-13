// Kiểm tra giao diện thật bằng Chrome (puppeteer-core) với 9id THẬT + 9family THẬT sau "nginx" mô phỏng (một nguồn gốc, cổng ngẫu nhiên >= 17000):
// đăng nhập/đăng ký ở 9id rồi quay lại 9family, tạo gia đình, thêm con, mời người, lời mời, chuyển gia đình, vai con, phiên hết hạn, nhập gia đình cũ.
// Chạy: node scripts/e2e-id.js     (cần thư mục ../9id, Chrome và puppeteer-core). Ảnh: shots/migration/. Màn hình 390x844 và máy tính 1280x800.
// Dữ liệu mẫu đều BỊA.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { boot, signup, Browser } from '../test/integration/harness.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots', 'migration');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

const sys = await boot({ legacy: true, cacheMs: 60_000 });
const ORIGIN = sys.ORIGIN;
const URL0 = `${ORIGIN}/9family/`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '9family-e2e-id-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`], defaultViewport: null });

const results = []; const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastPage = null;
const cleanup = async () => { try { await browser.close(); } catch { /* */ } try { await sys.stop(); } catch { /* */ } try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ } };
for (const sig of ['uncaughtException', 'unhandledRejection']) process.on(sig, async (err) => { console.error('LỖI KHÔNG BẮT ĐƯỢC:', err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : err); await cleanup(); process.exit(2); });

const MOBILE = { width: 390, height: 844 }; const DESKTOP = { width: 1280, height: 800 };
async function newPage(name, view = MOBILE) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...view, deviceScaleFactor: view.width < 700 ? 2 : 1, isMobile: view.width < 700, hasTouch: view.width < 700 });
  page.__name = name; page.__ctx = ctx;
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9]|410|423|503)/.test(m.text()) && !/favicon|icon\.(svg|png)/.test(m.text())) problems.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  return page;
}
async function find(page, text, scope = 'button, a, [role=radio], [role=tab]', exact = false) {
  lastPage = page;
  await page.bringToFront();
  let h = null;
  for (let tries = 0; tries < 24; tries++) {
    h = await page.evaluateHandle((text, scope, exact) => {
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll(scope)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const sheet = [...document.querySelectorAll('.sheet')].pop();
      const pool = sheet ? els.filter((e) => sheet.contains(e)) : els;
      const bars = els.filter((e) => e.closest('#cta, #tabs, #bar'));
      return [...pool, ...bars.filter((e) => !pool.includes(e) && !sheet)].find((e) => { const t = norm(e.textContent) || e.getAttribute('aria-label') || ''; return exact ? (t === text || e.getAttribute('aria-label') === text) : (t.includes(text) || (e.getAttribute('aria-label') || '').includes(text)); }) || null;
    }, text, scope, exact);
    if (h.asElement()) break;
    await sleep(250);
  }
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy "${text}" trên màn hình`);
  return el;
}
async function tap(page, text, o = {}) {
  const el = await find(page, text, o.scope, o.exact);
  await el.evaluate((e) => { if (!e.closest('#cta, .sheet, #tabs, #bar')) e.scrollIntoView({ block: 'center' }); });
  await sleep(200);
  await el.click();
  await sleep(o.wait ?? 300);
}
async function fieldEl(page, label) {
  await page.bringToFront();
  await page.waitForFunction((label) => { const sheet = [...document.querySelectorAll('.sheet')].pop(); return [...document.querySelectorAll('label')].some((l) => (!sheet || sheet.contains(l)) && l.textContent.trim().startsWith(label) && l.getBoundingClientRect().width > 0); }, { timeout: 8000 }, label).catch(() => {});
  const h = await page.evaluateHandle((label) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const sheet = [...document.querySelectorAll('.sheet')].pop();
    const labs = [...document.querySelectorAll('label')].filter((l) => !sheet || sheet.contains(l));
    const lab = labs.find((l) => norm(l.textContent).startsWith(label) && l.getBoundingClientRect().width > 0);
    return lab ? document.getElementById(lab.getAttribute('for')) : null;
  }, label);
  const el = h.asElement();
  if (!el) throw new Error(`[${page.__name}] không thấy ô "${label}"`);
  return el;
}
async function fill(page, label, value, o = {}) {
  const el = await fieldEl(page, label);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  if (o.select) { await el.select(value); return; }
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (value) await el.type(value, { delay: 0 });
  await sleep(380);
}
const text = (page) => page.evaluate(() => document.body.innerText);
async function waitText(page, t, timeout = 10000) {
  await page.bringToFront();
  try { await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t); } catch { throw new Error(`[${page.__name}] chờ không thấy chữ "${t}". URL ${page.url()}. Màn hình: ${(await text(page)).slice(0, 400).replace(/\n+/g, ' | ')}`); }
}
async function noText(page, t) { if ((await text(page)).includes(t)) throw new Error(`[${page.__name}] không được thấy "${t}"`); }
async function shot(page, name) { await sleep(200); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const goto = async (p, url) => { await p.goto(url, { waitUntil: 'networkidle0' }); };
const hashOf = (page) => page.evaluate(() => location.hash);
const api = (page, p, method = 'GET', body) => page.evaluate(async (p, method, body) => {
  const r = await fetch(new URL(p, document.baseURI), { method, headers: { 'X-Requested-With': '9family', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, p, method, body);
// kiểm tra màn hình 9family: không tràn ngang, vùng bấm >= 44px, chữ >= 14px
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const sheetOn = !!document.querySelector('.sheet');
    const out = { overflow: document.documentElement.scrollWidth > window.innerWidth, small: [], tiny: [] };
    for (const e of document.querySelectorAll('button, a.btn, a.tab, a.icon-btn, a.list-row, input, select, textarea')) {
      if (!vis(e) || (sheetOn && !e.closest('.sheet'))) continue;
      const r = e.getBoundingClientRect();
      if ((r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'INPUT' && e.type === 'checkbox')) out.small.push(`${e.tagName}.${e.className}:"${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const e of document.querySelectorAll('body *')) {
      if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !vis(e) || (sheetOn && !e.closest('.sheet'))) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 13.9) out.tiny.push(`${e.tagName}.${e.className} ${fs}px "${e.textContent.trim().slice(0, 20)}"`);
    }
    return out;
  });
  if (r.overflow) problems.push(`[${label}] TRÀN NGANG`);
  if (r.small.length) problems.push(`[${label}] vùng bấm < 44px: ${[...new Set(r.small)].slice(0, 5).join('; ')}`);
  if (r.tiny.length) problems.push(`[${label}] chữ < 14px: ${[...new Set(r.tiny)].slice(0, 4).join('; ')}`);
}
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); if (lastPage) await lastPage.screenshot({ path: path.join(SHOTS, 'fail-' + results.length + '.png') }).catch(() => {}); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const tab = async (p, name) => { await p.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(200); await tap(p, name, { scope: '#tabs a', wait: 600 }); };
// đăng nhập qua trang 9id (như người dùng thật) rồi quay lại đúng trang 9family nhờ ?next=
async function loginViaUi(p, user) {
  await fillById(p);
  async function fillById() {
    await waitText(p, 'Đăng nhập 9app');
    await fill(p, 'Số điện thoại', user.phone);
    await fill(p, 'Mật khẩu', user.password);
    await tap(p, 'Đăng nhập', { exact: true, scope: 'button', wait: 1200 });
  }
}
const sheetText = (p) => p.evaluate(() => [...document.querySelectorAll('.sheet')].pop()?.innerText || '');

const M = {}; // nhân vật
const call = (b, m, p, body) => b.fam(m, p, body);

console.log('--- 390x844: đăng nhập, gia đình, con, lời mời ---');
await step('chưa đăng nhập: màn chào có nút Đăng nhập / Đăng ký dẫn sang 9app; không tràn, không lỗi', async () => {
  M.me = await signup(sys, { name: 'Mẹ Bình Thử' });
  M.pMe = await newPage('Mẹ');
  await goto(M.pMe, URL0);
  await waitText(M.pMe, 'Chào mừng đến 9family');
  const t = await text(M.pMe);
  must(t.includes('Đăng nhập') && t.includes('Đăng ký tài khoản 9app'), 'thiếu nút đăng nhập/đăng ký');
  must(!t.includes('Tạo gia đình'), 'chưa đăng nhập thì chưa có biểu mẫu tạo gia đình');
  const hrefs = await M.pMe.$$eval('a[data-act]', (as) => as.map((a) => a.getAttribute('href')));
  must(hrefs.every((h) => h.startsWith('/id/?next=%2F9family%2F')), 'liên kết đăng nhập sai: ' + hrefs.join());
  must(hrefs.some((h) => h.endsWith('#/dang-nhap')) && hrefs.some((h) => h.endsWith('#/dang-ky')), 'thiếu dang-nhap/dang-ky');
  await audit(M.pMe, 'chao'); await shot(M.pMe, '01-chao-dang-nhap');
});

await step('bấm Đăng nhập -> trang 9app -> đăng nhập -> quay lại đúng 9family (next); chưa có gia đình thì có biểu mẫu tạo', async () => {
  await tap(M.pMe, 'Đăng nhập', { scope: 'a[data-act=login]', wait: 1200 });
  must(M.pMe.url().includes('/id/'), 'phải sang trang 9id: ' + M.pMe.url());
  await shot(M.pMe, '02-9id-dang-nhap');
  await loginViaUi(M.pMe, M.me);
  await M.pMe.waitForFunction(() => location.pathname.startsWith('/9family'), { timeout: 12000 });
  await waitText(M.pMe, 'Tạo gia đình');
  const ck = await M.pMe.cookies();
  const sid = ck.find((c) => c.name === 'nine_sid');
  must(sid && sid.httpOnly && sid.path === '/', 'cookie nine_sid phải HttpOnly, Path=/');
  must(!ck.some((c) => c.name === 'fsid'), 'không còn cookie fsid');
  await audit(M.pMe, 'chua-co-gia-dinh'); await shot(M.pMe, '03-chua-co-gia-dinh');
});

await step('tạo gia đình (tên có thể trùng) -> vào Hôm nay; gia đình có id của 9id', async () => {
  await fill(M.pMe, 'Tên gia đình', 'Nhà Cây Sồi 🌳');
  await fill(M.pMe, 'Bạn là', 'me', { select: true });
  await tap(M.pMe, 'Tạo gia đình', { exact: true, wait: 1500 });
  await waitText(M.pMe, 'Bắt đầu với gia đình mới');
  M.fid = (await hashOf(M.pMe)).split('/')[2];
  const row = (await sys.idDb.query('SELECT name FROM families WHERE id=$1', [M.fid]))[0];
  must(row && row.name === 'Nhà Cây Sồi 🌳', 'gia đình phải nằm ở 9id với đúng id');
  must((await sys.famDb.query('SELECT relation FROM members WHERE family_id=$1', [M.fid]))[0].relation === 'me', 'quan hệ trong nhà phải được lưu');
  await audit(M.pMe, 'today-moi'); await shot(M.pMe, '04-today-moi');
  // gia đình thứ hai cùng tên ở tài khoản khác không đụng nhau
  const other = await signup(sys, { name: 'Mẹ Khác' });
  await other.id('POST', '/families', { name: 'Nhà Cây Sồi 🌳' });
  must((await sys.idDb.query("SELECT count(*)::int n FROM families WHERE name='Nhà Cây Sồi 🌳'"))[0].n === 2, 'tên gia đình được trùng');
});

await step('tab Gia đình: Chuyển gia đình và Lời mời; thêm con (9id) với trường, lớp, ghi chú sức khỏe', async () => {
  await tab(M.pMe, 'Gia đình');
  await waitText(M.pMe, 'Chuyển gia đình');
  const t = await text(M.pMe);
  must(t.includes('Lời mời') && t.includes('Mời người thân vào gia đình'), 'thiếu hàng Lời mời');
  must(!/Tạo mã khôi phục|Thêm thiết bị|link mời/i.test(t), 'còn dấu vết của mã khôi phục/thiết bị/link mời cũ');
  await audit(M.pMe, 'family-tab'); await shot(M.pMe, '05-tab-gia-dinh');
  await tap(M.pMe, '+ Thêm con', { wait: 500 });
  await fill(M.pMe, 'Tên gọi', 'Bống 🎀'); await fill(M.pMe, 'Năm sinh', '2016'); await fill(M.pMe, 'Lớp', '5A'); await fill(M.pMe, 'Trường', 'Tiểu học Hoa Mai');
  await fill(M.pMe, 'Lưu ý đưa đón', 'Chờ ở cổng B'); await fill(M.pMe, 'Ghi chú sức khỏe', 'Dị ứng đậu phộng');
  await audit(M.pMe, 'them-con'); await shot(M.pMe, '06-them-con');
  await tap(M.pMe, 'Thêm con', { exact: true, wait: 1400 });
  await waitText(M.pMe, 'Trẻ em (1/8)'); await waitText(M.pMe, 'Bống 🎀');
  const t2 = await text(M.pMe);
  must(t2.includes('Lớp 5A') && t2.includes('Tiểu học Hoa Mai') && t2.includes('Sức khỏe: Dị ứng đậu phộng') && t2.includes('Lưu ý đón: Chờ ở cổng B'), 'thiếu thông tin con: ' + t2.slice(0, 300));
  const k = (await sys.idDb.query('SELECT id, name, birth_year, note FROM child_profiles WHERE family_id=$1', [M.fid]))[0];
  must(k.name === 'Bống 🎀' && k.birth_year === 2016 && k.note === 'Dị ứng đậu phộng', 'hồ sơ con phải nằm ở 9id');
  M.kid1 = k.id;
  const local = (await sys.famDb.query('SELECT school, grade, note FROM children WHERE id=$1', [M.kid1]))[0];
  must(local.school === 'Tiểu học Hoa Mai' && local.note === 'Chờ ở cổng B', 'phần mở rộng phải nằm ở 9family');
  must((await sys.famDb.query("SELECT count(*)::int n FROM children WHERE note LIKE '%đậu phộng%'"))[0].n === 0, 'ghi chú sức khỏe không được sao vào 9family');
  await shot(M.pMe, '07-co-con');
  // con thứ hai kèm số điện thoại để nối tài khoản của con (không bắt buộc)
  M.kidAcc = await signup(sys, { name: 'Tài khoản của Cún' });
  await tap(M.pMe, '+ Thêm con', { wait: 500 });
  await fill(M.pMe, 'Tên gọi', 'Cún'); await fill(M.pMe, 'Năm sinh', '2013'); await fill(M.pMe, 'Số điện thoại của con', M.kidAcc.phone);
  await tap(M.pMe, 'Thêm con', { exact: true, wait: 1400 });
  await waitText(M.pMe, 'Trẻ em (2/8)');
  M.kid2 = (await sys.idDb.query("SELECT id FROM child_profiles WHERE name='Cún' AND family_id=$1", [M.fid]))[0].id;
  must((await sys.idDb.query("SELECT count(*)::int n FROM invitations WHERE child_id=$1 AND status='pending'", [M.kid2]))[0].n === 1, '9id phải có lời mời nối tài khoản của con');
  must(!JSON.stringify(await sys.famDb.query('SELECT * FROM children')).includes(M.kidAcc.phone.replace(/^0/, '')), 'số điện thoại không vào 9family');
});

await step('mời người lớn bằng số điện thoại: người được mời thấy banner Lời mời ở 9family -> sang 9id chấp nhận; chủ duyệt; người đó vào gia đình', async () => {
  M.bo = await signup(sys, { name: 'Bố Tuấn Thử' });
  await tap(M.pMe, '+ Mời', { scope: 'button', wait: 500 });
  await fill(M.pMe, 'Số điện thoại', M.bo.phone); await fill(M.pMe, 'Ghi chú', 'Bố');
  await audit(M.pMe, 'moi-nguoi'); await shot(M.pMe, '08-moi-nguoi');
  await tap(M.pMe, 'Gửi lời mời', { exact: true, wait: 1200 });
  await waitText(M.pMe, 'Đã gửi lời mời').catch(() => {});
  M.pBo = await newPage('Bố');
  await goto(M.pBo, URL0);
  await tap(M.pBo, 'Đăng nhập', { scope: 'a[data-act=login]', wait: 1200 });
  await loginViaUi(M.pBo, M.bo);
  await M.pBo.waitForFunction(() => location.pathname.startsWith('/9family'), { timeout: 12000 });
  await waitText(M.pBo, 'Bạn có lời mời');
  await audit(M.pBo, 'banner-loi-moi'); await shot(M.pBo, '09-banner-loi-moi');
  await tap(M.pBo, 'Mở lời mời', { wait: 1500 });
  must(M.pBo.url().includes('/id/') && (await hashOf(M.pBo)) === '#/loi-moi', 'phải sang /id/#/loi-moi: ' + M.pBo.url());
  await waitText(M.pBo, 'Nhà Cây Sồi');
  await shot(M.pBo, '10-9id-loi-moi');
  await tap(M.pBo, 'Chấp nhận', { wait: 1500 });
  // chờ chủ duyệt: Bố chưa thấy dữ liệu gia đình
  must((await api(M.pBo, '/9family/api/families/' + M.fid)).status === 404, 'chưa duyệt thì chưa vào');
  // chủ thấy "chờ duyệt" ở tab Gia đình
  sys.famId.flushCaches();
  await M.pMe.reload({ waitUntil: 'networkidle0' });
  await tab(M.pMe, 'Gia đình');
  await waitText(M.pMe, 'chờ bạn duyệt');
  await shot(M.pMe, '11-cho-duyet');
  const wait = (await M.me.id('GET', '/families/' + M.fid)).json.invitations.find((i) => i.status === 'awaiting');
  must(wait, '9id phải có lời mời chờ duyệt');
  await M.me.id('POST', `/families/${M.fid}/invites/${wait.id}/approve`, {});
  sys.famId.flushCaches();
  await goto(M.pBo, URL0 + '#/f/' + M.fid + '/today');
  await waitText(M.pBo, 'Hôm nay');
  await tab(M.pBo, 'Gia đình');
  await waitText(M.pBo, 'Bố Tuấn Thử (bạn)');
  const tb = await text(M.pBo);
  must(!tb.includes('Sức khỏe: Dị ứng'), 'người mới vào chưa thấy ghi chú sức khỏe (quy định 9id)');
  must(!tb.includes('+ Thêm con') && !tb.includes('+ Mời'), 'thành viên thường không thấy nút quản trị');
  await audit(M.pBo, 'family-tab-bo'); await shot(M.pBo, '12-bo-tab-gia-dinh');
});

await step('người đón hộ (không tài khoản) vẫn ở 9family; chuyển gia đình: tạo gia đình thứ hai rồi chọn lại', async () => {
  await M.pMe.bringToFront(); await goto(M.pMe, URL0 + '#/f/' + M.fid + '/me');
  await waitText(M.pMe, 'Người đón hộ');
  await tap(M.pMe, '+ Thêm', { exact: true, scope: 'button', wait: 500 });
  await fill(M.pMe, 'Họ tên', 'Cô Hoa Hàng Xóm'); await fill(M.pMe, 'Số điện thoại', '0900000001'); await fill(M.pMe, 'Nhận dạng', 'Áo xanh');
  await tap(M.pMe, 'Thêm người đón hộ', { exact: true, wait: 900 });
  await waitText(M.pMe, 'Cô Hoa Hàng Xóm');
  await tap(M.pMe, 'Chuyển gia đình', { wait: 800 });
  await waitText(M.pMe, 'Gia đình của bạn');
  await shot(M.pMe, '13-chuyen-gia-dinh');
  await tap(M.pMe, 'Tạo gia đình khác', { wait: 800 });
  await fill(M.pMe, 'Tên gia đình', 'Nhà Ngoại'); await fill(M.pMe, 'Bạn là', 'me', { select: true });
  await tap(M.pMe, 'Tạo gia đình', { exact: true, wait: 1500 });
  await waitText(M.pMe, 'Hôm nay');
  const fid2 = (await hashOf(M.pMe)).split('/')[2];
  must(fid2 !== M.fid, 'phải là gia đình khác');
  await goto(M.pMe, URL0 + '#/pick');
  await waitText(M.pMe, 'Chọn gia đình');
  must((await text(M.pMe)).includes('Nhà Cây Sồi') && (await text(M.pMe)).includes('Nhà Ngoại'), 'danh sách phải có cả hai');
  await audit(M.pMe, 'pick'); await shot(M.pMe, '14-chon-gia-dinh');
  await tap(M.pMe, 'Nhà Cây Sồi', { scope: 'a.pick', wait: 1000 });
  await waitText(M.pMe, 'Hôm nay');
  must((await hashOf(M.pMe)).includes(M.fid), 'phải về đúng gia đình đã chọn');
});

await step('tài khoản của con: chỉ thấy lịch/hồ sơ của mình, không có nút thêm/mời, không thấy người đón hộ và ghi chú sức khỏe', async () => {
  // Cún (hồ sơ nối bằng số điện thoại) - con chấp nhận, chủ duyệt (qua API 9id)
  const inv = (await M.kidAcc.id('GET', '/invitations')).json.invitations[0];
  await M.kidAcc.id('POST', `/invitations/${inv.id}/accept`, {});
  const wait = (await M.me.id('GET', '/families/' + M.fid)).json.invitations.find((i) => i.status === 'awaiting');
  if (wait) await M.me.id('POST', `/families/${M.fid}/invites/${wait.id}/approve`, {});
  sys.famId.flushCaches();
  // lịch của cả hai con
  await call(M.me, 'POST', `/api/families/${M.fid}/resync`);
  await call(M.me, 'POST', `/api/families/${M.fid}/events`, { title: 'Học bơi của Cún', startDate: '2026-10-05', start: '15:00', childIds: [M.kid2] });
  await call(M.me, 'POST', `/api/families/${M.fid}/events`, { title: 'Học vẽ của Bống', startDate: '2026-10-05', start: '16:00', childIds: [M.kid1] });
  M.pKid = await newPage('Con');
  await goto(M.pKid, URL0);
  await tap(M.pKid, 'Đăng nhập', { scope: 'a[data-act=login]', wait: 1200 });
  await loginViaUi(M.pKid, M.kidAcc);
  await M.pKid.waitForFunction(() => location.pathname.startsWith('/9family'), { timeout: 12000 });
  await goto(M.pKid, URL0 + '#/f/' + M.fid + '/cal');
  await waitText(M.pKid, 'Lịch');
  const tc = await text(M.pKid);
  must(!tc.includes('Học vẽ của Bống'), 'con không thấy lịch của anh chị em');
  must(!(await M.pKid.$('#fab')), 'con không có nút + Thêm');
  await shot(M.pKid, '15-con-lich');
  await goto(M.pKid, URL0 + '#/f/' + M.fid + '/me');
  await waitText(M.pKid, 'Trẻ em (1)');
  const t = await text(M.pKid);
  const bad = ['Bống', 'Cô Hoa', '+ Thêm con', '+ Mời', 'Người đón hộ', 'Dị ứng'].filter((x) => t.includes(x));
  must(t.includes('Cún') && !bad.length, 'màn Gia đình của con lộ/thừa: ' + bad.join(' | ') + ' ::: ' + t.split('\n').join(' | ').slice(0, 400));
  await audit(M.pKid, 'family-tab-con'); await shot(M.pKid, '16-con-tab-gia-dinh');
  must((await api(M.pKid, 'api/families/' + M.fid + '/events', 'POST', { title: 'x', startDate: '2026-10-05', start: '10:00' })).status === 403, 'con không tạo được sự kiện');
});

await step('phiên hết hạn giữa chừng: thu hồi ở 9id -> 9family chuyển sang đăng nhập với ?next= đúng trang', async () => {
  // đăng xuất Bố ở 9id (xóa phiên), hết đệm 60 giây
  await M.pBo.bringToFront();
  await goto(M.pBo, URL0 + '#/f/' + M.fid + '/today');
  await waitText(M.pBo, 'Hôm nay');
  await M.bo.id('POST', '/logout', {}); // xóa cookie của Browser giả, chưa đụng trình duyệt thật
  await sys.idDb.query('DELETE FROM sessions WHERE user_id=$1', [M.bo.userId]);
  sys.famId.flushCaches();
  await M.pBo.evaluate(() => { location.hash = '#/f/' + location.hash.split('/')[2] + '/cal'; });
  await M.pBo.waitForFunction(() => location.pathname.startsWith('/id/'), { timeout: 12000 });
  const u = new URL(M.pBo.url());
  must(u.searchParams.get('next').startsWith('/9family/'), 'next phải quay về 9family: ' + M.pBo.url());
  must(u.hash === '#/dang-nhap', 'phải ở màn đăng nhập');
  await shot(M.pBo, '17-het-phien-sang-dang-nhap');
});

await step('nhập gia đình cũ (phiên ẩn danh): chế độ chỉ-đọc với banner; xuất mã; chủ nhận mã ở 9app; 9family tự nối chủ', async () => {
  const F9 = (sql, p) => sys.famDb.query(sql, p);
  const I = { fam: crypto.randomUUID(), me: crypto.randomUUID(), k: crypto.randomUUID() };
  await F9("INSERT INTO families(id, name, created_by_hash) VALUES($1,'Nhà Cũ Thử','h')", [I.fam]);
  await F9("INSERT INTO members(id, family_id, name, relation, role, joined_at, ics_token) VALUES($1,$2,'Mẹ Cũ','me','chu',now(),'ics-x')", [I.me, I.fam]);
  await F9("INSERT INTO children(id, family_id, name, birth_year, school, color) VALUES($1,$2,'Bé Cũ',2017,'Trường Cũ','xanh')", [I.k, I.fam]);
  await F9("INSERT INTO events(family_id, title, start_date, start_time, created_by) VALUES($1,'Họp phụ huynh cũ','2026-10-20','19:00',$2)", [I.fam, I.me]);
  const tok = crypto.randomBytes(32).toString('base64url');
  await F9("INSERT INTO sessions(token_hash, member_id, label) VALUES($1,$2,'Android')", [crypto.createHash('sha256').update(tok).digest('hex'), I.me]);
  const p = await newPage('Chủ cũ');
  await p.setCookie({ name: 'fsid', value: tok, url: ORIGIN });
  await goto(p, URL0);
  await waitText(p, 'Gia đình đang chuyển sang tài khoản 9app');
  await audit(p, 'legacy'); await shot(p, '18-gia-dinh-cu-chi-doc');
  await tap(p, 'Nhà Cũ Thử', { scope: 'a.pick', wait: 1000 });
  await waitText(p, 'Nhà Cũ Thử');
  must((await api(p, 'api/families/' + I.fam + '/tasks', 'POST', { title: 'x' })).status === 423, 'ghi phải bị khóa');
  const lines = [];
  const res = await sys.famExport.exportFamilies({ family: I.fam, out: (l) => lines.push(l) });
  must(res[0].claimCode, 'phải có mã nhận');
  const owner = await signup(sys, { name: 'Mẹ Cũ Đã Đăng Ký' });
  const pOwner = await newPage('Chủ nhận mã');
  await goto(pOwner, URL0);
  await tap(pOwner, 'Đăng nhập', { scope: 'a[data-act=login]', wait: 1200 });
  await loginViaUi(pOwner, owner);
  await pOwner.waitForFunction(() => location.pathname.startsWith('/9family'), { timeout: 12000 });
  await waitText(pOwner, 'Tạo gia đình');
  // nhập mã ở 9id (cùng nguồn gốc)
  const r = await pOwner.evaluate(async (code) => (await fetch('/id/api/claims/redeem', { method: 'POST', headers: { 'X-Requested-With': '9id', 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })).status, res[0].claimCode);
  must(r === 200, 'nhập mã thất bại ' + r);
  await goto(pOwner, URL0);
  await waitText(pOwner, 'Hôm nay');
  must((await hashOf(pOwner)).includes(I.fam), 'chủ phải vào thẳng gia đình đã nhận');
  must((await F9('SELECT user_id FROM members WHERE id=$1', [I.me]))[0].user_id === owner.userId, 'thành viên chu cũ phải được nối');
  await tab(pOwner, 'Gia đình');
  await waitText(pOwner, 'Bé Cũ');
  must((await text(pOwner)).includes('Trường Cũ'), 'phần mở rộng của con phải còn');
  await shot(pOwner, '19-chu-da-nhan-gia-dinh');
  must(!lines.join('\n').includes('undefined'), 'lệnh xuất in sai');
  await p.__ctx.close(); await pOwner.__ctx.close();
});

console.log('--- máy tính 1280x800 ---');
await step('máy tính: màn chào, chọn gia đình, tab Gia đình hiển thị gọn, không tràn', async () => {
  const anon = await newPage('Máy tính (chưa đăng nhập)', DESKTOP);
  await goto(anon, URL0);
  await waitText(anon, 'Chào mừng đến 9family');
  await audit(anon, 'desktop-chao'); await shot(anon, 'd01-chao');
  await anon.__ctx.close();
  const d = await newPage('Máy tính', DESKTOP);
  await goto(d, URL0);
  await tap(d, 'Đăng nhập', { scope: 'a[data-act=login]', wait: 1200 });
  await loginViaUi(d, M.me);
  await d.waitForFunction(() => location.pathname.startsWith('/9family'), { timeout: 12000 });
  await waitText(d, 'Chọn gia đình');
  await audit(d, 'desktop-pick'); await shot(d, 'd02-chon-gia-dinh');
  await tap(d, 'Nhà Cây Sồi', { scope: 'a.pick', wait: 1000 });
  await tab(d, 'Gia đình');
  await waitText(d, 'Chuyển gia đình');
  await audit(d, 'desktop-family'); await shot(d, 'd03-tab-gia-dinh');
  await tap(d, '+ Mời', { scope: 'button', wait: 500 });
  await audit(d, 'desktop-moi'); await shot(d, 'd04-moi-nguoi');
  await d.__ctx.close();
});

// ---- tổng kết ----
console.log('\n--- kết quả ---');
const okN = results.filter((r) => r.ok).length;
console.log(`${okN}/${results.length} bước đạt`);
if (problems.length) { console.log('\nVấn đề phát hiện:'); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); }
await cleanup();
process.exit(okN === results.length && !problems.length ? 0 : 1);
