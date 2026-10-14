// Dữ liệu của tôi (xuất, nhập, xóa, cài đặt) và trang giới thiệu, nguồn tham khảo.
import { h, hoi, toast, taiTep, homNay } from '../ui/dom.js';
import * as db from '../lib/db.js';
import * as S from '../lib/store.js';
import { caiDat, luuCaiDat, coGiongDoc, apDungCaiDat } from '../ui/timer.js';
import * as rest from '../ui/rest.js';
import { BAI_TAP } from '../data/exercises.js';
import { CHUONG_TRINH } from '../data/programs.js';
import { theDongBo } from '../lib/nine-sync-ui.js';
import { dongBo, dangNhapUrl } from '../lib/dongbo.js';

export function duLieu(ctx) {
  ctx.datTieuDe('Dữ liệu của tôi');
  const cd = caiDat();
  const dem = { buoi: S.dsBuoi().length, choi: S.dsChoi().length, dodac: S.dsDo().length, test: S.dsTest().length };
  const file = h('input', { type: 'file', accept: 'application/json,.json', id: 'nhap-tep', class: 'offscreen', 'data-testid': 'nhap-tep', tabindex: '-1' });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    let goi;
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('Tệp quá lớn.');
      goi = JSON.parse(await f.text());
    } catch { toast('Không đọc được tệp. Hãy chọn tệp .json do 9fit xuất ra.'); return; }
    const kt = db.kiemTraGoi(goi);
    if (!kt.ok) { toast(kt.loi); return; }
    const ok = await hoi('Nhập dữ liệu từ tệp?', `Tệp có ${kt.soMuc} mục. Dữ liệu hiện có trên máy sẽ được thay bằng dữ liệu trong tệp. Nên xuất sao lưu trước.`, { ok: 'Nhập và thay thế', huy: 'Hủy', nguy: true });
    if (!ok) return;
    try { await db.nhap(goi); toast(kt.bo ? `Đã nhập dữ liệu. Bỏ qua ${kt.bo} dòng bị lỗi trong tệp.` : 'Đã nhập dữ liệu.'); ctx.veLai(); } catch (e) { toast(String(e.message || e)); }
  });
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/them' }, '‹ Thêm'),
    h('section', { class: 'hero' }, h('h1', {}, 'Dữ liệu của tôi'), h('p', {}, 'Dữ liệu sức khỏe là thông tin nhạy cảm. Mặc định 9fit chỉ lưu trên máy này (IndexedDB của trình duyệt), không gửi lên máy chủ và không cần tài khoản. Chỉ khi bạn tự bật đồng bộ ở thẻ bên dưới thì nhật ký tập luyện (không gồm kết quả sàng lọc sức khỏe) mới được lưu thêm trên máy chủ 9app.')),
    !db.trangThai.luuBen ? h('div', { class: 'note warn', role: 'alert', 'data-testid': 'canh-luu' }, h('b', {}, 'Trình duyệt đang không cho lưu bền. '), 'Dữ liệu chỉ giữ đến khi đóng trang (có thể do chế độ riêng tư). Hãy xuất sao lưu thường xuyên.') : null,
    h('div', { class: 'card' }, h('h2', {}, 'Đang lưu trên máy'),
      h('dl', { class: 'kv mt' },
        h('dt', {}, 'Buổi tập'), h('dd', { 'data-testid': 'dem-buoi' }, String(dem.buoi)),
        h('dt', {}, 'Buổi chơi'), h('dd', { 'data-testid': 'dem-choi' }, String(dem.choi)),
        h('dt', {}, 'Số đo cơ thể'), h('dd', {}, String(dem.dodac)),
        h('dt', {}, 'Kết quả kiểm tra'), h('dd', {}, String(dem.test)),
        h('dt', {}, 'Chương trình đang theo'), h('dd', {}, S.layKeHoach() ? 'Có' : 'Không'))),
    h('div', { class: 'card stack' }, h('h2', {}, 'Sao lưu và khôi phục'),
      h('p', { class: 'sub' }, 'Xuất ra một tệp JSON để giữ an toàn hoặc chuyển sang máy khác. Tệp chứa dữ liệu sức khỏe của bạn, hãy cất cẩn thận.'),
      h('button', { type: 'button', class: 'btn block', 'data-testid': 'xuat', onclick: () => { taiTep(`9fit-sao-luu-${homNay()}.json`, JSON.stringify(db.xuat(new Date(Date.now())), null, 1), 'application/json'); toast('Đã tạo tệp sao lưu.'); } }, 'Xuất dữ liệu (JSON)'),
      h('button', { type: 'button', class: 'btn ghost block', 'data-testid': 'nhap', onclick: () => file.click() }, 'Nhập dữ liệu từ tệp'),
      file),
    h('div', { class: 'card stack' }, h('h2', {}, 'Cài đặt'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-testid': 'cd-chu-lon', checked: cd.chuLon, onchange: (e) => { luuCaiDat({ chuLon: e.target.checked }); apDungCaiDat(); } }), 'Chữ lớn'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-testid': 'cd-am', checked: cd.amThanh, onchange: (e) => luuCaiDat({ amThanh: e.target.checked }) }), 'Âm báo khi hết giờ nghỉ'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-testid': 'cd-rung', checked: cd.rung, onchange: (e) => luuCaiDat({ rung: e.target.checked }) }), 'Rung khi hết giờ nghỉ'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-testid': 'cd-doc', checked: cd.docTo, disabled: !coGiongDoc(), onchange: (e) => luuCaiDat({ docTo: e.target.checked }) }), 'Đọc to trong chuỗi khởi động'),
      h('div', { class: 'hint' }, 'Âm và rung còn phụ thuộc cài đặt của trình duyệt và thiết bị.')),
    h('div', { class: 'card stack' }, h('h2', {}, 'Xóa sạch dữ liệu'),
      h('p', { class: 'sub' }, 'Xóa mọi buổi tập, số đo, kết quả sàng lọc và cài đặt khỏi máy này. Không thể hoàn tác, nên xuất sao lưu trước.'),
      h('button', { type: 'button', class: 'btn danger block', 'data-testid': 'xoa-het', onclick: async () => {
        const ok = await hoi('Xóa sạch toàn bộ dữ liệu?', 'Mọi dữ liệu của 9fit trên máy này sẽ bị xóa vĩnh viễn.', { ok: 'Xóa sạch', huy: 'Giữ lại', nguy: true });
        if (!ok) return;
        await db.xoaTatCa(); rest.dung(); apDungCaiDat();
        toast('Đã xóa sạch dữ liệu trên máy này.');
        ctx.veLai();
      } }, 'Xóa sạch dữ liệu')),
    theDongBo({
      h, sync: dongBo, tenApp: '9fit', dangNhapUrl,
      duLieuGom: 'buổi tập, buổi chơi, số đo cơ thể, kết quả kiểm tra và mục tiêu',
      duLieuKhong: 'kết quả sàng lọc sức khỏe, chương trình đang theo, cài đặt riêng của từng máy',
      thongBao: (m) => toast(m), xacNhan: (t, n) => hoi(t, n, { ok: 'Xóa bản trên máy chủ', huy: 'Giữ lại', nguy: true }), lamMoi: () => ctx.veLai(),
    }));
}

export function veUngDung(ctx) {
  ctx.datTieuDe('Giới thiệu và nguồn');
  ctx.root.append(
    h('a', { class: 'lnk', href: '#/them' }, '‹ Thêm'),
    h('section', { class: 'hero' }, h('h1', {}, 'Giới thiệu và nguồn tham khảo')),
    h('div', { class: 'card stack' }, h('h2', {}, '9fit là gì'),
      h('p', {}, `9fit giúp tập bổ trợ cho môn bạn chơi (cầu lông, pickleball, bóng đá, chạy bộ), kèm nhật ký buổi tập. Có ${BAI_TAP.length} bài tập tiếng Việt và ${CHUONG_TRINH.length} chương trình mẫu do 9fit tự biên soạn.`),
      h('p', {}, 'Mọi nội dung và sơ đồ minh họa do 9fit tự viết, tự vẽ; không dùng ảnh hay video có bản quyền của bên khác. Video hướng dẫn tự quay có thể được bổ sung sau.')),
    h('div', { class: 'card stack' }, h('h2', {}, 'Nguồn kiến thức tham khảo'),
      h('ul', { class: 'bul' },
        h('li', {}, 'ACSM, Guidelines for Exercise Testing and Prescription (ấn bản 11): nguyên tắc tăng tải dần và an toàn.'),
        h('li', {}, 'NSCA, Essentials of Strength Training and Conditioning: cách đếm hiệp, lần, nghỉ và kỹ thuật bài cơ bản.'),
        h('li', {}, 'WHO, Guidelines on Physical Activity and Sedentary Behaviour (2020): khuyến nghị vận động chung.'),
        h('li', {}, 'PAR-Q+ (Warburton và cộng sự; Canadian Society for Exercise Physiology): ý của các câu hỏi sàng lọc.'),
        h('li', {}, 'FIFA 11+ (Soligard và cộng sự, BMJ 2008) và các tổng quan về bài Nordic hamstring: ý tưởng chương trình phòng chấn thương bóng đá.'),
        h('li', {}, 'Foster và cộng sự (2001) cho session-RPE; Gabbett (2016) cho ý tưởng acute:chronic workload.'),
        h('li', {}, 'Cooper (1968) cho bài chạy 12 phút; CDC STEADI cho bài ngồi đứng 30 giây.'),
        h('li', {}, 'Tài liệu phòng chấn thương công khai của các liên đoàn và nhà vật lý trị liệu thể thao cho cầu lông, pickleball, chạy bộ.')),
      h('p', {}, h('b', {}, 'Mức xác minh. '), 'Đã được người phản biện độc lập đối chiếu với nguồn gốc: Petersen và cộng sự 2011 (bài Nordic hamstring giảm chấn thương đùi sau), Harøy và cộng sự 2019 (bài Copenhagen và chương trình tương tự FIFA 11+ giảm chấn thương háng), và bộ câu hỏi PAR-Q+. Các phần còn lại (mô tả từng bài, chương trình, ngưỡng tải) dựa trên kiến thức nền phổ biến, chưa tra cứu lại từng tài liệu.'),
      h('p', { class: 'hint' }, 'Chưa có huấn luyện viên hay bác sĩ y học thể thao duyệt nội dung. Hãy xem như tài liệu tham khảo chung; bản sàng lọc là PAR-Q rút gọn tự diễn đạt, không phải bản chính thức.')),
    h('div', { class: 'card stack' }, h('h2', {}, 'Giới hạn'),
      h('ul', { class: 'bul' },
        h('li', {}, 'Không phải tư vấn y tế; không chẩn đoán, không điều trị.'),
        h('li', {}, 'Gợi ý tăng tạ và cảnh báo tải chỉ là quy tắc đơn giản, không biết tình trạng cơ thể của bạn.'),
        h('li', {}, 'Không có lời khuyên về ăn uống, thực phẩm chức năng hay thuốc.'),
        h('li', {}, 'Chưa có AI, chưa nối 9Sport. Đồng bộ qua tài khoản 9app là tùy chọn, mặc định tắt.'))));
}
