/** Đọc to bằng speechSynthesis (vi-VN). Đọc từng đoạn, báo đoạn đang đọc để tô sáng. */
import { speechText } from './logic.js?v=5'

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

let voicesReady = false
function viVoice() {
  try {
    const list = window.speechSynthesis.getVoices() || []
    voicesReady = list.length > 0
    return list.find((v) => /^vi/i.test(v.lang)) || null
  } catch {
    return null
  }
}

/** Chia đoạn dài thành các câu ngắn để trình duyệt không bị cắt giữa chừng. */
export function chunkText(text, max = 180) {
  const parts = (String(text).match(/[^.!?;:]+[.!?;:]*\s*/g) || [])
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  for (const p of parts) {
    if (p.length <= max) out.push(p)
    else {
      let cur = ''
      for (const w of p.split(/\s+/)) {
        if ((cur + ' ' + w).length > max && cur) {
          out.push(cur)
          cur = w
        } else cur = cur ? cur + ' ' + w : w
      }
      if (cur) out.push(cur)
    }
  }
  return out
}

export function createReader({ onState, onParagraph }) {
  let token = 0
  let state = 'idle'
  const set = (s) => {
    state = s
    onState && onState(s)
  }
  return {
    get state() {
      return state
    },
    hasVietnameseVoice() {
      viVoice()
      return voicesReady ? !!viVoice() : null
    },
    play(paragraphs) {
      if (!speechSupported()) return false
      const synth = window.speechSynthesis
      synth.cancel()
      const my = ++token
      const queue = []
      paragraphs.forEach((p, i) => {
        for (const c of chunkText(speechText(p))) queue.push({ text: c, para: i })
      })
      if (!queue.length) return false
      const voice = viVoice()
      let idx = 0
      const next = () => {
        if (my !== token) return
        if (idx >= queue.length) {
          onParagraph && onParagraph(-1)
          set('idle')
          return
        }
        const q = queue[idx++]
        const u = new SpeechSynthesisUtterance(q.text)
        u.lang = 'vi-VN'
        if (voice) u.voice = voice
        u.rate = 0.85
        u.onstart = () => onParagraph && onParagraph(q.para)
        u.onend = next
        u.onerror = (e) => {
          if (my !== token) return
          if (e && (e.error === 'canceled' || e.error === 'interrupted')) return
          next()
        }
        synth.speak(u)
      }
      set('playing')
      next()
      return true
    },
    pause() {
      if (state !== 'playing') return
      try {
        window.speechSynthesis.pause()
      } catch {
        /* bỏ qua */
      }
      set('paused')
    },
    resume() {
      if (state !== 'paused') return
      try {
        window.speechSynthesis.resume()
      } catch {
        /* bỏ qua */
      }
      set('playing')
    },
    stop() {
      token++
      try {
        window.speechSynthesis && window.speechSynthesis.cancel()
      } catch {
        /* bỏ qua */
      }
      onParagraph && onParagraph(-1)
      set('idle')
    },
  }
}
