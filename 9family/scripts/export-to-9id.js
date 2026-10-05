// Lệnh quản trị: nhập gia đình ĐÃ CÓ của 9family sang 9id (tài khoản 9app dùng chung), giữ nguyên uuid gia đình và hồ sơ con.
//
//   docker exec -it 9family node scripts/export-to-9id.js              # xuất mọi gia đình chưa có ai nối tài khoản 9app
//   docker exec -it 9family node scripts/export-to-9id.js --dry-run    # chỉ liệt kê, không gọi 9id
//   docker exec -it 9family node scripts/export-to-9id.js --family <uuid> [--reissue]
//
// Với mỗi gia đình, 9id tạo gia đình (CHƯA có chủ) + hồ sơ con rồi trả MỘT MÃ NHẬN dùng một lần (hết hạn sau 30 ngày). Mã chỉ được IN RA
// cửa sổ lệnh này, một lần: không ghi vào nhật ký, tệp hay CSDL (9id chỉ giữ băm). Người chủ đăng ký/đăng nhập tài khoản 9app, nhập mã
// ở /id/ (Gia đình > Nhập mã nhận gia đình) thì thành chủ; lần kế tiếp chủ mở 9family, thành viên "chu" cũ tự nối với tài khoản đó.
//
// Chỉ gửi sang 9id: id + tên gia đình, id + tên + năm sinh của con. KHÔNG gửi: ghi chú về con, trường/lớp, thành viên, lịch, số điện thoại
// người đón hộ, mã khôi phục, token. Cần: DATABASE_URL, NINE_ID_URL, NINE_ID_KEY_ID (=family), NINE_ID_SECRET; 9id phải có key đó trong INTERNAL_IMPORT_APPS.
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { query, close } from '../src/db.js';
import { createNineId, NineIdError } from '../src/nine-id.js';

const NAME_MAX = 60; const KID_MAX = 40;
const clip = (s, n) => [...String(s ?? '').replace(/\s+/g, ' ').trim()].slice(0, n).join('');

export function buildPayload(f, kids, year = new Date().getFullYear()) {
  return {
    family: { id: f.id, name: clip(f.name, NAME_MAX) || 'Gia đình' },
    children: kids.map((k) => ({ id: k.id, name: clip(k.name, KID_MAX) || 'Con', birthYear: Number.isInteger(k.birth_year) && k.birth_year >= 1990 && k.birth_year <= year ? k.birth_year : null })),
  };
}

// opts: { family, reissue, dryRun, client, out(line) }. Trả về [{ familyId, name, status, claimCode?, expiresAt? }]
export async function exportFamilies({ family = null, reissue = false, dryRun = false, client = null, out = (l) => console.log(l) } = {}) {
  const id = client || createNineId({ baseUrl: config.nineIdUrl, keyId: config.nineIdKeyId, secret: config.nineIdSecret, timeoutMs: 15_000 });
  const fams = await query(
    `SELECT f.id, f.name, (SELECT claim_id FROM id_import i WHERE i.family_id = f.id) AS claim_id, EXISTS (SELECT 1 FROM id_import i WHERE i.family_id = f.id) AS exported,
            EXISTS (SELECT 1 FROM members m WHERE m.family_id = f.id AND m.user_id IS NOT NULL AND m.left_at IS NULL) AS claimed
       FROM families f WHERE ($1::uuid IS NULL OR f.id = $1) ORDER BY f.created_at`, [family]);
  const results = [];
  for (const f of fams) {
    if (f.claimed) { results.push({ familyId: f.id, name: f.name, status: 'da_nhan' }); out(`- ${f.name}: đã có người nhận bằng tài khoản 9app, bỏ qua.`); continue; }
    if (f.exported && !reissue) { results.push({ familyId: f.id, name: f.name, status: 'da_xuat' }); out(`- ${f.name}: đã xuất trước đó. Cần mã mới thì chạy lại với --family ${f.id} --reissue.`); continue; }
    const kids = await query('SELECT id, name, birth_year FROM children WHERE family_id=$1 AND archived_at IS NULL ORDER BY created_at, id', [f.id]);
    if (dryRun) { results.push({ familyId: f.id, name: f.name, status: 'se_xuat', children: kids.length }); out(`- ${f.name}: sẽ xuất gia đình + ${kids.length} hồ sơ con (chỉ tên và năm sinh).`); continue; }
    let r;
    try {
      r = f.exported ? await id.reissueClaim(f.id) : await id.importFamily(buildPayload(f, kids));
    } catch (e) {
      if (e instanceof NineIdError && e.status === 409 && e.code === 'exists') {
        // 9id đã có gia đình này (lần trước xuất xong mà chưa kịp ghi CSDL này): xin cấp lại mã
        try { r = await id.reissueClaim(f.id); } catch (e2) { results.push({ familyId: f.id, name: f.name, status: 'loi', error: String(e2.message) }); out(`- ${f.name}: LỖI ${e2.status || ''} ${e2.message}`); continue; }
      } else { results.push({ familyId: f.id, name: f.name, status: 'loi', error: String(e && e.message) }); out(`- ${f.name}: LỖI ${e && e.status ? e.status + ' ' : ''}${e && e.message}`); continue; }
    }
    await query(
      `INSERT INTO id_import(family_id, claim_id) VALUES($1,$2) ON CONFLICT (family_id) DO UPDATE SET claim_id = EXCLUDED.claim_id, reissued_at = now()`, [f.id, r.claimId]);
    results.push({ familyId: f.id, name: f.name, status: 'da_xuat_moi', claimCode: r.claimCode, expiresAt: r.expiresAt });
    out('');
    out(`Gia đình: ${f.name}   (${kids.length} hồ sơ con)`);
    out(`  MÃ NHẬN: ${r.claimCode}`);
    out(`  Hết hạn: ${new Date(r.expiresAt).toLocaleString('vi-VN')}   (mã chỉ hiện MỘT LẦN, không lưu ở đâu khác)`);
  }
  if (!fams.length) out('Không có gia đình nào.');
  return results;
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const family = opt('--family');
  if (family && !/^[0-9a-f-]{36}$/i.test(family)) { console.error('--family cần một uuid.'); process.exit(2); }
  if (!config.nineIdSecret && !a.includes('--dry-run')) { console.error('Thiếu NINE_ID_SECRET.'); process.exit(2); }
  try {
    const res = await exportFamilies({ family: family ? family.toLowerCase() : null, reissue: a.includes('--reissue'), dryRun: a.includes('--dry-run') });
    if (res.some((r) => r.status === 'loi')) process.exitCode = 1;
    else if (res.some((r) => r.status === 'da_xuat_moi')) console.log('\nXong. Chuyển mã cho đúng chủ gia đình qua kênh riêng, rồi xóa cửa sổ lệnh này.');
  } finally { await close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error('Lỗi:', e && e.message); process.exit(1); });
