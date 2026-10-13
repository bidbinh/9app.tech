// Bài kiểm tra thể lực: mô tả, đơn vị, giới hạn đầu vào hợp lý. Thuần dữ liệu.
export const BAI_TEST = {
  'chong-day': { ten: 'Chống đẩy tối đa', don: 'lần', cao: true, min: 1, max: 300, mo: 'Tay chống rộng bằng vai, thân thẳng từ đầu đến gót. Hạ ngực cách sàn khoảng một nắm tay rồi đẩy lên duỗi tay. Đếm số lần đúng form liên tục, không nghỉ; dừng khi không giữ được thân thẳng. Có thể chọn kiểu quỳ gối và ghi rõ.', bienThe: ['Đầy đủ', 'Quỳ gối'] },
  'plank': { ten: 'Plank khuỷu tay', don: 'giây', cao: true, min: 1, max: 1800, mo: 'Chống khuỷu tay dưới vai, thân thẳng từ đầu đến gót. Bấm giờ đến khi hông võng hoặc nhô cao, không giữ lại được tư thế.' },
  'bat-cao': { ten: 'Nhảy cao đứng tại chỗ', don: 'cm', cao: true, min: 1, max: 120, mo: 'Đứng nghiêng cạnh tường, giơ tay sát tường và đánh dấu điểm cao nhất khi đứng (gót chạm sàn). Hạ người nhanh rồi bật thẳng lên không bước đà, chạm tường tại điểm cao nhất. Chiều cao bật là hiệu của hai điểm. Làm 3 lần, lấy lần tốt nhất.' },
  'cooper': { ten: 'Chạy 12 phút (Cooper)', don: 'm', cao: true, min: 800, max: 4500, mo: 'Chạy hoặc đi nhanh trong đúng 12 phút trên mặt phẳng (sân 400 m là tiện nhất) để đi được quãng đường xa nhất. Ghi quãng đường (mét), từ 800 đến 4.500 m. Chọn đúng kiểu chạy hay đi nhanh. Chỉ làm khi đã khởi động kỹ.', nang: true, bienThe: ['Chạy', 'Đi nhanh'] },
  'chay-1600': { ten: 'Chạy 1,6 km', don: 'giây', cao: false, min: 180, max: 1800, mo: 'Chạy hết 1.600 m (4 vòng sân 400 m, gần bằng 1 dặm là 1.609 m) nhanh nhất có thể trên mặt phẳng, bấm giờ. Nhập thời gian theo phút và giây. Thời gian càng thấp càng tốt. Chỉ làm khi đã khởi động kỹ.', nang: true },
  'ngoi-dung-30': { ten: 'Ngồi đứng ghế 30 giây', don: 'lần', cao: true, min: 1, max: 60, mo: 'Ngồi giữa ghế chắc cao khoảng 43 cm tựa tường, hai tay khoanh trước ngực, bàn chân đặt phẳng. Trong 30 giây, đứng thẳng hẳn rồi ngồi xuống thật nhiều lần. Đếm số lần đứng thẳng hoàn toàn.' },
  'dung-1-chan': { ten: 'Đứng một chân (mở mắt)', don: 'giây', cao: true, min: 1, max: 60, mo: 'Đứng cạnh tường để dự phòng, nhấc một chân, tay chống hông. Bấm giờ đến khi chân nhấc chạm sàn hoặc tay vịn, tối đa 60 giây. Làm mỗi chân và ghi chân yếu hơn.' },
};
export const hopLeTest = (loai, v) => {
  const b = BAI_TEST[loai];
  return !!b && Number.isFinite(v) && v >= b.min && v <= b.max;
};
