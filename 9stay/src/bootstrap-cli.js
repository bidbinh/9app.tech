// Tạo tổ chức đầu tiên và quản lý đầu tiên (chạy một lần trên máy chủ, không qua HTTP):
//   docker exec 9stay node src/bootstrap-cli.js "Anstay" <userId-9id> "Tên hiển thị"
import { fileURLToPath } from 'node:url';
import { tx, close } from './db.js';
import { bootstrapOrg } from './access.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [name, userId, displayName] = process.argv.slice(2);
  if (!name || !userId) { console.error('Dùng: node src/bootstrap-cli.js "<Tên tổ chức>" <userId 9id> "<Tên hiển thị>"'); process.exit(2); }
  try {
    const r = await tx((c) => bootstrapOrg(c, { name, userId, displayName }));
    console.log('Đã tạo tổ chức', r.orgId, 'và quản lý', r.memberId);
  } catch (e) {
    console.error('Lỗi:', e.message);
    process.exitCode = 1;
  } finally { await close(); }
}
