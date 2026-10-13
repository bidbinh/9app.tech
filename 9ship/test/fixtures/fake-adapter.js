// Adapter giả dùng để kiểm thử cơ chế nạp CARRIER_MODULES.
export default function create() {
  return [{
    id: 'ext-demo', name: 'Ngoài demo',
    capabilities: { dropoff: true, pickup: false, findByReference: false, webhook: false, officeList: false, labelNative: false, idempotentCreate: false },
    async quote() { return []; },
    async createShipment() { throw new Error('không dùng'); },
    async cancel() { return { status: 'rejected' }; },
    async track() { return []; },
    async listPickupPoints() { return []; },
  }];
}
