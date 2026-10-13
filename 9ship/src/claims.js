import { query, tx } from './db.js';
import { ApiError } from './errors.js';
import * as ledger from './ledger.js';

export const KINDS = ['lost', 'damaged', 'late', 'other'];
export const CLAIM_WINDOW_DAYS = Number.parseInt(process.env.CLAIM_WINDOW_DAYS || '30', 10);

const view = (c) => ({
  id: c.id, shipmentId: c.shipment_id, kind: c.kind, status: c.status, description: c.description,
  deadline: c.deadline, evidence: c.evidence, createdAt: c.created_at, updatedAt: c.updated_at,
});

function cleanEvidence(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 10) throw new ApiError(400, 'invalid_request', 'Chứng cứ tối đa 10 mục', { field: 'evidence' });
  return list.map((e) => {
    const type = e && e.type === 'url' ? 'url' : 'text';
    const value = String((e && e.value) || '').trim().slice(0, 500);
    if (!value) throw new ApiError(400, 'invalid_request', 'Chứng cứ trống', { field: 'evidence' });
    if (type === 'url' && !/^https?:\/\//i.test(value)) throw new ApiError(400, 'invalid_request', 'Liên kết chứng cứ phải bắt đầu bằng http(s)', { field: 'evidence' });
    return { type, value };
  });
}

export async function create(userId, { shipmentId, kind, description, evidence }) {
  if (!KINDS.includes(kind)) throw new ApiError(400, 'invalid_request', 'Loại khiếu nại không hợp lệ', { field: 'kind' });
  const desc = String(description || '').trim();
  if (desc.length < 5 || desc.length > 2000) throw new ApiError(400, 'invalid_request', 'Mô tả cần 5-2000 ký tự', { field: 'description' });
  if (!/^[0-9a-f-]{36}$/.test(String(shipmentId))) throw new ApiError(404, 'not_found', 'Không tìm thấy đơn');
  const sh = (await query('SELECT * FROM shipments WHERE id=$1 AND user_id=$2', [shipmentId, userId]))[0];
  if (!sh) throw new ApiError(404, 'not_found', 'Không tìm thấy đơn');
  if (!sh.tracking_code) throw new ApiError(409, 'not_eligible', 'Đơn chưa được hãng nhận nên chưa thể khiếu nại');
  const open = await query("SELECT 1 FROM claims WHERE shipment_id=$1 AND kind=$2 AND status IN ('received','forwarded')", [shipmentId, kind]);
  if (open.length) throw new ApiError(409, 'duplicate_claim', 'Đã có khiếu nại cùng loại đang xử lý cho đơn này');
  const base = sh.closed_at || sh.created_at;
  const deadline = new Date(new Date(base).getTime() + CLAIM_WINDOW_DAYS * 86400_000);
  // chứng cứ bàn giao tự động: mã đơn và hành trình tại thời điểm khiếu nại
  const events = await query('SELECT status, note, event_at FROM tracking_events WHERE shipment_id=$1 ORDER BY event_at, id', [shipmentId]);
  const auto = [{ type: 'system', value: `Mã vận đơn ${sh.tracking_code} (${sh.carrier}); trạng thái ${sh.shipping_status}; ${events.length} sự kiện hành trình` }];
  const r = await query(
    'INSERT INTO claims(shipment_id, user_id, kind, description, deadline, evidence) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [shipmentId, userId, kind, desc, deadline, JSON.stringify([...auto, ...cleanEvidence(evidence)])]);
  return view(r[0]);
}

export async function list(userId) {
  return (await query('SELECT * FROM claims WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [userId])).map(view);
}

// ---- quản trị ----
export async function adminList(status = null) {
  const rows = status
    ? await query('SELECT * FROM claims WHERE status=$1 ORDER BY deadline LIMIT 200', [status])
    : await query('SELECT * FROM claims ORDER BY created_at DESC LIMIT 200');
  return rows.map((c) => ({ ...view(c), userId: c.user_id, partnerRef: c.partner_ref }));
}

const TRANSITIONS = { received: ['forwarded', 'rejected', 'resolved'], forwarded: ['resolved', 'rejected'] };

export async function adminUpdate(id, { status, partnerRef, compensation = 0, note = '' }) {
  return tx(async (c) => {
    const rows = await c.query('SELECT * FROM claims WHERE id=$1 FOR UPDATE', [id]);
    const cl = rows[0];
    if (!cl) throw new ApiError(404, 'not_found', 'Không có khiếu nại');
    if (!(TRANSITIONS[cl.status] || []).includes(status)) {
      throw new ApiError(409, 'invalid_transition', `Không thể chuyển từ ${cl.status} sang ${status}`);
    }
    if (compensation && status !== 'resolved') throw new ApiError(400, 'invalid_request', 'Chỉ ghi bồi thường khi giải quyết xong');
    if (compensation) {
      if (!Number.isSafeInteger(compensation) || compensation <= 0) throw new ApiError(400, 'invalid_request', 'Số tiền bồi thường không hợp lệ');
      // bồi thường chỉ ghi khi tiền thực nhận từ đối tác: Nợ ký quỹ (hãng hoàn), Có ví người gửi
      const walletId = await ledger.lockWallet(c, cl.user_id);
      const deposit = await ledger.systemAccount(c, 'aggregator_deposit');
      await ledger.post(c, {
        kind: 'compensation', idemScope: 'claim-comp', idemKey: String(cl.id), shipmentId: cl.shipment_id, payload: { compensation },
        entries: [{ accountId: deposit, amount: compensation }, { accountId: walletId, amount: -compensation }],
      });
    }
    const upd = await c.query(
      `UPDATE claims SET status=$2, partner_ref=COALESCE($3, partner_ref),
         evidence = evidence || $4::jsonb, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, status, partnerRef || null, JSON.stringify(note ? [{ type: 'note', value: note }] : [])]);
    return view(upd[0]);
  });
}
