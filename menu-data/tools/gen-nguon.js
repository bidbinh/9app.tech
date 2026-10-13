// Sinh docs/NGUON.md từ data/sources.json, data/dishes.json và tools/audit-table.js. Chạy: node tools/gen-nguon.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { AUDIT } from './audit-table.js';

const root = new URL('../', import.meta.url);
const rd = (f) => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const reg = rd('data/sources.json').sources;
const dishes = rd('data/dishes.json').items;

const used = new Map(); // url -> số món tham chiếu
for (const d of dishes) for (const s of d.sources) used.set(s.url, (used.get(s.url) || 0) + 1);
const seasonal = rd('data/seasonal.json');
for (const s of seasonal.sources) used.set(s.url, (used.get(s.url) || 0) + 1);

const groups = { health: 'Y tế, dinh dưỡng', season: 'Mùa vụ rau củ quả', recipe: 'Công thức, ẩm thực' };
const lines = [];
const P = (s = '') => lines.push(s);
P('# Nguồn dữ liệu của menu-data');
P();
P('> Tệp này được sinh tự động bằng `node tools/gen-nguon.js` từ `data/sources.json`, `data/dishes.json` và `tools/audit-table.js`. Đừng sửa tay.');
P();
P('Ngày tra cứu: **2026-10-04** (toàn bộ nguồn). Dữ liệu là bản **tổng hợp và diễn đạt lại bằng lời của chúng tôi**, không sao chép nguyên văn nội dung có bản quyền; chỉ lấy các thông tin mang tính sự kiện (tên món, danh sách nguyên liệu, khối lượng điển hình, thời gian nấu) rồi chuẩn hóa về khẩu phần 4 người.');
P();
P('## Cách tra cứu và mức tin cậy');
P();
P('- `access = fetch`: đã đọc trang bằng WebFetch (2 nguồn: Sở Y tế Hà Tĩnh về ăn dặm, và trang lịch trồng rau miền Bắc của hatgiongtot.net).');
P('- `access = search`: **chỉ đọc tiêu đề và phần tóm tắt nguyên liệu do công cụ tìm kiếm trả về**, không đọc toàn trang. Vì vậy đối chiếu khối lượng là theo tóm tắt đó.');
P('- Ghi chú từng món trong `dishes.json` có trường `sources` (kèm `scope`) và `sourceCheck`:');
P('  - `doi_chieu_so_lieu`: khối lượng nguyên liệu chính được so với số liệu của nguồn trong bảng rà soát bên dưới và test (`test/audit.test.js`), dung sai ±50%.');
P('  - `cong_thuc_cung_mon`: có ít nhất một nguồn là công thức của đúng món đó (hoặc biến thể sát), nhưng khối lượng không nằm trong bảng rà soát số liệu.');
P('  - `cong_thuc_tuong_tu`: nguồn chỉ là món tương tự hoặc cùng kỹ thuật; khối lượng ước theo tỉ lệ nấu ăn thông thường cho 4 người. **Độ tin cậy thấp hơn.**');
P('  - `tham_khao_chung`: chỉ có nguồn y tế/dinh dưỡng chung (không có công thức nào tra được).');
P('- `scope` của từng nguồn trong món: `cung_mon` | `tuong_tu` | `chung` (nguồn y tế/mùa vụ).');
P();
for (const kind of ['health', 'season', 'recipe']) {
  const keys = Object.keys(reg).filter((k) => reg[k].kind === kind && used.has(reg[k].url));
  P('## ' + groups[kind] + ' (' + keys.length + ' nguồn)');
  P();
  P('| Khóa | Nguồn | Truy cập | Số món dùng |');
  P('|---|---|---|---|');
  for (const k of keys) P('| `' + k + '` | [' + reg[k].name.replace(/\|/g, '/') + '](' + reg[k].url + ') | ' + reg[k].access + ' | ' + used.get(reg[k].url) + ' |');
  P();
}
const unusedHealth = Object.keys(reg).filter((k) => !used.has(reg[k].url));
if (unusedHealth.length) {
  P('## Nguồn đã tra nhưng không gắn vào món cụ thể');
  P();
  for (const k of unusedHealth) P('- [' + reg[k].name + '](' + reg[k].url + ') — dùng làm căn cứ cho giới hạn muối khi viết ghi chú/README (WHO: dưới 5 g muối/ngày với người lớn, dưới 3 g với trẻ dưới 5 tuổi; Bộ Y tế VN: 1,5 g/ngày cho trẻ 1-3 tuổi, 1,9 g/ngày cho 4-8 tuổi — theo bài tổng hợp, cần đối chiếu văn bản gốc).');
  P();
}
P('## Căn cứ y tế/dinh dưỡng đã dùng');
P();
P('- Bắt đầu ăn dặm từ 6 tháng; dưới 12 tháng không cho mật ong, hạt nguyên, đồ cứng; không nêm muối/đường/nước mắm/ớt vào thức ăn của bé dưới 12 tháng; giới thiệu từng thực phẩm mới (Sở Y tế Hà Tĩnh trích PGS.TS.BS Nguyễn Thị Lâm; Alobacsi).');
P('- Trẻ dưới 4 tuổi: tránh hạt nguyên, nho/cà chua bi nguyên quả, miếng thịt lớn (cùng nguồn Hà Tĩnh) — các món có lạc/hạt được gắn `minAgeMonths` cao và cờ `dau_phong`.');
P('- Người cao tuổi: ưu tiên món mềm, hấp/luộc/hầm hơn chiên rán, giảm muối và nước chấm mặn, tránh đồ muối/kho mặn (Vinmec; Sức khỏe & Đời sống).');
P('- Mùa vụ: ước lượng từ **lịch gieo trồng** rau miền Bắc (hatgiongtot.net, nguyenlieusinhhoc.com, kingbio.vn, hachi.com.vn, vuonxanhcuaban.com) quy ra tháng thu hoạch theo thời gian sinh trưởng thông thường, và lịch trái cây (shophoaqua.vn). Đây là ước lượng thực dụng, **không phải số liệu thống kê**.');
P();
P('## Bảng rà soát đối chiếu khối lượng (' + new Set(AUDIT.map((a) => a[0])).size + ' món, ' + AUDIT.length + ' dòng)');
P();
P('Khối lượng của ta nằm trong ±50% so với số liệu nguồn đã quy về 4 suất. Test `test/audit.test.js` kiểm tra tự động bảng này.');
P();
P('| Món | Nguyên liệu | Nguồn (lượng) | Ta | Khóa nguồn | Ghi chú |');
P('|---|---|---|---|---|---|');
const dIx = new Map(dishes.map((d) => [d.id, d]));
const ingIx = new Map(rd('data/ingredients.json').items.map((i) => [i.id, i]));
for (const [dish, ing, q, u, scale, key, note] of AUDIT) {
  const d = dIx.get(dish);
  const line = d.ingredients.find((i) => i.id === ing);
  P('| ' + d.name + ' | ' + ingIx.get(ing).name + ' | ' + q + ' ' + u + (scale !== 1 ? ' (x' + scale + ')' : '') + ' | ' + line.qty + ' ' + line.unit + ' | `' + key + '` | ' + (note || '') + ' |');
}
P();
P('## Điều chỉnh sau khi đối chiếu');
P();
P('Các điều chỉnh khối lượng/thời gian đã thực hiện sau khi đối chiếu (bản nháp đầu dựa vào kinh nghiệm chung): canh cua rau đay mướp (mướp 1 -> 2 quả); thịt kho tàu (trứng 4 -> 5, nước dừa 300 -> 400 ml); cá kho riềng (cá 600 -> 700 g, ba chỉ 150 -> 200 g, riềng 60 -> 120 g); thịt rang cháy cạnh (hành khô 15 -> 40 g); bún chả (thịt 500 -> 700 g); bún riêu cua (cua 500 -> 700 g, cà chua 3 -> 4 quả, bún 500 -> 600 g); canh bí đao (thịt 120 -> 150 g); canh cải cúc (200 -> 300 g); canh rau ngót (thịt 150 -> 200 g); canh khoai sọ (khoai 350 -> 400 g); chả trứng hấp (thịt 150 -> 180 g, mộc nhĩ 5 -> 10 g); cháo bò/thịt cà rốt cho bé (gạo 20 -> 25 g, thịt 20 -> 25 g); chè bí đỏ nếp; chè đậu xanh hạt sen; canh bầu tôm khô (tôm khô 30 -> 40 g); cá thu sốt cà chua (cà chua 3 -> 4 quả); miến gà (nấm hương 10 -> 25 g, mộc nhĩ 5 -> 15 g, gà 400 -> 500 g); bún mọc (xương 500 -> 700 g, thêm giò sống); canh bí đỏ thịt bằm (bí 300 -> 400 g, thịt 120 -> 150 g); canh khoai tây cà rốt thịt bằm; canh su hào cà rốt sườn; nem rán (thịt 250 -> 300 g, thêm su hào, trứng 1 -> 2); đậu phụ nhồi thịt sốt cà chua (cà chua 3 -> 4); tôm hấp sả (sả 1 -> 3 cây); mực hấp gừng (mực 400 -> 300 g, hấp 5-6 phút); ngao hấp sả ớt (600 -> 500 g); vịt luộc chấm gừng (800 -> 1000 g, luộc 25-30 phút); bò hầm khoai tây cà rốt (bắp bò 400 -> 500 g, khoai tây 200 -> 300 g, cà rốt 150 -> 200 g); thịt kho tiêu (400 -> 500 g); thịt viên sốt cà chua (thêm trứng); gà luộc lá chanh (thời gian luộc theo nguồn: tắt bếp ủ).');
P();
P('Một số sai khác có chủ ý: lượng đường trong chè (giảm nhiều so với nguồn), nước mắm trong cà pháo muối xổi (nguồn rất mặn), số củ hành tím trong thịt rang cháy cạnh (nguồn khác nhau 3-8 củ), xem cột Ghi chú.');
P();
P('## Nguồn nêu sai/khác biệt đáng lưu ý');
P();
P('- Một nguồn gộp thời gian luộc "đậu đũa (đậu bắp) 2-3 phút" — đậu bắp (okra) và đậu đũa khác nhau; ta lấy 4-5 phút cho đậu đũa (phải chín kỹ).');
P('- Các nguồn nấu phở/bún ốc/bún riêu thường cho nồi lớn (8-10 bát), ta quy về 4 suất theo kinh nghiệm chung, **không** coi là đã đối chiếu số liệu cho phở bò và bún ốc.');
P();
P('## Giới hạn');
P();
P('- Đây **không phải tư vấn y tế hay dinh dưỡng cá nhân**. Cờ dị ứng/kiêng được suy ra tự động từ danh sách nguyên liệu; nước mắm, hạt nêm, dầu hào, tương có thể chứa cá/gluten/đậu nành nên không được coi là cờ riêng ngoại trừ các nguyên liệu đã gắn cờ (dầu hào = hải sản, nước tương = gluten + đậu nành, mắm tôm = hải sản). Người dị ứng cá/hải sản cần tự kiểm tra nước mắm và gia vị.');
P('- Món cho trẻ dưới 12 tháng chỉ mang tính tham khảo, luôn kèm ghi chú "hỏi bác sĩ".');
P('- Khối lượng là khẩu phần gia đình điển hình (4 người), không phải nhu cầu dinh dưỡng tính toán. Không có thông tin calo/chất dinh dưỡng.');
P('- Dữ liệu chỉ cho ẩm thực **miền Bắc**; chưa có miền khác.');
P('- Các URL có thể thay đổi hoặc biến mất; đã lưu tên bài và URL tại thời điểm tra cứu.');
mkdirSync(new URL('docs/', root), { recursive: true });
writeFileSync(new URL('docs/NGUON.md', root), lines.join('\n') + '\n');
console.log('Đã sinh docs/NGUON.md (' + lines.length + ' dòng)');
