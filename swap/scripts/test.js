// `npm test`: không có DATABASE_URL thì dựng PostgreSQL thật tạm thời, chạy node:test rồi dọn.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { startEmbedded } from './embedded-pg.js';

let pg = null;
const env = { ...process.env, NODE_ENV: 'test' };
if (!env.DATABASE_URL) {
  console.log('Không có DATABASE_URL: dựng PostgreSQL tạm bằng embedded-postgres...');
  pg = await startEmbedded({ database: 'swap_test' });
  env.DATABASE_URL = pg.url;
}
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...fs.readdirSync('test').filter((f) => f.endsWith('.test.js')).map((f) => 'test/' + f)], { stdio: 'inherit', env });
const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c ?? 1)));
if (pg) await pg.stop();
process.exit(code);
