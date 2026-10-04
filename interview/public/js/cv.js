// Dựng CV thành HTML sạch (không bảng, không chữ trong ảnh) để ATS đọc được. Mọi nội dung đều được escape.
export const CV_TEMPLATES = [
  { id: 'codien', name: 'Cổ điển', desc: 'Chữ có chân, tiêu đề giữa trang. Trang trọng, hợp văn phòng, kế toán, nhân sự.' },
  { id: 'hiendai', name: 'Hiện đại', desc: 'Chữ không chân, dải màu bên trái tiêu đề. Hợp IT, kinh doanh, sáng tạo.' },
  { id: 'toigian', name: 'Tối giản', desc: 'Gọn, chữ nhỏ, chứa được nhiều nội dung nhất trên một trang.' },
  { id: 'noibat', name: 'Nổi bật', desc: 'Dải màu đậm ở đầu trang, có thể kèm ảnh chân dung (tùy chọn).' },
];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Tách mô tả thành các dòng gạch đầu dòng
export function bullets(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-•*–]\s*)/, '').trim()).filter(Boolean);
}

export function skillList(text) {
  return String(text || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

export function period(tu, den) {
  tu = (tu || '').trim(); den = (den || '').trim();
  if (!tu && !den) return '';
  return `${tu || '...'} – ${den || 'Hiện tại'}`;
}

export function cvIsEmpty(cv) {
  return !cv.hoTen.trim() && !cv.chucDanh.trim() && !cv.tomTat.trim() && cv.kinhNghiem.every((e) => !e.congTy.trim() && !e.chucVu.trim()) && cv.hocVan.every((e) => !e.truong.trim());
}

// Chỗ trống dạng [số liệu thật của bạn] cần được điền hoặc xóa trước khi gửi
export function findPlaceholders(text) {
  return String(text || '').match(/\[[^\[\]\n]{1,80}\]/g) || [];
}
export function cvPlaceholders(cv) {
  const parts = [cv.hoTen, cv.chucDanh, cv.email, cv.sdt, cv.diaChi, cv.web, cv.tomTat, cv.kyNang, cv.chungChi];
  for (const e of cv.kinhNghiem) parts.push(e.congTy, e.chucVu, e.mota);
  for (const e of cv.hocVan) parts.push(e.truong, e.nganh, e.ghiChu);
  return parts.flatMap((p) => findPlaceholders(p));
}

// Các lỗi/thiếu sót thường gặp, để nhắc người dùng trước khi xuất
export function cvChecks(cv) {
  const out = [];
  const ph = cvPlaceholders(cv);
  if (ph.length) out.push(`Còn ${ph.length} chỗ trống chưa điền, ví dụ ${ph[0]}. Hãy điền số thật của bạn hoặc xóa dòng đó trước khi gửi.`);
  if (!cv.hoTen.trim()) out.push('Chưa có họ tên.');
  if (!cv.email.trim() && !cv.sdt.trim()) out.push('Chưa có email hoặc số điện thoại để nhà tuyển dụng liên hệ.');
  if (cv.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cv.email.trim())) out.push('Email có vẻ chưa đúng định dạng.');
  if (!cv.chucDanh.trim()) out.push('Nên ghi chức danh mục tiêu dưới họ tên (ví dụ: Chuyên viên hành chính).');
  if (!cv.tomTat.trim()) out.push('Nên có 2 đến 3 câu tóm tắt về bạn.');
  if (cv.kinhNghiem.filter((e) => e.congTy.trim() || e.chucVu.trim()).length === 0) out.push('Chưa có kinh nghiệm làm việc (nếu mới ra trường, hãy thêm thực tập, dự án, hoạt động).');
  for (const e of cv.kinhNghiem) {
    if ((e.congTy.trim() || e.chucVu.trim()) && bullets(e.mota).length === 0) { out.push(`Kinh nghiệm "${e.congTy || e.chucVu}" chưa có mô tả thành tích.`); break; }
  }
  if (skillList(cv.kyNang).length === 0) out.push('Chưa có kỹ năng.');
  return out;
}

export function renderCv(cv) {
  const contact = [cv.email, cv.sdt, cv.diaChi, cv.web].map((s) => (s || '').trim()).filter(Boolean);
  const photo = cv.tpl === 'noibat' && cv.anh ? `<img class="cv-photo" src="${esc(cv.anh)}" alt="Ảnh chân dung">` : '';
  const exp = cv.kinhNghiem.filter((e) => e.congTy.trim() || e.chucVu.trim() || e.mota.trim());
  const edu = cv.hocVan.filter((e) => e.truong.trim() || e.nganh.trim());
  const skills = skillList(cv.kyNang);
  const certs = bullets(cv.chungChi);
  const sec = (title, inner) => `<section class="cv-sec"><h2>${esc(title)}</h2>${inner}</section>`;
  const parts = [];
  if (cv.tomTat.trim()) parts.push(sec('Tóm tắt', `<p class="cv-sum">${esc(cv.tomTat.trim()).replace(/\n/g, '<br>')}</p>`));
  if (exp.length) {
    parts.push(sec('Kinh nghiệm làm việc', exp.map((e) => {
      const b = bullets(e.mota);
      return `<div class="cv-item"><div class="cv-row"><div class="cv-t"><strong>${esc(e.chucVu || e.congTy)}</strong>${e.chucVu && e.congTy ? `<span class="cv-at"> · ${esc(e.congTy)}</span>` : ''}</div><div class="cv-d">${esc(period(e.tu, e.den))}</div></div>${b.length ? `<ul>${b.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
    }).join('')));
  }
  if (edu.length) {
    parts.push(sec('Học vấn', edu.map((e) => `<div class="cv-item"><div class="cv-row"><div class="cv-t"><strong>${esc(e.truong)}</strong>${e.nganh ? `<span class="cv-at"> · ${esc(e.nganh)}</span>` : ''}</div><div class="cv-d">${esc(period(e.tu, e.den))}</div></div>${e.ghiChu.trim() ? `<p class="cv-note">${esc(e.ghiChu.trim())}</p>` : ''}</div>`).join('')));
  }
  if (skills.length) parts.push(sec('Kỹ năng', `<ul class="cv-skills">${skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`));
  if (certs.length) parts.push(sec('Chứng chỉ', `<ul>${certs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`));
  const head = `<header class="cv-head">${photo}<div class="cv-id"><h1>${esc(cv.hoTen.trim() || 'Họ và tên')}</h1>${cv.chucDanh.trim() ? `<div class="cv-title">${esc(cv.chucDanh.trim())}</div>` : ''}${contact.length ? `<div class="cv-contact">${contact.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div></header>`;
  return `<article class="cv tpl-${esc(cv.tpl)}" lang="vi">${head}${parts.join('')}</article>`;
}

// Thu nhỏ ảnh chân dung về tối đa 240px (JPEG) để lưu gọn trong máy
export function resizePhoto(file, max = 240) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject(new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = c.height = Math.min(max, side);
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Không đọc được ảnh'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);

  });
}
