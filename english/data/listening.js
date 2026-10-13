/* Bài nghe ngắn (đọc bằng TTS) + câu hỏi trắc nghiệm.
 * lines: [{who: 'A'|'B'|..., text}], mỗi người nói dùng một giọng/cao độ khác nhau.
 * questions: [{q, vi, options[], a (chỉ số đáp án đúng), why}] */
(function (root) {
  var list = [
    {
      id: 'voicemail', title: 'Tin nhắn thoại từ nhà cung cấp', level: 'A2', mins: 1,
      intro: 'Bạn nghe tin nhắn thoại để lại trên điện thoại.',
      lines: [
        { who: 'A', text: 'Hello, this is Anna from Bright Office Supplies. I am calling about your order of printer paper. Unfortunately, we are out of stock of the large boxes. We can deliver the small boxes on Wednesday, or the large boxes next Monday. Please call me back at 555 0142 before noon tomorrow to let me know which you prefer. Thank you.' }
      ],
      questions: [
        { q: 'Why is Anna calling?', vi: 'Anna gọi vì lý do gì?', options: ['To cancel the order for printer paper', 'To report a problem with the order', 'To ask the customer for an overdue payment', 'To offer a discount on future orders'], a: 1, why: 'Cô ấy nói họ hết hàng loại hộp lớn.' },
        { q: 'When can the small boxes be delivered?', vi: 'Hộp nhỏ có thể giao khi nào?', options: ['Next Monday', 'Tomorrow', 'On Wednesday', 'Before noon'], a: 2, why: '"We can deliver the small boxes on Wednesday".' },
        { q: 'What does Anna want the customer to do?', vi: 'Anna muốn khách làm gì?', options: ['Send her an email with the order number', 'Visit the shop to choose a box size', 'Call her back before noon tomorrow', 'Pay for the large boxes online today'], a: 2, why: 'Cô ấy xin gọi lại trước trưa mai để chọn phương án.' }
      ]
    },
    {
      id: 'checkin', title: 'Nhận phòng khách sạn', level: 'A2', mins: 1,
      intro: 'Một khách đến quầy lễ tân.',
      lines: [
        { who: 'A', text: 'Good evening. I have a reservation under the name Tran for two nights.' },
        { who: 'B', text: 'Welcome, Mr. Tran. Let me check. Yes, a single room on the fifth floor. Breakfast is served from six thirty to ten in the restaurant on the ground floor.' },
        { who: 'A', text: 'Thank you. Is there Wi-Fi in the room?' },
        { who: 'B', text: 'Yes, it is free. The password is on your key card. Here is your key. Enjoy your stay.' }
      ],
      questions: [
        { q: 'How long will Mr. Tran stay?', vi: 'Ông Tran ở bao lâu?', options: ['One night', 'Two nights', 'Three nights', 'Five nights'], a: 1, why: '"for two nights".' },
        { q: 'Where is the restaurant?', vi: 'Nhà hàng ở đâu?', options: ['On the fifth floor', 'On the ground floor', 'Next to the lobby bar', 'On the roof'], a: 1, why: 'Restaurant on the ground floor.' },
        { q: 'Where can he find the Wi-Fi password?', vi: 'Ông tìm mật khẩu Wi-Fi ở đâu?', options: ['On his key card', 'At the front desk', 'In the restaurant', 'In an email'], a: 0, why: '"The password is on your key card".' }
      ]
    },
    {
      id: 'deadline-move', title: 'Dời hạn nộp báo cáo', level: 'B1', mins: 1,
      intro: 'Hai đồng nghiệp trao đổi về một hạn chót.',
      lines: [
        { who: 'A', text: 'Hi Mark, do you have a minute? I am worried about the sales report. The deadline is Thursday, but the data from the Danang office has not arrived.' },
        { who: 'B', text: 'I see. When did you expect it?' },
        { who: 'A', text: 'On Monday. I emailed them twice. They said they will send it tomorrow morning.' },
        { who: 'B', text: 'Then we should tell the director. If you get the data tomorrow, can you finish by Friday noon?' },
        { who: 'A', text: 'Yes, I think so, if I start right away. I will draft the other sections today.' },
        { who: 'B', text: 'Good. I will ask the director to move the deadline to Friday afternoon.' }
      ],
      questions: [
        { q: 'What is the problem?', vi: 'Vấn đề là gì?', options: ['The report contains several serious mistakes', 'Data from another office is late', 'The director is on vacation this week', 'The reporting software is not working'], a: 1, why: 'Dữ liệu của văn phòng Đà Nẵng chưa đến.' },
        { q: 'What does Mark plan to do?', vi: 'Mark định làm gì?', options: ['Write the whole report by himself', 'Call the Danang office to complain', 'Ask the director to move the deadline', 'Cancel the sales report completely'], a: 2, why: '"I will ask the director to move the deadline to Friday afternoon".' },
        { q: 'When will the Danang office send the data?', vi: 'Văn phòng Đà Nẵng sẽ gửi dữ liệu khi nào?', options: ['Today', 'Tomorrow morning', 'On Thursday', 'On Friday'], a: 1, why: '"They said they will send it tomorrow morning".' }
      ]
    },
    {
      id: 'office-move', title: 'Thông báo chuyển văn phòng', level: 'B1', mins: 1,
      intro: 'Một thông báo nội bộ của công ty.',
      lines: [
        { who: 'A', text: 'Good morning, everyone. I have an important announcement. Our company will move to a new office on Nguyen Hue Street on March first. The new office is bigger and closer to the metro station. Please pack your personal items by Friday, February twenty-seventh. The IT team will move all computers over the weekend, so everyone can work normally on Monday. If you have any questions about parking or seating, please contact Ms. Lan in the administration department.' }
      ],
      questions: [
        { q: 'On what date will the company move to the new office?', vi: 'Công ty chuyển sang văn phòng mới vào ngày nào?', options: ['February 27', 'March 1', 'March 15', 'April 1'], a: 1, why: '"on March first".' },
        { q: 'What must employees do by February 27?', vi: 'Nhân viên phải làm gì trước ngày 27/2?', options: ['Move all the computers themselves', 'Contact the IT team about seating', 'Pack their personal items', 'Sign a new contract with the landlord'], a: 2, why: '"pack your personal items by Friday the twenty-seventh".' },
        { q: 'Who should employees ask about parking?', vi: 'Hỏi ai về chỗ đậu xe?', options: ['The IT team', 'The director', 'Ms. Lan', 'The metro station'], a: 2, why: 'Ms. Lan ở bộ phận hành chính.' }
      ]
    },
    {
      id: 'interview-listen', title: 'Đoạn phỏng vấn ngắn', level: 'B1', mins: 1,
      intro: 'Nhà tuyển dụng hỏi một ứng viên.',
      lines: [
        { who: 'A', text: 'So, Ms. Pham, you have worked in customer service for three years. Why do you want to change jobs?' },
        { who: 'B', text: 'I really enjoyed helping customers, but I would like more responsibility. In my current job, I cannot lead projects. I am looking for a role where I can manage a small team.' },
        { who: 'A', text: 'I see. Can you give me an example of a difficult situation you handled?' },
        { who: 'B', text: 'Last year, a large client was very unhappy about a late delivery. I called them the same day, explained the problem, and arranged a free replacement. They stayed with us and even increased their order.' }
      ],
      questions: [
        { q: 'Why does Ms. Pham want to change jobs?', vi: 'Vì sao cô Pham muốn đổi việc?', options: ['She dislikes customers', 'She wants a higher salary only', 'She wants more responsibility', 'Her company is closing'], a: 2, why: '"I would like more responsibility".' },
        { q: 'How long has she worked in customer service?', vi: 'Cô làm chăm sóc khách hàng bao lâu?', options: ['One year', 'Two years', 'Three years', 'Five years'], a: 2, why: '"for three years".' },
        { q: 'What happened with the unhappy client?', vi: 'Chuyện gì xảy ra với khách hàng không hài lòng?', options: ['They left the company for a rival', 'They stayed and ordered more', 'They received a refund and a gift', 'They asked to speak to the manager'], a: 1, why: '"They stayed with us and even increased their order".' }
      ]
    },
    {
      id: 'sales-presentation', title: 'Trình bày kết quả quý', level: 'B2', mins: 1,
      intro: 'Một quản lý trình bày kết quả kinh doanh.',
      lines: [
        { who: 'A', text: 'Thank you all for coming. Let me start with the headline: revenue for the third quarter reached twelve million dollars, which is eight percent higher than the same period last year. However, profit grew by only two percent, mainly because shipping costs rose sharply in August. On the positive side, online sales doubled, and they now account for a third of total revenue. Looking ahead, we expect growth to slow slightly in the fourth quarter, so our priority is to control costs.' }
      ],
      questions: [
        { q: 'How much did revenue grow compared with last year?', vi: 'Doanh thu tăng bao nhiêu so với năm ngoái?', options: ['2 percent', '8 percent', '12 percent', '33 percent'], a: 1, why: '12 triệu đô, cao hơn 8 phần trăm so với cùng kỳ.' },
        { q: 'Why did profit grow more slowly?', vi: 'Vì sao lợi nhuận tăng chậm hơn?', options: ['Sales fell in August', 'Shipping costs rose', 'Online sales dropped', 'Prices were cut'], a: 1, why: 'Chi phí vận chuyển tăng mạnh vào tháng Tám.' },
        { q: 'What is the priority for the next quarter?', vi: 'Ưu tiên của quý tới là gì?', options: ['Raising prices', 'Opening new stores', 'Controlling costs', 'Hiring more staff'], a: 2, why: '"our priority is to control costs".' }
      ]
    },
    {
      id: 'negotiation', title: 'Thương lượng báo giá', level: 'B2', mins: 1,
      intro: 'Người mua và người bán thương lượng.',
      lines: [
        { who: 'A', text: 'Thank you for the quote, but the price is higher than we expected. Our budget for this order is around forty thousand dollars.' },
        { who: 'B', text: 'I understand. Our standard price is forty-eight thousand. If you increase the order from five hundred to eight hundred units, I can lower the price per unit by ten percent.' },
        { who: 'A', text: 'That is a big increase for us. Could you also extend the payment terms from thirty to sixty days?' },
        { who: 'B', text: 'Sixty days is difficult. I can offer forty-five, and I will include free delivery.' },
        { who: 'A', text: 'That sounds reasonable. Let me talk to my manager and confirm by tomorrow.' }
      ],
      questions: [
        { q: 'What is the buyer\'s budget?', vi: 'Ngân sách của người mua là bao nhiêu?', options: ['About 8,000 dollars', 'About 40,000 dollars', 'About 48,000 dollars', 'About 60,000 dollars'], a: 1, why: '"around forty thousand dollars".' },
        { q: 'What does the seller offer for a bigger order?', vi: 'Người bán đề nghị gì nếu đặt nhiều hơn?', options: ['Faster delivery on all orders', 'A ten percent lower price per unit', 'A longer warranty on every product', 'A set of free samples for testing'], a: 1, why: 'Tăng từ 500 lên 800 đơn vị thì giảm giá mười phần trăm mỗi đơn vị.' },
        { q: 'How many days to pay does the seller finally offer?', vi: 'Cuối cùng người bán đề nghị bao nhiêu ngày để thanh toán?', options: ['30 days', '45 days', '60 days', '90 days'], a: 1, why: '"I can offer forty-five".' }
      ]
    },
    {
      id: 'it-support', title: 'Gọi bộ phận hỗ trợ kỹ thuật', level: 'B1', mins: 1,
      intro: 'Một nhân viên gọi cho IT vì không đăng nhập được.',
      lines: [
        { who: 'A', text: 'IT support, how can I help you?' },
        { who: 'B', text: 'Hi, I cannot log in to my email. It says my password is wrong, but I am sure I typed it correctly.' },
        { who: 'A', text: 'Did you change your password recently?' },
        { who: 'B', text: 'Yes, last Friday, because the system asked me to.' },
        { who: 'A', text: 'That explains it. Your laptop may still be using the old password. Please restart it and sign in again with the new one. If that does not work, call me back and I will reset it for you.' }
      ],
      questions: [
        { q: 'What is the caller\'s problem?', vi: 'Vấn đề của người gọi là gì?', options: ['The laptop is broken and will not start', 'He cannot log in to his email', 'The Wi-Fi in his office is very slow', 'He lost an important file yesterday'], a: 1, why: '"I cannot log in to my email".' },
        { q: 'When did he change his password?', vi: 'Anh ấy đổi mật khẩu khi nào?', options: ['Yesterday', 'Last Friday', 'This morning', 'Last month'], a: 1, why: '"Yes, last Friday".' },
        { q: 'What should he do first?', vi: 'Anh ấy nên làm gì trước?', options: ['Buy a new laptop for the office', 'Restart the laptop and sign in again', 'Ask IT to visit his desk today', 'Change his password again right away'], a: 1, why: 'IT nói hãy khởi động lại máy và đăng nhập bằng mật khẩu mới.' }
      ]
    }
  ];

  var api = { list: list };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.E9 = root.E9 || {}).listening = api;
})(typeof self !== 'undefined' ? self : globalThis);
