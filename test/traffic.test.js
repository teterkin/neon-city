import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/noise.js';
import { avenueCenterX } from '../src/layout.js';
import {
  TRAFFIC_TYPES,
  advanceVehicle,
  createFleet,
  escortPose,
  needsRespawn,
  spawnVehicle,
} from '../src/trafficModel.js';

const CAMERA = { x: avenueCenterX(0), y: 96, z: 0 };
const RADIUS = 320;

function laneError(value) {
  return Math.abs(value - avenueCenterX(value));
}

test('spawned vehicles have a valid type, lane, height and speed', () => {
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i += 1) {
    const vehicle = spawnVehicle(CAMERA, rng, RADIUS);
    const spec = TRAFFIC_TYPES[vehicle.type];
    assert.ok(spec, `unknown type ${vehicle.type}`);
    assert.ok(Number.isFinite(vehicle.x) && Number.isFinite(vehicle.z));
    assert.ok(vehicle.y >= spec.heightMin && vehicle.y <= spec.heightMax);
    assert.ok(vehicle.speed >= spec.speedMin && vehicle.speed <= spec.speedMax);
    const axis = Math.abs(vehicle.heading % Math.PI) < 1e-6 ? 'z' : 'x';
    if (axis === 'z') {
      assert.ok(laneError(vehicle.x) < 1e-6, `vehicle left the avenue at x=${vehicle.x}`);
    } else {
      assert.ok(laneError(vehicle.z) < 1e-6, `vehicle left the avenue at z=${vehicle.z}`);
    }
    const distance = Math.hypot(vehicle.x - CAMERA.x, vehicle.z - CAMERA.z);
    assert.ok(distance <= RADIUS + 1e-6, `spawned ${distance} away`);
  }
});

test('fleet contains cargo and passenger traffic', () => {
  const fleet = createFleet(120, CAMERA, mulberry32(11), RADIUS);
  const cargo = fleet.filter((vehicle) => vehicle.type === 'cargo').length;
  const passenger = fleet.filter((vehicle) => vehicle.type === 'passenger').length;
  assert.ok(cargo > 20, `only ${cargo} cargo`);
  assert.ok(passenger > 20, `only ${passenger} passenger`);
  for (const vehicle of fleet) {
    assert.ok(Math.hypot(vehicle.x - CAMERA.x, vehicle.z - CAMERA.z) <= RADIUS + 1e-6);
  }
});

test('cargo is slower than passenger traffic', () => {
  assert.ok(TRAFFIC_TYPES.cargo.speedMax < TRAFFIC_TYPES.passenger.speedMin);
});

test('advanceVehicle moves along its heading', () => {
  const vehicle = {
    type: 'passenger',
    x: 0,
    y: 20,
    z: 0,
    heading: 0,
    speed: 20,
    phase: 0,
  };
  advanceVehicle(vehicle, 1);
  assert.ok(Math.abs(vehicle.z - 20) < 1e-9);
  assert.ok(Math.abs(vehicle.x) < 1e-9);

  vehicle.heading = Math.PI / 2;
  advanceVehicle(vehicle, 0.5);
  assert.ok(Math.abs(vehicle.x - 10) < 1e-9);
});

test('vehicles far from the camera are flagged for respawn', () => {
  const vehicle = spawnVehicle(CAMERA, mulberry32(3), RADIUS);
  assert.equal(needsRespawn(vehicle, CAMERA, RADIUS), false);
  vehicle.x = CAMERA.x + RADIUS * 3;
  assert.equal(needsRespawn(vehicle, CAMERA, RADIUS), true);
});

test('respawned vehicles return inside the radius', () => {
  const rng = mulberry32(17);
  const vehicle = spawnVehicle(CAMERA, rng, RADIUS);
  vehicle.x = CAMERA.x + 5000;
  vehicle.z = CAMERA.z + 5000;
  const fleet = createFleet(20, CAMERA, rng, RADIUS);
  advanceVehicle(vehicle, 0.016);
  if (needsRespawn(vehicle, CAMERA, RADIUS)) {
    const replacement = spawnVehicle(CAMERA, rng, RADIUS);
    vehicle.x = replacement.x;
    vehicle.z = replacement.z;
    vehicle.y = replacement.y;
  }
  assert.ok(Math.hypot(vehicle.x - CAMERA.x, vehicle.z - CAMERA.z) <= RADIUS + 1e-6);
  assert.equal(fleet.length, 20);
});

test('spawn is deterministic for a shared seed', () => {
  const a = createFleet(30, CAMERA, mulberry32(42), RADIUS);
  const b = createFleet(30, CAMERA, mulberry32(42), RADIUS);
  assert.deepEqual(a, b);
});

test('escort flies ahead of the camera and below the view line', () => {
  const north = escortPose(CAMERA, 0);
  assert.ok(Math.abs(north.z - (CAMERA.z + 14)) < 1e-9);
  assert.ok(Math.abs(north.x - CAMERA.x) < 1e-9);
  assert.ok(north.y < CAMERA.y);

  const east = escortPose(CAMERA, Math.PI / 2);
  assert.ok(east.x > CAMERA.x);
  assert.ok(Math.abs(east.z - CAMERA.z) < 1e-9);
});
