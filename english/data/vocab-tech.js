/* Chủ đề: Công nghệ nơi làm việc. */
(function (root) {
  var raw = `
software|n|/ˈsɔftwɛr/|phần mềm|We are switching to new accounting software next month.|A2|Không đếm được: some software.
hardware|n|/ˈhɑrdwɛr/|phần cứng|The company will replace all old hardware this year.|B1
database|n|/ˈdeɪtəbeɪs/|cơ sở dữ liệu|All customer details are stored in the database.|B1
server|n|/ˈsɜrvər/|máy chủ|The server was down for two hours last night.|B1
cloud|n|/klaʊd/|điện toán đám mây|We keep all our files in the cloud.|B1
backup|n|/ˈbækʌp/|bản sao lưu|Always make a backup before you update the system.|B1|Động từ viết tách: to back up.
password|n|/ˈpæswɜrd/|mật khẩu|Please choose a strong password with at least ten characters.|A2
log in|phr v|/lɔɡ ɪn/|đăng nhập|I can't log in to my account.|A2
log out|phr v|/lɔɡ aʊt/|đăng xuất|Remember to log out when you leave your desk.|A2
install|v|/ɪnˈstɔl/|cài đặt|Could you install the new software on my laptop?|A2
bug|n|/bʌɡ/|lỗi phần mềm|We found a bug in the payment system.|B1
glitch|n|/ɡlɪtʃ/|trục trặc nhỏ|A technical glitch delayed the launch.|B2
crash|v|/kræʃ/|bị treo, sập|My computer crashed while I was writing the report.|B1
troubleshoot|v|/ˈtrʌblʃut/|dò lỗi và khắc phục|The IT team is troubleshooting the network problem.|B2
network|n|/ˈnɛtwɜrk/|mạng|The office network is very slow this morning.|A2
bandwidth|n|/ˈbændwɪdθ/|băng thông|Video calls use a lot of bandwidth.|C1
firewall|n|/ˈfaɪərwɔl/|tường lửa|The firewall blocked the suspicious connection.|C1
encryption|n|/ɪnˈkrɪpʃn/|mã hóa|All customer data is protected by encryption.|C1
cybersecurity|n|/ˌsaɪbərsɪˈkjʊrəti/|an ninh mạng|Cybersecurity is a top priority for the bank.|C1
phishing|n|/ˈfɪʃɪŋ/|lừa đảo qua email giả mạo|Never click links in a phishing email.|C1
authentication|n|/ɔˌθɛntɪˈkeɪʃn/|xác thực|Two-factor authentication keeps your account safe.|C1
two-factor|adj|/ˌtu ˈfæktər/|hai yếu tố (xác thực)|Please turn on two-factor login for your account.|B2
platform|n|/ˈplætfɔrm/|nền tảng|Our team uses an online platform to share files.|B1
app|n|/æp/|ứng dụng|You can download the app from the store.|A2
interface|n|/ˈɪntərfeɪs/|giao diện|The new interface is easy to use.|B2
user-friendly|adj|/ˌjuzər ˈfrɛndli/|dễ sử dụng|The tool is powerful and very user-friendly.|B2
feature|n|/ˈfitʃər/|tính năng|The most useful feature is the automatic reminder.|B1
dashboard|n|/ˈdæʃbɔrd/|bảng điều khiển, bảng theo dõi|The dashboard shows daily sales in real time.|B2
integrate|v|/ˈɪntɪɡreɪt/|tích hợp|The app integrates with our calendar.|C1
automate|v|/ˈɔtəmeɪt/|tự động hóa|We want to automate the monthly report.|C1
artificial intelligence|n|/ˌɑrtəˈfɪʃl ɪnˈtɛlədʒəns/|trí tuệ nhân tạo (AI)|Artificial intelligence is changing the way we work.|B2
machine learning|n|/məˈʃin ˈlɜrnɪŋ/|học máy|The system uses machine learning to detect fraud.|C1
data breach|n|/ˈdeɪtə britʃ/|vụ rò rỉ dữ liệu|The company informed customers about the data breach.|C1
download|v|/ˈdaʊnloʊd/|tải xuống|You can download the report from our website.|A2
upload|v|/ˈʌploʊd/|tải lên|Please upload the signed document to the portal.|A2
sync|v|/sɪŋk/|đồng bộ|My phone syncs automatically with my laptop.|B2
API|n|/ˌeɪ pi ˈaɪ/|giao diện lập trình ứng dụng|Our developers use the API to connect the two systems.|C1|Đọc từng chữ cái: ay-pee-eye.
open source|adj|/ˌoʊpən ˈsɔrs/|mã nguồn mở|The tool is open source, so anyone can use it for free.|C1
deploy|v|/dɪˈplɔɪ/|triển khai|We will deploy the update on Saturday night.|C1
release|v|/rɪˈlis/|phát hành|The company will release a new version in June.|B2
version|n|/ˈvɜrʒn/|phiên bản|Are you using the latest version of the software?|B1
patch|n|/pætʃ/|bản vá lỗi|A security patch is available for download.|C1
downtime|n|/ˈdaʊntaɪm/|thời gian hệ thống ngừng hoạt động|The system had two hours of downtime yesterday.|C1
spreadsheet|n|/ˈsprɛdʃit/|bảng tính|I keep track of expenses in a spreadsheet.|B1
cloud storage|n|/klaʊd ˈstɔrɪdʒ/|lưu trữ đám mây|Save the files to cloud storage so everyone can access them.|B1
remote access|n|/rɪˈmoʊt ˈæksɛs/|truy cập từ xa|Remote access lets me work from home.|B2
VPN|n|/ˌvi pi ˈɛn/|mạng riêng ảo|Connect to the VPN before you open company files.|B2|Đọc từng chữ cái: vee-pee-en.
IT support|n|/ˌaɪ ˈti səˈpɔrt/|bộ phận hỗ trợ kỹ thuật|Please contact IT support if your laptop won't start.|B1
helpdesk|n|/ˈhɛlpdɛsk/|bàn hỗ trợ kỹ thuật|I called the helpdesk, and they fixed it in five minutes.|B2
reboot|v|/riˈbut/|khởi động lại|Try rebooting your computer first.|B2
connection|n|/kəˈnɛkʃn/|kết nối|I lost my internet connection during the call.|A2
screen|n|/skrin/|màn hình|Can you see my screen clearly?|A2
keyboard|n|/ˈkibɔrd/|bàn phím|I need a new keyboard because some keys are broken.|A2
file|n|/faɪl/|tệp, tài liệu|Please save the file in the shared folder.|A2
folder|n|/ˈfoʊldər/|thư mục|I put all the invoices in a separate folder.|A2
permission|n|/pərˈmɪʃn/|quyền truy cập|You need permission from your manager to open this file.|B1
delete|v|/dɪˈlit/|xóa|I accidentally deleted the wrong file.|A2
recover|v|/rɪˈkʌvər/|khôi phục|IT managed to recover the lost data.|B2
`;
  var t = { id: 'tech', name: 'Công nghệ nơi làm việc', icon: 'laptop', desc: 'Phần mềm, mạng, bảo mật và hỗ trợ kỹ thuật.', raw: raw };
  if (typeof module !== 'undefined' && module.exports) module.exports = t; else (root.E9 = root.E9 || {}, (root.E9.topics = root.E9.topics || []).push(t));
})(typeof self !== 'undefined' ? self : globalThis);
