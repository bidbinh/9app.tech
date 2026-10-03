# Giao thức quản trị app (v1)

Mỗi app mở `/<base>/admin-api/v1/*` **chỉ cho mạng nội bộ** (nginx phải chặn từ internet). Mọi yêu cầu ký HMAC-SHA256.

## Xác thực
Header: `X-Console-Key` (mã khóa), `X-Console-Ts` (giây UNIX, lệch tối đa ±120s), `X-Console-Sig` = hex HMAC-SHA256(secret, chuỗi).
Chuỗi ký: `ts \n METHOD \n đường-dẫn-đầy-đủ+query \n sha256hex(body)` (body rỗng với GET). Yêu cầu POST không được phát lại (cùng chữ ký bị từ chối).
Sai khóa/chữ ký/giờ → 401; chưa cấu hình bí mật → 404.

## Điểm cuối
| Phương thức | Đường dẫn | Nội dung |
|---|---|---|
| GET | `/manifest` | `{app:{id,name,version}, capabilities:['users','money','panels'], currency, adminUrl?}` |
| GET | `/health` | `{ok, details}` |
| GET | `/summary` | `{kpis:[{id,label,value,format:text|int|money,hint?,tone?:ok|warn|bad|info}], alerts:[{level,text,panel?}]}` |
| GET | `/users?after&limit` | `{items:[{id,name,phone,createdAt,status?,extra?}], next, hasMore}` — con trỏ theo id tăng dần |
| GET | `/users/{id}` | `{fields:[{label,value,format?}], ...}` chi tiết trực tiếp |
| GET | `/cash?after&limit` | `{items:[{id,at,kind,amount,category,description,ref,phone}], next, hasMore}` |
| GET | `/balances` | `{items:[{id,label,amount,kind:cash|customer_funds|receivable}]}` |
| GET | `/panels`, `/panels/{id}?page&q` | khai báo bảng (cột, hành động theo dòng) và dữ liệu |
| POST | `/actions/{id}` | `{panel,rowId,inputs}` → `{ok,message}`; lỗi nghiệp vụ trả `ok:false`, không trả 5xx |

`cash.kind`: `cash_in`/`cash_out` (tiền vào/ra tài khoản ngân hàng), `revenue`/`expense` (doanh thu/chi phí). `amount` luôn là số nguyên dương (đồng).
**Tiền khách giữ hộ không phải doanh thu**: app báo ở `/balances` với `kind: customer_funds`.
Cổng kiểm tra mọi phản hồi theo `9admin/src/contract.js` và coi dữ liệu app là không tin cậy. Mẫu triển khai: `9ship/src/console-api.js`.
