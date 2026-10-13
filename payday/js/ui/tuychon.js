// Áp dụng tùy chọn hiển thị (chữ lớn).
export function apDungTuyChon(st) {
  document.documentElement.classList.toggle('chu-lon', !!st.tuyChon.chuLon);
  const nut = document.getElementById('nut-chu-lon');
  if (nut) nut.setAttribute('aria-pressed', String(!!st.tuyChon.chuLon));
}
