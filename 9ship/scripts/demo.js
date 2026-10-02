// Chạy bản demo trên máy: PostgreSQL ở localhost:5440 (docker compose -f docker-compose.demo.yml up -d), OTP hiện ngay trên màn hình,
// hãng mô phỏng, quản trị với mã demo. KHÔNG dùng cho production.
import pg from 'pg';

const DEMO_DB = 'ship_demo';
const base = process.env.DEMO_PG || 'postgres://postgres:ship@localhost:5440';
const admin = new pg.Client({ connectionString: base + '/postgres' });
await admin.connect();
const has = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [DEMO_DB]);
if (!has.rowCount) await admin.query(`CREATE DATABASE ${DEMO_DB}`);
await admin.end();

Object.assign(process.env, {
  DATABASE_URL: `${base}/${DEMO_DB}`,
  OTP_DEV: '1',
  MOCK_CARRIERS: 'true',
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'demo-admin',
  ADMIN_TOTP_SECRET: process.env.ADMIN_TOTP_SECRET || 'JBSWY3DPEHPK3PXP',
  BANK_ACCOUNT: process.env.BANK_ACCOUNT || '0011001234567',
  BANK_ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || 'CONG TY 9SHIP DEMO',
  BANK_WEBHOOK_SECRET: process.env.BANK_WEBHOOK_SECRET || 'demo-bank',
});
console.log('Admin demo: mã quản trị "demo-admin", mã TOTP lấy bằng: npm run totp (ADMIN_TOTP_SECRET=JBSWY3DPEHPK3PXP)');
const { start } = await import('../src/server.js');
await start();
