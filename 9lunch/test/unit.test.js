// Kiểm thử đơn vị các hàm thuần: chia tiền, bù trừ nợ, quán gần đây, VietQR, trạng thái bữa, phiếu đặt, đổi người ứng tiền
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMeal } from '../src/split.js';
import { pairDebts, netBalances, settle } from '../src/debts.js';
import { recentKeys, pickRandom, suggestPayer } from '../src/venues.js';
import { crc16, vietQrPayload, transferContent } from '../src/transfer.js';
import { canTransition, STATUSES } from '../src/machine.js';
import { buildSlip, reminderText } from '../src/slip.js';
import { planPayerChange } from '../src/payee.js';
import { cleanText, cleanBank, cleanUrl, normKey, addDays, todayVN, randomCode, INVITE_RE } from '../src/util.js';

// bộ sinh ngẫu nhiên có hạt giống để ca lỗi tái hiện được
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

function randomCase(r) {
  const n = ri(r, 1, 12);
  const items = [];
  for (let m = 0; m < n; m++) {
    if (r() < 0.15) continue;
    const rows = ri(r, 1, 4);
    for (let k = 0; k < rows; k++) items.push({ memberId: 'm' + String(m).padStart(2, '0'), price: ri(r, 0, 3) === 0 ? 0 : ri(r, 1, 300) * 1000 + ri(r, 0, 9) * 100, qty: ri(r, 1, 5) });
  }
  const fees = { ship: ri(r, 0, 60) * 1000 + ri(r, 0, 999), service: r() < 0.5 ? 0 : ri(r, 0, 20000), tip: r() < 0.6 ? 0 : ri(r, 0, 30000), discount: r() < 0.5 ? 0 : ri(r, 0, 80000) };
  return { items, fees, mode: r() < 0.5 ? 'ty_le' : 'chia_deu' };
}

test('chia tiền: 2000 ca ngẫu nhiên, tổng các phần luôn bằng tổng, không âm, xác định', () => {
  const r = prng(20261004);
  for (let i = 0; i < 2000; i++) {
    const c = randomCase(r);
    const out = splitMeal(c);
    const food = c.items.reduce((s, it) => s + it.price * it.qty, 0);
    const gross = c.fees.ship + c.fees.service + c.fees.tip;
    const disc = Math.min(c.fees.discount, food + gross);
    assert.equal(out.total, food + gross - disc, `ca ${i}`);
    if (!c.items.length) { assert.equal(out.shares.length, 0); continue; }
    assert.equal(out.sum, out.total, `ca ${i}: tổng phần != tổng`);
    assert.equal(out.shares.reduce((s, x) => s + x.amount, 0), out.total);
    for (const s of out.shares) { assert.ok(Number.isSafeInteger(s.amount) && s.amount >= 0, `ca ${i}: phần âm ${s.amount}`); }
    // xác định: chạy lại, và đảo thứ tự dòng món cho cùng kết quả
    assert.deepEqual(splitMeal(c), out);
    assert.deepEqual(splitMeal({ ...c, items: [...c.items].reverse() }), out);
  }
});

test('chia tiền: theo tỷ lệ, phần dư dồn cho người nhiều tiền món nhất', () => {
  // món 10k/20k/30k, phí 10k => 10000/60000 mỗi đồng... kiểm tra số cụ thể
  const out = splitMeal({ items: [{ memberId: 'a', price: 10000, qty: 1 }, { memberId: 'b', price: 20000, qty: 1 }, { memberId: 'c', price: 30000, qty: 1 }], fees: { ship: 10000 } });
  assert.deepEqual(out.shares.map((s) => s.amount), [11666, 23333, 35001]); // dư 1 đồng về c (nhiều món nhất)
  assert.equal(out.sum, 70000);
  // bằng nhau thì id nhỏ nhận
  const eq = splitMeal({ items: [{ memberId: 'b', price: 10000, qty: 1 }, { memberId: 'a', price: 10000, qty: 1 }, { memberId: 'c', price: 10000, qty: 1 }], fees: { ship: 10000 } });
  assert.deepEqual(eq.shares.map((s) => [s.memberId, s.amount]), [['a', 13334], ['b', 13333], ['c', 13333]]);
});

test('chia tiền: chia đều, phí âm (giảm giá) và giảm giá vượt tổng', () => {
  const even = splitMeal({ mode: 'chia_deu', items: [{ memberId: 'a', price: 100000, qty: 1 }, { memberId: 'b', price: 20000, qty: 1 }, { memberId: 'c', price: 10000, qty: 1 }], fees: { ship: 10000 } });
  assert.deepEqual(even.shares.map((s) => s.amount), [46668, 46666, 46666]); // dư 2 đồng về người nhiều món nhất
  assert.equal(even.sum, 140000);
  const disc = splitMeal({ items: [{ memberId: 'a', price: 50000, qty: 1 }, { memberId: 'b', price: 50000, qty: 1 }], fees: { ship: 20000, discount: 30000 } });
  assert.equal(disc.total, 90000);
  assert.deepEqual(disc.shares.map((s) => s.amount), [45000, 45000]);
  const huge = splitMeal({ items: [{ memberId: 'a', price: 50000, qty: 1 }], fees: { ship: 10000, discount: 999999 } });
  assert.equal(huge.total, 0);
  assert.equal(huge.discountApplied, 60000);
  assert.deepEqual(huge.shares.map((s) => s.amount), [0]);
});

test('chia tiền: làm tròn lên bội 500 chỉ cho người khác người ứng tiền; phần chênh gom vào surplus', () => {
  const r = prng(77);
  for (let i = 0; i < 500; i++) {
    const c = { ...randomCase(r), round500: true, payerId: 'm00' };
    const base = splitMeal({ ...c, round500: false });
    const out = splitMeal(c);
    if (!out.shares.length) continue;
    assert.equal(out.total, base.total);
    let surplus = 0;
    out.shares.forEach((s, k) => {
      const b = base.shares[k];
      if (s.memberId === 'm00') assert.equal(s.amount, b.amount);
      else { assert.equal(s.amount % 500, 0); assert.ok(s.amount >= b.amount && s.amount - b.amount < 500); surplus += s.amount - b.amount; }
    });
    assert.equal(out.surplus, surplus);
    assert.equal(out.sum, out.total + out.surplus);
  }
});

test('chia tiền: số lớn không mất chính xác (BigInt)', () => {
  const items = [];
  for (let m = 0; m < 100; m++) items.push({ memberId: 'm' + String(m).padStart(3, '0'), price: 10_000_000, qty: 99 });
  const out = splitMeal({ items, fees: { ship: 100_000_000, service: 100_000_000, tip: 100_000_000 } });
  assert.equal(out.sum, out.total);
});

test('bù trừ nợ: tổng ròng bằng 0, ghép khớp, ít lần chuyển', () => {
  const r = prng(5);
  for (let i = 0; i < 500; i++) {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, ri(r, 2, 6));
    const rows = [];
    for (let k = 0; k < ri(r, 0, 15); k++) {
      const from = ids[ri(r, 0, ids.length - 1)]; const to = ids[ri(r, 0, ids.length - 1)];
      rows.push({ from, to, amount: ri(r, 1, 200) * 1000 });
    }
    const bal = netBalances(rows);
    assert.equal([...bal.values()].reduce((s, v) => s + v, 0), 0);
    const sug = settle(rows);
    // áp dụng gợi ý lên số dư thì mọi người về 0
    const after = new Map(bal);
    for (const t of sug) { assert.ok(t.amount > 0 && t.from !== t.to); after.set(t.from, (after.get(t.from) || 0) + t.amount); after.set(t.to, (after.get(t.to) || 0) - t.amount); }
    for (const v of after.values()) assert.equal(v, 0);
    const nonzero = [...bal.values()].filter((v) => v !== 0).length;
    assert.ok(sug.length <= Math.max(0, nonzero - 1));
    // theo cặp: bù hai chiều
    const pd = pairDebts(rows);
    const pairBal = new Map();
    for (const p of pd) { pairBal.set(p.from, (pairBal.get(p.from) || 0) - p.amount); pairBal.set(p.to, (pairBal.get(p.to) || 0) + p.amount); }
    for (const [k, v] of bal) assert.equal(pairBal.get(k) || 0, v);
  }
});

test('bù trừ nợ: A ứng bữa 1, B ứng bữa 2, C ứng bữa 3', () => {
  // bữa 1 (A ứng): B nợ A 50, C nợ A 30; bữa 2 (B ứng): A nợ B 20, C nợ B 40; bữa 3 (C ứng): A nợ C 10, B nợ C 25
  const rows = [
    { from: 'B', to: 'A', amount: 50 }, { from: 'C', to: 'A', amount: 30 },
    { from: 'A', to: 'B', amount: 20 }, { from: 'C', to: 'B', amount: 40 },
    { from: 'A', to: 'C', amount: 10 }, { from: 'B', to: 'C', amount: 25 },
  ];
  assert.deepEqual(pairDebts(rows), [{ from: 'B', to: 'A', amount: 30 }, { from: 'C', to: 'A', amount: 20 }, { from: 'C', to: 'B', amount: 15 }]);
  // số dư: A +40, B -5... tính: A nhận 80, trả 30 => +50; B nhận 60, trả 75 => -15; C nhận 35, trả 70 => -35
  assert.deepEqual([...netBalances(rows)].sort(), [['A', 50], ['B', -15], ['C', -35]]);
  assert.deepEqual(settle(rows), [{ from: 'C', to: 'A', amount: 35 }, { from: 'B', to: 'A', amount: 15 }]);
});

test('quán đã ăn trong 3 ngày gần nhất bị loại; bốc ngẫu nhiên xác định theo rand', () => {
  const today = '2026-10-04';
  const rk = recentKeys([{ name: 'Phở Thìn', day: '2026-10-04' }, { name: 'Cơm Tấm', day: '2026-10-01' }, { name: 'Bún Chả', day: '2026-09-30' }], today);
  assert.ok(rk.has('pho thin') && rk.has('com tam') && !rk.has('bun cha'));
  const pool = [{ name: 'Phở Thìn' }, { name: 'Cơm Tấm' }, { name: 'Bún Chả' }, { name: 'Bún chả' }, { name: 'Lẩu' }];
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(pickRandom(pool, { excludeKeys: rk, rand: () => i / 40 }).name);
  assert.deepEqual([...seen].sort(), ['Bún Chả', 'Lẩu']);
  assert.equal(pickRandom([{ name: 'Phở Thìn' }], { excludeKeys: rk }), null);
});

test('gợi ý người ứng tiền: ít lần, ít tiền, có tài khoản, có lý do', () => {
  const cands = [{ id: 'a', joinedAt: '1', hasBank: true }, { id: 'b', joinedAt: '2', hasBank: true }, { id: 'c', joinedAt: '3', hasBank: true }, { id: 'd', joinedAt: '4', hasBank: false }];
  const adv = [{ memberId: 'a', day: '2026-10-01', amount: 100000 }, { memberId: 'a', day: '2026-09-28', amount: 100000 }, { memberId: 'b', day: '2026-10-02', amount: 90000 }];
  const s = suggestPayer(cands, adv, '2026-10-04');
  assert.equal(s.id, 'c');
  assert.match(s.reason, /Chưa ứng lần nào/);
  const s2 = suggestPayer(cands.filter((c) => c.id !== 'c'), adv, '2026-10-04');
  assert.equal(s2.id, 'b'); assert.match(s2.reason, /1 lần/);
  assert.equal(suggestPayer([{ id: 'd', joinedAt: '4', hasBank: false }, { id: 'a', joinedAt: '1', hasBank: true }], [], '2026-10-04').id, 'a');
  assert.equal(suggestPayer([], [], '2026-10-04'), null);
  // ứng quá 30 ngày trước không tính
  assert.equal(suggestPayer([{ id: 'a', joinedAt: '1', hasBank: true }, { id: 'b', joinedAt: '2', hasBank: true }], [{ memberId: 'a', day: '2026-08-01', amount: 1 }], '2026-10-04').id, 'b'); // b chưa từng ứng nên đến trước
});

test('VietQR: CRC16, cấu trúc TLV và nội dung chuyển khoản', () => {
  assert.equal(crc16('123456789'), '29B1');
  const payload = vietQrPayload({ bin: '970436', account: '0011004012345', amount: 45000, content: '9LK7P2Q03' });
  assert.equal(crc16(payload.slice(0, -4)), payload.slice(-4));
  assert.match(payload, /^000201010212/);
  assert.ok(payload.includes('5405' + '45000'));
  assert.ok(payload.includes('0010A000000727'));
  assert.ok(payload.includes('970436') && payload.includes('0011004012345'));
  assert.ok(payload.includes('0809' + '9LK7P2Q03'));
  // phân tích TLV phải khớp độ dài từng trường
  let i = 0; const tags = {};
  while (i < payload.length) { const tag = payload.slice(i, i + 2); const len = Number(payload.slice(i + 2, i + 4)); tags[tag] = payload.slice(i + 4, i + 4 + len); i += 4 + len; }
  assert.equal(i, payload.length);
  assert.equal(tags['54'], '45000'); assert.equal(tags['53'], '704'); assert.equal(tags['58'], 'VN');
  assert.equal(transferContent({ mealCode: 'k7p2q', seq: 3 }), '9LK7P2Q03');
  assert.equal(transferContent({ mealCode: 'ĐẠT12', seq: 12, prefix: '9N' }), '9NDAT1212');
  assert.ok(transferContent({ mealCode: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', seq: 100 }).length <= 25);
  assert.match(transferContent({ mealCode: 'ABC12', seq: 7 }), /^[A-Z0-9]+$/);
});

test('trạng thái bữa: chỉ các bước hợp lệ', () => {
  const ok = [['binh_chon', 'dat_mon'], ['binh_chon', 'huy'], ['dat_mon', 'thanh_toan'], ['dat_mon', 'binh_chon'], ['dat_mon', 'huy'], ['thanh_toan', 'xong'], ['thanh_toan', 'dat_mon']];
  for (const a of STATUSES) for (const b of STATUSES) {
    const want = ok.some(([x, y]) => x === a && y === b);
    assert.equal(canTransition(a, b), want, `${a} -> ${b}`);
  }
});

test('phiếu đặt: gộp theo món và giá, gộp ghi chú; tin nhắn nhắc lịch sự', () => {
  const s = buildSlip([
    { name: 'Cơm sườn', price: 45000, qty: 1, note: 'ít cay' }, { name: 'cơm Sườn', price: 45000, qty: 2, note: '' },
    { name: 'Cơm sườn', price: 45000, qty: 1, note: 'ít cay' }, { name: 'Canh', price: 15000, qty: 1, note: '' },
  ], { venue: 'Cơm Ba', day: '2026-10-04' });
  assert.equal(s.lines.length, 2);
  const com = s.lines.find((l) => l.name.toLowerCase().startsWith('cơm'));
  assert.equal(com.qty, 4);
  assert.deepEqual(com.notes, [{ note: 'ít cay', qty: 2 }]);
  assert.equal(s.dishes, 5);
  assert.equal(s.sum, 195000);
  assert.match(s.text, /Quán: Cơm Ba/); assert.match(s.text, /4 x Cơm sườn \(2 ít cay\)/); assert.match(s.text, /04\/10\/2026/);
  const t = reminderText({ name: 'An', amount: 52000, payerName: 'Bình', venue: 'Cơm Ba', day: '2026-10-04' });
  assert.match(t, /52\.000đ/); assert.match(t, /cảm ơn/);
});

test('đổi người ứng tiền: kế hoạch cho từng loại khoản', () => {
  const ch = [
    { id: 'self1', memberId: 'P1', payeeId: 'P1', status: 'da_nhan', amount: 40000 },
    { id: 'p2', memberId: 'P2', payeeId: 'P1', status: 'chua_tra', amount: 30000 },
    { id: 'x', memberId: 'X', payeeId: 'P1', status: 'chua_tra', amount: 20000 },
    { id: 'y', memberId: 'Y', payeeId: 'P1', status: 'da_chuyen', amount: 10000 },
    { id: 'z', memberId: 'Z', payeeId: 'P1', status: 'da_nhan', amount: 10000 },
    { id: 'w', memberId: 'W', payeeId: 'OLD', status: 'chua_tra', amount: 5000 },
  ];
  const plan = Object.fromEntries(planPayerChange(ch, 'P1', 'P2').map((p) => [p.id, p.action]));
  assert.deepEqual(plan, { self1: 'owe_new', p2: 'self', x: 'retarget', y: 'keep', z: 'keep', w: 'keep' });
  assert.ok(planPayerChange(ch, 'P1', 'P1').every((p) => p.action === 'keep'));
  assert.equal(planPayerChange([{ id: 's', memberId: 'P1', payeeId: 'P1', status: 'da_nhan', amount: 0 }], 'P1', 'P2')[0].action, 'keep');
});

test('đầu vào: làm sạch văn bản, ngân hàng, liên kết, mã mời', () => {
  assert.equal(cleanText('  An   \u0000 Bình\n ', { max: 20 }), 'An Bình');
  assert.equal(cleanText('Cơm 🍚 ngon', { max: 20 }), 'Cơm 🍚 ngon');
  assert.throws(() => cleanText('x'.repeat(61), { max: 60 }));
  assert.throws(() => cleanText('', { min: 1, max: 10, field: 'Tên' }), /không được để trống/);
  assert.deepEqual(cleanBank({ bin: '970436', account: '0011 0040-12345', holder: ' Nguyen A ' }), { bin: '970436', account: '0011004012345', holder: 'Nguyen A' });
  assert.deepEqual(cleanBank({ bin: '', account: '', holder: '' }), { bin: null, account: null, holder: null });
  assert.throws(() => cleanBank({ bin: '970436', account: '12', holder: 'A' }));
  assert.throws(() => cleanBank({ bin: '12', account: '123456', holder: 'A' }));
  assert.equal(cleanUrl('https://a.vn/x?y=1'), 'https://a.vn/x?y=1');
  assert.throws(() => cleanUrl('javascript:alert(1)'));
  assert.throws(() => cleanUrl('data:text/html,<script>'));
  assert.equal(normKey('  Cơm Tấm  Ba-Ghiền! '), 'com tam ba ghien');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(todayVN(Date.parse('2026-10-04T18:00:00Z')), '2026-10-05'); // 01:00 sáng giờ VN
  for (let i = 0; i < 200; i++) assert.match(randomCode(10), INVITE_RE);
  assert.equal(new Set(Array.from({ length: 500 }, () => randomCode(10))).size, 500);
});
