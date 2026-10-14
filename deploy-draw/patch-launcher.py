#!/usr/bin/env python3
# Chạy trên máy chủ: thêm ô 9draw vào js/apps.js (trước ô 9family) và tăng ?v= của apps.js trong index.html.
import re, sys

root = sys.argv[1]
apps_p, index_p = f'{root}/js/apps.js', f'{root}/index.html'
apps = open(apps_p, encoding='utf8').read()

if "id: 'draw'" in apps:
    print('apps.js already has 9draw, skipped')
else:
    block = """  {
    id: 'draw',
    index: 'search/draw.json',
    name: '9draw',
    blurb: 'Vẽ tay nhanh, lưu ảnh và chia sẻ lên mạng xã hội',
    href: 'draw/',
    icon: 'icons/draw.svg?v=1',
    category: 'hobby',
    ready: true,
  },
"""
    marker = "  {\n    id: 'family',"
    if apps.count(marker) != 1:
        sys.exit('ERROR: insert point (family tile) not found exactly once; nothing changed.')
    open(apps_p, 'w', encoding='utf8').write(apps.replace(marker, block + marker, 1))
    html = open(index_p, encoding='utf8').read()
    new, n = re.subn(r'(js/apps\.js\?v=)(\d+)', lambda m: m.group(1) + str(int(m.group(2)) + 1), html, count=1)
    if n != 1:
        sys.exit('ERROR: js/apps.js?v= not found in index.html; apps.js changed but version not bumped.')
    open(index_p, 'w', encoding='utf8').write(new)
    print('added 9draw tile and bumped apps.js version')
