// Nhập thông báo của trường: trích sự kiện, việc cần làm, khoản cần đóng thành BẢN NHÁP để xem lại.
// Không lưu gì ở máy chủ (không lưu văn bản, không lưu ảnh); người dùng sửa rồi mới lưu qua /events và /tasks.
import { config } from '../config.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { clock } from '../clock.js';
import { dayOfMs } from '../vn.js';
import { checkImage } from '../ai.js';
import { famRoutes } from './common.js';
import { needEdit } from './menu.js';
import { extractSchoolNotice } from '../school/extract.js';
import { callGeminiNotice, validateAiItems } from '../school/ai.js';

const MAX_TEXT = 8000;

export function schoolRoutes(app, { fetchImpl } = {}) {
  const F = famRoutes(app);

  F.post('/school/extract', async (ctx, me, fid) => {
    ctx.noBump = true;
    needEdit(me);
    const b = ctx.body;
    const mode = b.mode === 'ai' ? 'ai' : 'rules';
    let text = '';
    if (b.text !== undefined && b.text !== null) {
      if (typeof b.text !== 'string') throw new ApiError(400, 'invalid_input', 'Nội dung thông báo không hợp lệ', { field: 'Thông báo' });
      text = b.text.trim();
      if ([...text].length > MAX_TEXT) throw new ApiError(400, 'invalid_input', `Thông báo dài quá ${MAX_TEXT} ký tự, hãy dán từng phần`, { field: 'Thông báo' });
    }
    const today = dayOfMs(clock.now());
    const children = await query('SELECT id, name, grade FROM children WHERE family_id=$1 ORDER BY created_at, id', [fid]);
    if (mode === 'rules') {
      if (!text) throw new ApiError(400, 'invalid_input', 'Hãy dán nội dung thông báo', { field: 'Thông báo' });
      if (b.image) throw new ApiError(400, 'invalid_input', 'Đọc ảnh cần dùng AI', { field: 'Ảnh' });
      const r = extractSchoolNotice(text, { today, children });
      return { mode: 'rules', aiUsed: false, items: r.items, warnings: r.warnings };
    }
    if (!config.aiKey) throw new ApiError(404, 'ai_disabled', 'Tính năng đọc bằng AI chưa được bật');
    if (!text && !b.image) throw new ApiError(400, 'invalid_input', 'Hãy dán thông báo hoặc chụp ảnh', { field: 'Thông báo' });
    const image = b.image ? checkImage(b.image) : null;
    // hạn mức theo gia đình, theo IP và toàn hệ mỗi ngày (dùng chung với đọc thời khóa biểu); chỉ trừ khi đọc thành công
    const scopes = [['f:' + fid, config.aiPerFamilyPerDay], ['ip:' + ctx.ip, config.aiPerIpPerDay], ['g', config.aiGlobalPerDay]];
    const used = await query('SELECT scope, n FROM ai_quota WHERE day=$1 AND scope = ANY($2::text[])', [today, scopes.map((s) => s[0])]);
    for (const [sc, cap] of scopes) {
      if ((used.find((u) => u.scope === sc)?.n || 0) >= cap) throw new ApiError(429, 'ai_quota', sc === 'g' ? 'Dịch vụ AI hôm nay đã hết lượt. Mai thử lại hoặc dùng bản đọc bằng luật.' : 'Hôm nay đã dùng AI quá nhiều lần. Mai thử lại hoặc dùng bản đọc bằng luật.');
    }
    const raw = await callGeminiNotice({ text, image, today }, fetchImpl || fetch);
    const items = validateAiItems(raw, { today, children });
    await query('INSERT INTO ai_quota(scope, day, n) SELECT s, $1, 1 FROM unnest($2::text[]) s ON CONFLICT (scope, day) DO UPDATE SET n = ai_quota.n + 1', [today, scopes.map((s) => s[0])]);
    const warnings = items.length ? [] : ['AI không tìm thấy mục nào cần ghi nhớ trong thông báo này.'];
    return { mode: 'ai', aiUsed: true, sentImage: !!image, items, warnings };
  }, { maxBody: 6 * 1024 * 1024, limit: 20, limitKey: 'schoolx' });
}
