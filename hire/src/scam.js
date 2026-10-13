// Bộ lọc chống lừa đảo cho tin tuyển dụng. Thuần hàm, có kiểm thử riêng (test/scam.test.js).
// block: chặn cứng (không cho đăng); risk: nghi ngờ (cho đăng nhưng gắn nhãn "cần cẩn trọng").
import { stripAccents } from './util.js';

// Ký tự giống chữ Latin (Cyrillic, Hy Lạp) -> Latin
const HOMO = { 'о': 'o', 'О': 'O', 'а': 'a', 'А': 'A', 'е': 'e', 'Е': 'E', 'с': 'c', 'С': 'C', 'р': 'p', 'Р': 'P', 'х': 'x', 'Х': 'X', 'у': 'y', 'і': 'i', 'І': 'I', 'ѕ': 's', 'ԁ': 'd', 'ο': 'o', 'Ο': 'O', 'α': 'a', 'ν': 'v', 'ι': 'i', 'κ': 'k', 'τ': 't', 'ρ': 'p', 'Β': 'B', 'Ε': 'E', 'Τ': 'T', 'Κ': 'K' };
// Chuẩn hóa Unicode: NFKC (chữ toàn rộng...), bỏ hẳn ký tự định dạng vô hình (ZWSP, soft hyphen, RTL...), đổi homoglyph về Latin
export function canon(s) {
  return String(s ?? '').normalize('NFKC').replace(/[\p{Cf}­]/gu, '').replace(/[Ͱ-ϿЀ-ӿ]/g, (c) => HOMO[c] || c);
}

// Chuẩn hóa để so khớp: không dấu, chữ thường, mọi ký tự không phải chữ/số thành dấu cách,
// dấu câu thành " | " để câu phủ định không "lan" sang câu sau
function norm(s) {
  const t = stripAccents(canon(s)).toLowerCase()
    .replace(/[,.;:!?\n()\[\]{}"“”‘’]+/g, ' | ')
    .replace(/[^a-z0-9|]+/g, ' ');
  return (' ' + t.replace(/\s+/g, ' ').trim() + ' ').replace(/ ?\| ?(\| ?)*/g, ' | ');
}

// "d a t c o c": nối chuỗi từ ≥ 3 chữ cái đơn lẻ liên tiếp để chống viết cách chữ
function joinSingles(n) {
  return n.replace(/(?: [a-z]){3,}(?= |$)/g, (m) => ' ' + m.replace(/ /g, '')).replace(/\s+/g, ' ');
}
// "d4t c0c": trong từ vừa có chữ vừa có số (ít nhất 2 chữ), đổi số thành chữ giống nó
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };
function leet(n) {
  return n.replace(/\b[a-z0-9]{3,10}\b/g, (w) => (/[a-z].*[a-z]/.test(w) && /\d/.test(w) ? w.replace(/\d/g, (d) => LEET[d] || d) : w));
}

// Cụm hợp lệ được bỏ trước khi quét (câu phủ định, ngữ cảnh nghề nghiệp bình thường)
const NEG = /\b(?:khong|ko|chang|mien|tuyet doi khong|nghiem cam|cam)(?: (?:can|phai|bat buoc|he|mat|yeu cau|thu|dong|nop|lay|tinh|bi|co))*(?: (?:tien|khoan))? (?:phi(?: (?:tuyen dung|dao tao|ho so|dang ky|gia nhap|lam viec|dong phuc|dich vu|moi gioi|giu cho))?|dat coc|tien coc|coc|ky quy)\b/g;
const OK = [
  /\bthu phi (?:giu|gui|do) xe\b/g, /\bthu phi (?:cau duong|tram|ben bai|bai xe|cao toc)\b/g, /\bnhan vien thu phi\b/g,
  // công ty đóng bảo hiểm cho nhân viên; lương chuyển khoản
  /\b(?:dong|nop|tra|chi tra|ho tro|dong gop) (?:toan bo |day du )?(?:phi )?(?:bao hiem|bhxh|bhyt|bhtn|cong doan)\b/g, /\bphi (?:bao hiem|cong doan)\b/g,
  /\b(?:luong|thuong|tien cong|tien luong|thanh toan|tra luong|nhan luong|tra)(?: \w+){0,3} chuyen khoan\b/g, /\bchuyen khoan (?:luong|thuong)\b/g,
  // mua hàng nội bộ, đi chợ
  /\b(?:duoc|quyen|co quyen|uu tien|uu dai) (?:mua|nhan) (?:hang|san pham)(?: \w+){0,6}/g, /\b(?:di cho|di sieu thi|di mua)(?: \w+){0,4} mua (?:hang|do)(?: \w+){0,3}/g,
  /\bmua hang (?:cho|giup) (?:bep|quan|cua hang|kho|nha hang|khach)\b/g, /\bmua hang hoa (?:cho|giup|ve) (?:bep|quan|cua hang|kho)\b/g,
  // nạp tiền điện thoại, thẻ cào, game (cửa hàng)
  /\bnap tien (?:dien thoai|the cao|game|may|xe|dien nuoc|data)\b/g, /\bnap (?:the|data|dien thoai)\b/g,
  // đặt cọc của khách thuê
  /\b(?:tien |dat )?coc(?: \w+){0,4} (?:cua|cho) khach\b/g, /\bkhach (?:dat |dong |tra )?coc\b/g, /\b(?:nhan|thu|giu|hoan|tra lai) (?:tien )?coc (?:phong|xe|thue)\b/g,
  // thu hộ COD
  /\b(?:tien )?ho cod\b/g, /\bthu ho cod\b/g,
];

const AMT = '\\d+ ?(?:k|nghin|ngan|tr|trieu|vnd|dong|d)';
const BLOCK = [
  // đòi tiền người lao động
  ['phi', 'đòi tiền người lao động (phí, đặt cọc, ký quỹ)', [
    /\b(?:dong|nop|thu|dat|gui|chuyen|ung|dong them|nop them)(?: khoan)?(?: tien)? (?:truoc )?(?:phi|coc|ky quy|bao dam)\b/,
    /\bphi (?:tuyen dung|dao tao|ho so|dang ky|gia nhap|lam viec|giu cho|giu slot|moi gioi|lam the|dong phuc|thu viec|kich hoat|xu ly)\b/,
    /\b(?:dat coc|tien coc|ky quy|the chap|coc truoc|coc dong phuc)\b/,
    /\b(?:datcoc|tiencoc|kyquy|nopphi|dongphi|thuphi|noptien|dongtien)\b/,
    /\b(?:chuyen khoan|ck|dong tien|nop tien|gui tien|dong phi) (?:truoc(?! (?:ngay|gio|khi|\d))|moi duoc|de (?:nhan|duoc|lam|giu))\b/,
    /\b(?:dong|nop|tra) (?:tien )?(?:de )?(?:nhan viec|duoc nhan|giu cho|dam bao cong viec)\b/,
    // số tiền + hành vi nộp/đóng/gửi/tạm ứng: "Nộp 200k để nhận việc", "Đóng trước 300k tiền giữ chỗ", "Gửi 3 triệu giữ suất"
    new RegExp(`\\b(?:nop|dong|chuyen|gui|nap|tam ung|ung truoc|dat)\\b(?: \\w+){0,3} ${AMT}\\b(?: \\w+){0,4} (?:de|giu|truoc|nhan viec|dam bao|bao chung|bao dam|giu cho|giu suat|xin viec|ho so|vao tai khoan|vao vi)\\b`),
    new RegExp(`\\b${AMT}\\b(?: \\w+){0,3} (?:tien )?(?:giu cho|giu suat|bao chung|dam bao|bao dam|dat coc|coc|phi|ky quy)\\b`),
    /\b(?:tam ung|ung truoc|dong truoc|nop truoc|chuyen truoc|gui truoc)\b(?: \w+){0,3} (?:bao chung|bao dam|dam bao|giu cho|giu suat|tien coc|phi)\b/,
    /\b(?:bao chung|tien bao chung|tien giu cho|tien giu suat|phi giu suat)\b/,
    new RegExp(`\\bmua (?:dong phuc|ao|giay|dung cu|ho so)(?: \\w+){0,3} ${AMT}\\b`),
  ]],
  // ép mua hàng
  ['mua', 'ép mua hàng, sản phẩm hoặc gói dịch vụ', [
    /\b(?:bat buoc|phai|yeu cau) (?:tu )?mua (?:hang|san pham|goi|combo|bo|the|app|phan mem|khoa hoc|sim|thiet bi|dung cu|hang mau)\b/,
    /\bmua (?:hang|san pham|goi) (?:cua|tu) (?:cong ty|shop|doanh nghiep|chung toi)\b/,
    /\b(?:mua|nhap) hang (?:truoc|de (?:lam|nhan|duoc|bat dau))\b/,
    /\btu (?:bo )?von\b/,
    /\bnhap hang (?:ve )?(?:ban|chot|kinh doanh)\b/,
    /\bmua (?:truoc )?(?:goi|the) (?:thanh vien|hoi vien|vip)\b/,
  ]],
  // đa cấp
  ['dacap', 'dấu hiệu đa cấp', [
    /\bda cap\b/, /\bmlm\b/, /\bkinh doanh mang luoi\b/, /\bphat trien (?:he thong|mang luoi|tuyen duoi|doi nhom)\b/,
    /\b(?:tuyen duoi|cap duoi|tuyen cap duoi|xay dung doi nhom)\b/, /\bgioi thieu (?:them )?(?:ban be|nguoi) (?:de |se )?(?:nhan|duoc|co) (?:hoa hong|thuong|tien)\b/,
  ]],
  // kiếm tiền online kiểu lừa đảo
  ['online', 'việc "kiếm tiền online" kiểu nhiệm vụ, nạp tiền', [
    /\bnap tien (?:vao|truoc|de|online|hang ngay|nhan)\b/, new RegExp(`\\bnap ${AMT}\\b`),
    /\b(?:tha tim|like|share|follow)\b.{0,30}\b(?:kiem tien|nhan tien|nhan \d|tien thuong)\b/,
    /\bnhiem vu (?:online|hang ngay|nap|dat don|danh gia)\b/, /\b(?:cay thue|chot don ao|dat don ao|tang don|nang doanh so)\b/,
    /\bthu nhap thu dong\b/, /\bkiem tien (?:online|tai nha|qua mang|tren mang)\b/, /\bnhan tien ngay\b/, /\bkhong can von\b/,
  ]],
  // tài chính rủi ro, cờ bạc, tài khoản cho thuê
  ['taichinh', 'tài chính rủi ro, cờ bạc hoặc thuê mượn tài khoản', [
    /\btin dung den\b/, /\b(?:cho vay|vay) (?:tien|von|tin chap) (?:nhanh|online|nong|khong the chap|lai suat thap)\b/, /\b(?:cho vay|vay) (?:nhanh|online|nong|khong the chap|lai suat thap|tien nong)\b/, /\bgop von\b/, /\bdau tu (?:tai chinh|sinh loi|tien ao|forex|chung khoan|da cap)\b/,
    /\b(?:tien ao|crypto|bitcoin|forex|usdt|coin)\b/, /\b(?:co bac|ca cuoc|casino|lo de|so de|nha cai|danh bai an tien|bet|xo so (?:online|ao|bet))\b/,
    /\b(?:thue|muon|mua) (?:tai khoan|the ngan hang|sim chinh chu|the atm)\b/, /\bmo (?:the|tai khoan) ngan hang (?:ho|giup|thue)\b/,
    /\b(?:nhan|rut|chuyen) tien ho\b/, /\b(?:nhan|rut|chuyen) ho (?:tien|ngan hang)\b/, /\bnhan chuyen khoan ho\b/,
  ]],
  // nội dung ngoài phạm vi, nguy hiểm
  ['cam', 'nội dung bị cấm (dịch vụ nhạy cảm, đi khách, việc bất hợp pháp)', [
    /\b(?:di khach|tiep khach nam|dich vu tinh duc|gai goi|massage kich thich|massage nguoi lon|boa nhieu cao)\b/, /\bhang cam\b/, /\bbuon (?:lau|nguoi)\b/,
  ]],
];

// Dấu hiệu mềm
const RISK = [
  ['Yêu cầu gửi ảnh hoặc bản sao giấy tờ tùy thân trước khi gặp', /\b(?:gui|chup|nop|cung cap|scan|up)\b.{0,25}\b(?:cccd|cmnd|can cuoc|chung minh|ho chieu|giay to)\b|\b(?:cccd|cmnd|can cuoc|ho chieu)\b.{0,25}\b(?:truoc|qua zalo|qua mang|online|gui)\b/],
  ['Quảng cáo lương rất cao, không cần kinh nghiệm', /\b(?:luong|thu nhap) (?:cao|khung|khong lo|len den|len toi)\b|\bviec nhe luong cao\b|\bkhong can (?:kinh nghiem|bang cap|von).{0,40}\b(?:luong|thu nhap) (?:cao|\d)/],
  ['Nhắc đến "ứng tiền", "hoàn tiền" hoặc "nhận tiền ngay"', /\b(?:ung tien|hoan tien|hoan lai tien|nhan luong ngay|tra luong ngay)\b/],
  ['Hẹn phỏng vấn hoặc làm việc ngoài địa chỉ tin ghi', /\b(?:phong van|gap) (?:qua|tai) (?:zalo|telegram|facebook|cafe|quan cafe)\b|\bphong van online\b/],
  ['Nhắc đến vay vốn, hãy kiểm tra đơn vị có phải tổ chức tín dụng hợp pháp', /\b(?:vay|cho vay) (?:tien|von|tin chap)\b/],
  ['Công việc đánh giá sản phẩm, like, share: dễ là lừa đảo nhiệm vụ online', /\b(?:danh gia san pham|danh gia 5 sao|tha tim|like|share)\b/],
  ['Có số tiền kèm đóng/nộp/gửi/tạm ứng: kiểm tra có phải đòi tiền người xin việc', new RegExp(`\\b(?:nop|dong|chuyen|gui|tam ung|ung truoc)\\b(?: \\w+){0,3} ${AMT}\\b`)],
  ['Nhắc đến nhận tiền hộ hoặc đặt cọc: cần kiểm tra rõ ngữ cảnh', /\b(?:nhan|rut|chuyen) (?:tien )?ho\b|\bdat coc\b|\btien coc\b/],
];

// ---------- rò rỉ liên hệ ----------
const DIGIT_WORDS = { khong: 0, linh: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9 };
const TLD = '(?:com|vn|net|org|info|xyz|top|click|online|vip|club|link)';
const URL_LEAK = new RegExp(`(?:https?://|\\bwww\\.|\\bt\\.me\\b|\\bzalo\\.me\\b|\\bbit\\.ly\\b|\\btinyurl\\b|\\bfb\\.com\\b|\\bm\\.me\\b|\\bfacebook\\.com\\b|\\btelegram\\b|\\bwhatsapp\\b|\\bviber\\b|\\b[a-z0-9-]{2,}\\.${TLD}\\b)`, 'i');
const HANDLE_LEAK = /\b(?:zalo|telegram|tele|viber|skype|facebook|fb|insta(?:gram)?|line|wechat)\s*[:=]\s*@?[a-z0-9._]*\d[a-z0-9._]*|(?:^|\s)@[a-z0-9._]{4,}/i;
const EMAIL_LEAK = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

// số điện thoại: mỗi cụm chữ số (có thể cách bằng dấu cách . -) phải đúng dạng số Việt Nam, không phải ngày/giờ
function phoneIn(s) {
  const runs = s.match(/\+?\d(?:[\s.\-_]?\d){7,}/g) || [];
  const ok = (str) => { const d = str.replace(/\D/g, ''); return /^0[2-9]\d{8,9}$/.test(d) || (/^84[2-9]\d{8,9}$/.test(d) && /^\+?84/.test(str.trim())); };
  for (const r of runs) {
    if (ok(r)) return true;
    if (/[-/]/.test(r)) for (const part of r.split(/[-/]/)) if (/\d{8}/.test(part.replace(/\D/g, '')) && ok(part)) return true;
  }
  return false;
}
// "không chín một hai ..." (≥ 9 chữ số bằng chữ liên tiếp)
function spokenPhone(plain) {
  let run = 0;
  for (const w of plain.split(/[^a-z]+/)) {
    if (w in DIGIT_WORDS) { run += 1; if (run >= 9) return true; } else if (w) run = 0;
  }
  return false;
}

export function findContactLeak(text) {
  const raw = canon(text);
  const plain = stripAccents(raw);
  const collapsed = plain.replace(/\s*@\s*/g, '@').replace(/(@[a-z0-9-]+)\s*\.\s*/gi, '$1.').replace(/\s*\(?\bat\b\)?\s*/gi, (m) => (/\(|\)/.test(m) ? '@' : m));
  if (EMAIL_LEAK.test(collapsed)) return 'địa chỉ email';
  if (HANDLE_LEAK.test(plain)) return 'tên tài khoản Zalo, Telegram hoặc mạng xã hội';
  if (URL_LEAK.test(plain)) return 'đường link hoặc ứng dụng nhắn tin';
  const digits = plain.replace(/(?<=\d)[oO](?=\d)|[oO](?=\d{8})/g, '0');
  if (phoneIn(digits) || spokenPhone(plain.toLowerCase())) return 'số điện thoại';
  return null;
}

// fields: { tiêu đề: văn bản, ... }. Trả { block: [{field, rule, reason}], risk: [lý do], leak: [{field, what}] }
export function scanFields(fields) {
  const out = { block: [], risk: [], leak: [] };
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    const leak = findContactLeak(text);
    if (leak) out.leak.push({ field, what: leak });
    const cleanse = (x) => { let y = x; for (const re of OK) y = y.replace(re, ' '); return y.replace(NEG, ' '); };
    const n = cleanse(norm(text));
    // biến thể chống lách: bỏ dấu chấm/gạch chen giữa chữ ("đ.ặ.t c.ọ.c"), nối chữ cái đơn lẻ ("d a t c o c"), leet ("d4t c0c")
    const glued = stripAccents(canon(text)).toLowerCase().replace(/(?<=[a-z])[.,*_~'’`^](?=[a-z])/g, '');
    const variants = [n, joinSingles(n), joinSingles(cleanse(norm(glued))), leet(n), leet(joinSingles(n))];
    for (const v of variants) {
      for (const [rule, reason, res] of BLOCK) {
        if (out.block.some((b) => b.field === field && b.rule === rule)) continue;
        if (res.some((re) => re.test(v))) out.block.push({ field, rule, reason });
      }
    }
    for (const [reason, re] of RISK) if (re.test(n) && !out.risk.includes(reason)) out.risk.push(reason);
  }
  return out;
}
