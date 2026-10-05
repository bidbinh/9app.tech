// Sinh docs/NGUON.md từ js/lib/nguon.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sinhMarkdown } from '../js/lib/nguon.js';

const goc = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.writeFileSync(path.join(goc, 'docs', 'NGUON.md'), sinhMarkdown() + '\n', 'utf8');
console.log('Đã sinh docs/NGUON.md');
