export const AVOID_AHEAD = 38;
export const AVOID_BEHIND = 14;
export const AVOID_SIDE = 6;
export const AVOID_HEIGHT = 3.5;
export const AVOID_SHIFT = 4.2;

const AVOID_RATE = 10;
const AVOID_RETURN_RATE = 2.5;
const SIDE_DEADBAND = 0.3;

export function avoidanceTarget(vehicle, escort) {
  if (!escort) return 0;
  const sin = Math.sin(vehicle.heading);
  const cos = Math.cos(vehicle.heading);
  const dx = escort.x - vehicle.x;
  const dz = escort.z - vehicle.z;
  const along = dx * sin + dz * cos;
  const lateral = dx * cos - dz * sin;
  if (along < -AVOID_BEHIND || along > AVOID_AHEAD) return 0;
  if (Math.abs(escort.y - vehicle.y) > AVOID_HEIGHT) return 0;
  if (Math.abs(lateral) > AVOID_SIDE) return 0;

  const side =
    Math.abs(lateral) < SIDE_DEADBAND
      ? vehicle.avoidSide ?? (vehicle.type === 'cargo' ? 1 : -1)
      : lateral > 0
        ? -1
        : 1;
  return side * AVOID_SHIFT;
}

export function advanceAvoidance(current, target, dt) {
  const rate = target === 0 ? AVOID_RETURN_RATE : AVOID_RATE;
  const blend = 1 - Math.exp(-rate * dt);
  return current + (target - current) * blend;
}

export function stepAvoidance(vehicle, escort, dt) {
  const current = vehicle.avoid ?? 0;
  return advanceAvoidance(current, avoidanceTarget(vehicle, escort), dt);
}

export function avoidanceOffset(vehicle) {
  const avoid = vehicle.avoid ?? 0;
  return {
    x: Math.cos(vehicle.heading) * avoid,
    z: -Math.sin(vehicle.heading) * avoid,
  };
}
