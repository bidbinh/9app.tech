// Hợp đồng chủ phủ một đêm của một căn (nhiều nhất một, nhờ ràng buộc EXCLUDE). valid_to là nửa mở.
export async function contractFor(c, unitId, night) {
  const [k] = await c.query(
    `SELECT kind, owner_share_pct, owner_net_floor, cleaning_payer FROM owner_contracts
      WHERE unit_id = $1 AND daterange(valid_from, valid_to) @> $2::date`,
    [unitId, night],
  );
  return k;
}

// Phần chủ của một đêm: theo tỉ lệ nhưng không dưới mức sàn net và không vượt tiền đêm; thuê lại cố định thì 0.
export function ownerShareForNight(amount, contract) {
  if (contract.kind === 'master_lease') return 0;
  const share = Math.floor((amount * contract.owner_share_pct) / 100);
  return Math.min(amount, Math.max(share, Number(contract.owner_net_floor)));
}
