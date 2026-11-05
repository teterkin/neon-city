import { AVENUE_EVERY, CELL } from './config.js';
import { avenueCenterX } from './layout.js';

export const POLICE_SPEED_SCALE = 1.4;
const POLICE_SHARE = 0.08;
const PASSENGER_SPEED_MIN = 16;
const PASSENGER_SPEED_MAX = 27;

export const TRAFFIC_TYPES = {
  cargo: {
    speedMin: 7,
    speedMax: 11,
    heightMin: 26,
    heightMax: 64,
    length: 6.4,
    width: 2.7,
    height: 1.5,
    weight: 0.4,
    tint: 0xffb85c,
  },
  passenger: {
    speedMin: PASSENGER_SPEED_MIN,
    speedMax: PASSENGER_SPEED_MAX,
    heightMin: 14,
    heightMax: 96,
    length: 3.4,
    width: 1.6,
    height: 0.7,
    weight: 0.6,
    tint: 0x34e5ff,
  },
  police: {
    speedMin: PASSENGER_SPEED_MIN * POLICE_SPEED_SCALE,
    speedMax: PASSENGER_SPEED_MAX * POLICE_SPEED_SCALE,
    heightMin: 20,
    heightMax: 70,
    length: 3.8,
    width: 1.8,
    height: 0.8,
    tint: 0x6fa8ff,
  },
};

const PASSENGER_TINTS = [0x34e5ff, 0xff35b0, 0x9a6bff, 0x7dffe0];
const BLOCK = CELL * AVENUE_EVERY;

export const TRAFFIC_LANES = [
  { axis: 'z', direction: 1 },
  { axis: 'z', direction: -1 },
  { axis: 'x', direction: 1 },
  { axis: 'x', direction: -1 },
];

export function laneForIndex(index) {
  return TRAFFIC_LANES[index % TRAFFIC_LANES.length];
}

export function spawnVehicle(camera, rng, radius = 320, laneSpec = null) {
  const roll = rng();
  const type =
    roll < POLICE_SHARE
      ? 'police'
      : roll < POLICE_SHARE + TRAFFIC_TYPES.cargo.weight
        ? 'cargo'
        : 'passenger';
  const spec = TRAFFIC_TYPES[type];

  const alongZ = laneSpec ? laneSpec.axis === 'z' : rng() < 0.5;
  const direction = laneSpec ? laneSpec.direction : rng() < 0.5 ? 1 : -1;
  const laneOffset = (Math.floor(rng() * 3) - 1) * BLOCK;
  const lane = alongZ
    ? avenueCenterX(camera.x + laneOffset)
    : avenueCenterX(camera.z + laneOffset);

  const spread = radius * (0.15 + rng() * 0.4);
  const along = (alongZ ? camera.z : camera.x) + direction * spread;
  const x = alongZ ? lane : along;
  const z = alongZ ? along : lane;

  const heading = alongZ
    ? direction > 0
      ? 0
      : Math.PI
    : direction > 0
      ? Math.PI / 2
      : -Math.PI / 2;

  const tint =
    type === 'cargo' || type === 'police'
      ? spec.tint
      : PASSENGER_TINTS[Math.floor(rng() * PASSENGER_TINTS.length)];

  return {
    type,
    x,
    y: spec.heightMin + rng() * (spec.heightMax - spec.heightMin),
    z,
    heading,
    speed: spec.speedMin + rng() * (spec.speedMax - spec.speedMin),
    tint,
    phase: rng() * Math.PI * 2,
  };
}

export function createFleet(count, camera, rng, radius = 320) {
  const fleet = new Array(count);
  for (let index = 0; index < count; index += 1) {
    fleet[index] = spawnVehicle(camera, rng, radius, laneForIndex(index));
  }
  return fleet;
}

export function advanceVehicle(vehicle, dt) {
  vehicle.x += Math.sin(vehicle.heading) * vehicle.speed * dt;
  vehicle.z += Math.cos(vehicle.heading) * vehicle.speed * dt;
  vehicle.phase += dt * (0.7 + vehicle.speed * 0.04);
  return vehicle;
}

export function vehicleBob(phase) {
  return Math.sin(phase) * 0.45 + Math.sin(phase * 0.43 + 1.7) * 0.09;
}

export function vehicleSway(phase) {
  return Math.sin(phase * 0.63 + 0.8) * 0.22;
}

export function escortSway(time) {
  return {
    lateral: Math.sin(time * 0.8) * 0.58 + Math.sin(time * 1.9) * 0.16,
    vertical: Math.sin(time * 1.6) * 0.19,
    pitch: Math.sin(time * 1.3 + 0.6) * 0.025,
  };
}

export function needsRespawn(vehicle, camera, radius = 320) {
  return Math.hypot(vehicle.x - camera.x, vehicle.z - camera.z) > radius;
}

export function escortPose(camera, heading, ahead = 14, drop = 2.8) {
  return {
    x: camera.x + Math.sin(heading) * ahead,
    y: camera.y - drop,
    z: camera.z + Math.cos(heading) * ahead,
  };
}
