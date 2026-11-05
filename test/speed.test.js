import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY_SPEED, STREET_SPEED } from '../src/config.js';
import { TRAFFIC_TYPES } from '../src/trafficModel.js';
import {
  SPEED_MAX,
  SPEED_MIN,
  SKY_AHEAD,
  SKY_DROP,
  STREET_AHEAD,
  STREET_DROP,
  clampSpeed,
  defaultSpeed,
  escortFraming,
  escortScaleFor,
  speedFromWheel,
  stepSpeed,
  throttleFor,
} from '../src/speed.js';

test('flight speed is clamped to the throttle range', () => {
  assert.equal(clampSpeed(SPEED_MIN - 1), SPEED_MIN);
  assert.equal(clampSpeed(SPEED_MAX + 1), SPEED_MAX);
  assert.equal(clampSpeed(24), 24);
  assert.equal(clampSpeed(Number.NaN), SKY_SPEED);
  assert.equal(SPEED_MAX, TRAFFIC_TYPES.police.speedMax * 2);
});

test('wheel up accelerates, wheel down brakes', () => {
  assert.ok(speedFromWheel(20, -120) > 20, 'wheel up should speed up');
  assert.ok(speedFromWheel(20, 120) < 20, 'wheel down should slow down');
  assert.equal(speedFromWheel(SPEED_MAX, -1000), SPEED_MAX);
  assert.ok(stepSpeed(20, 1) > 20);
  assert.ok(stepSpeed(20, -1) < 20);
});

test('speed defaults and escort distance follow the mode', () => {
  assert.equal(defaultSpeed('sky'), SKY_SPEED);
  assert.equal(defaultSpeed('street'), STREET_SPEED);
  const normal = escortScaleFor(SKY_SPEED, SKY_SPEED);
  assert.ok(Math.abs(normal - 0.8) < 1e-9);
  assert.ok(escortScaleFor(SPEED_MIN, SKY_SPEED) < normal, 'braking should pull the escort closer');
  assert.ok(escortScaleFor(SPEED_MIN, SKY_SPEED) < 0.5);
  const fast = escortScaleFor(SPEED_MAX, SKY_SPEED);
  assert.ok(fast > normal);
  assert.ok(Math.abs(fast - 1.0) < 1e-9, `max escort scale ${fast}`);
  assert.ok(Math.abs(escortScaleFor(SPEED_MAX, STREET_SPEED) - 1.0) < 1e-9);
  assert.ok(fast > escortScaleFor(TRAFFIC_TYPES.police.speedMax, SKY_SPEED));
});

test('throttle follows the speed range', () => {
  assert.equal(throttleFor(SPEED_MIN), 0);
  assert.equal(throttleFor(SPEED_MAX), 1);
  const mid = throttleFor(SKY_SPEED);
  assert.ok(mid > 0 && mid < 0.4, `mid throttle ${mid}`);
  assert.equal(throttleFor(SPEED_MAX + 100), 1);
});

test('escort framing moves the craft ahead in the sky', () => {
  const street = escortFraming(0);
  const sky = escortFraming(1);
  assert.equal(street.ahead, STREET_AHEAD);
  assert.equal(street.drop, STREET_DROP);
  assert.equal(sky.ahead, SKY_AHEAD);
  assert.equal(sky.drop, SKY_DROP);
  assert.ok(SKY_AHEAD > STREET_AHEAD);
  const streetDistance = Math.hypot(street.ahead, street.drop);
  const skyDistance = Math.hypot(sky.ahead, sky.drop);
  assert.ok(skyDistance > streetDistance, 'sky escort sits a little farther ahead');
  assert.equal(escortFraming(0, true).ahead, 9);
  assert.ok(escortFraming(0.5).drop > STREET_DROP && escortFraming(0.5).drop < SKY_DROP);
});
