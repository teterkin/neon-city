import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, loopSampleCount, renderTrack } from '../scripts/audio/synth.mjs';

test('loop length is sample-accurate at 108 BPM', () => {
  assert.equal(loopSampleCount(108, 16, 44100), 1_568_000);
  assert.equal(loopSampleCount(120, 2, 8000), 32_000);
});

test('renderTrack returns finite stereo audio of the exact loop length', () => {
  const result = renderTrack({ bpm: 120, bars: 2, sampleRate: 8000, seed: 7 });
  const expected = loopSampleCount(120, 2, 8000);
  assert.equal(result.left.length, expected);
  assert.equal(result.right.length, expected);
  assert.ok(result.left instanceof Float32Array);
  assert.ok(result.right instanceof Float32Array);

  let peak = 0;
  let energy = 0;
  for (let i = 0; i < expected; i += 1) {
    const l = result.left[i];
    const r = result.right[i];
    assert.ok(Number.isFinite(l) && Number.isFinite(r), `non-finite sample at ${i}`);
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    energy += l * l + r * r;
  }
  assert.ok(peak <= 1.0001, `peak ${peak} exceeds full scale`);
  assert.ok(peak > 0.2, `peak ${peak} too quiet`);
  assert.ok(Math.sqrt(energy / (expected * 2)) > 0.01, 'track is silent');
});

test('rendering is deterministic for a seed', () => {
  const a = renderTrack({ bpm: 120, bars: 2, sampleRate: 8000, seed: 42 });
  const b = renderTrack({ bpm: 120, bars: 2, sampleRate: 8000, seed: 42 });
  for (let i = 0; i < 1024; i += 1) {
    assert.equal(a.left[i], b.left[i]);
    assert.equal(a.right[i], b.right[i]);
  }
});

test('loop seam is continuous so the loop does not click', () => {
  const { left, right } = renderTrack({ bpm: 120, bars: 2, sampleRate: 8000, seed: 7 });
  const last = left.length - 1;
  assert.ok(Math.abs(left[0] - left[last]) < 0.01, `left seam ${left[0]} vs ${left[last]}`);
  assert.ok(Math.abs(right[0] - right[last]) < 0.01, `right seam ${right[0]} vs ${right[last]}`);
});

test('WAV encoder writes a valid 16-bit stereo riff', () => {
  const left = new Float32Array(8).fill(0.25);
  const right = new Float32Array(8).fill(-0.25);
  const wav = encodeWav(left, right, 44100);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  const ascii = (offset, length) =>
    String.fromCharCode(...wav.slice(offset, offset + length));

  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(view.getUint16(20, true), 1, 'PCM format');
  assert.equal(view.getUint16(22, true), 2, 'stereo');
  assert.equal(view.getUint32(24, true), 44100, 'sample rate');
  assert.equal(view.getUint16(34, true), 16, 'bit depth');
  assert.equal(ascii(36, 4), 'data');
  assert.equal(view.getUint32(40, true), 8 * 2 * 2, 'data size');
  assert.equal(wav.byteLength, 44 + 8 * 2 * 2);
  assert.ok(view.getInt16(44, true) > 0);
  assert.ok(view.getInt16(46, true) < 0);
});
