import fs from 'node:fs';
const wrap = (id, stops, glyph, shadow = '#000') => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset=".55" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/></linearGradient>
    <radialGradient id="glow" cx=".2" cy=".05" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="${shadow}" flood-opacity=".3"/></filter>
  </defs>
  <rect width="512" height="512" rx="114" fill="url(#bg)"/>
  <rect width="512" height="512" rx="114" fill="url(#glow)"/>
  <g filter="url(#sh)">${glyph}</g>
</svg>
`;
const W = '#fff';
const icons = {
  // túi mua sắm
  shop: wrap('shop', ['#ff9ac8', '#ec4899', '#9d174d'], `<path d="M130 190h252l20 188c2 18-12 34-30 34H140c-18 0-32-16-30-34z" fill="${W}"/><path d="M190 190v-26c0-38 28-64 66-64s66 26 66 64v26" fill="none" stroke="${W}" stroke-width="26" stroke-linecap="round"/><circle cx="206" cy="232" r="14" fill="#ec4899"/><circle cx="306" cy="232" r="14" fill="#ec4899"/>`),
  // vé có lỗ khuyết + máy bay nhỏ
  ticket: wrap('ticket', ['#7dd3fc', '#0ea5e9', '#075985'], `<path d="M96 168h320a24 24 0 0 1 24 24v36a34 34 0 0 0 0 68v36a24 24 0 0 1-24 24H96a24 24 0 0 1-24-24v-36a34 34 0 0 0 0-68v-36a24 24 0 0 1 24-24z" fill="${W}"/><path d="M318 190v132" stroke="#0ea5e9" stroke-width="10" stroke-dasharray="4 18" stroke-linecap="round"/><path d="M118 214L286 262 118 310l30-48z" fill="#0ea5e9"/><path d="M148 262h138" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`),
  // voucher giảm giá %
  voucher: wrap('voucher', ['#f0abfc', '#c026d3', '#701a75'], `<path d="M96 168h320a24 24 0 0 1 24 24v36a34 34 0 0 0 0 68v36a24 24 0 0 1-24 24H96a24 24 0 0 1-24-24v-36a34 34 0 0 0 0-68v-36a24 24 0 0 1 24-24z" fill="${W}"/><circle cx="198" cy="236" r="22" fill="none" stroke="#c026d3" stroke-width="16"/><circle cx="314" cy="296" r="22" fill="none" stroke="#c026d3" stroke-width="16"/><path d="M318 220L194 312" stroke="#c026d3" stroke-width="18" stroke-linecap="round"/>`),
  // hóa đơn
  bill: wrap('bill', ['#5eead4', '#14b8a6', '#115e59'], `<path d="M132 96h248v292l-31-22-31 22-31-22-31 22-31-22-31 22-31-22z" transform="translate(0 6)" fill="${W}"/><g stroke="#14b8a6" stroke-width="18" stroke-linecap="round"><path d="M180 180h152"/><path d="M180 232h152"/><path d="M180 284h96"/></g>`),
  // ví + đồng xu (ngày lương)
  payday: wrap('payday', ['#fde68a', '#f59e0b', '#92400e'], `<rect x="92" y="170" width="328" height="226" rx="40" fill="${W}"/><path d="M92 214c0-22 18-40 40-40h200" fill="none" stroke="#f59e0b" stroke-width="14" stroke-linecap="round" opacity=".0"/><rect x="316" y="250" width="132" height="76" rx="36" fill="#fbbf24" stroke="${W}" stroke-width="12"/><circle cx="354" cy="288" r="12" fill="#fff"/><circle cx="250" cy="132" r="54" fill="#fbbf24" stroke="${W}" stroke-width="12"/><circle cx="250" cy="132" r="28" fill="none" stroke="#b45309" stroke-width="10"/>`),
  // ô tô
  car: wrap('car', ['#cbd5e1', '#64748b', '#1e293b'], `<path d="M110 300l22-80c6-20 24-34 46-34h156c20 0 38 12 46 30l36 84c6 14 6 22 6 36v14c0 10-8 18-18 18H116c-10 0-18-8-18-18v-34c0-6 4-12 12-16z" fill="${W}"/><path d="M168 224h84v52h-98zM276 224h46c8 0 14 4 18 10l26 42h-90z" fill="#64748b" opacity=".55"/><circle cx="176" cy="370" r="36" fill="#1e293b" stroke="${W}" stroke-width="14"/><circle cx="346" cy="370" r="36" fill="#1e293b" stroke="${W}" stroke-width="14"/>`),
  // tạ đòn
  fit: wrap('fit', ['#d9f99d', '#84cc16', '#3f6212'], `<g fill="${W}"><rect x="64" y="212" width="52" height="88" rx="14"/><rect x="120" y="176" width="52" height="160" rx="14"/><rect x="340" y="176" width="52" height="160" rx="14"/><rect x="396" y="212" width="52" height="88" rx="14"/><rect x="172" y="240" width="168" height="32" rx="12"/></g>`),
  // hộp quà
  gift: wrap('gift', ['#fca5a5', '#ef4444', '#991b1b'], `<rect x="110" y="214" width="292" height="182" rx="26" fill="${W}"/><rect x="92" y="164" width="328" height="70" rx="22" fill="${W}"/><rect x="232" y="164" width="48" height="232" fill="#ef4444"/><path d="M256 164c-18-62-96-70-96-30 0 36 62 30 96 30zM256 164c18-62 96-70 96-30 0 36-62 30-96 30z" fill="none" stroke="${W}" stroke-width="22" stroke-linejoin="round"/>`),
  // bong bóng thoại Aa
  english: wrap('english', ['#a5b4fc', '#6366f1', '#3730a3'], `<path d="M118 118h276a34 34 0 0 1 34 34v146a34 34 0 0 1-34 34H252l-76 68v-68h-58a34 34 0 0 1-34-34V152a34 34 0 0 1 34-34z" transform="translate(-2 -6)" fill="${W}"/><text x="256" y="300" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="150" fill="#6366f1">Aa</text>`),
  // trao đổi
  swap: wrap('swap', ['#6ee7b7', '#10b981', '#065f46'], `<g fill="none" stroke="${W}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"><path d="M116 200h250"/><path d="M318 144l56 56-56 56"/><path d="M396 322H146"/><path d="M194 266l-56 56 56 56"/></g>`),
  // máy quét tài liệu
  scanner: wrap('scanner', ['#c4b5fd', '#8b5cf6', '#4c1d95'], `<path d="M170 120h128l62 62v196c0 14-12 26-26 26H170c-14 0-26-12-26-26V146c0-14 12-26 26-26z" fill="${W}"/><path d="M298 120v44c0 10 8 18 18 18h44z" fill="#ddd6fe"/><g stroke="#8b5cf6" stroke-width="14" stroke-linecap="round"><path d="M186 232h96"/><path d="M186 282h140"/></g><g fill="none" stroke="${W}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><path d="M92 176v-52c0-14 10-24 24-24h52"/><path d="M420 176v-52c0-14-10-24-24-24h-52"/><path d="M92 336v52c0 14 10 24 24 24h52"/><path d="M420 336v52c0 14-10 24-24 24h-52"/></g><path d="M112 308h288" stroke="#a78bfa" stroke-width="12" stroke-linecap="round"/>`),
  // cờ lê sửa chữa
  repair: wrap('repair', ['#e7c79a', '#b45309', '#451a03'], `<mask id="m"><rect width="512" height="512" fill="#fff"/><rect x="322" y="46" width="48" height="120" fill="#000" transform="rotate(45 346 166)"/><circle cx="346" cy="166" r="26" fill="#000"/></mask><g mask="url(#m)"><path d="M136 376L300 212" stroke="${W}" stroke-width="56" stroke-linecap="round"/><circle cx="346" cy="166" r="88" fill="${W}"/></g><circle cx="148" cy="364" r="13" fill="#b45309"/>`),
  // sạc xe điện
  charge: wrap('charge', ['#67e8f9', '#06b6d4', '#155e75'], `<path d="M290 80L142 288h96l-30 144 164-224h-102z" fill="${W}"/>`),
};
fs.mkdirSync('svg', { recursive: true });
for (const [k, v] of Object.entries(icons)) fs.writeFileSync(`svg/${k}.svg`, v);
console.log(Object.keys(icons).join(','));
