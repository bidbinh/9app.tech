# menu-data

Kho dữ liệu món ăn bữa cơm gia đình **miền Bắc** + thư viện **gợi ý thực đơn tuần** + **gộp danh sách đi chợ** cho hệ app 9app.tech (9family, trợ lý Osin).

- Thuần ES module, không phụ thuộc gói ngoài, chạy được trên **Node 20+** và **trình duyệt**, có JSDoc.
- Dữ liệu là bản diễn đạt lại; nguồn tham khảo ghi theo từng món. Xem `docs/NGUON.md` (nguồn, ngày tra cứu, mức đối chiếu, giới hạn).
- **Không phải tư vấn y tế/dinh dưỡng.** Món cho bé dưới 12 tháng chỉ để tham khảo, luôn kèm "hỏi bác sĩ".

## Cấu trúc

```
data/
  dishes.json        277 món (id, name, role, course, seasons, suitability, avoid, minAgeMonths, timeMinutes,
                     costLevel, servingsBase, protein, ingredients[], steps[], notes, sources[], sourceCheck)
  ingredients.json   184 nguyên liệu chuẩn (id, name, aliases có/không dấu, aisle, unitDefault, conv, pantry, allergens, ...)
  seasonal.json      lịch rau củ quả miền Bắc theo tháng (peak / available), liên kết ingredient id
  sources.json       danh mục nguồn đã tra cứu
src/
  common.js          tiện ích: setData, mùa, seed, phân tích hồ sơ gia đình
  planner.js         planWeek, swapDish, dishIdsOfPlan
  shopping.js        shoppingFromPlan, mergeExtraItems, roundForShopping
  normalize.js       normalizeItem, normalizeList, splitList
  index.js           điểm vào (re-export)
  load-node.js       nạp data/*.json trong Node (không dùng ở trình duyệt)
tools/               nguồn gốc của dữ liệu + build (xem "Thêm món")
test/                node --test (data, planner, shopping, normalize, audit, plausibility)
docs/NGUON.md        nguồn, rà soát, giới hạn (sinh bằng tools/gen-nguon.js)
```

`data/*.json` là **file sinh ra**; nguồn để sửa nằm ở `tools/`.

### Quy ước dữ liệu

- **Khẩu phần**: `ingredients[].qty` là cho `servingsBase` suất (4 người lớn; riêng cháo/bột trẻ nhỏ `servingsBase = 1`).
- **Vai trò** (`role`): `canh`, `man` (kho/rang/chiên/hấp), `xao`, `luoc`, `rau` (nộm, dưa, rau trộn), `mon_nuoc` (bún/phở/miến/cháo gia đình), `chay`, `chao_bot` (ăn dặm 6-11 tháng), `trang_mieng`, `an_vat`.
- **Mùa** (`seasons`): `xuan` (T2-4), `ha` (T5-7), `thu` (T8-10), `dong` (T11-1) hoặc `quanh_nam`. Món theo mùa có `seasonNote` giải thích.
- **Nhóm đối tượng** (`suitability`): `tre_duoi_12m`, `tre_nho_1_3`, `tre_4_12`, `nguoi_lon`, `nguoi_cao_tuoi`, `de_nhai`, `it_muoi`, `it_duong`, `it_dau_mo`. Ba cờ cuối được gán theo nguyên liệu/cách nấu (nhãn "ít muối" nghĩa là *có thể nêm nhạt*, không phải đã tính natri chính xác).
- **Kiêng/dị ứng** (`avoid`): `hai_san`, `trung`, `sua`, `dau_phong`, `gluten`, `thit_heo`, `thit_bo`, `cay`, `dau_nanh`. **Tự suy ra từ nguyên liệu** lúc build (test kiểm tra lại độc lập), nên không thể quên gắn cờ. Nguyên liệu tùy chọn (`optional`) vẫn mang cờ, trừ ớt tùy chọn.
- **Tuổi tối thiểu** `minAgeMonths` = lớn nhất trong (giá trị chỉ định, tuổi tối thiểu của các nguyên liệu không tùy chọn).
- **`protein`**: loại đạm chính (`heo`, `bo`, `ga`, `vit`, `ca`, `hai_san`, `trung`, `dau_phu`, `rau`), dùng để không lặp đạm giữa hai bữa liền nhau.
- **`sourceCheck`**: mức đối chiếu nguồn: `doi_chieu_so_lieu` > `cong_thuc_cung_mon` > `cong_thuc_tuong_tu` > `tham_khao_chung`. Xem `docs/NGUON.md`.

## Dùng thư viện

### Node (9family, Osin ở phía server)

```js
import { setData, planWeek, swapDish, shoppingFromPlan, mergeExtraItems, normalizeList } from './menu-data/src/index.js';
import { loadData } from './menu-data/src/load-node.js';

setData(loadData()); // nạp một lần khi khởi động

const profile = {
  region: 'bac',
  people: [
    { ageYears: 36, role: 'bo' },
    { ageYears: 34, role: 'me', avoid: ['hai_san'] },          // dị ứng của một người áp dụng cho cả bữa
    { ageYears: 2 },
    { ageMonths: 8 },                                           // bé 6-11 tháng: có món ăn dặm riêng
    { ageYears: 70, role: 'ba' },                               // người cao tuổi: ưu tiên mềm, ít muối
  ],
};

const plan = planWeek({ month: 10, profile, days: 7, meals: ['trua', 'toi'], seed: 'tuan-41', budget: 'vua' });
// plan.days[0].meals.trua.items -> [{ slot: 'canh', dishId, name, why: ['Đúng mùa thu ...', 'Mềm, dễ ăn cho ông bà'] }, ...]
// plan.days[0].meals.trua.baby  -> món ăn dặm riêng cho bé (nếu có)
// plan.warnings                 -> thiếu món / phải nới lỏng quy tắc

const plan2 = swapDish(plan, { day: 3, meal: 'toi', slot: 'canh' });             // đổi tự động, giữ mọi quy tắc
const plan3 = swapDish(plan, { day: 3, meal: 'toi', slot: 'canh' }, { dishId: 'canh-bau-thit-bam' }); // ép chọn món (vẫn kiểm tra dị ứng/tuổi)

let list = shoppingFromPlan(plan, { pantryMode: 'ask', have: ['gao-te'] });
// list.byAisle -> [{ aisle: 'rau_cu', label: 'Rau củ', lines: [{ name, display: '1,25 kg', fromDishes: [...], ... }] }]
// list.pantryCheck -> đồ thường có sẵn để hỏi "nhà còn không?"

// ghi chú gõ tay / giọng nói
const extras = normalizeList('hai bó rau muống, pin AA 4 viên và bánh cho bé');
list = mergeExtraItems(list, ['2 bó rau muống', 'mua thêm pin', 'bánh cho bé']);
```

Tuần kế tiếp không lặp món: `planWeek({ ..., exclude: dishIdsOfPlan(prevPlan) })` (gộp dần các tuần).

### Trình duyệt

```js
import { setData, planWeek } from './menu-data/src/index.js';
const [dishes, ingredients, seasonal] = await Promise.all(
  ['dishes', 'ingredients', 'seasonal'].map((n) => fetch(`/menu-data/data/${n}.json`).then((r) => r.json())),
);
setData({ dishes, ingredients, seasonal });
```

Mọi hàm nhận thêm `{ data }` nếu bạn không muốn dùng `setData` toàn cục. Kết quả đều là JSON thuần (lưu được vào DB, gửi qua mạng); `swapDish` chỉ cần plan đã lưu.

### Quy tắc của planner

- **Tất định** theo `seed` (cùng đầu vào + seed -> cùng thực đơn; `swapDish` cũng tất định, đổi `attempt` để lấy lựa chọn khác).
- **Bữa cơm** = canh + 1-2 món mặn (2 món khi từ 3 suất trở lên và ngân sách không "tiết kiệm") + rau; khoảng 25% bữa là **một món nước** (`nuocRate`). Bữa sáng: món nước hoặc đồ ăn sáng.
- **Tuyệt đối**: không món chứa cờ kiêng/dị ứng của bất kỳ ai; không món có `minAgeMonths` lớn hơn tuổi của người nhỏ nhất đã ăn cơm gia đình (>= 12 tháng); nhà có trẻ dưới 10 tuổi thì không món cay. Món ăn dặm (`chao_bot`) chỉ xuất hiện ở ô `baby`.
- **Ưu tiên (điểm)**: đúng mùa (+4), có ông bà (món mềm/ít muối), có bé 1-3 tuổi (món `tre_nho_1_3`, và mỗi bữa luôn có ít nhất một món mặn hợp bé), `diet` (`it_muoi`, `it_duong`, `it_dau_mo`, `de_nhai`), ngân sách, không trùng nguyên liệu chính trong bữa/bữa liền trước.
- **Đa dạng**: không lặp món trong tuần (và trong `exclude`); không cùng loại đạm của món mặn hai bữa trưa/tối liền nhau.
- **Nới lỏng có thông báo**: khi không còn món thỏa mãn, planner nới theo thứ tự: bỏ yêu cầu bé -> bỏ tránh trùng đạm -> cho món ngoài mùa -> cho dùng lại món. Mọi lần nới đều có dòng trong `plan.warnings` và `why`. Trường hợp dễ gặp: kiêng thịt heo + có trẻ nhỏ + người già vào mùa xuân/đông, lập thực đơn 4 tuần không lặp (ít canh không heo).
- Mùa theo `month`: T2-4 xuân, T5-7 hạ, T8-10 thu, T11-1 đông.

### Gộp đi chợ

- Cộng dồn theo `ingredientId`, quy đổi giữa g/kg, ml/l và đơn vị đếm (bó, quả, củ, miếng, con...) qua `conv` của nguyên liệu; nhân theo số suất = tổng trọng số người (bé 6-11 tháng 0,2; 1-3 tuổi 0,5; 4-9 tuổi 0,7; 10-15 tuổi 0,9; người lớn 1; người cao tuổi 0,8) chia `servingsBase`; ghi đè bằng `servings` hoặc `people`. Món ăn dặm tính 1 suất bé.
- Làm tròn để mua: dưới 100 g lên bội 10 g; 100-999 g lên bội 50 g; từ 1 kg đổi sang kg, lên bội 0,05 kg; đơn vị đếm làm tròn lên số nguyên (sai số 0,1). `exactQty` giữ lượng chính xác theo g/ml.
- `pantryMode`: `skip` (bỏ đồ có sẵn: muối, đường, nước mắm, dầu ăn, tiêu, hành khô, tỏi, ...), `include` (đưa vào, đánh dấu `pantry`), `ask` (gom vào `pantryCheck` để hỏi). `have` bỏ các nguyên liệu nhà đã có.
- `fromDishes`: món nào cần nguyên liệu này. Nguyên liệu tùy chọn có `optional: true` (bỏ hẳn bằng `includeOptional: false`).
- `mergeExtraItems`: mục ghi thêm chỉ **cộng vào dòng nguyên liệu** khi tên khớp *chính xác* nguyên liệu (hoặc bí danh) và có số lượng; còn lại ("mua thêm pin", "bánh cho bé", "sữa cho bé") giữ thành dòng riêng `extra: true` ở nhóm `khac`, không bao giờ bị gộp nhầm.

### Chuẩn hóa ghi chú (`normalizeItem`)

Luật + bí danh, không AI: bỏ từ đệm ("mua", "nha", "giúp"), nhận số bằng chữ ("hai", "mười lăm", "nửa", "rưỡi", "một chục"), đơn vị đời thường (bó/mớ, quả/trái, ký/cân, lạng = 100 g, hộp, chai, bìa...), khoảng ("2-3", "ba bốn"), lượng mơ hồ ("vài" = 3, "một ít"), gõ không dấu. Trả `{ name, qty, unit, ingredientId, confidence }`:
`exact` (tên khớp nguyên liệu, cho phép gộp), `partial` (chỉ chứa từ khớp — ví dụ "sữa cho bé" — **không** tự gộp), `none`.
Giới hạn: không hiểu câu phức, tên viết tắt lạ, số lượng nhiều con số ("bia 6 lon 330ml" chỉ lấy "6 lon"), và "năm"/"ba" cuối câu không kèm đơn vị được coi là tên chứ không phải số.

## Thêm món

1. Mở file thích hợp trong `tools/` (`dishes-canh.js`, `dishes-man.js`, `dishes-xao.js`, `dishes-rau.js`, `dishes-nuoc.js`, hoặc `dishes-extra*.js`) và thêm một lệnh `D(...)`:

```js
D('canh-bi-xanh-tom', 'Canh bí xanh nấu tôm', 'canh', 'ha thu', 'k13 eld soft ls lf t25 c1',
  'bi-dao 400g; tom-tuoi 100g; hanh-la 10g; +sl',
  'Bí gọt vỏ, cắt miếng.|Tôm bóc vỏ, xào với hành khô.|Đổ nước đun sôi, cho bí vào nấu mềm.|Nêm nhạt.',
  'Hải sản.', 'dmx-bidao-thitbam', 'Bí xanh vụ hè-thu.');
// D(id, tên, vai trò, mùa ('xuan ha thu dong' hoặc 'q'), thẻ, nguyên liệu, bước ('|' ngăn), ghi chú, khóa nguồn, ghi chú mùa)
```

   - **Thẻ**: `k13` (hợp 1-3 tuổi), `nok412` (không hợp 4-12 tuổi), `eld` (cao tuổi), `soft` (dễ nhai), `ls` (có thể nêm nhạt), `lsug`, `lf`, `baby`, `sb1` (cháo bột, servingsBase 1), `m<tháng>`, `t<phút>`, `c<1-3>`, `@sang`/`@trua`/`@toi` (bữa ăn).
   - **Nguyên liệu**: `id lượng+đơn vị` ngăn bằng `;`, thêm `?` cho tùy chọn, `(ghi chú)`; macro `+s` / `+sl` (gia vị cơ bản / nêm nhạt) và `+k`.
   - Nguyên liệu mới: thêm một dòng trong `tools/ingredients-src.js` (định dạng ở đầu file). Nguồn mới: `tools/sources.js` (nhớ `COVERS` nếu nguồn là công thức của đúng món đó).
   - Mùa theo tháng của nguyên liệu mới: `tools/seasonal-src.js`.
2. `node tools/build.js` (sinh `data/*.json`, báo lỗi id/đơn vị/nguồn sai), rồi `node --test test/`.
3. Cập nhật tài liệu: `node tools/gen-nguon.js`; thống kê: `node tools/stats.js`.

Validator trong `test/data.test.js` sẽ chặn: id trùng, nguyên liệu/đơn vị sai, thiếu nguồn, cờ kiêng không khớp nguyên liệu, món trẻ nhỏ có thứ cấm, món ăn dặm có muối/nước mắm, mùa không khớp lịch rau củ, bước nấu rỗng, thiếu món theo mùa/nhóm.

## Kiểm thử

```
npm test              # node --test test/
node tools/stats.js   # thống kê món theo vai trò / mùa / nhóm
```

Gồm: validator dữ liệu, planner (dị ứng, ông bà, bé nhỏ, theo mùa, tất định, không lặp 4 tuần liên tiếp theo mùa, swap, fuzz 300 thực đơn), shopping (cộng dồn, quy đổi, pantry, nhân suất, làm tròn, extras), normalize (60+ câu gõ/nói), rà soát đối chiếu nguồn (46 món) và kiểm tra tính hợp lý (khối lượng/đạm/muối/thời gian).

## Giới hạn

- Chỉ **miền Bắc**; chưa có calo/chất dinh dưỡng; không thay thế bác sĩ/chuyên gia dinh dưỡng.
- Công thức: 46/277 món được đối chiếu số liệu với nguồn (dung sai ±50%), còn lại khối lượng là ước lượng theo khẩu phần điển hình — xem `sourceCheck` và `docs/NGUON.md`. Đối chiếu dựa trên tóm tắt của công cụ tìm kiếm, không đọc toàn trang.
- Mùa vụ rau củ suy từ lịch gieo trồng, là ước lượng; hiện nhiều loại có quanh năm (nhà kính, nhập vùng cao).
- Nước mắm, hạt nêm, tương có thể chứa cá/gluten/đậu nành nhưng không được gắn cờ riêng (nếu gắn, gần như mọi món bị loại với người dị ứng cá). Người dị ứng cá/hải sản cần tự kiểm tra gia vị.
- Lượng đường/muối trong nhiều món kho, nộm, chè theo khẩu vị thông thường — không phù hợp để áp nguyên cho người tiểu đường/tăng huyết áp.
- Cờ `it_muoi`/`it_duong`/`it_dau_mo` là "có thể nấu theo hướng này", không phải số liệu dinh dưỡng.
- Ít món bò (14) và gần như không có sữa/bơ; kiêng thịt heo vẫn lập được thực đơn nhưng chọn lựa canh ít hơn.
- Bé 6-11 tháng: 13 món cháo/bột, chỉ tham khảo (hỏi bác sĩ); không có thực đơn riêng cho bé 1-3 tuổi ngoài các món gia đình có thẻ `tre_nho_1_3`.
- Chưa có thực đơn món chay theo ngày chay/rằm; món chay chỉ là lựa chọn mặn thay thế (vai trò `chay`).
