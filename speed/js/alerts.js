// Âm báo + giọng đọc tiếng Việt.
//
// Ưu tiên: giọng vi-VN của máy (Google / Hoài My / Linh).
// Máy Windows thường chỉ có David/Zira — KHÔNG được để chúng đọc tiếng Việt.
// Khi không có giọng Việt hệ thống: đọc kho mp3 Hoài My trong /voice.

import {
  cauBatGiongTokens, cauPoiTokens, cauTu, cauVuotTocTokens,
  pickVietnameseVoice, voiceRate,
} from './viet.js';
import { VoiceBank } from './voicebank.js';

const CUES = {
  camera: [
    { f: 659, ms: 85, g: 0.22 },
    { f: 784, ms: 85, g: 0.24 },
    { f: 988, ms: 160, g: 0.26 },
  ],
  railway: [
    { f: 523, ms: 130, g: 0.24 },
    { f: 392, ms: 200, g: 0.22 },
  ],
  overspeed: [
    { f: 784, ms: 90, g: 0.28, to: 698 },
    { f: 784, ms: 90, g: 0.28, to: 698 },
    { f: 587, ms: 150, g: 0.24 },
  ],
  limit: [
    { f: 587, ms: 80, g: 0.18 },
    { f: 784, ms: 140, g: 0.22 },
  ],
  corridor: [
    { f: 523, ms: 100, g: 0.2 },
    { f: 659, ms: 150, g: 0.22 },
  ],
  clear: [{ f: 523, ms: 140, g: 0.18 }],
  preview: [
    { f: 659, ms: 80, g: 0.2 },
    { f: 988, ms: 160, g: 0.24 },
  ],
  ban: [
    { f: 698, ms: 90, g: 0.24 },
    { f: 523, ms: 90, g: 0.22 },
    { f: 698, ms: 160, g: 0.26 },
  ],
};

export class Alerts {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.out = null;
    this.voiceGain = null;
    this.voice = null;
    this.bank = new VoiceBank();
    this.unlocked = false;
    this.speaking = false;
    this.queue = [];
    this._speakGen = 0;
    this._speakTimer = null;
    this._delayTimer = null;
    this.onVoiceInfo = () => {};
    this.#initVoices();
  }

  #initVoices() {
    if (typeof speechSynthesis === 'undefined') return;
    const pick = () => {
      this.voice = pickVietnameseVoice(speechSynthesis.getVoices());
      this.onVoiceInfo(this.voiceInfo());
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  }

  voiceInfo() {
    if (this.voice) return { ok: true, via: 'he-thong', name: this.voice.name };
    if (this.bank.ok) return { ok: true, via: 'hoai-my', name: 'Hoài My' };
    return { ok: false, via: null, name: null };
  }

  #graph() {
    if (!this.ctx || this.out) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2300;
    filter.Q.value = 0.65;
    const master = this.ctx.createGain();
    master.gain.value = 0.85;
    filter.connect(master).connect(this.ctx.destination);
    this.out = filter;
    const vg = this.ctx.createGain();
    vg.gain.value = 1;
    vg.connect(this.ctx.destination);
    this.voiceGain = vg;
  }

  /** Gọi trong sự kiện chạm/click đầu tiên để mở khoá âm thanh. */
  async unlock() {
    try {
      if (!this.ctx) {
        const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (Ctx) this.ctx = new Ctx();
      }
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
      this.#graph();
      await this.bank.ensure(this.ctx);
      this.voice = typeof speechSynthesis !== 'undefined'
        ? pickVietnameseVoice(speechSynthesis.getVoices())
        : null;
      if (this.voice && typeof speechSynthesis !== 'undefined' && !this.unlocked) {
        const u = new SpeechSynthesisUtterance(' ');
        u.lang = this.voice.lang || 'vi-VN';
        u.voice = this.voice;
        u.volume = 0;
        speechSynthesis.speak(u);
      }
      this.unlocked = true;
      this.onVoiceInfo(this.voiceInfo());
    } catch {
      /* không mở được âm thanh thì app vẫn chạy, chỉ mất tiếng */
    }
    return this.unlocked;
  }

  /**
   * Nốt cảnh báo: tam giác (thân) + sine quãng tám (ánh), envelope mũ.
   * @param {keyof typeof CUES} name
   */
  cue(name) {
    if (!this.settings.sound || !this.ctx) return 0;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.#graph();
    if (!this.out) return 0;
    const notes = CUES[name] || CUES.preview;
    let t = this.ctx.currentTime;
    const gap = 0.045;
    for (const n of notes) {
      const dur = n.ms / 1000;
      this.#note(t, n.f, dur, n.g ?? 0.22, n.to);
      t += dur + gap;
    }
    return Math.round((t - this.ctx.currentTime) * 1000);
  }

  #note(t0, freq, dur, gain, sweepTo) {
    const tri = this.ctx.createOscillator();
    const sine = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const spark = this.ctx.createGain();
    tri.type = 'triangle';
    sine.type = 'sine';
    tri.frequency.setValueAtTime(freq, t0);
    sine.frequency.setValueAtTime(freq * 2, t0);
    if (sweepTo) {
      tri.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
      sine.frequency.exponentialRampToValueAtTime(sweepTo * 2, t0 + dur);
    }
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.014);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    spark.gain.setValueAtTime(0.0001, t0);
    spark.gain.exponentialRampToValueAtTime(gain * 0.22, t0 + 0.01);
    spark.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.85);
    tri.connect(amp).connect(this.out);
    sine.connect(spark).connect(this.out);
    tri.start(t0);
    sine.start(t0);
    tri.stop(t0 + dur + 0.04);
    sine.stop(t0 + dur + 0.04);
  }

  /** Đọc token tiếng Việt. Không đọc nếu chỉ có giọng Anh. */
  speakTokens(tokens, priority = false, delayMs = 0) {
    if (!this.settings.voice || !tokens?.length) return;
    try {
      if (priority) {
        this.queue.length = 0;
        this._speakGen++;
        this.speaking = false;
        clearTimeout(this._speakTimer);
        clearTimeout(this._delayTimer);
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        this.#saySoon(tokens, delayMs);
        return;
      }
      if (this.speaking || this._delayTimer) {
        if (this.queue.length < 2) this.queue.push(tokens);
        return;
      }
      this.#saySoon(tokens, delayMs);
    } catch {
      /* bỏ qua lỗi TTS */
    }
  }

  #saySoon(tokens, delayMs) {
    clearTimeout(this._delayTimer);
    if (delayMs > 0) {
      this._delayTimer = setTimeout(() => {
        this._delayTimer = null;
        this.#utter(tokens);
      }, delayMs);
      return;
    }
    this.#utter(tokens);
  }

  #utter(tokens) {
    const token = ++this._speakGen;
    this.speaking = true;
    clearTimeout(this._speakTimer);

    const finish = () => {
      if (token !== this._speakGen) return;
      clearTimeout(this._speakTimer);
      this.speaking = false;
      const next = this.queue.shift();
      if (next) this.#utter(next);
    };

    const sys = typeof speechSynthesis !== 'undefined'
      ? pickVietnameseVoice(speechSynthesis.getVoices())
      : null;
    this.voice = sys;

    if (sys) {
      const text = cauTu(tokens);
      const go = () => {
        if (token !== this._speakGen) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = sys.lang || 'vi-VN';
        u.voice = sys;
        u.rate = voiceRate(sys);
        u.pitch = 1;
        u.volume = 1;
        u.onend = finish;
        u.onerror = finish;
        this._speakTimer = setTimeout(finish, Math.min(9000, 1600 + text.length * 90));
        try { speechSynthesis.resume(); } catch { /* một số trình duyệt không có resume */ }
        speechSynthesis.speak(u);
      };
      setTimeout(go, 40);
      return;
    }

    if (this.bank.ok && this.voiceGain) {
      const ms = this.bank.play(tokens, this.voiceGain);
      this._speakTimer = setTimeout(finish, Math.max(400, ms + 60));
      return;
    }

    finish();
  }

  overSpeed(_current, limit) {
    const wait = this.cue('overspeed');
    this.speakTokens(cauVuotTocTokens(limit), true, Math.max(220, wait - 40));
  }

  backToLimit() {
    this.cue('clear');
  }

  poi(item) {
    const t = item.info?.type;
    const name = t === 'railway' ? 'railway' : t === 'ban' ? 'ban' : 'camera';
    const wait = this.cue(name);
    this.speakTokens(cauPoiTokens(item), false, Math.max(240, wait - 30));
  }

  preview() {
    this.cue('preview');
  }

  voiceOn() {
    this.speakTokens(cauBatGiongTokens(), true, 80);
  }

  stopAll() {
    this.queue.length = 0;
    this._speakGen++;
    this.speaking = false;
    clearTimeout(this._speakTimer);
    clearTimeout(this._delayTimer);
    this._delayTimer = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
}
