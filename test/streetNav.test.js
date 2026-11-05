import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/noise.js';
import { StreetNav } from '../src/streetNav.js';
import { CELL, AVENUE_EVERY } from '../src/config.js';
import { avenueCenterX } from '../src/layout.js';

const STEP = 1 / 60;
const SPEED = 22;

function laneError(value) {
  return Math.abs(value - avenueCenterX(value));
}

function run(nav, seconds) {
  const steps = Math.round(seconds / STEP);
  let state = null;
  for (let i = 0; i < steps; i += 1) state = nav.update(STEP, SPEED);
  return state;
}

test('completeTurn finishes a turn and snaps onto the new lane', () => {
  const nav = new StreetNav({ x: avenueCenterX(0), z: 0, rng: () => 0 });
  for (let i = 0; i < 800 && nav.turns.length === 0; i += 1) nav.update(STEP, SPEED);
  assert.equal(nav.turning, true);
  nav.completeTurn();
  assert.equal(nav.turning, false);
  assert.ok(Math.abs(nav.heading - Math.PI / 2) < 1e-9);
  assert.ok(laneError(nav.z) < 1e-9);
});

test('street nav flies straight when turns are disabled', () => {
  const nav = new StreetNav({ x: avenueCenterX(0), z: 0, rng: () => 0.99, turnChance: 0 });
  const state = run(nav, 60);
  assert.equal(nav.turns.length, 0);
  assert.ok(Math.abs(state.heading) < 1e-9);
  assert.ok(laneError(state.x) < 1e-6, `x ${state.x} left the avenue`);
  assert.ok(state.z > 900);
});

test('street nav turns every one or two blocks', () => {
  const nav = new StreetNav({ x: avenueCenterX(0), z: 0, rng: mulberry32(2024) });
  run(nav, 100);
  assert.ok(nav.turns.length >= 8, `only ${nav.turns.length} turns in 100s`);

  const gaps = [];
  for (let i = 1; i < nav.turns.length; i += 1) {
    gaps.push(nav.turns[i].time - nav.turns[i - 1].time);
  }
  for (const gap of gaps) {
    assert.ok(gap >= 4 && gap <= 10, `turn gap ${gap.toFixed(2)}s outside 4-10s`);
  }
  assert.ok(nav.turns[0].time <= 10);
});

test('turns start at the intersection entry, before its centre', () => {
  const nav = new StreetNav({ x: avenueCenterX(0), z: 0, rng: () => 0 });
  let state = null;
  for (let i = 0; i < 800 && nav.turns.length === 0; i += 1) {
    state = nav.update(STEP, SPEED);
  }
  assert.equal(nav.turns.length, 1, 'expected one turn');

  const turn = nav.turns[0];
  const center = avenueCenterX(turn.z);
  assert.ok(
    turn.z >= center - CELL / 2 - 1e-6,
    `turn ${turn.z} started before the intersection entry ${center - CELL / 2}`,
  );
  assert.ok(
    turn.z < center - 1,
    `turn ${turn.z} started at/after the centre ${center}`,
  );

  for (let i = 0; i < 200 && nav.turning; i += 1) {
    state = nav.update(STEP, SPEED);
  }
  assert.ok(!nav.turning);
  assert.ok(
    Math.abs(state.z - center) < 1e-6,
    `lane merge ended at ${state.z}, expected ${center}`,
  );
});

test('street nav turns at intersections and stays on the new lane', () => {
  const nav = new StreetNav({ x: avenueCenterX(0), z: 0, rng: () => 0 });
  const state = run(nav, 6);
  assert.equal(nav.turns.length, 1);

  const turn = nav.turns[0];
  assert.ok(laneError(turn.x) < 1e-6, `turn x ${turn.x} is not an intersection`);
  assert.ok(
    Math.abs(turn.z - avenueCenterX(turn.z)) <= CELL / 2 + 1e-6,
    `turn z ${turn.z} is outside the intersection`,
  );

  assert.ok(Math.abs(state.heading - Math.PI / 2) < 1e-6);
  assert.ok(laneError(state.z) < 1e-6);
  assert.ok(state.x > turn.x, 'camera should move along the new avenue');
});

test('street nav respects the turn chance', () => {
  const nav = new StreetNav({ x: avenueCenterX(0), z: 0, rng: () => 0.5, turnChance: 0.34 });
  run(nav, 60);
  assert.equal(nav.turns.length, 0);
});

test('street nav finishes turns with cardinal headings', () => {
  const nav = new StreetNav({
    x: avenueCenterX(0),
    z: 0,
    rng: mulberry32(7),
    turnChance: 0.8,
  });
  for (let i = 0; i < 4000; i += 1) {
    const state = nav.update(STEP, SPEED);
    if (!state.turning) {
      const quarters = state.heading / (Math.PI / 2);
      assert.ok(Math.abs(quarters - Math.round(quarters)) < 1e-6, `heading ${state.heading}`);
    }
  }
  assert.ok(nav.turns.length > 3, `only ${nav.turns.length} turns`);
});

test('street nav never leaves an avenue corridor', () => {
  const nav = new StreetNav({
    x: avenueCenterX(0),
    z: 0,
    rng: mulberry32(99),
    turnChance: 0.7,
  });
  let worst = 0;
  for (let i = 0; i < 6000; i += 1) {
    const state = nav.update(STEP, SPEED);
    if (state.turning) continue;
    const alongZ = Math.abs(Math.cos(state.heading)) > 0.5;
    worst = Math.max(worst, alongZ ? laneError(state.x) : laneError(state.z));
  }
  assert.ok(worst < 0.01, `drifted ${worst} off the lane`);
});

test('street nav is deterministic for the same seed', () => {
  const a = new StreetNav({ x: avenueCenterX(0), z: 0, rng: mulberry32(123) });
  const b = new StreetNav({ x: avenueCenterX(0), z: 0, rng: mulberry32(123) });
  for (let i = 0; i < 5000; i += 1) {
    assert.deepEqual(a.update(STEP, SPEED), b.update(STEP, SPEED));
  }
  assert.equal(a.turns.length, b.turns.length);
  assert.ok(a.turns.length > 0);
});

test('intersections repeat every avenue block', () => {
  const spacing = CELL * AVENUE_EVERY;
  assert.equal(spacing, 98);
  assert.equal(avenueCenterX(0), CELL / 2);
  assert.equal(avenueCenterX(CELL * AVENUE_EVERY), CELL * AVENUE_EVERY + CELL / 2);
});
