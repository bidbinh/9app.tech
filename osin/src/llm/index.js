import { effectiveProvider } from '../config.js';
import { createGeminiProvider } from './gemini.js';
import { createOfflineProvider } from './offline.js';

export function createLlm(cfg) {
  const kind = effectiveProvider(cfg);
  if (kind === 'gemini') return createGeminiProvider(cfg);
  if (kind === 'offline') return createOfflineProvider();
  throw new Error(`OSIN_AI_PROVIDER="${kind}" không dùng được khi khởi động thường (mock chỉ để test)`);
}
