export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// unknown=true: không biết hãng đã nhận lệnh hay chưa (timeout, mất kết nối).
export class CarrierError extends Error {
  constructor(message, { unknown = false, retryable = false } = {}) {
    super(message);
    this.unknown = unknown;
    this.retryable = retryable;
  }
}
