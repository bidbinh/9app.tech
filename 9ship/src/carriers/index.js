import { config } from '../config.js';
import { createMockAdapters } from './mock.js';

// Registry: mọi hãng/đơn vị tổng hợp đăng ký tại đây. Adapter thật xem docs/ADAPTER-CONTRACT.md.
const adapters = new Map();

export function register(adapter) {
  adapters.set(adapter.id, adapter);
}

export function unregister(id) {
  adapters.delete(id);
}

export function list() {
  return [...adapters.values()];
}

export function get(id) {
  return adapters.get(id) || null;
}

export function initDefault() {
  adapters.clear();
  if (config.mockCarriers) for (const a of createMockAdapters()) register(a);
}

initDefault();
