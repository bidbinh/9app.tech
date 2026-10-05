// Nguồn bổ sung (tra cứu lần 2, đối chiếu khối lượng) gắn thêm cho từng món. Khóa nguồn khai báo trong sources.js.
export const EXTRA_SRC = {
  'ca-thu-sot-ca-chua': ['vne-cathusot', 'vietnamnet-cathusot'],
  'mien-ga': ['infonet-mienga', 'dienmayhtech-mienga', 'cookpad-mienga'],
  'canh-ngao-nau-chua': ['dmx-canhngao', 'eva-canhngao'],
  'ga-luoc-la-chanh': ['dmx-galuoc', 'cooponline-galuoc'],
  'bun-moc': ['vne-bunmoc', 'tiki-bunmoc'],
  'canh-bi-do-thit-bam': ['hnaau-canhbido', 'cookbeo-canhbido', 'cet-canhbido'],
  'canh-khoai-tay-ca-rot-thit-bam': ['kingfood-canhkhoaitay', 'bluestone-canhkhoaitay'],
  'canh-su-hao-ca-rot-suon': ['tapchimonngon-canhsuonsuhao', 'afamily-canhraucusuon'],
  'nem-ran': ['vietnamnet-nemran', 'vinid-nemran'],
  'dau-phu-nhoi-thit-sot-ca-chua': ['vne-dauphunhoi', 'fptshop-dauphunhoi'],
};

// Thay hẳn danh sách nguồn của món (dùng khi nguồn gán ban đầu không đúng món).
export const OVERRIDE_SRC = {
  'thit-luoc-cham-mam-tom': ['bepanvanphong-bundau'],
  'dau-phu-ran-mam-tom': ['bepanvanphong-bundau'],
  'tom-hap-sa': ['pasgo-tomhapsa', 'dmx-tomhap', 'afamily-tomhapsa'],
  'tom-rang-thit': ['vne-tomrang', 'dmx-tomrang'],
  'tom-rim-man-ngot': ['eva-tomrim', 'vne-tomrang'],
  'muc-hap-gung': ['dmx-muchapgung', 'gofood-muchapgung'],
  'muc-xao-can-tay': ['haisanloccantho-mucxaocantay', 'phunuvagiadinh-mucxaocantay'],
  'ngheu-hap-sa': ['vne-ngaohapsa', 'eva-ngaohapsagung'],
  'vit-luoc-cham-gung': ['ivivu-vitluoc', 'afamily-vitluoc'],
  'bo-ham-khoai-tay-ca-rot': ['bluestone-bapbohamkhoaitay', 'elmich-bohamkhoaitay', 'skds-monmem'],
  'bo-kho-ca-rot': ['cookpad-bokho', 'elmich-bohamkhoaitay'],
  'ca-hap-gung-hanh': ['dmx-cahap', 'ivivu-canuchap', 'eva-cahapgunghanh'],
  'ca-hoi-ap-chao': ['soyte-hatinh-andam'],
  'thit-kho-tieu': ['vietnamnet-thitkhotieu', 'fptshop-thitkhotieu', 'tiki-thitkhotieu'],
  'thit-vien-sot-ca-chua': ['dienmaynewsun-thitvien', 'cookbeo-daus'],
  'bap-cai-xao': ['tiki-luocrau'],
  'bi-do-xao-toi': ['hnaau-rauxaotoi', 'monte-chao-ga-bido'],
  'bo-cuon-la-lot': ['vietnamnet-chalalot', 'kidsplaza-chao-bo-7t'],
  'chan-gio-ham-nam': ['skds-monmem', 'vinmec-caotuoi'],
  'canh-dua-chua-suon': ['hnaau-caichepomdua', 'cookpad-canhsuonchua'],
  'cu-cai-muoi-chua-ngot': ['pasgo-duamuoi', 'vne-buncha'],
};
