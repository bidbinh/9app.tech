// Camera bằng getUserMedia. Chụp = lấy khung hình video ở độ phân giải gốc của cảm biến.
import { makeCanvas } from './render.js';

export class Camera {
  constructor(video) { this.video = video; this.stream = null; this.facing = 'environment'; this.torchOn = false; this.gen = 0; }

  static get supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  async start(facing = this.facing) {
    this.stop();
    const gen = this.gen;
    this.facing = facing;
    const tries = [
      { video: { facingMode: { ideal: facing }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false },
      { video: { facingMode: { ideal: facing } }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr;
    for (const c of tries) {
      try { this.stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) {
        lastErr = e;
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
      }
    }
    if (gen !== this.gen) { // đã bị dừng trong lúc chờ cấp quyền/khởi động
      if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
      return this;
    }
    if (!this.stream) throw lastErr || new Error('Không mở được camera');
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play().catch(() => {});
    if (!this.video.videoWidth) {
      await new Promise((res) => { this.video.onloadedmetadata = res; setTimeout(res, 1500); });
    }
    this.torchOn = false;
    const tr = this.stream && this.stream.getVideoTracks()[0];
    if (tr) tr.addEventListener('ended', () => { if (this.stream && gen === this.gen && this.onended) this.onended(); });
    return this;
  }

  get hasTorch() {
    try {
      const t = this.stream && this.stream.getVideoTracks()[0];
      const caps = t && t.getCapabilities && t.getCapabilities();
      return !!(caps && caps.torch);
    } catch (e) { return false; }
  }

  async setTorch(on) {
    const t = this.stream && this.stream.getVideoTracks()[0];
    if (!t) return false;
    try { await t.applyConstraints({ advanced: [{ torch: !!on }] }); this.torchOn = !!on; return true; } catch (e) { return false; }
  }

  /** Chụp một khung hình thành canvas. */
  capture() {
    const v = this.video;
    if (!v.videoWidth) throw new Error('Camera chưa sẵn sàng');
    const c = makeCanvas(v.videoWidth, v.videoHeight);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c;
  }

  stop() {
    this.gen++;
    if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
    if (this.video) this.video.srcObject = null;
  }
}

/** Thông báo lỗi camera bằng tiếng Việt, dễ hiểu. */
export function cameraErrorMessage(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Chưa được cấp quyền camera. Hãy cho phép camera trong cài đặt trình duyệt, hoặc chọn ảnh từ thư viện.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Không tìm thấy camera trên thiết bị này. Bạn có thể chọn ảnh từ thư viện.';
  if (n === 'NotReadableError') return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.';
  if (!window.isSecureContext) return 'Camera chỉ hoạt động khi mở trang bằng https. Bạn vẫn có thể chọn ảnh từ thư viện.';
  return 'Không mở được camera. Bạn có thể chọn ảnh từ thư viện.';
}
