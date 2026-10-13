// Dựng PostgreSQL thật (embedded-postgres) ở cổng ngẫu nhiên trong thư mục tạm, dùng cho phát triển và kiểm thử.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

// dir: thư mục dữ liệu cố định (dev); bỏ trống = thư mục tạm, xóa khi dừng.
export async function startEmbedded({ dir, database = 'osin' } = {}) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const temp = !dir;
  const dataDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'osin-pg-'));
  const port = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dataDir, 'data'), user: 'postgres', password: 'osin', port, persistent: !temp, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  if (!fs.existsSync(path.join(dataDir, 'data', 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase(database); } catch { /* đã có */ }
  return {
    url: `postgres://postgres:osin@127.0.0.1:${port}/${database}`,
    async stop() {
      try { await pg.stop(); } catch { /* bỏ qua */ }
      if (temp) { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* Windows có thể còn khóa tệp */ } }
    },
  };
}
