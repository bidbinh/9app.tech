// Đọc các tệp xlsx của WHO (đã tải về thư mục dir) và ghi data/who-*.json. Chạy một lần khi cập nhật bảng:
//   node scripts/who-extract.mjs <thư mục chứa xlsx>
// Không phụ thuộc thư viện: tự giải nén zip + đọc XML.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString();
    const ln = buf.readUInt16LE(off + 26), le = buf.readUInt16LE(off + 28);
    const data = buf.slice(off + 30 + ln + le, off + 30 + ln + le + csize);
    files[name] = method === 0 ? data : zlib.inflateRawSync(data);
    p += 46 + nl + el + cl;
  }
  return files;
}
const colNum = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
export function readSheet(file) {
  const z = unzip(fs.readFileSync(file));
  const ss = z['xl/sharedStrings.xml'] ? [...z['xl/sharedStrings.xml'].toString().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')) : [];
  const sheet = z['xl/worksheets/sheet1.xml'].toString();
  const rows = [];
  for (const rm of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(cm[1])[1]; const t = /t="(\w+)"/.exec(cm[1]);
      const v = cm[2] && /<v>([\s\S]*?)<\/v>/.exec(cm[2]);
      if (!v) continue;
      row[colNum(ref)] = t && t[1] === 's' ? ss[+v[1]] : (t && t[1] === 'str' ? v[1] : Number(v[1]));
    }
    rows.push(row);
  }
  return rows;
}
// trả [{x, L, M, S}] theo cột tiêu đề; x là tháng tuổi (hoặc tuần/ngày tùy tệp)
function lms(file) {
  const rows = readSheet(file); const head = rows[0].map((s) => String(s).trim());
  const iL = head.indexOf('L'), iM = head.indexOf('M'), iS = head.indexOf('S');
  const iX = head.findIndex((s) => /^(Month|Day|Week|Age)/i.test(s));
  if (iL < 0 || iM < 0 || iS < 0 || iX < 0) throw new Error(file + ' thiếu cột: ' + head.join('|'));
  return { unit: head[iX], rows: rows.slice(1).filter((r) => typeof r[iX] === 'number').map((r) => [r[iX], r[iL], r[iM], r[iS]]) };
}
if (process.argv[1] && process.argv[1].endsWith('who-extract.mjs')) {
  const dir = process.argv[2];
  const j = (f) => lms(path.join(dir, f));
  const join = (a, b) => { if (a.unit !== b.unit) throw new Error('khác đơn vị'); const last = a.rows[a.rows.length - 1][0]; return { unit: a.unit, rows: [...a.rows, ...b.rows.filter((r) => r[0] > last)] }; };
  const sets = {
    wfa: { title: 'Cân nặng theo tuổi (kg)', unit: 'kg', src05: { b: j('wfa_b.xlsx'), g: j('wfa_g.xlsx') } },
    lhfa: { title: 'Chiều dài/chiều cao theo tuổi (cm)', unit: 'cm', src05: { b: join(j('lhfa_b02.xlsx'), j('lhfa_b25.xlsx')), g: join(j('lhfa_g02.xlsx'), j('lhfa_g25.xlsx')) } },
    hcfa: { title: 'Vòng đầu theo tuổi (cm)', unit: 'cm', src05: { b: j('hcfa_b.xlsx'), g: j('hcfa_g.xlsx') } },
    bfa: { title: 'BMI theo tuổi (kg/m²)', unit: 'kg/m²', src05: { b: join(j('bmi_b02.xlsx'), j('bmi_b25.xlsx')), g: join(j('bmi_g02.xlsx'), j('bmi_g25.xlsx')) } },
  };
  fs.mkdirSync('data', { recursive: true });
  const ref = { lhfa: 'hfa519', bfa: 'bmi519' };
  const retrieved = new Date().toISOString().slice(0, 10);
  const SRC = {
    wfa: 'https://www.who.int/tools/child-growth-standards/standards/weight-for-age',
    lhfa: 'https://www.who.int/tools/child-growth-standards/standards/length-height-for-age',
    hcfa: 'https://www.who.int/tools/child-growth-standards/standards/head-circumference-for-age',
    bfa: 'https://www.who.int/toolkits/child-growth-standards/standards/body-mass-index-for-age-bmi-for-age',
  };
  for (const [k, s2] of Object.entries(sets)) {
    const out = {
      indicator: k, title: s2.title, unit: s2.unit, retrieved,
      source: 'WHO Child Growth Standards (0-5 tuổi, bảng L, M, S theo tháng tuổi): ' + SRC[k],
      sourceRef: ref[k] ? 'WHO Growth reference 5-19 tuổi (2007), bảng L, M, S theo tháng tuổi: https://www.who.int/tools/growth-reference-data-for-5to19-years' : null,
      method: 'Giá trị tại z: M*(1+L*S*z)^(1/L) (L khác 0) hoặc M*exp(S*z) (L = 0). Cột: [tháng tuổi, L, M, S].',
      sets: {},
    };
    for (const sx of ['b', 'g']) {
      const sex = sx === 'b' ? 'nam' : 'nu';
      out.sets[sex] = { std: s2.src05[sx].rows };
      if (ref[k]) {
        const rows = readSheet(path.join(dir, ref[k] + '_' + sx + '.xlsx'));
        const head = rows[0].map((x) => String(x).trim());
        const [iX, iL, iM, iS] = ['Month', 'L', 'M', 'S'].map((c) => head.indexOf(c));
        out.sets[sex].ref = rows.slice(1).filter((r) => typeof r[iX] === 'number').map((r) => [r[iX], r[iL], r[iM], r[iS]]);
      }
    }
    fs.writeFileSync('data/who-' + k + '.json', JSON.stringify(out));
    console.log('ghi data/who-' + k + '.json', fs.statSync('data/who-' + k + '.json').size, 'byte');
  }
}
