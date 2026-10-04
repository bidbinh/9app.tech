/* Chủ đề: Tài chính cơ bản. */
(function (root) {
  var raw = `
revenue|n|/ˈrɛvənu/|doanh thu|The company's revenue reached ten million dollars.|B1
profit|n|/ˈprɑfɪt/|lợi nhuận|We made a small profit in the first quarter.|A2
loss|n|/lɔs/|khoản lỗ|The company reported a loss of two million dollars.|B1
net profit|n|/nɛt ˈprɑfɪt/|lợi nhuận ròng|Net profit rose by twelve percent last year.|B2
gross profit|n|/ɡroʊs ˈprɑfɪt/|lợi nhuận gộp|Gross profit is revenue minus the cost of goods sold.|C1
profit margin|n|/ˈprɑfɪt ˈmɑrdʒɪn/|biên lợi nhuận|Our profit margin is around fifteen percent.|B2
cost|n|/kɔst/|chi phí, giá thành|We need to reduce production costs.|A2
expenses|n|/ɪkˈspɛnsɪz/|các khoản chi|Office rent is our biggest monthly expense.|B1
income|n|/ˈɪnkʌm/|thu nhập|Her annual income is around fifty thousand dollars.|B1
budget|n|/ˈbʌdʒɪt/|ngân sách|The marketing budget was cut by twenty percent.|A2
cash flow|n|/ˈkæʃ floʊ/|dòng tiền|Poor cash flow can be a problem for small businesses.|B2
invoice|n|/ˈɪnvɔɪs/|hóa đơn (đòi tiền)|I'll send you the invoice by the end of the week.|B1
payment|n|/ˈpeɪmənt/|khoản thanh toán|Payment is due within thirty days.|A2
due date|n|/du deɪt/|ngày đến hạn|The due date on this invoice is the 15th.|B1
overdue|adj|/ˌoʊvərˈdu/|quá hạn|This invoice is now two weeks overdue.|B2
balance|n|/ˈbæləns/|số dư|What is the current balance on my account?|B1
asset|n|/ˈæsɛt/|tài sản|The building is the company's biggest asset.|B2
liability|n|/ˌlaɪəˈbɪləti/|nợ phải trả, trách nhiệm pháp lý|Long-term loans are listed as liabilities.|C1
debt|n|/dɛt/|khoản nợ|The company has reduced its debt by half.|B1|Chữ b câm: /dɛt/.
loan|n|/loʊn/|khoản vay|We took out a loan to buy new equipment.|B1
interest rate|n|/ˈɪntrəst reɪt/|lãi suất|The bank has raised interest rates again.|B1
tax|n|/tæks/|thuế|Companies must pay tax on their profits.|A2
VAT|n|/ˌvi eɪ ˈti/|thuế giá trị gia tăng (VAT)|The price includes VAT.|B1|Đọc từng chữ cái: vee-ay-tee.
deposit|n|/dɪˈpɑzɪt/|tiền đặt cọc; tiền gửi|We require a ten percent deposit to confirm the order.|B1
withdraw|v|/wɪðˈdrɔ/|rút (tiền)|You can withdraw cash at any ATM.|B1
transfer|v|/trænsˈfɜr/|chuyển (tiền)|I transferred the money to your account this morning.|B1|Danh từ: a TRANSfer.
account|n|/əˈkaʊnt/|tài khoản|Please send the payment to this bank account.|A2
bank statement|n|/bæŋk ˈsteɪtmənt/|sao kê ngân hàng|Please send a copy of your latest bank statement.|B1
invest|v|/ɪnˈvɛst/|đầu tư|We plan to invest in new technology.|B1
investment|n|/ɪnˈvɛstmənt/|khoản đầu tư|It was a good investment for the company.|B1
return|n|/rɪˈtɜrn/|lợi tức, tỷ suất sinh lời|The expected return on this investment is eight percent.|B2
risk|n|/rɪsk/|rủi ro|All investments carry some risk.|B1
shareholder|n|/ˈʃɛrhoʊldər/|cổ đông|Shareholders will vote on the proposal in May.|B2
stock|n|/stɑk/|cổ phiếu|The company's stock price rose five percent.|B1|Anh-Anh thường dùng share.
dividend|n|/ˈdɪvɪdɛnd/|cổ tức|The company paid a dividend of two dollars per share.|C1
break even|phr v|/breɪk ˈivn/|hòa vốn|We expect to break even by the end of the year.|C1
audit|n|/ˈɔdɪt/|cuộc kiểm toán|The annual audit starts next Monday.|B2
auditor|n|/ˈɔdɪtər/|kiểm toán viên|The auditors found no major problems.|C1
accountant|n|/əˈkaʊntnt/|kế toán|Our accountant prepares the tax returns.|B1
payroll|n|/ˈpeɪroʊl/|bảng lương|Payroll is processed on the 25th of every month.|B2
discount|n|/ˈdɪskaʊnt/|giảm giá|We offer a ten percent discount for early payment.|A2
quote|n|/kwoʊt/|bảng báo giá|Could you send me a quote for fifty units?|B1
purchase order|n|/ˈpɜrtʃəs ˈɔrdər/|đơn đặt hàng mua|We cannot ship until we receive your purchase order.|B2
overhead|n|/ˈoʊvərhɛd/|chi phí chung (thuê nhà, điện...)|We cut overhead by moving to a smaller office.|C1
capital|n|/ˈkæpɪtl/|vốn|The startup needs more capital to grow.|B2
inflation|n|/ɪnˈfleɪʃn/|lạm phát|High inflation makes everyday goods more expensive.|B2
credit|n|/ˈkrɛdɪt/|tín dụng|We can offer thirty days' credit to regular customers.|B1
installment|n|/ɪnˈstɔlmənt/|khoản trả góp|You can pay in six monthly installments.|B2
fee|n|/fi/|phí|There is a small fee for international transfers.|A2
fiscal year|n|/ˈfɪskl jɪr/|năm tài chính|Our fiscal year ends on March 31.|C1
afford|v|/əˈfɔrd/|đủ khả năng chi trả|We cannot afford to hire more staff right now.|B1
spend|v|/spɛnd/|tiêu, chi|We spend too much on travel every year.|A2
save|v|/seɪv/|tiết kiệm|Switching suppliers could save us thousands of dollars.|A2
financial statement|n|/faɪˈnænʃl ˈsteɪtmənt/|báo cáo tài chính|The financial statements are published every quarter.|C1
`;
  var t = { id: 'finance', name: 'Tài chính cơ bản', icon: 'coin', desc: 'Doanh thu, chi phí, hóa đơn, ngân sách và đầu tư.', raw: raw };
  if (typeof module !== 'undefined' && module.exports) module.exports = t; else (root.E9 = root.E9 || {}, (root.E9.topics = root.E9.topics || []).push(t));
})(typeof self !== 'undefined' ? self : globalThis);
