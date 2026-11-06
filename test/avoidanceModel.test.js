import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/noise.js';
import { spawnVehicle } from '../src/trafficModel.js';
import {
  AVOID_SHIFT,
  advanceAvoidance,
  avoidanceOffset,
  avoidanceTarget,
  stepAvoidance,
} from '../src/avoidanceModel.js';

function vehicle(overrides = {}) {
  return {
    type: 'passenger',
    x: 0,
    y: 20,
    z: 0,
    heading: 0,
    speed: 20,
    phase: 0,
    avoid: 0,
    avoidSide: 1,
    ...overrides,
  };
}

const ESCORT = { x: 0, y: 20, z: 0 };

test('avoidance only reacts inside the approach cone', () => {
  const ahead = vehicle();
  assert.equal(avoidanceTarget(ahead, { x: 0, y: 20, z: 20 }), AVOID_SHIFT);
  assert.equal(avoidanceTarget(ahead, { x: 0, y: 20, z: 60 }), 0);
  assert.equal(avoidanceTarget(ahead, { x: 0, y: 20, z: -20 }), 0);
  assert.equal(avoidanceTarget(ahead, { x: 8, y: 20, z: 10 }), 0);
  assert.equal(avoidanceTarget(ahead, { x: 0, y: 24, z: 10 }), 0);
  assert.equal(avoidanceTarget(ahead, { x: 0, y: 20, z: 10 }), AVOID_SHIFT);
});

test('avoidance commits to the side away from the escort', () => {
  const right = vehicle();
  assert.equal(avoidanceTarget(right, { x: 2, y: 20, z: 10 }), -AVOID_SHIFT);

  const left = vehicle();
  assert.equal(avoidanceTarget(left, { x: -2, y: 20, z: 10 }), AVOID_SHIFT);

  const centred = vehicle({ avoidSide: -1 });
  assert.equal(avoidanceTarget(centred, { x: 0, y: 20, z: 10 }), -AVOID_SHIFT);
});

test('avoidance eases in and decays back to zero', () => {
  let offset = 0;
  for (let step = 0; step < 24; step += 1) {
    offset = advanceAvoidance(offset, AVOID_SHIFT, 1 / 60);
  }
  assert.ok(offset > AVOID_SHIFT * 0.95, `only reached ${offset}`);

  for (let step = 0; step < 150; step += 1) {
    offset = advanceAvoidance(offset, 0, 1 / 60);
  }
  assert.ok(offset < 0.05, `still ${offset}`);
});

test('avoidance keeps its side through a head-on pass', () => {
  const walker = vehicle({ z: 60, heading: Math.PI, speed: 37.8, avoidSide: 1 });
  const sides = new Set();
  for (let step = 0; step < 360; step += 1) {
    walker.z -= walker.speed / 60;
    const target = avoidanceTarget(walker, ESCORT);
    if (target !== 0) sides.add(Math.sign(target));
    walker.avoid = advanceAvoidance(walker.avoid, target, 1 / 60);
  }
  assert.deepEqual([...sides], [1], 'the side never flips');
});

function sweep(start, heading, speed) {
  const walker = vehicle({ z: start, heading, speed, avoidSide: 1 });
  let closest = Infinity;
  for (let step = 0; step < 60 * 8; step += 1) {
    walker.x += Math.sin(heading) * (speed / 120);
    walker.z += Math.cos(heading) * (speed / 120);
    const target = avoidanceTarget(walker, ESCORT);
    walker.avoid = advanceAvoidance(walker.avoid, target, 1 / 120);
    const offset = avoidanceOffset(walker);
    const distance = Math.hypot(
      walker.x + offset.x - ESCORT.x,
      walker.y - ESCORT.y,
      walker.z + offset.z - ESCORT.z,
    );
    closest = Math.min(closest, distance);
  }
  return { closest, walker };
}

test('a head-on ship never passes through the escort', () => {
  const { closest } = sweep(60, Math.PI, 37.8);
  assert.ok(closest > 3.2, `closest approach ${closest}`);
});

test('an overtaking ship never passes through the escort', () => {
  const { closest } = sweep(-60, 0, 27);
  assert.ok(closest > 3.2, `closest approach ${closest}`);
});

test('avoidance offset is perpendicular to the heading', () => {
  const forward = avoidanceOffset(vehicle({ avoid: 4.2 }));
  assert.ok(Math.abs(forward.x - 4.2) < 1e-6);
  assert.ok(Math.abs(forward.z) < 1e-6);

  const sideways = avoidanceOffset(vehicle({ heading: Math.PI / 2, avoid: 4.2 }));
  assert.ok(Math.abs(sideways.x) < 1e-6);
  assert.ok(Math.abs(sideways.z + 4.2) < 1e-6);
});

test('stepAvoidance returns the eased value', () => {
  const walker = vehicle({ z: 0 });
  const first = stepAvoidance(walker, { x: 0, y: 20, z: 20 }, 1 / 60);
  assert.ok(first > 0 && first < AVOID_SHIFT);

  const calm = stepAvoidance(vehicle({ z: 60 }), { x: 0, y: 20, z: 0 }, 1 / 60);
  assert.equal(calm, 0);
});

test('spawned vehicles start centred with a stable side', () => {
  const rng = mulberry32(7);
  for (let index = 0; index < 50; index += 1) {
    const spawned = spawnVehicle({ x: 0, y: 20, z: 0 }, rng, 100);
    assert.equal(spawned.avoid, 0);
    assert.ok(spawned.avoidSide === 1 || spawned.avoidSide === -1);
  }
});
