import { h, toast, dialog, confirmDialog } from '../ui.js';
import * as store from '../store.js';
import { CV_TEMPLATES, renderCv, cvChecks, cvIsEmpty, resizePhoto, esc, findPlaceholders, cvPlaceholders } from '../cv.js';
import { getConfig, requestRewrite } from '../api.js';
import { LETTER_TEMPLATES, LETTER_FIELDS, fillLetter } from '../data/guides.js';
import { copyText } from '../ui.js';

let tab = 'form';
let jobText = '';
let jobRole = '';

export function printHtml(html) {
  const pr = document.getElementById('print-root');
  pr.innerHTML = html;
  const done = () => { pr.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

function tabs(active) {
  return h('div', { class: 'seg top', role: 'tablist' },
    h('a', { class: active === 'cv' ? 'on' : '', href: '#/cv', role: 'tab', 'aria-selected': String(active === 'cv') }, 'CV'),
    h('a', { class: active === 'thu' ? 'on' : '', href: '#/cv/thu', role: 'tab', 'aria-selected': String(active === 'thu') }, 'Thư xin việc'));
}

export function renderCvPage(root) {
  const s = store.get();
  const cv = s.cv;
  const frame = h('div', { class: 'cv-frame', id: 'cv-frame' });
  const scaler = h('div', { class: 'cv-scale' });
  frame.append(scaler);
  const checks = h('div', { class: 'card', id: 'cv-checks' });
  let ro = null;

  function fit() {
    const cvEl = scaler.firstElementChild;
    if (!cvEl) return;
    const k = Math.min(1, frame.clientWidth / 794);
    scaler.style.transform = `scale(${k})`;
    frame.style.height = `${Math.ceil(cvEl.offsetHeight * k)}px`;
  }
  function refresh() {
    scaler.innerHTML = renderCv(cv);
    fit();
    const c = cvChecks(cv);
    checks.replaceChildren(h('h3', { text: 'Kiểm tra trước khi gửi' }), c.length ? h('ul', { class: 'bul' }, c.map((t) => h('li', { text: t }))) : h('p', { class: 'ok', text: 'CV đã đủ các mục chính.' }));
  }
  let rt = null;
  const changed = () => { store.save(); clearTimeout(rt); rt = setTimeout(refresh, 120); };

  const input = (label, obj, key, o = {}) => {
    const el = h(o.area ? 'textarea' : 'input', { class: 'input', id: o.id, rows: o.rows, type: o.area ? null : (o.type || 'text'), placeholder: o.ph || '', autocomplete: o.ac || 'off', value: obj[key] || '', maxlength: o.max || (o.area ? 1500 : 120), oninput: (e) => { obj[key] = e.target.value; changed(); } });
    if (o.area) el.value = obj[key] || '';
    return h('label', { class: `fld${o.half ? ' half' : ''}` }, h('span', { text: label }), el);
  };

  // ----- Kinh nghiệm -----
  const expList = h('div', { id: 'exp-list' });
  function drawExp() {
    expList.replaceChildren(...cv.kinhNghiem.map((e, i) => expCard(e, i)));
    if (!cv.kinhNghiem.length) expList.append(h('p', { class: 'muted small', text: 'Chưa có mục nào. Mới ra trường? Hãy thêm thực tập, dự án, hoạt động đoàn thể hoặc việc làm thêm.' }));
  }
  function expCard(e, i) {
    const aiBox = h('div', { class: 'ai-rewrite hidden' });
    const ta = input('Mô tả công việc và thành tích (mỗi dòng một ý)', e, 'mota', { area: true, rows: 5, ph: 'Phụ trách đối chiếu công nợ hằng tháng\nChuẩn hóa mẫu báo cáo tuần, giảm thời gian lập báo cáo', max: 3000 });
    const aiBtn = h('button', { class: 'btn small', type: 'button', 'data-ai': i, onclick: async () => {
      const c = await getConfig();
      if (!c.ai) { toast('Tính năng AI đang tắt trên máy chủ này'); return; }
      aiBox.classList.toggle('hidden');
      if (!aiBox.classList.contains('hidden')) drawAi(aiBox, e, ta.querySelector('textarea'), changed, i);
    } }, 'Gợi ý viết lại bằng AI');
    getConfig().then((c) => { if (!c.ai) aiBtn.classList.add('hidden'); });
    return h('div', { class: 'card sub', 'data-exp': i },
      h('div', { class: 'grid2' }, input('Chức danh', e, 'chucVu', { half: true, ph: 'Chuyên viên hành chính' }), input('Công ty', e, 'congTy', { half: true, ph: 'Công ty ABC' }),
        input('Từ (tháng/năm)', e, 'tu', { half: true, ph: '03/2021' }), input('Đến (để trống nếu đang làm)', e, 'den', { half: true, ph: '09/2024' })),
      ta,
      h('div', { class: 'row' }, aiBtn,
        h('span', { class: 'sp' }),
        h('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Chuyển lên', disabled: i === 0, onclick: () => { [cv.kinhNghiem[i - 1], cv.kinhNghiem[i]] = [cv.kinhNghiem[i], cv.kinhNghiem[i - 1]]; drawExp(); changed(); } }, '↑'),
        h('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Chuyển xuống', disabled: i === cv.kinhNghiem.length - 1, onclick: () => { [cv.kinhNghiem[i + 1], cv.kinhNghiem[i]] = [cv.kinhNghiem[i], cv.kinhNghiem[i + 1]]; drawExp(); changed(); } }, '↓'),
        h('button', { class: 'btn ghost small danger-t', type: 'button', onclick: async () => { if (await confirmDialog('Xóa mục này?', 'Mục kinh nghiệm này sẽ bị xóa khỏi CV.', 'Xóa', true)) { cv.kinhNghiem.splice(i, 1); drawExp(); changed(); } } }, 'Xóa')),
      aiBox);
  }

  async function drawAi(box, e, taEl, onChange, i) {
    const out = h('div', { class: 'ai-out' });
    const jobTa = h('textarea', { class: 'input', rows: '5', id: `job-${i}`, placeholder: 'Dán tin tuyển dụng vào đây (tùy chọn nhưng nên có)', maxlength: 5000, value: jobText, oninput: (ev) => { jobText = ev.target.value; } });
    jobTa.value = jobText;
    const roleIn = h('input', { class: 'input', placeholder: 'Vị trí đang nhắm tới (tùy chọn)', maxlength: 120, value: jobRole || cv.chucDanh, oninput: (ev) => { jobRole = ev.target.value; } });
    const go = h('button', { class: 'btn primary', type: 'button', id: `go-ai-${i}` }, 'Gợi ý viết lại');
    go.addEventListener('click', async () => {
      if (!(e.mota || '').trim()) { toast('Hãy nhập mô tả kinh nghiệm trước'); return; }
      const st = store.get().settings;
      if (!st.consentCv) {
        const r = await dialog({ title: 'Gửi nội dung này cho AI?', body: h('div', null,
          h('p', { text: 'Phần mô tả kinh nghiệm của mục này, chức danh mục tiêu và tin tuyển dụng bạn dán sẽ được gửi tới máy chủ 9interview rồi tới dịch vụ AI Google Gemini để gợi ý. Họ tên, email, số điện thoại của bạn không được gửi.' }),
          h('p', { text: 'Máy chủ 9interview không lưu nội dung. Google xử lý theo chính sách riêng của họ. Hãy xóa thông tin nhạy cảm khỏi phần mô tả trước khi gửi.' })),
        actions: [{ id: 'cancel', label: 'Không gửi' }, { id: 'ok', label: 'Đồng ý, gợi ý giúp tôi', kind: 'primary' }] });
        if (r !== 'ok') return;
        st.consentCv = true; store.save();
      }
      go.disabled = true; go.textContent = 'Đang viết lại...';
      out.replaceChildren(h('p', { class: 'muted', role: 'status', text: 'AI đang đọc, khoảng vài giây...' }));
      try {
        const r = await requestRewrite({ experience: e.mota, job: jobText, role: roleIn.value });
        out.replaceChildren(
          h('h4', { text: 'Gợi ý (đọc kỹ, chỉ giữ những gì đúng sự thật)' }),
          h('ul', { class: 'bul' }, r.bullets.map((b) => h('li', { text: b }))),
          h('div', { class: 'row' },
            h('button', { class: 'btn', type: 'button', 'data-use': 'replace', onclick: () => { e.mota = r.bullets.join('\n'); taEl.value = e.mota; onChange(); toast(findPlaceholders(e.mota).length ? 'Đã thay. Nhớ điền hoặc xóa chỗ trống [...] trước khi gửi CV' : 'Đã thay phần mô tả', 4000); } }, 'Thay phần mô tả'),
            h('button', { class: 'btn', type: 'button', 'data-use': 'append', onclick: () => { e.mota = (e.mota ? e.mota.trimEnd() + '\n' : '') + r.bullets.join('\n'); taEl.value = e.mota; onChange(); toast(findPlaceholders(e.mota).length ? 'Đã thêm. Nhớ điền hoặc xóa chỗ trống [...] trước khi gửi CV' : 'Đã thêm vào cuối', 4000); } }, 'Thêm vào cuối')),
          r.keywords.length ? h('p', { class: 'small' }, h('b', { text: 'Từ khóa dùng được: ' }), r.keywords.join(', ')) : null,
          r.missing.length ? h('p', { class: 'small' }, h('b', { text: 'Tin tuyển dụng yêu cầu nhưng mô tả chưa nêu (chỉ bổ sung nếu đúng sự thật): ' }), r.missing.join('; ')) : null,
          r.droppedUngrounded ? h('p', { class: 'muted small', text: `${r.droppedUngrounded} dòng bị bỏ vì chứa con số không có trong mô tả của bạn.` }) : null,
          r.note ? h('p', { class: 'muted small', text: r.note }) : null);
      } catch (err) {
        out.replaceChildren(h('p', { class: 'err', role: 'alert', text: err.message }));
      } finally { go.disabled = false; go.textContent = 'Gợi ý viết lại'; }
    });
    box.replaceChildren(h('p', { class: 'muted small', text: 'Gửi đi: mô tả của mục này, vị trí, tin tuyển dụng. Không gửi họ tên và liên hệ.' }), roleIn, jobTa, go, out);
  }

  // ----- Học vấn -----
  const eduList = h('div', { id: 'edu-list' });
  function drawEdu() {
    eduList.replaceChildren(...cv.hocVan.map((e, i) => h('div', { class: 'card sub', 'data-edu': i },
      h('div', { class: 'grid2' }, input('Trường', e, 'truong', { half: true, ph: 'Đại học Kinh tế' }), input('Ngành, bằng cấp', e, 'nganh', { half: true, ph: 'Kế toán, Cử nhân' }),
        input('Từ', e, 'tu', { half: true, ph: '2017' }), input('Đến', e, 'den', { half: true, ph: '2021' })),
      input('Ghi chú (điểm, học bổng, hoạt động)', e, 'ghiChu', { ph: 'Học bổng khuyến khích học tập 2 học kỳ', max: 300 }),
      h('div', { class: 'row' }, h('span', { class: 'sp' }), h('button', { class: 'btn ghost small danger-t', type: 'button', onclick: () => { cv.hocVan.splice(i, 1); drawEdu(); changed(); } }, 'Xóa')))));
  }

  // ----- Mẫu -----
  const tplRow = h('div', { class: 'tpls', role: 'radiogroup', 'aria-label': 'Mẫu CV' }, CV_TEMPLATES.map((t) =>
    h('button', { class: `tpl${cv.tpl === t.id ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(cv.tpl === t.id), 'data-tpl': t.id, onclick: () => { cv.tpl = t.id; [...tplRow.children].forEach((c) => { const on = c.dataset.tpl === t.id; c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); }); changed(); photoRow.classList.toggle('hidden', cv.tpl !== 'noibat'); } },
      h('strong', { text: t.name }), h('span', { text: t.desc }))));

  const photoRow = h('div', { class: `fld${cv.tpl === 'noibat' ? '' : ' hidden'}`, id: 'photo-row' },
    h('span', { text: 'Ảnh chân dung (chỉ mẫu "Nổi bật"; nhiều hệ thống ATS bỏ qua ảnh)' }),
    h('div', { class: 'row' },
      h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', id: 'photo-file', onchange: async (ev) => { const f = ev.target.files[0]; if (!f) return; try { cv.anh = await resizePhoto(f); changed(); toast('Đã thêm ảnh'); } catch (err) { toast(err.message); } } }),
      h('button', { class: 'btn small', type: 'button', onclick: () => { cv.anh = ''; changed(); } }, 'Bỏ ảnh')));

  const formEl = h('div', { class: 'cv-form', id: 'cv-form' },
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Thông tin cá nhân' }),
      h('div', { class: 'grid2' },
        input('Họ và tên', cv, 'hoTen', { half: true, ph: 'Nguyễn Thị Lan', ac: 'name', id: 'f-hoTen' }),
        input('Chức danh mục tiêu', cv, 'chucDanh', { half: true, ph: 'Chuyên viên hành chính' }),
        input('Email', cv, 'email', { half: true, type: 'email', ph: 'ten@email.com', ac: 'email' }),
        input('Số điện thoại', cv, 'sdt', { half: true, type: 'tel', ph: '0901 234 567', ac: 'tel' }),
        input('Địa chỉ (quận/huyện, tỉnh/thành là đủ)', cv, 'diaChi', { half: true, ph: 'Quận 1, TP. Hồ Chí Minh' }),
        input('Liên kết (LinkedIn, portfolio)', cv, 'web', { half: true, ph: 'linkedin.com/in/ten' })),
      input('Tóm tắt (2 đến 3 câu)', cv, 'tomTat', { area: true, rows: 4, ph: 'Chuyên viên hành chính 3 năm kinh nghiệm, mạnh về quản lý hồ sơ và phối hợp liên phòng ban...', max: 600 })),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Kinh nghiệm làm việc' }), expList,
      h('button', { class: 'btn', type: 'button', id: 'add-exp', onclick: () => { if (cv.kinhNghiem.length >= 12) return; cv.kinhNghiem.push(store.emptyExp()); drawExp(); changed(); } }, '+ Thêm kinh nghiệm')),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Học vấn' }), eduList,
      h('button', { class: 'btn', type: 'button', id: 'add-edu', onclick: () => { if (cv.hocVan.length >= 8) return; cv.hocVan.push(store.emptyEdu()); drawEdu(); changed(); } }, '+ Thêm học vấn')),
    h('div', { class: 'card' }, h('h2', { class: 'sec', text: 'Kỹ năng và chứng chỉ' }),
      input('Kỹ năng (cách nhau bằng dấu phẩy)', cv, 'kyNang', { area: true, rows: 3, ph: 'Bảng tính nâng cao, Quản lý hồ sơ, Tiếng Anh giao tiếp, Làm việc nhóm', max: 800 }),
      input('Chứng chỉ (mỗi dòng một chứng chỉ)', cv, 'chungChi', { area: true, rows: 3, ph: 'TOEIC 700, 2022', max: 600 })));

  const previewEl = h('div', { class: 'cv-preview', id: 'cv-preview' },
    h('h2', { class: 'sec', text: 'Chọn mẫu CV' }), tplRow, photoRow,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary big', type: 'button', id: 'btn-pdf', onclick: async () => {
        if (cvIsEmpty(cv)) { toast('Hãy nhập thông tin CV trước'); return; }
        const ph = cvPlaceholders(cv);
        if (ph.length && !(await confirmDialog('CV còn chỗ trống chưa điền', 'Còn ' + ph.length + ' chỗ dạng ' + ph[0] + ' sẽ bị in nguyên văn ra PDF. Hãy điền số thật của bạn hoặc xóa dòng đó.', 'Vẫn xuất PDF'))) return;
        toast('Trong hộp thoại in, chọn "Lưu dưới dạng PDF", khổ A4, tắt "Đầu trang và chân trang"', 5000);
        setTimeout(() => printHtml(renderCv(cv)), 400);
      } }, 'Xuất PDF'),
      h('button', { class: 'btn', type: 'button', id: 'btn-sample-cv', onclick: async () => {
        if (!cvIsEmpty(cv) && !(await confirmDialog('Điền dữ liệu mẫu?', 'Dữ liệu mẫu sẽ thay thông tin CV hiện có của bạn.', 'Điền dữ liệu mẫu', true))) return;
        Object.assign(cv, sampleCv(cv.tpl)); store.flush(); window.dispatchEvent(new HashChangeEvent('hashchange')); toast('Đã điền dữ liệu mẫu');
      } }, 'Điền dữ liệu mẫu')),
    frame, checks,
    h('p', { class: 'muted small', text: 'CV dùng bố cục một cột, chữ thật (không phải ảnh) để hệ thống tuyển dụng tự động đọc được. Xuất PDF dùng chức năng in của trình duyệt.' }));

  const seg = h('div', { class: 'seg mid', role: 'tablist' },
    h('button', { class: tab === 'form' ? 'on' : '', type: 'button', id: 'seg-form', role: 'tab', 'aria-selected': String(tab === 'form'), onclick: () => setTab('form') }, 'Nhập thông tin'),
    h('button', { class: tab === 'preview' ? 'on' : '', type: 'button', id: 'seg-preview', role: 'tab', 'aria-selected': String(tab === 'preview'), onclick: () => setTab('preview') }, 'Xem trước và xuất'));
  const wrap = h('div', { class: `cv-wrap tab-${tab}`, id: 'cv-wrap' }, formEl, previewEl);
  function setTab(t) { tab = t; wrap.className = `cv-wrap tab-${t}`; [...seg.children].forEach((b) => { const on = b.id === `seg-${t}`; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); requestAnimationFrame(fit); window.scrollTo(0, 0); }

  root.replaceChildren(h('div', { class: 'page wide' }, tabs('cv'), h('h1', { text: 'Tạo CV' }), h('p', { class: 'muted small', text: 'Thông tin CV lưu trong trình duyệt của bạn, không gửi lên máy chủ.' }), seg, wrap));
  drawExp(); drawEdu(); refresh();
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => fit()); ro.observe(frame); }
  return () => { ro && ro.disconnect(); clearTimeout(rt); store.flush(); };
}

function sampleCv(tpl) {
  return {
    ...store.emptyCv(), tpl,
    hoTen: 'Nguyễn Thị Lan', chucDanh: 'Chuyên viên hành chính', email: 'lan.nguyen@example.com', sdt: '0901 234 567', diaChi: 'Quận 1, TP. Hồ Chí Minh', web: '',
    tomTat: 'Chuyên viên hành chính 3 năm kinh nghiệm tại công ty phân phối thiết bị văn phòng. Mạnh về quản lý hợp đồng, theo dõi công nợ nội bộ và phối hợp liên phòng ban. Cẩn thận, chủ động cải tiến quy trình.',
    kinhNghiem: [
      { congTy: 'Công ty TNHH Thiết bị Văn phòng Minh An', chucVu: 'Chuyên viên hành chính', tu: '03/2022', den: '', mota: 'Quản lý hồ sơ hợp đồng và theo dõi hạn thanh toán cho khách hàng\nChuyển quy trình theo dõi hợp đồng từ giấy sang bảng tính chung, cả phòng tìm hồ sơ nhanh hơn\nTổ chức hội nghị khách hàng hằng năm, phối hợp kinh doanh, kế toán và marketing' },
      { congTy: 'Công ty Cổ phần Dịch vụ Hoàng Long', chucVu: 'Trợ lý hành chính', tu: '07/2020', den: '02/2022', mota: 'Tiếp nhận và phân loại công văn, thư từ\nĐặt lịch họp, chuẩn bị tài liệu cho ban giám đốc\nQuản lý văn phòng phẩm và đối chiếu hóa đơn với nhà cung cấp' },
    ],
    hocVan: [{ truong: 'Đại học Kinh tế', nganh: 'Quản trị kinh doanh, Cử nhân', tu: '2016', den: '2020', ghiChu: '' }],
    kyNang: 'Bảng tính nâng cao, Soạn thảo văn bản, Quản lý hồ sơ, Phối hợp liên phòng ban, Tiếng Anh giao tiếp',
    chungChi: 'TOEIC 700 (2021)',
  };
}

/* ================= Thư xin việc ================= */
export function renderLetterPage(root) {
  const s = store.get();
  const L = s.letter;
  const out = h('div', { class: 'letter-out', id: 'letter-out' });
  const getBody = () => (LETTER_TEMPLATES.find((t) => t.id === L.tpl) || LETTER_TEMPLATES[0]).body;
  const text = () => fillLetter(getBody(), L.data);
  const warn = h('p', { class: 'err small', id: 'letter-warn', role: 'status' });
  const draw = () => { const t = text(); out.textContent = t; const ph = findPlaceholders(t); warn.textContent = ph.length ? 'Thư còn ' + ph.length + ' chỗ trống trong ngoặc vuông, ví dụ ' + ph[0] + '. Hãy điền hoặc sửa trước khi gửi.' : ''; };
  const guard = async (what) => { const ph = findPlaceholders(text()); return !ph.length || confirmDialog('Thư còn chỗ trống chưa điền', 'Còn ' + ph.length + ' chỗ trong ngoặc vuông, ví dụ ' + ph[0] + ', sẽ bị ' + what + ' nguyên văn.', 'Vẫn tiếp tục'); };
  const changed = () => { store.save(); draw(); };

  const tplChips = h('div', { class: 'chips scroll', role: 'radiogroup', 'aria-label': 'Mẫu thư' }, LETTER_TEMPLATES.map((t) =>
    h('button', { class: `chip${L.tpl === t.id ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(L.tpl === t.id), 'data-lt': t.id, title: t.desc, onclick: () => { L.tpl = t.id; [...tplChips.children].forEach((c) => { const on = c.dataset.lt === t.id; c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); }); changed(); } }, t.name)));

  const fields = h('div', { class: 'grid2', id: 'letter-fields' }, LETTER_FIELDS.map((f) => {
    const el = h(f.area ? 'textarea' : 'input', { class: 'input', rows: f.area ? 2 : null, placeholder: f.ph || '', maxlength: 300, oninput: (e) => { L.data[f.k] = e.target.value; changed(); } });
    el.value = L.data[f.k] || '';
    el.dataset.k = f.k;
    return h('label', { class: `fld${f.area ? '' : ' half'}` }, h('span', { text: f.label }), el);
  }));

  const prefill = () => {
    const cv = s.cv; const first = cv.kinhNghiem.find((e) => e.congTy.trim());
    const set = (k, v) => { if (v && !L.data[k]) L.data[k] = v; };
    set('hoTen', cv.hoTen); set('lienHe', [cv.sdt, cv.email].filter(Boolean).join(', ')); set('viTri', cv.chucDanh); set('noiLamGanNhat', first ? first.congTy : '');
    fields.querySelectorAll('[data-k]').forEach((el) => { el.value = L.data[el.dataset.k] || ''; });
    changed(); toast('Đã điền từ CV (chỉ các ô còn trống)');
  };

  root.replaceChildren(h('div', { class: 'page wide' }, tabs('thu'), h('h1', { text: 'Thư xin việc' }),
    h('p', { class: 'muted small', text: 'Chọn mẫu, điền các ô, thư tự ghép lại. Hãy đọc kỹ và sửa cho đúng giọng của bạn trước khi gửi. Các ô chưa điền hiện trong ngoặc vuông.' }),
    tplChips,
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', id: 'btn-prefill', onclick: prefill }, 'Điền từ CV của tôi')),
    fields,
    h('h2', { class: 'sec', text: 'Bản thư' }), warn, out,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', id: 'btn-copy-letter', onclick: async () => { if (!(await guard('sao chép'))) return; toast((await copyText(text())) ? 'Đã sao chép thư' : 'Không sao chép được, hãy chọn và chép tay'); } }, 'Sao chép'),
      h('button', { class: 'btn', type: 'button', id: 'btn-pdf-letter', onclick: async () => { if (!(await guard('in ra PDF'))) return; toast('Trong hộp thoại in, chọn "Lưu dưới dạng PDF"', 4000); setTimeout(() => printHtml(`<article class="letter">${text().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</article>`), 400); } }, 'Xuất PDF'))));
  draw();
  return () => store.flush();
}
