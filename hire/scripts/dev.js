// `npm run dev`: chạy server cục bộ. Không có DATABASE_URL thì dùng PostgreSQL nhúng (dữ liệu giữ ở .data/).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbedded } from './embedded-pg.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pg = null;
if (!process.env.DATABASE_URL) {
  pg = await startEmbedded({ dir: path.join(root, '.data'), database: 'hire' });
  process.env.DATABASE_URL = pg.url;
  console.log('PostgreSQL nhúng:', pg.url);
}
const { start } = await import('../src/server.js');
await start();
const stop = async () => { if (pg) await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
