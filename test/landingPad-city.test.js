import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City } from '../src/city.js';
import { cellLayout } from '../src/layout.js';
import { landingPadsFor } from '../src/landingPadModel.js';
import { GROW_MS } from '../src/config.js';

const pad = (value) => value * 14 + 7;
const atCell = (ix, iz) => ({ x: pad(ix), z: pad(iz) });

function grownCity() {
  const city = new City({ cols: 52, rows: 52, reflection: false });
  city.update(0, atCell(26, 26));
  city.update(GROW_MS + 1, atCell(26, 26));
  return city;
}

test('landing pads appear next to factories', () => {
  const city = grownCity();
  assert.ok(city.landingPads, 'landing pads are not wired into the city');

  const matrix = new THREE.Matrix4();
  let pads = 0;
  let ships = 0;

  for (let slot = 0; slot < city.count; slot += 1) {
    const layout = city.slotLayout[slot];
    if (!layout || layout.type !== 'factory') continue;
    const list = landingPadsFor(layout);
    const base = city.landingPads.bases[slot];
    assert.ok(base, `factory ${layout.ix}:${layout.iz} has no pad base`);
    assert.equal(base.count, list.length);
    pads += list.length;

    for (let index = 0; index < list.length; index += 1) {
      const spec = list[index];
      ships += spec.ships.length;
      city.landingPads.pads.getMatrixAt(base.start + index, matrix);
      assert.ok(Math.abs(matrix.elements[12] - spec.x) < 0.01, 'pad x');
      assert.ok(Math.abs(matrix.elements[13] - 0.02) < 0.01, 'pad is not on the ground');
      assert.ok(Math.abs(matrix.elements[14] - spec.z) < 0.01, 'pad z');
      assert.ok(Math.abs(matrix.elements[0] - spec.width) < 0.01, 'pad width');
      assert.ok(Math.abs(matrix.elements[10] - spec.depth) < 0.01, 'pad depth');
    }
  }

  assert.ok(pads > 0, 'no landing pads in the ring');
  assert.equal(city.stats.pads, pads);
  assert.equal(city.landingPads.pads.count, pads);
  assert.equal(city.landingPads.ships.count, ships);
  assert.ok(pads <= city.landingPads.capacity.pads);

  city.setTime(4.5);
  assert.equal(city.landingPads.padMaterial.uniforms.uTime.value, 4.5);
  city.dispose();
});

test('landing pads stay bounded while flying across thousands of cells', () => {
  const city = grownCity();
  const padCapacity = city.landingPads.pads.instanceMatrix.count;
  const shipCapacity = city.landingPads.ships.instanceMatrix.count;
  for (let step = 0; step < 2000; step += 1) {
    city.update(step * 16, atCell(26 + step, 26));
  }
  assert.equal(city.landingPads.pads.instanceMatrix.count, padCapacity);
  assert.equal(city.landingPads.ships.instanceMatrix.count, shipCapacity);
  assert.ok(city.landingPads.pads.count <= city.landingPads.capacity.pads);
  assert.ok(city.landingPads.ships.count <= city.landingPads.capacity.ships);
  city.dispose();
});
