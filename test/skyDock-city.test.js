import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City } from '../src/city.js';
import { cellLayout } from '../src/layout.js';
import { skyDockFor, skyDockPose, skyDockShipPose } from '../src/skyDockModel.js';
import { GROW_MS } from '../src/config.js';

const pad = (value) => value * 14 + 7;
const atCell = (ix, iz) => ({ x: pad(ix), z: pad(iz) });

function grownCity() {
  const city = new City({ cols: 52, rows: 52, reflection: false });
  city.update(0, atCell(26, 26));
  city.update(GROW_MS + 1, atCell(26, 26));
  return city;
}

test('sky docks appear on skyscrapers with parked ships', () => {
  const city = grownCity();
  assert.ok(city.skyDocks, 'sky docks are not wired into the city');
  assert.ok(city.stats.docks > 0);

  const matrix = new THREE.Matrix4();
  let ships = 0;

  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || layout.type !== 'tower') continue;
    const spec = skyDockFor(layout);
    if (!spec) continue;

    const base = city.skyDocks.bases[slot];
    assert.ok(base, `dock ${cell.ix}:${cell.iz} has no instance base`);
    ships += spec.ships;

    const pose = skyDockPose(layout, spec, layout.h);
    city.skyDocks.docks.getMatrixAt(base.index, matrix);
    assert.ok(Math.abs(matrix.elements[12] - pose.x) < 0.05, 'dock x');
    assert.ok(Math.abs(matrix.elements[13] - pose.y) < 0.05, 'dock y');
    assert.ok(Math.abs(matrix.elements[14] - pose.z) < 0.05, 'dock z');
    assert.ok(Math.abs(matrix.elements[5] - spec.thickness) < 0.01, 'deck thickness');
    assert.ok(Math.abs(matrix.elements[0] - spec.radius) < 0.05, 'deck radius');

    if (spec.ships > 0) {
      const ship = skyDockShipPose(layout, spec, layout.h, 0);
      city.skyDocks.ships.getMatrixAt(base.ships[0].index, matrix);
      assert.ok(Math.abs(matrix.elements[12] - ship.x) < 0.05, 'ship x');
      assert.ok(Math.abs(matrix.elements[14] - ship.z) < 0.05, 'ship z');
      assert.ok(Math.abs(matrix.elements[13] - (ship.y + 0.35)) < 0.05, 'ship is not on the deck');
    }
  }

  assert.equal(city.skyDocks.docks.count, city.stats.docks);
  assert.equal(city.skyDocks.ships.count, ships);
  assert.ok(city.skyDocks.docks.count <= city.skyDocks.capacity.docks);
  city.dispose();
});

test('dock platforms grow with their building', () => {
  const city = new City({ cols: 52, rows: 52, reflection: false });
  city.update(0, atCell(26, 26));

  let slot = -1;
  for (let index = 0; index < city.count; index += 1) {
    if (city.slotDock[index]) {
      slot = index;
      break;
    }
  }
  assert.ok(slot >= 0, 'no dock in the ring');

  const layout = city.slotLayout[slot];
  const base = city.skyDocks.bases[slot];
  const target = skyDockPose(layout, base.spec, layout.h);
  const matrix = new THREE.Matrix4();

  city.skyDocks.docks.getMatrixAt(base.index, matrix);
  assert.ok(matrix.elements[13] < 1e-6, 'dock is already grown');

  city.update(GROW_MS / 2, atCell(26, 26));
  city.skyDocks.docks.getMatrixAt(base.index, matrix);
  const middle = matrix.elements[13];
  assert.ok(middle > 0 && middle < target.y, `middle dock height ${middle}`);

  city.update(GROW_MS + 1, atCell(26, 26));
  city.skyDocks.docks.getMatrixAt(base.index, matrix);
  assert.ok(Math.abs(matrix.elements[13] - target.y) < 0.05, 'dock did not reach its height');

  city.setTime(7.5);
  assert.equal(city.skyDocks.dockMaterial.uniforms.uTime.value, 7.5);
  assert.equal(city.skyDocks.shipMaterial.uniforms.uTime.value, 7.5);
  city.dispose();
});

test('dock buffers stay bounded while flying across thousands of cells', () => {
  const city = grownCity();
  const dockCapacity = city.skyDocks.docks.instanceMatrix.count;
  const shipCapacity = city.skyDocks.ships.instanceMatrix.count;
  for (let step = 0; step < 2000; step += 1) {
    city.update(step * 16, atCell(26 + step, 26));
  }
  assert.equal(city.skyDocks.docks.instanceMatrix.count, dockCapacity);
  assert.equal(city.skyDocks.ships.instanceMatrix.count, shipCapacity);
  assert.ok(city.skyDocks.docks.count <= city.skyDocks.capacity.docks);
  assert.ok(city.skyDocks.ships.count <= city.skyDocks.capacity.ships);
  city.dispose();
});
