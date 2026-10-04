// Sổ học phí: máy chủ tự tính mọi con số từ buổi học, khoản thu và khoản đã thu.
// còn nợ = Σ học phí các buổi tính phí + Σ khoản thu (tháng, gói, khác) − Σ đã thu. Âm = trả trước.
// Gói N buổi: buổi còn lại = Σ buổi của các gói đã bán − số buổi tính theo gói đã dạy (hoặc học sinh nghỉ có tính).

export const BILLED = `(l.status = 'da_day' OR (l.status = 'hs_nghi' AND l.billable))`;

// Trả Map studentId -> số liệu. ids: mảng id học sinh (đã thuộc gia sư) hoặc null cho tất cả của gia sư.
export async function balances(q, tutorId, ids = null) {
  const rows = await q(
    `SELECT s.id,
        COALESCE((SELECT sum(l.fee) FROM lessons l WHERE l.student_id = s.id AND ${BILLED}), 0)::bigint AS lesson_fees,
        COALESCE((SELECT sum(c.amount) FROM charges c WHERE c.student_id = s.id), 0)::bigint AS charged,
        COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.student_id = s.id), 0)::bigint AS paid,
        COALESCE((SELECT sum(c.sessions) FROM charges c WHERE c.student_id = s.id AND c.kind = 'goi'), 0)::int AS pkg_bought,
        (SELECT count(*) FROM lessons l WHERE l.student_id = s.id AND l.billing = 'goi' AND ${BILLED})::int AS pkg_used,
        (SELECT count(*) FROM lessons l WHERE l.student_id = s.id AND l.status = 'da_day')::int AS taught
       FROM students s WHERE s.tutor_id = $1 AND ($2::uuid[] IS NULL OR s.id = ANY($2::uuid[]))`, [tutorId, ids]);
  const out = new Map();
  for (const r of rows) {
    const total = r.lesson_fees + r.charged;
    out.set(r.id, {
      total, paid: r.paid, balance: total - r.paid,
      pkgLeft: r.pkg_bought - r.pkg_used, pkgBought: r.pkg_bought, taught: r.taught,
    });
  }
  return out;
}

// Học phí của một buổi theo mô hình của học sinh tại thời điểm điểm danh
export function feeFor(student, override) {
  if (student.fee_model === 'buoi') return { billing: 'buoi', fee: override ?? student.fee_amount };
  return { billing: student.fee_model, fee: 0 };
}
