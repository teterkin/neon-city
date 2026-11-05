import { writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { encodeWav, loopSampleCount, renderTrack } from './audio/synth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bpm = 108;
const bars = 16;
const sampleRate = 44100;
const seed = 108;

const started = performance.now();
const { left, right } = renderTrack({ bpm, bars, sampleRate, seed });
const renderMs = Math.round(performance.now() - started);

let peak = 0;
let energy = 0;
for (let i = 0; i < left.length; i += 1) {
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  energy += left[i] * left[i] + right[i] * right[i];
}
const rms = Math.sqrt(energy / (left.length * 2));
const duration = left.length / sampleRate;

const wav = encodeWav(left, right, sampleRate);
const target = path.join(root, 'neon-drift-108bpm.wav');
await writeFile(target, wav);
const info = await stat(target);

console.log({
  target,
  bpm,
  bars,
  durationSeconds: Number(duration.toFixed(3)),
  samples: loopSampleCount(bpm, bars, sampleRate),
  peak: Number(peak.toFixed(3)),
  rms: Number(rms.toFixed(4)),
  renderMs,
  fileMegabytes: Number((info.size / 1024 / 1024).toFixed(2)),
});
