// Sinh vannien/search-index.json từ dữ liệu văn khấn, mâm cúng và danh sách chức năng cũ.
// Chạy:  node scripts/build-search-index.mjs        (ghi tệp)
//        node scripts/build-search-index.mjs --check (chỉ kiểm tra tệp đã khớp dữ liệu chưa)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expandKeywords } from '../mod/logic.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

/** Các chức năng đã có sẵn của Vạn Niên (bốn tab). */
export const LEGACY = [
  {
    name: 'Lịch âm hôm nay',
    path: '#/hom-nay',
    blurb: 'Ngày âm dương hôm nay, can chi, giờ hoàng đạo, việc nên làm và nên kiêng, hướng xuất hành.',
    keywords: ['lịch vạn niên', 'lịch âm', 'âm lịch', 'hôm nay', 'ngày hôm nay', 'can chi', 'giờ hoàng đạo', 'giờ tốt', 'giờ hắc đạo', 'tiết khí', 'xuất hành', 'hướng xuất hành', 'sao tốt', 'sao xấu', 'trực', 'nhị thập bát tú', 'việc nên làm', 'việc nên kiêng', 'tuổi xung', 'ngày hoàng đạo', 'ngọc hạp'],
  },
  {
    name: 'Lịch tháng âm dương',
    path: '#/lich',
    blurb: 'Lịch cả tháng, ngày âm kèm dương, ngày lễ, tháng đủ tháng thiếu.',
    keywords: ['lịch tháng', 'lịch âm dương', 'lịch dương', 'âm lịch', 'ngày lễ', 'ngày rằm', 'mùng 1', 'tháng đủ', 'tháng thiếu', 'đổi ngày âm dương', 'tra cứu lịch', 'lịch nghỉ lễ'],
  },
  {
    name: 'Xem ngày tốt',
    path: '#/xem-ngay',
    blurb: 'Xếp hạng ngày tốt trong tháng cho việc lớn theo tuổi gia chủ: cưới hỏi, nhập trạch, khai trương, động thổ.',
    keywords: ['xem ngày', 'chọn ngày tốt', 'ngày tốt', 'ngày xấu', 'cưới hỏi', 'kết hôn', 'giá thú', 'nhập trạch', 'tân gia', 'khai trương', 'động thổ', 'sửa nhà', 'xuất hành', 'ký hợp đồng', 'giao dịch', 'nhập học', 'an táng', 'cầu phúc', 'giải hạn', 'hợp tuổi', 'xung tuổi'],
  },
  {
    name: 'Phong thủy bát trạch',
    path: '#/phong-thuy',
    blurb: 'Cung mệnh, hướng nhà hợp tuổi, ngũ hành bản mệnh, màu hợp, số hợp theo năm sinh.',
    keywords: ['phong thủy', 'bát trạch', 'cung mệnh', 'hướng nhà', 'hướng tốt', 'ngũ hành', 'bản mệnh', 'màu hợp', 'số hợp', 'tuổi', 'năm sinh', 'mệnh', 'kim mộc thủy hỏa thổ'],
  },
]

const common = ['vạn niên', 'cúng', 'lễ']

export function buildIndex() {
  const vk = readJSON('mod/data/van-khan.json')
  const mc = readJSON('mod/data/mam-cung.json')
  const out = []

  for (const e of LEGACY) out.push({ name: e.name, keywords: expandKeywords([...e.keywords, e.name]), path: e.path, blurb: e.blurb })

  out.push({
    name: 'Văn khấn',
    keywords: expandKeywords(['văn khấn', 'bài khấn', 'khấn', 'cúng', 'lễ', 'cúng gia tiên', 'rằm', 'mùng 1', 'giỗ', 'tân gia', 'khai trương', 'thần tài', 'ông táo', 'giao thừa', 'tất niên', 'cô hồn', 'lễ chùa', 'đầy tháng', 'thôi nôi', 'cúng xe', 'tảo mộ', 'chữ to', 'đọc to', 'ngày giỗ']),
    path: '#/van-khan',
    blurb: `${vk.items.length} bài khấn theo dịp, tự tính ngày Rằm, mùng Một, ngày giỗ; chữ to, đọc to, in, chia sẻ.`,
  })
  for (const it of vk.items) {
    const kw = [it.name, it.id.replaceAll('-', ' '), 'văn khấn', 'bài khấn', 'khấn', ...common, ...(KEYWORDS_VK[it.id] || [])]
    out.push({ name: `Văn khấn: ${it.name}`, keywords: expandKeywords(kw), path: `#/van-khan/${it.id}`, blurb: it.short })
  }

  out.push({
    name: 'Mâm cúng',
    keywords: expandKeywords(['mâm cúng', 'mâm cỗ', 'cỗ', 'đồ lễ', 'đi chợ', 'danh sách đi chợ', 'ngân sách', 'công thức', 'nguyên liệu', 'mâm của tôi', 'cỗ giỗ', 'cúng tết', 'ngũ quả']),
    path: '#/mam-cung',
    blurb: 'Đồ lễ theo dịp, tính lượng nguyên liệu và ngân sách theo số người, danh sách đi chợ tích từng món.',
  })
  for (const it of mc.items) {
    const kw = [it.name, it.id.replaceAll('-', ' '), 'mâm cúng', 'mâm cỗ', 'đồ lễ', 'đi chợ', ...(KEYWORDS_MC[it.id] || [])]
    out.push({ name: `Mâm cúng: ${it.name}`, keywords: expandKeywords(kw), path: `#/mam-cung/${it.id}`, blurb: it.short })
  }
  out.push({
    name: 'Mâm cúng: Mâm ngũ quả ba miền',
    keywords: expandKeywords(['mâm ngũ quả', 'ngũ quả', 'trái cây', 'miền Bắc', 'miền Trung', 'miền Nam', 'cầu dừa đủ xoài', 'bàn thờ', 'tết']),
    path: '#/mam-cung/ngu-qua',
    blurb: 'Cách chọn năm loại quả của ba miền và ý nghĩa.',
  })
  for (const r of mc.recipes) {
    out.push({
      name: `Công thức: ${r.name}`,
      keywords: expandKeywords([r.name, r.id.replaceAll('-', ' '), 'công thức', 'cách làm', 'nấu', 'món cúng']),
      path: `#/mam-cung/cong-thuc/${r.id}`,
      blurb: `${r.serves}. ${r.time}.`,
    })
  }
  out.push({
    name: 'Về nội dung văn khấn và mâm cúng',
    keywords: expandKeywords(['về nội dung', 'nguồn tham khảo', 'minh bạch', 'phong tục', 'lưu ý']),
    path: '#/ve-noi-dung',
    blurb: 'Cách soạn nội dung, nguồn tham khảo và lưu ý về phong tục.',
  })
  return out
}

/** Từ khóa thêm cho từng bài, những cách gọi quen thuộc khác. */
const KEYWORDS_VK = {
  'ram-mung-1': ['rằm', 'mùng 1', 'mồng 1', 'ngày rằm', 'cúng gia tiên', 'cúng hàng tháng', 'cúng rằm', 'bàn thờ'],
  'than-tai-tho-dia': ['thần tài', 'thổ địa', 'ông địa', 'vía thần tài', 'mùng 10 tháng giêng', 'cửa hàng', 'buôn bán'],
  gio: ['giỗ', 'cúng giỗ', 'ngày giỗ', 'kỵ nhật', 'giỗ cha', 'giỗ mẹ', 'giỗ ông bà', 'người mất', 'tưởng nhớ'],
  'ong-cong-ong-tao': ['ông công ông táo', 'táo quân', '23 tháng chạp', 'cá chép', 'tiễn ông táo'],
  'tat-nien': ['tất niên', 'cuối năm', '30 tết', 'cúng cuối năm'],
  'giao-thua-trong-nha': ['giao thừa', 'đón giao thừa', 'đêm giao thừa', 'cúng giao thừa', 'trong nhà'],
  'giao-thua-ngoai-troi': ['giao thừa', 'đón giao thừa', 'cúng ngoài trời', 'cúng giao thừa', 'ngoài sân'],
  'cung-tet-gia-tien': ['tết', 'mùng 1 tết', 'sáng mùng 1', 'cúng tết', 'năm mới', 'gia tiên'],
  'tan-gia': ['tân gia', 'nhập trạch', 'nhà mới', 'dọn nhà', 'về nhà mới', 'an cư'],
  'khai-truong': ['khai trương', 'mở cửa hàng', 'mở tiệm', 'công ty mới', 'buôn bán'],
  'dong-tho': ['động thổ', 'xây nhà', 'khởi công', 'đào móng', 'làm nhà'],
  'cung-xe': ['cúng xe', 'xe mới', 'mua xe', 'ô tô', 'xe máy', 'lấy xe', 'bình an đi đường'],
  'day-thang': ['đầy tháng', 'cúng mụ', 'bà mụ', 'em bé', 'sơ sinh', 'một tháng tuổi'],
  'thoi-noi': ['thôi nôi', 'một tuổi', 'sinh nhật bé', 'bốc đồ', 'cúng mụ'],
  'co-hon': ['cô hồn', 'chúng sinh', 'rằm tháng 7', 'tháng bảy', 'vu lan', 'xá tội vong nhân', 'cúng ngoài sân'],
  'le-chua': ['lễ chùa', 'đi chùa', 'khấn phật', 'dâng hương', 'chùa', 'đầu năm'],
  'tao-mo': ['tảo mộ', 'thăm mộ', 'thanh minh', 'dọn mộ', 'nghĩa trang', 'viếng mộ'],
}
const KEYWORDS_MC = {
  'mam-ram-mung-1': ['rằm', 'mùng 1', 'cúng gia tiên', 'cúng hàng tháng'],
  'mam-chay': ['cúng chay', 'lễ chùa', 'mâm chay', 'rằm', 'phật'],
  'co-gio': ['cỗ giỗ', 'cúng giỗ', 'giỗ', 'xôi gà', 'mâm cỗ giỗ', 'miền bắc'],
  'cung-tet-bac': ['tết', 'tất niên', 'bánh chưng', 'miền bắc', 'mâm cỗ tết', 'giò chả', 'canh măng'],
  'cung-tet-nam': ['tết', 'tất niên', 'bánh tét', 'miền nam', 'thịt kho trứng', 'khổ qua', 'mâm cỗ tết'],
  'mam-giao-thua': ['giao thừa', 'đêm giao thừa', 'cúng giao thừa'],
  'ong-cong-ong-tao': ['ông công ông táo', 'táo quân', '23 tháng chạp', 'cá chép'],
  'co-day-thang': ['đầy tháng', 'cúng mụ', 'em bé', 'cỗ đầy tháng'],
  'co-thoi-noi': ['thôi nôi', 'một tuổi', 'cỗ thôi nôi', 'bốc đồ'],
  'mam-than-tai': ['thần tài', 'thổ địa', 'ông địa', 'vía thần tài'],
  'mam-tan-gia': ['tân gia', 'nhập trạch', 'nhà mới'],
  'mam-khai-truong': ['khai trương', 'heo quay', 'cửa hàng'],
  'mam-dong-tho': ['động thổ', 'xây nhà', 'khởi công'],
  'mam-cung-xe': ['cúng xe', 'xe mới'],
  'mam-co-hon': ['cô hồn', 'chúng sinh', 'rằm tháng 7', 'vu lan'],
  'mam-tao-mo': ['tảo mộ', 'thăm mộ', 'thanh minh'],
}

const target = path.join(ROOT, 'search-index.json')
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const text = JSON.stringify(buildIndex(), null, 2) + '\n'
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
    if (cur !== text) {
      console.error('search-index.json chưa khớp dữ liệu. Chạy: node scripts/build-search-index.mjs')
      process.exit(1)
    }
    console.log('search-index.json khớp dữ liệu.')
  } else {
    fs.writeFileSync(target, text)
    console.log(`Đã ghi ${target} (${JSON.parse(text).length} mục)`)
  }
}
