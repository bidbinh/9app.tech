import test from 'node:test';
import assert from 'node:assert/strict';
import { kho, khoiDong, luuXe, luuNhatKy, luuHen, xoaSach } from '../js/lib/data.js';

const ANH = 'data:image/png;base64,iVBORw0KGgo=';

// createSync giữ getData/setData bên trong; kiểm qua một vòng đồng bộ với máy chủ giả
function chayVoiMayChu(remoteData) {
  const mc = { version: remoteData ? 1 : 0, data: remoteData, put: null };
  const fetchFn = async (url, opt) => {
    if (opt.method === 'GET') return { ok: true, status: 200, json: async () => ({ version: mc.version, data: mc.data }) };
    mc.put = JSON.parse(opt.body); mc.version++; mc.data = mc.put.data;
    return { ok: true, status: 200, json: async () => ({ version: mc.version }) };
  };
  return { mc, fetchFn };
}

test('đồng bộ không đẩy ảnh xe lên máy chủ và không làm mất ảnh sẵn có trên máy', async () => {
  await khoiDong(); await xoaSach();
  await luuXe({ id: 'x1', ten: 'Xe A', loai: 'oto', anh: ANH, tao: '2026-01-01T00:00:00.000Z' });
  await luuNhatKy({ id: 'n1', xeId: 'x1', loai: 'khac', ngay: '2026-10-01', tien: 5 }, '2026-10-14');
  await luuHen({ id: 'h1', xeId: 'x1', kind: 'khac', ten: 'Nhắc A', han: '2026-12-01' });
  // máy khác đã có xe x1 (không ảnh) và thêm nhật ký n2, đã xóa hẹn h1
  const remote = { xe: [{ id: 'x1', ten: 'Xe A', loai: 'oto', tao: '2026-01-01T00:00:00.000Z' }], nhatKy: [{ id: 'n1', xeId: 'x1', loai: 'khac', ngay: '2026-10-01', tien: 5 }, { id: 'n2', xeId: 'x1', loai: 'khac', ngay: '2026-10-02', tien: 7 }], hen: [] };
  const { mc, fetchFn } = chayVoiMayChu(remote);
  const ls = new Map();
  // dùng đúng bộ đồng bộ của app (js/lib/dongbo.js), thay fetch/localStorage toàn cục chỉ trong vòng chạy này
  const gf = globalThis.fetch, gl = globalThis.localStorage;
  globalThis.fetch = fetchFn;
  globalThis.localStorage = { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v), removeItem: (k) => ls.delete(k) };
  try {
    const { dongBo } = await import('../js/lib/dongbo.js');
    const r = await dongBo.run();
    assert.equal(r.changedLocal, true);
  } finally { globalThis.fetch = gf; if (gl === undefined) delete globalThis.localStorage; else globalThis.localStorage = gl; }
  assert.ok(!JSON.stringify(mc.put.data).includes('base64'), 'ảnh không được gửi lên');
  assert.deepEqual(kho.nhatKy.map((x) => x.id).sort(), ['n1', 'n2']);
  assert.equal(kho.xe[0].anh, ANH, 'ảnh trên máy được giữ');
  assert.equal(kho.hen.length, 1, 'lần đầu (chưa có ảnh chụp cũ) không suy ra việc xóa: hẹn h1 ở lại và được đẩy lên');
});
