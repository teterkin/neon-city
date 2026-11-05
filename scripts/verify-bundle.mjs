import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'neon-city.html');
const LIMIT = 3_000_000;

const problems = [];

let html = '';
try {
  html = await readFile(bundle, 'utf8');
} catch {
  problems.push('neon-city.html missing — run npm run build:single');
}

if (html) {
  const info = await stat(bundle);
  if (info.size > LIMIT) {
    problems.push(`bundle is ${(info.size / 1024 / 1024).toFixed(2)} MB, limit is 4.5 MB`);
  }
  if (/<script[^>]+src=/i.test(html)) problems.push('external <script src> found');
  if (/<link[^>]+href=["'](?!data:)/i.test(html)) problems.push('external <link href> found');
  if (/<img[^>]+src=["']https?:/i.test(html)) problems.push('remote <img> found');
  if (/url\(\s*["']?https?:/i.test(html)) problems.push('remote CSS url() found');
  if (!html.includes('WebGLRenderer')) problems.push('three.js is not inlined');
  if (!html.includes('NEON')) problems.push('scene markup missing');
  if (!html.includes('instanceMatrix')) problems.push('city shaders missing');
  if (!html.includes('data:audio/mpeg;base64')) problems.push('soundtrack is not embedded');
  if (!html.includes('AudioContext')) problems.push('audio player missing');

  const assets = [...html.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map((m) => m[1]);
  if (assets.length) problems.push(`script assets: ${assets.join(', ')}`);

  console.log(
    `bundle ${(info.size / 1024).toFixed(0)} KB, inline scripts ${(html.match(/<script/gi) || []).length}, ` +
      `external refs ${assets.length}`,
  );
}

if (problems.length) {
  console.error('bundle verification failed:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log('bundle verification passed');
