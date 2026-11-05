import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City } from '../src/city.js';
import { cellLayout } from '../src/layout.js';
import { factoryChimneys } from '../src/factoryModel.js';
import { FIRE_PER_FLARE, SMOKE_PER_CHIMNEY } from '../src/factoryParts.js';
import { GROW_MS } from '../src/config.js';

const pad = (value) => value * 14 + 7;
const atCell = (ix, iz) => ({ x: pad(ix), z: pad(iz) });

function grownCity() {
  const city = new City({ cols: 40, rows: 40, holoProbability: 0, reflection: false });
  city.update(0, atCell(20, 20));
  city.update(GROW_MS + 1, atCell(20, 20));
  return city;
}

test('factory slots receive chimneys and roof kits', () => {
  const city = grownCity();
  assert.ok(city.factoryParts, 'factory parts are not wired into the city');
  const matrix = new THREE.Matrix4();
  let factories = 0;
  let chimneys = 0;

  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || layout.type !== 'factory') continue;

    factories += 1;
    const list = factoryChimneys(layout);
    chimneys += list.length;
    const base = city.factoryParts.bases[slot];
    assert.ok(base, `factory ${cell.ix}:${cell.iz} has no instance base`);

    for (let index = 0; index < list.length; index += 1) {
      const entry = base.chimneys[index];
      assert.ok(entry, 'chimney index missing');
      city.factoryParts.chimneys.getMatrixAt(entry.index, matrix);
      const y = matrix.elements[13];
      const scaleY = matrix.elements[5];
      assert.ok(Math.abs(y - layout.h) < 0.02, `chimney base ${y} vs roof ${layout.h}`);
      assert.ok(Math.abs(scaleY - list[index].height) < 0.02, `chimney height ${scaleY}`);
      const x = matrix.elements[12];
      const z = matrix.elements[14];
      assert.ok(x >= layout.x - 1e-6 && x <= layout.x + layout.w + 1e-6, 'chimney off the roof');
      assert.ok(z >= layout.z - 1e-6 && z <= layout.z + layout.d + 1e-6, 'chimney off the roof');
    }
  }

  assert.ok(factories > 20, `only ${factories} factories in the ring`);
  assert.equal(city.stats.factories, factories);
  assert.equal(city.factoryParts.chimneys.count, chimneys);
  assert.ok(city.factoryParts.boxes.count > 0);
  assert.ok(city.factoryParts.prisms.count > 0);
  assert.ok(city.factoryParts.cylinders.count > 0);
  assert.equal(city.factoryParts.fences.count, factories * 12);
  assert.equal(city.factoryParts.fenceMaterial.transparent, true);
  assert.equal(city.factoryParts.fenceMaterial.depthWrite, false);

  for (let index = 0; index < city.factoryParts.fences.count; index += 1) {
    city.factoryParts.fences.getMatrixAt(index, matrix);
    assert.ok(Math.abs(matrix.elements[13]) < 1e-6, 'fence is not on the ground');
    assert.ok(matrix.elements[5] > 0, `drawn fence ${index} has no height`);
  }
  city.dispose();
});

test('towers do not reserve factory instances', () => {
  const city = grownCity();
  assert.ok(city.factoryParts, 'factory parts are not wired into the city');
  const matrix = new THREE.Matrix4();
  let towers = 0;

  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || layout.type === 'factory') continue;
    towers += 1;
    assert.equal(city.factoryParts.bases[slot], null);
  }

  assert.ok(towers > 100, `only ${towers} towers`);
  for (let index = 0; index < city.factoryParts.chimneys.count; index += 1) {
    city.factoryParts.chimneys.getMatrixAt(index, matrix);
    assert.ok(matrix.elements[5] > 0, `drawn chimney ${index} has no height`);
  }
  city.dispose();
});

test('particle emitters follow the factory chimneys', () => {
  const city = grownCity();
  assert.ok(city.factoryParts, 'factory parts are not wired into the city');

  let chimneys = 0;
  let flares = 0;
  let minTop = Infinity;
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || layout.type !== 'factory') continue;
    for (const chimney of factoryChimneys(layout)) {
      chimneys += 1;
      if (chimney.flare) flares += 1;
      minTop = Math.min(minTop, layout.h + chimney.height);
    }
  }

  const parts = city.factoryParts;
  assert.ok(chimneys > 20);
  assert.equal(parts.smoke.geometry.drawRange.count, chimneys * SMOKE_PER_CHIMNEY);
  assert.equal(parts.fire.geometry.drawRange.count, flares * FIRE_PER_FLARE);
  assert.equal(parts.beacons.geometry.drawRange.count, chimneys);
  assert.ok(parts.fire.geometry.drawRange.count > 0, 'no flare particles emitted');

  const smoke = parts.smoke.geometry.getAttribute('position').array;
  for (let index = 0; index < parts.smoke.geometry.drawRange.count; index += 1) {
    assert.ok(smoke[index * 3 + 1] >= minTop - 1e-6, 'smoke starts below a chimney top');
  }

  city.setTime(12.5);
  assert.equal(parts.smokeMaterial.uniforms.uTime.value, 12.5);
  assert.equal(parts.fireMaterial.uniforms.uTime.value, 12.5);
  assert.equal(parts.beaconMaterial.uniforms.uTime.value, 12.5);
  city.dispose();
});

test('factory chimneys grow with the building', () => {
  const city = new City({ cols: 40, rows: 40, reflection: false });
  city.update(0, atCell(20, 20));

  let slot = -1;
  for (let index = 0; index < city.count; index += 1) {
    const cell = city.slotCell(index);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (layout && layout.type === 'factory') {
      slot = index;
      break;
    }
  }
  assert.ok(slot >= 0, 'no factory in the ring');

  const layout = cellLayout(city.slotCell(slot).ix, city.slotCell(slot).iz);
  const chimney = factoryChimneys(layout)[0];
  const base = city.factoryParts.bases[slot];
  const matrix = new THREE.Matrix4();

  city.factoryParts.chimneys.getMatrixAt(base.chimneys[0].index, matrix);
  assert.ok(Math.abs(matrix.elements[5]) < 1e-6, 'chimney is already grown');

  city.update(GROW_MS / 2, atCell(20, 20));
  city.factoryParts.chimneys.getMatrixAt(base.chimneys[0].index, matrix);
  const middle = matrix.elements[5];
  assert.ok(middle > 0 && middle < chimney.height, `middle chimney height ${middle}`);

  city.update(GROW_MS + 1, atCell(20, 20));
  city.factoryParts.chimneys.getMatrixAt(base.chimneys[0].index, matrix);
  assert.ok(Math.abs(matrix.elements[5] - chimney.height) < 1e-3, 'chimney did not finish growing');
  city.dispose();
});

test('factory buffers stay bounded while flying across thousands of cells', () => {
  const city = grownCity();
  assert.ok(city.factoryParts, 'factory parts are not wired into the city');
  const capacity = city.factoryParts.chimneys.instanceMatrix.count;
  for (let step = 0; step < 2000; step += 1) {
    city.update(step * 16, atCell(20 + step, 20));
  }
  assert.equal(city.factoryParts.chimneys.instanceMatrix.count, capacity);
  assert.ok(city.factoryParts.chimneys.count <= capacity);
  city.dispose();
});
