// Bộ đọc PDF tối giản để kiểm tra PDF do js/pdf.js ghi ra: bảng xref, độ dài stream, cây trang, ảnh JPEG.
export function parsePdf(bytes) {
  const buf = Buffer.from(bytes);
  const s = buf.toString('latin1');
  if (!s.startsWith('%PDF-1.')) throw new Error('Thiếu tiêu đề %PDF');
  if (!s.endsWith('%%EOF\n')) throw new Error('Thiếu %%EOF cuối file');
  const sx = s.lastIndexOf('startxref');
  const xrefPos = parseInt(s.slice(sx + 9).trim(), 10);
  if (s.slice(xrefPos, xrefPos + 4) !== 'xref') throw new Error('startxref không trỏ tới xref');
  const m = /xref\n0 (\d+)\n/.exec(s.slice(xrefPos));
  const count = parseInt(m[1], 10);
  const entries = [];
  let p = xrefPos + m[0].length;
  for (let i = 0; i < count; i++) {
    const line = s.slice(p, p + 20);
    if (!/^\d{10} \d{5} [nf] \n$/.test(line)) throw new Error(`Dòng xref ${i} sai định dạng: ${JSON.stringify(line)}`);
    entries.push({ off: parseInt(line.slice(0, 10), 10), type: line[17] });
    p += 20;
  }
  const trailer = /trailer\n<<(.*?)>>\nstartxref/s.exec(s.slice(p))[1];
  const size = parseInt(/\/Size (\d+)/.exec(trailer)[1], 10);
  if (size !== count) throw new Error('Size trailer khác số mục xref');
  const rootId = parseInt(/\/Root (\d+) 0 R/.exec(trailer)[1], 10);

  const objs = {};
  for (let i = 1; i < count; i++) {
    const off = entries[i].off;
    const head = `${i} 0 obj\n`;
    if (s.slice(off, off + head.length) !== head) throw new Error(`Offset đối tượng ${i} sai`);
    const bodyStart = off + head.length;
    const si = s.indexOf('stream\n', bodyStart);
    const endObj = s.indexOf('endobj', bodyStart);
    let dict, stream = null;
    if (si !== -1 && si < endObj) {
      dict = s.slice(bodyStart, si).trim();
      const len = parseInt(/\/Length (\d+)/.exec(dict)[1], 10);
      stream = buf.subarray(si + 7, si + 7 + len);
      const tail = s.slice(si + 7 + len, si + 7 + len + 12);
      if (!/^\r?\n?endstream/.test(tail)) throw new Error(`Length stream đối tượng ${i} không khớp`);
    } else {
      dict = s.slice(bodyStart, endObj).trim();
    }
    objs[i] = { dict, stream };
  }
  const root = objs[rootId].dict;
  const pagesId = parseInt(/\/Pages (\d+) 0 R/.exec(root)[1], 10);
  const pagesDict = objs[pagesId].dict;
  const kids = [...pagesDict.match(/\[(.*?)\]/)[1].matchAll(/(\d+) 0 R/g)].map((x) => parseInt(x[1], 10));
  if (kids.length !== parseInt(/\/Count (\d+)/.exec(pagesDict)[1], 10)) throw new Error('Count khác số Kids');
  const pages = kids.map((id) => {
    const d = objs[id].dict;
    const mb = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(d);
    const imgId = parseInt(/\/Im0 (\d+) 0 R/.exec(d)[1], 10);
    const contId = parseInt(/\/Contents (\d+) 0 R/.exec(d)[1], 10);
    const img = objs[imgId];
    const w = parseInt(/\/Width (\d+)/.exec(img.dict)[1], 10);
    const h = parseInt(/\/Height (\d+)/.exec(img.dict)[1], 10);
    const jpeg = img.stream;
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) throw new Error('Ảnh JPEG trong PDF không hợp lệ');
    return { mediaBox: [parseFloat(mb[1]), parseFloat(mb[2])], imgW: w, imgH: h, jpeg, content: objs[contId].stream.toString('latin1'), dict: d };
  });
  const info = Object.values(objs).find((o) => /\/Producer/.test(o.dict));
  return { pages, objs, producer: info && /\/Producer \((.*?)\)/.exec(info.dict)[1], count };
}

/** Tạo JPEG nhỏ hợp lệ giả (đủ SOI/EOI) cho test cấu trúc; kích thước tùy ý. */
export function fakeJpeg(n = 100) {
  const b = new Uint8Array(n);
  b[0] = 0xff; b[1] = 0xd8; b[n - 2] = 0xff; b[n - 1] = 0xd9;
  return b;
}
