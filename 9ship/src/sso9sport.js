// Dùng chung tài khoản với 9Sport: khi số điện thoại chưa có ở 9Ship, xác minh mật khẩu với 9Sport.
// Gọi trang đăng nhập cá nhân của 9Sport (POST /dang-nhap, form sdt + mat_khau) qua mạng nội bộ; thành công khi 9Sport
// chuyển hướng kèm cookie phiên "k77_nd". Không sửa gì ở 9Sport. Tắt khi SSO_9SPORT_URL để trống.
import { config } from './config.js';

export const enabled = () => Boolean(config.sso9sportUrl);

export async function verify(phone, password) {
  if (!enabled()) return { ok: false, skipped: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.sso9sportTimeoutMs);
  try {
    const res = await fetch(config.sso9sportUrl.replace(/\/+$/, '') + '/dang-nhap', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ sdt: phone, mat_khau: password, tiep: '/' }).toString(),
      signal: ctl.signal,
    });
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const ok = res.status >= 300 && res.status < 400 && cookies.some((c) => /^k77_nd=[^;]+/.test(c));
    let name = '';
    if (ok) {
      try {
        const loc = new URL(res.headers.get('location') || '/', 'http://x');
        const m = (loc.searchParams.get('tb') || '').match(/^Xin chào,\s*(.+)$/);
        if (m) name = m[1].trim().slice(0, 80);
      } catch { /* không lấy được tên: bỏ qua */ }
    }
    return { ok, name };
  } catch (e) {
    return { ok: false, error: true, message: e.name === 'AbortError' ? 'quá thời gian' : e.message };
  } finally { clearTimeout(timer); }
}
