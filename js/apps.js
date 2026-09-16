// Danh mục app trong hệ sinh thái 9app.
// Thêm app mới: một object, một icon SVG, href trỏ tới thư mục app.

export const CATEGORIES = [
  { id: 'fav', label: 'Ưu thích' },
  { id: 'work', label: 'Công việc' },
  { id: 'family', label: 'Gia đình' },
  { id: 'hobby', label: 'Sở thích' },
];

export const APPS = [
  {
    id: 'speed',
    name: '9speed',
    href: 'speed/',
    icon: 'icons/speed.svg',
    categories: ['work'],
    ready: true,
  },
  {
    id: 'pick',
    name: '9pick',
    href: 'pick/',
    icon: 'icons/pick.svg',
    categories: ['hobby'],
    ready: false,
  },
];

export const FAV_KEY = '9app.favs';
export const TAB_KEY = '9app.tab';
