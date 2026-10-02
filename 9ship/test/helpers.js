import { migrate, resetForTests, query, close } from '../src/db.js';

// Mỗi bài kiểm thử gọi setup() để có CSDL sạch cùng quy tắc giá mặc định.
export async function setup() {
  await migrate();
  await resetForTests();
  await query(`INSERT INTO pricing_rules(carrier, route, margin_pct, margin_min, surcharge, rounding, require_cap)
               VALUES ('*','*',8,1000,0,500,true)`);
}

export async function makeUser(phone = '0900000001') {
  const r = await query('INSERT INTO users(phone, name) VALUES($1, $2) RETURNING id', [phone, 'Test ' + phone]);
  return r[0].id;
}

export { close };
