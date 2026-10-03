// Mã hóa bí mật của app khi lưu CSDL: AES-256-GCM, khóa suy ra từ CONSOLE_KEY.
import crypto from 'node:crypto';
import { config } from './config.js';

const key = () => {
  const k = config.consoleKey || 'dev-console-key-chi-dung-khi-phat-trien';
  return crypto.createHash('sha256').update(k).digest();
};

export function seal(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1.' + [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function open(sealed) {
  const [v, iv, tag, enc] = String(sealed).split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('bí mật hỏng');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
