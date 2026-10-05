// Gemini qua REST (generateContent) với function calling. Khóa chỉ lấy từ cấu hình, không bao giờ ghi nhật ký.
// Nội dung hội thoại chỉ đi qua bộ nhớ.
import { ApiError } from '../errors.js';
import { logEvent } from '../util.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = ['type', 'description', 'enum', 'items', 'properties', 'required', 'nullable', 'minimum', 'maximum', 'minItems', 'maxItems'];

/** JSON Schema của app -> tập con Gemini hiểu (bỏ additionalProperties, format, pattern...). */
export function sanitizeSchema(s, depth = 0) {
  if (!s || typeof s !== 'object' || depth > 6) return { type: 'string' };
  const out = {};
  for (const k of KEEP) if (s[k] !== undefined) out[k] = s[k];
  if (!out.type) out.type = 'string';
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, sanitizeSchema(v, depth + 1)]));
  if (out.items) out.items = sanitizeSchema(out.items, depth + 1);
  if (out.type === 'object' && (!out.properties || !Object.keys(out.properties).length)) delete out.properties;
  if (Array.isArray(out.required) && !out.required.length) delete out.required;
  if (out.enum && out.type !== 'string') delete out.enum; // Gemini chỉ nhận enum cho chuỗi
  return out;
}

export function createGeminiProvider(cfg, fetchImpl = fetch) {
  return {
    kind: 'gemini',
    external: true,
    async generate({ system, contents, tools = [], allowTools = true, deadline = Date.now() + 60_000, signal }) {
      if (!cfg.aiKey) throw new ApiError(503, 'ai_disabled', 'Tính năng AI chưa được bật trên máy chủ này.');
      const url = `${cfg.aiBase}/v1beta/models/${encodeURIComponent(cfg.aiModel)}:generateContent`;
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: sanitizeSchema(t.parameters) })) }] } : {}),
        ...(tools.length ? { toolConfig: { functionCallingConfig: { mode: allowTools ? 'AUTO' : 'NONE' } } } : {}),
        generationConfig: { temperature: 0.3, maxOutputTokens: cfg.aiMaxOutputTokens },
      });
      let last = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const left = deadline - Date.now();
        if (left <= 0) break;
        if (signal && signal.aborted) throw new ApiError(504, 'timeout', 'Osin trả lời quá lâu, bạn thử lại nhé.');
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), Math.min(cfg.aiTimeoutMs, left));
          const onAbort = () => ctl.abort();
          if (signal) signal.addEventListener('abort', onAbort, { once: true });
          let r;
          try { r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.aiKey }, body, signal: ctl.signal }); } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
          if (r.status === 429 || r.status === 503) {
            last = r.status;
            const wait = cfg.aiRetryDelayMs * attempt;
            if (attempt < 3 && Date.now() + wait < deadline) { await sleep(wait); continue; }
            break;
          }
          if (!r.ok) { logEvent('gemini_http', { status: r.status }); throw new ApiError(502, 'ai_failed', 'Dịch vụ AI không phản hồi được lúc này. Bạn thử lại sau nhé.'); }
          const j = await r.json();
          if (j?.promptFeedback?.blockReason) throw new ApiError(422, 'ai_blocked', 'AI từ chối xử lý nội dung này. Hãy sửa lại câu hỏi rồi thử lại.');
          const cand = j?.candidates?.[0];
          const fin = cand?.finishReason;
          if (['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION'].includes(fin)) throw new ApiError(422, 'ai_blocked', 'AI từ chối trả lời nội dung này. Hãy diễn đạt lại câu hỏi.');
          const parts = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
          const calls = parts.filter((p) => p.functionCall && typeof p.functionCall.name === 'string').map((p) => ({ name: p.functionCall.name, args: p.functionCall.args && typeof p.functionCall.args === 'object' ? p.functionCall.args : {} }));
          const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
          const u = j.usageMetadata || {};
          const tokens = Number.isFinite(u.totalTokenCount) ? u.totalTokenCount : (u.promptTokenCount || 0) + (u.candidatesTokenCount || 0);
          return { content: { role: 'model', parts }, calls, text, tokens: tokens || 0, finish: fin || 'STOP', truncated: fin === 'MAX_TOKENS' };
        } catch (e) {
          if (e instanceof ApiError) throw e;
          last = 'net';
          const wait = cfg.aiRetryDelayMs * attempt;
          if (attempt < 3 && Date.now() + wait < deadline) { await sleep(wait); continue; }
          break;
        }
      }
      if (last === 429 || last === 503) throw new ApiError(503, 'ai_busy', 'Dịch vụ AI đang bận. Thử lại sau ít phút nhé.');
      throw new ApiError(502, 'ai_failed', 'Không kết nối được dịch vụ AI. Bạn thử lại sau nhé.');
    },
  };
}
