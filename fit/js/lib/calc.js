// Tính toán thuần của 9fit: ngày, khối lượng, tải tập, gợi ý tăng tạ, kỷ lục, lịch chương trình, tệp lịch .ics.
// Không phụ thuộc trình duyệt để kiểm thử bằng node --test.
import { docDem } from '../data/ex-base.js';

// ---------- Ngày (chuỗi YYYY-MM-DD theo giờ máy) ----------
export const chuoiNgay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function ngayTuChuoi(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}
export const congNgay = (s, n) => { const d = ngayTuChuoi(s); d.setDate(d.getDate() + n); return chuoiNgay(d); };
export const soNgayGiua = (a, b) => Math.round((ngayTuChuoi(b) - ngayTuChuoi(a)) / 86400000);
/** 0 = thứ Hai ... 6 = Chủ nhật. */
export const thuTrongTuan = (s) => (ngayTuChuoi(s).getDay() + 6) % 7;
export const dauTuan = (s) => congNgay(s, -thuTrongTuan(s));
export const TEN_THU = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const TEN_THU_DAI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
export function ngayVN(s) {
  const d = ngayTuChuoi(s);
  return `${TEN_THU[thuTrongTuan(s)]}, ${d.getDate()}/${d.getMonth() + 1}`;
}
export function ngayVNDayDu(s) {
  const d = ngayTuChuoi(s);
  return `${TEN_THU_DAI[thuTrongTuan(s)]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ---------- Khối lượng ----------
const soDuong = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
export const setHopLe = (st) => soDuong(st?.lan) > 0 || soDuong(st?.giay) > 0;
/** Hiệp thật sự đã làm: có số liệu và được bấm xong hoặc do người dùng tự nhập (giá trị điền sẵn không tính). */
export const hiepDaLam = (sets) => (sets || []).filter((s) => setHopLe(s) && (s.xong === true || s.tay === true));
export const khoiLuongSet = (st) => (soDuong(st?.lan) > 0 && soDuong(st?.kg) > 0 ? st.lan * st.kg : 0);
export const tongKhoiLuong = (sets) => (sets || []).reduce((a, s) => a + khoiLuongSet(s), 0);

/** Khối lượng theo nhóm cơ trong một tuần. Nhóm chính tính 1 hiệp, nhóm phụ 0,5 hiệp. kg = hiệp × lần × kg cho nhóm chính. */
export function khoiLuongTheoNhom(buoi, baiMap, dauTuanStr) {
  const cuoi = congNgay(dauTuanStr, 6);
  const kq = {};
  const them = (nhom, hiep, lan, kg) => {
    const o = kq[nhom] || (kq[nhom] = { hiep: 0, lan: 0, kg: 0 });
    o.hiep += hiep; o.lan += lan; o.kg += kg;
  };
  for (const b of buoi || []) {
    if (!b.ngay || b.ngay < dauTuanStr || b.ngay > cuoi) continue;
    for (const e of b.bai || []) {
      const ex = baiMap.get(e.ex);
      if (!ex) continue;
      const sets = (e.sets || []).filter(setHopLe);
      if (!sets.length) continue;
      const lan = sets.reduce((a, s) => a + soDuong(s.lan), 0);
      const kg = tongKhoiLuong(sets);
      ex.nhomChinh.forEach((n) => them(n, sets.length, lan, kg));
      ex.nhomPhu.forEach((n) => them(n, sets.length * 0.5, 0, 0));
    }
  }
  return kq;
}

// ---------- Tải tập (sRPE = RPE × phút) ----------
export const kepRPE = (v) => Math.min(10, Math.max(1, Number(v) || 1));
export const sRPE = (rpe, phut) => (soDuong(rpe) > 0 && soDuong(phut) > 0 ? Math.round(kepRPE(rpe) * phut) : 0);

/** RPE của buổi: ưu tiên RPE buổi, sau đó trung bình RPE các hiệp, cuối cùng mặc định 5 (đánh dấu ước tính). */
export function rpeBuoi(b) {
  if (soDuong(b?.rpe) > 0) return { rpe: b.rpe, uoc: false };
  const r = [];
  for (const e of b?.bai || []) for (const s of e.sets || []) if (soDuong(s.rpe) > 0) r.push(s.rpe);
  if (r.length) return { rpe: r.reduce((a, c) => a + c, 0) / r.length, uoc: false };
  return { rpe: 5, uoc: true };
}
export function taiBuoiTap(b) {
  const { rpe, uoc } = rpeBuoi(b);
  return { tai: sRPE(rpe, b?.phut), uoc };
}
export const taiBuoiChoi = (p) => sRPE(p?.rpe, p?.phut);

/** Tải của một tuần: buổi tập + buổi chơi. */
export function taiTuan(buoi, choi, dauTuanStr) {
  const cuoi = congNgay(dauTuanStr, 6);
  const trong = (n) => n && n >= dauTuanStr && n <= cuoi;
  let tap = 0; let choiTai = 0; let coUoc = false; let soBuoi = 0;
  for (const b of buoi || []) if (trong(b.ngay)) { const t = taiBuoiTap(b); tap += t.tai; coUoc = coUoc || t.uoc; soBuoi++; }
  for (const p of choi || []) if (trong(p.ngay)) { choiTai += taiBuoiChoi(p); soBuoi++; }
  return { tap, choi: choiTai, tong: tap + choiTai, coUoc, soBuoi };
}

/** Chuỗi tải N tuần gần nhất (cũ đến mới), kết thúc ở tuần chứa homNay. */
export function chuoiTaiTuan(buoi, choi, homNay, soTuan = 8) {
  const d0 = dauTuan(homNay);
  const out = [];
  for (let i = soTuan - 1; i >= 0; i--) {
    const ds = congNgay(d0, -7 * i);
    out.push({ dau: ds, ...taiTuan(buoi, choi, ds) });
  }
  return out;
}

/**
 * Cảnh báo nhẹ theo ý tưởng acute:chronic workload: so tải tuần này với trung bình 4 tuần trước.
 * Chỉ là gợi ý để chú ý, không phải chẩn đoán hay dự báo chấn thương.
 */
export function canhBaoTai(taiHienTai, bonTuanTruoc) {
  const co = (bonTuanTruoc || []).filter((v) => v > 0);
  if (co.length < 2) return { muc: 'chua-du', ti: null, tb: null };
  const tb = (bonTuanTruoc || []).reduce((a, c) => a + c, 0) / (bonTuanTruoc.length || 1);
  if (!(tb > 0)) return { muc: 'chua-du', ti: null, tb: 0 };
  const ti = taiHienTai / tb;
  let muc = 'on';
  if (ti > 1.5) muc = 'cao';
  else if (ti > 1.3) muc = 'luu-y';
  return { muc, ti, tb };
}

// ---------- Đếm và gợi ý tăng tạ ----------
const BUOC_TA_CHAN = 5;
const BUOC_TA_TREN = 2.5;
const NHOM_CHAN = new Set(['dui-truoc', 'dui-sau', 'mong', 'hong', 'bap-chan']);
export const laBaiChan = (ex) => !!ex && ex.nhomChinh.some((n) => NHOM_CHAN.has(n));
const lamTron = (v) => Math.round(v * 2) / 2;
const GIAY_TRAN = 90;

/**
 * Gợi ý đơn giản cho buổi sau. Quy tắc: đạt đủ số lần cao của khoảng ở mọi hiệp và RPE trung bình không quá 7 thì tăng.
 * Đây là gợi ý, không phải chỉ định: hãy nghe cơ thể.
 */
export function goiYTangTa(hiepTruoc, dem, laChan = false) {
  const sets = (hiepTruoc || []).filter(setHopLe);
  if (!sets.length || !dem) return { loai: 'moi', ly: 'Chưa có dữ liệu buổi trước. Chọn mức nhẹ để học đúng form.' };
  const rpes = sets.map((s) => s.rpe).filter(soDuong);
  const rpeTb = rpes.length ? rpes.reduce((a, c) => a + c, 0) / rpes.length : null;
  if (dem.kieu === 'giay') {
    const giays = sets.map((s) => soDuong(s.giay));
    const du = giays.every((g) => g >= dem.giayMax);
    if (du && (rpeTb === null || rpeTb <= 7)) {
      const g0 = Math.min(...giays);
      const them = Math.min(5, Math.max(1, Math.floor(g0 * 0.1)));
      if (g0 >= GIAY_TRAN) return { loai: 'kho-hon', ly: `Bạn đã giữ được ${g0} giây, đủ lâu. Thay vì giữ lâu hơn, hãy thử biến thể khó hơn.` };
      return { loai: 'tang-giay', giay: Math.min(GIAY_TRAN, g0 + them), ly: `Buổi trước đạt đủ thời gian ở mọi hiệp và còn nhẹ. Thử thêm ${them} giây hoặc chọn biến thể khó hơn.` };
    }
    return { loai: 'giu', ly: 'Giữ mức thời gian cho đến khi đạt đủ ở mọi hiệp.' };
  }
  const lans = sets.map((s) => soDuong(s.lan));
  const kgs = sets.map((s) => soDuong(s.kg));
  const kg = Math.max(...kgs);
  const duLan = lans.every((l) => l >= dem.lanMax);
  const thieuLan = lans.some((l) => l < dem.lanMin);
  if (rpeTb !== null && rpeTb >= 9.5 && thieuLan) {
    return { loai: 'giam', kg: kg > 0 ? lamTron(kg * 0.9) : 0, ly: 'Buổi trước rất nặng và chưa đủ số lần. Cân nhắc giảm khoảng 10 phần trăm hoặc nghỉ thêm.' };
  }
  if (duLan && (rpeTb === null || rpeTb <= 7)) {
    if (kg > 0) {
      const buoc = Math.min(laChan ? BUOC_TA_CHAN : BUOC_TA_TREN, Math.floor(kg * 0.1 * 2) / 2);
      if (buoc < 0.5) return { loai: 'giu', kg, ly: `Mức tạ ${kg} kg còn nhỏ, tăng thêm sẽ vượt 10 phần trăm. Hãy giữ nguyên và tăng thêm số lần hoặc dùng biến thể khó hơn.` };
      return { loai: 'tang-ta', kg: lamTron(kg + buoc), lan: dem.lanMin, ly: `Buổi trước đủ ${dem.lanMax} lần ở mọi hiệp và còn nhẹ (RPE từ 7 trở xuống). Thử tăng ${buoc} kg rồi bắt đầu lại từ ${dem.lanMin} lần.` };
    }
    return { loai: 'kho-hon', lan: Math.min(...lans) + 2, ly: 'Bạn đã đạt đủ số lần. Thử thêm 2 lần mỗi hiệp hoặc chuyển sang biến thể khó hơn.' };
  }
  return { loai: 'giu', kg, ly: kg > 0 ? `Giữ ${kg} kg và cố đạt ${dem.lanMax} lần ở mọi hiệp trước khi tăng.` : `Cố đạt ${dem.lanMax} lần ở mọi hiệp trước khi tăng độ khó.` };
}

// ---------- Kỷ lục cá nhân ----------
export const e1RM = (kg, lan) => (soDuong(kg) > 0 && soDuong(lan) > 0 && lan <= 12 ? Math.round(kg * (1 + lan / 30) * 10) / 10 : 0);

/** Kỷ lục từ lịch sử một bài: [{ngay, sets}]. */
export function tinhPR(lichSu) {
  const pr = { kg: null, e1rm: null, lan: null, giay: null };
  for (const h of lichSu || []) {
    for (const s of h.sets || []) {
      if (!setHopLe(s)) continue;
      const kg = soDuong(s.kg); const lan = soDuong(s.lan); const giay = soDuong(s.giay);
      if (kg > 0 && lan >= 1 && (!pr.kg || kg > pr.kg.kg)) pr.kg = { kg, lan, ngay: h.ngay };
      const e = e1RM(kg, lan);
      if (e > 0 && (!pr.e1rm || e > pr.e1rm.v)) pr.e1rm = { v: e, kg, lan, ngay: h.ngay };
      if (kg === 0 && lan > 0 && (!pr.lan || lan > pr.lan.lan)) pr.lan = { lan, ngay: h.ngay };
      if (giay > 0 && (!pr.giay || giay > pr.giay.giay)) pr.giay = { giay, ngay: h.ngay };
    }
  }
  return pr;
}

/** Các kỷ lục mới mà một hiệp phá được so với lịch sử trước đó. Lần ghi đầu tiên chỉ là mốc, không tính là kỷ lục. */
export function kiemTraPR(lichSuTruoc, st) {
  const co = (lichSuTruoc || []).some((h) => (h.sets || []).some(setHopLe));
  if (!co || !setHopLe(st)) return [];
  const pr = tinhPR(lichSuTruoc);
  const kg = soDuong(st.kg); const lan = soDuong(st.lan); const giay = soDuong(st.giay);
  const loai = [];
  if (kg > 0 && lan >= 1 && pr.kg && kg > pr.kg.kg) loai.push('kg');
  else if (kg > 0 && lan >= 1 && e1RM(kg, lan) > 0 && pr.e1rm && e1RM(kg, lan) > pr.e1rm.v) loai.push('e1rm');
  if (kg === 0 && lan > 0 && pr.lan && lan > pr.lan.lan) loai.push('lan');
  if (giay > 0 && pr.giay && giay > pr.giay.giay) loai.push('giay');
  return loai;
}

/** Lịch sử một bài từ danh sách buổi, mới nhất cuối. Bỏ qua buổi có id = boQua. */
export function lichSuBai(buoi, exId, boQua = null) {
  return (buoi || []).filter((b) => b.id !== boQua).sort((a, b) => (a.ngay + (a.bd || 0)).localeCompare(b.ngay + (b.bd || 0)))
    .flatMap((b) => (b.bai || []).filter((e) => e.ex === exId).map((e) => ({ ngay: b.ngay, sets: e.sets || [] })));
}

// ---------- Chương trình và lịch ----------
/**
 * Dựng lịch chương trình.
 * opts: { batDau: 'YYYY-MM-DD', thu: [0..6], ngayGiai?: 'YYYY-MM-DD' }
 * Mỗi "khối tuần" là 7 ngày kể từ ngày tập đầu tiên. Buổi lần lượt xoay vòng qua các phiên A, B, C.
 * Nếu có ngày giải và chương trình cho phép: 7 ngày trước giải là giảm tải, 2 ngày liền trước giải không xếp buổi.
 */
export function lenLich(ct, opts) {
  const thu = [...new Set((opts.thu || []).filter((t) => t >= 0 && t <= 6))].sort((a, b) => a - b);
  if (!thu.length) return [];
  const soTuan = ct.tuanPlan.length;
  const ds = [];
  let d = opts.batDau;
  let dau = null;
  let dem = 0;
  for (let i = 0; i < 7 * soTuan + 7 && ds.length < 400; i++, d = congNgay(d, 1)) {
    if (!thu.includes(thuTrongTuan(d))) continue;
    if (dau === null) dau = d;
    const khoi = Math.floor(soNgayGiua(dau, d) / 7);
    if (khoi >= soTuan) break;
    let giamTai = !!ct.tuanPlan[khoi].giamTai;
    if (opts.ngayGiai && ct.giamTaiTruocGiai) {
      const kc = soNgayGiua(d, opts.ngayGiai);
      if (kc >= 0 && kc <= 2) { continue; }
      if (kc >= 3 && kc <= 7) giamTai = true;
    }
    ds.push({ key: `${ct.id}:${d}`, ngay: d, khoi, phienIdx: dem % ct.phien.length, giamTai });
    dem++;
  }
  return ds;
}

/** Danh sách bài của một buổi sau khi áp số hiệp theo tuần. */
export const GIAM_TAI = 0.6; // tuần giảm tải còn khoảng 60 phần trăm số hiệp (giảm 1/3 đến 1/2)
export const SO_BAI_TANG = 2; // chỉ tăng hiệp ở tối đa 2 bài sức mạnh chính mỗi buổi
export function baiCuaBuoi(ct, muc, baiMap) {
  const tuan = ct.tuanPlan[muc.khoi] || ct.tuanPlan[0];
  const phien = ct.phien[muc.phienIdx];
  let daTang = 0;
  return phien.bai.map(([id, ghiDe]) => {
    const ex = baiMap.get(id);
    const goc = docDem(ghiDe || ex.demMa);
    const dem = { ...goc };
    let hiep = goc.hiep;
    if (ex.mucDo >= 3) hiep = Math.min(hiep, 2 + (muc.khoi || 0)); // bài khó, ngoại tâm: bắt đầu 2 hiệp, tăng dần
    else if (ex.loai === 'suc-manh' && daTang < SO_BAI_TANG && !muc.giamTai) { hiep += tuan.themHiep || 0; if (tuan.themHiep) daTang++; }
    if (muc.giamTai) hiep = Math.round(hiep * GIAM_TAI);
    dem.hiep = Math.max(1, hiep);
    return { ex: id, dem };
  });
}

/** Hai ngày tập liền nhau trong tuần (kể cả Chủ nhật sang Thứ Hai). Trả về các cặp [a, b]. */
export function ngayLienKe(thu) {
  const s = new Set(thu);
  const cap = [];
  for (const t of [...s].sort((a, b) => a - b)) if (s.has((t + 1) % 7) && s.size > 1 && (t + 1) % 7 !== t) cap.push([t, (t + 1) % 7]);
  return cap;
}

/** Chương trình có buổi nặng cần nghỉ khoảng 48 giờ không. */
export function canNghi48h(ct, baiMap) {
  return ct.phien.some((p) => p.bai.some(([id]) => { const e = baiMap.get(id); return e && (e.mucDo >= 2 && (e.loai === 'suc-manh' || e.loai === 'bat-nhay')); }));
}

/** Các buổi trong kế hoạch còn cần nhắc: chưa làm và chưa quá hạn. */
export const mucConHan = (kh, hom) => (kh.muc || []).filter((m) => !(kh.xong || {})[m.key] && m.ngay >= hom);

// ---------- Tệp lịch .ics ----------
const escICS = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function gapDong(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = ''; let n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ch; n = b; } else { cur += ch; n += b; }
  }
  out.push(cur);
  return out.map((s, i) => (i ? ' ' + s : s)).join('\r\n');
}
const dtLocal = (ngay, gio) => `${ngay.replace(/-/g, '')}T${gio.replace(':', '')}00`;
const dtUTC = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;

/**
 * sk: [{ key, ngay, tieuDe, moTa }]. opts: { gio: '18:00', phut: 45, nhacTruoc: 30 (phút), now: Date }.
 */
export function taoICS(sk, opts = {}) {
  const gio = opts.gio || '18:00';
  const phut = opts.phut || 45;
  const nhac = opts.nhacTruoc ?? 30;
  const now = opts.now || new Date();
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//9app.tech//9fit//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:9fit'];
  for (const e of sk) {
    const [h, m] = gio.split(':').map(Number);
    const tong = h * 60 + m + phut;
    const gioCuoi = `${String(Math.floor(tong / 60) % 24).padStart(2, '0')}:${String(tong % 60).padStart(2, '0')}`;
    const ngayCuoi = tong >= 1440 ? congNgay(e.ngay, 1) : e.ngay;
    L.push('BEGIN:VEVENT',
      `UID:${escICS(e.key)}@fit.9app.tech`,
      `DTSTAMP:${dtUTC(now)}`,
      `DTSTART:${dtLocal(e.ngay, gio)}`,
      `DTEND:${dtLocal(ngayCuoi, gioCuoi)}`,
      `SUMMARY:${escICS(e.tieuDe)}`,
      `DESCRIPTION:${escICS(e.moTa)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escICS(e.tieuDe)}`, `TRIGGER:-PT${Math.max(0, nhac)}M`, 'END:VALARM',
      'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(gapDong).join('\r\n') + '\r\n';
}

// ---------- Tiến độ, chuỗi tuần, bài kiểm tra ----------
/** Chuỗi tuần liên tiếp có hoạt động (tập hoặc chơi). Tuần hiện tại chưa có hoạt động thì chưa tính là ngắt. */
export function chuoiTuan(cacNgay, homNay) {
  const tuanCo = new Set((cacNgay || []).map((n) => dauTuan(n)));
  let d = dauTuan(homNay);
  let dem = 0;
  if (!tuanCo.has(d)) d = congNgay(d, -7);
  while (tuanCo.has(d)) { dem++; d = congNgay(d, -7); }
  return dem;
}
export const soNgayHoatDong = (cacNgay, homNay, soNgay = 7) => new Set((cacNgay || []).filter((n) => n <= homNay && soNgayGiua(n, homNay) < soNgay)).size;

/** Cooper 12 phút: VO2max ước tính (ml/kg/phút) = (quãng đường m - 504,9) / 44,73. Chỉ là ước tính. */
export const vo2Cooper = (met) => (met > 0 ? Math.round(((met - 504.9) / 44.73) * 10) / 10 : null);
/** Chiều cao bật = chạm cao nhất khi bật trừ chạm cao nhất khi đứng (cm). */
export const chieuCaoBat = (dung, bat) => (bat >= dung ? Math.round((bat - dung) * 10) / 10 : null);
