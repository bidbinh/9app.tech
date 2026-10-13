// Tiến độ, cài đặt, về dữ liệu.
import { h, mount, icon, openSheet, confirmSheet, toast, fmtDate, download } from '../ui.js';
import { D, cfg, hang, poolIds, critIds, counts, profileId, states, applyTheme, CHAPTER_SHORT, CHAPTERS } from '../state.js';
import { store } from '../store.js';
import { chapterStats, dayKey, streak, DAY, isMastered, daysUntil } from '../core.js';
import { HANG_LIST, HANGS, PROFILES } from '../rules.js';
import { buildICS } from '../ics.js';
import { reportSheet, questionCard, nav } from './quiz.js';
import { imageUrls, cachedSet, progress as prefetchProgress, onProgress as onPrefetch, start as startPrefetch, stop as stopPrefetch } from '../prefetch.js';
import { APP_VERSION, REPORT_EMAIL } from '../config.js';

export function openHangSheet(onChange) {
  const cur = hang();
  const close = openSheet([
    h('h2', null, 'Chọn hạng giấy phép lái xe'),
    h('div', { class: 'list' }, HANG_LIST.map((k) => h('button', {
      class: 'item', type: 'button', 'data-hang': k, 'aria-pressed': k === cur ? 'true' : 'false', onclick: () => {
        store.update((d) => { d.settings.hang = k; });
        close();
        toast('Đã chọn hạng ' + k);
        if (onChange) onChange();
      },
    }, h('span', { class: 'pill' + (k === cur ? ' ok' : '') }, k), h('div', { class: 'grow' }, h('b', null, 'Hạng ' + k + (k === cur ? ' (đang chọn)' : '')), h('div', { class: 'muted small' }, HANGS[k].mota))))),
    h('p', { class: 'muted small mt' }, 'Từ 01/01/2025 tên hạng đã đổi theo Luật Trật tự, an toàn giao thông đường bộ 2024: B1 nay là mô tô ba bánh, ô tô đến 8 chỗ là hạng B. Hạng cũ đổi sang hạng mới thế nào, xem văn bản chính thức hoặc hỏi cơ sở đào tạo.'),
    h('div', { class: 'btns mt' }, h('button', { class: 'btn sec', type: 'button', onclick: () => close() }, 'Đóng')),
  ]);
}

// ---------- Tiến độ ----------
export function viewProgress(root) {
  const ids = poolIds();
  const st = states();
  const c = counts();
  const d = store.get();
  let correct = 0;
  let answers = 0;
  for (const id of ids) if (st[id]) { correct += st[id].c; answers += st[id].s; }
  const acc = answers ? Math.round((correct / answers) * 100) : 0;
  const ex = d.exams;
  const passed = ex.filter((e) => e.pass).length;
  const avg = ex.length ? (ex.reduce((s, e) => s + e.score / e.total, 0) / ex.length) * 100 : 0;
  const now = Date.now();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push({ k: dayKey(now - i * DAY), n: d.days[dayKey(now - i * DAY)] || 0 });
  const maxN = Math.max(10, ...days.map((x) => x.n));
  const cs = chapterStats(st, ids.map((id) => D.byId.get(id)));
  const weak = [1, 2, 3, 4, 5, 6].filter((k) => cs[k] && cs[k].answers >= 5).map((k) => ({ k, acc: cs[k].correct / cs[k].answers })).sort((a, b) => a.acc - b.acc)[0];

  mount(root, h('div', { class: 'stack' },
    h('h1', null, `Tiến độ · hạng ${hang()}`),
    h('div', { class: 'stat-grid' },
      stat(`${c.seen}/${c.total}`, 'câu đã làm'), stat(`${c.mastered}`, 'câu đã vững'),
      stat(answers ? acc + '%' : '—', 'độ chính xác'), stat(String(streak(d.days)), 'ngày học liên tiếp'),
      stat(`${passed}/${ex.length}`, 'bài thi thử đạt'), stat(ex.length ? Math.round(avg) + '%' : '—', 'điểm thi thử trung bình')),
    weak ? h('div', { class: 'banner' }, `Chương yếu nhất: ${CHAPTER_SHORT[weak.k]} (đúng ${Math.round(weak.acc * 100)}%). `, h('a', { href: '#/hoc/c/' + weak.k }, 'Ôn chương này')) : null,
    h('section', { class: 'card stack' }, h('h2', null, '14 ngày gần đây'),
      h('div', { class: 'chart', role: 'img', 'aria-label': 'Số câu làm mỗi ngày trong 14 ngày: ' + days.map((x) => x.n).join(', ') }, days.map((x) => h('i', { class: x.n ? 'on' : '', style: `height:${Math.max(3, (x.n / maxN) * 100)}%`, title: `${x.k}: ${x.n} câu` }))),
      h('p', { class: 'muted small' }, `Tổng 14 ngày: ${days.reduce((s, x) => s + x.n, 0)} câu · hôm nay: ${days[13].n}`)),
    h('section', { class: 'card stack' }, h('h2', null, 'Theo chương'),
      [1, 2, 3, 4, 5, 6].map((k) => {
        const x = cs[k];
        if (!x || !x.total) return null;
        const accK = x.answers ? Math.round((x.correct / x.answers) * 100) : null;
        return h('div', null,
          h('div', { class: 'row between' }, h('b', null, `Chương ${k}. ${CHAPTER_SHORT[k]}`), h('span', { class: 'muted small' }, `${x.mastered}/${x.total} vững${accK !== null ? ' · đúng ' + accK + '%' : ''}`)),
          h('div', { class: 'mt', style: 'margin-top:6px' }, h('div', { class: 'bar', role: 'img', 'aria-label': `Chương ${k}: ${x.mastered} vững, ${x.seen} đã làm trên ${x.total}` }, h('i', { style: `width:${(x.mastered / x.total) * 100}%` }), h('i', { class: 'seen', style: `width:${((x.seen - x.mastered) / x.total) * 100}%` }))));
      })),
    h('section', null, h('h2', { class: 'sec-title' }, 'Lịch sử thi thử'),
      ex.length ? h('div', { class: 'list' }, ex.map((e, i) => ({ e, i })).reverse().slice(0, 15).map(({ e, i }) => h('a', { class: 'item', href: '#/thi/ket-qua/' + i },
        h('span', { class: 'pill ' + (e.pass ? 'ok' : 'bad') }, e.pass ? 'Đạt' : 'Trượt'),
        h('div', { class: 'grow' }, h('b', null, `${e.score}/${e.total} · hạng ${e.hang}`), h('div', { class: 'muted small' }, new Date(e.t).toLocaleString('vi-VN'))),
        h('span', { class: 'chev' }, icon('next', 18))))) : h('p', { class: 'muted' }, 'Chưa có bài thi thử nào. ', h('a', { href: '#/thi' }, 'Thi thử ngay'))),
  ));
}
function stat(v, l) { return h('div', { class: 'stat' }, h('b', null, v), h('span', null, l)); }

// ---------- Cài đặt ----------
export function viewSettings(root) {
  const s = cfg();
  const sel = (id, value, opts, on) => h('select', { id, onchange: (e) => on(e.target.value) }, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t)));
  const save = (patch, msg) => { store.update((d) => Object.assign(d.settings, patch)); if (msg) toast(msg); };
  const imgStatus = h('p', { class: 'muted small', id: 'img-status' }, '');
  const imgBtn = h('button', { class: 'btn sec', type: 'button' }, 'Tải sẵn tất cả hình để dùng ngoại tuyến');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Chọn file sao lưu', onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { store.importJSON(await f.text()); applyTheme(); toast('Đã khôi phục tiến độ'); viewSettings(root); } catch (err) { toast('Không đọc được file: ' + err.message); }
  } });

  const imgUrls = imageUrls(D.questions);
  const renderImg = async () => {
    if (!('caches' in window)) { imgStatus.textContent = 'Trình duyệt này không hỗ trợ lưu ngoại tuyến.'; imgBtn.disabled = true; return; }
    const have = (await cachedSet(imgUrls)).size;
    const pg = prefetchProgress;
    imgBtn.textContent = pg.running ? 'Dừng tải' : have >= imgUrls.length ? 'Đã đủ hình trên máy' : 'Tải sẵn tất cả hình để dùng ngoại tuyến';
    imgBtn.disabled = !pg.running && have >= imgUrls.length;
    imgStatus.textContent = pg.running ? `Đang tải nền: ${have}/${imgUrls.length} hình (${pg.failed ? pg.failed + ' lỗi, ' : ''}dừng bất cứ lúc nào)` : `${have}/${imgUrls.length} hình đã có trên máy${have < imgUrls.length ? '. Câu có hình sẽ không hiện hình khi mất mạng nếu hình chưa tải.' : '. Mở app không cần mạng.'}`;
  };
  imgBtn.onclick = () => { if (prefetchProgress.running) stopPrefetch(); else startPrefetch(imgUrls); };
  const off = onPrefetch(() => { if (document.body.contains(imgBtn)) renderImg(); else off(); });
  renderImg();

  mount(root, h('div', { class: 'stack' },
    h('h1', null, 'Cài đặt'),
    h('section', { class: 'card stack' },
      h('h2', null, 'Kỳ thi của bạn'),
      h('div', { class: 'field' }, h('label', { class: 'f' }, 'Hạng đang ôn'), h('button', { class: 'btn sec block', type: 'button', onclick: () => openHangSheet(() => viewSettings(root)) }, `Hạng ${hang()} · ${HANGS[hang()].mota.slice(0, 48)}…`)),
      h('div', { class: 'field' }, h('label', { class: 'f', for: 'in-exam' }, 'Ngày thi dự kiến'), h('input', { type: 'date', id: 'in-exam', value: s.examDate, onchange: (e) => save({ examDate: e.target.value }, e.target.value ? 'Đã đặt ngày thi ' + fmtDate(e.target.value) : 'Đã bỏ ngày thi') })),
      h('div', { class: 'field' }, h('label', { class: 'f', for: 'in-prof' }, 'Cấu trúc đề thi áp dụng'),
        sel('in-prof', s.profile, [['auto', `Tự động theo ngày (hiện là: ${PROFILES[profileId()].ten})`], ['hien-hanh', 'Hiện hành: Thông tư 12/2025/TT-BCA'], ['moi', 'Mới từ 01/3/2027: Thông tư 108/2026/TT-BCA']], (v) => save({ profile: v }, 'Đã đổi cấu trúc đề')),
        h('p', { class: 'muted small' }, 'Chế độ tự động: nếu bạn đặt ngày thi từ 01/3/2027 trở đi thì dùng cấu trúc mới. ', h('a', { href: '#/du-lieu' }, 'Xem nguồn'))),
      h('div', { class: 'field' }, h('label', { class: 'f', for: 'in-goal' }, 'Mục tiêu mỗi ngày'), sel('in-goal', s.goal, [[10, '10 câu'], [20, '20 câu'], [30, '30 câu'], [50, '50 câu']], (v) => save({ goal: +v }, 'Đã lưu mục tiêu')))),
    h('section', { class: 'card stack' },
      h('h2', null, 'Nhắc lịch ôn (file .ics)'),
      h('p', { class: 'muted small' }, 'Tạo file lịch để thêm vào Google Calendar, Apple Lịch hoặc Outlook: nhắc ôn mỗi ngày đến ngày thi, nhắc ngày thi và ngày hết hạn giấy phép.'),
      h('div', { class: 'field' }, h('label', { class: 'f', for: 'in-time' }, 'Giờ nhắc ôn mỗi ngày'), h('input', { type: 'time', id: 'in-time', value: s.remind || '20:00', onchange: (e) => save({ remind: e.target.value }) })),
      h('div', { class: 'field' }, h('label', { class: 'f', for: 'in-exp' }, 'Ngày hết hạn giấy phép lái xe hiện có (nếu có)'), h('input', { type: 'date', id: 'in-exp', value: s.gplxExpiry, onchange: (e) => save({ gplxExpiry: e.target.value }, 'Đã lưu ngày hết hạn') })),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const ics = buildICS({ examDate: cfg().examDate, hang: hang(), time: cfg().remind || '20:00', gplxExpiry: cfg().gplxExpiry, critCount: critIds().length });
        download('9license-nhac-lich.ics', ics, 'text/calendar;charset=utf-8');
        toast('Đã tạo file lịch');
      } }, icon('cal', 20), 'Tải file lịch (.ics)')),
    h('section', { class: 'card stack' },
      h('h2', null, 'Giao diện'),
      sel('in-theme', s.theme, [['auto', 'Theo thiết bị'], ['light', 'Sáng'], ['dark', 'Tối']], (v) => { save({ theme: v }); applyTheme(); })),
    h('section', { class: 'card stack' },
      h('h2', null, 'Dùng khi không có mạng'),
      h('p', { class: 'muted small' }, 'App tự lưu giao diện và câu hỏi. Hình minh họa (khoảng 3,4 MB) được tải nền khi máy rảnh và có mạng tốt; bạn cũng có thể bấm nút dưới để tải ngay hoặc dừng.'),
      h('div', { class: 'field' }, h('label', { class: 'f', for: 'in-auto' }, 'Tự tải nền khi rảnh'), sel('in-auto', s.autoImg === false ? 'off' : 'on', [['on', 'Bật (chỉ khi mạng tốt, không bật tiết kiệm dữ liệu)'], ['off', 'Tắt']], (v) => save({ autoImg: v !== 'off' }, v === 'off' ? 'Đã tắt tự tải nền' : 'Đã bật tự tải nền'))),
      imgBtn, imgStatus),
    h('section', { class: 'card stack' },
      h('h2', null, 'Sao lưu tiến độ'),
      h('p', { class: 'muted small' }, 'Tiến độ chỉ lưu trên thiết bị này. Sao lưu để chuyển sang máy khác.'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn sec', type: 'button', onclick: () => { download('9license-tien-do.json', store.exportJSON(), 'application/json'); toast('Đã tạo file sao lưu'); } }, 'Tải file sao lưu'),
        h('button', { class: 'btn sec', type: 'button', onclick: () => fileInput.click() }, 'Khôi phục từ file')),
      h('div', { style: 'display:none' }, fileInput),
      h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (await confirmSheet({ title: 'Xóa toàn bộ tiến độ?', text: 'Mọi kết quả làm bài, lịch sử thi thử và cài đặt trên máy này sẽ bị xóa. Không thể hoàn tác.', ok: 'Xóa hết', danger: true })) {
          store.reset(); applyTheme(); toast('Đã xóa dữ liệu'); nav.go('#/'); location.reload();
        }
      } }, 'Xóa toàn bộ dữ liệu trên máy')),
    h('section', { class: 'card stack' },
      h('h2', null, 'Thông tin'),
      h('a', { class: 'item', href: '#/du-lieu' }, icon('info', 22), h('div', { class: 'grow' }, h('b', null, 'Về dữ liệu'), h('div', { class: 'muted small' }, 'Nguồn, quy định, miễn trừ, báo sai')), h('span', { class: 'chev' }, icon('next', 18))),
      h('p', { class: 'muted small' }, `9license ${APP_VERSION} · dữ liệu ${D.meta.version}`))));
}

// ---------- Về dữ liệu ----------
export function viewAbout(root) {
  const m = D.meta;
  const rowsProfile = (pid) => {
    const p = PROFILES[pid];
    return h('div', { class: 'tablewrap' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, ['Hạng', 'Số câu', 'Thời gian', 'Điểm đạt'].map((x) => h('th', null, x)))),
      h('tbody', null, ['A1', 'A', 'B1', 'B', 'C1', 'C', 'D1', 'D2', 'D'].map((k) => {
        if ((pid === 'moi') && (k === 'D1' || k === 'D2')) return null;
        const e = p.exams[k];
        const label = pid === 'moi' && k === 'D' ? 'D1, D2, D' : pid === 'hien-hanh' && k === 'D' ? 'D1, D2, D' : k;
        if (pid === 'hien-hanh' && (k === 'D1' || k === 'D2')) return null;
        return h('tr', null, h('td', null, label), h('td', null, `${e.n} câu`), h('td', null, `${e.min} phút`), h('td', null, `${e.pass}/${e.n}`));
      }))));
  };
  mount(root, h('div', { class: 'stack' },
    h('h1', null, 'Về dữ liệu'),
    h('div', { class: 'banner' }, 'Chỉ để tham khảo và ôn tập. Luôn đối chiếu với văn bản quy phạm pháp luật và hướng dẫn của cơ quan có thẩm quyền, cơ sở đào tạo lái xe. App không phải kênh chính thức của Bộ Công an hay Cục Cảnh sát giao thông.'),
    h('section', { class: 'card stack' },
      h('h2', null, 'Bộ câu hỏi'),
      h('p', null, `${m.bo_cau_hoi.ten}, do ${m.bo_cau_hoi.co_quan} biên soạn và công bố, áp dụng từ ${fmtDate(m.bo_cau_hoi.ap_dung_tu)}.`),
      h('p', { class: 'muted small' }, `Văn bản: ${m.bo_cau_hoi.van_ban}.`),
      h('ul', { class: 'small' },
        h('li', null, `${m.bo_cau_hoi.so_cau} câu: chương I 180, II 25, III 58, IV 37, V 185, VI 115.`),
        h('li', null, `Hạng A1, A dùng 250 câu chọn lọc (20 câu điểm liệt); hạng B1 dùng 300 câu (30 câu điểm liệt); hạng B trở lên dùng cả 600 câu (60 câu điểm liệt).`),
        h('li', null, 'Nội dung câu hỏi, đáp án và hình lấy nguyên từ bộ đề công bố, không soạn lại. Đáp án đúng là dòng được gạch chân trong file gốc, theo hướng dẫn của Cục.'),
        h('li', null, `Dấu vân tay file gốc (SHA-256): ${m.bo_cau_hoi.pdf_sha256}`)),
      h('p', { class: 'muted small' }, 'Mẹo nhớ trong app do 9license soạn dựa trên chính đáp án của bộ đề; không thuộc bộ đề chính thức.')),
    h('section', { class: 'card stack' },
      h('h2', null, 'Cấu trúc đề thi lý thuyết'),
      h('h3', null, 'Hiện hành, đến hết 28/02/2027'),
      h('p', { class: 'muted small' }, PROFILES['hien-hanh'].vanBan + '. Đã đối chiếu với văn bản gốc.'),
      rowsProfile('hien-hanh'),
      h('p', { class: 'muted small' }, 'Mỗi đề có đúng 1 câu điểm liệt; chọn sai là không đạt. (Đề mới từ 01/3/2027: văn bản không nêu số câu điểm liệt, app tạm giữ 1 câu.)'),
      h('h3', { class: 'mt' }, 'Mới từ 01/03/2027'),
      h('p', { class: 'muted small' }, PROFILES.moi.vanBan + '. ' + PROFILES.moi.ghiChu),
      rowsProfile('moi'),
      h('p', { class: 'muted small' }, 'Từ 01/7/2026 đã bỏ phần sát hạch mô phỏng tình huống trên máy tính (Thông tư 108/2026/TT-BCA, khoản 5 Điều 4: ô tô thi lý thuyết, sa hình, đường trường; Nghị định 94/2026/NĐ-CP theo bài của Báo điện tử Chính phủ). Theo Điều 42, ai đã đạt phần nào trước khi Thông tư có hiệu lực thì được công nhận; ai chưa đạt, từ 01/3/2027 thi lại phần đó theo quy định mới.')),
    h('section', { class: 'card stack' },
      h('h2', null, 'Điều chưa chắc chắn'),
      h('ul', { class: 'small' }, m.chua_chac.map((x) => h('li', null, x)))),
    h('section', { class: 'card stack' },
      h('h2', null, `Nguồn đã dùng (tra cứu ngày ${fmtDate(m.tra_cuu_ngay)})`),
      h('ul', { class: 'small' }, m.nguon.map((n) => h('li', null, h('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.ten), ' — ', n.dung_cho)))),
    h('section', { class: 'card stack' },
      h('h2', null, 'Phát hiện sai sót?'),
      h('p', { class: 'muted small' }, 'Nếu thấy nội dung, đáp án hoặc hình khác với bộ đề chính thức, hãy báo để sửa. Bạn cũng có thể báo ngay từ từng câu hỏi.'),
      h('button', { class: 'btn', type: 'button', onclick: () => reportSheet(null) }, icon('flag', 20), 'Báo sai dữ liệu'),
      REPORT_EMAIL ? null : h('p', { class: 'muted small' }, 'Nội dung báo sai được sao chép hoặc chia sẻ từ máy bạn; app không tự gửi dữ liệu đi đâu.'))));
}
