import { AppError } from './errors.js';

// Làm tròn half-up tới bội của step. Tiền là số nguyên VND không âm.
export function roundTo(n, step = 1000) {
  if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(step) || step < 1) throw new AppError('bad_money', 'Số tiền không hợp lệ');
  return Math.floor((n + Math.floor(step / 2)) / step) * step;
}
