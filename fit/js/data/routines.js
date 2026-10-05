// Chuỗi khởi động, giãn cơ, phục hồi. Mỗi chuỗi được dựng từ "kho" bài theo số phút (xem lib/routine.js).
export const KHO = {
  'kd-cau-long': ['chay-tai-cho', 'xoay-co-chan', 'xoay-hong', 'xoay-vai-vong', 'xoay-co-tay-ban-tay', 'vung-chan-truoc-sau', 'vung-chan-ngang', 'buoc-xoay-than', 'nang-goi-cao', 'nhay-sao-nhe', 'buoc-tach-chan', 'truot-ngang', 'buoc-cui-cham-san', 'bo-giun', 'chuyen-got-mong'],
  'kd-pickleball': ['chay-tai-cho', 'xoay-co-chan', 'xoay-hong', 'xoay-vai-vong', 'xoay-co-tay-ban-tay', 'vung-chan-ngang', 'nhay-sao-nhe', 'truot-ngang', 'buoc-tach-chan', 'buoc-xoay-than', 'nang-goi-cao', 'buoc-cui-cham-san', 'bo-giun', 'vung-chan-truoc-sau'],
  'kd-bong-da': ['chay-tai-cho', 'xoay-co-chan', 'xoay-hong', 'vung-chan-truoc-sau', 'vung-chan-ngang', 'nang-goi-cao', 'chuyen-got-mong', 'buoc-xoay-than', 'bo-giun', 'carioca', 'chay-a-skip', 'nhay-sao-nhe', 'buoc-cui-cham-san', 'truot-ngang'],
  'kd-chay-bo': ['chay-tai-cho', 'xoay-co-chan', 'xoay-hong', 'vung-chan-truoc-sau', 'vung-chan-ngang', 'nang-goi-cao', 'chuyen-got-mong', 'chay-a-skip', 'buoc-xoay-than', 'ban-chan-ngan', 'bo-giun'],
  'kd-chung': ['chay-tai-cho', 'xoay-co-chan', 'xoay-hong', 'xoay-vai-vong', 'vung-chan-truoc-sau', 'vung-chan-ngang', 'buoc-xoay-than', 'nang-goi-cao', 'nhay-sao-nhe', 'bo-giun', 'buoc-cui-cham-san', 'chuyen-got-mong'],
  'ph-cau-long': ['di-bo-tha-long', 'lac-tha-long', 'gian-bap-chan-tuong', 'gian-dui-sau-nam', 'gian-dui-truoc-dung', 'gian-vai-cheo', 'gian-tay-sau', 'gian-co-tay', 'gian-mong-so-4', 'gian-hong-co', 'gian-co-ben', 'gian-nguc-cua', 'xoay-cot-song-nam', 'tho-bung'],
  'ph-pickleball': ['di-bo-tha-long', 'lac-tha-long', 'gian-bap-chan-tuong', 'gian-dui-sau-nam', 'gian-dui-truoc-dung', 'gian-vai-cheo', 'gian-co-tay', 'gian-tay-sau', 'gian-mong-so-4', 'gian-hong-co', 'gian-co-ben', 'gian-nguc-cua', 'xoay-cot-song-nam', 'tho-bung'],
  'ph-bong-da': ['di-bo-tha-long', 'lac-tha-long', 'gian-dui-sau-nam', 'gian-dui-truoc-dung', 'gian-khep-hong-buom', 'gian-bap-chan-tuong', 'gian-hong-co', 'gian-mong-so-4', 'lan-con-lan-dui', 'lan-con-lan-bap', 'gian-gan-ngang-hong', 'xoay-cot-song-nam', 'gac-chan-tuong', 'tho-bung'],
  'ph-chay-bo': ['di-bo-tha-long', 'lac-tha-long', 'gian-bap-chan-tuong', 'gian-bap-chan-gap', 'gian-dui-sau-nam', 'gian-dui-truoc-dung', 'gian-hong-co', 'gian-mong-so-4', 'gian-khep-hong-buom', 'lan-con-lan-bap', 'lan-con-lan-dui', 'gac-chan-tuong', 'tho-bung'],
  'ph-chung': ['di-bo-tha-long', 'lac-tha-long', 'gian-bap-chan-tuong', 'gian-dui-sau-nam', 'gian-dui-truoc-dung', 'gian-mong-so-4', 'gian-hong-co', 'gian-nguc-cua', 'gian-vai-cheo', 'gian-lung-em-be', 'xoay-cot-song-nam', 'tho-bung'],
  'yoga': ['meo-bo', 'gian-lung-em-be', 'cho-uop-mat', 'gian-bung-ran', 'xoay-cot-song-nam', 'gian-hong-co', 'gian-mong-so-4', 'gian-khep-hong-buom', 'gian-dui-sau-nam', 'gian-nguc-cua', 'chien-binh-2', 'tu-the-cay', 'gian-dui-truoc-dung', 'gian-bap-chan-tuong', 'gian-vai-cheo', 'gian-tay-sau', 'gian-co-ben', 'gac-chan-tuong', 'tho-bung'],
};

const MON_TEN = { 'cau-long': 'Cầu lông', 'pickleball': 'Pickleball', 'bong-da': 'Bóng đá', 'chay-bo': 'Chạy bộ', 'chung': 'Chung' };
const PHUT_KD_PH = [5, 10, 15, 20, 30];
const PHUT_YOGA = [10, 20, 30];

/** Danh sách chuỗi (chưa dựng bước): id, tên, loại, kho, phút. */
export const CHUOI = [];
for (const mon of ['cau-long', 'pickleball', 'bong-da', 'chay-bo', 'chung']) {
  for (const p of PHUT_KD_PH) CHUOI.push({ id: `kd-${mon}-${p}`, ten: `Khởi động ${MON_TEN[mon].toLowerCase()} ${p} phút`, loai: 'khoi-dong', mon, kho: `kd-${mon}`, phut: p });
  for (const p of PHUT_KD_PH) CHUOI.push({ id: `ph-${mon}-${p}`, ten: `Giãn cơ, phục hồi ${MON_TEN[mon].toLowerCase()} ${p} phút`, loai: 'phuc-hoi', mon, kho: `ph-${mon}`, phut: p });
}
for (const p of PHUT_YOGA) CHUOI.push({ id: `yoga-${p}`, ten: `Yoga, giãn cơ cơ bản ${p} phút`, loai: 'yoga', mon: 'chung', kho: 'yoga', phut: p });

/** Quy tắc đầu/cuối từng kho (xem lib/routine.js). Khởi động phải kết thúc bằng bài nâng nhịp tim; buổi giãn kết thúc bằng thả lỏng, thở. */
export const QUY_TAC = {
  'kd-cau-long': { dau: ['chay-tai-cho'], cuoi: ['nhay-sao-nhe'] },
  'kd-pickleball': { dau: ['chay-tai-cho'], cuoi: ['nhay-sao-nhe'] },
  'kd-bong-da': { dau: ['chay-tai-cho'], cuoi: ['chay-a-skip'] },
  'kd-chay-bo': { dau: ['chay-tai-cho'], cuoi: ['chay-a-skip'] },
  'kd-chung': { dau: ['chay-tai-cho'], cuoi: ['nhay-sao-nhe'] },
  'ph-cau-long': { dau: ['di-bo-tha-long', 'lac-tha-long'], cuoi: ['tho-bung'] },
  'ph-pickleball': { dau: ['di-bo-tha-long', 'lac-tha-long'], cuoi: ['tho-bung'] },
  'ph-bong-da': { dau: ['di-bo-tha-long', 'lac-tha-long'], cuoi: ['gac-chan-tuong', 'tho-bung'] },
  'ph-chay-bo': { dau: ['di-bo-tha-long', 'lac-tha-long'], cuoi: ['gac-chan-tuong', 'tho-bung'] },
  'ph-chung': { dau: ['di-bo-tha-long', 'lac-tha-long'], cuoi: ['tho-bung'] },
  'yoga': { dau: [], cuoi: ['gac-chan-tuong', 'tho-bung'] },
};
