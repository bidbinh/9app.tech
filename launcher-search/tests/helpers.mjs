import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
export const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NS = require('../js/search.js');
export function loadApps() {
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(readFileSync(join(HERE, 'js/apps.js'), 'utf8') + '\n;this.APPS=APPS;this.CATEGORIES=CATEGORIES;', sb);
  return { APPS: sb.APPS, CATEGORIES: sb.CATEGORIES };
}
// Dựng engine như launcher: chỉ mục riêng (vannien lấy bản trong repo, còn lại trong search/)
export function buildEngine() {
  const { APPS, CATEGORIES } = loadApps();
  const eng = new NS.Engine();
  let total = 0;
  for (const app of APPS) {
    if (!app.ready) continue;
    let list = app.features || [];
    if (app.index) {
      const file = app.index.startsWith('vannien/') ? join(HERE, '..', app.index) : join(HERE, app.index);
      list = list.concat(JSON.parse(readFileSync(file, 'utf8')));
    }
    const label = (CATEGORIES.find((c) => c.id === app.category) || {}).label || '';
    const docs = [];
    for (const raw of list) {
      const f = NS.normalizeFeature(raw);
      if (!f) continue;
      const href = NS.resolveHref(app.href, f.path, 'https://9app.tech/');
      if (!href) continue;
      docs.push(NS.makeDoc(app, f, href, label));
    }
    eng.setDocs(app.id + ':index', docs);
    total += docs.length;
  }
  return { eng, APPS, total };
}
