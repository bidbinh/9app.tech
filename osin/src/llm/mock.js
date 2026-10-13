// LlmProvider giả, kịch bản hóa cho test và e2e. Không gọi mạng.
//   script: mảng bước hoặc hàm (ctx) => bước. Bước: { text } | { calls: [{ name, args }] } | { error: ApiError } | { tokens, delayMs }
import { ApiError } from '../errors.js';

export function createMockProvider(script = [], { external = true } = {}) {
  const log = [];
  let i = 0;
  return {
    kind: 'mock',
    external,
    log,
    reset(next) { if (next) script = next; i = 0; log.length = 0; },
    async generate({ system, contents, tools = [], allowTools = true, signal }) {
      const entry = { system, contents: JSON.parse(JSON.stringify(contents)), tools: tools.map((t) => t.name), allowTools, index: i };
      log.push(entry);
      const step = typeof script === 'function' ? await script({ ...entry, toolDefs: tools }) : script[i];
      i++;
      if (!step) return { content: { role: 'model', parts: [{ text: 'Xin chào, mình là Osin.' }] }, calls: [], text: 'Xin chào, mình là Osin.', tokens: 50, finish: 'STOP' };
      if (step.delayMs) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, step.delayMs);
          if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new ApiError(504, 'timeout', 'Osin trả lời quá lâu, bạn thử lại nhé.')); }, { once: true });
        });
      }
      if (step.error) throw step.error;
      const calls = (step.calls || []).map((c) => ({ name: c.name, args: c.args ?? {} }));
      const text = step.text || '';
      const parts = [...(text ? [{ text }] : []), ...calls.map((c) => ({ functionCall: { name: c.name, args: c.args } }))];
      return { content: { role: 'model', parts }, calls, text, tokens: step.tokens ?? 100, finish: 'STOP' };
    },
  };
}
