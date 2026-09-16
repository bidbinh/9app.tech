// Kho giọng Việt (Hoài My) — dùng khi máy không có gói TTS vi-VN.
// Chrome/Edge Windows mặc định chỉ có David/Zira; không được để chúng đọc tiếng Việt.

import { CLIP_ID } from './viet.js';

export class VoiceBank {
  constructor() {
    this.buffers = new Map();
    this.loading = null;
    this.ok = false;
  }

  async ensure(ctx) {
    if (this.ok) return true;
    if (this.loading) return this.loading;
    this.loading = this.#load(ctx);
    try {
      this.ok = await this.loading;
    } finally {
      this.loading = null;
    }
    return this.ok;
  }

  async #load(ctx) {
    if (!ctx) return false;
    const ids = [...new Set(Object.values(CLIP_ID))];
    let got = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch(`./voice/${id}.mp3`);
        if (!res.ok) return;
        const raw = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(raw.slice(0));
        this.buffers.set(id, buf);
        got++;
      } catch {
        /* thiếu 1 file thì vẫn đọc được phần còn lại */
      }
    }));
    return got >= 20;
  }

  /**
   * @param {string[]} words token tiếng Việt (khớp CLIP_ID)
   * @returns {number} thời lượng ms
   */
  play(words, dest) {
    if (!dest || !this.ok) return 0;
    const ctx = dest.context;
    let t = ctx.currentTime + 0.02;
    for (const w of words) {
      const id = CLIP_ID[w];
      const buf = id ? this.buffers.get(id) : null;
      if (!buf) {
        t += 0.08;
        continue;
      }
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = 1;
      src.buffer = buf;
      src.connect(g).connect(dest);
      src.start(t);
      t += buf.duration * 0.92;
    }
    return Math.max(0, Math.round((t - ctx.currentTime) * 1000));
  }
}
