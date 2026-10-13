/* Chủ đề: Email công sở. Mỗi dòng: từ | loại từ | IPA (giọng Mỹ) | nghĩa tiếng Việt | câu ví dụ | mức A2-C1 | ghi chú (tùy chọn) */
(function (root) {
  var raw = `
attach|v|/əˈtætʃ/|đính kèm|I have attached the contract for your review.|A2
attachment|n|/əˈtætʃmənt/|tệp đính kèm|Please open the attachment and check the figures.|A2
recipient|n|/rɪˈsɪpiənt/|người nhận|Make sure you have the right recipient before you click send.|B1
subject line|n|/ˈsʌbdʒɪkt laɪn/|dòng tiêu đề của email|Keep the subject line short and specific.|A2
forward|v|/ˈfɔrwərd/|chuyển tiếp (email)|Could you forward this email to the finance team?|A2
reply|v|/rɪˈplaɪ/|trả lời|I will reply to your message by tomorrow morning.|A2
reply all|phr|/rɪˈplaɪ ɔl/|trả lời tất cả mọi người|Please don't reply all unless everyone needs to see your answer.|B1
cc|v|/ˌsi ˈsi/|gửi bản sao đồng gửi (CC)|I'll cc my manager so that she is aware of the situation.|A2|Đọc từng chữ cái: "see-see".
bcc|v|/ˌbi si ˈsi/|gửi bản sao ẩn (người nhận khác không thấy)|Use bcc when you send an email to a large mailing list.|B1
inbox|n|/ˈɪnbɑks/|hộp thư đến|My inbox is full of unread messages.|A2
draft|n|/dræft/|bản nháp|I'll send you the first draft by Friday.|B1
regards|n|/rɪˈɡɑrdz/|lời chào cuối thư (Trân trọng)|I usually end my emails with "Kind regards".|A2|Thường dùng số nhiều: Best regards, Kind regards.
sincerely|adv|/sɪnˈsɪrli/|trân trọng (kết thư trang trọng)|In a formal letter, end with "Sincerely" before your name.|B1|Anh-Mỹ dùng Sincerely; Anh-Anh dùng Yours sincerely (biết tên người nhận) hoặc Yours faithfully (không biết tên).
inquire|v|/ɪnˈkwaɪər/|hỏi thông tin, yêu cầu thông tin|I am writing to inquire about the status of my application.|B2|Anh-Anh thường viết enquire.
follow up|phr v|/ˈfɑloʊ ʌp/|nhắn lại để theo dõi hoặc nhắc việc|I'm following up on my email from last week.|B1
reminder|n|/rɪˈmaɪndər/|thư nhắc, lời nhắc|This is a friendly reminder that the invoice is due on Monday.|B1
confirm|v|/kənˈfɜrm/|xác nhận|Please confirm that you have received the documents.|A2
confirmation|n|/ˌkɑnfərˈmeɪʃn/|sự xác nhận, thư xác nhận|You will receive a confirmation email shortly.|B1
request|v|/rɪˈkwɛst/|yêu cầu, đề nghị|We request that all staff submit their forms by Friday.|B1|Danh từ có trọng âm đầu: a REquest.
enclose|v|/ɪnˈkloʊz/|gửi kèm (trong thư giấy hoặc email)|Please find enclosed a copy of the agreement.|B2
apologize|v|/əˈpɑlədʒaɪz/|xin lỗi|I apologize for the delay in getting back to you.|A2
inconvenience|n|/ˌɪnkənˈvinjəns/|sự bất tiện|We apologize for any inconvenience this may cause.|B1
appreciate|v|/əˈpriʃieɪt/|trân trọng, biết ơn|I really appreciate your quick response.|B1
assistance|n|/əˈsɪstəns/|sự hỗ trợ|Thank you for your assistance with this matter.|B1
as soon as possible|phr|/æz sun æz ˈpɑsəbl/|càng sớm càng tốt|Could you send me the file as soon as possible?|A2
deadline|n|/ˈdɛdlaɪn/|hạn chót|The deadline for the proposal is next Thursday.|A2
availability|n|/əˌveɪləˈbɪləti/|lịch rảnh, sự sẵn sàng|Please let me know your availability next week.|B1
acknowledge|v|/əkˈnɑlɪdʒ/|xác nhận đã nhận, ghi nhận|Please acknowledge receipt of this email.|B2
receipt|n|/rɪˈsit/|việc đã nhận được; biên lai|I'm writing to confirm receipt of your application.|B1|Chữ p câm.
in advance|phr|/ɪn ədˈvæns/|trước, từ trước|Thank you in advance for your help.|B1
out of office|phr|/aʊt əv ˈɔfɪs/|vắng mặt khỏi văn phòng|I'm out of office until Monday and have limited access to email.|A2
auto-reply|n|/ˈɔtoʊ rɪˌplaɪ/|thư trả lời tự động|Her auto-reply says she is on leave until the 15th.|B1
mailing list|n|/ˈmeɪlɪŋ lɪst/|danh sách gửi thư|Please add me to the mailing list.|B1
unsubscribe|v|/ˌʌnsəbˈskraɪb/|hủy đăng ký nhận tin|I clicked unsubscribe, but the emails keep coming.|B1
spam|n|/spæm/|thư rác|Your message went to my spam folder.|A2
signature|n|/ˈsɪɡnətʃər/|chữ ký (cuối email)|Please add your phone number to your email signature.|B1
proofread|v|/ˈprufrid/|đọc soát lỗi|Always proofread your email before you send it.|B1
concise|adj|/kənˈsaɪs/|ngắn gọn, súc tích|Try to keep your emails clear and concise.|B2
urgent|adj|/ˈɜrdʒənt/|khẩn cấp|This is urgent, so please reply today.|A2
misunderstanding|n|/ˌmɪsʌndərˈstændɪŋ/|sự hiểu lầm|Sorry, there seems to be a misunderstanding.|B1
clarify|v|/ˈklærəfaɪ/|làm rõ|Could you clarify what you mean by "soon"?|B2
clarification|n|/ˌklærəfɪˈkeɪʃn/|sự làm rõ, lời giải thích thêm|I need some clarification on the second point.|B2
notify|v|/ˈnoʊtəfaɪ/|thông báo cho ai|Please notify us of any changes to your address.|B2
respond|v|/rɪˈspɑnd/|phản hồi|Thank you for responding so quickly.|B1
promptly|adv|/ˈprɑmptli/|ngay lập tức, đúng giờ|We aim to answer all emails promptly.|B2
further|adj|/ˈfɜrðər/|thêm nữa|If you need any further information, please contact me.|B1
regarding|prep|/rɪˈɡɑrdɪŋ/|liên quan đến, về việc|I am writing regarding your invoice.|B1
per our conversation|phr|/pɜr ˈaʊər ˌkɑnvərˈseɪʃn/|theo như trao đổi của chúng ta|Per our conversation, I have updated the schedule.|B2
look forward to|phr|/lʊk ˈfɔrwərd tu/|mong chờ|I look forward to hearing from you.|A2|Sau "to" dùng V-ing: look forward to hearing, không phải to hear.
get back to|phr v|/ɡɛt bæk tu/|trả lời lại cho ai sau|I'll get back to you by the end of the day.|B1
keep in the loop|idiom|/kip ɪn ðə lup/|cập nhật thông tin cho ai|Please keep me in the loop on this project.|B2
heads-up|n|/ˈhɛdz ʌp/|thông báo trước, lời báo trước|Just a quick heads-up: the meeting has moved to 3 p.m.|B2
on behalf of|phr|/ɑn bɪˈhæf əv/|thay mặt cho|I am writing on behalf of the sales team.|B2
reach out|phr v|/ritʃ aʊt/|liên hệ|Feel free to reach out if you have any questions.|B1
recap|n|/ˈrikæp/|bản tóm tắt lại|Here is a quick recap of what we agreed.|B2
summarize|v|/ˈsʌməraɪz/|tóm tắt|Let me summarize the main points below.|B1
bullet point|n|/ˈbʊlɪt pɔɪnt/|gạch đầu dòng|I listed the key actions as bullet points.|B1
template|n|/ˈtɛmplət/|mẫu, khuôn mẫu|Please use the template for all customer replies.|B1
typo|n|/ˈtaɪpoʊ/|lỗi gõ nhầm|Sorry for the typo in my last email.|B1
delay|n|/dɪˈleɪ/|sự chậm trễ|Please accept our apologies for the delay.|A2
contact|n|/ˈkɑntækt/|thông tin liên lạc; người liên hệ|Please send me your contact details.|A2|Danh từ trọng âm đầu; động từ có thể là con-TACT.
sender|n|/ˈsɛndər/|người gửi|The sender's address looks suspicious.|A2
deliver|v|/dɪˈlɪvər/|gửi đến, giao|The message could not be delivered.|B1
bounce|v|/baʊns/|bị trả lại (email không gửi được)|My email bounced because the address was wrong.|B2
cordial|adj|/ˈkɔrdʒl/|thân mật, lịch sự ấm áp|He sent a cordial reply to our invitation.|C1
courteous|adj|/ˈkɜrtiəs/|lịch sự, nhã nhặn|The tone of her email was polite and courteous.|C1
tone|n|/toʊn/|giọng điệu (của văn bản)|The tone of your message sounds a little harsh.|B1
formal|adj|/ˈfɔrml/|trang trọng|Use a formal greeting when you write to a new client.|A2
`;
  var t = { id: 'email', name: 'Email công sở', icon: 'mail', desc: 'Viết, trả lời và chuyển tiếp email chuyên nghiệp.', raw: raw };
  if (typeof module !== 'undefined' && module.exports) module.exports = t; else (root.E9 = root.E9 || {}, (root.E9.topics = root.E9.topics || []).push(t));
})(typeof self !== 'undefined' ? self : globalThis);
