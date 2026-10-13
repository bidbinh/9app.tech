/* Cấu hình trang chủ 9app (v18) — nhóm ứng dụng, banner hero, mô tả ngắn, hình minh họa SVG tự vẽ.
 * ES5 thuần (WebView ô tô cũ không chạy ES module). Không logo/ảnh của bên thứ ba: mọi hình là SVG tự vẽ.
 *
 * THÊM APP MỚI: chỉ cần khai trong js/apps.js như trước (id, name, blurb, href, icon, category, ready).
 *  - Nhóm: nếu app có trường `group` thì dùng; nếu không thì tra GROUP_OF[id]; nếu không nữa thì suy từ `category`
 *    (CAT_TO_GROUP); cuối cùng rơi vào nhóm 'other' (Công cụ khác). Mỗi app chỉ thuộc MỘT nhóm.
 *  - Mô tả ngắn trên thẻ: SHORT[id] (tùy chọn, mặc định cắt từ blurb). Câu quảng bá ở "Gợi ý cho bạn": PROMO[id] (tùy chọn).
 *  - Banner hero: sửa mảng BANNERS bên dưới (xem ghi chú từng trường).
 */

/* ---------- Nhóm ứng dụng ----------
 * tone: bảng màu pastel (xem .tone-* trong css/style.css). icon: id biểu tượng trong index.html. */
var GROUPS = [
  { id: 'move',  label: 'Di chuyển & Giao nhận', blurb: 'Đi lại, giao hàng, vận chuyển', tone: 'orange', icon: 'i-truck' },
  { id: 'home',  label: 'Gia đình & Đời sống',   blurb: 'Con cái, gia đạo, nhà cửa',     tone: 'green',  icon: 'i-house' },
  { id: 'money', label: 'Tài chính & Tiện ích',  blurb: 'Thu chi, tính toán, quy đổi',   tone: 'violet', icon: 'i-chart' },
  { id: 'work',  label: 'Công việc & Học tập',   blurb: 'Việc làm, học hành, giấy tờ',   tone: 'blue',   icon: 'i-brief' },
  { id: 'fun',   label: 'Giải trí & Thể thao',   blurb: 'Thể thao, sự kiện, cộng đồng',  tone: 'rose',   icon: 'i-ball' },
  { id: 'other', label: 'Công cụ khác',          blurb: 'Các ứng dụng hỗ trợ khác',      tone: 'amber',  icon: 'i-tool' }
];

var GROUP_OF = {
  ship: 'move', speed: 'move', log: 'move',
  family: 'home', quy: 'home', vannien: 'home', giapha: 'home', swap: 'home', lunch: 'home',
  fin: 'money', unit: 'money',
  hire: 'work', interview: 'work', english: 'work', license: 'work', scanner: 'work', tutor: 'work',
  pick: 'fun', race: 'fun'
};

var CAT_TO_GROUP = { work: 'work', drive: 'move', family: 'home', hobby: 'fun', life: 'home' };

/* ---------- Mô tả ngắn (thẻ "Nổi bật") ---------- */
var SHORT = {
  ship: 'Gửi hàng, so sánh cước', speed: 'Cảnh báo tốc độ, camera', log: 'Quản lý vận tải', race: 'Lịch giải chạy bộ',
  unit: 'Máy tính, đổi chỉ vàng', english: 'Tiếng Anh công sở', license: 'Ôn thi bằng lái xe', lunch: 'Đặt cơm trưa chung',
  swap: 'Tặng, đổi đồ cũ', hire: 'Việc làm thêm, tuyển nhanh', interview: 'Luyện phỏng vấn, làm CV', scanner: 'Quét tài liệu ra PDF',
  family: 'Lịch học, đưa đón con', giapha: 'Gia phả họ Trần', quy: 'Thu chi hội phụ huynh', fin: 'Sổ thu chi cá nhân',
  pick: 'Câu lạc bộ thể thao', vannien: 'Lịch âm, ngày giờ tốt'
};

/* ---------- Câu quảng bá ("Gợi ý cho bạn"): [dòng 1, dòng 2] ---------- */
var PROMO = {
  ship: ['Gửi hàng toàn quốc', 'So sánh cước các hãng'],
  license: ['Ôn thi bằng lái', 'Bộ 600 câu chính thức'],
  interview: ['Phỏng vấn tự tin', 'Luyện câu hỏi, làm CV'],
  english: ['Tiếng Anh công sở', 'Từ vựng, mẫu câu, luyện nói'],
  hire: ['Việc làm thêm', 'Có lọc tin lừa đảo'],
  scanner: ['Quét giấy tờ ra PDF', 'Chỉ cần camera'],
  swap: ['Tặng và đổi đồ cũ', 'Trong công ty, tòa nhà'],
  lunch: ['Đặt cơm trưa chung', 'Chia tiền cả nhóm'],
  unit: ['Tính nhanh bằng giọng nói', 'Đổi chỉ vàng, lãi vay'],
  vannien: ['Xem ngày giờ tốt', 'Lịch âm dương, phong thủy'],
  speed: ['Lái xe an tâm hơn', 'Cảnh báo tốc độ, camera'],
  race: ['Tìm giải chạy', 'Lịch giải và link đăng ký'],
  family: ['Lịch học, đưa đón', 'Việc chung cả nhà'],
  quy: ['Quỹ hội phụ huynh', 'Thu chi minh bạch'],
  fin: ['Sổ thu chi gọn gàng', 'Quét QR, đồng bộ SePay'],
  pick: ['Câu lạc bộ thể thao', 'Trận, quỹ, video'],
  giapha: ['Gia phả dòng họ', 'Tra cứu thế hệ'],
  log: ['Quản lý vận tải', 'Đơn hàng trên điện thoại']
};

/* Thứ tự ưu tiên khi chọn "Nổi bật" mặc định cho người mới / "Gợi ý" cho app chưa dùng */
var FEATURED_DEFAULT = ['ship', 'family', 'hire'];
var SUGGEST_PRIORITY = ['license', 'interview', 'english', 'scanner', 'swap', 'lunch', 'unit', 'vannien', 'speed', 'race', 'quy', 'fin', 'pick', 'giapha', 'log'];
/* App mới (Khám phá › Mới trên 9app) */
var NEW_IDS = ['family', 'scanner', 'swap', 'lunch', 'interview'];

/* Gợi ý tìm chức năng (Khám phá) — phải khớp chỉ mục tìm kiếm thật */
var EXPLORE_QUERIES = ['gửi hàng', 'bằng lái', 'cảnh báo tốc độ', 'văn khấn', 'lịch giải chạy', 'đổi chỉ vàng', 'phỏng vấn', 'quét tài liệu'];

/* Osin: chưa có — chỉ xem trước câu hỏi mẫu, KHÔNG dẫn tới trang nào */
var OSIN_SAMPLES = ['Hôm nay có ngày tốt để khai trương không?', 'Gửi 3 kg hàng ra Hà Nội hãng nào rẻ nhất?', 'Tuần này con tôi có lịch học gì?'];

/* Mục "Sắp ra mắt" ở cuối Tất cả (tự bỏ mục trùng tên app thật) */
var SOON = [
  { name: 'Osin', icon: 'icons/soon-osin.svg?v=1', note: 'Trợ lý hỏi đáp' },
  { name: '9shop', icon: 'icons/soon-shop.svg?v=1' }, { name: '9ticket', icon: 'icons/soon-ticket.svg?v=1' },
  { name: '9voucher', icon: 'icons/soon-voucher.svg?v=1' }, { name: '9bill', icon: 'icons/soon-bill.svg?v=1' },
  { name: '9payday', icon: 'icons/soon-payday.svg?v=1' }, { name: '9car', icon: 'icons/soon-car.svg?v=1' },
  { name: '9fit', icon: 'icons/soon-fit.svg?v=1' }, { name: '9gift', icon: 'icons/soon-gift.svg?v=1' },
  { name: '9repair', icon: 'icons/soon-repair.svg?v=1' }
];

/* ---------- Banner hero ----------
 * Trường: id · tag (nhãn nhỏ) · title (dòng ngăn bằng "|") · desc · cta (nút)
 *   đích (chọn một): href (liên kết thật) | view ('explore'|'library'|'favorites') | search (điền sẵn ô tìm) | soon:true (nút tắt, KHÔNG dẫn đi đâu)
 *   app: id app liên quan — nếu người dùng đã ẩn app đó thì banner bị bỏ qua
 *   tone: blue|green|amber|violet|teal · art: tên hình trong ART bên dưới */
var BANNERS = [
  { id: 'ship', app: 'ship', tag: '9Ship', title: 'Gửi hàng siêu dễ|Giá tốt nhất', desc: 'So sánh cước các hãng • In bill, theo dõi đơn', cta: 'Gửi ngay', href: '9ship/', tone: 'blue', art: 'ship' },
  { id: 'family', app: 'family', tag: '9family', title: 'Lịch học, đưa đón|cả nhà một chỗ', desc: 'Ai đón con, ai đi học, việc chung của nhà', cta: 'Mở 9family', href: '9family/', tone: 'green', art: 'family' },
  { id: 'license', app: 'license', tag: '9license', title: 'Ôn thi bằng lái|600 câu chính thức', desc: 'Học ngay trên điện thoại, mọi lúc mọi nơi', cta: 'Ôn ngay', href: 'license/', tone: 'amber', art: 'license' },
  { id: 'osin', tag: 'Osin', title: 'Osin, trợ lý|sắp ra mắt', desc: 'Hỏi một câu, Osin chỉ đúng chức năng trong 9app', cta: 'Sắp ra mắt', soon: true, tone: 'violet', art: 'osin' },
  { id: 'search', tag: 'Tìm chức năng', title: 'Gõ là thấy|đúng chức năng', desc: 'Ví dụ: “văn khấn”, “bằng lái”, “đổi chỉ vàng”', cta: 'Thử tìm ngay', search: 'văn khấn', tone: 'teal', art: 'search' }
];

/* ---------- Hình minh họa hero (SVG phẳng nhiều lớp, tự vẽ; id gradient có tiền tố riêng) ---------- */
var ART = {};
ART.ship =
  '<svg viewBox="0 0 220 160" aria-hidden="true" focusable="false"><defs>' +
  '<linearGradient id="as_t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ffe6cf"/></linearGradient>' +
  '<linearGradient id="as_l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3cb"/><stop offset="1" stop-color="#ffc08a"/></linearGradient>' +
  '<linearGradient id="as_r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb070"/><stop offset="1" stop-color="#ef8236"/></linearGradient>' +
  '</defs>' +
  '<ellipse cx="116" cy="146" rx="78" ry="9" fill="#1e3a8a" opacity=".13"/>' +
  '<g stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"><path d="M8 78h26"/><path d="M2 94h34" opacity=".75"/><path d="M12 110h22" opacity=".55"/></g>' +
  '<polygon points="32,106 60,120 60,148 32,134" fill="url(#as_l)"/><polygon points="88,106 60,120 60,148 88,134" fill="url(#as_r)"/><polygon points="60,92 88,106 60,120 32,106" fill="url(#as_t)"/>' +
  '<polygon points="70,62 118,86 118,134 70,110" fill="url(#as_l)"/><polygon points="166,62 118,86 118,134 166,110" fill="url(#as_r)"/><polygon points="118,38 166,62 118,86 70,62" fill="url(#as_t)"/>' +
  '<polygon points="100,47 88,53 136,77 148,71" fill="#f97316" opacity=".92"/><polygon points="136,77 148,71 148,95 136,101" fill="#ea580c" opacity=".35"/>' +
  '<polygon points="80,78 104,90 104,108 80,96" fill="#fff" opacity=".88"/><path d="M85 86l14 7M85 92l10 5" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>' +
  '<g><rect x="148" y="10" width="66" height="28" rx="14" fill="#fff"/><circle cx="164" cy="24" r="8" fill="#16a34a"/><path d="M160.5 24.5l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="177" y="19" width="30" height="4.5" rx="2.2" fill="#c7d6ee"/><rect x="177" y="26.5" width="20" height="4.5" rx="2.2" fill="#dbe5f5"/></g>' +
  '<g><rect x="4" y="30" width="62" height="28" rx="14" fill="#fff"/><path d="M22 51s-8-6-8-12a8 8 0 0116 0c0 6-8 12-8 12z" fill="#2563eb"/><circle cx="22" cy="39" r="3" fill="#fff"/><rect x="36" y="38" width="24" height="4.5" rx="2.2" fill="#c7d6ee"/><rect x="36" y="45.5" width="16" height="4.5" rx="2.2" fill="#dbe5f5"/></g>' +
  '<g><rect x="150" y="104" width="62" height="28" rx="14" fill="#fff"/><circle cx="166" cy="118" r="8" fill="#f59e0b"/><path d="M166 113v10M163 116.5h5a2 2 0 010 4h-4a2 2 0 000 4h5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" transform="translate(0 -1)"/><rect x="179" y="112" width="26" height="4.5" rx="2.2" fill="#c7d6ee"/><rect x="179" y="119.5" width="18" height="4.5" rx="2.2" fill="#dbe5f5"/></g>' +
  '</svg>';

ART.family =
  '<svg viewBox="0 0 220 160" aria-hidden="true" focusable="false"><defs>' +
  '<linearGradient id="af_c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e9f7ee"/></linearGradient>' +
  '<linearGradient id="af_h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#15803d"/></linearGradient>' +
  '</defs>' +
  '<ellipse cx="108" cy="148" rx="74" ry="8" fill="#14532d" opacity=".12"/>' +
  '<g transform="rotate(-5 100 80)"><rect x="34" y="30" width="116" height="110" rx="16" fill="url(#af_c)"/><path d="M34 46a16 16 0 0116-16h84a16 16 0 0116 16v14H34z" fill="url(#af_h)"/>' +
  '<rect x="56" y="22" width="7" height="18" rx="3.5" fill="#fff"/><rect x="121" y="22" width="7" height="18" rx="3.5" fill="#fff"/>' +
  '<g fill="#cfe8d8"><circle cx="54" cy="80" r="5"/><circle cx="76" cy="80" r="5"/><circle cx="98" cy="80" r="5"/><circle cx="120" cy="80" r="5"/><circle cx="142" cy="80" r="5"/><circle cx="54" cy="100" r="5"/><circle cx="76" cy="100" r="5"/><circle cx="120" cy="100" r="5"/><circle cx="142" cy="100" r="5"/><circle cx="54" cy="120" r="5"/><circle cx="76" cy="120" r="5"/><circle cx="98" cy="120" r="5"/></g>' +
  '<circle cx="98" cy="100" r="11" fill="#16a34a"/><path d="M92.5 100.5l4 4 7.5-8.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>' +
  '<g><circle cx="176" cy="48" r="28" fill="#fff"/><circle cx="176" cy="48" r="28" fill="none" stroke="#bfe6cd" stroke-width="5"/><path d="M176 31v18l12 7" fill="none" stroke="#15803d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>' +
  '<g><rect x="150" y="96" width="62" height="40" rx="14" fill="#fff"/><path d="M168 126V111l10-8 10 8v15z" fill="#22c55e"/><rect x="174" y="116" width="8" height="10" rx="2" fill="#fff"/><circle cx="198" cy="112" r="4.5" fill="#f59e0b"/><rect x="192" y="119" width="14" height="6" rx="3" fill="#fcd34d"/></g>' +
  '</svg>';

ART.license =
  '<svg viewBox="0 0 220 160" aria-hidden="true" focusable="false"><defs>' +
  '<linearGradient id="al_b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>' +
  '<linearGradient id="al_w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0f0ff"/><stop offset="1" stop-color="#9ccbf7"/></linearGradient>' +
  '</defs>' +
  '<ellipse cx="104" cy="146" rx="84" ry="8" fill="#78350f" opacity=".14"/>' +
  '<g><rect x="132" y="8" width="78" height="96" rx="12" fill="#fff"/><rect x="144" y="22" width="40" height="6" rx="3" fill="#c9d6e8"/><rect x="144" y="36" width="54" height="5" rx="2.5" fill="#dde6f3"/><rect x="144" y="48" width="48" height="5" rx="2.5" fill="#dde6f3"/>' +
  '<g fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="150" cy="70" r="7" fill="#16a34a" stroke="none"/><path d="M146.5 70l2.5 2.5 4.5-5" stroke="#fff"/><rect x="162" y="67.5" width="34" height="5" rx="2.5" fill="#dde6f3" stroke="none"/><circle cx="150" cy="88" r="7" fill="#16a34a" stroke="none"/><path d="M146.5 88l2.5 2.5 4.5-5" stroke="#fff"/><rect x="162" y="85.5" width="26" height="5" rx="2.5" fill="#dde6f3" stroke="none"/></g></g>' +
  '<g><circle cx="26" cy="38" r="22" fill="#fff"/><circle cx="26" cy="38" r="22" fill="none" stroke="#dc2626" stroke-width="6"/><path d="M16 38h20M30 30l8 8-8 8" fill="none" stroke="#1e3a8a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>' +
  '<g><path d="M20 126c0-12 6-20 16-23l22-22c4-4 9-6 15-6h46c10 0 19 4 25 12l10 14c8 1 14 8 14 17v8H20z" fill="url(#al_b)"/>' +
  '<path d="M66 82h30v26H48l14-20c1-2 2-4 4-6zM104 82h30c5 0 9 3 12 8l8 18h-50z" fill="url(#al_w)"/><rect x="20" y="124" width="167" height="9" fill="#1e40af" opacity=".35"/>' +
  '<circle cx="62" cy="132" r="15" fill="#1e293b"/><circle cx="62" cy="132" r="6.5" fill="#cbd5e1"/><circle cx="152" cy="132" r="15" fill="#1e293b"/><circle cx="152" cy="132" r="6.5" fill="#cbd5e1"/>' +
  '<rect x="24" y="112" width="12" height="8" rx="3" fill="#fde68a"/></g>' +
  '</svg>';

ART.osin =
  '<svg viewBox="0 0 220 160" aria-hidden="true" focusable="false"><defs>' +
  '<linearGradient id="ao_a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#5b21b6"/></linearGradient>' +
  '<linearGradient id="ao_b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ece6ff"/></linearGradient>' +
  '</defs>' +
  '<ellipse cx="110" cy="148" rx="70" ry="8" fill="#3b0764" opacity=".12"/>' +
  '<g><path d="M30 20h100a18 18 0 0118 18v40a18 18 0 01-18 18H78l-24 22V96H30a18 18 0 01-18-18V38a18 18 0 0118-18z" fill="url(#ao_b)"/><rect x="30" y="38" width="86" height="7" rx="3.5" fill="#d4c8f5"/><rect x="30" y="54" width="104" height="7" rx="3.5" fill="#e3dafa"/><rect x="30" y="70" width="60" height="7" rx="3.5" fill="#e3dafa"/></g>' +
  '<g><path d="M120 84h56a18 18 0 0118 18v22a18 18 0 01-18 18h-8v18l-22-18h-26a18 18 0 01-18-18v-22a18 18 0 0118-18z" fill="url(#ao_a)"/><circle cx="138" cy="113" r="5.5" fill="#fff"/><circle cx="157" cy="113" r="5.5" fill="#fff" opacity=".85"/><circle cx="176" cy="113" r="5.5" fill="#fff" opacity=".65"/></g>' +
  '<g fill="#fbbf24"><path d="M184 14l4 11 11 4-11 4-4 11-4-11-11-4 11-4z"/></g><g fill="#a78bfa"><path d="M20 126l2.6 7 7 2.6-7 2.6-2.6 7-2.6-7-7-2.6 7-2.6z"/></g><g fill="#fff"><path d="M206 66l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></g>' +
  '</svg>';

ART.search =
  '<svg viewBox="0 0 220 160" aria-hidden="true" focusable="false"><defs>' +
  '<linearGradient id="ae_g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0f766e"/></linearGradient>' +
  '</defs>' +
  '<ellipse cx="108" cy="148" rx="74" ry="8" fill="#134e4a" opacity=".12"/>' +
  '<rect x="34" y="14" width="156" height="118" rx="16" fill="#fff"/>' +
  '<g><rect x="48" y="30" width="26" height="26" rx="8" fill="#fb923c"/><rect x="82" y="33" width="64" height="6" rx="3" fill="#c7d9e8"/><rect x="82" y="45" width="84" height="5" rx="2.5" fill="#dfe9f2"/>' +
  '<rect x="48" y="66" width="26" height="26" rx="8" fill="#60a5fa"/><rect x="82" y="69" width="52" height="6" rx="3" fill="#c7d9e8"/><rect x="82" y="81" width="72" height="5" rx="2.5" fill="#dfe9f2"/>' +
  '<rect x="48" y="102" width="26" height="22" rx="8" fill="#4ade80"/><rect x="82" y="105" width="58" height="6" rx="3" fill="#c7d9e8"/></g>' +
  '<g><circle cx="150" cy="86" r="34" fill="#fff" fill-opacity=".55" stroke="url(#ae_g)" stroke-width="11"/><path d="M175 111l26 26" stroke="#0f766e" stroke-width="13" stroke-linecap="round"/><path d="M138 78a14 14 0 0112-8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>' +
  '<g fill="#fbbf24"><path d="M196 18l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/></g>' +
  '</svg>';
