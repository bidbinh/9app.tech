import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePhone, safeNext, normIp, cleanText, deviceLabel } from '../src/util.js';
import * as pw from '../src/password.js';
import { productionProblems, parseKeys, config } from '../src/config.js';
import { can, canMap } from '../src/families.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('chuẩn hóa số điện thoại: mọi cách viết cho cùng một số E.164', () => {
  for (const s of ['0912345678', '+84912345678', '84912345678', '0084912345678', '0912 345 678', '0912.345.678', '(0912) 345-678', ' +84 912 345 678 ', '０９１２３４５６７８']) {
    assert.equal(normalizePhone(s), '+84912345678', s);
  }
  assert.equal(normalizePhone('0356789012'), '+84356789012');
});

test('số điện thoại không hợp lệ bị từ chối', () => {
  for (const s of ['', '123', '0212345678', '091234567', '09123456789', '+1 202 555 0100', 'abcdefghij', '0912345678a', '0612345678', '+840912345678', null, undefined, 912345678, {}, '0'.repeat(50)]) {
    assert.throws(() => normalizePhone(s), (e) => e.status === 400 && e.code === 'invalid_phone', String(s));
  }
});

test('next chỉ nhận đường dẫn cùng nguồn gốc (chống open redirect)', () => {
  const good = ['/', '/tutor/', '/9family/#/lich', '/id/#/loi-moi', '/tutor/?a=1&b=2', '/a/b/c', '/%E2%9C%93'];
  for (const s of good) assert.equal(safeNext(s), s, s);
  const bad = ['//evil.com', '//evil.com/x', '/\\evil.com', '\\\\evil.com', 'http://evil.com', 'https://evil.com/', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)',
    'data:text/html,x', '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\u0000/evil.com', '///evil.com', '', ' /ok', 'evil.com', 'ftp://x', '/a\\b',
    '/%2f%2fevil.com', '/%5cevil.com', '/‮/x', '/ x', 'x', '/' + 'a'.repeat(600), null, undefined, 5, {}, ['/x'], '/%', '/%E0%A4%A'];
  for (const s of bad) assert.equal(safeNext(s), null, JSON.stringify(s));
});

test('mật khẩu: định dạng pbkdf2$200000$muối$hash, tương thích 9Ship/9Sport hai chiều', async () => {
  const h = await pw.hash('MatKhau-Tot-1');
  const p = h.split('$');
  assert.equal(p.length, 4); assert.equal(p[0], 'pbkdf2'); assert.equal(p[1], '200000'); assert.equal(p[3].length, 64);
  assert.ok(await pw.verify('MatKhau-Tot-1', h));
  assert.ok(!(await pw.verify('sai', h)));
  const shipFile = path.join(here, '..', '..', '9ship', 'src', 'password.js');
  if (fs.existsSync(shipFile)) {
    const ship = await import('file:///' + shipFile.replace(/\\/g, '/'));
    assert.ok(await ship.verify('MatKhau-Tot-1', h), '9Ship đọc được hash của 9id');
    assert.ok(await pw.verify('abc123', await ship.hash('abc123')), '9id đọc được hash của 9Ship');
  }
});

test('mật khẩu mới tối thiểu 8 ký tự; mật khẩu yếu, trùng số điện thoại bị từ chối', () => {
  assert.throws(() => pw.check('abc1234', ''), (e) => e.code === 'weak_password');
  assert.throws(() => pw.check('12345678', ''), (e) => e.code === 'weak_password');
  assert.throws(() => pw.check('aaaaaaaaaa', ''), (e) => e.code === 'weak_password');
  assert.throws(() => pw.check('0912345678', '+84912345678'), (e) => e.code === 'weak_password');
  assert.throws(() => pw.check('x'.repeat(101), ''), (e) => e.code === 'weak_password');
  assert.throws(() => pw.check(12345678, ''), (e) => e.code === 'weak_password');
  assert.equal(pw.check('Mật khẩu dài ổn', ''), 'Mật khẩu dài ổn');
  assert.ok(pw.isWeakLegacy('abc123') && !pw.isWeakLegacy('abcd1234'));
});

test('IPv6 gom /64, IPv4 giữ nguyên, ::ffff: được bóc', () => {
  assert.equal(normIp('1.2.3.4'), '1.2.3.4');
  assert.equal(normIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), normIp('2001:db8:1:2::1'));
  assert.notEqual(normIp('2001:db8:1:2::1'), normIp('2001:db8:1:3::1'));
});

test('cleanText: NFC, bỏ ký tự đảo chiều/điều khiển, giới hạn độ dài', () => {
  assert.equal(cleanText('Nguyễn', { max: 20 }), 'Nguyễn');
  assert.equal(cleanText('a‮b\u0000c', { max: 20 }), 'a b c');
  assert.throws(() => cleanText('', { min: 1, max: 5 }));
  assert.throws(() => cleanText('123456', { max: 5 }));
  assert.throws(() => cleanText(5, { max: 5 }));
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537'), 'Chrome trên Android');
});

test('productionProblems: từ chối cấu hình mẫu, thiếu cổng OTP, khóa ngắn', () => {
  const good = {
    production: true, databaseUrlFromEnv: true, databaseUrl: 'postgres://id:s3cretRealPw@9ship-db:5432/id', phonePepper: 'k8Q2xv7Lw9Zr4Tn1Bm6Yc3Hd5Fs0Ja8Pe2Uo', phonePepperFromEnv: true,
    otpProvider: 'esms', esmsApiKey: 'k', esmsSecret: 's', esmsBrandname: 'B', esmsZaloOa: '', esmsZaloTemp: '', internalKeys: parseKeys('family:abcdefghijklmnopqrstuvwxyz0123456789ABC'), consoleApiKeyId: '', consoleApiSecret: '', trustedProxyHops: 1, edgeSecret: 'Zq8Lm2Xv5Rt9Bn4Kc7Wd1Hj6Ps3Fy0Ae', phonePepperOld: '', esmsZaloData: '{"otp":"{ma}"}',
  };
  assert.deepEqual(productionProblems(good), []);
  assert.deepEqual(productionProblems({ ...good, production: false, otpProvider: 'mock' }), []);
  const has = (o, re) => productionProblems({ ...good, ...o }).some((x) => re.test(x));
  assert.ok(has({ databaseUrl: 'postgres://id:MAT_KHAU@9ship-db:5432/id' }, /MAT_KHAU/));
  assert.ok(has({ databaseUrlFromEnv: false }, /DATABASE_URL/));
  assert.ok(has({ phonePepperFromEnv: false }, /PHONE_PEPPER/));
  assert.ok(has({ phonePepper: 'ngan' }, /PHONE_PEPPER/));
  assert.ok(has({ phonePepper: 'DOI_CHUOI_NAY_THANH_BI_MAT_DAI_NGAU_NHIEN_123' }, /PHONE_PEPPER/));
  assert.ok(has({ otpProvider: 'mock' }, /OTP_PROVIDER/));
  assert.ok(has({ otpProvider: 'console' }, /OTP_PROVIDER/));
  assert.ok(has({ esmsApiKey: '' }, /ESMS/));
  assert.ok(has({ internalKeys: parseKeys('family:ngan') }, /INTERNAL_KEYS/));
  assert.ok(has({ internalKeys: parseKeys('family:DOI_CHUOI_NAY_0123456789012345678901234567') }, /INTERNAL_KEYS/));
  assert.ok(has({ consoleApiKeyId: 'hub', consoleApiSecret: '' }, /CONSOLE/));
  assert.ok(has({ consoleApiKeyId: 'hub', consoleApiSecret: 'ngan' }, /CONSOLE_API_SECRET/));
  assert.ok(has({ trustedProxyHops: 0 }, /TRUSTED_PROXY_HOPS/));
  assert.ok(has({ edgeSecret: '' }, /EDGE_SECRET/));
  assert.ok(has({ edgeSecret: 'ab'.repeat(20) }, /EDGE_SECRET/));
  assert.ok(has({ phonePepper: 'a'.repeat(40) }, /PHONE_PEPPER/), 'pepper lặp ký tự bị từ chối');
  assert.ok(has({ phonePepper: 'abcabcabcabcabcabcabcabcabcabcabcabc' }, /PHONE_PEPPER/));
  assert.ok(has({ phonePepperOld: 'ngan' }, /PHONE_PEPPER_OLD/));
  assert.ok(has({ esmsZaloOa: 'OA', esmsZaloTemp: 'T', esmsZaloData: 'khong-phai-json' }, /ESMS_ZALO_DATA/));
  assert.deepEqual(productionProblems({ ...good, phonePepper: 'b3c5e7a9d1f2468ace0bdf13579ace2468bdf0a1357c9e2b4d6f80a1c3e5' }), []);
  // cấu hình thật của tiến trình thử nghiệm không phải production
  assert.deepEqual(productionProblems(config), []);
});

test('ma trận quyền', () => {
  assert.ok(can('chu', 'delete') && !can('quan_ly', 'delete') && !can('con', 'invite'));
  assert.ok(can('quan_ly', 'invite') && !can('quan_ly', 'inviteManager') && !can('thanh_vien', 'editChildren'));
  assert.ok(!canMap('con').rename && canMap('chu').transfer && canMap('con').leave && !canMap('chu').leave);
});

test('băm mật khẩu có giới hạn chạy đồng thời: quá hàng đợi thì 503 nhanh, xong rồi lại chạy bình thường', async () => {
  const h = await pw.hash('MatKhau-Tot-1');
  const old = { ...pw.limits };
  pw.limits.max = 1; pw.limits.maxQueue = 2;
  try {
    const rs = await Promise.allSettled(Array.from({ length: 6 }, () => pw.verify('MatKhau-Tot-1', h)));
    const okN = rs.filter((r) => r.status === 'fulfilled' && r.value === true).length;
    const busy = rs.filter((r) => r.status === 'rejected' && r.reason.status === 503 && r.reason.code === 'busy').length;
    assert.equal(okN, 3, 'một đang chạy + hai chờ'); assert.equal(busy, 3);
  } finally { Object.assign(pw.limits, old); }
  assert.ok(await pw.verify('MatKhau-Tot-1', h));
});
