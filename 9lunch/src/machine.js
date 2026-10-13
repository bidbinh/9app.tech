// Quy tắc chuyển trạng thái bữa ăn
export const STATUSES = ['binh_chon', 'dat_mon', 'thanh_toan', 'xong', 'huy'];
export const STATUS_LABEL = { binh_chon: 'Chọn quán', dat_mon: 'Đặt món', thanh_toan: 'Trả tiền', xong: 'Đã xong', huy: 'Đã hủy' };

const NEXT = {
  binh_chon: ['dat_mon', 'huy'],
  dat_mon: ['thanh_toan', 'binh_chon', 'huy'], // binh_chon = đổi quán (chỉ khi chưa ai gọi món)
  thanh_toan: ['xong', 'dat_mon'], // dat_mon = quay lại sửa (chỉ khi chưa ai báo đã chuyển)
  xong: [],
  huy: [],
};

export const canTransition = (from, to) => (NEXT[from] || []).includes(to);
export const isActive = (s) => s === 'binh_chon' || s === 'dat_mon' || s === 'thanh_toan';
