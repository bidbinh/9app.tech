// Lớp lưu trữ IndexedDB có bọc try/catch. Nếu trình duyệt chặn (chế độ riêng tư, chặn dữ liệu trang) thì chuyển sang bộ nhớ tạm
// và báo cho giao diện để cảnh báo người dùng. Dữ liệu CHỈ nằm trên máy.
const TEN_DB = '9car';
const KHO = ['xe', 'nhatKy', 'hen', 'meta'];
let db = null;
let tam = null;
export let cheDoLuu = 'chua-mo';

export async function mo() {
  try {
    if (!globalThis.indexedDB) throw new Error('không có IndexedDB');
    db = await new Promise((res, rej) => {
      const r = indexedDB.open(TEN_DB, 1);
      r.onupgradeneeded = () => { for (const k of KHO) if (!r.result.objectStoreNames.contains(k)) r.result.createObjectStore(k, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('lỗi mở'));
      r.onblocked = () => rej(new Error('bị chặn'));
    });
    // thử ghi để chắc chắn dùng được
    await giaoDich('meta', 'readwrite', (s) => s.put({ id: '_kiemTra', v: 1 }));
    cheDoLuu = 'indexeddb';
  } catch {
    db = null; tam = new Map(KHO.map((k) => [k, new Map()]));
    cheDoLuu = 'tam';
  }
  return cheDoLuu;
}

function giaoDich(kho, kieu, fn) {
  return new Promise((res, rej) => {
    const tx = db.transaction(kho, kieu);
    let kq;
    const rq = fn(tx.objectStore(kho));
    if (rq) rq.onsuccess = () => { kq = rq.result; };
    tx.oncomplete = () => res(kq);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('hủy giao dịch'));
  });
}

export async function tatCa(kho) {
  if (!db) return [...tam.get(kho).values()];
  return giaoDich(kho, 'readonly', (s) => s.getAll());
}
export async function ghi(kho, obj) {
  if (!db) { tam.get(kho).set(obj.id, structuredClone(obj)); return; }
  await giaoDich(kho, 'readwrite', (s) => s.put(obj));
}
export async function ghiNhieu(kho, objs) {
  if (!db) { for (const o of objs) tam.get(kho).set(o.id, structuredClone(o)); return; }
  await new Promise((res, rej) => {
    const tx = db.transaction(kho, 'readwrite');
    const s = tx.objectStore(kho);
    for (const o of objs) s.put(o);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
export async function xoa(kho, id) {
  if (!db) { tam.get(kho).delete(id); return; }
  await giaoDich(kho, 'readwrite', (s) => s.delete(id));
}
export async function xoaSachKho() {
  if (!db) { for (const m of tam.values()) m.clear(); return; }
  for (const k of KHO) await giaoDich(k, 'readwrite', (s) => s.clear());
}
