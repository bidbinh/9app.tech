// Trích sự kiện, việc cần làm, khoản cần đóng từ thông báo của trường (văn bản dán vào). Chỉ dùng luật, không AI, luôn chạy được.
// Kết quả là BẢN NHÁP để người dùng xem lại và sửa; không bao giờ tự lưu.
import { addDays, weekdayISO, isValidDay } from '../vn.js';

const MAX_ITEMS = 20;

// Bỏ dấu nhưng GIỮ NGUYÊN độ dài (theo đơn vị UTF-16) để dùng chỉ số trên bản gốc
export function foldLen(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'đ') { out += 'd'; continue; }
    if (ch === 'Đ') { out += 'd'; continue; }
    const d = ch.normalize('NFD');
    out += d.length > 1 ? d[0] : ch;
  }
  return out.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

const p2 = (n) => String(n).padStart(2, '0');
const dayStr = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
const WD = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7 }; // "thứ 2" -> thứ hai = 1 (ISO); "chủ nhật" = 7
const WD_WORD = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6 };

// ---------- số tiền ----------
function findAmounts(f) {
  const out = [];
  const push = (m, value) => { if (value >= 1000 && value <= 5e9) out.push({ index: m.index, end: m.index + m[0].length, value }); };
  let m;
  const re1 = /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:dong|vnd|d\b|₫)/g;
  while ((m = re1.exec(f))) push(m, Number(m[1].replace(/[.,]/g, '')));
  const re2 = /(\d+(?:[.,]\d+)?)\s*(?:k|nghin|ngan)\b/g;
  while ((m = re2.exec(f))) push(m, Math.round(Number(m[1].replace(',', '.')) * 1000));
  const re3 = /(\d+(?:[.,]\d+)?)\s*(?:trieu|tr)\b(?:\s*(\d{1,3})\b(?!\s*(?:h|gio|\/)))?/g;
  while ((m = re3.exec(f))) {
    let v = Number(m[1].replace(',', '.')) * 1e6;
    if (m[2] && !m[1].includes(',') && !m[1].includes('.')) v += Number(m[2]) * (m[2].length === 1 ? 1e5 : m[2].length === 2 ? 1e4 : 1e3);
    push(m, Math.round(v));
  }
  // số có dấu chấm ngăn nghìn ngay sau từ khóa về tiền: "học phí: 1.500.000"
  const re4 = /(?:phi|tien|quy|nop|dong|thu)\b[^\d\n]{0,25}?(\d{1,3}(?:\.\d{3})+)\b(?!\s*\/)/g;
  while ((m = re4.exec(f))) {
    const s = m.index + m[0].length - m[1].length;
    const v = Number(m[1].replace(/\./g, ''));
    if (v >= 1000 && !out.some((a) => s >= a.index && s < a.end)) out.push({ index: s, end: s + m[1].length, value: v });
  }
  // bỏ trùng/chồng nhau
  out.sort((a, b) => a.index - b.index || b.end - a.end);
  const res = [];
  for (const a of out) if (!res.length || a.index >= res[res.length - 1].end) res.push(a);
  return res;
}

// ---------- giờ ----------
function periodAdjust(h, f, start, end) {
  const near = f.slice(Math.max(0, start - 8), start) + ' ' + f.slice(end, end + 10);
  if (/\b(chieu|toi)\b/.test(near) && h < 12) return h + 12;
  if (/\b(sang)\b/.test(near) && h === 12) return 0;
  if (/\btrua\b/.test(near) && h < 10) return h + 12;
  return h;
}
function findTimes(f) {
  const out = [];
  let m;
  const re = /(\d{1,2})\s*(?:h|gio|g)\s*(\d{1,2})?(?!\d)(?:\s*(?:phut|p)\b)?|\b(\d{1,2}):(\d{2})\b/g;
  while ((m = re.exec(f))) {
    let h; let mi;
    if (m[3] !== undefined) { h = Number(m[3]); mi = Number(m[4]); } else { h = Number(m[1]); mi = m[2] === undefined ? 0 : Number(m[2]); }
    if (h > 23 || mi > 59) continue;
    // "10g" ở giữa chữ khác (ví dụ 10gam): bỏ
    if (m[3] === undefined && /[a-z]/.test(f[m.index + m[0].length] || '') && !/\s$/.test(m[0])) continue;
    h = periodAdjust(h, f, m.index, m.index + m[0].length);
    out.push({ index: m.index, end: m.index + m[0].length, hhmm: `${p2(h)}:${p2(mi)}` });
  }
  return out;
}

// ---------- ngày ----------
function yearFor(d, m, wd, base, explicit) {
  if (explicit) return explicit < 100 ? 2000 + explicit : explicit;
  const by = Number(base.slice(0, 4));
  const cands = [by, by + 1, by - 1];
  const ok = (y) => isValidDay(dayStr(y, m, d));
  if (wd) { for (const y of cands) if (ok(y) && weekdayISO(dayStr(y, m, d)) === wd) { const day = dayStr(y, m, d); if (Math.abs(Date.parse(day) - Date.parse(base)) < 200 * 86400000) return y; } }
  let y = by;
  if (ok(y) && Date.parse(dayStr(y, m, d)) < Date.parse(base) - 60 * 86400000) y = by + 1;
  return y;
}

function findDates(f, base) {
  const out = []; const warnings = [];
  const take = (idx, end, extra) => out.push({ index: idx, end, ...extra });
  let m;
  const wdBefore = (idx) => {
    const w = /(?:thu\s*(hai|bay|ba|tu|nam|sau|[2-7])|chu\s*nhat|\bcn\b)\s*[,(]?\s*(?:\(?\s*)?$/.exec(f.slice(Math.max(0, idx - 22), idx));
    if (!w) return null;
    if (!w[1]) return 7;
    return WD_WORD[w[1]] || WD[w[1]] || null;
  };
  const mkDay = (d, mo, yRaw, idx) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const wd = wdBefore(idx);
    const y = yearFor(d, mo, wd, base, yRaw ? Number(yRaw) : 0);
    const day = dayStr(y, mo, d);
    if (!isValidDay(day)) return null;
    return { day, explicitYear: !!yRaw, weekdayMismatch: !!(wd && weekdayISO(day) !== wd) };
  };
  // khoảng "từ ngày 5 đến ngày 9/10"
  const reRange = /(?:tu|trong)\s*(?:ngay\s*)?(\d{1,2})(?:\s*[\/.-]\s*(\d{1,2}))?(?:\s*[\/.-]\s*(\d{2,4}))?\s*(?:den|toi|-)\s*(?:het\s*)?(?:ngay\s*)?(\d{1,2})\s*(?:[\/.-]|\s*thang\s*)\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2,4})|\s*nam\s*(\d{4}))?/g;
  while ((m = reRange.exec(f))) {
    const d1 = Number(m[1]); const d2 = Number(m[4]); const mo2 = Number(m[5]); const mo1 = m[2] ? Number(m[2]) : mo2;
    const y2 = m[6] || m[7]; const a = mkDay(d1, mo1, m[3] || y2, m.index); const b = mkDay(d2, mo2, y2, m.index);
    if (a && b && b.day >= a.day) take(m.index, m.index + m[0].length, { day: a.day, endDay: b.day, explicitYear: a.explicitYear });
  }
  const covered = (i) => out.some((o) => i >= o.index && i < o.end);
  // "ngày 12 tháng 10 năm 2026", "12 tháng 10"
  const reWords = /(?:ngay\s*)?(\d{1,2})\s*(?:thang|thg)\s*(\d{1,2})(?:\s*(?:nam)?\s*(\d{4}))?/g;
  while ((m = reWords.exec(f))) {
    if (covered(m.index)) continue;
    const r = mkDay(Number(m[1]), Number(m[2]), m[3], m.index);
    if (r) take(m.index, m.index + m[0].length, r);
  }
  // 12/10, 12/10/2026, "ngày 12-10", "ngày 12.10"
  const reNum = /(ngay\s*)?(\d{1,2})\s*([\/.-])\s*(\d{1,2})(?:\s*\3\s*(\d{2,4}))?(?![\d:])/g;
  while ((m = reNum.exec(f))) {
    if (covered(m.index)) continue;
    const sep = m[3];
    if (sep !== '/' && !m[1] && !m[5]) continue; // dấu - và . chỉ nhận khi có chữ "ngày" hoặc có năm
    if (sep === '.' && !m[5] && /\d\.\d{3}\b/.test(m[0])) continue;
    if (/\d$/.test(f.slice(Math.max(0, m.index - 1), m.index))) continue;
    const r = mkDay(Number(m[2]), Number(m[4]), m[5], m.index);
    if (r) take(m.index, m.index + m[0].length, r);
  }
  // ngày dạng "ngày 12" (chỉ ngày) khi câu đã có tháng ở nơi khác: bỏ qua để tránh đoán sai
  // tương đối
  const rel = [[/\b(?:hom nay|ngay hom nay)\b/g, 0], [/\bngay mai\b|\bsang mai\b|\bchieu mai\b|\bmai\b/g, 1], [/\bngay kia\b|\bngay mot\b/g, 2]];
  for (const [re, n] of rel) {
    while ((m = re.exec(f))) { if (covered(m.index)) continue; take(m.index, m.index + m[0].length, { day: addDays(base, n), explicitYear: true, relative: true }); }
  }
  // "thứ sáu tuần này/sau/tới", "thứ bảy" trơn (lần tới)
  const reWd = /(?:thu\s*(hai|bay|ba|tu|nam|sau|[2-7])|chu\s*nhat)(?:\s*(?:,\s*)?(?:tuan\s*(nay|sau|toi|truoc)|tuan\s*ke))?/g;
  while ((m = reWd.exec(f))) {
    if (covered(m.index)) continue;
    // đứng ngay trước một ngày cụ thể thì chỉ là nhãn thứ, không tạo ngày riêng
    if (/^\s*[,(]?\s*(?:ngay\s*)?\d{1,2}\s*[\/.-]|^\s*[,(]?\s*(?:ngay\s*)?\d{1,2}\s*thang/.test(f.slice(m.index + m[0].length, m.index + m[0].length + 14))) continue;
    const wd = m[1] ? (WD_WORD[m[1]] || WD[m[1]]) : 7;
    const mon = addDays(base, 1 - weekdayISO(base));
    let day;
    if (m[2] === 'sau' || m[2] === 'toi') day = addDays(mon, 7 + wd - 1);
    else if (m[2] === 'nay') day = addDays(mon, wd - 1);
    else { day = addDays(mon, wd - 1); if (day < base) day = addDays(day, 7); }
    take(m.index, m.index + m[0].length, { day, explicitYear: true, relative: true });
  }
  out.sort((a, b) => a.index - b.index);
  return { dates: out, warnings };
}

// ---------- phân loại ----------
const RX = {
  pay: /\b(dong tien|nop tien|thu tien|hoc phi|le phi|tien an|tien hoc|tien dong phuc|tien bhyt|quy lop|quy hoi phu huynh|quy hoi|bao hiem|bhyt|bhtn|dong gop|kinh phi|tien (?:the|sach|tai lieu|xe|nuoc|com|ban tru|quan ly)|thu phi|phi (?:hoc|ban tru|xe|ngoai khoa))\b/,
  payNoun: /\b(hoc phi|le phi|tien an|tien dong phuc|tien bhyt|bhyt|bhtn|quy lop|quy hoi phu huynh|quy hoi|bao hiem|kinh phi|tien the|tien sach|tien tai lieu|tien xe|tien nuoc|tien com|tien ban tru|tien quan ly|phi ban tru|phi xe|phi ngoai khoa|phi hoc)\b/,
  payVerb: /\b(dong|nop|thu|ung ho|gop)\b/,
  meeting: /\b(hop (?:phu huynh|cha me|lop|chu nhiem|phhs|ph\b)|phu huynh .{0,25}\bhop\b|hop (?:dau|cuoi) (?:nam|ky|hoc ky))/,
  exam: /\b(thi (?:hoc ky|cuoi ky|giua ky|thu|vao|tot nghiep|hsg|hoc sinh gioi|olympic|ielts|vong)|kiem tra (?:dinh ky|hoc ky|cuoi ky|giua ky|15 phut|1 tiet|khao sat|chat luong)|khao sat chat luong|lich thi|ky thi|bai thi|thi\b)/,
  holiday: /\b(nghi (?:le|tet|hoc|quoc khanh|he|gio to|dich|bu|ca ngay)|duoc nghi|cho hoc sinh nghi|hoc sinh nghi|nghi (?:\d|tu))/,
  uniform: /\b(dong phuc|ao the duc|trang phuc|ao dai|ao khoac|khan quang|ao mua|mac (?:ao|trang phuc))\b/,
  event: /\b(khai giang|be giang|tham quan|da ngoai|ngoai khoa|van nghe|hoi thao|lien hoan|hoi cho|tong ket|trai nghiem|hoc ngoai|chao co|ngay hoi|dai hoi|le (?:khai|tong|trao|ky niem|tri an|ra truong)|sinh hoat (?:ngoai|chuyen|cau lac)|hoi dien|bieu dien|trinh dien|tap huan|buoi (?:hoc|tap|ngoai|giao luu)|giao luu)/,
  task: /\b(nop|mang theo|chuan bi|dang ky|ky (?:ten|xac nhan|vao|don)|phan hoi|xac nhan|dem theo|gui lai|hoan thanh|tra loi|dien (?:vao )?(?:phieu|don|mau)|dan ten|luu y mang)\b/,
  deadline: /\b(truoc ngay|truoc|han (?:cuoi|nop|chot)?|cham nhat|den het|khong qua|toi da)\b/,
};

function cleanTitle(s, max = 70) {
  const t = s.replace(/\s+/g, ' ').replace(/^[\s\-•*+·:;,.]+/, '').replace(/[\s,;:.]+$/, '').trim();
  const a = [...t];
  return a.length > max ? a.slice(0, max - 1).join('').trim() + '…' : t;
}
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function maskSpans(text, spans) {
  let out = text.split('');
  for (const sp of spans) for (let i = sp.index; i < sp.end; i++) out[i] = ' ';
  return out.join('');
}

function classOf(orig, f) {
  const m = /\blop\s*([0-9]{1,2}\s*[a-z]{0,2}\d{0,2})\b/.exec(f);
  if (!m) return '';
  const pos = m.index + m[0].length - m[1].length;
  return orig.slice(pos, pos + m[1].length).replace(/\s+/g, '').toUpperCase();
}
// cắt chuỗi gốc tại chỗ khớp đầu tiên của re trên bản đã bỏ dấu (cùng độ dài)
function cutAt(orig, f, re) { const m = re.exec(f); return m ? orig.slice(0, m.index) : orig; }
const TAIL_RX = /[,;.\n(]|\s(?:vao|luc|ngay|thu|truoc|tu|den|va|de|nham|tai)\s|\s\d{1,2}\s*[\/h]/;
function placeOf(orig, f) {
  const m = /(?:\btai|\bo\b|dia diem\s*:?|\btru so\b|\bphong\b|\bhoi truong\b)\s+/.exec(f);
  if (!m) return '';
  const start = m.index + (/^(?:phong|hoi truong)/.test(m[0]) ? 0 : m[0].length);
  const rest = orig.slice(start).split(/[,;.\n]|\s-\s|\bvao\b|\blúc\b|\blac\b/i)[0].trim();
  const cleaned = rest.replace(/\s+(?:de|nham|vao|luc)\b.*$/i, '').trim();
  const a = [...cleaned];
  return a.length >= 3 && a.length <= 60 ? cleaned : '';
}
function subjectOf(orig, f) {
  const m = /\bmon\s+/.exec(f);
  if (!m) return '';
  const tail = orig.slice(m.index + m[0].length);
  const rest = cutAt(tail, foldLen(tail), TAIL_RX).trim();
  return [...rest].length >= 2 && [...rest].length <= 30 ? rest : '';
}

const PRIO = { cao: 3, vua: 2, thap: 1 };

/**
 * @param {string} text
 * @param {{today:string, children?:{id:string,name:string,grade?:string}[]}} opts
 * @returns {{items:object[], warnings:string[], notice:{issued?:string}}}
 */
export function extractSchoolNotice(text, { today, children = [] } = {}) {
  const warnings = [];
  const src = String(text ?? '').replace(/\r\n?/g, '\n').replace(/[   ]/g, ' ').replace(/[–—]/g, '-').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ');
  // ngày soạn thông báo ("Hà Nội, ngày 05 tháng 10 năm 2026"): chỉ để suy ra năm, không phải sự kiện
  let base = today; let issued = null;
  const lines = src.split('\n');
  const kept = [];
  for (const line of lines) {
    const fl = foldLen(line);
    const mi = /^[^\d]{0,30},?\s*ngay\s*(\d{1,2})\s*(?:thang|\/|-|\.)\s*(\d{1,2})\s*(?:nam|\/|-|\.)\s*(\d{4})\s*$/.exec(fl.trim());
    if (mi && isValidDay(dayStr(Number(mi[3]), Number(mi[2]), Number(mi[1])))) { issued = dayStr(Number(mi[3]), Number(mi[2]), Number(mi[1])); continue; }
    kept.push(line);
  }
  if (issued) base = issued;
  // tách đoạn: theo dòng, rồi theo câu
  const segs = [];
  for (const line of kept) {
    const t = line.replace(/^\s*(?:[-•*+·]|\d{1,2}[.)]|[a-zA-Z][.)])\s+/, '').trim();
    if (!t) continue;
    for (const piece of t.split(/(?<=[a-zà-ỹ0-9\)])[.;]\s+(?=[A-ZÀ-Ỹ])/)) if (piece.trim()) segs.push(piece.trim());
  }
  const dateRx = /\d{1,2}\s*\/\s*\d{1,2}|ngày\s*\d|ngay\s*\d|\d{1,2}\s*tháng\s*\d/i;
  const exploded = [];
  for (const sg of segs) {
    const cl = sg.split(/\s*;\s*|,\s+(?=(?:môn|mon|ngày|ngay|thứ|thu|lớp|lop)(?![a-zà-ỹ]))/i).map((x) => x.trim()).filter(Boolean);
    if (cl.length > 1 && cl.filter((x) => dateRx.test(x)).length >= 2) {
      const ci = cl[0].indexOf(':');
      const header = ci > 0 && ci < 80 ? cl[0].slice(0, ci).trim() : '';
      cl.forEach((x, i) => exploded.push(i === 0 ? x : (header && !/hop|thi|kiem tra|nghi|nop|dong/.test(foldLen(x)) ? header + ': ' + x : x)));
    } else exploded.push(sg);
  }
  segs.length = 0; segs.push(...exploded);
  const items = [];
  const seen = new Set();
  const nameHit = (orig, f) => {
    const ids = [];
    for (const c of children) {
      const n = foldLen(String(c.name || '')).trim();
      if (n.length >= 2 && new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(f)) ids.push(c.id);
      else if (c.grade) { const g = foldLen(String(c.grade)).replace(/\s+/g, ''); const cls = classOf(orig, f).toLowerCase(); if (g && cls && g === cls) ids.push(c.id); }
    }
    return [...new Set(ids)];
  };
  let lastDate = null;

  for (const orig of segs.slice(0, 80)) {
    const f0 = foldLen(orig);
    const amounts = findAmounts(f0);
    const f = maskSpans(f0, amounts);
    const times = findTimes(f);
    const tf = maskSpans(f, times);
    const { dates } = findDates(tf, base);
    // phân loại
    const isPay = RX.pay.test(f0) || (amounts.length > 0 && RX.payVerb.test(f0));
    const isMeet = RX.meeting.test(f0);
    const isHol = RX.holiday.test(f0);
    const isExam = RX.exam.test(f0) && !isHol;
    const isUni = RX.uniform.test(f0);
    const isEvt = RX.event.test(f0);
    const isTask = RX.task.test(f0);
    const hasKey = isPay || isMeet || isHol || isExam || isUni || isEvt || isTask;
    if (!hasKey && !dates.length) continue;
    const warnMis = dates.some((d) => d.weekdayMismatch);

    // ngày chính của đoạn: ngày có từ khóa hạn ưu tiên cho việc/khoản đóng; ngày đầu tiên cho sự kiện
    const dl = RX.deadline.exec(f0);
    let primary = dates[0] || null;
    let deadline = null;
    if (dl && dates.length) {
      const after = dates.filter((d) => d.index >= dl.index);
      deadline = (after[0] || dates[dates.length - 1]).day;
      if (!isMeet && !isExam && !isHol) primary = after[0] || primary;
    }
    if (!primary && lastDate && (times.length || isMeet || isExam) && !isPay) primary = { day: lastDate, inferred: true };
    if (primary && primary.day) lastDate = primary.day;
    const day = primary ? primary.day : null;
    const t0 = times[0] ? times[0].hhmm : null;
    let t1 = null;
    if (times.length > 1) {
      const between = tf.slice(times[0].end, times[1].index);
      if (/^\s*(?:den|toi|-|ve|→)\s*$/.test(between) || /\bden\b/.test(between)) t1 = times[1].hhmm;
    }
    const cls = classOf(orig, f0);
    const childIds = nameHit(orig, f0);
    const baseItem = { evidence: cleanTitle(orig, 160), childIds, confidence: 'vua', missing: [] };
    const conf = (item, strong) => {
      const miss = [];
      if (item.type === 'event' && !item.day) miss.push('ngày');
      if (item.type === 'event' && !item.allDay && !item.start) miss.push('giờ');
      if ((item.type === 'payment' || item.type === 'task') && !item.due) miss.push('hạn');
      if (item.type === 'payment' && !item.amount) miss.push('số tiền');
      item.missing = miss;
      item.confidence = miss.length === 0 && strong && !(primary && primary.inferred) && !warnMis ? 'cao' : miss.length >= 2 || warnMis ? 'thap' : 'vua';
      if (warnMis) item.note = ((item.note ? item.note + ' ' : '') + 'Thứ và ngày trong thông báo không khớp lịch, hãy kiểm tra lại.').trim();
      return item;
    };
    const add = (item) => {
      const key = [item.type, item.day || item.due || '', foldLen(item.title)].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    };

    let handled = false;
    if (isHol && (dates.length || primary)) {
      const d0 = dates[0]; const label = (() => {
        const m = /nghi\s+(le|tet|he|hoc|quoc khanh|gio to|bu|dich|ca ngay)[^,;.\n]*/.exec(f0);
        if (!m) return 'Nghỉ học';
        const raw = orig.slice(m.index, m.index + m[0].length).replace(/\b(từ|tu)?\s*(ngày|ngay)?\s*\d.*$/i, '').trim();
        return capFirst(cleanTitle(raw, 50)) || 'Nghỉ học';
      })();
      const it = conf({ type: 'event', kind: 'ngay_quan_trong', title: label, day: d0 ? d0.day : day, endDay: d0 && d0.endDay ? d0.endDay : null, allDay: true, start: null, end: null, location: '', recType: d0 && d0.endDay ? 'daily' : 'none', notifyOffsets: [1440], ...baseItem }, true);
      add(it); handled = true;
    } else if (isMeet) {
      const place = placeOf(orig, f0);
      const it = conf({ type: 'event', kind: 'hop_phu_huynh', title: 'Họp phụ huynh' + (cls ? ' lớp ' + cls : ''), day, endDay: null, allDay: !t0, start: t0, end: t1, location: place, recType: 'none', notifyOffsets: [1440], ...baseItem }, true);
      add(it); handled = true;
    } else if (isExam && (day || t0)) {
      const subj = subjectOf(orig, f0);
      const m = /(thi (?:hoc ky|cuoi ky|giua ky|thu|vao[^,;.\n]{0,20}|hsg|olympic)|kiem tra (?:dinh ky|hoc ky|cuoi ky|giua ky|15 phut|1 tiet|khao sat|chat luong)|khao sat chat luong|thi)/.exec(f0);
      const raw = m ? orig.slice(m.index, m.index + m[0].length) : 'Thi';
      const title = capFirst(cleanTitle(raw, 40)) + (subj ? ' môn ' + subj : '') + (cls ? ' lớp ' + cls : '');
      const it = conf({ type: 'event', kind: 'thi', title, day, endDay: primary && primary.endDay ? primary.endDay : null, allDay: !t0, start: t0, end: t1, location: placeOf(orig, f0), recType: primary && primary.endDay ? 'daily' : 'none', notifyOffsets: [1440], ...baseItem }, true);
      add(it); handled = true;
    } else if (isEvt && (day || t0)) {
      const m = RX.event.exec(f0);
      const start = m ? m.index : 0;
      const tailE = orig.slice(start);
      const raw = cutAt(tailE, foldLen(tailE), TAIL_RX);
      const it = conf({ type: 'event', kind: /ngoai khoa|da ngoai|tham quan|trai nghiem/.test(f0) ? 'hoc' : 'khac', title: capFirst(cleanTitle(raw, 60)), day, endDay: primary && primary.endDay ? primary.endDay : null, allDay: !t0, start: t0, end: t1, location: placeOf(orig, f0), recType: primary && primary.endDay ? 'daily' : 'none', notifyOffsets: [1440], ...baseItem }, true);
      add(it); handled = true;
    }
    if (isPay && (amounts.length || dates.length || /dong|nop/.test(f0))) {
      const m = RX.payNoun.exec(f0);
      const verb = /\bnop\b/.test(f0) ? 'Nộp' : 'Đóng';
      let what = m ? orig.slice(m.index, m.index + m[0].length) : 'tiền';
      what = what.replace(/^(đóng|nộp|thu)\s+/i, '');
      // thêm "tháng 10" nếu có ngay sau tên khoản
      const tail = f0.slice(m ? m.index + m[0].length : 0).match(/^\s*(thang\s*\d{1,2}|hoc ky\s*(?:i{1,2}|[12])|nam hoc\s*\d{4}(?:-\d{4})?)/);
      if (tail) what += ' ' + orig.slice((m ? m.index + m[0].length : 0), (m ? m.index + m[0].length : 0) + tail[0].length).trim();
      const amount = amounts.length ? amounts[0].value : null;
      const due = deadline || (day && !handled ? day : null) || (handled ? (deadline || null) : null);
      const it = conf({ type: 'payment', title: `${verb} ${cleanTitle(what.split(' ').map((w) => (w === w.toUpperCase() && w.length > 1 ? w : w.toLowerCase())).join(' '), 40)}`, amount, due, ...baseItem, childIds, kind: undefined }, !!amount);
      add(it); handled = true;
    } else if (isUni && !handled) {
      const m = RX.uniform.exec(f0);
      const raw = m ? orig.slice(Math.max(0, m.index - 12), m.index + m[0].length + 20).split(/[,;.\n]/)[0] : orig;
      const what = /the duc/.test(f0) ? 'đồng phục thể dục' : /ao dai/.test(f0) ? 'áo dài' : 'đồng phục';
      add(conf({ type: 'task', title: 'Chuẩn bị ' + what + (cls ? ' lớp ' + cls : ''), due: deadline || day, ...baseItem, note: cleanTitle(raw, 100) }, !!(deadline || day)));
      handled = true;
    } else if (isTask && !handled) {
      const m = RX.task.exec(f0);
      const raw = orig.slice(m.index).replace(/\b(trước|truoc|hạn|han|chậm nhất|cham nhat)\b.*$/i, '').split(/[;\n]/)[0];
      const title = capFirst(cleanTitle(raw.replace(/\s*(?:ngày|ngay)?\s*\d{1,2}\s*[\/.-]\s*\d{1,2}.*$/, ''), 70));
      add(conf({ type: 'task', title, due: deadline || day, ...baseItem }, !!(deadline || day)));
      handled = true;
    }
    if (!handled && dates.length) {
      add({ type: 'note', title: capFirst(cleanTitle(orig.replace(/\s*(?:ngày|ngay)?\s*\d{1,2}\s*[\/.-]\s*\d{1,2}(?:[\/.-]\d{2,4})?/g, ''), 60)), day, due: null, allDay: !t0, start: t0, end: t1, ...baseItem, confidence: 'thap', missing: ['loại'] });
    }
    if (items.length >= MAX_ITEMS) { warnings.push(`Chỉ lấy ${MAX_ITEMS} mục đầu tiên.`); break; }
  }
  items.sort((a, b) => (a.day || a.due || '9999') < (b.day || b.due || '9999') ? -1 : (a.day || a.due || '9999') > (b.day || b.due || '9999') ? 1 : PRIO[b.confidence] - PRIO[a.confidence]);
  if (issued) warnings.push(`Thông báo ghi ngày soạn ${issued.slice(8)}/${issued.slice(5, 7)}/${issued.slice(0, 4)}; các ngày không ghi năm được hiểu theo thời điểm đó.`);
  if (!items.length) warnings.push('Không tìm thấy ngày, giờ hay việc cần làm rõ ràng. Bạn có thể thêm thủ công, hoặc đọc bằng AI nếu đã bật.');
  return { items: items.slice(0, MAX_ITEMS), warnings, notice: { issued } };
}
