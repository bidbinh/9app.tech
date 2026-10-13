# 9ticket (Chuyến của tôi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Webapp tĩnh PWA `ticket/` gom chuyến bay, tàu, xe khách của một người: thêm chuyến, nhắc mốc ra sân bay/ga/bến, vé ngoại tuyến, xuất .ics, chia tiền nhóm; trạng thái chuyến dùng nguồn cắm được (dữ liệu mẫu bây giờ, Datacom sau).

**Architecture:** HTML + CSS + JS thuần (ES module, không bundler) như `race/`. Logic thuần (`time`, `model`, `store`, `airport`, `split`, `ics`, `parse`, `status`) tách khỏi giao diện (`app.js`) để test bằng `node:test`. Dữ liệu ở `localStorage`. Không mạng ngoài, không đăng nhập.

**Tech Stack:** Node 20+ (`node:test`), JS thuần, puppeteer-core + Chrome cho e2e (như `race/scripts/e2e.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-12-9ticket-design.md`

**Lệch so với spec (cố ý, ghi ở đây để người duyệt biết):**
1. Thêm `js/time.js` (xử lý giờ kèm múi giờ) và `js/sample.js` thay cho `data/sample.json` (chuyến mẫu phải tính theo ngày hiện tại, JSON tĩnh sẽ cũ).
2. "Cách 1: nhập mã đặt chỗ + hãng + ngày" gộp vào form nhập tay (không có API thì không tra được chuyến từ mã). Giao diện còn hai đường: **Dán nội dung vé** (đọc ra rồi điền sẵn form để soát) và **Nhập tay**.
3. `arriveAt` có thể trống (nhiều vé SMS không có giờ đến); khi đó coi chuyến kết thúc sau 6 giờ kể từ giờ đi.
4. Thêm trường `leadMin` (tùy chọn) để chỉnh mốc ra sân bay như spec mục 5.
5. Trạm tàu/xe không có mã (`code: ""`), chỉ sân bay có mã IATA; không tự bịa mã ga.

## Global Constraints

- Thư mục: `D:\9app.tech\ticket\`. Không sửa launcher, không deploy, không đụng thư mục app khác.
- Tên app **9ticket**, giao diện tiếng Việt, `lang="vi"`, mobile-first, sáng/tối theo hệ thống, nút `‹ 9app` trỏ `https://9app.tech/`.
- CSP đúng nguyên văn: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`. Không script/style nội tuyến, không thuộc tính `style=` trong HTML sinh ra; nội dung người dùng nhập chỉ gắn bằng `textContent`/`createTextNode`.
- Giờ lưu dạng ISO có offset (`2026-11-15T06:30:00+07:00`), hiển thị đúng giờ địa phương theo offset đã lưu.
- Mốc ra bến mặc định: bay nội địa 120 phút, bay quốc tế 180, tàu 45, xe 30.
- Giới hạn: tối đa 500 chuyến, 20 hành khách/chuyến, 50 khoản chi/chuyến, văn bản dán tối đa 20.000 ký tự, tệp nhập tối đa 2.000.000 ký tự.
- Không thu số CCCD/hộ chiếu. Không gọi mạng ngoài. Trạng thái chuyến chưa có nguồn thì hiện "chưa có thông tin", không bịa "đúng giờ".
- Commit cuối mỗi task, thông điệp tiếng Việt, kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Git trên máy này chưa có `user.name`/`user.email`: dùng `git -c user.name="Claude (9ship build)" -c user.email=ttrongbinh@gmail.com commit ...`.
- Chạy lệnh test từ thư mục `ticket/`: `npm test`.

## Review Focus

1. Chuyến qua nửa đêm, bay quốc tế offset khác `+07:00` (ví dụ `+09:00`), đến ngày hôm sau: giờ hiển thị và `.ics` phải đúng giờ địa phương/UTC (Task 2, 7).
2. Dán nội dung không phải vé, rỗng, hoặc rất dài (200 KB): báo rõ, không treo, không lưu gì (Task 8).
3. `localStorage` hỏng/bị chặn/đầy: app vẫn chạy bằng bộ nhớ tạm và báo "dữ liệu sẽ mất khi đóng" (Task 4, 10).
4. Tên hành khách/ghi chú chứa HTML (`<img src=x onerror=...>`): hiển thị nguyên văn, không chạy (Task 3, 10, 12).
5. Chia tiền: một người, số lẻ không chia hết, số tiền 0/âm/quá lớn/không phải số: tổng chuyển luôn bằng tổng nợ, không `NaN` (Task 6).

---

### Task 1: Khung thư mục và vỏ trang

**Files:**
- Create: `ticket/package.json`, `ticket/index.html`, `ticket/manifest.webmanifest`, `ticket/css/style.css`, `ticket/icons/icon.svg`, `ticket/scripts/serve.mjs`, `ticket/tests/shell.test.mjs`
- Create (placeholder để vỏ chạy được, Task 10 thay): `ticket/js/app.js`

**Interfaces:**
- Produces: `startServer(port?) -> Promise<http.Server>` trong `scripts/serve.mjs`; `index.html` có `<main id="main">`, `<nav>` với `a[data-nav="list"]` và `a[data-nav="about"]`, `<script type="module" src="js/app.js">`.

- [ ] **Step 1: package.json**

```json
{
  "name": "9ticket",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "9ticket: trợ lý chuyến đi cho vé bay, tàu, xe khách (webapp tĩnh PWA)",
  "scripts": {
    "test": "node --test tests/",
    "e2e": "node scripts/e2e.mjs",
    "serve": "node scripts/serve.mjs"
  }
}
```

- [ ] **Step 2: Chép máy chủ tĩnh của 9race**

Run (từ `D:\9app.tech`): `mkdir -p ticket/scripts ticket/tests ticket/js ticket/css ticket/icons ticket/data && cp race/scripts/serve.mjs ticket/scripts/serve.mjs`
Rồi trong `ticket/scripts/serve.mjs` sửa regex chặn thư mục giữ nguyên (`tests|scripts|shots|node_modules`). Không đổi gì khác.

- [ ] **Step 3: Viết test vỏ trang (failing)**

`ticket/tests/shell.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../scripts/serve.mjs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";

test('index.html: CSP đúng, không script/style nội tuyến, có khung cần thiết', () => {
  const html = read('index.html');
  assert.ok(html.includes(`content="${CSP}"`));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'có script nội tuyến');
  assert.ok(!/<style[\s>]/i.test(html), 'có style nội tuyến');
  assert.ok(!/\sstyle=/i.test(html), 'có thuộc tính style');
  assert.ok(html.includes('lang="vi"'));
  assert.ok(html.includes('href="https://9app.tech/"'));
  assert.ok(html.includes('id="main"'));
  assert.ok(html.includes('data-nav="list"') && html.includes('data-nav="about"'));
  assert.ok(html.includes('<script type="module" src="js/app.js">'));
});

test('manifest hợp lệ', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.short_name, '9ticket');
  assert.equal(m.start_url, './index.html');
  assert.ok(m.icons.length >= 3);
});

test('máy chủ tĩnh phục vụ index.html và chặn thư mục tests', async () => {
  const s = await startServer(0);
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const a = await fetch(base + '/index.html');
    assert.equal(a.status, 200);
    const b = await fetch(base + '/tests/shell.test.mjs');
    assert.equal(b.status, 404);
  } finally { s.close(); }
});
```

- [ ] **Step 4: Run, thấy FAIL**

Run: `cd ticket && npm test`
Expected: FAIL (thiếu `index.html`).

- [ ] **Step 5: Viết `index.html`**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f4f7f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1a1d" media="(prefers-color-scheme: dark)">
<meta name="description" content="Gom vé máy bay, tàu, xe khách của bạn: nhắc giờ ra bến, vé ngoại tuyến, chia tiền nhóm.">
<title>9ticket — Chuyến của tôi</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="9ticket">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<a class="skip" href="#main">Bỏ qua tới nội dung</a>
<header class="top">
  <div class="top-row">
    <a class="home" href="https://9app.tech/" aria-label="Về 9app">&#8249; 9app</a>
    <a class="brand" href="#/" aria-label="9ticket, về danh sách chuyến">9ticket</a>
  </div>
  <nav class="tabs" aria-label="Điều hướng chính">
    <a href="#/" data-nav="list">Chuyến</a>
    <a href="#/about" data-nav="about">Về app</a>
  </nav>
</header>
<main id="main" tabindex="-1"><p class="muted pad">Đang tải…</p></main>
<noscript><p class="pad">9ticket cần bật JavaScript.</p></noscript>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 6: manifest, icon, css khung, app.js tạm**

`manifest.webmanifest`:
```json
{
  "name": "9ticket — Chuyến của tôi",
  "short_name": "9ticket",
  "description": "Gom vé máy bay, tàu, xe khách: nhắc giờ ra bến, vé ngoại tuyến, chia tiền nhóm.",
  "lang": "vi",
  "dir": "ltr",
  "id": "./",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f4f7f8",
  "theme_color": "#0e7490",
  "categories": ["travel", "utilities"],
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`icons/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="9ticket">
  <rect width="512" height="512" rx="112" fill="#0e7490"/>
  <path d="M96 168a24 24 0 0 1 24-24h272a24 24 0 0 1 24 24v44a44 44 0 0 0 0 88v44a24 24 0 0 1-24 24H120a24 24 0 0 1-24-24v-44a44 44 0 0 0 0-88z" fill="#ffffff"/>
  <text x="256" y="320" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="176" font-weight="900" fill="#0e7490">9</text>
</svg>
```

`css/style.css` (khung; Task 10 mở rộng): chép khối `:root` và `@media (prefers-color-scheme: dark)` dưới đây, cộng quy tắc chung.

```css
/* 9ticket: mobile trước, sáng/tối theo hệ thống, chữ lớn. */
:root {
  --bg: #f4f7f8; --surface: #ffffff; --surface-2: #e8eef0; --text: #1b1f23; --muted: #4b5860;
  --line: #cfd9de; --accent: #0e7490; --accent-ink: #ffffff; --accent-soft: #d6f0f7; --focus: #1d4ed8;
  --ok-fg: #14532d; --ok-bg: #d7f3df; --warn-fg: #7c2d12; --warn-bg: #ffe2cc;
  --bad-fg: #7f1d1d; --bad-bg: #fcdcdc; --info-fg: #334155; --info-bg: #e2e8f0;
  --radius: 14px; --safe-b: env(safe-area-inset-bottom, 0px);
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1a1d; --surface: #172428; --surface-2: #213238; --text: #eef5f7; --muted: #b3c3c9;
    --line: #2f434a; --accent: #5fd0e8; --accent-ink: #04222a; --accent-soft: #123640; --focus: #8fb4ff;
    --ok-fg: #c3f0cf; --ok-bg: #173a24; --warn-fg: #ffd2b5; --warn-bg: #4d2810;
    --bad-fg: #ffd0d0; --bad-bg: #4d1c1c; --info-fg: #cbd5e1; --info-bg: #263238;
  }
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding-bottom: var(--safe-b); }
a { color: var(--accent); }
.skip { position: absolute; left: -999px; top: 0; background: var(--surface); padding: 8px 12px; z-index: 10; }
.skip:focus { left: 8px; top: 8px; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.muted { color: var(--muted); }
.pad { padding: 16px; }
```

`js/app.js` tạm: `document.getElementById('main').textContent = '9ticket';`

- [ ] **Step 7: Run, thấy PASS**

Run: `cd ticket && npm test`
Expected: PASS 3 test.

- [ ] **Step 8: Commit**

```bash
git add ticket && git -c user.name="Claude (9ship build)" -c user.email=ttrongbinh@gmail.com commit -m "9ticket: khung thư mục, vỏ trang, máy chủ tĩnh

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `time.js` (giờ kèm múi giờ)

**Files:**
- Create: `ticket/js/time.js`
- Test: `ticket/tests/time.test.mjs`

**Interfaces:**
- Produces: `parseIso(iso) -> {ms, offsetMin} | null` (null nếu thiếu offset, ngày không tồn tại, giờ > 23:59); `offsetString(min) -> '+07:00'`; `toIso(ms, offsetMin) -> 'YYYY-MM-DDTHH:MM:00+07:00'`; `shiftIso(iso, deltaMin) -> iso | null` (giữ offset); `fmtDate(iso) -> 'dd/mm/yyyy'`; `fmtTime(iso) -> 'HH:MM'`; `fmtDayLabel(iso) -> 'CN'|'T2'..'T7'`. Cả `fmt*` trả `''` nếu iso không hợp lệ.

- [ ] **Step 1: Viết test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIso, offsetString, toIso, shiftIso, fmtDate, fmtTime, fmtDayLabel } from '../js/time.js';

test('parseIso: hợp lệ, đổi ra ms UTC theo offset', () => {
  const p = parseIso('2026-11-15T06:30:00+07:00');
  assert.equal(p.ms, Date.UTC(2026, 10, 14, 23, 30));
  assert.equal(p.offsetMin, 420);
  assert.equal(parseIso('2026-11-15T06:30Z').offsetMin, 0);
  assert.equal(parseIso('2026-11-15T06:30:00-05:30').offsetMin, -330);
});

test('parseIso: từ chối thiếu offset, ngày/giờ không tồn tại, rác', () => {
  assert.equal(parseIso('2026-11-15T06:30:00'), null);
  assert.equal(parseIso('2026-02-30T06:30:00+07:00'), null);
  assert.equal(parseIso('2026-11-15T25:30:00+07:00'), null);
  assert.equal(parseIso('2026-11-15T24:00:00+07:00'), null);
  assert.equal(parseIso('2026-11-15T06:61:00+07:00'), null);
  assert.equal(parseIso(''), null);
  assert.equal(parseIso(null), null);
  assert.equal(parseIso('<img onerror=x>'), null);
});

test('offsetString và toIso', () => {
  assert.equal(offsetString(420), '+07:00');
  assert.equal(offsetString(0), '+00:00');
  assert.equal(offsetString(-330), '-05:30');
  assert.equal(toIso(Date.UTC(2026, 10, 14, 23, 30), 420), '2026-11-15T06:30:00+07:00');
});

test('shiftIso: qua nửa đêm, giữ offset quốc tế', () => {
  assert.equal(shiftIso('2026-11-15T01:00:00+07:00', -120), '2026-11-14T23:00:00+07:00');
  assert.equal(shiftIso('2026-11-15T06:30:00+09:00', 0), '2026-11-15T06:30:00+09:00');
  assert.equal(shiftIso('2026-12-31T23:30:00+09:00', 60), '2027-01-01T00:30:00+09:00');
  assert.equal(shiftIso('rác', 5), null);
});

test('fmtDate/fmtTime/fmtDayLabel theo giờ địa phương của offset đã lưu', () => {
  const iso = '2026-11-15T06:30:00+07:00';
  assert.equal(fmtDate(iso), '15/11/2026');
  assert.equal(fmtTime(iso), '06:30');
  assert.equal(fmtDayLabel(iso), 'CN');
  assert.equal(fmtTime('2026-11-15T23:55:00+09:00'), '23:55');
  assert.equal(fmtDayLabel('2026-11-16T00:10:00+09:00'), 'T2');
  assert.equal(fmtDate('rác'), '');
});
```

- [ ] **Step 2: Run, FAIL** (`npm test` → "Cannot find module '../js/time.js'").

- [ ] **Step 3: Cài đặt `js/time.js`**

```js
// Giờ kèm múi giờ: lưu ISO có offset, hiển thị đúng giờ địa phương của offset đó.
const RE = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function parseIso(iso) {
  const m = RE.exec(typeof iso === 'string' ? iso : '');
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  let off = 0;
  if (z !== 'Z') {
    const hh = +z.slice(1, 3), mm = +z.slice(4, 6);
    if (hh > 14 || mm > 59) return null;
    off = (z[0] === '-' ? -1 : 1) * (hh * 60 + mm);
  }
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  const dt = new Date(wall);
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d ||
      dt.getUTCHours() !== +h || dt.getUTCMinutes() !== +mi || +(s || 0) > 59) return null;
  return { ms: wall - off * 60000, offsetMin: off };
}

export function offsetString(min) {
  const a = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function toIso(ms, offsetMin) {
  const w = new Date(ms + offsetMin * 60000);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:00${offsetString(offsetMin)}`;
}

export function shiftIso(iso, deltaMin) {
  const p = parseIso(iso);
  return p ? toIso(p.ms + deltaMin * 60000, p.offsetMin) : null;
}

function wallOf(iso) {
  const p = parseIso(iso);
  return p ? new Date(p.ms + p.offsetMin * 60000) : null;
}
export function fmtDate(iso) {
  const w = wallOf(iso);
  return w ? `${pad(w.getUTCDate())}/${pad(w.getUTCMonth() + 1)}/${w.getUTCFullYear()}` : '';
}
export function fmtTime(iso) {
  const w = wallOf(iso);
  return w ? `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}` : '';
}
export function fmtDayLabel(iso) {
  const w = wallOf(iso);
  return w ? DAYS[w.getUTCDay()] : '';
}
```

- [ ] **Step 4: Run, PASS.**

- [ ] **Step 5: Commit** (`9ticket: xử lý giờ kèm múi giờ`, `git add ticket/js/time.js ticket/tests/time.test.mjs`).

---

### Task 3: `model.js` (kiểm tra chuyến, sắp xếp, đếm ngược)

**Files:**
- Create: `ticket/js/model.js`
- Test: `ticket/tests/model.test.mjs`

**Interfaces:**
- Consumes: `parseIso`, `toIso` từ `time.js`.
- Produces: `MODES`, `MODE_LABEL`, `MAX_PASSENGERS=20`, `MAX_PAYMENTS=50`; `newId() -> string`; `validateTrip(raw) -> {trip, errors}` (trip chuẩn hóa: `{id, mode, operator, code, from:{code,name}, to:{code,name}, departAt, arriveAt|null, pnr, passengers:[{name,seat,bag}], gate, terminal, note, payments:[{payer,amount,label}], leadMin|null}`; `departAt`/`arriveAt` được ghi lại dạng chuẩn `toIso`); `cleanTrip(raw) -> trip|null`; `tripEndMs(trip)`; `sortTrips(trips)`; `splitUpcoming(trips, nowMs) -> {upcoming, past}`; `countdown(departMs, nowMs) -> string`.

- [ ] **Step 1: Viết test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrip, cleanTrip, newId, sortTrips, splitUpcoming, countdown, tripEndMs, MODES, MAX_PASSENGERS } from '../js/model.js';

const base = () => ({
  id: 'abc1', mode: 'bay', operator: 'Vietjet Air', code: 'vj123',
  from: { code: 'han', name: 'Hà Nội' }, to: { code: 'SGN', name: 'TP. Hồ Chí Minh' },
  departAt: '2026-11-15T06:30:00Z', arriveAt: '2026-11-15T08:40:00+07:00',
});

test('validateTrip: chuẩn hóa mã, viết hoa, ghi lại giờ dạng chuẩn', () => {
  const { trip, errors } = validateTrip(base());
  assert.deepEqual(errors, []);
  assert.equal(trip.code, 'VJ123');
  assert.equal(trip.from.code, 'HAN');
  assert.equal(trip.departAt, '2026-11-15T06:30:00+00:00');
  assert.equal(trip.arriveAt, '2026-11-15T08:40:00+07:00');
  assert.deepEqual(trip.passengers, []);
  assert.equal(trip.leadMin, null);
});

test('validateTrip: báo từng lỗi bằng tiếng Việt', () => {
  const r = validateTrip({ mode: 'ufo', from: {}, to: null, departAt: 'rác' });
  assert.equal(r.trip, null);
  assert.ok(r.errors.length >= 4);
  assert.ok(r.errors.every((e) => typeof e === 'string' && e.length > 5));
});

test('validateTrip: giờ đến phải sau giờ đi; thiếu giờ đến thì cho phép', () => {
  assert.equal(validateTrip({ ...base(), arriveAt: '2026-11-15T05:00:00Z' }).trip, null);
  assert.equal(validateTrip({ ...base(), arriveAt: '' }).trip.arriveAt, null);
});

test('validateTrip: hành khách, chi tiêu, leadMin bị giới hạn và làm sạch', () => {
  const passengers = Array.from({ length: 30 }, (_, i) => ({ name: 'Khách ' + i, seat: '1A' }));
  const t = validateTrip({
    ...base(), passengers,
    payments: [{ payer: 'An', amount: 100000, label: 'Taxi' }, { payer: 'Bình', amount: -5 }, { payer: '', amount: 10 }, { payer: 'C', amount: 1.5 }, { payer: 'D', amount: 2e9 }],
    leadMin: 90,
  }).trip;
  assert.equal(t.passengers.length, MAX_PASSENGERS);
  assert.deepEqual(t.payments, [{ payer: 'An', amount: 100000, label: 'Taxi' }]);
  assert.equal(t.leadMin, 90);
  assert.equal(validateTrip({ ...base(), leadMin: 5000 }).trip.leadMin, null);
});

test('validateTrip: HTML trong tên/ghi chú được giữ nguyên văn (chỉ cắt độ dài), không bị đổi', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const t = validateTrip({ ...base(), passengers: [{ name: evil }], note: evil }).trip;
  assert.equal(t.passengers[0].name, evil);
  assert.equal(t.note, evil);
});

test('validateTrip: id không hợp lệ bị từ chối; newId hợp lệ', () => {
  assert.equal(validateTrip({ ...base(), id: '../x' }).trip, null);
  const id = newId();
  assert.ok(validateTrip({ ...base(), id }).trip);
  assert.notEqual(newId(), newId());
  assert.deepEqual(MODES, ['bay', 'tau', 'xe']);
  assert.equal(cleanTrip(null), null);
});

test('sắp xếp, tách sắp tới/đã đi, chuyến không có giờ đến kết thúc sau 6 giờ', () => {
  const mk = (id, dep, arr) => validateTrip({ ...base(), id, departAt: dep, arriveAt: arr }).trip;
  const a = mk('a', '2026-11-15T06:00:00+07:00', '2026-11-15T08:00:00+07:00');
  const b = mk('b', '2026-11-10T06:00:00+07:00', '2026-11-10T08:00:00+07:00');
  const c = mk('c', '2026-11-12T06:00:00+07:00', '');
  assert.deepEqual(sortTrips([a, b, c]).map((t) => t.id), ['b', 'c', 'a']);
  const now = Date.parse('2026-11-12T10:00:00+07:00'); // c bắt đầu 06:00, chưa quá 6 giờ
  const r = splitUpcoming([a, b, c], now);
  assert.deepEqual(r.upcoming.map((t) => t.id), ['c', 'a']);
  assert.deepEqual(r.past.map((t) => t.id), ['b']);
  assert.equal(tripEndMs(c), Date.parse('2026-11-12T12:00:00+07:00'));
  const later = Date.parse('2026-11-12T12:00:01+07:00');
  assert.deepEqual(splitUpcoming([c], later).past.map((t) => t.id), ['c']);
});

test('countdown', () => {
  const now = 1_000_000_000_000, m = 60000;
  assert.equal(countdown(now + 45 * m, now), 'còn 45 phút');
  assert.equal(countdown(now + 90 * m, now), 'còn 1 giờ 30 phút');
  assert.equal(countdown(now + 120 * m, now), 'còn 2 giờ');
  assert.equal(countdown(now + 50 * 60 * m, now), 'còn 2 ngày 2 giờ');
  assert.equal(countdown(now - 1, now), 'đã khởi hành');
});
```

- [ ] **Step 2: Run, FAIL.**

- [ ] **Step 3: Cài đặt `js/model.js`**

```js
import { parseIso, toIso } from './time.js';

export const MODES = ['bay', 'tau', 'xe'];
export const MODE_LABEL = { bay: 'Chuyến bay', tau: 'Tàu hỏa', xe: 'Xe khách' };
export const MAX_PASSENGERS = 20;
export const MAX_PAYMENTS = 50;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function newId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

function place(v) {
  if (!v || typeof v !== 'object') return null;
  const name = str(v.name, 80);
  const code = str(v.code, 8).toUpperCase();
  if (!name && !code) return null;
  return { code, name: name || code };
}

export function validateTrip(raw) {
  if (!raw || typeof raw !== 'object') return { trip: null, errors: ['Dữ liệu chuyến không hợp lệ.'] };
  const errors = [];
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : null;
  if (!id) errors.push('Thiếu hoặc sai mã chuyến.');
  const mode = MODES.includes(raw.mode) ? raw.mode : null;
  if (!mode) errors.push('Chọn loại chuyến: bay, tàu hoặc xe.');
  const from = place(raw.from), to = place(raw.to);
  if (!from) errors.push('Thiếu nơi đi.');
  if (!to) errors.push('Thiếu nơi đến.');
  const dp = parseIso(raw.departAt);
  if (!dp) errors.push('Giờ đi không hợp lệ (cần ngày, giờ và múi giờ).');
  let arriveAt = null;
  if (raw.arriveAt) {
    const ap = parseIso(raw.arriveAt);
    if (!ap) errors.push('Giờ đến không hợp lệ.');
    else if (dp && ap.ms < dp.ms) errors.push('Giờ đến phải sau giờ đi.');
    else arriveAt = toIso(ap.ms, ap.offsetMin);
  }
  if (errors.length) return { trip: null, errors };

  const passengers = (Array.isArray(raw.passengers) ? raw.passengers : []).slice(0, MAX_PASSENGERS)
    .map((p) => ({ name: str(p && p.name, 60), seat: str(p && p.seat, 8), bag: str(p && p.bag, 20) }))
    .filter((p) => p.name);
  const payments = (Array.isArray(raw.payments) ? raw.payments : []).slice(0, MAX_PAYMENTS)
    .map((p) => ({ payer: str(p && p.payer, 40), amount: p ? p.amount : NaN, label: str(p && p.label, 60) }))
    .filter((p) => p.payer && Number.isInteger(p.amount) && p.amount > 0 && p.amount <= 1e9);
  const leadMin = Number.isInteger(raw.leadMin) && raw.leadMin >= 0 && raw.leadMin <= 720 ? raw.leadMin : null;

  return {
    trip: {
      id, mode,
      operator: str(raw.operator, 60),
      code: str(raw.code, 12).toUpperCase(),
      from, to,
      departAt: toIso(dp.ms, dp.offsetMin),
      arriveAt,
      pnr: str(raw.pnr, 10).toUpperCase().replace(/[^A-Z0-9]/g, ''),
      passengers,
      gate: str(raw.gate, 10),
      terminal: str(raw.terminal, 10),
      note: str(raw.note, 1000),
      payments,
      leadMin,
    },
    errors: [],
  };
}

export const cleanTrip = (raw) => validateTrip(raw).trip;

const departMs = (t) => parseIso(t.departAt).ms;
export function tripEndMs(t) {
  return t.arriveAt ? parseIso(t.arriveAt).ms : departMs(t) + 6 * 3600000;
}
export const sortTrips = (trips) => trips.slice().sort((a, b) => departMs(a) - departMs(b));

export function splitUpcoming(trips, nowMs) {
  const sorted = sortTrips(trips);
  return {
    upcoming: sorted.filter((t) => tripEndMs(t) >= nowMs),
    past: sorted.filter((t) => tripEndMs(t) < nowMs).reverse(),
  };
}

export function countdown(depMs, nowMs) {
  const d = depMs - nowMs;
  if (d <= 0) return 'đã khởi hành';
  const min = Math.floor(d / 60000);
  if (min < 60) return `còn ${min} phút`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `còn ${h} giờ ${min % 60} phút` : `còn ${h} giờ`;
  return `còn ${Math.floor(h / 24)} ngày ${h % 24} giờ`;
}
```

- [ ] **Step 4: Run, PASS.** (Nếu test "id hợp lệ" của `newId` lỗi vì `Math.random().toString(36)` ngắn, `padEnd(4,'0')` đã xử lý.)

- [ ] **Step 5: Commit** (`9ticket: mô hình chuyến, kiểm tra, sắp xếp, đếm ngược`).

---

### Task 4: `store.js` (lưu trên máy, xuất/nhập)

**Files:**
- Create: `ticket/js/store.js`
- Test: `ticket/tests/store.test.mjs`

**Interfaces:**
- Consumes: `validateTrip` từ `model.js`.
- Produces: `createStore(getStorage) -> {load(), get(id), upsert(raw) -> {trip, errors}, remove(id), exportJson() -> string, importJson(text) -> {added, updated, skipped} | {error}, isPersistent() -> boolean}`; hằng `KEY='9ticket.trips.v1'`, `MAX_TRIPS=500`, `MAX_IMPORT_CHARS=2000000`. `getStorage` là hàm trả về đối tượng giống `localStorage` (có thể ném lỗi).

- [ ] **Step 1: Test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEY, MAX_TRIPS } from '../js/store.js';

function fake(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
}
const trip = (id, extra = {}) => ({
  id, mode: 'tau', code: 'se1', from: { name: 'Hà Nội' }, to: { name: 'Sài Gòn' },
  departAt: '2026-11-20T19:20:00+07:00', arriveAt: '2026-11-22T04:10:00+07:00', ...extra,
});

test('upsert + load + get + remove', () => {
  const s = createStore(() => fake());
  assert.deepEqual(s.load(), []);
  assert.deepEqual(s.upsert(trip('a1')).errors, []);
  s.upsert(trip('a2'));
  s.upsert(trip('a1', { note: 'sửa' }));
  assert.equal(s.load().length, 2);
  assert.equal(s.get('a1').note, 'sửa');
  s.remove('a1');
  assert.equal(s.get('a1'), null);
  assert.equal(s.isPersistent(), true);
});

test('upsert không lưu dữ liệu sai và trả lỗi', () => {
  const s = createStore(() => fake());
  const r = s.upsert({ id: 'x', mode: 'bay' });
  assert.equal(r.trip, null);
  assert.ok(r.errors.length);
  assert.deepEqual(s.load(), []);
});

test('dữ liệu hỏng trong localStorage: bỏ qua, không ném lỗi', () => {
  for (const bad of ['{bad json', '{"a":1}', 'null', '[1,"x",{"id":"../x"}]']) {
    const s = createStore(() => fake({ [KEY]: bad }));
    assert.deepEqual(s.load(), []);
  }
  const s = createStore(() => fake({ [KEY]: JSON.stringify([trip('ok1'), { id: 'bad' }]) }));
  assert.deepEqual(s.load().map((t) => t.id), ['ok1']);
});

test('localStorage bị chặn hoặc đầy: rơi về bộ nhớ tạm, báo không bền', () => {
  const blocked = createStore(() => { throw new Error('SecurityError'); });
  assert.deepEqual(blocked.load(), []);
  assert.ok(blocked.upsert(trip('m1')).trip);
  assert.equal(blocked.get('m1').id, 'm1');
  assert.equal(blocked.isPersistent(), false);

  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const s = createStore(() => full);
  assert.ok(s.upsert(trip('q1')).trip);
  assert.equal(s.isPersistent(), false);
  assert.equal(s.load().length, 1);
});

test('xuất/nhập JSON: gộp theo id, bỏ chuyến sai, giới hạn kích thước', () => {
  const a = createStore(() => fake());
  a.upsert(trip('e1')); a.upsert(trip('e2'));
  const json = a.exportJson();
  assert.equal(JSON.parse(json).app, '9ticket');
  const b = createStore(() => fake());
  b.upsert(trip('e1', { note: 'cũ' }));
  const r = b.importJson(json);
  assert.deepEqual(r, { added: 1, updated: 1, skipped: 0 });
  assert.equal(b.get('e1').note, '');
  const mixed = JSON.stringify({ app: '9ticket', version: 1, trips: [trip('n1'), { id: 'sai' }] });
  assert.deepEqual(b.importJson(mixed), { added: 1, updated: 0, skipped: 1 });
  assert.ok(b.importJson('không phải json').error);
  assert.ok(b.importJson('x'.repeat(2_000_001)).error);
  assert.ok(b.importJson(JSON.stringify({ trips: 5 })).error);
});

test('trần số chuyến', () => {
  const s = createStore(() => fake());
  for (let i = 0; i < MAX_TRIPS; i++) s.upsert(trip('t' + i));
  const r = s.upsert(trip('tover'));
  assert.equal(r.trip, null);
  assert.ok(r.errors[0].includes('500'));
  assert.equal(s.load().length, MAX_TRIPS);
});
```

- [ ] **Step 2: Run, FAIL.**

- [ ] **Step 3: Cài đặt `js/store.js`**

```js
import { validateTrip } from './model.js';

export const KEY = '9ticket.trips.v1';
export const MAX_TRIPS = 500;
export const MAX_IMPORT_CHARS = 2_000_000;

export function createStore(getStorage) {
  let mem = [];
  let persistent = true;

  const storage = () => { try { return getStorage(); } catch { return null; } };

  function load() {
    if (!persistent) return mem.slice();
    const s = storage();
    if (!s) { persistent = false; return mem.slice(); }
    try {
      const raw = s.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, MAX_TRIPS).map((t) => validateTrip(t).trip).filter(Boolean);
    } catch { return []; }
  }

  function save(list) {
    mem = list.slice();
    const s = storage();
    if (!s) { persistent = false; return false; }
    try { s.setItem(KEY, JSON.stringify(list)); persistent = true; return true; }
    catch { persistent = false; return false; }
  }

  const get = (id) => load().find((t) => t.id === id) || null;

  function upsert(raw) {
    const r = validateTrip(raw);
    if (!r.trip) return r;
    const list = load();
    const i = list.findIndex((t) => t.id === r.trip.id);
    if (i < 0 && list.length >= MAX_TRIPS) return { trip: null, errors: [`Đã đủ ${MAX_TRIPS} chuyến, hãy xóa bớt.`] };
    if (i >= 0) list[i] = r.trip; else list.push(r.trip);
    save(list);
    return r;
  }

  function remove(id) { save(load().filter((t) => t.id !== id)); }

  function exportJson() {
    return JSON.stringify({ app: '9ticket', version: 1, exportedAt: new Date().toISOString(), trips: load() }, null, 2);
  }

  function importJson(text) {
    if (typeof text !== 'string' || text.length > MAX_IMPORT_CHARS) return { error: 'Tệp quá lớn hoặc không đọc được.' };
    let doc;
    try { doc = JSON.parse(text); } catch { return { error: 'Tệp không phải JSON hợp lệ.' }; }
    const incoming = Array.isArray(doc) ? doc : doc && doc.trips;
    if (!Array.isArray(incoming)) return { error: 'Tệp không có danh sách chuyến.' };
    const list = load();
    let added = 0, updated = 0, skipped = 0;
    for (const raw of incoming) {
      const t = validateTrip(raw).trip;
      if (!t) { skipped++; continue; }
      const i = list.findIndex((x) => x.id === t.id);
      if (i >= 0) { list[i] = t; updated++; }
      else if (list.length < MAX_TRIPS) { list.push(t); added++; }
      else skipped++;
    }
    save(list);
    return { added, updated, skipped };
  }

  return { load, get, upsert, remove, exportJson, importJson, isPersistent: () => persistent };
}
```

- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** (`9ticket: lưu chuyến trên máy, xuất/nhập JSON`).

---

### Task 5: `airport.js` và `data/stations.json`

**Files:**
- Create: `ticket/js/airport.js`, `ticket/data/stations.json`
- Test: `ticket/tests/airport.test.mjs`

**Interfaces:**
- Consumes: `shiftIso` từ `time.js`.
- Produces: `LEAD`, `isInternational(trip, stations) -> boolean`, `leadMinutes(trip, international) -> number` (ưu tiên `trip.leadMin`), `leaveByIso(trip, international) -> iso|null`, `placeWord(mode) -> 'sân bay'|'ga'|'bến'`. `stations.json` là mảng `{code, name, aliases[], country, tz, kinds[]}`; `code` rỗng với ga/bến; `tz` dạng `+07:00`.

- [ ] **Step 1: Viết `data/stations.json`** (đủ để dùng, mở rộng sau; alias viết không dấu, chữ thường):

```json
[
  {"code":"HAN","name":"Hà Nội","aliases":["ha noi","noi bai"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"SGN","name":"TP. Hồ Chí Minh","aliases":["ho chi minh","tp hcm","tphcm","sai gon","tan son nhat"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"DAD","name":"Đà Nẵng","aliases":["da nang"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"CXR","name":"Nha Trang","aliases":["nha trang","cam ranh"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"PQC","name":"Phú Quốc","aliases":["phu quoc"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"HPH","name":"Hải Phòng","aliases":["hai phong","cat bi"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"VII","name":"Vinh","aliases":["vinh"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"HUI","name":"Huế","aliases":["hue","phu bai"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"UIH","name":"Quy Nhơn","aliases":["quy nhon","phu cat"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"DLI","name":"Đà Lạt","aliases":["da lat","lien khuong"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"VCA","name":"Cần Thơ","aliases":["can tho"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"BMV","name":"Buôn Ma Thuột","aliases":["buon ma thuot"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"THD","name":"Thanh Hóa","aliases":["thanh hoa","tho xuan"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"VDO","name":"Quảng Ninh","aliases":["quang ninh","van don"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"VCL","name":"Tam Kỳ","aliases":["tam ky","chu lai"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"TBB","name":"Tuy Hòa","aliases":["tuy hoa"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"PXU","name":"Pleiku","aliases":["pleiku"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"VCS","name":"Côn Đảo","aliases":["con dao"],"country":"VN","tz":"+07:00","kinds":["bay"]},
  {"code":"BKK","name":"Bangkok","aliases":["bangkok","suvarnabhumi"],"country":"TH","tz":"+07:00","kinds":["bay"]},
  {"code":"SIN","name":"Singapore","aliases":["singapore","changi"],"country":"SG","tz":"+08:00","kinds":["bay"]},
  {"code":"KUL","name":"Kuala Lumpur","aliases":["kuala lumpur"],"country":"MY","tz":"+08:00","kinds":["bay"]},
  {"code":"HKG","name":"Hồng Kông","aliases":["hong kong"],"country":"HK","tz":"+08:00","kinds":["bay"]},
  {"code":"TPE","name":"Đài Bắc","aliases":["dai bac","taipei"],"country":"TW","tz":"+08:00","kinds":["bay"]},
  {"code":"ICN","name":"Seoul","aliases":["seoul","incheon"],"country":"KR","tz":"+09:00","kinds":["bay"]},
  {"code":"NRT","name":"Tokyo (Narita)","aliases":["tokyo","narita"],"country":"JP","tz":"+09:00","kinds":["bay"]},
  {"code":"KIX","name":"Osaka","aliases":["osaka","kansai"],"country":"JP","tz":"+09:00","kinds":["bay"]},
  {"code":"","name":"Ga Hà Nội","aliases":["ha noi"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Sài Gòn","aliases":["sai gon","ho chi minh"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Đà Nẵng","aliases":["da nang"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Huế","aliases":["hue"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Nha Trang","aliases":["nha trang"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Vinh","aliases":["vinh"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Đồng Hới","aliases":["dong hoi"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Diêu Trì (Quy Nhơn)","aliases":["dieu tri","quy nhon"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Lào Cai","aliases":["lao cai"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Hải Phòng","aliases":["hai phong"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Thanh Hóa","aliases":["thanh hoa"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Ga Nam Định","aliases":["nam dinh"],"country":"VN","tz":"+07:00","kinds":["tau"]},
  {"code":"","name":"Hà Nội","aliases":["ha noi","my dinh","giap bat"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"TP. Hồ Chí Minh","aliases":["ho chi minh","tp hcm","tphcm","sai gon","mien dong","mien tay"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Đà Nẵng","aliases":["da nang"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Hải Phòng","aliases":["hai phong"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Đà Lạt","aliases":["da lat"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Nha Trang","aliases":["nha trang"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Huế","aliases":["hue"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Vũng Tàu","aliases":["vung tau"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Cần Thơ","aliases":["can tho"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Sa Pa","aliases":["sa pa","sapa"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Hà Giang","aliases":["ha giang"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Ninh Bình","aliases":["ninh binh"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Quy Nhơn","aliases":["quy nhon"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Buôn Ma Thuột","aliases":["buon ma thuot"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Vinh","aliases":["vinh"],"country":"VN","tz":"+07:00","kinds":["xe"]},
  {"code":"","name":"Thanh Hóa","aliases":["thanh hoa"],"country":"VN","tz":"+07:00","kinds":["xe"]}
]
```

- [ ] **Step 2: Test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEAD, isInternational, leadMinutes, leaveByIso, placeWord } from '../js/airport.js';

const stations = JSON.parse(fs.readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const trip = (o) => ({ mode: 'bay', from: { code: 'HAN', name: 'Hà Nội' }, to: { code: 'SGN', name: 'HCM' }, departAt: '2026-11-15T06:30:00+07:00', leadMin: null, ...o });

test('stations.json: đủ trường, mã IATA 3 chữ hoa, tz hợp lệ, không trùng mã', () => {
  const codes = new Set();
  for (const s of stations) {
    assert.ok(Array.isArray(s.kinds) && s.kinds.length, s.name);
    assert.match(s.tz, /^[+-]\d\d:\d\d$/);
    assert.ok(typeof s.country === 'string' && s.country.length === 2);
    if (s.kinds.includes('bay')) assert.match(s.code, /^[A-Z]{3}$/);
    else assert.equal(s.code, '');
    if (s.code) { assert.ok(!codes.has(s.code), 'trùng ' + s.code); codes.add(s.code); }
    for (const a of s.aliases) assert.equal(a, a.toLowerCase());
  }
});

test('isInternational chỉ với chuyến bay có đầu mút ngoài VN', () => {
  assert.equal(isInternational(trip(), stations), false);
  assert.equal(isInternational(trip({ to: { code: 'ICN', name: 'Seoul' } }), stations), true);
  assert.equal(isInternational(trip({ to: { code: 'ZZZ', name: 'Lạ' } }), stations), false);
  assert.equal(isInternational(trip({ mode: 'tau', to: { code: 'ICN' } }), stations), false);
});

test('leadMinutes: mặc định theo loại, leadMin của chuyến thắng', () => {
  assert.equal(leadMinutes(trip(), false), 120);
  assert.equal(leadMinutes(trip(), true), 180);
  assert.equal(leadMinutes(trip({ mode: 'tau' }), false), 45);
  assert.equal(leadMinutes(trip({ mode: 'xe' }), false), 30);
  assert.equal(leadMinutes(trip({ leadMin: 75 }), false), 75);
  assert.equal(leadMinutes(trip({ leadMin: 0 }), false), 0);
  assert.deepEqual(LEAD, { bayNoiDia: 120, bayQuocTe: 180, tau: 45, xe: 30 });
});

test('leaveByIso: qua nửa đêm và giữ offset', () => {
  assert.equal(leaveByIso(trip(), false), '2026-11-15T04:30:00+07:00');
  assert.equal(leaveByIso(trip({ departAt: '2026-11-15T01:00:00+07:00' }), false), '2026-11-14T23:00:00+07:00');
  assert.equal(leaveByIso(trip({ departAt: '2026-11-15T00:30:00+09:00', to: { code: 'ICN' } }), true), '2026-11-14T21:30:00+09:00');
  assert.equal(leaveByIso(trip({ departAt: 'rác' }), false), null);
});

test('placeWord', () => {
  assert.deepEqual([placeWord('bay'), placeWord('tau'), placeWord('xe')], ['sân bay', 'ga', 'bến']);
});
```

- [ ] **Step 3: Run, FAIL.**

- [ ] **Step 4: Cài đặt `js/airport.js`**

```js
import { shiftIso } from './time.js';

export const LEAD = { bayNoiDia: 120, bayQuocTe: 180, tau: 45, xe: 30 };

export function isInternational(trip, stations) {
  if (trip.mode !== 'bay') return false;
  const country = (p) => {
    const s = p && p.code ? stations.find((x) => x.code === p.code) : null;
    return s ? s.country : null;
  };
  const a = country(trip.from), b = country(trip.to);
  return Boolean((a && a !== 'VN') || (b && b !== 'VN'));
}

export function leadMinutes(trip, international) {
  if (Number.isInteger(trip.leadMin)) return trip.leadMin;
  if (trip.mode === 'bay') return international ? LEAD.bayQuocTe : LEAD.bayNoiDia;
  return trip.mode === 'tau' ? LEAD.tau : LEAD.xe;
}

export const leaveByIso = (trip, international) => shiftIso(trip.departAt, -leadMinutes(trip, international));

export const placeWord = (mode) => ({ bay: 'sân bay', tau: 'ga', xe: 'bến' }[mode] || 'điểm đi');
```

- [ ] **Step 5: Run, PASS. Commit** (`9ticket: mốc ra sân bay/ga/bến, danh sách điểm`).

---

### Task 6: `split.js` (chia tiền nhóm)

**Files:**
- Create: `ticket/js/split.js`
- Test: `ticket/tests/split.test.mjs`

**Interfaces:**
- Produces: `splitShares(amount, n) -> number[]` (tổng đúng bằng `amount`, người đầu nhận phần dư); `settle(payments, people) -> {people, balances, transfers:[{from,to,amount}], total}`. `payments` là `[{payer, amount, label}]`; khoản không hợp lệ (amount không nguyên dương, payer rỗng) bị bỏ qua. Mỗi khoản chia đều cho tất cả `people` (tự thêm người trả nếu chưa có); khoản thứ k xoay vòng phần dư theo k.

- [ ] **Step 1: Test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitShares, settle } from '../js/split.js';

test('splitShares: tổng đúng, phần dư dồn cho người đầu', () => {
  assert.deepEqual(splitShares(100001, 3), [33334, 33334, 33333]);
  assert.deepEqual(splitShares(9, 3), [3, 3, 3]);
  assert.deepEqual(splitShares(1, 3), [1, 0, 0]);
  assert.deepEqual(splitShares(500, 1), [500]);
});

test('settle: ba người, một người trả hộ', () => {
  const r = settle([{ payer: 'A', amount: 300000, label: 'Taxi' }], ['A', 'B', 'C']);
  assert.equal(r.total, 300000);
  assert.deepEqual(r.balances, { A: 200000, B: -100000, C: -100000 });
  assert.deepEqual(r.transfers, [{ from: 'B', to: 'A', amount: 100000 }, { from: 'C', to: 'A', amount: 100000 }]);
});

test('settle: một người, không có ai để chuyển', () => {
  const r = settle([{ payer: 'A', amount: 100000 }], ['A']);
  assert.deepEqual(r.transfers, []);
  assert.deepEqual(r.balances, { A: 0 });
});

test('settle: người trả không có trong danh sách vẫn được tính; không có khoản thì rỗng', () => {
  const r = settle([{ payer: 'Dũng', amount: 90000 }], ['A', 'B']);
  assert.deepEqual(r.people, ['A', 'B', 'Dũng']);
  assert.deepEqual(r.balances, { A: -30000, B: -30000, Dũng: 60000 });
  assert.deepEqual(settle([], ['A', 'B']).transfers, []);
  assert.deepEqual(settle([{ payer: 'A', amount: 5 }], []).people, ['A']);
});

test('settle: bỏ khoản không hợp lệ, không bao giờ ra NaN', () => {
  const bad = [{ payer: 'A', amount: 0 }, { payer: 'A', amount: -5 }, { payer: 'A', amount: 1.5 }, { payer: 'A', amount: '100' },
    { payer: '', amount: 10 }, { payer: 'A', amount: NaN }, null, undefined, {}];
  const r = settle(bad, ['A', 'B']);
  assert.equal(r.total, 0);
  assert.deepEqual(r.transfers, []);
  for (const v of Object.values(r.balances)) assert.ok(Number.isFinite(v));
});

test('settle: ngẫu nhiên, tổng số dư = 0 và tổng chuyển = tổng nợ', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let k = 0; k < 200; k++) {
    const people = ['A', 'B', 'C', 'D', 'E'].slice(0, 1 + rnd(5));
    const pays = Array.from({ length: 1 + rnd(6) }, () => ({ payer: people[rnd(people.length)], amount: 1 + rnd(2_000_000) }));
    const r = settle(pays, people);
    assert.equal(Object.values(r.balances).reduce((a, b) => a + b, 0), 0);
    const debt = Object.values(r.balances).filter((v) => v < 0).reduce((a, b) => a - b, 0);
    assert.equal(r.transfers.reduce((a, t) => a + t.amount, 0), debt);
    for (const t of r.transfers) assert.ok(t.amount > 0 && t.from !== t.to);
  }
});
```

- [ ] **Step 2: Run, FAIL.**

- [ ] **Step 3: Cài đặt `js/split.js`**

```js
export function splitShares(amount, n) {
  const base = Math.floor(amount / n);
  const rem = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

const valid = (p) => p && typeof p.payer === 'string' && p.payer && Number.isInteger(p.amount) && p.amount > 0;

export function settle(payments, people) {
  const names = [];
  const add = (n) => { if (typeof n === 'string' && n && !names.includes(n)) names.push(n); };
  (people || []).forEach(add);
  const pays = (payments || []).filter(valid);
  pays.forEach((p) => add(p.payer));
  const balances = Object.fromEntries(names.map((n) => [n, 0]));
  let total = 0;
  pays.forEach((p, k) => {
    const sh = splitShares(p.amount, names.length);
    total += p.amount;
    names.forEach((n, i) => { balances[n] -= sh[(i + k) % names.length]; });
    balances[p.payer] += p.amount;
  });
  const cr = names.filter((n) => balances[n] > 0).map((n) => ({ n, v: balances[n] })).sort((a, b) => b.v - a.v);
  const db = names.filter((n) => balances[n] < 0).map((n) => ({ n, v: -balances[n] })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const x = Math.min(db[i].v, cr[j].v);
    transfers.push({ from: db[i].n, to: cr[j].n, amount: x });
    db[i].v -= x; cr[j].v -= x;
    if (db[i].v === 0) i++;
    if (cr[j].v === 0) j++;
  }
  return { people: names, balances, transfers, total };
}
```

- [ ] **Step 4: Run, PASS. Commit** (`9ticket: chia tiền nhóm`).

---

### Task 7: `ics.js` (thêm vào lịch)

**Files:**
- Create: `ticket/js/ics.js`
- Test: `ticket/tests/ics.test.mjs`

**Interfaces:**
- Consumes: `parseIso` (`time.js`), `MODE_LABEL` (`model.js`), `placeWord` (`airport.js`).
- Produces: `icsEscape`, `foldLine`, `utcStamp(date) -> 'YYYYMMDDTHHMMSSZ'`, `buildICS(trip, {now, alarmMin}) -> string` (CRLF, dòng ≤ 75 octet), `icsFileName(trip) -> string`.

- [ ] **Step 1: Test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { icsEscape, foldLine, utcStamp, buildICS, icsFileName } from '../js/ics.js';
import { validateTrip } from '../js/model.js';

const NOW = new Date(Date.UTC(2026, 9, 12, 3, 4, 5));
const T = validateTrip({
  id: 'x1', mode: 'bay', operator: 'Vietjet, Air', code: 'VJ123', pnr: 'abc12d',
  from: { code: 'HAN', name: 'Hà Nội' }, to: { code: 'SGN', name: 'TP. Hồ Chí Minh' },
  departAt: '2026-11-15T06:30:00+07:00', arriveAt: '2026-11-15T08:40:00+07:00',
  passengers: [{ name: 'NGUYEN VAN A', seat: '12A' }], note: 'Dòng 1\nDòng 2; có dấu phẩy, chấm phẩy',
}).trip;

test('icsEscape / utcStamp', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  assert.equal(icsEscape(null), '');
  assert.equal(utcStamp(NOW), '20261012T030405Z');
});

test('foldLine: tối đa 75 octet, nối lại đủ nguyên văn, không cắt giữa ký tự', () => {
  const long = 'SUMMARY:' + 'Hà Nội → Sài Gòn, chuyến sớm '.repeat(8);
  const parts = foldLine(long).split('\r\n');
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75);
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), long);
  assert.equal(foldLine('ngắn'), 'ngắn');
});

test('buildICS: cấu trúc, giờ UTC đúng, báo thức, thoát ký tự', () => {
  const ics = buildICS(T, { now: NOW, alarmMin: 120 });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/(?<!\r)\n/.test(ics), 'chỉ dùng CRLF');
  assert.ok(ics.includes('UID:x1@ticket.9app.tech\r\n'));
  assert.ok(ics.includes('DTSTAMP:20261012T030405Z\r\n'));
  assert.ok(ics.includes('DTSTART:20261114T233000Z\r\n'));
  assert.ok(ics.includes('DTEND:20261115T014000Z\r\n'));
  assert.ok(ics.includes('TRIGGER:-PT120M'));
  assert.ok(ics.includes('Mã đặt chỗ: ABC12D'));
  assert.ok(ics.includes('Dòng 1\\nDòng 2\\; có dấu phẩy\\, chấm phẩy'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
});

test('buildICS: chuyến quốc tế offset +09:00 đổi đúng sang UTC; thiếu giờ đến thì dài 1 giờ', () => {
  const t = validateTrip({ ...T, id: 'x2', departAt: '2026-11-16T00:10:00+09:00', arriveAt: '' }).trip;
  const ics = buildICS(t, { now: NOW, alarmMin: 180 });
  assert.ok(ics.includes('DTSTART:20261115T151000Z'));
  assert.ok(ics.includes('DTEND:20261115T161000Z'));
});

test('icsFileName: an toàn, theo ngày giờ địa phương', () => {
  assert.equal(icsFileName(T), '9ticket-vj123-20261115.ics');
  const noCode = validateTrip({ ...T, id: 'x3', code: '' }).trip;
  assert.equal(icsFileName(noCode), '9ticket-bay-20261115.ics');
});
```

- [ ] **Step 2: Run, FAIL.**

- [ ] **Step 3: Cài đặt `js/ics.js`**

```js
import { parseIso, fmtDate } from './time.js';
import { MODE_LABEL } from './model.js';
import { placeWord } from './airport.js';

export function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (len + b > 75) { out.push(cur); cur = ' ' + ch; len = 1 + b; }
    else { cur += ch; len += b; }
  }
  out.push(cur);
  return out.join('\r\n');
}

const p2 = (n) => String(n).padStart(2, '0');
export function utcStamp(d) {
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}

export function buildICS(trip, { now = new Date(), alarmMin = 120 } = {}) {
  const start = parseIso(trip.departAt).ms;
  const end = trip.arriveAt ? parseIso(trip.arriveAt).ms : start + 3600000;
  const label = trip.code || MODE_LABEL[trip.mode];
  const desc = [
    trip.operator && `Hãng/nhà xe: ${trip.operator}`,
    trip.pnr && `Mã đặt chỗ: ${trip.pnr}`,
    trip.passengers.length && 'Hành khách: ' + trip.passengers.map((p) => p.name + (p.seat ? ` (ghế ${p.seat})` : '')).join('; '),
    trip.note,
  ].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app.tech//9ticket//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${trip.id}@ticket.9app.tech`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(new Date(start))}`,
    `DTEND:${utcStamp(new Date(end))}`,
    `SUMMARY:${icsEscape(`${label} ${trip.from.name} → ${trip.to.name}`)}`,
    `LOCATION:${icsEscape(trip.from.name)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Nên ra ${placeWord(trip.mode)} ngay`)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function icsFileName(trip) {
  const day = fmtDate(trip.departAt).split('/').reverse().join('');
  const tag = (trip.code || trip.mode).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `9ticket-${tag}-${day}.ics`;
}
```

- [ ] **Step 4: Run, PASS. Commit** (`9ticket: xuất .ics`).

---

### Task 8: `parse.js` (đọc nội dung vé dán vào)

**Files:**
- Create: `ticket/js/parse.js`
- Test: `ticket/tests/parse.test.mjs`

**Interfaces:**
- Consumes: `newId` (`model.js`), `toIso`, `parseIso` (`time.js`), `data/stations.json`.
- Produces: `foldKeep(s)`; `matchStation(stations, query, mode) -> station|null` (khớp mã IATA hoặc tên/alias bỏ dấu, lọc theo `mode`); `findStations(stations, text, mode) -> station[]` (theo thứ tự xuất hiện); `parseTicketText(text, {stations, now}) -> {ok, trip, issues}` với `trip` là bản nháp (`id` mới, có thể thiếu trường) hoặc `null` khi nội dung rỗng; `ok` chỉ true khi có đủ loại, nơi đi, nơi đến, giờ đi. Tối đa 20.000 ký tự được đọc.

- [ ] **Step 1: Test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTicketText, matchStation, findStations, foldKeep } from '../js/parse.js';
import { validateTrip } from '../js/model.js';

const stations = JSON.parse(fs.readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-12T00:00:00+07:00');
const run = (t) => parseTicketText(t, { stations, now: NOW });

const FLIGHT = `Vietjet Air - Xác nhận đặt vé
Mã đặt chỗ: ABC12D
Chuyến bay VJ123 Hà Nội (HAN) → TP. Hồ Chí Minh (SGN)
Khởi hành: 15/11/2026 06:30  Đến: 15/11/2026 08:40
Hành khách: NGUYEN VAN A  Ghế 12A
Cổng: 12   Nhà ga: T2`;

test('foldKeep bỏ dấu, giữ hoa/thường', () => {
  assert.equal(foldKeep('Đà Nẵng — Hà Nội'), 'Da Nang — Ha Noi');
});

test('matchStation theo mã, theo tên bỏ dấu, theo loại', () => {
  assert.equal(matchStation(stations, 'han', 'bay').code, 'HAN');
  assert.equal(matchStation(stations, 'ha noi', 'bay').code, 'HAN');
  assert.equal(matchStation(stations, 'Hà Nội', 'tau').name, 'Ga Hà Nội');
  assert.equal(matchStation(stations, 'Hà Nội', 'xe').kinds[0], 'xe');
  assert.equal(matchStation(stations, 'xyz', 'bay'), null);
  assert.equal(matchStation(stations, '', 'bay'), null);
});

test('vé máy bay đầy đủ', () => {
  const r = run(FLIGHT);
  assert.equal(r.ok, true, r.issues.join('|'));
  const t = r.trip;
  assert.equal(t.mode, 'bay');
  assert.equal(t.operator, 'Vietjet Air');
  assert.equal(t.code, 'VJ123');
  assert.equal(t.pnr, 'ABC12D');
  assert.equal(t.from.code, 'HAN');
  assert.equal(t.to.code, 'SGN');
  assert.equal(t.departAt, '2026-11-15T06:30:00+07:00');
  assert.equal(t.arriveAt, '2026-11-15T08:40:00+07:00');
  assert.deepEqual(t.passengers, [{ name: 'NGUYEN VAN A', seat: '12A' }]);
  assert.equal(t.gate, '12');
  assert.equal(t.terminal, 'T2');
  assert.ok(validateTrip(t).trip, 'bản nháp phải qua được kiểm tra');
});

test('vé tàu qua nhiều ngày; năm thiếu thì suy ra năm tới gần nhất', () => {
  const r = run('Vé tàu SE1 Hà Nội - Sài Gòn. Khởi hành 19:20 20/11/2026, đến 04:10 22/11/2026. Mã đặt chỗ: TRN9K2');
  assert.equal(r.ok, true, r.issues.join('|'));
  assert.equal(r.trip.mode, 'tau');
  assert.equal(r.trip.code, 'SE1');
  assert.equal(r.trip.operator, 'Đường sắt Việt Nam');
  assert.equal(r.trip.from.name, 'Ga Hà Nội');
  assert.equal(r.trip.to.name, 'Ga Sài Gòn');
  assert.equal(r.trip.arriveAt, '2026-11-22T04:10:00+07:00');
  const noYear = run('Vé tàu SE3 Hà Nội đến Đà Nẵng 05/01 19:00');
  assert.equal(noYear.trip.departAt, '2027-01-05T19:00:00+07:00');
});

test('giờ đến sớm hơn giờ đi cùng ngày thì sang ngày hôm sau', () => {
  const r = run('Chuyến bay VN245 HAN SGN 15/11/2026 23:30 đến 01:40');
  assert.equal(r.trip.departAt, '2026-11-15T23:30:00+07:00');
  assert.equal(r.trip.arriveAt, '2026-11-16T01:40:00+07:00');
});

test('bay quốc tế dùng múi giờ của nơi đi và nơi đến', () => {
  const r = run('VJ822 SGN ICN 10/12/2026 23:55 đến 07:00 11/12/2026');
  assert.equal(r.trip.departAt, '2026-12-10T23:55:00+07:00');
  assert.equal(r.trip.arriveAt, '2026-12-11T07:00:00+09:00');
});

test('xe khách: nhận loại, để trống nhà xe', () => {
  const r = run('Vexere: vé xe giường nằm Hà Nội - Sa Pa, 12/11/2026 21:00');
  assert.equal(r.trip.mode, 'xe');
  assert.equal(r.trip.operator, '');
  assert.equal(r.trip.from.name, 'Hà Nội');
  assert.equal(r.trip.to.name, 'Sa Pa');
});

test('không phải vé / rỗng / thiếu thông tin: báo rõ, không bịa', () => {
  assert.equal(run('').ok, false);
  assert.equal(run('').trip, null);
  const g = run('Xin chào, hẹn gặp lại vào cuối tuần nhé!');
  assert.equal(g.ok, false);
  assert.ok(g.issues.length >= 1);
  const partial = run('VJ123 HAN SGN');
  assert.equal(partial.ok, false);
  assert.ok(partial.issues.some((s) => s.includes('giờ')));
  assert.equal(partial.trip.code, 'VJ123');
});

test('ngày không tồn tại không được nhận', () => {
  const r = run('VJ123 HAN SGN 31/02/2026 06:30');
  assert.equal(r.ok, false);
});

test('văn bản rất dài không treo và chỉ đọc 20.000 ký tự đầu', () => {
  const big = 'lorem ipsum dolor sit amet '.repeat(10000) + FLIGHT;
  const t0 = Date.now();
  const r = run(big);
  assert.ok(Date.now() - t0 < 2000, 'quá chậm');
  assert.equal(r.ok, false);
});

test('HTML trong nội dung vé được giữ như chữ thường, không diễn giải', () => {
  const r = run(FLIGHT.replace('NGUYEN VAN A', '<img src=x onerror=alert(1)>'));
  const name = r.trip.passengers[0] && r.trip.passengers[0].name;
  assert.ok(!name || name.includes('<img'), 'nếu có thì giữ nguyên văn');
});

test('findStations theo thứ tự xuất hiện', () => {
  const s = findStations(stations, 'đi Sài Gòn rồi về Hà Nội', 'tau');
  assert.deepEqual(s.map((x) => x.name), ['Ga Sài Gòn', 'Ga Hà Nội']);
});
```

- [ ] **Step 2: Run, FAIL.**

- [ ] **Step 3: Cài đặt `js/parse.js`**

```js
import { newId } from './model.js';
import { toIso } from './time.js';

const MAX_TEXT = 20000;
const AIRLINES = { VN: 'Vietnam Airlines', VJ: 'Vietjet Air', QH: 'Bamboo Airways', BL: 'Pacific Airlines', VU: 'Vietravel Airlines' };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const foldKeep = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const fl = (s) => foldKeep(s).toLowerCase();

export function matchStation(stations, query, mode) {
  const q = String(query || '').trim();
  if (!q) return null;
  const pool = stations.filter((s) => !mode || s.kinds.includes(mode));
  const byCode = pool.find((s) => s.code && s.code === q.toUpperCase());
  if (byCode) return byCode;
  const f = fl(q);
  return pool.find((s) => [s.name, ...(s.aliases || [])].some((a) => fl(a) === f)) || null;
}

export function findStations(stations, text, mode) {
  const keep = foldKeep(text), low = keep.toLowerCase();
  const hits = [];
  for (const s of stations) {
    if (!s.kinds.includes(mode)) continue;
    let pos = -1;
    if (s.code) {
      const m = new RegExp('(^|[^A-Za-z0-9])' + s.code + '(?![A-Za-z0-9])').exec(keep);
      if (m) pos = m.index + m[1].length;
    }
    for (const a of [s.name, ...(s.aliases || [])]) {
      const f = fl(a);
      if (!f) continue;
      const m = new RegExp('(^|[^a-z0-9])' + esc(f) + '(?![a-z0-9])').exec(low);
      if (m) { const p = m.index + m[1].length; if (pos < 0 || p < pos) pos = p; }
    }
    if (pos >= 0) hits.push({ s, pos });
  }
  hits.sort((a, b) => a.pos - b.pos);
  return hits.map((h) => h.s);
}

const wallMs = (y, mo, d, h, mi) => {
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const dt = new Date(ms);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? ms : null;
};
const offMin = (tz) => (tz[0] === '-' ? -1 : 1) * (+tz.slice(1, 3) * 60 + +tz.slice(4, 6));

function readDates(text, nowMs) {
  const out = [];
  const nowDay = Math.floor((nowMs + 7 * 3600000) / 86400000);
  const nowYear = new Date(nowMs + 7 * 3600000).getUTCFullYear();
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?(?!\d)/g)) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : nowYear;
    if (wallMs(y, mo, d, 0, 0) == null) continue;
    if (!m[3] && Math.floor(wallMs(y, mo, d, 0, 0) / 86400000) < nowDay) y += 1;
    if (wallMs(y, mo, d, 0, 0) == null) continue;
    out.push({ y, mo, d });
  }
  return out;
}
const readTimes = (text) => [...text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)].map((m) => ({ h: +m[1], mi: +m[2] }));

export function parseTicketText(input, { stations, now = Date.now() } = {}) {
  const text = String(input == null ? '' : input).slice(0, MAX_TEXT);
  if (!text.trim()) return { ok: false, trip: null, issues: ['Chưa có nội dung để đọc.'] };
  const issues = [];
  const flight = /(?<![A-Za-z0-9])(VN|VJ|QH|BL|VU)\s?(\d{1,4})(?![A-Za-z0-9])/.exec(text);
  const train = /(?<![A-Za-z0-9])(SE|TN|SPT|SNT|SP)\s?(\d{1,2})(?![A-Za-z0-9])/.exec(text);
  let mode = '', code = '', operator = '';
  if (flight) { mode = 'bay'; code = flight[1] + flight[2]; operator = AIRLINES[flight[1]]; }
  else if (train) { mode = 'tau'; code = train[1] + train[2]; operator = 'Đường sắt Việt Nam'; }
  else if (/xe kh[aá]ch|nh[aà] xe|limousine|gi[uư][oơ]ng n[aằ]m|vexere/i.test(text) || /xe khach|nha xe|giuong nam/i.test(foldKeep(text))) mode = 'xe';
  if (!mode) {
    return { ok: false, trip: { id: newId(), mode: '', operator: '', code: '', from: null, to: null, departAt: '', arriveAt: '', pnr: '', passengers: [], gate: '', terminal: '', note: '', payments: [] },
      issues: ['Không nhận ra số hiệu chuyến bay, tàu hay nhà xe. Hãy nhập tay.'] };
  }

  const keep = foldKeep(text);
  const pnrM = /(?:ma (?:dat|giu) cho|booking(?: code| ref(?:erence)?)?|pnr)\s*[:#-]?\s*([A-Za-z0-9]{5,8})(?![A-Za-z0-9])/i.exec(keep);
  const gateM = /(?:cong|gate)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?)(?![A-Za-z0-9])/i.exec(keep);
  const termM = /(?:nha ga|terminal)\s*[:\-]?\s*(T?\d)(?![A-Za-z0-9])/i.exec(keep);

  const passengers = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:hành khách|hanh khach|passenger)\s*[:\-]\s*(.+)$/i.exec(line);
    if (!m || passengers.length >= 20) continue;
    const seat = /(?:ghế|ghe|seat)\s*[:\-]?\s*(\d{1,2}[A-Za-z]?)/i.exec(m[1]);
    const name = m[1].split(/\s{2,}|\s+(?:ghế|ghe|seat)\b/i)[0].trim();
    if (name) passengers.push({ name, seat: seat ? seat[1].toUpperCase() : '' });
  }

  const hits = findStations(stations, text, mode);
  const fromS = hits[0] || null, toS = hits[1] || null;
  if (!fromS || !toS) issues.push('Chưa nhận ra đủ nơi đi và nơi đến.');

  let departAt = '', arriveAt = '';
  const dates = readDates(text, now), times = readTimes(text);
  if (!dates.length || !times.length) issues.push('Chưa nhận ra ngày hoặc giờ đi.');
  else {
    const offD = offMin(fromS ? fromS.tz : '+07:00'), offA = offMin(toS ? toS.tz : '+07:00');
    const d1 = dates[0], t1 = times[0];
    const depMs = wallMs(d1.y, d1.mo, d1.d, t1.h, t1.mi) - offD * 60000;
    departAt = toIso(depMs, offD);
    if (times[1]) {
      const d2 = dates[1] || d1, t2 = times[1];
      let w = wallMs(d2.y, d2.mo, d2.d, t2.h, t2.mi);
      if (!dates[1] && w - offA * 60000 < depMs) w += 86400000;
      const arrMs = w - offA * 60000;
      if (arrMs >= depMs) arriveAt = toIso(arrMs, offA);
      else issues.push('Giờ đến nhận được sớm hơn giờ đi, bỏ qua giờ đến.');
    }
  }

  const trip = {
    id: newId(), mode, operator, code,
    from: fromS ? { code: fromS.code, name: fromS.name } : null,
    to: toS ? { code: toS.code, name: toS.name } : null,
    departAt, arriveAt, pnr: pnrM ? pnrM[1].toUpperCase() : '',
    passengers, gate: gateM ? gateM[1].toUpperCase() : '', terminal: termM ? termM[1].toUpperCase() : '', note: '', payments: [],
  };
  return { ok: Boolean(fromS && toS && departAt), trip, issues };
}
```

- [ ] **Step 4: Run.** Nếu test "vé xe" lỗi vì nhận nhầm `SP`/`SE` trong chữ khác, siết regex bằng lookbehind/lookahead đã có; nếu test "bay quốc tế" lỗi vì `ICN` `kinds` chỉ có `bay`, kiểm `mode='bay'` đã lọc đúng. Sửa cài đặt, không sửa test, trừ khi test sai về mặt sự thật.
Expected: PASS.

- [ ] **Step 5: Commit** (`9ticket: đọc nội dung vé dán vào`).

---

### Task 9: `status.js` và `sample.js`

**Files:**
- Create: `ticket/js/status.js`, `ticket/js/sample.js`
- Test: `ticket/tests/status.test.mjs`

**Interfaces:**
- Consumes: `validateTrip`, `toIso`.
- Produces: `STATE_LABEL`; `getStatus(trip, nowMs?) -> Promise<{state:'unknown'|'ontime'|'delayed'|'cancelled', delayMin:number, gate:string, terminal:string, updatedAt:string, source:'none'|'mau'|string}>`; `setSource(fn|null)` (fn nhận `(trip, nowMs)` trả cùng dạng, để nối Datacom sau); `makeSamples(nowMs) -> trip[]` (id bắt đầu `mau-`, đã qua `validateTrip`).

- [ ] **Step 1: Test (failing)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getStatus, setSource, STATE_LABEL } from '../js/status.js';
import { makeSamples } from '../js/sample.js';
import { validateTrip } from '../js/model.js';

const NOW = Date.parse('2026-10-12T10:00:00+07:00');

test('makeSamples: hợp lệ, tính theo ngày hiện tại, gồm sắp tới và đã đi', () => {
  const s = makeSamples(NOW);
  assert.ok(s.length >= 4);
  for (const t of s) { assert.ok(t.id.startsWith('mau-')); assert.ok(validateTrip(t).trip); }
  assert.ok(s.some((t) => Date.parse(t.departAt) > NOW));
  assert.ok(s.some((t) => Date.parse(t.departAt) < NOW));
  assert.deepEqual(makeSamples(NOW), makeSamples(NOW));
  assert.ok(s.some((t) => t.mode === 'bay') && s.some((t) => t.mode === 'tau') && s.some((t) => t.mode === 'xe'));
});

test('getStatus: chuyến thật chưa có nguồn thì "unknown", không bịa', async () => {
  const s = await getStatus({ id: 'tabc', mode: 'bay' }, NOW);
  assert.equal(s.state, 'unknown');
  assert.equal(s.source, 'none');
  assert.ok(STATE_LABEL.unknown);
});

test('getStatus: chuyến mẫu có trạng thái mẫu, ghi rõ nguồn "mau"', async () => {
  const states = new Set();
  for (const t of makeSamples(NOW)) {
    const s = await getStatus(t, NOW);
    assert.equal(s.source, 'mau');
    states.add(s.state);
  }
  assert.ok(states.has('ontime') && states.has('delayed'));
});

test('setSource thay được nguồn; lỗi nguồn thì quay về unknown', async () => {
  setSource(async () => ({ state: 'delayed', delayMin: 25, gate: 'B3', terminal: 'T1', updatedAt: '2026-10-12T10:00:00+07:00', source: 'datacom' }));
  assert.equal((await getStatus({ id: 'tx' }, NOW)).state, 'delayed');
  setSource(async () => { throw new Error('mạng lỗi'); });
  const s = await getStatus({ id: 'tx' }, NOW);
  assert.equal(s.state, 'unknown');
  setSource(async () => ({ state: 'bậy' }));
  assert.equal((await getStatus({ id: 'tx' }, NOW)).state, 'unknown');
  setSource(null);
});
```

- [ ] **Step 2: Run, FAIL.**

- [ ] **Step 3: Cài đặt**

`js/status.js`:
```js
// ĐIỂM DUY NHẤT nối nguồn trạng thái chuyến. Hiện: dữ liệu mẫu cho chuyến "mau-*", còn lại "chưa có thông tin".
// Sau này nối Datacom (hoặc nguồn khác) bằng setSource(async (trip, nowMs) => ({state, delayMin, gate, terminal, updatedAt, source})).
export const STATE_LABEL = { unknown: 'Chưa có thông tin', ontime: 'Đúng giờ', delayed: 'Trễ', cancelled: 'Đã hủy' };
const STATES = Object.keys(STATE_LABEL);
const SAMPLE = {
  'mau-bay': { state: 'ontime', delayMin: 0, gate: 'A12', terminal: 'T1' },
  'mau-tau': { state: 'delayed', delayMin: 40, gate: '', terminal: '' },
  'mau-xe': { state: 'ontime', delayMin: 0, gate: '', terminal: '' },
  'mau-bay-cu': { state: 'ontime', delayMin: 0, gate: 'C4', terminal: 'T2' },
};
const NONE = () => ({ state: 'unknown', delayMin: 0, gate: '', terminal: '', updatedAt: '', source: 'none' });
let source = null;

export function setSource(fn) { source = typeof fn === 'function' ? fn : null; }

export async function getStatus(trip, nowMs = Date.now()) {
  try {
    if (source) {
      const s = await source(trip, nowMs);
      return s && STATES.includes(s.state) ? { ...NONE(), ...s } : NONE();
    }
    const m = trip && SAMPLE[trip.id];
    if (m) return { ...m, updatedAt: new Date(nowMs).toISOString(), source: 'mau' };
  } catch { /* nguồn lỗi: coi như chưa có thông tin */ }
  return NONE();
}
```
Lưu ý: các chuyến mẫu trong `sample.js` phải dùng đúng các id `mau-bay`, `mau-tau`, `mau-xe`, `mau-bay-cu`.

`js/sample.js`:
```js
import { validateTrip } from './model.js';
import { toIso } from './time.js';

const HOUR = 3600000, DAY = 24 * HOUR, OFF = 420;
const at = (nowMs, days, hour, minute = 0) => {
  const wall = new Date(nowMs + OFF * 60000 + days * DAY);
  return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), hour, minute) - OFF * 60000;
};

export function makeSamples(nowMs) {
  const mk = (o) => validateTrip(o).trip;
  const bay = at(nowMs, 2, 7, 30), tau = at(nowMs, 9, 19, 20), xe = at(nowMs, 20, 21, 0), cu = at(nowMs, -30, 14, 15);
  return [
    mk({ id: 'mau-bay', mode: 'bay', operator: 'Vietjet Air', code: 'VJ123', pnr: 'MAU123',
      from: { code: 'HAN', name: 'Hà Nội' }, to: { code: 'SGN', name: 'TP. Hồ Chí Minh' },
      departAt: toIso(bay, OFF), arriveAt: toIso(bay + 2 * HOUR + 10 * 60000, OFF),
      passengers: [{ name: 'NGUYEN VAN A', seat: '12A', bag: '20kg' }, { name: 'TRAN THI B', seat: '12B', bag: '20kg' }],
      gate: 'A12', terminal: 'T1', note: 'Dữ liệu mẫu',
      payments: [{ payer: 'NGUYEN VAN A', amount: 300000, label: 'Taxi ra sân bay' }] }),
    mk({ id: 'mau-tau', mode: 'tau', operator: 'Đường sắt Việt Nam', code: 'SE1',
      from: { code: '', name: 'Ga Hà Nội' }, to: { code: '', name: 'Ga Sài Gòn' },
      departAt: toIso(tau, OFF), arriveAt: toIso(tau + 32 * HOUR, OFF),
      passengers: [{ name: 'NGUYEN VAN A', seat: 'Toa 4 - Giường 12' }], note: 'Dữ liệu mẫu' }),
    mk({ id: 'mau-xe', mode: 'xe', operator: '', code: '',
      from: { code: '', name: 'Hà Nội' }, to: { code: '', name: 'Sa Pa' },
      departAt: toIso(xe, OFF), arriveAt: toIso(xe + 6 * HOUR, OFF), note: 'Dữ liệu mẫu' }),
    mk({ id: 'mau-bay-cu', mode: 'bay', operator: 'Vietnam Airlines', code: 'VN245',
      from: { code: 'SGN', name: 'TP. Hồ Chí Minh' }, to: { code: 'DAD', name: 'Đà Nẵng' },
      departAt: toIso(cu, OFF), arriveAt: toIso(cu + 80 * 60000, OFF), note: 'Dữ liệu mẫu' }),
  ];
}
```
Sửa `ids` trong `SAMPLE` của `status.js` nếu khác. `passengers[].seat` tối đa 8 ký tự: `'Toa 4 - Giường 12'` dài hơn, đổi thành `'T4-G12'`.

- [ ] **Step 4: Run, PASS. Commit** (`9ticket: nguồn trạng thái cắm được và chuyến mẫu`).

---

### Task 10: Giao diện (`app.js`, CSS đầy đủ)

**Files:**
- Modify: `ticket/js/app.js` (thay bản tạm), `ticket/css/style.css` (thêm quy tắc)
- Test: kiểm bằng e2e ở Task 12 (giao diện không có unit test); trong task này chạy `npm test` để chắc không hỏng gì và mở thử bằng `npm run serve`.

**Interfaces:**
- Consumes: mọi module trên. Dữ liệu `data/stations.json` nạp bằng `fetch('data/stations.json')`.
- Produces: các lớp/selector mà e2e dùng: `a.card` (thẻ chuyến), `h1`, nút theo chữ, `#paste`, `#f-*` (các ô form), `.chip`, `#status`, `.leave-by`, `body` không cuộn ngang.

- [ ] **Step 1: Viết `js/app.js`**

```js
import { validateTrip, MODE_LABEL, newId, splitUpcoming, countdown } from './model.js';
import { createStore } from './store.js';
import { parseIso, fmtDate, fmtTime, fmtDayLabel } from './time.js';
import { isInternational, leadMinutes, leaveByIso, placeWord } from './airport.js';
import { buildICS, icsFileName } from './ics.js';
import { settle } from './split.js';
import { parseTicketText, matchStation } from './parse.js';
import { getStatus, STATE_LABEL } from './status.js';
import { makeSamples } from './sample.js';

const store = createStore(() => window.localStorage);
const main = document.getElementById('main');
let stations = [];

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const money = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const dayLine = (iso) => `${fmtDayLabel(iso)} ${fmtDate(iso).slice(0, 5)} ${fmtTime(iso)}`;
const route = (t) => `${t.from.name} → ${t.to.name}`;
const MODE_ICON = { bay: '✈', tau: '🚆', xe: '🚌' };

function setView(nodes, nav) {
  main.classList.remove('ticket-mode');
  main.replaceChildren(...[].concat(nodes));
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function memoryBanner() {
  return store.isPersistent() ? null : h('p', { class: 'banner warn', role: 'status' }, 'Trình duyệt không cho lưu dữ liệu: các chuyến sẽ mất khi đóng trang. Hãy dùng "Xuất dữ liệu" ở mục Về app để giữ bản sao.');
}

function statusChip(trip) {
  const chip = h('span', { class: 'chip info', text: STATE_LABEL.unknown });
  getStatus(trip).then((s) => {
    chip.textContent = STATE_LABEL[s.state] + (s.state === 'delayed' && s.delayMin ? ` ${s.delayMin} phút` : '');
    chip.className = 'chip ' + ({ ontime: 'ok', delayed: 'warn', cancelled: 'bad' }[s.state] || 'info');
  });
  return chip;
}

function card(t, upcoming) {
  const now = Date.now();
  return h('a', { class: 'card', href: '#/trip/' + t.id },
    h('div', { class: 'card-top' },
      h('span', { class: 'mode', 'aria-hidden': 'true' }, MODE_ICON[t.mode]),
      h('strong', { text: [t.code, t.operator].filter(Boolean).join(' · ') || MODE_LABEL[t.mode] }),
      upcoming ? statusChip(t) : null),
    h('div', { class: 'route', text: route(t) }),
    h('div', { class: 'muted', text: `${dayLine(t.departAt)}${t.arriveAt ? ' → ' + fmtTime(t.arriveAt) : ''}` }),
    upcoming ? h('div', { class: 'count', text: countdown(parseIso(t.departAt).ms, now) }) : null);
}

function viewList() {
  const trips = store.load();
  const { upcoming, past } = splitUpcoming(trips, Date.now());
  const page = h('section', { class: 'page' },
    h('div', { class: 'row' }, h('h1', { text: 'Chuyến của tôi' }), h('a', { class: 'btn primary', href: '#/add', text: 'Thêm chuyến' })),
    memoryBanner());
  if (!trips.length) {
    page.append(h('div', { class: 'empty' },
      h('p', { text: 'Chưa có chuyến nào. Thêm vé máy bay, tàu hoặc xe khách để 9ticket nhắc giờ ra bến và giữ vé dùng được khi không có mạng.' }),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: '#/add', text: 'Thêm chuyến đầu tiên' }),
        h('button', { class: 'btn', type: 'button', onclick: () => { makeSamples(Date.now()).forEach((t) => store.upsert(t)); render(); } }, 'Xem chuyến mẫu'))));
  } else {
    page.append(h('h2', { text: 'Sắp tới' }), upcoming.length ? h('div', { class: 'list' }, upcoming.map((t) => card(t, true))) : h('p', { class: 'muted', text: 'Không có chuyến sắp tới.' }));
    if (past.length) page.append(h('h2', { text: 'Đã đi' }), h('div', { class: 'list' }, past.map((t) => card(t, false))));
    if (trips.some((t) => t.id.startsWith('mau-'))) {
      page.append(h('button', { class: 'btn small', type: 'button', onclick: () => { trips.filter((t) => t.id.startsWith('mau-')).forEach((t) => store.remove(t.id)); render(); } }, 'Xóa chuyến mẫu'));
    }
  }
  setView(page, 'list');
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { text: label }), control, hint ? h('small', { class: 'muted', text: hint }) : null);
}

function viewDetail(id) {
  const t = store.get(id);
  if (!t) { setView(h('section', { class: 'page' }, h('h1', { text: 'Không tìm thấy chuyến' }), h('a', { class: 'btn', href: '#/', text: 'Về danh sách' })), 'list'); return; }
  const intl = isInternational(t, stations);
  const lead = leadMinutes(t, intl);
  const leave = leaveByIso(t, intl);
  const page = h('section', { class: 'page detail' });
  const head = h('div', { class: 'detail-head' },
    h('div', { class: 'muted', text: `${MODE_LABEL[t.mode]}${t.operator ? ' · ' + t.operator : ''}${t.code ? ' · ' + t.code : ''}` }),
    h('h1', { text: route(t) }),
    h('div', { class: 'times' },
      h('div', {}, h('div', { class: 'big', text: fmtTime(t.departAt) }), h('div', { class: 'muted', text: `${dayLine(t.departAt).split(' ').slice(0, 2).join(' ')}/${fmtDate(t.departAt).slice(6)}` })),
      t.arriveAt ? h('div', {}, h('div', { class: 'big', text: fmtTime(t.arriveAt) }), h('div', { class: 'muted', text: `${fmtDate(t.arriveAt)}` })) : null),
    h('div', { class: 'count', text: countdown(parseIso(t.departAt).ms, Date.now()) }),
    t.pnr ? h('div', { class: 'pnr' }, h('span', { class: 'muted', text: 'Mã đặt chỗ ' }), h('strong', { text: t.pnr })) : null);
  page.append(head);

  const body = h('div', { class: 'detail-body' });
  const statusBox = h('p', { id: 'status', class: 'box', text: 'Đang tải trạng thái…' });
  getStatus(t).then((s) => {
    const parts = [STATE_LABEL[s.state]];
    if (s.state === 'delayed' && s.delayMin) parts.push(`${s.delayMin} phút`);
    if (s.gate) parts.push('cổng ' + s.gate);
    if (s.terminal) parts.push('nhà ga ' + s.terminal);
    statusBox.textContent = parts.join(' · ') + (s.source === 'none' ? '. Chưa có nguồn dữ liệu chuyến.' : s.source === 'mau' ? '. (Dữ liệu mẫu)' : `. Cập nhật lúc ${s.updatedAt}, nguồn ${s.source}.`);
  });
  body.append(h('h2', { text: 'Trạng thái chuyến' }), statusBox);

  const leaveBox = h('div', { class: 'box leave-by' },
    h('strong', { text: leave ? `Nên ra ${placeWord(t.mode)} lúc ${fmtTime(leave)} (${fmtDate(leave).slice(0, 5)})` : '' }),
    h('div', { class: 'muted', text: `Sớm ${lead} phút so với giờ đi.` }));
  const leadInput = h('input', { id: 'lead', type: 'number', min: '0', max: '720', step: '5', value: String(lead), inputmode: 'numeric' });
  leadInput.addEventListener('change', () => {
    const n = Number.parseInt(leadInput.value, 10);
    store.upsert({ ...t, leadMin: Number.isInteger(n) ? n : null });
    viewDetail(id);
  });
  body.append(h('h2', { text: 'Giờ ra bến' }), leaveBox, field('Ra sớm (phút)', leadInput));

  const details = [
    t.gate && ['Cổng', t.gate], t.terminal && ['Nhà ga', t.terminal],
  ].filter(Boolean);
  if (details.length) body.append(h('dl', { class: 'dl' }, details.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
  if (t.passengers.length) {
    body.append(h('h2', { text: 'Hành khách' }), h('ul', { class: 'plain' }, t.passengers.map((p) => h('li', { text: [p.name, p.seat && 'ghế ' + p.seat, p.bag && 'hành lý ' + p.bag].filter(Boolean).join(' · ') }))));
  }
  if (t.note) body.append(h('h2', { text: 'Ghi chú' }), h('p', { class: 'note', text: t.note }));
  page.append(body);

  const split = h('div', { class: 'box', id: 'split' });
  function drawSplit() {
    const cur = store.get(id);
    split.replaceChildren();
    const people = cur.passengers.map((p) => p.name);
    const r = settle(cur.payments, people);
    if (cur.payments.length) {
      split.append(h('ul', { class: 'plain' }, cur.payments.map((p, i) => h('li', {},
        `${p.payer} trả ${money(p.amount)}${p.label ? ' (' + p.label + ')' : ''} `,
        h('button', { class: 'link', type: 'button', 'aria-label': 'Xóa khoản chi', onclick: () => { store.upsert({ ...cur, payments: cur.payments.filter((_, j) => j !== i) }); drawSplit(); } }, 'xóa')))));
      split.append(h('p', { class: 'muted', text: `Tổng ${money(r.total)}, chia đều ${r.people.length} người.` }));
      split.append(r.transfers.length ? h('ul', { class: 'plain transfers' }, r.transfers.map((x) => h('li', { text: `${x.from} chuyển cho ${x.to} ${money(x.amount)}` }))) : h('p', { text: 'Không ai cần chuyển tiền.' }));
    } else split.append(h('p', { class: 'muted', text: 'Chưa có khoản chi chung nào.' }));
    const payer = h('input', { id: 'pay-who', type: 'text', maxlength: '40', list: 'people', autocomplete: 'off' });
    const amount = h('input', { id: 'pay-amount', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
    const label = h('input', { id: 'pay-label', type: 'text', maxlength: '60', autocomplete: 'off' });
    const err = h('p', { class: 'error', role: 'alert' });
    split.append(
      h('datalist', { id: 'people' }, people.map((n) => h('option', { value: n }))),
      field('Ai trả', payer), field('Số tiền (đồng)', amount), field('Cho việc gì', label), err,
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const n = Number(String(amount.value).replace(/[.,\s]/g, ''));
        if (!payer.value.trim()) { err.textContent = 'Nhập tên người trả.'; return; }
        if (!Number.isInteger(n) || n <= 0 || n > 1e9) { err.textContent = 'Số tiền phải là số nguyên dương, không quá 1.000.000.000.'; return; }
        const next = [...cur.payments, { payer: payer.value.trim(), amount: n, label: label.value.trim() }];
        const res = store.upsert({ ...cur, payments: next });
        if (!res.trip) { err.textContent = res.errors[0]; return; }
        drawSplit();
      } }, 'Thêm khoản chi'));
  }
  drawSplit();
  page.append(h('h2', { text: 'Chia tiền nhóm' }), split);

  let confirming = false, timer = null;
  const del = h('button', { class: 'btn danger', type: 'button', onclick: () => {
    if (!confirming) { confirming = true; del.textContent = 'Bấm lần nữa để xóa'; timer = setTimeout(() => { confirming = false; del.textContent = 'Xóa chuyến'; }, 4000); return; }
    clearTimeout(timer); store.remove(id); location.hash = '#/';
  } }, 'Xóa chuyến');
  const ticketBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => {
    const on = main.classList.toggle('ticket-mode');
    ticketBtn.textContent = on ? 'Thoát chế độ vé' : 'Chế độ vé (chữ lớn)';
  } }, 'Chế độ vé (chữ lớn)');
  page.append(h('div', { class: 'actions' },
    ticketBtn,
    h('button', { class: 'btn', type: 'button', onclick: () => download(icsFileName(t), buildICS(t, { alarmMin: lead }), 'text/calendar') }, 'Thêm vào lịch (.ics)'),
    h('a', { class: 'btn', href: '#/edit/' + id, text: 'Sửa' }),
    del));
  setView(page, 'list');
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function viewAdd(editId) {
  const editing = editId ? store.get(editId) : null;
  if (editId && !editing) { location.hash = '#/'; return; }
  const draft = editing || { id: newId(), mode: 'bay', passengers: [], payments: [] };
  const page = h('section', { class: 'page' }, h('h1', { text: editing ? 'Sửa chuyến' : 'Thêm chuyến' }));
  const msg = h('div', { id: 'msg', role: 'status' });
  const formHost = h('div', {});

  function drawForm(d, notice) {
    msg.replaceChildren(notice ? h('p', { class: 'banner info', text: notice }) : '');
    const f = {};
    const sel = h('select', { id: 'f-mode' }, ['bay', 'tau', 'xe'].map((m) => h('option', { value: m, selected: m === d.mode ? true : null }, MODE_LABEL[m])));
    f.mode = sel;
    f.operator = h('input', { id: 'f-operator', type: 'text', maxlength: '60', value: d.operator || '' });
    f.code = h('input', { id: 'f-code', type: 'text', maxlength: '12', value: d.code || '', autocapitalize: 'characters' });
    f.from = h('input', { id: 'f-from', type: 'text', maxlength: '80', list: 'stations', value: d.from ? d.from.name : '', autocomplete: 'off' });
    f.to = h('input', { id: 'f-to', type: 'text', maxlength: '80', list: 'stations', value: d.to ? d.to.name : '', autocomplete: 'off' });
    f.depDate = h('input', { id: 'f-dep-date', type: 'date', value: d.departAt ? d.departAt.slice(0, 10) : '' });
    f.depTime = h('input', { id: 'f-dep-time', type: 'time', value: d.departAt ? d.departAt.slice(11, 16) : '' });
    f.arrDate = h('input', { id: 'f-arr-date', type: 'date', value: d.arriveAt ? d.arriveAt.slice(0, 10) : '' });
    f.arrTime = h('input', { id: 'f-arr-time', type: 'time', value: d.arriveAt ? d.arriveAt.slice(11, 16) : '' });
    f.pnr = h('input', { id: 'f-pnr', type: 'text', maxlength: '10', value: d.pnr || '', autocapitalize: 'characters' });
    f.pax = h('textarea', { id: 'f-pax', rows: '3' }, (d.passengers || []).map((p) => [p.name, p.seat, p.bag].filter((x, i) => i === 0 || x).join(', ')).join('\n'));
    f.gate = h('input', { id: 'f-gate', type: 'text', maxlength: '10', value: d.gate || '' });
    f.terminal = h('input', { id: 'f-terminal', type: 'text', maxlength: '10', value: d.terminal || '' });
    f.note = h('textarea', { id: 'f-note', rows: '2', maxlength: '1000' }, d.note || '');
    const errs = h('ul', { class: 'error', role: 'alert' });
    const dl = h('datalist', { id: 'stations' }, stations.map((s) => h('option', { value: s.name }, s.code ? `${s.code} · ${s.kinds[0]}` : s.kinds[0])));

    const tzOf = (name, mode) => { const s = matchStation(stations, name, mode); return s ? s.tz : '+07:00'; };
    const placeOf = (name, mode) => { const s = matchStation(stations, name, mode); return s ? { code: s.code, name: s.name } : { code: '', name: name.trim() }; };
    const form = h('form', { novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const mode = f.mode.value;
      const iso = (date, time, name) => (date.value && time.value ? `${date.value}T${time.value}:00${tzOf(name, mode)}` : '');
      const pax = f.pax.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20).map((l) => { const [name, seat, bag] = l.split(',').map((x) => (x || '').trim()); return { name, seat, bag }; });
      const raw = { ...d, id: d.id, mode, operator: f.operator.value, code: f.code.value, from: placeOf(f.from.value, mode), to: placeOf(f.to.value, mode),
        departAt: iso(f.depDate, f.depTime, f.from.value), arriveAt: iso(f.arrDate, f.arrTime, f.to.value),
        pnr: f.pnr.value, passengers: pax, gate: f.gate.value, terminal: f.terminal.value, note: f.note.value };
      const res = store.upsert(raw);
      if (!res.trip) { errs.replaceChildren(...res.errors.map((x) => h('li', { text: x }))); return; }
      location.hash = '#/trip/' + res.trip.id;
    } },
      field('Loại chuyến', f.mode), field('Hãng / nhà xe', f.operator), field('Số hiệu (VJ123, SE1…)', f.code),
      field('Nơi đi', f.from, 'Gõ tên hoặc mã sân bay (HAN, SGN…)'), field('Nơi đến', f.to),
      h('div', { class: 'two' }, field('Ngày đi', f.depDate), field('Giờ đi', f.depTime)),
      h('div', { class: 'two' }, field('Ngày đến (tùy chọn)', f.arrDate), field('Giờ đến', f.arrTime)),
      field('Mã đặt chỗ', f.pnr), field('Hành khách (mỗi dòng: tên, ghế, hành lý)', f.pax),
      h('div', { class: 'two' }, field('Cổng', f.gate), field('Nhà ga', f.terminal)),
      field('Ghi chú', f.note), dl, errs,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Lưu chuyến'), h('a', { class: 'btn', href: editing ? '#/trip/' + editId : '#/' }, 'Hủy')));
    formHost.replaceChildren(form);
  }

  if (!editing) {
    const paste = h('textarea', { id: 'paste', rows: '5', maxlength: '20000', placeholder: 'Dán nội dung email hoặc SMS vé vào đây…' });
    page.append(h('div', { class: 'box' },
      h('h2', { text: 'Dán nội dung vé' }),
      h('p', { class: 'muted', text: 'Mình sẽ đọc rồi điền sẵn vào form bên dưới. Bạn soát lại trước khi lưu; không có gì được lưu tự động.' }),
      paste,
      h('button', { class: 'btn', type: 'button', id: 'read', onclick: () => {
        const r = parseTicketText(paste.value, { stations });
        if (!r.trip) { msg.replaceChildren(h('p', { class: 'banner warn', text: r.issues[0] })); return; }
        drawForm({ ...r.trip, id: draft.id }, r.ok ? 'Đã đọc xong. Soát lại thông tin rồi bấm Lưu chuyến.' : 'Đọc được một phần: ' + r.issues.join(' ') + ' Bổ sung trong form bên dưới.');
        formHost.scrollIntoView({ block: 'start' });
      } }, 'Đọc vé')));
  }
  page.append(msg, h('h2', { text: editing ? 'Thông tin chuyến' : 'Hoặc nhập tay' }), formHost);
  drawForm(draft);
  setView(page, 'list');
}

function viewAbout() {
  const fileIn = h('input', { id: 'import-file', type: 'file', accept: 'application/json,.json' });
  const out = h('p', { role: 'status' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    const r = store.importJson(await f.text());
    out.textContent = r.error ? r.error : `Đã nhập: thêm ${r.added}, cập nhật ${r.updated}, bỏ qua ${r.skipped}.`;
    fileIn.value = '';
  });
  setView(h('section', { class: 'page' },
    h('h1', { text: 'Về 9ticket' }),
    h('p', { text: '9ticket gom chuyến bay, tàu, xe khách của bạn ở một chỗ: nhắc giờ ra bến, giữ vé dùng được khi không có mạng, chia tiền nhóm. Dữ liệu nằm trên máy này, không gửi đi đâu.' }),
    h('p', { class: 'banner info', text: 'Hiện 9ticket chưa bán vé và chưa tự cập nhật trạng thái chuyến; trạng thái ở các chuyến mẫu chỉ là dữ liệu mẫu.' }),
    h('h2', { text: 'Đặt vé ở đâu' }),
    h('ul', { class: 'plain' },
      h('li', {}, 'Vé tàu: ', h('a', { href: 'https://dsvn.vn', rel: 'noopener noreferrer', target: '_blank' }, 'dsvn.vn')),
      h('li', {}, 'Vé xe khách: ', h('a', { href: 'https://vexere.com', rel: 'noopener noreferrer', target: '_blank' }, 'vexere.com')),
      h('li', {}, 'Vé máy bay: trang web hoặc ứng dụng của hãng bay.')),
    h('h2', { text: 'Sao lưu dữ liệu' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => download('9ticket-sao-luu.json', store.exportJson(), 'application/json') }, 'Xuất dữ liệu'),
      field('Nhập dữ liệu (tệp JSON)', fileIn)),
    out), 'about');
}

function render() {
  const [path] = (location.hash.replace(/^#/, '') || '/').split('?');
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'trip' && seg[1]) viewDetail(seg[1]);
  else if (seg[0] === 'add') viewAdd(null);
  else if (seg[0] === 'edit' && seg[1]) viewAdd(seg[1]);
  else if (seg[0] === 'about') viewAbout();
  else viewList();
}

async function start() {
  try { stations = await (await fetch('data/stations.json')).json(); } catch { stations = []; }
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
```

- [ ] **Step 2: Mở rộng `css/style.css`** (nối vào cuối file)

```css
h1 { font-size: 1.5rem; margin: 8px 0; }
h2 { font-size: 1.15rem; margin: 20px 0 8px; }
.top { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--line); z-index: 5; padding-top: env(safe-area-inset-top, 0px); }
.top-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px 0; }
.home { text-decoration: none; font-weight: 600; padding: 8px 0; }
.brand { text-decoration: none; font-weight: 800; color: var(--text); }
.tabs { display: flex; gap: 4px; padding: 4px 12px 0; }
.tabs a { padding: 10px 14px; text-decoration: none; color: var(--muted); border-bottom: 3px solid transparent; font-weight: 600; }
.tabs a[aria-current="page"] { color: var(--accent); border-bottom-color: var(--accent); }
.page { max-width: 760px; margin: 0 auto; padding: 8px 16px 48px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 8px 16px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.btn.danger { color: var(--bad-fg); background: var(--bad-bg); border-color: transparent; }
.btn.small { min-height: 36px; padding: 4px 12px; font-size: .9rem; }
.link { background: none; border: 0; color: var(--accent); text-decoration: underline; font: inherit; cursor: pointer; padding: 4px; }
.list { display: grid; gap: 12px; }
.card { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; text-decoration: none; color: var(--text); }
.card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.card .route { font-size: 1.15rem; font-weight: 700; margin: 4px 0; }
.count { color: var(--accent); font-weight: 700; }
.chip { margin-left: auto; padding: 2px 10px; border-radius: 999px; font-size: .85rem; font-weight: 700; }
.chip.ok { background: var(--ok-bg); color: var(--ok-fg); }
.chip.warn { background: var(--warn-bg); color: var(--warn-fg); }
.chip.bad { background: var(--bad-bg); color: var(--bad-fg); }
.chip.info { background: var(--info-bg); color: var(--info-fg); }
.banner { padding: 10px 14px; border-radius: 12px; margin: 12px 0; }
.banner.warn { background: var(--warn-bg); color: var(--warn-fg); }
.banner.info { background: var(--info-bg); color: var(--info-fg); }
.box { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; margin: 8px 0; }
.empty { background: var(--surface); border: 1px dashed var(--line); border-radius: var(--radius); padding: 20px 16px; margin-top: 16px; }
.field { display: grid; gap: 4px; margin: 10px 0; font-weight: 600; }
.field small { font-weight: 400; }
input, select, textarea { width: 100%; min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0; }
.error { color: var(--bad-fg); margin: 8px 0; padding-left: 18px; }
.plain { list-style: none; padding: 0; margin: 8px 0; display: grid; gap: 6px; }
.dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
.dl dt { color: var(--muted); } .dl dd { margin: 0; font-weight: 600; }
.detail-head { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; }
.times { display: flex; gap: 32px; margin: 8px 0; }
.big { font-size: 2.2rem; font-weight: 800; line-height: 1.1; }
.note { white-space: pre-wrap; overflow-wrap: anywhere; }
.pnr strong { font-size: 1.4rem; letter-spacing: .08em; }
main.ticket-mode .detail-body, main.ticket-mode #split, main.ticket-mode h2 { display: none; }
main.ticket-mode .detail-head { font-size: 1.25rem; }
main.ticket-mode .big { font-size: 3.5rem; }
main.ticket-mode .pnr strong { font-size: 2.4rem; }
@media (max-width: 380px) { .two { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Chạy thử**

Run: `cd ticket && npm test` → PASS toàn bộ.
Run: `cd ticket && node scripts/serve.mjs 8190` rồi mở `http://127.0.0.1:8190/`: thấy trạng thái trống; bấm "Xem chuyến mẫu" thấy 3 chuyến sắp tới và 1 đã đi; mở một chuyến, bật chế độ vé; thêm khoản chi; thêm chuyến bằng dán `FLIGHT` mẫu ở Task 8. Dừng máy chủ.

- [ ] **Step 4: Commit** (`9ticket: giao diện Chuyến của tôi`).

---

### Task 11: Service worker và icon PNG

**Files:**
- Create: `ticket/sw.js`, `ticket/scripts/make-icons.mjs`, `ticket/icons/icon-180.png`, `icon-192.png`, `icon-512.png`
- Modify: `ticket/js/app.js` (không cần, đã đăng ký SW)

**Interfaces:**
- Produces: `sw.js` precache toàn bộ vỏ (kể cả `data/stations.json`), cache-first, điều hướng offline trả `index.html`.

- [ ] **Step 1: `sw.js`**

```js
// Service worker 9ticket: precache vỏ ứng dụng theo phiên bản, phục vụ từ cache (chạy được khi không có mạng).
// Đổi CACHE_VERSION mỗi lần phát hành. Bản mới cài xong sẽ chờ đến khi mọi tab đóng.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `9ticket-shell-${CACHE_VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/time.js', './js/model.js', './js/store.js', './js/airport.js', './js/split.js',
  './js/ics.js', './js/parse.js', './js/status.js', './js/sample.js',
  './data/stations.json',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('9ticket-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    try { return await fetch(req); } catch { return new Response('Không có mạng.', { status: 503 }); }
  })());
});
```

- [ ] **Step 2: Icon PNG**

Run: `cp race/scripts/make-icons.mjs ticket/scripts/make-icons.mjs && cd ticket && node scripts/make-icons.mjs`
Expected: in `ok`, ba tệp PNG xuất hiện trong `ticket/icons/`. (Cần Chrome và puppeteer-core như e2e của race; nếu thiếu thì ghi lại và để người dùng chạy sau, nhưng không được bỏ qua tệp PNG vì manifest và `sw.js` tham chiếu chúng.)

- [ ] **Step 3: Test danh sách vỏ khớp tệp thật** — thêm vào `tests/shell.test.mjs`:

```js
test('sw.js: mọi tệp trong SHELL đều tồn tại', () => {
  const sw = read('sw.js');
  const list = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(list.length > 10);
  for (const f of list) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), 'thiếu ' + f);
});
```
Run: `npm test` → PASS.

- [ ] **Step 4: Commit** (`9ticket: service worker và icon`).

---

### Task 12: E2E, README, backlog

**Files:**
- Create: `ticket/scripts/e2e.mjs`, `ticket/README.md`
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: `startServer`, giao diện Task 10. Cần Chrome (`CHROME_PATH`) và puppeteer-core (`PUPPETEER_CORE`) như `race/scripts/e2e.mjs`.

- [ ] **Step 1: Viết `scripts/e2e.mjs`**

```js
// E2E bằng Chrome thật (puppeteer-core): 390x844, 360x740, 1280x800; sáng/tối. Ảnh vào shots/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
const PPT = process.env.PUPPETEER_CORE || 'file:///C:/Users/admin/AppData/Local/Temp/browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { default: puppeteer } = await import(PPT);

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer(0);
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: null,
  args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), '9ticket-chrome-'))}`] });

const FLIGHT = `Vietjet Air - Xác nhận đặt vé
Mã đặt chỗ: ABC12D
Chuyến bay VJ123 Hà Nội (HAN) → TP. Hồ Chí Minh (SGN)
Khởi hành: 15/11/2026 06:30  Đến: 15/11/2026 08:40
Hành khách: <img src=x onerror=window.__xss=1>  Ghế 12A`;

async function clickText(page, sel, text) {
  const done = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t));
    if (el) el.click();
    return Boolean(el);
  }, sel, text);
  if (!done) throw new Error(`không thấy ${sel} "${text}"`);
  await sleep(150);
}

const page = await browser.newPage();
const csp = [];
page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
page.on('pageerror', (e) => csp.push('pageerror: ' + e.message));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle0' });

// 1. Trống -> chuyến mẫu
ok(await page.evaluate(() => document.querySelector('h1').textContent) === 'Chuyến của tôi', 'tiêu đề');
ok(await page.evaluate(() => document.body.textContent.includes('Chưa có chuyến nào')), 'trạng thái trống');
await clickText(page, 'button', 'Xem chuyến mẫu');
ok((await page.$$('a.card')).length === 4, '4 thẻ chuyến mẫu');
ok(await page.evaluate(() => document.body.textContent.includes('Đã đi')), 'có nhóm Đã đi');
await page.screenshot({ path: path.join(SHOTS, 'list-390.png') });

// 2. Chi tiết, giờ ra bến, chế độ vé, chia tiền
await page.evaluate(() => document.querySelector('a.card').click());
await sleep(300);
ok(await page.evaluate(() => /Nên ra sân bay lúc \d\d:\d\d/.test(document.querySelector('.leave-by').textContent)), 'có mốc ra sân bay');
ok(await page.evaluate(() => document.querySelector('#status').textContent.includes('Dữ liệu mẫu')), 'trạng thái ghi rõ dữ liệu mẫu');
await clickText(page, 'button', 'Chế độ vé');
ok(await page.evaluate(() => document.querySelector('main').classList.contains('ticket-mode')), 'chế độ vé bật');
await page.screenshot({ path: path.join(SHOTS, 'ticket-mode-390.png') });
await clickText(page, 'button', 'Thoát chế độ vé');
await page.type('#pay-who', 'TRAN THI B');
await page.type('#pay-amount', '100001');
await page.type('#pay-label', 'Cà phê');
await clickText(page, 'button', 'Thêm khoản chi');
ok(await page.evaluate(() => document.querySelector('.transfers') && /chuyển cho/.test(document.querySelector('.transfers').textContent)), 'có gợi ý chuyển tiền');
await page.type('#pay-who', 'A'); await page.type('#pay-amount', 'abc');
await clickText(page, 'button', 'Thêm khoản chi');
ok(await page.evaluate(() => /số nguyên dương/.test(document.querySelector('#split .error').textContent)), 'báo lỗi số tiền sai');
await page.screenshot({ path: path.join(SHOTS, 'detail-390.png'), fullPage: true });

// 3. Dán vé, XSS không chạy, lưu
await page.goto(ORIGIN + '/#/add', { waitUntil: 'networkidle0' });
await page.type('#paste', FLIGHT);
await clickText(page, 'button', 'Đọc vé');
ok(await page.evaluate(() => document.querySelector('#f-code').value === 'VJ123'), 'đọc ra số hiệu VJ123');
ok(await page.evaluate(() => document.querySelector('#f-from').value === 'Hà Nội'), 'đọc ra nơi đi');
await clickText(page, 'button', 'Lưu chuyến');
await sleep(300);
ok(await page.evaluate(() => location.hash.startsWith('#/trip/')), 'lưu rồi chuyển sang chi tiết');
ok(await page.evaluate(() => document.body.textContent.includes('<img src=x onerror=window.__xss=1>')), 'HTML hiển thị nguyên văn');
ok(await page.evaluate(() => window.__xss === undefined), 'XSS không chạy');

// 4. Form nhập tay có lỗi
await page.goto(ORIGIN + '/#/add', { waitUntil: 'networkidle0' });
await clickText(page, 'button', 'Lưu chuyến');
ok(await page.evaluate(() => document.querySelectorAll('ul.error li').length >= 3), 'form trống báo nhiều lỗi');

// 5. Xóa hai bước
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle0' });
const before = (await page.$$('a.card')).length;
await page.evaluate(() => document.querySelector('a.card').click()); await sleep(300);
await clickText(page, 'button', 'Xóa chuyến');
ok(await page.evaluate(() => location.hash.startsWith('#/trip/')), 'bấm một lần chưa xóa');
await clickText(page, 'button', 'Bấm lần nữa');
await sleep(300);
ok((await page.$$('a.card')).length === before - 1, 'bấm lần hai thì xóa');

// 6. Ngoại tuyến sau khi service worker sẵn sàng
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'networkidle0' });
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(500);
ok((await page.$$('a.card')).length >= 1, 'mở được danh sách khi không có mạng');
await page.setOfflineMode(false);

// 7. Ảnh và kiểm tra cuộn ngang ở 3 cỡ, sáng/tối
for (const [w, h, name] of [[390, 844, '390'], [360, 740, '360'], [1280, 800, '1280']]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    for (const [hash, tag] of [['#/', 'list'], ['#/add', 'add'], ['#/about', 'about']]) {
      await page.goto(ORIGIN + '/' + hash, { waitUntil: 'networkidle0' });
      await sleep(150);
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `không cuộn ngang ${tag} ${name} ${scheme}`);
      await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}-${scheme}.png`) });
    }
  }
}
ok(csp.length === 0, 'không có lỗi CSP/JS: ' + csp.join(' | '));

await browser.close(); server.close();
console.log(`\n${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Chạy e2e**

Run: `cd ticket && npm run e2e`
Expected: "N đạt, 0 lỗi", ảnh trong `ticket/shots/` (đã bị `.gitignore` gốc bỏ qua). Mở xem ít nhất `list-390.png`, `detail-390.png`, `list-1280-dark.png`; nếu bố cục vỡ, sửa CSS rồi chạy lại. Nếu một ca lỗi do selector, sửa `app.js`/e2e cho khớp, không bỏ ca.

- [ ] **Step 3: README `ticket/README.md`**

```markdown
# 9ticket

Trợ lý chuyến đi: gom vé máy bay, tàu, xe khách; nhắc giờ ra sân bay/ga/bến; vé chữ lớn dùng khi không có mạng; xuất .ics; chia tiền nhóm. Webapp tĩnh PWA, dữ liệu lưu trên máy, không đăng nhập, không bán vé.

Thiết kế: `../docs/superpowers/specs/2026-10-12-9ticket-design.md`. Kế hoạch: `../docs/superpowers/plans/2026-10-12-9ticket-implementation.md`.

## Chạy

```
npm test         # node:test: time, model, store, airport, split, ics, parse, status, vỏ trang
npm run serve    # http://127.0.0.1:8080/
npm run e2e      # Chrome thật (puppeteer-core), ảnh vào shots/
```

Cần Chrome (`CHROME_PATH`) và puppeteer-core (`PUPPETEER_CORE`) cho e2e và `scripts/make-icons.mjs`.

## Nối nguồn dữ liệu thật

Trạng thái chuyến đi qua một điểm duy nhất: `js/status.js` (`setSource`). Hiện chỉ có dữ liệu mẫu cho chuyến `mau-*`; chuyến thật hiện "Chưa có thông tin". Nối Datacom Master API (vé bay) tại đây; xem `docs/BACKLOG.md` mục 9ticket để biết điều chưa rõ cần hỏi Datacom.

## Chưa làm

Tìm và đặt vé, thanh toán, tài khoản 9id và đồng bộ, thông báo đẩy, chụp ảnh vé, sân bay đi/đến, hành khách gia đình, đăng ký launcher/Console, deploy.
```

- [ ] **Step 4: Cập nhật `docs/BACKLOG.md`**: trong mục 9ticket ở nhóm B thêm câu: "Giao diện giai đoạn 1 (Chuyến của tôi) đã xong trong `ticket/`, chưa deploy, chưa đăng ký launcher/Console; nối Datacom khi có sandbox." và thêm hai việc nhóm B còn lại: "9ticket: tìm vé + đặt qua Datacom", "9ticket: sân bay đi/đến, hành khách gia đình".

- [ ] **Step 5: Chạy toàn bộ và commit**

Run: `cd ticket && npm test` → PASS. Commit (`9ticket: e2e, README, cập nhật backlog`; `git add ticket docs/BACKLOG.md`).

---

## Self-review (đã rà với spec)

- **Phủ spec:** mục 3 kiến trúc → Task 1, 11; mục 4 dữ liệu → Task 3, 4; mục 5 màn hình (Chuyến, Chi tiết, Thêm, Về app) → Task 10; giờ ra bến → Task 5; .ics → Task 7; chia tiền → Task 6; trạng thái cắm được → Task 9; mục 6 lỗi/an toàn → Review Focus 1-5 và Task 3, 4, 8, 10; mục 7 kiểm thử → test từng task + Task 12. Mục 8 (về sau) cố ý ngoài phạm vi.
- **Placeholder:** không còn "TBD"; mọi bước mã có đủ mã. Ngoại lệ cố ý: Task 11 Bước 2 phụ thuộc Chrome trên máy.
- **Nhất quán kiểu:** `validateTrip/cleanTrip`, `createStore` (`load/get/upsert/remove/exportJson/importJson/isPersistent`), `leaveByIso/leadMinutes/isInternational/placeWord`, `settle/splitShares`, `buildICS/icsFileName`, `parseTicketText/matchStation/findStations`, `getStatus/setSource/STATE_LABEL`, `makeSamples` dùng thống nhất giữa các task. Id chuyến mẫu `mau-bay`, `mau-tau`, `mau-xe`, `mau-bay-cu` khớp giữa `sample.js` và `status.js`.
