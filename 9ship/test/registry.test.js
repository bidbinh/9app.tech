import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as registry from '../src/carriers/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
after(() => registry.initDefault());

test('nạp adapter ngoài từ CARRIER_MODULES bằng đường dẫn tuyệt đối', async () => {
  const ids = await registry.loadExternal(path.join(here, 'fixtures', 'fake-adapter.js'));
  assert.deepEqual(ids, ['ext-demo']);
  assert.ok(registry.get('ext-demo'));
});

test('adapter thiếu phương thức bắt buộc bị từ chối ngay lúc nạp', async () => {
  await assert.rejects(registry.loadExternal(path.join(here, 'fixtures', 'bad-adapter.js')), /thiếu/);
});

test('mã vận đơn mock duy nhất giữa các lần tạo', async () => {
  const a = registry.get('mock-nhanh');
  const codes = new Set();
  for (let i = 0; i < 5; i++) codes.add((await a.createShipment({ ref: 'uniq-' + i + '-' + Date.now(), expectedFee: 1 })).carrierCode);
  assert.equal(codes.size, 5);
});
