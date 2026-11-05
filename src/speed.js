import { SKY_SPEED, STREET_SPEED } from './config.js';
import { TRAFFIC_TYPES } from './trafficModel.js';

export const SPEED_MIN = 8;
export const SPEED_MAX = TRAFFIC_TYPES.police.speedMax * 2;
export const ESCORT_CLOSER = 0.8;

const ESCORT_GROWTH_CAP = 2.0;
const WHEEL_STEP = 0.02;
const KEY_STEP = 2;
const LOW_SWING = 0.6;
const HIGH_SWING = 0.25;
const MAX_ESCORT_SCALE = 1.0;

export const STREET_AHEAD = 19;
export const STREET_DROP = 2.2;
export const SKY_DROP = 9.5;
export const SKY_AHEAD = 24;

export function defaultSpeed(mode) {
  return mode === 'street' ? STREET_SPEED : SKY_SPEED;
}

export function clampSpeed(value) {
  if (!Number.isFinite(value)) return SKY_SPEED;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, value));
}

export function speedFromWheel(current, deltaY) {
  return clampSpeed(current - deltaY * WHEEL_STEP);
}

export function stepSpeed(current, direction) {
  return clampSpeed(current + direction * KEY_STEP);
}

export function escortScaleFor(speed, baseSpeed) {
  const ratio = speed / baseSpeed;
  if (ratio <= 1) {
    return ESCORT_CLOSER * (1 + (ratio - 1) * LOW_SWING);
  }
  const capped = Math.min(ratio, ESCORT_GROWTH_CAP);
  return Math.min(
    MAX_ESCORT_SCALE,
    ESCORT_CLOSER * (1 + (capped - 1) * HIGH_SWING),
  );
}

export function throttleFor(speed) {
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  return (clamped - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
}

export function escortFraming(heightT, turning = false) {
  const t = Math.max(0, Math.min(1, heightT));
  const streetAhead = turning ? 9 : STREET_AHEAD;
  return {
    ahead: streetAhead + (SKY_AHEAD - streetAhead) * t,
    drop: STREET_DROP + (SKY_DROP - STREET_DROP) * t,
  };
}
