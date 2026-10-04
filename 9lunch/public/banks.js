/* Danh sách ngân hàng phổ biến (mã BIN theo NAPAS) để chọn khi nhập tài khoản nhận tiền. */
window.L9 = window.L9 || {};
L9.BANKS = [
  ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'],
  ['970407', 'Techcombank'], ['970422', 'MB Bank'], ['970416', 'ACB'], ['970432', 'VPBank'],
  ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970437', 'HDBank'], ['970441', 'VIB'],
  ['970443', 'SHB'], ['970448', 'OCB'], ['970426', 'MSB'], ['970440', 'SeABank'],
  ['970431', 'Eximbank'], ['970449', 'LPBank'], ['970428', 'Nam A Bank'], ['970409', 'Bac A Bank'],
  ['970454', 'VietCapital Bank'], ['970429', 'SCB'], ['970438', 'BaoViet Bank'], ['970452', 'KienLong Bank'],
  ['970414', 'Oceanbank'], ['970425', 'ABBank'], ['970412', 'PVcomBank'], ['970419', 'NCB'],
  ['970427', 'VietABank'], ['970433', 'VietBank'], ['970434', 'Indovina Bank'], ['970457', 'Woori Bank'],
  ['970458', 'UOB Vietnam'], ['970466', 'KEB Hana'], ['546034', 'CAKE by VPBank'], ['546035', 'Ubank by VPBank'],
  ['963388', 'Timo'], ['422589', 'CIMB Bank'],
];
L9.bankName = function (bin) {
  for (var i = 0; i < L9.BANKS.length; i++) if (L9.BANKS[i][0] === bin) return L9.BANKS[i][1];
  return 'Ngân hàng ' + bin;
};
