// `npm test`: không có DATABASE_URL thì dựng PostgreSQL thật tạm thời (cổng ngẫu nhiên), chạy node:test rồi dọn.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { startEmbedded } from './embedded-pg.js';

let pg = null;
const env = { ...process.env, NODE_ENV: 'test' };
if (!env.DATABASE_URL) {
  console.log('Không có DATABASE_URL: dựng PostgreSQL tạm bằng embedded-postgres...');
  pg = await startEmbedded({ database: 'tutor_test' });
  env.DATABASE_URL = pg.url;
}
const child = spawn(process.execPath, ['--test', '--test-timeout=30000', '--test-concurrency=1', ...(process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync('test').filter((f) => f.endsWith('.test.js')).map((f) => 'test/' + f))], { stdio: 'inherit', env });
const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c ?? 1)));
if (pg) await pg.stop();
process.exit(code);
