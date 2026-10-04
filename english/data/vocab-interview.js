/* Chủ đề: Phỏng vấn và tuyển dụng. */
(function (root) {
  var raw = `
interview|n|/ˈɪntərvju/|buổi phỏng vấn|I have a job interview on Monday morning.|A2
candidate|n|/ˈkændɪdeɪt/|ứng viên|We have three strong candidates for the position.|B1
applicant|n|/ˈæplɪkənt/|người nộp đơn|More than two hundred applicants applied for the job.|B1
apply for|phr v|/əˈplaɪ fɔr/|nộp đơn xin (việc)|I'd like to apply for the marketing assistant position.|A2
application|n|/ˌæplɪˈkeɪʃn/|đơn xin việc, hồ sơ ứng tuyển|Your application has been received.|A2
résumé|n|/ˈrɛzəmeɪ/|sơ yếu lý lịch, CV|Please attach your résumé to the email.|B1|Anh-Anh dùng CV (curriculum vitae).
cover letter|n|/ˈkʌvər ˈlɛtər/|thư xin việc|A good cover letter explains why you want the job.|B1
position|n|/pəˈzɪʃn/|vị trí công việc|I am interested in the sales manager position.|A2
vacancy|n|/ˈveɪkənsi/|vị trí đang tuyển|We have a vacancy in the finance department.|B2
job opening|n|/dʒɑb ˈoʊpnɪŋ/|vị trí còn trống để tuyển|There is a job opening in our Hanoi office.|B1
qualification|n|/ˌkwɑləfɪˈkeɪʃn/|bằng cấp, năng lực chuyên môn|The job requires a degree and several relevant qualifications.|B2
experience|n|/ɪkˈspɪriəns/|kinh nghiệm|I have five years of experience in customer service.|A2
skill|n|/skɪl/|kỹ năng|Communication is one of my strongest skills.|A2
strength|n|/strɛŋkθ/|điểm mạnh|One of my strengths is staying calm under pressure.|B1
weakness|n|/ˈwiknəs/|điểm yếu|My weakness is that I sometimes take on too much work.|B1
achievement|n|/əˈtʃivmənt/|thành tích|My biggest achievement was leading a team of ten people.|B1
responsibility|n|/rɪˌspɑnsəˈbɪləti/|trách nhiệm, nhiệm vụ|My main responsibility was managing client accounts.|B1
background|n|/ˈbækɡraʊnd/|lý lịch, nền tảng|Tell me about your educational background.|B1
reference|n|/ˈrɛfrəns/|người giới thiệu, thư giới thiệu|Can you provide two references from previous employers?|B2
previous employer|n|/ˈprivijəs ɪmˈplɔɪər/|công ty hoặc người sử dụng lao động trước|My previous employer was a small software company.|B2
notice period|n|/ˈnoʊtɪs ˈpɪriəd/|thời gian báo trước khi nghỉ việc|My notice period is one month.|B2
salary|n|/ˈsæləri/|lương|What salary range are you expecting?|A2
benefits|n|/ˈbɛnəfɪts/|phúc lợi|The package includes health insurance and other benefits.|B1
probation|n|/proʊˈbeɪʃn/|thời gian thử việc|The probation period is two months.|C1
full-time|adj|/ˌfʊl ˈtaɪm/|toàn thời gian|This is a full-time position with a permanent contract.|A2
part-time|adj|/ˌpɑrt ˈtaɪm/|bán thời gian|I'm looking for a part-time job while I study.|A2
contract|n|/ˈkɑntrækt/|hợp đồng|You will receive a one-year contract.|B1
offer|n|/ˈɔfər/|lời mời nhận việc, đề nghị|I'm happy to say we would like to make you an offer.|B1
negotiate|v|/nɪˈɡoʊʃieɪt/|đàm phán, thương lượng|I'd like to negotiate the salary if possible.|B2
promotion|n|/prəˈmoʊʃn/|sự thăng chức|She got a promotion after only two years.|B1
career path|n|/kəˈrɪr pæθ/|con đường sự nghiệp|What career path do you see for yourself in five years?|B2
team player|n|/ˈtim ˌpleɪər/|người làm việc nhóm tốt|I'm a reliable team player who communicates well.|B1
work under pressure|phr|/wɜrk ˈʌndər ˈprɛʃər/|làm việc dưới áp lực|I can work under pressure and meet tight deadlines.|B1
take the initiative|phr|/teɪk ði ɪˈnɪʃətɪv/|chủ động làm|I took the initiative to fix the problem myself.|B2
motivated|adj|/ˈmoʊtəveɪtɪd/|có động lực, hăng hái|I'm a motivated person who enjoys learning new things.|B1
reliable|adj|/rɪˈlaɪəbl/|đáng tin cậy|She is a reliable colleague who always meets deadlines.|B1
adaptable|adj|/əˈdæptəbl/|dễ thích nghi|I'm adaptable and can learn new systems quickly.|B2
proactive|adj|/proʊˈæktɪv/|chủ động|We are looking for a proactive person with fresh ideas.|C1
leadership|n|/ˈlidərʃɪp/|khả năng lãnh đạo|The role requires strong leadership skills.|B2
colleague|n|/ˈkɑliɡ/|đồng nghiệp|I get along well with all my colleagues.|B1|Phát âm: KOL-eeg, không phải "college".
manager|n|/ˈmænɪdʒər/|quản lý|My manager gave me excellent feedback.|A2
resign|v|/rɪˈzaɪn/|xin nghỉ việc|He resigned last month to start his own business.|B2
laid off|adj|/leɪd ɔf/|bị cho nghỉ việc (do cắt giảm)|Many workers were laid off when the factory closed.|B2
hire|v|/ˈhaɪər/|thuê, tuyển dụng|We plan to hire five new engineers this year.|A2
recruit|v|/rɪˈkrut/|tuyển người|The company is recruiting new graduates.|B2
shortlist|n|/ˈʃɔrtlɪst/|danh sách rút gọn ứng viên|You are on the shortlist for the second interview.|C1
panel|n|/ˈpænl/|hội đồng (phỏng vấn)|You will meet a panel of three managers.|C1
onboarding|n|/ˈɑnbɔrdɪŋ/|quá trình hội nhập nhân viên mới|Onboarding takes about two weeks.|C1
training|n|/ˈtreɪnɪŋ/|đào tạo|New staff receive three days of training.|A2
introduce yourself|phr|/ˌɪntrəˈdus jɔrˈsɛlf/|giới thiệu bản thân|Could you briefly introduce yourself?|A2
tell me about yourself|phr|/tɛl mi əˈbaʊt jɔrˈsɛlf/|hãy kể về bản thân bạn|Interviewers often start with "Tell me about yourself".|A2
why do you want this job|phr|/waɪ du ju wɑnt ðɪs dʒɑb/|tại sao bạn muốn công việc này|They asked me, "Why do you want this job?"|A2
walk me through|phr|/wɔk mi θru/|trình bày từng bước cho tôi|Can you walk me through your résumé?|C1
describe a time when|phr|/dɪˈskraɪb ə taɪm wɛn/|hãy kể về một lần mà|Describe a time when you solved a difficult problem.|B2
handle|v|/ˈhændl/|xử lý|How do you handle conflict with a colleague?|B1
challenge|n|/ˈtʃælɪndʒ/|thử thách|I enjoy a new challenge.|A2
multitask|v|/ˌmʌltiˈtæsk/|làm nhiều việc cùng lúc|I can multitask and still meet every deadline.|B2
work experience|n|/wɜrk ɪkˈspɪriəns/|kinh nghiệm làm việc|Do you have any work experience in this field?|A2
graduate|n|/ˈɡrædʒuət/|người tốt nghiệp|We offer a training program for graduates.|B1|Động từ: to GRADuate /ˈɡrædʒueɪt/.
intern|n|/ˈɪntɜrn/|thực tập sinh|She started as an intern and now leads a team.|B1
`;
  var t = { id: 'interview', name: 'Phỏng vấn và tuyển dụng', icon: 'user', desc: 'Từ vựng và cách nói khi xin việc, phỏng vấn, đàm phán lương.', raw: raw };
  if (typeof module !== 'undefined' && module.exports) module.exports = t; else (root.E9 = root.E9 || {}, (root.E9.topics = root.E9.topics || []).push(t));
})(typeof self !== 'undefined' ? self : globalThis);
