// Cài đặt giao diện (nhớ trong localStorage, có try/catch): chủ đề sáng/tối và chữ lớn.
const K = { theme: '9car.theme', chuLon: '9car.chulon' };
function doc(k) { try { return globalThis.localStorage.getItem(k); } catch { return null; } }
function ghi(k, v) { try { if (v === null) globalThis.localStorage.removeItem(k); else globalThis.localStorage.setItem(k, v); } catch { /* bị chặn */ } }

export const layTheme = () => { const t = doc(K.theme); return t === 'light' || t === 'dark' ? t : 'auto'; };
export const layChuLon = () => doc(K.chuLon) === '1';
export function ap() {
  const r = document.documentElement;
  const t = layTheme();
  if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
  r.classList.toggle('chu-lon', layChuLon());
}
export function datTheme(t) { ghi(K.theme, t === 'auto' ? null : t); ap(); }
export function datChuLon(b) { ghi(K.chuLon, b ? '1' : null); ap(); }
