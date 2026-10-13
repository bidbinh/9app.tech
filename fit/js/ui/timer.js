// Đồng hồ đếm ngược dựa trên Date.now() (nên kiểm thử được bằng cách dịch đồng hồ), cùng âm báo, rung và giọng đọc.
import * as db from '../lib/db.js';

export function caiDat() {
  return { amThanh: true, rung: true, docTo: false, chuLon: false, nghiMacDinh: 90, ...(db.doc('caidat', {}) || {}) };
}
export function luuCaiDat(patch) {
  const m = { ...caiDat(), ...patch };
  db.ghi('caidat', m);
  return m;
}

let ctx = null;
function amCtx() {
  if (ctx) return ctx;
  try {
    const A = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (A) ctx = new A();
  } catch { ctx = null; }
  return ctx;
}
/** Gọi trong sự kiện bấm của người dùng để trình duyệt cho phép phát âm sau này. */
export function moKhoaAm() {
  try { const c = amCtx(); if (c && c.state === 'suspended') c.resume(); } catch { /* bỏ qua */ }
}
export function keu(soLan = 2) {
  const cd = caiDat();
  if (cd.amThanh) {
    try {
      const c = amCtx();
      if (c) {
        for (let i = 0; i < soLan; i++) {
          const o = c.createOscillator(); const g = c.createGain();
          o.type = 'sine'; o.frequency.value = i === soLan - 1 ? 988 : 784;
          o.connect(g); g.connect(c.destination);
          const t0 = c.currentTime + i * 0.22;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
          o.start(t0); o.stop(t0 + 0.18);
        }
      }
    } catch { /* bỏ qua */ }
  }
  if (cd.rung) {
    try { navigator.vibrate?.(soLan > 1 ? [180, 90, 180] : 120); } catch { /* bỏ qua */ }
  }
}

export const coGiongDoc = () => typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined';
export function doc(text) {
  if (!caiDat().docTo || !coGiongDoc()) return;
  try {
    const ss = globalThis.speechSynthesis;
    ss.cancel();
    const u = new globalThis.SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    const v = ss.getVoices?.().find((x) => /^vi/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1;
    ss.speak(u);
  } catch { /* bỏ qua */ }
}
export function dungDoc() { try { globalThis.speechSynthesis?.cancel(); } catch { /* bỏ qua */ } }

/** Đếm ngược theo mốc thời gian tuyệt đối nên không trôi khi tab bị làm chậm. */
export class DemNguoc {
  constructor({ giay, khiTick, khiXong }) {
    this.tong = giay; this.conLai = giay * 1000; this.khiTick = khiTick; this.khiXong = khiXong;
    this.dangChay = false; this.xong = false; this.h = 0; this.ketThuc = 0;
  }
  batDau() {
    if (this.dangChay || this.xong) return;
    this.dangChay = true; this.ketThuc = Date.now() + this.conLai;
    this.h = setInterval(() => this.kiem(), 200);
    this.kiem();
  }
  kiem() {
    if (!this.dangChay) return;
    this.conLai = Math.max(0, this.ketThuc - Date.now());
    this.khiTick?.(Math.ceil(this.conLai / 1000), this);
    if (this.conLai <= 0) { this.dung(); this.xong = true; this.khiXong?.(); }
  }
  tamDung() { if (!this.dangChay) return; this.conLai = Math.max(0, this.ketThuc - Date.now()); this.dangChay = false; clearInterval(this.h); this.khiTick?.(Math.ceil(this.conLai / 1000), this); }
  tiepTuc() { if (this.dangChay || this.xong) return; this.batDau(); }
  cong(giay) { this.conLai = Math.max(0, this.conLai + giay * 1000); if (this.dangChay) this.ketThuc += giay * 1000; this.kiem?.(); if (!this.dangChay) this.khiTick?.(Math.ceil(this.conLai / 1000), this); }
  dung() { this.dangChay = false; clearInterval(this.h); }
}

export const mmss = (g) => `${Math.floor(g / 60)}:${String(g % 60).padStart(2, '0')}`;

/** Áp cài đặt giao diện (chữ lớn) lên trang. */
export function apDungCaiDat() {
  document.documentElement.classList.toggle('chu-lon', !!caiDat().chuLon);
}
