// Lưu trữ cục bộ: cài đặt người dùng (localStorage) và cache dữ liệu bản đồ (IndexedDB).
// Cache giúp app vẫn biết giới hạn tốc độ khi đi qua vùng sóng yếu.

import { DEFAULT_SETTINGS, OVERPASS } from './config.js';

const SETTINGS_KEY = '9speed.settings';
const DB_NAME = '9speed';
const DB_VERSION = 1;
const STORE = 'tiles';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const settings = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
    // Bật tiếng Việt một lần khi nâng cấp; giữ lựa chọn bật/tắt về sau.
    if (settings.voiceLanguage !== 'vi-VN') {
      settings.voice = true;
      settings.voiceLanguage = 'vi-VN';
      saveSettings(settings);
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* chế độ riêng tư có thể chặn localStorage - bỏ qua */
  }
}

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('Không hỗ trợ IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

export async function cacheGet(key, ttl = OVERPASS.cacheTtl) {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!record) return null;
    if (Date.now() - record.savedAt > ttl) return null;
    return record.data;
  } catch {
    return null;
  }
}

export async function cacheSet(key, data) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, data, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* hết dung lượng hoặc bị chặn - cache chỉ là tối ưu, không bắt buộc */
  }
}

/** Xoá ô đường IndexedDB + cache ảnh nền. Không đụng 9speed-shell (PWA offline). */
export async function cacheClear() {
  let idbOk = false;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    idbOk = true;
  } catch {
    /* IndexedDB có thể bị chặn */
  }
  try {
    if ('caches' in globalThis) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('9speed-tiles-')).map((k) => caches.delete(k)),
      );
    }
  } catch {
    /* Cache Storage không bắt buộc */
  }
  return idbOk;
}
