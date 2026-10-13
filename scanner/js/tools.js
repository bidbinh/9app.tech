// Màn "Công cụ chuyển đổi": PDF <-> ảnh/Word/Excel, gộp, tách, sắp xếp, nén, đóng dấu, đặt mật khẩu.
// Mọi xử lý chạy trên máy người dùng. pdf.js và pdf-lib chỉ được nạp khi dùng lần đầu.
import { $, h, icon, toast, pref, openModal, askText, confirmDlg } from './ui.js';
import { pickFiles, canvasToBlob, makeCanvas, importImage } from './render.js';
import { openPdf, renderPdfPage, pdfPageWords } from './pdfjs.js';
import { mergePdfs, arrangePdf, splitPdf, compressPdf, stampPdf, protectPdf, pageCount, COMPRESS_LEVELS } from './pdftools.js';
import { layoutPage, tablesForSheet } from './layout.js';
import { buildDocx, DOCX_MIME } from './docx.js';
import { buildXlsx, XLSX_MIME } from './xlsx.js';
import { buildZip } from './zip.js';
import { buildPdf, pageBox } from './pdf.js';
import { ocrCanvasSmart, shareFiles, downloadBlob, safeName } from './export.js';
import { formatSize, QUALITY_PRESETS } from './compress.js';
import { scaleCanvas } from './render.js';

const PDF_ACCEPT = 'application/pdf,.pdf';
const bytesOf = async (f) => new Uint8Array(await f.arrayBuffer());
const baseOf = (name) => safeName(String(name || 'tai-lieu').replace(/\.[^.]+$/, ''));
const todayStamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };

/* ---------------- hộp thoại dùng chung ---------------- */
function abortErr() { return Object.assign(new Error('Đã hủy'), { name: 'AbortError' }); }

/** Hộp tiến trình có nút Hủy. Trả về { status(text, frac), close(), signal }. */
function progressModal(title) {
  const ctl = new AbortController();
  let bar, txt, api;
  openModal((sheet, a) => {
    api = a;
    bar = h('i');
    txt = h('p', { class: 'prog-text', 'aria-live': 'polite', text: 'Đang chuẩn bị…' });
    sheet.append(h('h2', { text: title }), h('div', { class: 'prog-bar' }, bar), txt,
      h('div', { class: 'actions' }, h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => { ctl.abort(); a.close(); } })));
  }, { center: true });
  api.onclose = () => ctl.abort();
  return {
    signal: ctl.signal,
    status(text, frac) { if (txt) txt.textContent = text; if (bar && frac != null) bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; },
    close() { api.onclose = null; api.close(); },
  };
}

/** Hộp kết quả: danh sách tệp, tải về / chia sẻ. files: [{name, blob}]. */
function resultModal({ title = 'Đã xong', summary, files, zipFiles, notes = [] }) {
  openModal((sheet, api) => {
    const total = files.reduce((s, f) => s + f.blob.size, 0);
    sheet.append(h('h2', { text: title }));
    if (summary) sheet.append(h('p', { class: 'res-sum', text: summary }));
    const ul = h('ul', { class: 'res-list' });
    for (const f of files.slice(0, 8)) ul.append(h('li', {}, icon('file'), h('span', { class: 'nm', text: f.name }), h('span', { class: 'sz', text: formatSize(f.blob.size) })));
    if (files.length > 8) ul.append(h('li', { class: 'more', text: `… và ${files.length - 8} tệp nữa` }));
    sheet.append(ul);
    if (files.length > 1) sheet.append(h('p', { class: 'res-sum', text: `Tổng cộng ${formatSize(total)}` }));
    for (const n of notes) sheet.append(h('p', { class: 'hint small left', text: n }));
    const dl = async () => { for (const f of files) { downloadBlob(f.blob, f.name); if (files.length > 1) await new Promise((r) => setTimeout(r, 250)); } toast('Đã tải về máy'); };
    const share = async () => {
      const r = await shareFiles(files, title);
      if (r === 'unsupported') { await dl(); toast('Thiết bị chưa hỗ trợ chia sẻ trực tiếp, đã tải tệp về máy.', 4200); } else if (r === 'shared') toast('Đã mở chia sẻ');
    };
    const acts = h('div', { class: 'actions' },
      h('button', { class: 'btn secondary', onclick: dl }, icon('download'), 'Tải về'),
      h('button', { class: 'btn primary', onclick: share }, icon('share'), 'Chia sẻ'));
    sheet.append(acts);
    if (zipFiles) sheet.append(h('button', { class: 'linkbtn', onclick: async () => { for (const f of zipFiles) downloadBlob(f.blob, f.name); toast('Đã tải về máy'); } }, 'Tải riêng từng tệp'));
    sheet.append(h('button', { class: 'linkbtn', text: 'Đóng', onclick: () => api.close() }));
  });
}

function askPassword(name, wrong) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal((sheet, api) => {
      const inp = h('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Mật khẩu của tệp PDF', maxlength: '64' });
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(inp.value || null); });
      sheet.append(h('h2', { text: 'Tệp có mật khẩu' }), h('p', { text: wrong ? 'Mật khẩu chưa đúng. Hãy nhập lại.' : `Nhập mật khẩu để mở “${name}”.` }), inp,
        h('div', { class: 'actions' }, h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(null) }), h('button', { class: 'btn primary', text: 'Mở', onclick: () => finish(inp.value || null) })));
      setTimeout(() => inp.focus(), 50);
    }, { center: true });
    m.onclose = () => { if (!done) { done = true; resolve(null); } };
  });
}

/** Mở PDF bằng pdf.js, hỏi mật khẩu nếu cần. Trả về { doc, bytes, name } hoặc null nếu người dùng hủy. */
async function openPdfFile(file) {
  const bytes = await bytesOf(file);
  let password;
  for (let tries = 0; tries < 5; tries++) {
    try {
      const doc = await openPdf(bytes, password);
      return { doc, bytes, name: file.name, password };
    } catch (e) {
      if (e.code === 'PASSWORD' || e.code === 'BADPASSWORD') {
        password = await askPassword(file.name, e.code === 'BADPASSWORD');
        if (password == null) return null;
      } else { toast(e.message, 5000); return null; }
    }
  }
  return null;
}

async function pickPdf(multiple = false) {
  const files = await pickFiles({ accept: PDF_ACCEPT, multiple });
  return files.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
}

/** Danh sách tệp có thể thêm, bỏ, đổi thứ tự (gộp PDF, ảnh sang PDF). Trả về mảng File hoặc null. */
function fileListModal({ title, accept, hint, confirmLabel, min = 1, first }) {
  return new Promise((resolve) => {
    let done = false;
    const files = first ? [...first] : [];
    const m = openModal((sheet, api) => {
      const ul = h('ul', { class: 'fl-list' });
      const info = h('p', { class: 'hint small left', text: hint });
      const ok = h('button', { class: 'btn primary', text: confirmLabel });
      const paint = () => {
        ul.textContent = '';
        files.forEach((f, i) => {
          ul.append(h('li', {},
            h('span', { class: 'no', text: String(i + 1) }),
            h('span', { class: 'nm' }, f.name, h('small', { text: formatSize(f.size) })),
            h('button', { 'aria-label': 'Đưa lên', disabled: i === 0, onclick: () => { [files[i - 1], files[i]] = [files[i], files[i - 1]]; paint(); } }, icon('left')),
            h('button', { 'aria-label': 'Đưa xuống', disabled: i === files.length - 1, onclick: () => { [files[i + 1], files[i]] = [files[i], files[i + 1]]; paint(); } }, icon('right')),
            h('button', { class: 'del', 'aria-label': 'Bỏ ' + f.name, onclick: () => { files.splice(i, 1); paint(); } }, icon('close'))));
        });
        ok.disabled = files.length < min;
        info.textContent = files.length < min ? hint : `Đã chọn ${files.length} tệp. Dùng mũi tên để đổi thứ tự.`;
      };
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      ok.addEventListener('click', () => finish(files.slice()));
      sheet.append(h('h2', { text: title }), ul, info,
        h('button', { class: 'btn secondary wide', onclick: async () => { const add = await pickFiles({ accept, multiple: true }); files.push(...add); paint(); } }, icon('plus'), 'Thêm tệp'),
        h('div', { class: 'actions' }, h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(null) }), ok));
      paint();
    });
    m.onclose = () => { if (!done) { done = true; resolve(null); } };
  });
}

function segControl(label, opts, value, onChange) {
  const row = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const paint = (v) => { for (const b of row.children) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } };
  for (const [v, t] of opts) row.append(h('button', { role: 'radio', dataset: { v }, text: t, onclick: () => { paint(v); onChange(v); } }));
  paint(value);
  return row;
}

/** Hộp tùy chọn đơn giản: trả về Promise<object|null>. build(sheet, state) dựng các điều khiển. */
function optionsModal(title, state, build, okLabel = 'Bắt đầu') {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal((sheet, api) => {
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      sheet.append(h('h2', { text: title }));
      build(sheet, state);
      sheet.append(h('div', { class: 'actions' }, h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(null) }), h('button', { class: 'btn primary', text: okLabel, onclick: () => finish(state) })));
    });
    m.onclose = () => { if (!done) { done = true; resolve(null); } };
  });
}

async function runWithProgress(title, fn) {
  const pm = progressModal(title);
  try {
    const out = await fn(pm);
    if (pm.signal.aborted) return null;
    pm.close();
    return out;
  } catch (e) {
    pm.close();
    if (e && e.name === 'AbortError') return null;
    toast(e && e.message ? e.message : 'Có lỗi khi xử lý.', 6000);
    return null;
  }
}
const chk = (s) => { if (s.aborted) throw abortErr(); };

/* ---------------- 1. Ảnh sang PDF ---------------- */
async function toolImagesToPdf() {
  const first = await pickFiles({ accept: 'image/*', multiple: true });
  if (!first.length) return;
  const files = await fileListModal({ title: 'Ảnh sang PDF', accept: 'image/*', hint: 'Chọn ít nhất một ảnh.', confirmLabel: 'Tiếp', first });
  if (!files || !files.length) return;
  const P = pref.get('img2pdf', {});
  const st = { paper: P.paper || 'a4', quality: P.quality || 'normal' };
  const ok = await optionsModal('Ảnh sang PDF', st, (sheet, s) => {
    sheet.append(h('div', { class: 'grp', text: 'Khổ giấy' }), segControl('Khổ giấy', [['a4', 'A4'], ['fit', 'Giữ tỉ lệ ảnh']], s.paper, (v) => { s.paper = v; }),
      h('div', { class: 'grp', text: 'Chất lượng' }), segControl('Chất lượng', [['high', 'Cao'], ['normal', 'Chuẩn'], ['small', 'Nhỏ']], s.quality, (v) => { s.quality = v; }),
      h('p', { class: 'hint small left', text: 'Ảnh được giữ nguyên, không cắt hay lọc. Muốn cắt và làm nét như máy quét, hãy dùng nút Chụp hoặc Chọn ảnh ở trang chủ.' }));
  }, 'Tạo PDF');
  if (!ok) return;
  pref.set('img2pdf', { paper: ok.paper, quality: ok.quality });
  const preset = QUALITY_PRESETS[ok.quality] || QUALITY_PRESETS.normal;
  const out = await runWithProgress('Đang tạo PDF…', async (pm) => {
    const items = [];
    for (let i = 0; i < files.length; i++) {
      chk(pm.signal);
      pm.status(`Đang xử lý ảnh ${i + 1}/${files.length}`, i / files.length);
      let c;
      try { c = (await importImage(files[i])).canvas; } catch (e) { throw new Error(`Không đọc được ảnh “${files[i].name}”.`); }
      c = scaleCanvas(c, Math.min(1, preset.maxEdge / Math.max(c.width, c.height)));
      const blob = await canvasToBlob(c, 'image/jpeg', preset.quality);
      items.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), imgW: c.width, imgH: c.height, ...pageBox(c.width, c.height, ok.paper, 0) });
    }
    const name = files.length === 1 ? baseOf(files[0].name) : `Ảnh ${todayStamp()}`;
    const bytes = buildPdf(items, { title: name, lang: 'vi' });
    return { name: name + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }), n: items.length };
  });
  if (out) resultModal({ title: 'Đã tạo PDF', summary: `${out.n} trang`, files: [{ name: out.name, blob: out.blob }] });
}

/* ---------------- 2. PDF sang ảnh JPG ---------------- */
async function toolPdfToJpg() {
  const [file] = await pickPdf(false);
  if (!file) return;
  const pdf = await openPdfFile(file);
  if (!pdf) return;
  const st = { q: pref.get('pdf2jpg', 'normal') };
  const ok = await optionsModal(`PDF sang ảnh JPG (${pdf.doc.numPages} trang)`, st, (sheet, s) => {
    sheet.append(h('div', { class: 'grp', text: 'Chất lượng ảnh' }), segControl('Chất lượng', [['small', 'Nhỏ'], ['normal', 'Chuẩn'], ['high', 'Cao']], s.q, (v) => { s.q = v; }),
      h('p', { class: 'hint small left', text: 'Chuẩn ≈ 150 điểm/inch (đọc rõ trên màn hình), Cao ≈ 220 điểm/inch (in được). Nhiều trang sẽ gói thành một tệp .zip.' }));
  }, 'Chuyển');
  if (!ok) { pdf.doc.destroy(); return; }
  pref.set('pdf2jpg', ok.q);
  const dpi = { small: 100, normal: 150, high: 220 }[ok.q];
  const q = { small: 0.72, normal: 0.85, high: 0.92 }[ok.q];
  const out = await runWithProgress('Đang chuyển PDF sang ảnh…', async (pm) => {
    const n = pdf.doc.numPages, base = baseOf(file.name), files = [];
    for (let i = 1; i <= n; i++) {
      chk(pm.signal);
      pm.status(`Đang dựng trang ${i}/${n}`, (i - 1) / n);
      const c = await renderPdfPage(pdf.doc, i, { scale: dpi / 72 > 4 ? 4 : dpi / 72 });
      const blob = await canvasToBlob(c, 'image/jpeg', q);
      c.width = c.height = 1;
      files.push({ name: n === 1 ? `${base}.jpg` : `${base}-trang${i}.jpg`, blob });
    }
    return files;
  });
  pdf.doc.destroy();
  if (!out) return;
  if (out.length === 1) { resultModal({ title: 'Đã chuyển xong', files: out }); return; }
  const zip = await buildZip(await Promise.all(out.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()), store: true }))));
  resultModal({ title: 'Đã chuyển xong', summary: `${out.length} ảnh JPG`, files: [{ name: baseOf(file.name) + '-anh.zip', blob: new Blob([zip], { type: 'application/zip' }) }], zipFiles: out });
}

/* ---------------- 3 & 4. PDF sang Word / Excel ---------------- */
/** Trả về { layouts, scanned, flipped, confidences } cho toàn bộ trang của PDF (có chữ: lấy văn bản; bản quét: dựng ảnh rồi OCR). */
async function pdfLayouts(doc, pm) {
  const n = doc.numPages, layouts = [], conf = [];
  let scanned = 0;
  for (let i = 1; i <= n; i++) {
    chk(pm.signal);
    pm.status(`Đang đọc trang ${i}/${n}`, (i - 1) / n);
    const t = await pdfPageWords(doc, i);
    if (t.chars >= 20) { layouts.push(layoutPage({ words: t.words, width: t.width, height: t.height })); continue; }
    scanned++;
    const canvas = await renderPdfPage(doc, i, { maxEdge: 2000 });
    const { r, rules } = await ocrCanvasSmart(canvas, (p) => pm.status(`Đọc chữ trang ${i}/${n}${p && p.raw === 'recognizing text' ? ' ' + Math.round(p.progress * 100) + '%' : ''}`, (i - 1 + (p && p.raw === 'recognizing text' ? p.progress : 0)) / n), pm.signal);
    conf.push(r.confidence);
    layouts.push(layoutPage({ words: r.words, width: r.width, height: r.height }, { rules }));
    canvas.width = canvas.height = 1;
  }
  return { layouts, scanned, conf };
}

async function toolPdfToWord() {
  const [file] = await pickPdf(false);
  if (!file) return;
  const pdf = await openPdfFile(file);
  if (!pdf) return;
  const st = { images: false };
  const ok = await optionsModal(`PDF sang Word (${pdf.doc.numPages} trang)`, st, (sheet, s) => {
    const c = h('input', { type: 'checkbox', id: 'w-img' });
    c.addEventListener('change', () => { s.images = c.checked; });
    sheet.append(h('p', { class: 'hint small left', text: 'PDF có chữ: lấy trực tiếp văn bản. PDF là bản quét hoặc ảnh: dựng ảnh rồi đọc chữ (OCR) tiếng Việt, mất thêm thời gian.' }),
      h('label', { class: 'check', for: 'w-img' }, c, h('span', {}, 'Kèm ảnh các trang ở cuối tệp', h('small', { text: 'Để đối chiếu với bản gốc. Tệp sẽ nặng hơn.' }))),
      h('p', { class: 'hint small left', text: 'Giữ đoạn văn, tiêu đề, bảng cơ bản. Không giữ phông chữ, hình vẽ hay bố cục phức tạp.' }));
  }, 'Chuyển');
  if (!ok) { pdf.doc.destroy(); return; }
  const out = await runWithProgress('Đang chuyển PDF sang Word…', async (pm) => {
    const { layouts, scanned } = await pdfLayouts(pdf.doc, pm);
    const images = [];
    if (ok.images) {
      for (let i = 1; i <= pdf.doc.numPages; i++) {
        chk(pm.signal);
        pm.status(`Đang chèn ảnh trang ${i}`, i / pdf.doc.numPages);
        const c = await renderPdfPage(pdf.doc, i, { maxEdge: 1500 });
        const blob = await canvasToBlob(c, 'image/jpeg', 0.8);
        images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
      }
    }
    pm.status('Đang tạo tệp Word…', 1);
    const title = baseOf(file.name);
    const bytes = await buildDocx(layouts, { title, images });
    return { name: title + '.docx', blob: new Blob([bytes], { type: DOCX_MIME }), scanned, n: layouts.length };
  });
  pdf.doc.destroy();
  if (!out) return;
  const notes = out.scanned ? [`${out.scanned}/${out.n} trang là bản quét nên được đọc bằng OCR: hãy kiểm tra lại chữ có dấu và số trước khi dùng.`] : [];
  resultModal({ title: 'Đã chuyển sang Word', summary: `${out.n} trang`, files: [{ name: out.name, blob: out.blob }], notes });
}

async function toolPdfToExcel() {
  const [file] = await pickPdf(false);
  if (!file) return;
  const pdf = await openPdfFile(file);
  if (!pdf) return;
  const out = await runWithProgress('Đang tìm bảng trong PDF…', async (pm) => {
    const { layouts, scanned } = await pdfLayouts(pdf.doc, pm);
    return { sheets: sheetsFromLayouts(layouts), scanned };
  });
  pdf.doc.destroy();
  if (!out) return;
  const edited = await editSheets(out.sheets, { title: 'Kiểm tra bảng trước khi xuất Excel', ok: 'Xuất Excel' });
  if (!edited) return;
  const title = baseOf(file.name);
  const bytes = await buildXlsx(edited.map((s) => ({ name: s.name, rows: s.rows, headerRow: !s.approx })), { title });
  resultModal({ title: 'Đã chuyển sang Excel', summary: `${edited.length} trang tính`, files: [{ name: title + '.xlsx', blob: new Blob([bytes], { type: XLSX_MIME }) }] });
}

export function sheetsFromLayouts(layouts) {
  const sheets = [];
  layouts.forEach((lay, i) => {
    const tabs = tablesForSheet(lay);
    tabs.forEach((t, k) => sheets.push({ name: layouts.length > 1 ? `Trang ${i + 1}${tabs.length > 1 ? ' - Bảng ' + (k + 1) : ''}` : tabs.length > 1 ? `Bảng ${k + 1}` : 'Bảng 1', rows: t.rows.map((r) => r.slice()), approx: t.approx, page: i }));
  });
  return sheets;
}

/* ---------------- bộ sửa bảng (Excel) ---------------- */
/** Cho người dùng xem và sửa các bảng nhận được trước khi xuất. Trả về mảng sheets đã sửa hoặc null. */
export function editSheets(sheets, { title = 'Kiểm tra bảng', ok = 'Xuất Excel' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const data = sheets.length ? sheets.map((s) => ({ ...s, rows: s.rows.map((r) => r.slice()) })) : [{ name: 'Bảng 1', rows: [['']], approx: true }];
    const m = openModal((sheet, api) => {
      sheet.classList.add('tall');
      let cur = 0, selR = 0, selC = 0;
      const tabs = h('div', { class: 'chips scroller xl-tabs', role: 'tablist' });
      const wrap = h('div', { class: 'xl-wrap' });
      const note = h('p', { class: 'hint small left' });
      const colsOf = (s) => Math.max(1, ...s.rows.map((r) => r.length));
      const paint = () => {
        tabs.textContent = '';
        if (data.length > 1) data.forEach((s, i) => tabs.append(h('button', { class: 'chip' + (i === cur ? ' on' : ''), role: 'tab', 'aria-selected': String(i === cur), text: s.name, onclick: () => { cur = i; selR = selC = 0; paint(); } })));
        tabs.hidden = data.length < 2;
        const s = data[cur], nC = colsOf(s);
        note.textContent = s.approx ? 'Không thấy đường kẻ hay cột rõ ràng nên mỗi dòng chữ là một hàng. Hãy sửa, thêm hoặc xóa ô cho đúng.' : `${s.rows.length} hàng × ${nC} cột. Bảng đọc bằng OCR nên có thể sai chữ hoặc lệch ô: hãy kiểm tra trước khi xuất.`;
        wrap.textContent = '';
        const tbl = h('table', { class: 'xl' });
        // bề rộng cột theo nội dung dài nhất (tối đa ~ 320px) để đọc được chữ trong ô
        const colW = Array.from({ length: nC }, (_, ci) => Math.max(96, Math.min(320, Math.max(0, ...s.rows.map((r) => Array.from(r[ci] || '').length)) * 9 + 28)));
        s.rows.forEach((r, ri) => {
          const tr = h('tr');
          for (let ci = 0; ci < nC; ci++) {
            const inp = h('input', { type: 'text', value: r[ci] || '', 'aria-label': `Hàng ${ri + 1}, cột ${ci + 1}` });
            inp.style.width = colW[ci] + 'px';
            inp.addEventListener('input', () => { s.rows[ri][ci] = inp.value; });
            inp.addEventListener('focus', () => { selR = ri; selC = ci; });
            tr.append(h('td', {}, inp));
          }
          tbl.append(tr);
        });
        wrap.append(tbl);
      };
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      const act = (label, fn) => h('button', { class: 'btn secondary sm', text: label, onclick: () => { fn(); paint(); } });
      sheet.append(h('h2', { text: title }), tabs, note, wrap,
        h('div', { class: 'row wrap xl-acts' },
          act('+ Hàng', () => { const s = data[cur]; s.rows.splice(selR + 1, 0, Array(colsOf(s)).fill('')); }),
          act('− Hàng', () => { const s = data[cur]; if (s.rows.length > 1) s.rows.splice(selR, 1); selR = Math.max(0, selR - 1); }),
          act('+ Cột', () => { const s = data[cur]; s.rows.forEach((r) => { while (r.length < colsOf(s)) r.push(''); r.splice(selC + 1, 0, ''); }); }),
          act('− Cột', () => { const s = data[cur]; if (colsOf(s) > 1) s.rows.forEach((r) => r.splice(selC, 1)); selC = Math.max(0, selC - 1); })),
        h('div', { class: 'actions' }, h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(null) }), h('button', { class: 'btn primary', text: ok, onclick: () => finish(data) })));
      paint();
    });
    m.onclose = () => { if (!done) { done = true; resolve(null); } };
  });
}

/* ---------------- 5. Gộp PDF ---------------- */
async function toolMerge() {
  const files = await fileListModal({ title: 'Gộp PDF', accept: PDF_ACCEPT, hint: 'Chọn ít nhất hai tệp PDF.', confirmLabel: 'Gộp', min: 2 });
  if (!files) return;
  const out = await runWithProgress('Đang gộp PDF…', async (pm) => {
    const items = [];
    for (let i = 0; i < files.length; i++) { chk(pm.signal); pm.status(`Đang đọc ${files[i].name}`, i / files.length); items.push({ name: files[i].name, bytes: await bytesOf(files[i]) }); }
    pm.status('Đang ghép các trang…', 0.9);
    const bytes = await mergePdfs(items);
    return bytes;
  });
  if (!out) return;
  const n = await pageCount(out);
  resultModal({ title: 'Đã gộp PDF', summary: `${files.length} tệp, ${n} trang`, files: [{ name: `Gộp ${todayStamp()}.pdf`, blob: new Blob([out], { type: 'application/pdf' }) }] });
}

/* ---------------- 6. Nén PDF ---------------- */
async function recodeJpeg(bytes, { maxEdge, quality }) {
  let bmp;
  try { bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { imageOrientation: 'none' }); } catch (e) { return null; }
  const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const c = makeCanvas(bmp.width * s, bmp.height * s);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  const blob = await canvasToBlob(c, 'image/jpeg', quality);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height };
}

async function toolCompress() {
  const [file] = await pickPdf(false);
  if (!file) return;
  const st = { level: pref.get('compress', 'medium') };
  const ok = await optionsModal(`Nén PDF (${formatSize(file.size)})`, st, (sheet, s) => {
    sheet.append(h('div', { class: 'grp', text: 'Mức nén' }), segControl('Mức nén', [['light', 'Nhẹ'], ['medium', 'Vừa'], ['strong', 'Mạnh']], s.level, (v) => { s.level = v; }),
      h('p', { class: 'hint small left', text: `Chỉ thu nhỏ các ảnh JPEG bên trong PDF (mức mạnh: cạnh dài tối đa ${COMPRESS_LEVELS.strong.maxEdge} điểm ảnh, chất lượng thấp hơn). Chữ và hình vẽ giữ nguyên, vẫn tìm và sao chép được.` }));
  }, 'Nén');
  if (!ok) return;
  pref.set('compress', ok.level);
  const out = await runWithProgress('Đang nén PDF…', async (pm) => {
    const bytes = await bytesOf(file);
    return compressPdf(bytes, ok.level, recodeJpeg, { name: file.name, onProgress: (p) => { chk(pm.signal); pm.status(`Đang xử lý ảnh ${Math.min(p.n, p.i + 1)}/${p.n}`, p.n ? p.i / p.n : 1); } });
  });
  if (!out) return;
  const after = out.bytes.length;
  const better = after < file.size;
  const blob = new Blob([better ? out.bytes : await file.arrayBuffer()], { type: 'application/pdf' });
  const pct = Math.round((1 - after / file.size) * 100);
  resultModal({
    title: better ? 'Đã nén PDF' : 'Không nén thêm được',
    summary: better ? `${formatSize(file.size)} → ${formatSize(after)} (giảm ${pct}%)` : `Tệp vẫn ${formatSize(file.size)}.`,
    files: [{ name: baseOf(file.name) + '-nen.pdf', blob }],
    notes: better ? [`Đã thu nhỏ ${out.replaced}/${out.images} ảnh.`] : ['PDF này gần như chỉ có chữ, hoặc ảnh bên trong đã nhỏ/không phải JPEG. Hãy thử mức Mạnh hơn, hoặc quét lại bằng 9scanner với chất lượng Nhỏ.'],
  });
}

/* ---------------- 7. Đóng dấu chữ ---------------- */
async function stampImage({ text, color, mode }) {
  const font = 'bold 120px Arial, "Segoe UI", sans-serif';
  const m = makeCanvas(10, 10).getContext('2d');
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width), pad = 40;
  const w = tw + pad * 2, hh = 120 + pad * 2;
  const c = makeCanvas(w, hh);
  const x = c.getContext('2d');
  x.font = font; x.textBaseline = 'middle'; x.fillStyle = color; x.strokeStyle = color;
  x.lineWidth = 8;
  x.fillText(text, pad, hh / 2 + 6);
  x.strokeRect(10, 10, w - 20, hh - 20);
  let out = c, aspect = w / hh;
  if (mode === 'center') {
    const a = (-30 * Math.PI) / 180;
    const W = Math.ceil(Math.abs(w * Math.cos(a)) + Math.abs(hh * Math.sin(a))), H = Math.ceil(Math.abs(w * Math.sin(a)) + Math.abs(hh * Math.cos(a)));
    out = makeCanvas(W, H);
    const o = out.getContext('2d');
    o.translate(W / 2, H / 2); o.rotate(a); o.drawImage(c, -w / 2, -hh / 2);
    aspect = W / H;
  }
  const blob = await canvasToBlob(out, 'image/png');
  return { png: new Uint8Array(await blob.arrayBuffer()), aspect };
}

async function toolStamp() {
  const [file] = await pickPdf(false);
  if (!file) return;
  const st = { text: 'BẢN SAO', mode: 'center', color: '#c8232a', opacity: 0.35 };
  const ok = await optionsModal('Đóng dấu chữ lên PDF', st, (sheet, s) => {
    const inp = h('input', { type: 'text', value: s.text, maxlength: '40', 'aria-label': 'Nội dung dấu' });
    inp.addEventListener('input', () => { s.text = inp.value; });
    sheet.append(h('div', { class: 'grp', text: 'Nội dung dấu' }), inp,
      h('div', { class: 'grp', text: 'Vị trí' }), segControl('Vị trí', [['center', 'Chéo giữa trang'], ['top', 'Đầu trang'], ['bottom', 'Chân trang']], s.mode, (v) => { s.mode = v; }),
      h('div', { class: 'grp', text: 'Màu' }), segControl('Màu', [['#c8232a', 'Đỏ'], ['#374151', 'Xám'], ['#1d4ed8', 'Xanh']], s.color, (v) => { s.color = v; }),
      h('div', { class: 'grp', text: 'Độ đậm' }), segControl('Độ đậm', [['0.2', 'Nhạt'], ['0.35', 'Vừa'], ['0.6', 'Đậm']], String(s.opacity), (v) => { s.opacity = parseFloat(v); }));
  }, 'Đóng dấu');
  if (!ok) return;
  if (!ok.text.trim()) { toast('Hãy nhập nội dung dấu.'); return; }
  const out = await runWithProgress('Đang đóng dấu…', async (pm) => {
    pm.status('Đang vẽ dấu…', 0.3);
    const img = await stampImage({ text: ok.text.trim(), color: ok.color, mode: ok.mode });
    pm.status('Đang đóng dấu lên các trang…', 0.6);
    return stampPdf(await bytesOf(file), { png: img.png, aspect: img.aspect, position: ok.mode, widthFrac: ok.mode === 'center' ? 0.8 : 0.5, opacity: ok.opacity }, file.name);
  });
  if (out) resultModal({ title: 'Đã đóng dấu', files: [{ name: baseOf(file.name) + '-dau.pdf', blob: new Blob([out], { type: 'application/pdf' }) }] });
}

/* ---------------- 8. Đặt mật khẩu ---------------- */
async function toolProtect() {
  const [file] = await pickPdf(false);
  if (!file) return;
  const st = { pw: '', pw2: '' };
  const ok = await new Promise((resolve) => {
    let done = false;
    const m = openModal((sheet, api) => {
      const i1 = h('input', { type: 'password', autocomplete: 'new-password', maxlength: '32', 'aria-label': 'Mật khẩu' });
      const i2 = h('input', { type: 'password', autocomplete: 'new-password', maxlength: '32', 'aria-label': 'Nhập lại mật khẩu' });
      const err = h('p', { class: 'form-err', 'aria-live': 'polite' });
      const finish = (v) => { if (done) return; done = true; api.close(); resolve(v); };
      const go = () => {
        if (!/^[\x20-\x7e]{4,32}$/.test(i1.value)) { err.textContent = 'Mật khẩu 4–32 ký tự, chỉ dùng chữ không dấu, số và ký hiệu để mọi phần mềm đọc PDF đều mở được.'; return; }
        if (i1.value !== i2.value) { err.textContent = 'Hai lần nhập chưa giống nhau.'; return; }
        finish(i1.value);
      };
      sheet.append(h('h2', { text: 'Đặt mật khẩu cho PDF' }), h('div', { class: 'grp', text: 'Mật khẩu' }), i1, h('div', { class: 'grp', text: 'Nhập lại mật khẩu' }), i2, err,
        h('p', { class: 'hint small left', text: 'Mã hóa AES 128 bit. Mật khẩu không được lưu hay gửi đi đâu: nếu quên sẽ không lấy lại được.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn secondary', text: 'Hủy', onclick: () => finish(null) }), h('button', { class: 'btn primary', text: 'Đặt mật khẩu', onclick: go }, icon('lock'))));
    }, { center: true });
    m.onclose = () => { if (!done) { done = true; resolve(null); } };
  });
  if (!ok) return;
  void st;
  const out = await runWithProgress('Đang mã hóa PDF…', async (pm) => { pm.status('Đang mã hóa…', 0.5); return protectPdf(await bytesOf(file), ok, file.name); });
  if (out) resultModal({ title: 'Đã đặt mật khẩu', files: [{ name: baseOf(file.name) + '-khoa.pdf', blob: new Blob([out], { type: 'application/pdf' }) }], notes: ['Hãy thử mở tệp mới để chắc chắn bạn nhớ đúng mật khẩu.'] });
}

/* ---------------- 9. Sắp xếp / xóa / tách trang ---------------- */
const PP = { pdf: null, file: null, items: [], urls: [], token: 0 };

async function toolPages(nav) {
  const [file] = await pickPdf(false);
  if (!file) return;
  const pdf = await openPdfFile(file);
  if (!pdf) return;
  if (PP.pdf) { try { PP.pdf.doc.destroy(); } catch (e) { /* bỏ qua */ } }
  PP.pdf = pdf; PP.file = file;
  PP.items = Array.from({ length: pdf.doc.numPages }, (_, i) => ({ index: i, rot: 0, sel: false, url: null }));
  nav('pdfpages');
}

function ppRevoke() { for (const u of PP.urls) URL.revokeObjectURL(u); PP.urls = []; }

async function ppPaint() {
  const grid = $('#pp-grid');
  const my = ++PP.token;
  grid.textContent = '';
  const n = PP.items.length;
  $('#pp-title').textContent = `${baseOf(PP.file.name)} (${n} trang)`;
  PP.items.forEach((it, i) => {
    const img = h('div', { class: 'thumb' });
    if (it.url) img.style.backgroundImage = `url(${it.url})`;
    img.style.transform = `rotate(${it.rot}deg)`;
    const pic = h('button', { class: 'pic' + (it.sel ? ' sel' : ''), 'aria-pressed': String(it.sel), 'aria-label': `Trang ${it.index + 1}${it.sel ? ', đang chọn' : ''}`, onclick: () => { it.sel = !it.sel; ppPaint(); } },
      img, h('span', { class: 'no', text: String(it.index + 1) }), h('span', { class: 'tick' }, icon('check')));
    grid.append(h('li', { class: 'pg', dataset: { i } }, pic,
      h('div', { class: 'acts' },
        h('button', { 'aria-label': 'Đưa lên trước', disabled: i === 0, onclick: () => { [PP.items[i - 1], PP.items[i]] = [PP.items[i], PP.items[i - 1]]; ppPaint(); } }, icon('left')),
        h('button', { 'aria-label': 'Xoay trang ' + (it.index + 1), onclick: () => { it.rot = (it.rot + 90) % 360; ppPaint(); } }, icon('rot-r')),
        h('button', { 'aria-label': 'Đưa ra sau', disabled: i === n - 1, onclick: () => { [PP.items[i + 1], PP.items[i]] = [PP.items[i], PP.items[i + 1]]; ppPaint(); } }, icon('right')))));
  });
  const sel = PP.items.filter((x) => x.sel).length;
  $('#pp-hint').textContent = sel ? `Đã chọn ${sel} trang.` : 'Chạm vào trang để chọn. Dùng mũi tên dưới mỗi trang để đổi thứ tự.';
  $('#pp-all span').textContent = sel === n ? 'Bỏ chọn' : 'Chọn tất cả';
  // sinh ảnh thu nhỏ còn thiếu
  for (const it of PP.items) {
    if (it.url) continue;
    if (my !== PP.token) return;
    try {
      const c = await renderPdfPage(PP.pdf.doc, it.index + 1, { maxEdge: 360 });
      const blob = await canvasToBlob(c, 'image/jpeg', 0.7);
      const u = URL.createObjectURL(blob); PP.urls.push(u);
      // ảnh có thể đã đổi thứ tự: cập nhật theo mục thực
      PP.items.filter((x) => x.index === it.index).forEach((x) => { x.url = u; });
      c.width = c.height = 1;
    } catch (e) { it.url = ''; continue; }
    if (my !== PP.token) return;
    const idx = PP.items.indexOf(it);
    const el = grid.children[idx] && grid.children[idx].querySelector('.thumb');
    if (el) el.style.backgroundImage = `url(${it.url})`;
  }
}

export function enterPdfPages() { if (!PP.pdf) return false; ppPaint(); return true; }
export function leavePdfPages() { PP.token++; }

function bindPdfPages() {
  $('#pp-all').addEventListener('click', () => { const all = PP.items.every((x) => x.sel); PP.items.forEach((x) => { x.sel = !all; }); ppPaint(); });
  $('#pp-rot').addEventListener('click', () => {
    const sel = PP.items.filter((x) => x.sel);
    if (!sel.length) { toast('Hãy chạm chọn trang cần xoay.'); return; }
    sel.forEach((x) => { x.rot = (x.rot + 90) % 360; }); ppPaint();
  });
  $('#pp-del').addEventListener('click', async () => {
    const sel = PP.items.filter((x) => x.sel);
    if (!sel.length) { toast('Hãy chạm chọn trang cần xóa.'); return; }
    if (sel.length === PP.items.length) { toast('Không thể xóa hết các trang.'); return; }
    if (!(await confirmDlg('Xóa trang đã chọn?', `${sel.length} trang sẽ bị bỏ khỏi PDF mới. Tệp gốc không bị thay đổi.`, 'Xóa', true))) return;
    PP.items = PP.items.filter((x) => !x.sel); ppPaint();
  });
  const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });
  $('#pp-save').addEventListener('click', async () => {
    const plan = PP.items.map((x) => ({ index: x.index, rotate: x.rot }));
    const out = await runWithProgress('Đang tạo PDF mới…', async (pm) => { pm.status('Đang ghép trang…', 0.5); return arrangePdf(PP.pdf.bytes, plan, PP.file.name); });
    if (out) resultModal({ title: 'Đã lưu PDF mới', summary: `${plan.length} trang`, files: [{ name: baseOf(PP.file.name) + '-moi.pdf', blob: pdfBlob(out) }] });
  });
  $('#pp-split').addEventListener('click', async () => {
    const sel = PP.items.filter((x) => x.sel);
    if (!sel.length) { toast('Hãy chạm chọn các trang cần tách.'); return; }
    const mode = await new Promise((resolve) => {
      let done = false;
      const m = openModal((sheet, api) => {
        const fin = (v) => { if (done) return; done = true; api.close(); resolve(v); };
        sheet.append(h('h2', { text: `Tách ${sel.length} trang đã chọn` }),
          h('button', { class: 'list-btn', onclick: () => fin('one') }, icon('file'), 'Gộp thành một tệp PDF'),
          h('button', { class: 'list-btn', onclick: () => fin('each') }, icon('split'), 'Mỗi trang một tệp (gói .zip)'));
      });
      m.onclose = () => { if (!done) { done = true; resolve(null); } };
    });
    if (!mode) return;
    const base = baseOf(PP.file.name);
    const out = await runWithProgress('Đang tách trang…', async (pm) => {
      pm.status('Đang tách…', 0.5);
      if (mode === 'one') return [{ name: `${base}-tach.pdf`, blob: pdfBlob(await arrangePdf(PP.pdf.bytes, sel.map((x) => ({ index: x.index, rotate: x.rot })), PP.file.name)) }];
      const parts = await splitPdf(PP.pdf.bytes, sel.map((x) => [x.index]), PP.file.name);
      return parts.map((b, i) => ({ name: `${base}-trang${sel[i].index + 1}.pdf`, blob: pdfBlob(b) }));
    });
    if (!out) return;
    if (out.length === 1) { resultModal({ title: 'Đã tách trang', files: out }); return; }
    const zip = await buildZip(await Promise.all(out.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()), store: true }))));
    resultModal({ title: 'Đã tách trang', summary: `${out.length} tệp PDF`, files: [{ name: `${base}-tach.zip`, blob: new Blob([zip], { type: 'application/zip' }) }], zipFiles: out });
  });
}

/* ---------------- danh sách công cụ ---------------- */
export function initTools({ navTo }) {
  const TOOLS = [
    { id: 'img2pdf', icon: 'image', title: 'Ảnh sang PDF', sub: 'Ghép nhiều ảnh thành một tệp PDF', fn: toolImagesToPdf },
    { id: 'pdf2jpg', icon: 'image', title: 'PDF sang ảnh JPG', sub: 'Mỗi trang một ảnh, nhiều trang gói .zip', fn: toolPdfToJpg },
    { id: 'pdf2word', icon: 'word', title: 'PDF sang Word (.docx)', sub: 'PDF có chữ lấy văn bản; bản quét thì đọc chữ OCR', fn: toolPdfToWord },
    { id: 'pdf2xlsx', icon: 'table', title: 'PDF sang Excel (.xlsx)', sub: 'Tìm bảng trong PDF, cho sửa trước khi xuất', fn: toolPdfToExcel },
    { id: 'merge', icon: 'merge', title: 'Gộp PDF', sub: 'Nối nhiều tệp PDF theo thứ tự bạn chọn', fn: toolMerge },
    { id: 'pages', icon: 'pages', title: 'Sắp xếp, xóa, tách trang', sub: 'Xem từng trang, đổi thứ tự, xoay, xóa, tách tệp', fn: () => toolPages(navTo) },
    { id: 'compress', icon: 'compress', title: 'Nén PDF', sub: 'Thu nhỏ ảnh bên trong, giữ nguyên chữ', fn: toolCompress },
    { id: 'stamp', icon: 'stamp', title: 'Đóng dấu chữ', sub: 'In chữ như “BẢN SAO” lên mọi trang', fn: toolStamp },
    { id: 'protect', icon: 'key', title: 'Đặt mật khẩu PDF', sub: 'Mã hóa AES, mở tệp phải nhập mật khẩu', fn: toolProtect },
  ];
  const ul = $('#tool-list');
  for (const t of TOOLS) {
    ul.append(h('li', {}, h('button', { class: 'tool-item', dataset: { tool: t.id }, onclick: () => t.fn() },
      h('span', { class: 'ic' }, icon(t.icon)), h('span', { class: 'tx' }, h('b', { text: t.title }), h('small', { text: t.sub })), icon('right'))));
  }
  ul.append(h('li', {}, h('div', { class: 'tool-item off', 'aria-disabled': 'true' },
    h('span', { class: 'ic' }, icon('word')), h('span', { class: 'tx' }, h('b', { text: 'Word sang PDF (chưa hỗ trợ)' }), h('small', { text: 'Trình duyệt không có bộ dựng Word nên không chuyển trung thực được. Hãy dùng Word hoặc LibreOffice: Lưu thành PDF.' })))));
  bindPdfPages();
  $('#btn-tools').addEventListener('click', () => navTo('tools'));
}
