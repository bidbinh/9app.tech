// Kho tài liệu cục bộ bằng IndexedDB. Nếu IndexedDB bị chặn (chế độ riêng tư, quyền trình duyệt) thì tự chuyển sang bộ nhớ tạm
// trong phiên và báo cho giao diện biết (store.persistent === false).
//
// Bảng:
//   docs  { id, name, folder, created, updated, count, bytes, thumb }
//   pages { id, docId, idx, ...trường trang } (chỉ mục theo docId)
//   sigs  { id, blob, created }
//   meta  { key, value }  (ví dụ key 'folders')

const DB_NAME = '9scanner';
const DB_VERSION = 1;

export class MemBackend {
  constructor() { this.t = { docs: new Map(), pages: new Map(), sigs: new Map(), meta: new Map() }; this.persistent = false; }
  async all(store) { return [...this.t[store].values()]; }
  async get(store, key) { return this.t[store].get(key); }
  async put(store, val) { this.t[store].set(val.id ?? val.key, val); }
  async del(store, key) { this.t[store].delete(key); }
  async pagesOf(docId) { return [...this.t.pages.values()].filter((p) => p.docId === docId); }
}

export class IDBBackend {
  constructor(db) { this.db = db; this.persistent = true; this._watch(db); }
  // Kết nối bị đóng (nâng cấp phiên bản ở tab khác, trình duyệt thu hồi): mở lại ở lần dùng kế tiếp
  _watch(db) {
    db.onversionchange = () => { try { db.close(); } catch (e) { /* bỏ qua */ } this.closed = true; };
    db.onclose = () => { this.closed = true; };
  }
  async _ensure() {
    if (!this.closed) return;
    const fresh = await IDBBackend.open();
    this.db = fresh.db; fresh._watch(this.db); this.closed = false;
  }
  static open() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('Không có IndexedDB'));
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('docs', { keyPath: 'id' });
        const p = db.createObjectStore('pages', { keyPath: 'id' });
        p.createIndex('docId', 'docId');
        db.createObjectStore('sigs', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(new IDBBackend(req.result));
      req.onerror = () => reject(req.error || new Error('Không mở được IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB bị chặn'));
    });
  }
  async _tx(store, mode, fn) {
    await this._ensure();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const os = tx.objectStore(store);
      let result;
      Promise.resolve(fn(os, tx)).then((r) => { result = r; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Giao dịch bị hủy'));
    });
  }
  _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  all(store) { return this._tx(store, 'readonly', (os) => this._req(os.getAll())); }
  get(store, key) { return this._tx(store, 'readonly', (os) => this._req(os.get(key))); }
  put(store, val) { return this._tx(store, 'readwrite', (os) => this._req(os.put(val))); }
  del(store, key) { return this._tx(store, 'readwrite', (os) => this._req(os.delete(key))); }
  pagesOf(docId) { return this._tx('pages', 'readonly', (os) => this._req(os.index('docId').getAll(docId))); }
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const blobSize = (b) => (b && typeof b.size === 'number' ? b.size : 0);

export class Store {
  constructor(backend) { this.b = backend; }
  get persistent() { return this.b.persistent; }

  static async create(forceMemory = false) {
    if (!forceMemory) {
      try { return new Store(await IDBBackend.open()); } catch (e) { /* rơi xuống bộ nhớ tạm */ }
    }
    return new Store(new MemBackend());
  }

  async listDocs() {
    const docs = await this.b.all('docs');
    return docs.sort((a, b) => b.updated - a.updated);
  }

  async getDoc(id) {
    const meta = await this.b.get('docs', id);
    if (!meta) return null;
    const rows = await this.b.pagesOf(id);
    const byId = new Map(rows.map((p) => [p.id, p]));
    const pages = (meta.order || []).map((pid) => byId.get(pid)).filter(Boolean);
    return { ...meta, pages };
  }

  /**
   * Lưu tài liệu. doc.pages là mảng trang (mỗi trang có id). dirty: tập id trang đã đổi cần ghi lại
   * (bỏ trống = ghi tất cả). Thứ tự trang lưu trong meta.order nên đổi thứ tự không phải ghi lại ảnh.
   */
  async saveDoc(doc, dirty) {
    const now = Date.now();
    const oldPages = await this.b.pagesOf(doc.id);
    const keep = new Set(doc.pages.map((p) => p.id));
    const have = new Set(oldPages.map((p) => p.id));
    for (const p of oldPages) if (!keep.has(p.id)) await this.b.del('pages', p.id);
    let bytes = 0;
    for (const p of doc.pages) {
      if (!dirty || dirty.has(p.id) || !have.has(p.id)) await this.b.put('pages', { ...p, docId: doc.id });
      bytes += blobSize(p.src) + blobSize(p.thumb);
    }
    const thumb = doc.pages[0] ? doc.pages[0].thumb : null;
    const meta = {
      id: doc.id, name: doc.name || 'Tài liệu', folder: doc.folder || '', created: doc.created || now, updated: now,
      count: doc.pages.length, bytes, thumb, order: doc.pages.map((p) => p.id),
    };
    await this.b.put('docs', meta);
    doc.updated = now; doc.created = meta.created;
    return meta;
  }

  async renameDoc(id, name, folder) {
    const m = await this.b.get('docs', id);
    if (!m) return;
    if (name !== undefined) m.name = name;
    if (folder !== undefined) m.folder = folder;
    m.updated = Date.now();
    await this.b.put('docs', m);
  }

  async deleteDoc(id) {
    for (const p of await this.b.pagesOf(id)) await this.b.del('pages', p.id);
    await this.b.del('docs', id);
  }

  async listFolders() {
    const m = await this.b.get('meta', 'folders');
    return m ? m.value : [];
  }
  async addFolder(name) {
    const list = await this.listFolders();
    const n = String(name || '').trim().slice(0, 40);
    if (!n || list.includes(n)) return list;
    list.push(n);
    await this.b.put('meta', { key: 'folders', value: list });
    return list;
  }
  async removeFolder(name) {
    const list = (await this.listFolders()).filter((f) => f !== name);
    await this.b.put('meta', { key: 'folders', value: list });
    for (const d of await this.b.all('docs')) if (d.folder === name) { d.folder = ''; await this.b.put('docs', d); }
    return list;
  }

  async listSigs() { return (await this.b.all('sigs')).sort((a, b) => b.created - a.created); }
  async saveSig(blob, meta = {}) {
    const rec = { id: newId(), blob, created: Date.now(), ...meta };
    await this.b.put('sigs', rec);
    return rec;
  }
  async deleteSig(id) { await this.b.del('sigs', id); }

  /** Dung lượng đã dùng (byte) và hạn mức trình duyệt nếu biết. */
  async usage() {
    let used = 0;
    for (const d of await this.b.all('docs')) used += d.bytes || 0;
    for (const s of await this.b.all('sigs')) used += blobSize(s.blob);
    let quota = null, usageAll = null;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        quota = e.quota || null; usageAll = e.usage || null;
      }
    } catch (e) { /* không hỗ trợ */ }
    return { used, quota, usageAll };
  }
}

/** Mức cảnh báo dung lượng: 'ok' | 'warn' (>=70%) | 'full' (>=90%) | 'unknown'. */
export function quotaLevel(usageAll, quota) {
  if (!quota || usageAll == null) return 'unknown';
  const r = usageAll / quota;
  return r >= 0.9 ? 'full' : r >= 0.7 ? 'warn' : 'ok';
}
