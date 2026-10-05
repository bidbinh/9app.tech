// Biểu tượng nét mảnh (tự vẽ, cùng nét với launcher). Chuỗi tĩnh.
const W = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
export const IC = {
  sapToi: W('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13.5v3.5l2.2 1.2"/>'),
  le: W('<path d="M6 3.5h9.5a2.5 2.5 0 0 1 2.5 2.5v14l-3-1.7-3 1.7-3-1.7-3 1.7V6a2.5 2.5 0 0 1 2.5-2.5z"/><path d="M9 8.5h6M9 12h6"/>'),
  ban: W('<circle cx="9" cy="8.5" r="3.3"/><path d="M3 20c.4-3.6 2.8-5.5 6-5.5s5.6 1.9 6 5.5"/><path d="M16.5 5.5a3 3 0 0 1 0 6M18.5 14.8c1.5.7 2.4 2.3 2.7 4.7"/>'),
  qua: W('<rect x="4" y="9.5" width="16" height="10.5" rx="2.2"/><rect x="3" y="6.5" width="18" height="3.5" rx="1.5"/><path d="M12 6.5V20M12 6.5c-1-3.2-5-3.4-5-1.2 0 1.6 3 1.2 5 1.2zM12 6.5c1-3.2 5-3.4 5-1.2 0 1.6-3 1.2-5 1.2z"/>'),
  them: W('<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>'),
  mic: W('<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  cong: W('<path d="M12 5v14M5 12h14"/>'),
  phai: W('<path d="M9 5l7 7-7 7"/>'),
  goi: W('<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z"/>'),
  xoa: W('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>'),
  sua: W('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>'),
  chia: W('<circle cx="6" cy="12" r="2.4"/><circle cx="17.5" cy="6" r="2.4"/><circle cx="17.5" cy="18" r="2.4"/><path d="M8.2 10.8l7.2-3.6M8.2 13.2l7.2 3.6"/>'),
  chep: W('<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2A2.2 2.2 0 0 0 13.3 4H6.2A2.2 2.2 0 0 0 4 6.2v7.1a2.2 2.2 0 0 0 2.2 2.2h2.3"/>'),
};
