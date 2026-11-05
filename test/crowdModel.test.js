import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL, AVENUE_EVERY } from '../src/config.js';
import { modulo } from '../src/layout.js';
import {
  CROWD_ROAD_CLEARANCE,
  CROWD_SPEED_MAX,
  CROWD_SPEED_MIN,
  CrowdModel,
  crossesRoad,
  keepOffRoad,
  worldSites,
} from '../src/crowdModel.js';
import { mulberry32 } from '../src/noise.js';

function camera(x = 0, y = 3.2, z = 0) {
  return { x, y, z };
}

function laneDistance(x, z) {
  const dx = Math.abs(x - Math.round(x / CELL) * CELL);
  const dz = Math.abs(z - Math.round(z / CELL) * CELL);
  return Math.min(dx, dz);
}

function avenueDistance(value) {
  const cell = Math.floor(value / CELL);
  if (modulo(cell, AVENUE_EVERY) !== 0) return Infinity;
  return Math.abs(value - (cell + 0.5) * CELL);
}

test('street pedestrians spawn on sidewalks and keep a human pace', () => {
  const model = new CrowdModel({
    rng: mulberry32(11),
    streetCapacity: 24,
    dockCapacity: 0,
    sites: { pads: [], docks: [] },
  });
  const cam = camera();

  model.update(1 / 30, cam, 'street');
  assert.equal(model.street.length, 24);
  for (const person of model.street) {
    assert.ok(person.active, 'every slot should be filled');
    assert.ok(
      laneDistance(person.x, person.z) <= 2.2,
      `off sidewalk: ${person.x}, ${person.z}`,
    );
    assert.ok(
      person.speed >= CROWD_SPEED_MIN && person.speed <= CROWD_SPEED_MAX,
      `speed ${person.speed}`,
    );
  }

  for (let step = 0; step < 60 * 30; step += 1) {
    model.update(1 / 30, cam, 'street');
  }
  for (const person of model.street) {
    assert.ok(person.tempoChanges >= 2, `tempo changes ${person.tempoChanges}`);
    assert.ok(
      person.speed >= CROWD_SPEED_MIN && person.speed <= CROWD_SPEED_MAX,
      `speed drifted to ${person.speed}`,
    );
    assert.ok(
      laneDistance(person.x, person.z) <= 2.2,
      `left the sidewalk: ${person.x}, ${person.z}`,
    );
  }
});

test('street pedestrians use parked speeders and walk on the pads', () => {
  const sites = {
    pads: [{ x: 20, z: 20, width: 8, depth: 6, ships: [{ x: 20, z: 20 }] }],
    docks: [],
  };
  const model = new CrowdModel({
    rng: mulberry32(21),
    streetCapacity: 48,
    dockCapacity: 0,
    sites,
  });
  const cam = camera(20, 3.2, 20);
  let boarded = false;
  let exited = false;
  let onPad = false;

  for (let step = 0; step < 240 * 30; step += 1) {
    model.update(1 / 30, cam, 'street');
    for (const person of model.street) {
      if (person.state === 'board' && person.fade <= 0.001) boarded = true;
      if (person.state === 'exitShip' && person.fade < 1) {
        exited = true;
        assert.ok(
          Math.hypot(person.x - 20, person.z - 20) < 4,
          `stepped out at ${person.x}, ${person.z}`,
        );
      }
      if (
        person.state === 'walk' &&
        Math.abs(person.x - 20) < 4 &&
        Math.abs(person.z - 20) < 3
      ) {
        onPad = true;
      }
    }
  }

  assert.ok(boarded, 'nobody boarded a speeder');
  assert.ok(exited, 'nobody stepped out of a speeder');
  assert.ok(onPad, 'nobody walked on the pad');
});

test('groups gather and talk together', () => {
  const model = new CrowdModel({
    rng: mulberry32(33),
    streetCapacity: 64,
    dockCapacity: 0,
    sites: { pads: [], docks: [] },
  });
  const cam = camera();
  let talked = false;

  for (let step = 0; step < 120 * 30; step += 1) {
    model.update(1 / 30, cam, 'street');
    const groups = new Map();
    for (const person of model.street) {
      if (person.state !== 'talk' || !person.group) continue;
      if (!groups.has(person.group)) groups.set(person.group, []);
      groups.get(person.group).push(person);
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      for (const a of members) {
        for (const b of members) {
          assert.ok(
            Math.hypot(a.x - b.x, a.z - b.z) < 2.5,
            `group ${a.group} split up`,
          );
        }
      }
      talked = true;
    }
  }

  assert.ok(talked, 'no group ever talked');
});

test('street pedestrians browse, read signs, point and use building doors', () => {
  const model = new CrowdModel({
    rng: mulberry32(5),
    streetCapacity: 48,
    dockCapacity: 0,
  });
  const cam = camera(10, 3.2, 10);
  const seen = new Set();

  for (let step = 0; step < 180 * 30; step += 1) {
    model.update(1 / 30, cam, 'street');
    for (const person of model.street) {
      seen.add(person.state);
      if (
        person.path ||
        !['walk', 'browse', 'readSign', 'point'].includes(person.state)
      ) {
        continue;
      }
      assert.ok(
        laneDistance(person.x, person.z) <= 2.2,
        `${person.state} left the sidewalk: ${person.x}, ${person.z}`,
      );
    }
  }

  for (const state of [
    'walk',
    'browse',
    'readSign',
    'point',
    'enterBuilding',
    'leaveBuilding',
  ]) {
    assert.ok(seen.has(state), `state ${state} never happened`);
  }
});


test('sky dock pedestrians stay on the platform and use parked ships', () => {
  const sites = {
    pads: [],
    docks: [
      {
        x: 0,
        y: 60,
        z: 0,
        radius: 6,
        thickness: 0.5,
        ships: [{ x: 2, y: 60.5, z: 0, heading: 0 }],
      },
    ],
  };
  const model = new CrowdModel({
    rng: mulberry32(77),
    streetCapacity: 0,
    dockCapacity: 12,
    sites,
  });
  const cam = camera(0, 96, 0);
  const seen = new Set();

  for (let step = 0; step < 120 * 30; step += 1) {
    model.update(1 / 30, cam, 'dock');
    const active = model.dock.filter((person) => person.active);
    assert.ok(active.length > 0, 'dock slot should be filled');
    assert.ok(active.length <= 4, `dock holds ${active.length} people`);
    for (const person of active) {
      seen.add(person.state);
      assert.ok(
        Math.abs(person.y - 60.5) < 1e-6,
        `dock height ${person.y}`,
      );
      assert.ok(
        Math.hypot(person.x, person.z) <= 6.5,
        `off dock ${person.x}, ${person.z}`,
      );
    }
  }

  assert.ok(seen.has('walk'));
  assert.ok(seen.has('board'));
  assert.ok(seen.has('exitShip'));
});

test('world sites expose real tower docks and factory pads', () => {
  const sites = worldSites(0, 0, 140);
  assert.ok(sites.docks.length > 0, 'no tower docks near the city centre');
  assert.ok(sites.pads.length > 0, 'no factory pads near the city centre');

  for (const dock of sites.docks) {
    assert.ok(dock.radius > 0);
    assert.equal(dock.ships.length > 0, true);
    for (const ship of dock.ships) {
      assert.ok(Number.isFinite(ship.x) && Number.isFinite(ship.z));
    }
  }
  assert.ok(
    sites.pads.some((pad) => pad.ships.length > 0),
    'no factory pad has parked ships',
  );
});

test('street pedestrians stay on the ground even with docks overhead', () => {
  const sites = {
    pads: [{ x: 5, z: 5, width: 8, depth: 6, ships: [{ x: 5, z: 5 }] }],
    docks: [
      {
        x: 0,
        y: 60,
        z: 0,
        radius: 6,
        thickness: 0.5,
        ships: [{ x: 1, y: 60.5, z: 0, heading: 0 }],
      },
    ],
  };
  const model = new CrowdModel({
    rng: mulberry32(101),
    streetCapacity: 32,
    dockCapacity: 0,
    sites,
  });
  const cam = camera(2, 3.2, 2);

  for (let step = 0; step < 120 * 30; step += 1) {
    model.update(1 / 30, cam, 'street');
    for (const person of model.street) {
      assert.equal(person.y, 0, `street pedestrian floated to ${person.y}`);
    }
  }
});

test('street pedestrians keep clear of the avenue centre line', () => {
  assert.ok(Math.abs(keepOffRoad(7) - 12.6) < 1e-9);
  assert.ok(Math.abs(keepOffRoad(8) - 12.6) < 1e-9);
  assert.ok(Math.abs(keepOffRoad(6) - 1.4) < 1e-9);
  assert.equal(crossesRoad(0.6, 0, 13.4, 0), true);
  assert.equal(crossesRoad(0.6, 20, 0.6, 40), false);
  assert.equal(crossesRoad(0.6, 0, 4, 0), true);

  const model = new CrowdModel({
    rng: mulberry32(202),
    streetCapacity: 64,
    dockCapacity: 0,
  });
  const cam = camera(7, 3.2, 0);

  for (let step = 0; step < 180 * 30; step += 1) {
    model.update(1 / 30, cam, 'street');
    for (const person of model.street) {
      assert.ok(
        avenueDistance(person.x) >= CROWD_ROAD_CLEARANCE - 1e-6,
        `person on the avenue centre x=${person.x}`,
      );
      assert.ok(
        avenueDistance(person.z) >= CROWD_ROAD_CLEARANCE - 1e-6,
        `person on the avenue centre z=${person.z}`,
      );
    }
  }
});

test('rooftop docks host at most four pedestrians each', () => {
  const sites = {
    pads: [],
    docks: [
      { x: 0, y: 60, z: 0, radius: 7, thickness: 0.5, ships: [] },
      { x: 100, y: 70, z: 0, radius: 7, thickness: 0.5, ships: [] },
    ],
  };
  const model = new CrowdModel({
    rng: mulberry32(404),
    streetCapacity: 0,
    dockCapacity: 12,
    sites,
  });
  const cam = camera(0, 96, 0);

  for (let step = 0; step < 120 * 30; step += 1) {
    model.update(1 / 30, cam, 'dock');
    for (const dock of sites.docks) {
      const count = model.dock.filter(
        (person) =>
          person.active &&
          Math.abs(person.y - (dock.y + dock.thickness)) < 4 &&
          Math.hypot(person.x - dock.x, person.z - dock.z) < dock.radius + 1,
      ).length;
      assert.ok(count <= 4, `dock at ${dock.x} holds ${count} people`);
    }
  }
});
