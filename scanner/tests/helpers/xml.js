// Kiểm tra XML đơn giản cho kiểm thử: thẻ đóng/mở khớp, thuộc tính có nháy, ký tự hợp lệ. Không phải bộ phân tích đầy đủ.
export function checkXml(xml, name = 'xml') {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml)) throw new Error(name + ': có ký tự điều khiển không hợp lệ');
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<\?[^?]*\?>|<!--[\s\S]*?-->/g;
  let last = 0, m;
  while ((m = re.exec(xml))) {
    const between = xml.slice(last, m.index);
    if (/[<]/.test(between)) throw new Error(name + ': thẻ lỗi gần ' + JSON.stringify(between.slice(0, 60)));
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(between)) throw new Error(name + ': dấu & chưa thoát');
    last = re.lastIndex;
    if (!m[2]) continue;
    if (m[4]) continue; // thẻ tự đóng
    if (m[1]) { const top = stack.pop(); if (top !== m[2]) throw new Error(`${name}: thẻ đóng </${m[2]}> không khớp <${top}>`); } else stack.push(m[2]);
  }
  if (/[<]/.test(xml.slice(last))) throw new Error(name + ': thẻ lỗi ở cuối');
  if (stack.length) throw new Error(name + ': thiếu thẻ đóng ' + stack.join(','));
  return true;
}

/** Lấy chữ trong thẻ <w:t>/<t> và gỡ thoát thực thể. */
export function xmlText(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(?:w:)?t(?:\s[^>]*)?>([^<]*)<\/(?:w:)?t>/g)) out.push(m[1]);
  return out.join('\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
