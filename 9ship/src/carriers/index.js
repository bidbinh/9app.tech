import { config } from '../config.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMockAdapters } from './mock.js';

const here = path.dirname(fileURLToPath(import.meta.url));

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

// Nạp adapter thật từ tệp bên ngoài: CARRIER_MODULES=./carriers/ghn.js,/duong/dan/khac.js
// Mỗi tệp export default hàm (config) => adapter | [adapter]. Xem docs/ADAPTER-CONTRACT.md.
export async function loadExternal(modules = process.env.CARRIER_MODULES || '') {
  const loaded = [];
  for (const spec of modules.split(',').map((x) => x.trim()).filter(Boolean)) {
    const url = spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:/.test(spec)
      ? pathToFileURL(path.resolve(here, '..', spec.startsWith('./carriers/') ? spec.replace('./carriers/', 'carriers/') : spec)).href
      : spec;
    const mod = await import(url);
    const made = await mod.default(config);
    for (const a of [].concat(made)) {
      for (const m of ['id', 'name', 'capabilities', 'quote', 'createShipment', 'cancel', 'track', 'listPickupPoints']) {
        if (a[m] === undefined) throw new Error(`adapter ${spec} thiếu ${m}`);
      }
      register(a);
      loaded.push(a.id);
    }
  }
  return loaded;
}

initDefault();
