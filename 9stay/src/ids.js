import { AppError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

// Id sai định dạng bị từ chối sớm (400), không để PostgreSQL ném lỗi 22P02 thô.
export function assertUuid(v, label = 'id') {
  if (!isUuid(v)) throw new AppError('bad_id', `Mã ${label} không hợp lệ`);
  return v;
}
