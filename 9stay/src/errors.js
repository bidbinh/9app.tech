// Lỗi nghiệp vụ: code (snake_case, tiếng Anh) cho máy, message (tiếng Việt) cho người, detail cho thông tin thêm (chỉ id và ngày).
export class AppError extends Error {
  constructor(code, message, status = 400, detail = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
