// Đổi người ứng tiền sau khi bữa đã sang bước thu tiền: lập kế hoạch cho từng khoản. Hàm thuần.
//
// Quy tắc (xem docs/superpowers/specs/2026-10-04-9lunch-design.md mục "Đổi người ứng tiền"):
//  - Khoản chưa trả còn nợ người ứng tiền cũ: chuyển sang người ứng tiền mới, phát hành lại QR (qr_gen + 1).
//    Riêng khoản của chính người ứng tiền mới thì tự thanh toán (không ai nợ chính mình).
//  - Phần ăn của người ứng tiền cũ (đang tự thanh toán): trở thành khoản chưa trả, nợ người ứng tiền mới.
//  - Khoản đã báo "Tôi đã chuyển" và khoản đã nhận: giữ nguyên người nhận cũ (tiền có thể đã tới người cũ).
//  - Khoản chưa trả nhưng đang nợ một người khác (do "Chưa thấy" của người nhận cũ hơn): giữ nguyên.
//
// charges: [{ id, memberId, payeeId, status, amount }]
// trả về [{ id, action: 'keep' | 'retarget' | 'self' | 'owe_new' }]
export function planPayerChange(charges, oldPayerId, newPayerId) {
  return charges.map((c) => {
    if (oldPayerId === newPayerId) return { id: c.id, action: 'keep' };
    const isSelf = c.memberId === c.payeeId;
    if (isSelf && c.payeeId === oldPayerId) {
      // phần của người ứng tiền cũ
      return { id: c.id, action: c.amount > 0 ? 'owe_new' : 'keep' };
    }
    if (c.status === 'chua_tra' && c.payeeId === oldPayerId) {
      return { id: c.id, action: c.memberId === newPayerId ? 'self' : 'retarget' };
    }
    return { id: c.id, action: 'keep' };
  });
}
