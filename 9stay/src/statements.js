import { AppError } from './errors.js';
import { assertUuid } from './ids.js';
import { isDate } from './time.js';
import { postTransaction, accountBalance } from './ledger.js';

function checkPeriod(from, to) {
  if (!isDate(from) || !isDate(to) || to <= from) throw new AppError('bad_dates', 'Kỳ bản kê không hợp lệ (to phải sau from)');
}

async function requireOwner(c, orgId, ownerId) {
  assertUuid(orgId, 'org');
  assertUuid(ownerId, 'chủ');
  const [o] = await c.query('SELECT id FROM owners WHERE id = $1 AND org_id = $2 FOR UPDATE', [ownerId, orgId]);
  if (!o) throw new AppError('owner_not_found', 'Không tìm thấy chủ phòng', 404);
}

async function requireAgent(c, orgId, agentId) {
  assertUuid(orgId, 'org');
  assertUuid(agentId, 'sale/CTV');
  const [a] = await c.query('SELECT id FROM agents WHERE id = $1 AND org_id = $2 FOR UPDATE', [agentId, orgId]);
  if (!a) throw new AppError('agent_not_found', 'Không tìm thấy sale/CTV', 404);
}

// ---- Bản kê chủ phòng ----

// Xem trước (chưa lưu): các quyết toán có ngày trả phòng trong [from, to) chưa nằm trong bản kê đóng băng nào.
export async function ownerStatement(c, { orgId, ownerId, from, to }) {
  checkPeriod(from, to);
  assertUuid(orgId, 'org');
  assertUuid(ownerId, 'chủ');
  const rows = await c.query(
    `SELECT s.id AS settlement_id, b.code AS booking_code, s.checkout_date, s.room_revenue, s.owner_amount,
            CASE WHEN s.cleaning_payer = 'owner' THEN s.cleaning_fee ELSE 0 END AS cleaning_fee
       FROM settlements s JOIN bookings b ON b.id = s.booking_id
      WHERE s.org_id = $1 AND s.owner_id = $2 AND s.checkout_date >= $3::date AND s.checkout_date < $4::date
        AND NOT EXISTS (SELECT 1 FROM owner_statement_lines l WHERE l.settlement_id = s.id)
      ORDER BY s.checkout_date, b.code`,
    [orgId, ownerId, from, to],
  );
  const lines = rows.map((r) => ({ ...r, amount: r.owner_amount - r.cleaning_fee }));
  const totals = {
    room: lines.reduce((s, l) => s + l.room_revenue, 0),
    owner: lines.reduce((s, l) => s + l.owner_amount, 0),
    cleaning: lines.reduce((s, l) => s + l.cleaning_fee, 0),
  };
  // Bản kê âm trước đó (chủ còn nợ) chưa được mang sang thì mang vào bản kê này, đúng một lần.
  const carries = await c.query(
    `SELECT s.id, s.payable FROM owner_statements s
      WHERE s.org_id = $1 AND s.owner_id = $2 AND s.payable < 0
        AND NOT EXISTS (SELECT 1 FROM owner_statement_carries x WHERE x.from_statement_id = s.id)
      ORDER BY s.frozen_at, s.id`,
    [orgId, ownerId],
  );
  totals.carried = carries.reduce((s, x) => s + x.payable, 0);
  totals.payable = totals.owner - totals.cleaning + totals.carried;
  return { lines, totals, carries };
}

// Đóng băng bản kê: khóa chủ phòng để hai lần đóng băng đồng thời không nhặt trùng quyết toán.
export async function freezeOwnerStatement(c, { orgId, ownerId, from, to, by = null }) {
  await requireOwner(c, orgId, ownerId);
  const { lines, totals, carries } = await ownerStatement(c, { orgId, ownerId, from, to });
  if (!lines.length) throw new AppError('empty_statement', 'Kỳ này không có quyết toán mới để đưa vào bản kê', 409);
  const [st] = await c.query(
    `INSERT INTO owner_statements(org_id, owner_id, period_start, period_end, total_room, total_owner, total_cleaning, total_carried, payable, line_count, frozen_by)
     VALUES($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [orgId, ownerId, from, to, totals.room, totals.owner, totals.cleaning, totals.carried, totals.payable, lines.length, by],
  );
  for (const x of carries) {
    await c.query('INSERT INTO owner_statement_carries(from_statement_id, into_statement_id, amount) VALUES($1, $2, $3)', [x.id, st.id, x.payable]);
  }
  for (const l of lines) {
    await c.query(
      `INSERT INTO owner_statement_lines(org_id, statement_id, settlement_id, booking_code, checkout_date, room_revenue, owner_amount, cleaning_fee, amount)
       VALUES($1, $2, $3, $4, $5::date, $6, $7, $8, $9)`,
      [orgId, st.id, l.settlement_id, l.booking_code, l.checkout_date, l.room_revenue, l.owner_amount, l.cleaning_fee, l.amount],
    );
  }
  return { id: st.id, lineCount: lines.length, ...totals };
}

// Chi trả chủ theo bản kê: nợ held_for_owner, có bank. Mỗi bản kê chỉ trả một lần; bản kê âm (chủ nợ) không chi được.
export async function recordOwnerPayout(c, { orgId, statementId, paidOn, ref, by = null }) {
  assertUuid(orgId, 'org');
  assertUuid(statementId, 'bản kê');
  if (!isDate(paidOn)) throw new AppError('bad_dates', 'Ngày chi không hợp lệ');
  if (typeof ref !== 'string' || !ref) throw new AppError('bad_payment', 'Thiếu mã tham chiếu');
  const [st] = await c.query('SELECT id, owner_id, payable FROM owner_statements WHERE id = $1 AND org_id = $2 FOR SHARE', [statementId, orgId]);
  if (!st) throw new AppError('statement_not_found', 'Không tìm thấy bản kê', 404);
  await c.query('SELECT 1 FROM owners WHERE id = $1 FOR UPDATE', [st.owner_id]); // tuần tự hóa các lần chi cho cùng chủ
  const [dup] = await c.query('SELECT id FROM owner_payouts WHERE statement_id = $1', [statementId]);
  if (dup) return { payoutId: dup.id, amount: st.payable, created: false };
  if (st.payable <= 0) throw new AppError('nothing_to_pay', 'Bản kê không có khoản nào để chi', 409, { payable: st.payable });
  const tx = await postTransaction(c, {
    orgId, kind: 'owner_payout', ref: 'owner-payout:' + ref,
    entries: [{ account: 'held_for_owner', partyId: st.owner_id, amount: st.payable }, { account: 'bank', amount: -st.payable }],
  });
  if (!tx.created) throw new AppError('ref_conflict', 'Mã tham chiếu này đã dùng cho một giao dịch khác', 409);
  const [p] = await c.query(
    'INSERT INTO owner_payouts(org_id, statement_id, amount, paid_on, paid_by, ledger_tx_id) VALUES($1, $2, $3, $4::date, $5, $6) RETURNING id',
    [orgId, statementId, st.payable, paidOn, by, tx.id],
  );
  return { payoutId: p.id, amount: st.payable, created: true };
}

// ---- Bản kê hoa hồng ----

export async function agentStatement(c, { orgId, agentId, from, to }) {
  checkPeriod(from, to);
  assertUuid(orgId, 'org');
  assertUuid(agentId, 'sale/CTV');
  const rows = await c.query(
    `SELECT s.id AS settlement_id, b.code AS booking_code, s.checkout_date, s.room_revenue, s.commission AS amount
       FROM settlements s JOIN bookings b ON b.id = s.booking_id
      WHERE s.org_id = $1 AND s.agent_id = $2 AND s.commission > 0 AND s.checkout_date >= $3::date AND s.checkout_date < $4::date
        AND NOT EXISTS (SELECT 1 FROM agent_statement_lines l WHERE l.settlement_id = s.id)
      ORDER BY s.checkout_date, b.code`,
    [orgId, agentId, from, to],
  );
  const totals = { room: rows.reduce((s, l) => s + l.room_revenue, 0), payable: rows.reduce((s, l) => s + l.amount, 0) };
  return { lines: rows, totals };
}

export async function freezeAgentStatement(c, { orgId, agentId, from, to, by = null }) {
  await requireAgent(c, orgId, agentId);
  const { lines, totals } = await agentStatement(c, { orgId, agentId, from, to });
  if (!lines.length) throw new AppError('empty_statement', 'Kỳ này không có hoa hồng mới để đưa vào bản kê', 409);
  const [st] = await c.query(
    `INSERT INTO agent_statements(org_id, agent_id, period_start, period_end, total_room, payable, line_count, frozen_by)
     VALUES($1, $2, $3::date, $4::date, $5, $6, $7, $8) RETURNING id`,
    [orgId, agentId, from, to, totals.room, totals.payable, lines.length, by],
  );
  for (const l of lines) {
    await c.query(
      `INSERT INTO agent_statement_lines(org_id, statement_id, settlement_id, booking_code, checkout_date, room_revenue, amount)
       VALUES($1, $2, $3, $4, $5::date, $6, $7)`,
      [orgId, st.id, l.settlement_id, l.booking_code, l.checkout_date, l.room_revenue, l.amount],
    );
  }
  return { id: st.id, lineCount: lines.length, ...totals };
}

export async function recordAgentPayout(c, { orgId, statementId, paidOn, ref, by = null }) {
  assertUuid(orgId, 'org');
  assertUuid(statementId, 'bản kê');
  if (!isDate(paidOn)) throw new AppError('bad_dates', 'Ngày chi không hợp lệ');
  if (typeof ref !== 'string' || !ref) throw new AppError('bad_payment', 'Thiếu mã tham chiếu');
  const [st] = await c.query('SELECT id, agent_id, payable FROM agent_statements WHERE id = $1 AND org_id = $2 FOR SHARE', [statementId, orgId]);
  if (!st) throw new AppError('statement_not_found', 'Không tìm thấy bản kê', 404);
  await c.query('SELECT 1 FROM agents WHERE id = $1 FOR UPDATE', [st.agent_id]);
  const [dup] = await c.query('SELECT id FROM agent_payouts WHERE statement_id = $1', [statementId]);
  if (dup) return { payoutId: dup.id, amount: st.payable, created: false };
  const tx = await postTransaction(c, {
    orgId, kind: 'agent_payout', ref: 'agent-payout:' + ref,
    entries: [{ account: 'agent_commission_payable', partyId: st.agent_id, amount: st.payable }, { account: 'bank', amount: -st.payable }],
  });
  if (!tx.created) throw new AppError('ref_conflict', 'Mã tham chiếu này đã dùng cho một giao dịch khác', 409);
  const [p] = await c.query(
    'INSERT INTO agent_payouts(org_id, statement_id, amount, paid_on, paid_by, ledger_tx_id) VALUES($1, $2, $3, $4::date, $5, $6) RETURNING id',
    [orgId, statementId, st.payable, paidOn, by, tx.id],
  );
  return { payoutId: p.id, amount: st.payable, created: true };
}

// ---- CSV ----

// Ô bắt đầu (sau khoảng trắng/ký tự điều khiển) bằng = + - @ | hoặc bắt đầu bằng tab/CR bị bảng tính hiểu là công thức.
const FORMULA_START = new RegExp('^[\\s\\u0000-\\u001f\\u2028\\u2029]*[=+\\-@|]|^[\\t\\r]');

// Thuần. Ô chuỗi bắt đầu bằng = + - @ hoặc tab/CR được thêm dấu ' phía trước để bảng tính không hiểu là công thức.
export function toCsv(rows, columns, { bom = false } = {}) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && FORMULA_START.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const out = [columns.map((col) => cell(col.header)).join(',')];
  for (const r of rows) out.push(columns.map((col) => cell(r[col.key])).join(','));
  return (bom ? '﻿' : '') + out.join('\r\n') + '\r\n';
}

const OWNER_COLS = [
  { key: 'booking_code', header: 'Mã đơn' }, { key: 'checkout_date', header: 'Ngày trả phòng' }, { key: 'room_revenue', header: 'Doanh thu phòng' },
  { key: 'owner_amount', header: 'Phần chủ' }, { key: 'cleaning_fee', header: 'Phí dọn trừ' }, { key: 'amount', header: 'Thực nhận' },
];
const AGENT_COLS = [
  { key: 'booking_code', header: 'Mã đơn' }, { key: 'checkout_date', header: 'Ngày trả phòng' }, { key: 'room_revenue', header: 'Doanh thu phòng' }, { key: 'amount', header: 'Hoa hồng' },
];

// CSV của bản kê ĐÃ đóng băng, thêm dòng tổng ở cuối.
export async function statementCsv(c, { orgId, kind, statementId, bom = false }) {
  assertUuid(orgId, 'org');
  assertUuid(statementId, 'bản kê');
  if (kind === 'owner') {
    const [st] = await c.query('SELECT id, total_room, total_owner, total_cleaning, total_carried, payable FROM owner_statements WHERE id = $1 AND org_id = $2', [statementId, orgId]);
    if (!st) throw new AppError('statement_not_found', 'Không tìm thấy bản kê', 404);
    const lines = await c.query('SELECT booking_code, checkout_date, room_revenue, owner_amount, cleaning_fee, amount FROM owner_statement_lines WHERE statement_id = $1 ORDER BY checkout_date, booking_code', [statementId]);
    if (st.total_carried !== 0) lines.push({ booking_code: 'CHUYỂN KỲ TRƯỚC', checkout_date: null, room_revenue: null, owner_amount: null, cleaning_fee: null, amount: st.total_carried });
    lines.push({ booking_code: 'TỔNG', checkout_date: null, room_revenue: st.total_room, owner_amount: st.total_owner, cleaning_fee: st.total_cleaning, amount: st.payable });
    return toCsv(lines, OWNER_COLS, { bom });
  }
  if (kind === 'agent') {
    const [st] = await c.query('SELECT id, total_room, payable FROM agent_statements WHERE id = $1 AND org_id = $2', [statementId, orgId]);
    if (!st) throw new AppError('statement_not_found', 'Không tìm thấy bản kê', 404);
    const lines = await c.query('SELECT booking_code, checkout_date, room_revenue, amount FROM agent_statement_lines WHERE statement_id = $1 ORDER BY checkout_date, booking_code', [statementId]);
    lines.push({ booking_code: 'TỔNG', checkout_date: null, room_revenue: st.total_room, amount: st.payable });
    return toCsv(lines, AGENT_COLS, { bom });
  }
  throw new AppError('bad_kind', 'Loại bản kê không hợp lệ');
}

// Báo cáo tiền giữ hộ: số dư từng chủ (âm = Anstay còn nợ chủ), tổng, và các tài khoản liên quan để đối chiếu với số dư ngân hàng thật.
export async function custodyReport(c, { orgId }) {
  assertUuid(orgId, 'org');
  const owners = await c.query(
    `SELECT o.id AS owner_id, o.name, COALESCE(SUM(e.amount), 0)::bigint AS balance
       FROM owners o LEFT JOIN ledger_entries e ON e.party_id = o.id AND e.account = 'held_for_owner' AND e.org_id = o.org_id
      WHERE o.org_id = $1 GROUP BY o.id, o.name ORDER BY o.name`,
    [orgId],
  );
  const bal = (account) => accountBalance(c, { orgId, account });
  const neg = (n) => (n === 0 ? 0 : -n); // tránh -0
  const owedToOwners = owners.reduce((s, o) => s + Math.max(0, -o.balance), 0);
  return {
    owners: owners.map((o) => ({ ownerId: o.owner_id, name: o.name, owed: neg(o.balance) })),
    owedToOwners,
    bank: await bal('bank'),
    guestDeposits: neg(await bal('guest_deposit_liability')),
    vatPayable: neg(await bal('vat_payable')),
    agentCommissionPayable: neg(await bal('agent_commission_payable')),
    cleaningPayable: neg(await bal('cleaning_payable')),
  };
}
