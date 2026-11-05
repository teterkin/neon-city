import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/noise.js';
import { avenueCenterX } from '../src/layout.js';
import {
  TRAFFIC_TYPES,
  advanceVehicle,
  createFleet,
  escortPose,
  escortSway,
  needsRespawn,
  spawnVehicle,
  vehicleBob,
  vehicleSway,
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

test('fleet flies in all four directions evenly', () => {
  const fleet = createFleet(120, CAMERA, mulberry32(11), RADIUS);
  const counts = new Map();
  for (const vehicle of fleet) {
    const key = ((Math.round(vehicle.heading / (Math.PI / 2)) % 4) + 4) % 4;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const key of [0, 1, 2, 3]) {
    assert.equal(counts.get(key), 30, `direction ${key} has ${counts.get(key)} vehicles`);
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

test('aerospiders sway a little more in the gravity flow', () => {
  let bobPeak = 0;
  let swayPeak = 0;
  for (let i = 0; i < 1440; i += 1) {
    const phase = (i / 1440) * Math.PI * 2;
    bobPeak = Math.max(bobPeak, Math.abs(vehicleBob(phase)));
    swayPeak = Math.max(swayPeak, Math.abs(vehicleSway(phase)));
  }
  assert.ok(bobPeak > 0.5 && bobPeak < 0.7, `bob peak ${bobPeak.toFixed(3)}`);
  assert.ok(swayPeak > 0.15 && swayPeak < 0.3, `sway peak ${swayPeak.toFixed(3)}`);
});

test('escort sways a little more without leaving its line', () => {
  let lateralPeak = 0;
  let verticalPeak = 0;
  let pitchPeak = 0;
  for (let i = 0; i < 2000; i += 1) {
    const sway = escortSway(i * 0.02);
    lateralPeak = Math.max(lateralPeak, Math.abs(sway.lateral));
    verticalPeak = Math.max(verticalPeak, Math.abs(sway.vertical));
    pitchPeak = Math.max(pitchPeak, Math.abs(sway.pitch));
  }
  assert.ok(lateralPeak > 0.6 && lateralPeak < 0.8, `lateral ${lateralPeak.toFixed(3)}`);
  assert.ok(verticalPeak > 0.15 && verticalPeak < 0.25, `vertical ${verticalPeak.toFixed(3)}`);
  assert.ok(pitchPeak > 0.01 && pitchPeak < 0.04, `pitch ${pitchPeak.toFixed(3)}`);
});

test('police speeders are rare and 40% faster than passenger traffic', () => {
  const rng = mulberry32(77);
  const fleet = [];
  for (let i = 0; i < 800; i += 1) fleet.push(spawnVehicle(CAMERA, rng, RADIUS));

  const police = fleet.filter((vehicle) => vehicle.type === 'police');
  const share = police.length / fleet.length;
  assert.ok(share > 0.04 && share < 0.12, `police share ${(share * 100).toFixed(1)}%`);
  assert.ok(police.length > 0);

  const policeSpec = TRAFFIC_TYPES.police;
  const passengerSpec = TRAFFIC_TYPES.passenger;
  assert.ok(Math.abs(policeSpec.speedMin - passengerSpec.speedMin * 1.4) < 1e-9);
  assert.ok(Math.abs(policeSpec.speedMax - passengerSpec.speedMax * 1.4) < 1e-9);
  for (const vehicle of police) {
    assert.ok(vehicle.speed >= policeSpec.speedMin && vehicle.speed <= policeSpec.speedMax);
    assert.ok(vehicle.y >= policeSpec.heightMin && vehicle.y <= policeSpec.heightMax);
  }
});
