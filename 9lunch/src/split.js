// Chia tiền bữa ăn. Hàm thuần, mọi số là số nguyên đồng.
//
// items: [{ memberId, price, qty }]   fees: { ship, service, tip, discount }  (discount là số dương, trừ đi)
// mode: 'ty_le' (phí chia theo tỷ lệ tiền món) | 'chia_deu' (cả bữa chia đều cho người có món)
// Phần dư do làm tròn xuống dồn cho người có nhiều tiền món nhất (bằng nhau thì memberId nhỏ hơn).
// Giảm giá lớn hơn tổng tiền món + phí thì chỉ giảm tối đa bằng tổng đó (tổng không bao giờ âm).
// round500: phần của người KHÁC người ứng tiền được làm tròn lên bội 500đ; phần chênh gộp vào `surplus`
// (người ứng tiền được hưởng), nên khi round500 bật thì tổng các phần = total + surplus.

export const ROUND_STEP = 500;

function floorDiv(a, b) { // BigInt, b > 0
  let q = a / b;
  if (a % b !== 0n && a < 0n) q -= 1n;
  return q;
}

export function splitMeal({ items, fees = {}, mode = 'ty_le', round500 = false, payerId = null }) {
  const food = new Map();
  for (const it of items) {
    food.set(it.memberId, (food.get(it.memberId) || 0) + it.price * it.qty);
  }
  const ids = [...food.keys()].sort();
  const foodTotal = ids.reduce((s, id) => s + food.get(id), 0);
  const gross = (fees.ship || 0) + (fees.service || 0) + (fees.tip || 0);
  const discountApplied = Math.min(fees.discount || 0, foodTotal + gross);
  const total = foodTotal + gross - discountApplied;
  const extra = gross - discountApplied;
  const n = ids.length;
  const out = { foodTotal, gross, discountApplied, total, shares: [], surplus: 0, sum: 0 };
  if (n === 0) return out;

  // người nhận phần dư: nhiều tiền món nhất, bằng nhau thì id nhỏ nhất (ids đã sắp tăng dần)
  let top = ids[0];
  for (const id of ids) if (food.get(id) > food.get(top)) top = id;

  const amount = new Map();
  if (mode === 'chia_deu') {
    const base = Number(floorDiv(BigInt(total), BigInt(n)));
    for (const id of ids) amount.set(id, base);
    amount.set(top, amount.get(top) + (total - base * n));
  } else {
    const weights = foodTotal > 0 ? ids.map((id) => BigInt(food.get(id))) : ids.map(() => 1n);
    const sumW = weights.reduce((s, w) => s + w, 0n);
    let given = 0;
    ids.forEach((id, i) => {
      const part = Number(floorDiv(BigInt(extra) * weights[i], sumW));
      given += part;
      amount.set(id, food.get(id) + part);
    });
    amount.set(top, amount.get(top) + (extra - given));
  }

  for (const id of ids) {
    let a = amount.get(id);
    let rounded = false;
    if (round500 && id !== payerId && a % ROUND_STEP !== 0) {
      const up = Math.ceil(a / ROUND_STEP) * ROUND_STEP;
      out.surplus += up - a;
      a = up;
      rounded = true;
    }
    out.shares.push({ memberId: id, food: food.get(id), extra: a - food.get(id), amount: a, rounded });
    out.sum += a;
  }
  return out;
}
