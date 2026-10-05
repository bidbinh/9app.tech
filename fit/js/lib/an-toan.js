// Chính sách an toàn theo kết quả sàng lọc. Thuần hàm.
// Mức: 'chua' (chưa sàng lọc), 'duoc-phep', 'hoi-bac-si' (nên hỏi bác sĩ, chỉ tập nhẹ), 'dung-lai' (không tập theo chương trình).
export const laBaiHanChe = (ex) => !!ex && (ex.mucDo >= 3 || ex.loai === 'bat-nhay');

/** Có được thêm/tập bài này vào buổi không. */
export function choPhepBai(muc, ex) {
  if (muc === 'dung-lai') return { ok: false, ly: 'Theo kết quả sàng lọc, bạn nên hỏi bác sĩ hoặc huấn luyện viên trước khi tập. Bạn vẫn xem được thư viện.' };
  if ((muc === 'chua' || muc === 'hoi-bac-si') && laBaiHanChe(ex)) {
    return { ok: false, ly: muc === 'chua' ? 'Bài khó hoặc bật nhảy cần làm sàng lọc sức khỏe trước.' : 'Theo kết quả sàng lọc, bạn nên chỉ tập nhẹ: chưa nên làm bài khó hoặc bật nhảy.' };
  }
  return { ok: true, ly: '' };
}

/** Có được áp/chạy chương trình này không. */
export function choPhepChuongTrinh(muc, ct, baiMap) {
  if (muc === 'duoc-phep') return true;
  if (muc === 'hoi-bac-si') return ct.phien.every((p) => p.bai.every(([id]) => !laBaiHanChe(baiMap.get(id))));
  return false;
}

/** Bài kiểm tra thể lực tối đa chỉ khi đã sàng lọc đạt (hoặc không nặng). */
export function choPhepTest(muc, baiTest) {
  if (muc === 'dung-lai') return false;
  if (baiTest.nang) return muc === 'duoc-phep';
  return true;
}

/** Bài nền cho bài khó / đơn chân / bật nhảy: cảnh báo mềm nếu nhật ký chưa có bài nền. */
export const BAI_NEN = {
  'nordic-ho-tro': 'cau-mong-1-chan', 'kep-dui-copenhagen': 'plank-nghieng', 'rdl-1-chan': 'rdl-ta-don', 'squat-bulgaria': 'squat-tach-chan',
  'squat-1-chan-ghe': 'squat-cham-ghe', 'nhay-1-chan': 'tiep-dat-em', 'nhay-xa': 'tiep-dat-em', 'nhay-ngang': 'tiep-dat-em', 'squat-nhay': 'tiep-dat-em',
  'bat-cao': 'tiep-dat-em', 'bat-len-bac': 'tiep-dat-em', 'nhay-tach-chan': 'lunge-lui', 'hit-dat-vo-tay': 'hit-dat', 'ta-am-vung': 'deadlift-ta-am',
  'hit-dat-kim-cuong': 'hit-dat', 'hit-dat-pike': 'hit-dat', 'hollow-hold': 'dead-bug', 'chay-5-10-5': 'truot-ngang',
};
/** Trả về id bài nền còn thiếu trong nhật ký, hoặc null. buoi: danh sách buổi đã lưu. */
export function thieuBaiNen(exId, buoi) {
  const nen = BAI_NEN[exId];
  if (!nen) return null;
  const co = (buoi || []).some((b) => (b.bai || []).some((e) => e && e.ex === nen && Array.isArray(e.sets) && e.sets.length));
  return co ? null : nen;
}
