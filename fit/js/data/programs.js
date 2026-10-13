// Chương trình mẫu. Mỗi bài: [mã bài, đếm ghi đè (tùy chọn)]. Tuần: themHiep cộng thêm hiệp, giamTai = tuần giảm tải (còn khoảng 60 phần trăm số hiệp).
// Đây là mẫu tổng quát do 9app tự biên soạn, không thay thế huấn luyện viên hoặc bác sĩ.
const T4 = [
  { ten: 'Tuần 1: làm quen', themHiep: 0 },
  { ten: 'Tuần 2: giữ nhịp', themHiep: 0 },
  { ten: 'Tuần 3: tăng nhẹ', themHiep: 1 },
  { ten: 'Tuần 4: giảm tải', themHiep: 0, giamTai: true },
];
const T3 = [
  { ten: 'Tuần 1: làm quen', themHiep: 0 },
  { ten: 'Tuần 2: tăng nhẹ', themHiep: 1 },
  { ten: 'Tuần 3: giảm tải', themHiep: 0, giamTai: true },
];
const T2 = [
  { ten: 'Tuần 1: làm quen', themHiep: 0 },
  { ten: 'Tuần 2: giữ nhịp', themHiep: 0 },
];

export const CHUONG_TRINH = [
  {
    id: 'cau-long-4t', ten: 'Cầu lông: bước chân, vai và bật nhảy', mon: 'cau-long', mucTieu: 'mon', phutBuoi: 40,
    mota: 'Bổ trợ cho người chơi cầu lông: chân bước nhanh, vai và cổ tay khỏe, xoay thân, bật nhảy tiếp đất êm. 3 buổi mỗi tuần, nên đặt xen kẽ với ngày chơi.',
    giamTaiTruocGiai: true, tuanPlan: T4,
    phien: [
      { ten: 'A: Chân và bước', kd: 'kd-cau-long-10', ph: 'ph-cau-long-5', bai: [['buoc-tach-chan'], ['di-chuyen-6-goc'], ['squat-goblet'], ['lunge-ngang'], ['buoc-len-ghe'], ['kiem-got-1-chan']] },
      { ten: 'B: Vai, cổ tay, xoay thân', kd: 'kd-cau-long-10', ph: 'ph-cau-long-5', bai: [['xoay-ngoai-vai-day'], ['face-pull-day'], ['day-vai-ta'], ['duoi-co-tay'], ['gap-co-tay'], ['pallof-press'], ['chat-day-cheo']] },
      { ten: 'C: Bật nhảy và core', kd: 'kd-cau-long-10', ph: 'ph-cau-long-5', bai: [['tiep-dat-em'], ['nhay-ngang'], ['nhay-vach-ngang'], ['bat-cao'], ['plank-nghieng'], ['dead-bug'], ['gap-bung-xe-dap']] },
    ],
  },
  {
    id: 'pickleball-3t', ten: 'Pickleball: cổ chân, vai và bước chân', mon: 'pickleball', mucTieu: 'mon', phutBuoi: 35,
    mota: 'Dành cho người chơi pickleball: cổ chân vững, chân bước thấp, vai và cổ tay khỏe, xoay thân. 3 buổi mỗi tuần.',
    giamTaiTruocGiai: true, tuanPlan: T3,
    phien: [
      { ten: 'A: Cổ chân và chân', kd: 'kd-pickleball-10', ph: 'ph-pickleball-5', bai: [['di-chuyen-bep'], ['co-chan-day-ngoai'], ['co-chan-day-trong'], ['dung-1-chan-khan'], ['squat-day'], ['lunge-ngang'], ['kiem-got-1-chan']] },
      { ten: 'B: Vai và xoay thân', kd: 'kd-pickleball-10', ph: 'ph-pickleball-5', bai: [['xoay-ngoai-vai-day'], ['keo-rong-day'], ['nang-vai-sau'], ['pallof-press'], ['xoay-nga'], ['gap-co-tay'], ['duoi-co-tay']] },
      { ten: 'C: Nhanh nhẹn và core', kd: 'kd-pickleball-10', ph: 'ph-pickleball-5', bai: [['buoc-tach-chan'], ['truot-ngang'], ['nhay-vach-ngang'], ['tiep-dat-em'], ['plank-cham-vai'], ['cau-mong-1-chan']] },
    ],
  },
  {
    id: 'bong-da-4t', ten: 'Bóng đá: đùi sau, háng, tốc độ', mon: 'bong-da', mucTieu: 'mon', phutBuoi: 45,
    mota: 'Tập bổ trợ cho bóng đá, tập trung các vùng hay bị chấn thương: đùi sau, háng, đầu gối, cổ chân; thêm bật nhảy và đổi hướng. 3 buổi mỗi tuần.',
    giamTaiTruocGiai: true, tuanPlan: T4,
    phien: [
      { ten: 'A: Đùi sau và háng', kd: 'kd-bong-da-15', ph: 'ph-bong-da-10', bai: [['nordic-ho-tro', 'L2x4-6'], ['rdl-ta-don'], ['vo-so'], ['cau-mong-1-chan'], ['ep-goi']] },
      { ten: 'B: Chân và bật nhảy', kd: 'kd-bong-da-15', ph: 'ph-bong-da-10', bai: [['tiep-dat-em'], ['nhay-xa'], ['nhay-1-chan'], ['squat-bulgaria'], ['buoc-len-ghe'], ['kiem-got-1-chan']] },
      { ten: 'C: Tốc độ và core', kd: 'kd-bong-da-15', ph: 'ph-bong-da-10', bai: [['nuoc-rut-tang-toc'], ['chay-chu-t'], ['chay-zigzag'], ['chay-5-10-5'], ['carioca'], ['kep-dui-copenhagen'], ['plank']] },
    ],
  },
  {
    id: 'chay-bo-4t', ten: 'Chạy bộ: chân vững, hông và gân gót', mon: 'chay-bo', mucTieu: 'mon', phutBuoi: 35,
    mota: 'Bổ trợ cho người chạy bộ: bắp chân, gân gót, hông và core để giảm nguy cơ đau gối, ống đồng. 2 đến 3 buổi mỗi tuần, đặt vào ngày chạy nhẹ.',
    giamTaiTruocGiai: true, tuanPlan: T4,
    phien: [
      { ten: 'A: Chân vững', kd: 'kd-chay-bo-10', ph: 'ph-chay-bo-5', bai: [['squat-tach-chan'], ['cau-mong-1-chan'], ['kiem-got-1-chan'], ['ha-got-cham'], ['vo-so'], ['buoc-ngang-day'], ['plank']] },
      { ten: 'B: Hông, core, kỹ thuật', kd: 'kd-chay-bo-10', ph: 'ph-chay-bo-5', bai: [['chay-a-skip'], ['nuoc-rut-tang-toc'], ['rdl-ta-don'], ['nang-chan-ngang'], ['dead-bug'], ['bird-dog']] },
      { ten: 'C: Cổ chân và thăng bằng (nhẹ)', kd: 'kd-chay-bo-5', ph: 'ph-chay-bo-5', bai: [['dung-1-chan-khan'], ['co-chan-day-ngoai'], ['co-chan-day-trong'], ['ban-chan-ngan'], ['di-got-chan'], ['di-mui-chan']] },
    ],
  },
  {
    id: 'suc-manh-tai-nha-4t', ten: 'Sức mạnh toàn thân tại nhà', mon: null, mucTieu: 'suc-manh', phutBuoi: 40,
    mota: 'Chương trình không cần dụng cụ phức tạp: chỉ cần thảm, ghế chắc và có thể thêm tạ đơn hoặc dây. 3 buổi mỗi tuần, nghỉ ít nhất một ngày giữa các buổi.',
    tuanPlan: T4,
    phien: [
      { ten: 'A: Thân dưới', kd: 'kd-chung-10', ph: 'ph-chung-5', bai: [['squat-than-nguoi'], ['lunge-lui'], ['cau-mong'], ['rdl-ta-don', 'L3x10-12'], ['kiem-got-2-chan'], ['ngoi-tuong']] },
      { ten: 'B: Thân trên', kd: 'kd-chung-10', ph: 'ph-chung-5', bai: [['hit-dat-nghieng'], ['keo-day-ngoi'], ['day-vai-ta'], ['curl-tay-truoc'], ['duoi-tay-sau'], ['sieu-nhan']] },
      { ten: 'C: Toàn thân và core', kd: 'kd-chung-10', ph: 'ph-chung-5', bai: [['squat-goblet'], ['hit-dat-quy'], ['keo-ta-1-tay'], ['plank'], ['dead-bug'], ['bird-dog']] },
    ],
  },
  {
    id: 'van-dong-nhe-3t', ten: 'Giảm mỡ bằng vận động nhẹ', mon: null, mucTieu: 'giam-mo', phutBuoi: 30,
    mota: 'Mạch bài tập ít va chạm (không bật nhảy), khoảng 30 phút mỗi buổi, 3 buổi mỗi tuần. Riêng phần bài tập này chỉ khoảng 90 phút mỗi tuần; WHO khuyến nghị người lớn 150 đến 300 phút hoạt động aerobic cường độ vừa mỗi tuần, nên hãy cộng thêm đi bộ nhanh, đạp xe hoặc bơi vào các ngày khác. Không kèm khuyến nghị ăn kiêng; hãy hỏi chuyên gia dinh dưỡng nếu cần.',
    tuanPlan: T3,
    phien: [
      { ten: 'A: Mạch chân và core', kd: 'kd-chung-5', ph: 'ph-chung-5', bai: [['squat-than-nguoi', 'L3x15'], ['lunge-lui', 'L3x10b'], ['cau-mong', 'L3x15'], ['nang-goi-cao', 'T3x30'], ['bird-dog', 'L3x10b'], ['plank', 'T3x20']] },
      { ten: 'B: Mạch thân trên', kd: 'kd-chung-5', ph: 'ph-chung-5', bai: [['hit-dat-nghieng', 'L3x12'], ['keo-day-ngoi', 'L3x15'], ['nang-vai-ben', 'L3x12'], ['squat-cham-ghe', 'L3x15'], ['gap-bung', 'L3x15'], ['chay-tai-cho', 'T3x30']] },
      { ten: 'C: Chân và thăng bằng', kd: 'kd-chung-5', ph: 'ph-chung-5', bai: [['buoc-len-ghe', 'L3x12b'], ['nang-goi-cao', 'T3x30'], ['cau-mong-1-chan', 'L3x10b'], ['plank-cham-vai', 'L3x10'], ['dung-1-chan', 'T3x30b']] },
    ],
  },
  {
    id: 'suc-ben-3t', ten: 'Sức bền cơ và tim phổi', mon: null, mucTieu: 'suc-ben', phutBuoi: 35,
    mota: 'Tăng sức bền cơ bắp và thể lực chung bằng các bài số lần cao, nghỉ ngắn. 3 buổi mỗi tuần.',
    tuanPlan: T3,
    phien: [
      { ten: 'A: Sức bền thân dưới', kd: 'kd-chung-10', ph: 'ph-chung-5', bai: [['squat-than-nguoi', 'L3x20'], ['lunge-lui', 'L3x12b'], ['cau-mong', 'L3x20'], ['kiem-got-2-chan', 'L3x25'], ['nhay-sao-nhe', 'T3x60']] },
      { ten: 'B: Sức bền thân trên', kd: 'kd-chung-10', ph: 'ph-chung-5', bai: [['hit-dat', 'L3x12-20'], ['keo-rong-day', 'L3x20'], ['curl-bua', 'L3x15'], ['duoi-tay-sau', 'L3x15'], ['plank', 'T3x45']] },
      { ten: 'C: Mạch toàn thân', kd: 'kd-chung-10', ph: 'ph-chung-5', bai: [['leo-nui', 'T3x40'], ['squat-than-nguoi', 'L3x20'], ['hit-dat-quy', 'L3x12'], ['nhay-sao-nhe', 'T3x40'], ['gap-bung-xe-dap', 'L3x20']] },
    ],
  },
  {
    id: 'linh-hoat-2t', ten: 'Linh hoạt: giãn cơ cả người', mon: null, mucTieu: 'linh-hoat', phutBuoi: 20,
    mota: 'Chương trình ngắn, nhẹ để cải thiện độ linh hoạt hông, đùi sau, vai và lưng. Hai buổi A và B xoay vòng; chọn 2 đến 4 ngày mỗi tuần, mỗi buổi khoảng 20 phút.',
    tuanPlan: T2,
    phien: [
      { ten: 'A: Thân dưới', kd: 'kd-chung-5', ph: null, bai: [['gian-bap-chan-tuong'], ['gian-dui-sau-nam'], ['gian-hong-co'], ['gian-mong-so-4'], ['gian-khep-hong-buom']] },
      { ten: 'B: Thân trên và lưng', kd: 'kd-chung-5', ph: null, bai: [['meo-bo'], ['gian-nguc-cua'], ['gian-vai-cheo'], ['gian-tay-sau'], ['gian-lung-em-be'], ['xoay-cot-song-nam']] },
    ],
  },
  {
    id: 'phuc-hoi-2t', ten: 'Phục hồi sau tuần nặng', mon: null, mucTieu: 'phuc-hoi', phutBuoi: 20,
    mota: 'Dành cho tuần sau giải hoặc sau thời gian chơi nhiều: vận động nhẹ, giãn cơ và thở. Không phải chương trình điều trị chấn thương.',
    tuanPlan: T2,
    phien: [
      { ten: 'A: Nhẹ nhàng', kd: null, ph: null, bai: [['di-bo-tha-long'], ['lan-con-lan-dui'], ['lan-con-lan-bap'], ['gian-dui-truoc-dung'], ['gian-mong-so-4'], ['tho-bung']] },
      { ten: 'B: Giãn và thở', kd: null, ph: null, bai: [['meo-bo'], ['cho-uop-mat'], ['gian-bung-ran'], ['gian-lung-em-be'], ['gac-chan-tuong']] },
    ],
  },
];

export const MUC_TIEU = {
  'mon': 'Theo môn', 'suc-manh': 'Sức mạnh', 'giam-mo': 'Giảm mỡ vận động nhẹ', 'suc-ben': 'Sức bền', 'linh-hoat': 'Linh hoạt', 'phuc-hoi': 'Phục hồi',
};
