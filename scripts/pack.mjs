import { copyFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'dist', 'index.html');
const target = path.join(root, 'neon-city.html');

await copyFile(source, target);
const info = await stat(target);
const megabytes = (info.size / 1024 / 1024).toFixed(2);
console.log(`neon-city.html ready (${megabytes} MB)`);
