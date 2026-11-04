import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoise2D, fbm2, hash2, mulberry32 } from '../src/noise.js';

const SAMPLES = [
  [0.5, 0.5],
  [12.25, -7.75],
  [-103.5, 88.125],
  [1000.31, 2000.99],
  [-0.001, 999.999],
];

test('simplex noise is deterministic for the same seed', () => {
  const a = createNoise2D(42);
  const b = createNoise2D(42);
  for (const [x, y] of SAMPLES) {
    assert.equal(a(x, y), b(x, y));
  }
});

test('different seeds produce different fields', () => {
  const a = createNoise2D(1);
  const b = createNoise2D(2);
  let differences = 0;
  for (const [x, y] of SAMPLES) {
    if (Math.abs(a(x, y) - b(x, y)) > 1e-6) differences += 1;
  }
  assert.ok(differences >= 4, `only ${differences} samples differ`);
});

test('noise stays inside [-1, 1]', () => {
  const noise = createNoise2D(7);
  for (let i = 0; i < 5000; i += 1) {
    const x = (i * 0.637) % 500 - 250;
    const y = (i * 0.911) % 500 - 250;
    const value = noise(x, y);
    assert.ok(Number.isFinite(value));
    assert.ok(value >= -1 && value <= 1, `value ${value} out of range at ${x},${y}`);
  }
});

test('noise is not flat', () => {
  const noise = createNoise2D(3);
  const values = [];
  for (let i = 0; i < 2000; i += 1) values.push(noise(i * 0.37, i * 0.53));
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  assert.ok(Math.sqrt(variance) > 0.15, `stddev ${Math.sqrt(variance)} too low`);
});

test('noise is continuous for tiny steps', () => {
  const noise = createNoise2D(11);
  for (const [x, y] of SAMPLES) {
    const delta = Math.abs(noise(x, y) - noise(x + 1e-3, y + 1e-3));
    assert.ok(delta < 0.01, `jump ${delta} at ${x},${y}`);
  }
});

test('fbm stays normalized and deterministic', () => {
  const noise = createNoise2D(5);
  for (let i = 0; i < 500; i += 1) {
    const x = i * 0.13;
    const y = -i * 0.29;
    const value = fbm2(noise, x, y, 4);
    assert.ok(value >= -1 && value <= 1, `fbm ${value} out of range`);
    assert.equal(value, fbm2(noise, x, y, 4));
  }
});

test('fbm adds detail relative to the base octave', () => {
  const noise = createNoise2D(9);
  let detail = 0;
  for (let i = 0; i < 200; i += 1) {
    const x = i * 0.41;
    const y = i * 0.17;
    detail += Math.abs(fbm2(noise, x, y, 4) - noise(x, y));
  }
  assert.ok(detail > 1);
});

test('hash2 is deterministic, in [0,1) and handles negatives', () => {
  for (const [x, y] of [[0, 0], [-4, 7], [123456, -654321], [-1, -1]]) {
    const first = hash2(x, y);
    assert.equal(first, hash2(x, y));
    assert.ok(first >= 0 && first < 1, `hash ${first} out of range`);
    assert.notEqual(hash2(x, y), hash2(x + 1, y));
  }
});

test('mulberry32 produces a reproducible stream', () => {
  const a = mulberry32(1234);
  const b = mulberry32(1234);
  for (let i = 0; i < 10; i += 1) assert.equal(a(), b());
});
