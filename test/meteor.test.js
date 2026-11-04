import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/noise.js';
import {
  advanceMeteor,
  isMeteorDone,
  nextMeteorDelay,
  spawnMeteor,
} from '../src/meteorModel.js';

const CAMERA = { x: 7, y: 96, z: 20 };

test('meteor delays stay inside the configured window', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 200; i += 1) {
    const delay = nextMeteorDelay(rng, 7, 16);
    assert.ok(delay >= 7 && delay < 16, `delay ${delay} out of range`);
  }
  assert.equal(nextMeteorDelay(mulberry32(9), 7, 16), nextMeteorDelay(mulberry32(9), 7, 16));
});

test('spawned meteors start high, fall downward and live a short time', () => {
  const rng = mulberry32(5);
  for (let i = 0; i < 100; i += 1) {
    const meteor = spawnMeteor(CAMERA, 0, rng, 260);
    assert.ok(meteor.y > 120, `start y ${meteor.y}`);
    assert.ok(meteor.vy < 0, 'meteor should fall');
    assert.ok(meteor.speed >= 120 && meteor.speed <= 240, `speed ${meteor.speed}`);
    assert.ok(meteor.life > 0.4 && meteor.life < 4, `life ${meteor.life}`);
    assert.ok(Number.isFinite(meteor.length) && meteor.length > 4);
    assert.ok(Number.isFinite(meteor.tint));
    const distance = Math.hypot(meteor.x - CAMERA.x, meteor.z - CAMERA.z);
    assert.ok(distance <= 320, `spawned ${distance} away`);
  }
});

test('meteors spawn in front of the camera heading', () => {
  const rng = mulberry32(8);
  const north = spawnMeteor(CAMERA, 0, rng);
  assert.ok(north.z > CAMERA.z, `north meteor z=${north.z}`);

  const east = spawnMeteor(CAMERA, Math.PI / 2, rng);
  assert.ok(east.x > CAMERA.x, `east meteor x=${east.x}`);
});

test('advanceMeteor moves along its velocity and expires on impact', () => {
  const meteor = spawnMeteor(CAMERA, 0, mulberry32(11));
  const start = { x: meteor.x, y: meteor.y, z: meteor.z };
  advanceMeteor(meteor, 0.1);
  assert.ok(Math.abs(meteor.x - (start.x + meteor.vx * 0.1)) < 1e-9);
  assert.ok(Math.abs(meteor.y - (start.y + meteor.vy * 0.1)) < 1e-9);
  assert.ok(meteor.life < 4);

  let steps = 0;
  while (!isMeteorDone(meteor) && steps < 2000) {
    advanceMeteor(meteor, 1 / 60);
    steps += 1;
  }
  assert.ok(isMeteorDone(meteor));
  assert.ok(meteor.y <= 1e-6 || meteor.life <= 0);
});

test('meteor spawn is deterministic for a shared seed', () => {
  const a = spawnMeteor(CAMERA, 0.4, mulberry32(21));
  const b = spawnMeteor(CAMERA, 0.4, mulberry32(21));
  assert.deepEqual(a, b);
});
