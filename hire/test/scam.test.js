import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanFields, findContactLeak } from '../src/scam.js';

const blocked = (text) => scanFields({ description: text }).block.map((b) => b.rule);
const clean = (text) => assert.deepEqual(blocked(text), [], 'không được chặn nhầm: ' + text);
const hit = (text, rule) => assert.ok(blocked(text).includes(rule), `phải chặn (${rule}): ${text} -> ${blocked(text)}`);

test('chặn thu phí, đặt cọc, ký quỹ (nhiều cách viết)', () => {
  for (const t of [
    'Tuyển nhân viên, phải đóng phí hồ sơ 200k', 'Cần đặt cọc 500.000đ giữ chỗ', 'Nộp tiền cọc đồng phục', 'Thu phí đào tạo 1 triệu',
    'Phí tuyển dụng 300k hoàn lại sau 1 tháng', 'ĐẶT CỌC trước khi nhận việc', 'ký quỹ 2 triệu', 'đóng tiền trước để nhận việc', 'chuyển khoản trước để giữ chỗ',
    'phi dat coc 100k', 'tien coc 200k', 'Phí đồng phục 150k', 'đóng phí làm thẻ',
  ]) hit(t, 'phi');
});

test('chặn viết cách chữ, chèn dấu để lách', () => {
  hit('Cần đ.ặ.t c.ọ.c 300k', 'phi');
  hit('d a t c o c truoc', 'phi');
  hit('ĐẶT_CỌC 200k', 'phi');
  hit('Đ ặ t   c ọ c', 'phi');
  hit('NỘP-PHÍ hồ sơ', 'phi');
});

test('không chặn nhầm câu phủ định "không thu phí", "miễn phí"', () => {
  for (const t of [
    'Không thu phí, không đặt cọc. Lương trả cuối tuần.', 'Hoàn toàn miễn phí đào tạo', 'Không cần đặt cọc', 'Không phải đóng phí tuyển dụng nào',
    'Cam kết không thu bất kỳ khoản phí nào', 'Quán không yêu cầu ký quỹ', 'Nhân viên thu phí giữ xe, ca tối', 'Thu phí cầu đường tại trạm',
  ]) clean(t);
});

test('phủ định không che được phần đòi tiền sau đó', () => {
  hit('Không thu phí tuyển dụng, nhưng phải đặt cọc 300k', 'phi');
  hit('Miễn phí đào tạo. Phí hồ sơ 100k', 'phi');
  hit('Không đóng phí, đặt cọc 500k', 'phi');
});

test('chặn ép mua hàng, đa cấp, kiếm tiền online, tài chính, tài khoản', () => {
  hit('Bắt buộc mua sản phẩm của công ty', 'mua');
  hit('Phải mua gói khởi nghiệp', 'mua');
  hit('Cần mua hàng của công ty để được làm', 'mua');
  hit('Tự bỏ vốn nhập hàng về bán', 'mua');
  hit('Kinh doanh đa cấp thu nhập cao', 'dacap');
  hit('Phát triển hệ thống tuyển dưới nhận hoa hồng', 'dacap');
  hit('Mô hình MLM', 'dacap');
  hit('Nhiệm vụ online hằng ngày, nạp tiền trước', 'online');
  hit('Tăng đơn, nâng doanh số sàn', 'online');
  hit('Cho vay tiền nhanh không thế chấp', 'taichinh');
  hit('Đầu tư forex lợi nhuận cao', 'taichinh');
  hit('Cần thuê tài khoản ngân hàng', 'taichinh');
  hit('Nhận chuyển khoản hộ, hoa hồng 5%', 'taichinh');
  hit('Nhà cái cá cược uy tín', 'taichinh');
});

test('không chặn nhầm tin việc làm bình thường', () => {
  for (const t of [
    'Phục vụ bàn, pha chế, dọn dẹp quầy. Được đào tạo tại chỗ, có cơm ca.', 'Nhân viên kho nhập hàng, xếp hàng lên kệ, kiểm đếm.',
    'Bán hàng tại cửa hàng thời trang, thưởng doanh số theo tháng.', 'Giao hàng nội thành bằng xe máy, có phụ cấp xăng.',
    'Trợ lý kế toán: lập chứng từ, đối chiếu công nợ, đóng gói hồ sơ.', 'Tuyển phụ bếp, lương cộng thưởng chuyên cần.', 'Chạy bàn tiệc cưới cuối tuần, trả lương trong ngày.',
    'Đóng phim quảng cáo, mẫu ảnh', 'Cần người đóng gói hàng cuối tuần', 'Nhân viên đặt hàng nhà cung cấp', 'Nhận hàng, kiểm hàng, vào sổ kho',
  ]) clean(t);
});

test('nhãn nghi ngờ (mềm) không chặn', () => {
  const r = scanFields({ description: 'Gửi ảnh CCCD qua Zalo trước khi phỏng vấn. Việc nhẹ lương cao, không cần kinh nghiệm.' });
  assert.equal(r.block.length, 0);
  assert.ok(r.risk.length >= 2, JSON.stringify(r.risk));
});

test('rò rỉ liên hệ: số điện thoại, email, link, Telegram', () => {
  for (const t of ['Gọi 0912345678 để biết thêm', 'Liên hệ 0912 345 678', 'SĐT: 091.234.5678', 'zalo +84 912 345 678', 'ib 84912345678', 'mail abc@gmail.com', 'xem tại https://abc.vn', 'vào www.abc.com', 't.me/abc', 'telegram @abc', 'tuyển.top', 'inbox zalo.me/091']) {
    assert.ok(findContactLeak(t), 'phải bắt: ' + t);
  }
  for (const t of ['Lương 8.000.000đ mỗi tháng', 'Ca 7h-12h, thưởng 200.000', 'Địa chỉ 12 Lê Lợi, Quận 1', 'Làm từ 05:30 đến 11:30', 'Liên hệ qua Zalo của quán', 'Lương 25.000 - 30.000 mỗi giờ', 'Thưởng 100.000.000 cuối năm']) {
    assert.equal(findContactLeak(t), null, 'không được bắt nhầm: ' + t);
  }
});

const anyBlock = (text) => scanFields({ description: text }).block.length > 0;
const mustBlock = (arr) => { for (const t of arr) assert.ok(anyBlock(t), 'phải chặn: ' + JSON.stringify(t)); };
const mustPass = (arr) => { for (const t of arr) assert.deepEqual(scanFields({ description: t }).block, [], 'không được chặn nhầm: ' + t); };

test('T1: lách bằng Unicode (ZWSP, soft hyphen, Cyrillic, toàn rộng, leet)', () => {
  mustBlock([
    'Cần đặt​cọc 300k', 'đặt­cọc trước', 'đ​ặ​t c​ọ​c', 'Cần đặt cọс 300k'.replace('c', 'с'), 'đặt cоc'.replace('o', 'о'),
    'ＤＡＴ ＣＯＣ trước', 'ＤＡ̣T cọc', 'd4t c0c truoc', 'Đ4T C0C 200k', 'k­ý q­uỹ', 'ky quy 2 trieu',
  ]);
});

test('T1: từ đồng nghĩa đòi tiền', () => {
  mustBlock([
    'Nộp 200k để nhận việc', 'Đóng trước 300k tiền giữ chỗ', 'Tạm ứng bảo chứng khi nhận việc', 'Mua đồng phục 300k', 'Gửi 3 triệu giữ suất', 'Nạp 500k vào tài khoản',
    'Chơi xổ số online', 'Kiếm tiền online tại nhà không cần vốn', 'Cá độ b.ê.t', 'Nộp 1 triệu đảm bảo công việc', 'chuyển 500k giữ chỗ', 'Cho vay tiền nhanh không thế chấp',
    'tạm ứng 2tr bảo đảm', 'Gửi trước 200 nghìn để giữ chỗ',
  ]);
});

test('T2: không chặn nhầm tin hợp lệ', () => {
  mustPass([
    'Nhận hồ sơ trực tiếp tại quán', 'Công ty đóng phí bảo hiểm cho nhân viên', 'Lương chuyển khoản trước ngày 5 hằng tháng', 'Nhân viên được mua hàng của công ty giá ưu đãi',
    'Đi chợ mua hàng cho bếp mỗi sáng', 'Nhân viên nạp tiền điện thoại, bán thẻ cào', 'Nhận tiền cọc phòng của khách', 'Tiền cọc xe máy cho khách thuê sẽ hoàn lại khi trả xe',
    'Thu hộ COD khi giao hàng, nhận tiền hộ COD', 'Tư vấn vay vốn tại ngân hàng', 'Đánh giá sản phẩm, nhận lương theo ca', 'Công ty đóng BHXH đầy đủ', 'Lương trả chuyển khoản cuối tháng',
    'Phục vụ bàn, nhận lương theo giờ, thưởng 500k cuối tháng', 'Nhân viên thu ngân nhận chuyển khoản của khách', 'Thu phí giữ xe cho khách', 'Đóng gói 200 đơn mỗi ngày', 'Giao hàng 30k mỗi đơn, gửi hàng cho khách',
    'Ca 7h-12h, mức lương 25k một giờ, đóng cửa lúc 22h', 'Lương 8tr, thưởng 1tr, không đặt cọc',
  ]);
  const r = scanFields({ description: 'Tư vấn vay vốn tại ngân hàng. Đánh giá sản phẩm cho khách.' });
  assert.ok(r.risk.length >= 1, 'chỉ gắn nhãn nghi ngờ');
});

test('T3: lọc liên hệ không chặn nhầm ngày/ca/chấm câu', () => {
  for (const t of ['Từ 01.10.2026-31.10.2026', 'Ca 06.00-14.00 14.00-22.00', 'Quán mở.Shop nhỏ', 'Lương 200.000-250.000 mỗi ca', 'Hạn 10/10/2026 - 20/10/2026', 'Phục vụ.Ly cà phê', 'Mã đơn 12345678']) {
    assert.equal(findContactLeak(t), null, 'không được bắt nhầm: ' + t);
  }
});

test('T3: lọc liên hệ không bỏ lọt', () => {
  for (const t of ['không chín một hai ba bốn năm sáu bảy tám', 'Không Chín Một Hai Ba Bốn Năm Sáu Bảy Tám', '０９１２３４５６７８', 'O912345678', 'zalo: vanhire99', 'Zalo = van_hire.99', 'lan@gmail . com', 'lan @ gmail.com', '0912.345.678', '+84 912 345 678', '0912-345-678', '0912 345 678 - 0987 654 321', 'liên hệ @vanhire99', 'IB telegram']) {
    assert.ok(findContactLeak(t), 'phải bắt: ' + t);
  }
});
