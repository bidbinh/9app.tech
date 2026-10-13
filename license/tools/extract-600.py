#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trích bộ 600 câu hỏi chính thức (Cục Cảnh sát giao thông, Bộ Công an) từ file PDF
sang license/data/questions.json + license/data/img/*.webp.

Chỉ là công cụ tái lập dữ liệu; app chạy không cần Python. Cần: pip install pdfplumber pypdfium2 pillow
Dùng:  python tools/extract-600.py <duong-dan-600-cau.pdf>

Nguyên tắc: KHÔNG sửa nội dung câu hỏi hay đáp án. Đáp án đúng lấy từ dòng được gạch chân trong PDF
(đúng như hướng dẫn của Cục CSGT: "phần đáp án đúng là phần gạch chân dưới câu hỏi").
Mọi câu không xác định được đúng 1 đáp án gạch chân sẽ bị báo lỗi và KHÔNG được đưa vào dữ liệu.
"""
import hashlib, io, json, os, re, sys
import pdfplumber
import pypdfium2 as pdfium

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data')
IMG = os.path.join(OUT, 'img')

CHAPTERS = [(1, 1, 180), (2, 181, 205), (3, 206, 263), (4, 264, 300), (5, 301, 485), (6, 486, 600)]


def chapter_of(n):
    for c, a, b in CHAPTERS:
        if a <= n <= b:
            return c
    raise ValueError(n)


def fix(t):
    # lỗi tách ký tự do font của PDF (đã đối chiếu thủ công): "đường b ộ" -> "đường bộ"
    return t.replace('đường b ộ', 'đường bộ')


def is_dark(c):
    if c is None:
        return True
    if isinstance(c, (int, float)):
        return c < 0.4
    try:
        return all(v < 0.4 for v in c)
    except TypeError:
        return False


def main(pdf_path):
    os.makedirs(IMG, exist_ok=True)
    pdf = pdfplumber.open(pdf_path, pages=list(range(0, int(os.environ.get('MAXP', '9999')))) if os.environ.get('MAXP') else None)
    doc = pdfium.PdfDocument(pdf_path)
    sha = hashlib.sha256(open(pdf_path, 'rb').read()).hexdigest()

    qs = {}          # n -> dict
    order = []
    cur = None
    expected = 1
    img_hash = {}    # sha1 -> filename
    problems = []
    render_cache = {}
    skip_head = False

    for pi, page in enumerate(pdf.pages):
        words = page.extract_words(keep_blank_chars=False, use_text_flow=False, extra_attrs=['size'])
        # đường gạch chân: hình chữ nhật mỏng, màu đen
        ul = [r for r in page.rects if r['height'] < 1.6 and r['width'] > 6 and is_dark(r.get('non_stroking_color'))]
        # gom từ thành dòng theo 'top'
        words.sort(key=lambda w: (round(w['top'], 0), w['x0']))
        lines = []
        for w in words:
            if lines and abs(lines[-1]['top'] - w['top']) < 2.5:
                lines[-1]['w'].append(w)
                lines[-1]['bottom'] = max(lines[-1]['bottom'], w['bottom'])
            else:
                lines.append({'top': w['top'], 'bottom': w['bottom'], 'w': [w]})
        events = []  # (top, kind, payload)
        for ln in lines:
            ln['w'].sort(key=lambda w: w['x0'])
            events.append((ln['top'], 'line', ln))
        for im in page.images:
            events.append((im['top'], 'img', im))
        events.sort(key=lambda e: (e[0], 0 if e[1] == 'line' else 1))

        for top, kind, payload in events:
            if kind == 'img':
                im = payload
                if cur is None:
                    problems.append(f'trang {pi+1}: ảnh trước câu đầu tiên')
                    continue
                if im['x1'] - im['x0'] < 40 or im['top'] < 60 and cur['stage'] == 'o' and False:
                    continue
                cur.setdefault('boxes', []).append((pi, im['x0'], im['top'], im['x1'], im['bottom']))
                continue

            ln = payload
            ws = ln['w']
            ltxt = ' '.join(w['text'] for w in ws)
            if ltxt.startswith('CHƯƠNG ') or (skip_head and not any(ch.islower() for ch in ltxt)):
                skip_head = True
                continue
            skip_head = False
            if re.fullmatch(r'\d{1,3}', ltxt) and (ln['top'] < 70 or ln['top'] > 760):
                continue  # số trang
            if cur is not None and cur.get('boxes') and cur['stage'] == 'q' and re.fullmatch(r'(\d|[A-D])( (\d|[A-D]))*', ltxt):
                cur['labels'] = True  # nhãn số nằm trong ảnh (vd: câu 362)
                continue
            text0 = ws[0]['text']
            # bắt đầu câu mới: "Câu" + "N."
            mq = re.match(r'^Câu\s*(\d+)\s*[.:]\s*(.*)$', ' '.join(w['text'] for w in ws))
            if mq and int(mq.group(1)) == expected:
                n = expected
                expected += 1
                cur = {'id': n, 'qwords': [], 'opts': {}, 'optorder': [], 'ulfound': {}, 'page': pi + 1}
                qs[n] = cur
                order.append(n)
                cur['qwords'].append(mq.group(2))
                cur['stage'] = 'q'
                continue
            if cur is None:
                continue
            if re.fullmatch(r'\d+', ws[0]['text']) and len(ws) == 1 and cur['stage'] == 'q' and False:
                continue
            # tách ô trả lời: các từ "1." "2." ... ở đầu dòng hoặc sau khoảng trống lớn (bố cục 2 cột)
            markers = []
            for i, w in enumerate(ws):
                if re.fullmatch(r'[1-4]\.', w['text']):
                    num = int(w['text'][0])
                    gap = (w['x0'] - ws[i - 1]['x1']) if i > 0 else 999
                    nxt_expected = (cur['optorder'][-1] + 1) if cur['optorder'] else 1
                    if i == 0 and (num == nxt_expected or (cur['stage'] == 'o' and num not in cur['opts'])):
                        markers.append(i)
                    elif i > 0 and gap > 14 and num not in cur['opts'] and markers:
                        markers.append(i)
                    elif i > 0 and gap > 14 and num not in cur['opts'] and cur['stage'] == 'o' and not markers:
                        markers.append(i)
            if markers:
                cur['stage'] = 'o'
                for mi, start in enumerate(markers):
                    end = markers[mi + 1] if mi + 1 < len(markers) else len(ws)
                    seg = ws[start:end]
                    num = int(seg[0]['text'][0])
                    cur['opts'][num] = {'t': [' '.join(w['text'] for w in seg[1:])], 'x0': seg[0]['x0'], 'x1': seg[-1]['x1'],
                                        'lines': [(pi, ln['top'], ln['bottom'], seg[0]['x0'], seg[-1]['x1'])]}
                    cur['optorder'].append(num)
                continue
            if cur['stage'] == 'q':
                cur['qwords'].append(' '.join(w['text'] for w in ws))
            else:
                # dòng nối của ô trả lời gần nhất cùng cột
                cand = None
                for num in reversed(cur['optorder']):
                    o = cur['opts'][num]
                    if o['x0'] - 3 <= ws[0]['x0'] <= o['x1'] + 3 or True:
                        cand = o
                        break
                # bố cục hai cột: chọn cột có x0 gần nhất bên trái
                best = None
                for num in cur['optorder']:
                    o = cur['opts'][num]
                    if o['x0'] <= ws[0]['x0'] + 12 and (best is None or o['x0'] >= best['x0'] - 0.5):
                        best = o
                o = best or cand
                o['t'].append(' '.join(w['text'] for w in ws))
                o['lines'].append((pi, ln['top'], ln['bottom'], ws[0]['x0'], ws[-1]['x1']))
                o['x1'] = max(o['x1'], ws[-1]['x1'])

        # gạch chân: gán cho ô trả lời, chỉ xét các dòng nằm trên trang hiện tại
        for n in order[-14:]:
            q = qs[n]
            for num, o in q['opts'].items():
                for (lp, t0, b0, x0, x1) in o['lines']:
                    if lp != pi:
                        continue
                    for r in ul:
                        if r['top'] >= t0 + (b0 - t0) * 0.55 and r['top'] <= b0 + 3.5 and r['x0'] < x1 and r['x1'] > x0 and (min(r['x1'], x1) - max(r['x0'], x0)) > 0.4 * (x1 - x0):
                            q['ulfound'][num] = True

    if os.environ.get('DBG'):
        for n in map(int, os.environ['DBG'].split(',')):
            print(n, {k: (v['lines'], v['t']) for k, v in qs[n]['opts'].items()}, qs[n]['ulfound'])
    # dựng ảnh cho từng câu (gộp nhiều ảnh cùng trang thành một, kèm nhãn số nếu có)
    for n in order:
        q = qs[n]
        boxes = q.get('boxes') or []
        if not boxes:
            continue
        groups = {}
        for (pi, x0, t, x1, b) in boxes:
            groups.setdefault(pi, []).append((x0, t, x1, b))
        names = []
        for pi, bs in groups.items():
            x0 = min(b[0] for b in bs); t = min(b[1] for b in bs); x1 = max(b[2] for b in bs); bt = max(b[3] for b in bs)
            if len(bs) > 1 or q.get('labels'):
                bt += 22 if q.get('labels') else 0
            scale = 2.0
            if pi not in render_cache:
                render_cache.clear()
                render_cache[pi] = doc[pi].render(scale=scale).to_pil()
            full = render_cache[pi]
            crop = full.crop((int(x0 * scale), int(t * scale), int(x1 * scale), int(bt * scale))).convert('RGB')
            if crop.width > 720:
                crop = crop.resize((720, int(crop.height * 720 / crop.width)))
            buf = io.BytesIO()
            crop.save(buf, 'WEBP', quality=78, method=6)
            data = buf.getvalue()
            key = hashlib.sha1(data).hexdigest()[:12]
            fn = img_hash.get(key)
            if not fn:
                fn = f'{key}.webp'
                img_hash[key] = fn
                with open(os.path.join(IMG, fn), 'wb') as f:
                    f.write(data)
            names.append(fn)
        q['imgs'] = names

    # kết xuất
    out = []
    bad = []
    for n in range(1, 601):
        q = qs.get(n)
        if not q:
            bad.append((n, 'không tìm thấy'))
            continue
        opts = [fix(re.sub(r'\s+', ' ', ' '.join(q['opts'][k]['t'])).strip()) for k in sorted(q['opts'])]
        keys = sorted(q['opts'])
        if keys != list(range(1, len(keys) + 1)) or len(keys) < 2:
            bad.append((n, f'ô trả lời lạ {keys}'))
            continue
        ans = [k for k in keys if q['ulfound'].get(k)]
        if len(ans) != 1:
            bad.append((n, f'số ô gạch chân = {len(ans)} ({ans})'))
            continue
        text = fix(re.sub(r'\s+', ' ', ' '.join(q['qwords'])).strip())
        item = {'id': n, 'ch': chapter_of(n), 'q': text, 'opts': opts, 'a': ans[0] - 1}
        imgs = q.get('imgs') or []
        if imgs:
            item['img'] = imgs[0] if len(imgs) == 1 else imgs
        out.append(item)

    json.dump(out, open(os.path.join(ROOT, 'tools', 'source', 'questions.raw.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('câu hợp lệ:', len(out), '| lỗi:', len(bad), '| ảnh duy nhất:', len(img_hash), '| sha256 PDF:', sha)
    for b in bad:
        print('  LỖI', b)
    for p in problems:
        print('  CẢNH BÁO', p)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
