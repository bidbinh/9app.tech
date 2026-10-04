/* 9hire: trang tĩnh ngắn (an toàn, điều khoản, quyền riêng tư). Nội dung pháp lý là bản rút gọn, cần được rà soát. */
(function () {
  'use strict';
  var H9 = window.H9, h = H9.h;

  function page(title, back, nodes) {
    H9.frame({ title: title, back: back || '#/', narrow: true });
    H9.mount([h('div', { class: 'card legal' }, nodes)]);
  }
  var H = function (t) { return h('h2', { class: 'mt2', text: t }); };
  var P = function (t) { return h('p', { class: 'mt', text: t }); };
  var UL = function (items) { return h('ul', { class: 'plain-list' }, items.map(function (t) { return h('li', { text: t }); })); };
  var draft = function () { return H9.notice('warn', 'Bản rút gọn, chưa phải văn bản pháp lý hoàn chỉnh', 'Nội dung đang chờ rà soát với quy định hiện hành (dịch vụ việc làm, bảo vệ dữ liệu cá nhân, trách nhiệm nền tảng trung gian) trước khi công bố rộng.'); };

  H9.safetyPage = function () {
    page('An toàn khi xin việc', '#/', [
      h('h1', { class: 'h1', text: 'Nhận biết tin lừa đảo' }),
      P('Phần lớn tin lừa đảo đều đòi bạn bỏ tiền ra TRƯỚC khi có việc. Người tuyển dụng đàng hoàng thì không.'),
      H('Dấu hiệu nên dừng lại ngay'),
      UL([
        'Đòi đóng phí hồ sơ, phí đào tạo, đặt cọc, ký quỹ, tiền "giữ chỗ" hay tiền đồng phục.',
        'Bắt mua hàng, mua gói sản phẩm, "nhập hàng về bán" hoặc nạp tiền để làm nhiệm vụ.',
        'Kêu gọi kéo thêm người vào để hưởng hoa hồng (đa cấp).',
        'Lương rất cao, việc nhẹ, không cần kinh nghiệm; hứa nhận ngay không cần gặp.',
        'Đòi gửi ảnh CCCD, mã OTP, thông tin ngân hàng khi chưa gặp trực tiếp.',
        'Chỉ nói chuyện qua tin nhắn, né không cho gặp ở địa chỉ thật, hẹn quán cà phê xa lạ.',
        'Nhờ bạn nhận hộ tiền, cho thuê tài khoản ngân hàng hoặc SIM.',
      ]),
      H('Nên làm'),
      UL([
        'Đến đúng địa chỉ ghi trong tin, đi cùng người quen nếu có thể, báo cho người thân biết giờ giấc.',
        'Hỏi rõ tên quán, người phụ trách, lương, ca, ngày trả lương, và xem quán có thật không.',
        'Chỉ đưa bản sao giấy tờ khi đã nhận việc và gặp trực tiếp, không đưa giấy tờ gốc để "giữ".',
        'Bị đòi tiền: dừng lại, không chuyển khoản, bấm "Báo cáo tin này". Tin bị nhiều người báo cáo sẽ tự ẩn.',
        'Đã lỡ chuyển tiền: giữ lại tin nhắn, biên lai và báo cơ quan công an nơi bạn ở.',
      ]),
      H('9hire làm gì để giúp bạn'),
      UL([
        'Chặn tự động tin có dấu hiệu thu phí, đặt cọc, ép mua hàng, đa cấp.',
        'Không hiện số điện thoại và địa chỉ cụ thể cho tới khi bạn đọc cảnh báo và xác nhận.',
        'Giới hạn số tin mỗi ngày để chống tin rác, có nút báo cáo và tự ẩn tin khi nhiều người báo.',
      ]),
      h('div', { class: 'btn-row' }, [H9.link('#/', { class: 'btn primary' }, ['Đi tìm việc'])]),
    ]);
  };

  H9.termsPage = function () {
    page('Điều khoản sử dụng', '#/me', [
      h('h1', { class: 'h1', text: 'Điều khoản sử dụng' }), draft(),
      H('1. 9hire là gì'),
      P('9hire là nơi đăng và xem tin việc làm nhỏ (việc làm thêm, bán thời gian, tuyển nhanh, tin văn phòng). 9hire không phải bên tuyển dụng, không là bên môi giới và không bảo đảm có việc làm hay độ chính xác của từng tin.'),
      H('2. Nhà tuyển dụng cam kết'),
      UL(['Thông tin trong tin là đúng sự thật và bạn có quyền tuyển dụng cho vị trí đó.', 'Không thu bất kỳ khoản tiền nào của người xin việc (phí, đặt cọc, ký quỹ, mua hàng, nạp tiền) và không kinh doanh đa cấp.', 'Không đăng việc trái pháp luật hoặc có nội dung phân biệt đối xử.', 'Không ghi số điện thoại, email, đường link vào phần mô tả; dùng ô liên hệ riêng.', 'Chỉ dùng thông tin ứng viên để liên hệ về việc làm đã ứng tuyển, không bán hay chia sẻ cho bên khác.']),
      H('3. Người tìm việc'),
      P('Bạn tự cân nhắc và kiểm tra thông tin trước khi nhận việc. Hãy đọc mục An toàn khi xin việc và báo cáo tin có dấu hiệu lừa đảo.'),
      H('4. Gỡ tin và khóa tài khoản'),
      P('Tin vi phạm hoặc bị nhiều người báo cáo có thể bị ẩn hoặc xóa, tài khoản vi phạm có thể bị khóa, không cần báo trước. Có giới hạn số tin đăng mỗi ngày để chống tin rác.'),
      H('5. Ngoài phạm vi'),
      P('Hiện chưa hỗ trợ tin giúp việc gia đình và gia sư. Tin thuộc nhóm này có thể bị gỡ.'),
      H('6. Thay đổi'),
      P('Điều khoản có thể được cập nhật; việc tiếp tục sử dụng nghĩa là bạn chấp nhận bản mới.'),
    ]);
  };

  H9.privacyPage = function () {
    page('Quyền riêng tư', '#/me', [
      h('h1', { class: 'h1', text: 'Quyền riêng tư' }), draft(),
      H('Chúng tôi lưu gì'),
      UL([
        'Người tìm việc: không cần tài khoản. Hồ sơ ngắn, tin đã lưu, bộ lọc theo dõi nằm trên thiết bị của bạn, chúng tôi không thấy.',
        'Khi bạn bấm "Gửi quan tâm": tên, số điện thoại, lời nhắn, việc bạn có thể bắt đầu ngay, gửi cho nhà tuyển dụng của đúng tin đó.',
        'Nhà tuyển dụng: tên hiển thị, nội dung tin, thông tin liên hệ trong tin, mã khôi phục (chỉ lưu bản băm không đọc ngược được).',
        'Cookie phiên ẩn danh (chỉ lưu bản băm) để nhớ bạn trên thiết bị này. Địa chỉ IP dùng để chống lạm dụng và gắn với tin hoặc báo cáo.',
      ]),
      H('Ai thấy dữ liệu của bạn'),
      UL(['Hồ sơ ứng tuyển chỉ nhà tuyển dụng của tin đó thấy.', 'Số điện thoại, địa chỉ của nhà tuyển dụng chỉ hiện sau khi người xem xác nhận đã đọc cảnh báo.', 'Chúng tôi không bán dữ liệu, không quảng cáo, không dùng công cụ theo dõi của bên thứ ba.']),
      H('Thời hạn lưu và xóa'),
      UL(['Hồ sơ ứng tuyển tự xóa ' + (H9.meta ? H9.meta.retainDays : 60) + ' ngày sau khi tin hết hạn hoặc đóng.', 'Nhà tuyển dụng có thể xóa tin (kèm hồ sơ) hoặc xóa cả tài khoản bất cứ lúc nào.', 'Bạn xóa dữ liệu trên thiết bị ở mục Của tôi.']),
      H('Quyền của bạn'),
      P('Bạn có quyền yêu cầu xem, sửa, xóa dữ liệu cá nhân đã gửi cho 9hire. Vì dữ liệu ứng tuyển không gắn với tài khoản, hãy cho biết số điện thoại đã dùng và tin đã ứng tuyển khi yêu cầu.'),
      H('Cần kiểm chứng'),
      P('Cách xử lý dữ liệu cá nhân (căn cứ pháp lý, đồng ý, thông báo, thời hạn lưu, chuyển giao cho nhà tuyển dụng) cần được đối chiếu với Nghị định 13/2023/NĐ-CP và quy định bảo vệ dữ liệu cá nhân hiện hành trước khi công bố rộng.'),
    ]);
  };
})();
