import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const questions = JSON.parse(fs.readFileSync(path.join(root, 'data/questions.json'), 'utf8'));
export const sets = JSON.parse(fs.readFileSync(path.join(root, 'data/sets.json'), 'utf8'));
