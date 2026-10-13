import { validateTrip } from './model.js';

export const KEY = '9ticket.trips.v1';
export const MAX_TRIPS = 500;
export const MAX_IMPORT_CHARS = 2_000_000;

export function createStore(getStorage) {
  let mem = [];
  let persistent = true;

  const storage = () => { try { return getStorage(); } catch { return null; } };

  function load() {
    if (!persistent) return mem.slice();
    const s = storage();
    if (!s) { persistent = false; return mem.slice(); }
    try {
      const raw = s.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, MAX_TRIPS).map((t) => validateTrip(t).trip).filter(Boolean);
    } catch { return []; }
  }

  function save(list) {
    mem = list.slice();
    const s = storage();
    if (!s) { persistent = false; return false; }
    try { s.setItem(KEY, JSON.stringify(list)); persistent = true; return true; }
    catch { persistent = false; return false; }
  }

  const get = (id) => load().find((t) => t.id === id) || null;

  function upsert(raw) {
    const r = validateTrip(raw);
    if (!r.trip) return r;
    const list = load();
    const i = list.findIndex((t) => t.id === r.trip.id);
    if (i < 0 && list.length >= MAX_TRIPS) return { trip: null, errors: [`Đã đủ ${MAX_TRIPS} chuyến, hãy xóa bớt.`] };
    if (i >= 0) list[i] = r.trip; else list.push(r.trip);
    save(list);
    return r;
  }

  function remove(id) { save(load().filter((t) => t.id !== id)); }

  function exportJson() {
    return JSON.stringify({ app: '9ticket', version: 1, exportedAt: new Date().toISOString(), trips: load() }, null, 2);
  }

  function importJson(text) {
    if (typeof text !== 'string' || text.length > MAX_IMPORT_CHARS) return { error: 'Tệp quá lớn hoặc không đọc được.' };
    let doc;
    try { doc = JSON.parse(text); } catch { return { error: 'Tệp không phải JSON hợp lệ.' }; }
    const incoming = Array.isArray(doc) ? doc : doc && doc.trips;
    if (!Array.isArray(incoming)) return { error: 'Tệp không có danh sách chuyến.' };
    const list = load();
    let added = 0, updated = 0, skipped = 0;
    for (const raw of incoming) {
      const t = validateTrip(raw).trip;
      if (!t) { skipped++; continue; }
      const i = list.findIndex((x) => x.id === t.id);
      if (i >= 0) { list[i] = t; updated++; }
      else if (list.length < MAX_TRIPS) { list.push(t); added++; }
      else skipped++;
    }
    save(list);
    return { added, updated, skipped };
  }

  return { load, get, upsert, remove, exportJson, importJson, isPersistent: () => persistent };
}
