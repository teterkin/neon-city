import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City } from '../src/city.js';
import { cellLayout } from '../src/layout.js';
import { CELL, GROW_MS, PALETTE } from '../src/config.js';

const pad = (value) => value * CELL + CELL / 2;
const atCell = (ix, iz) => ({ x: pad(ix), z: pad(iz) });

function makeCity(options = {}) {
  return new City({ cols: 8, rows: 6, ...options });
}

function occupiedSlots(city) {
  const slots = [];
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (cell && cellLayout(cell.ix, cell.iz)) slots.push(slot);
  }
  return slots;
}

function boxSlots(city) {
  const slots = [];
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (layout && layout.shape === 'box') slots.push(slot);
  }
  return slots;
}

function scaleY(city, slot, mesh = city.mesh) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(slot, matrix);
  const e = matrix.elements;
  return {
    position: new THREE.Vector3(e[12], e[13], e[14]),
    scale: new THREE.Vector3(e[0], e[5], e[10]),
  };
}

test('city builds one instanced mesh with per-instance attributes', () => {
  const city = makeCity();
  assert.equal(city.mesh.isInstancedMesh, true);
  assert.equal(city.mesh.count, 48);
  assert.equal(city.geometry.getAttribute('aSeed').count, 48);
  assert.equal(city.geometry.getAttribute('aGlow').count, 48);
  assert.equal(city.group.children.includes(city.mesh), true);
  city.dispose();
});

test('first update fills the ring with buildings and skips avenues', () => {
  const city = makeCity();
  const result = city.update(0, atCell(10, 10));
  assert.ok(result.rebuilt > 0);
  assert.equal(city.stats.rebuilds, 1);
  assert.ok(occupiedSlots(city).length > 10, `only ${occupiedSlots(city).length} buildings`);
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    assert.ok(cell !== null, `slot ${slot} is unassigned after full ring fill`);
  }
  city.dispose();
});

test('avenue cells stay invisible', () => {
  const city = makeCity();
  city.update(0, atCell(10, 10));
  let checked = 0;
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell || cellLayout(cell.ix, cell.iz)) continue;
    const { scale } = scaleY(city, slot);
    assert.equal(scale.x, 0);
    assert.equal(scale.y, 0);
    checked += 1;
  }
  assert.ok(checked > 0, 'no avenue slots in the ring');
  city.dispose();
});

test('building instances fill the footprint declared by the layout', () => {
  const city = makeCity();
  city.update(0, atCell(10, 10));
  city.update(GROW_MS + 1, atCell(10, 10));
  city.geometry.computeBoundingBox();

  const matrix = new THREE.Matrix4();
  let checked = 0;
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || layout.shape !== 'box') continue;

    city.mesh.getMatrixAt(slot, matrix);
    const box = city.geometry.boundingBox.clone().applyMatrix4(matrix);
    const near = 1e-4;
    assert.ok(Math.abs(box.min.x - layout.x) < near, `min x ${box.min.x} vs ${layout.x}`);
    assert.ok(Math.abs(box.max.x - (layout.x + layout.w)) < near);
    assert.ok(Math.abs(box.min.z - layout.z) < near, `min z ${box.min.z} vs ${layout.z}`);
    assert.ok(Math.abs(box.max.z - (layout.z + layout.d)) < near);
    assert.ok(Math.abs(box.min.y) < near);
    assert.ok(Math.abs(box.max.y - layout.h) < near);
    checked += 1;
  }
  assert.ok(checked > 10, `checked ${checked} buildings`);
  city.dispose();
});

test('same camera cell does not rebuild or respawn anything', () => {
  const city = makeCity();
  city.update(0, atCell(4, 4));
  const spawns = city.stats.spawned;
  const result = city.update(16, atCell(4, 4));
  assert.equal(result.rebuilt, 0);
  assert.equal(city.stats.rebuilds, 1);
  assert.equal(city.stats.spawned, spawns);
  city.dispose();
});

test('crossing a cell boundary recycles only the new row of cells', () => {
  const city = makeCity();
  city.update(0, atCell(4, 4));
  const spawned = city.stats.spawned;
  const result = city.update(16, atCell(5, 4));
  assert.equal(result.rebuilt, 6);
  assert.equal(city.stats.spawned, spawned + 6);
  assert.equal(city.stats.released, 6);
  assert.equal(city.assigned.size, 48);
  city.dispose();
});

test('new buildings grow from zero to their target height', () => {
  const city = makeCity();
  city.update(0, atCell(6, 6));
  const slot = boxSlots(city)[0];
  const cell = city.slotCell(slot);
  const target = cellLayout(cell.ix, cell.iz).h;

  assert.equal(scaleY(city, slot).scale.y, 0);
  city.update(GROW_MS / 2, atCell(6, 6));
  const middle = scaleY(city, slot).scale.y;
  assert.ok(middle > 0 && middle < target, `middle height ${middle} vs ${target}`);

  city.update(GROW_MS + 1, atCell(6, 6));
  const done = scaleY(city, slot).scale.y;
  assert.ok(Math.abs(done - target) < 1e-4, `final height ${done} vs ${target}`);
  city.dispose();
});

test('instance tint matches the palette chosen by the layout', () => {
  const city = makeCity();
  city.update(0, atCell(3, 3));
  const slot = boxSlots(city)[0];
  const cell = city.slotCell(slot);
  const expected = new THREE.Color(PALETTE[cellLayout(cell.ix, cell.iz).colorIndex].tint);
  const actual = new THREE.Color();
  city.mesh.getColorAt(slot, actual);
  assert.ok(
    Math.abs(actual.r - expected.r) < 1e-4
      && Math.abs(actual.g - expected.g) < 1e-4
      && Math.abs(actual.b - expected.b) < 1e-4,
    `${actual.getHexString()} != ${expected.getHexString()}`,
  );
  city.dispose();
});

test('reflection proxy mirrors the building geometry below ground', () => {
  const city = makeCity();
  city.update(0, atCell(8, 8));
  city.update(GROW_MS + 1, atCell(8, 8));
  assert.equal(city.reflection.count, city.count);
  const slot = boxSlots(city)[0];
  const building = scaleY(city, slot);
  const mirrored = scaleY(city, slot, city.reflection);
  assert.ok(mirrored.position.y <= 0);
  assert.ok(Math.abs(mirrored.scale.y + building.scale.y) < 1e-4);
  assert.ok(Math.abs(mirrored.scale.x - building.scale.x) < 1e-4);
  city.dispose();
});

test('reflection can be disabled', () => {
  const city = makeCity({ reflection: false });
  city.update(0, atCell(2, 2));
  assert.equal(city.reflection, null);
  assert.equal(city.group.children.length, 7);
  assert.ok(city.group.children.includes(city.holograms));
  assert.ok(city.group.children.includes(city.holoFrames));
  assert.ok(city.group.children.includes(city.factoryParts.group));
  assert.ok(city.group.children.includes(city.skyDocks.group));
  assert.ok(city.group.children.includes(city.landingPads.group));
  assert.ok(city.group.children.includes(city.shapes.group));
  city.dispose();
});

test('flying across thousands of cells keeps buffers constant', () => {
  const city = makeCity();
  city.update(0, atCell(0, 2));
  const bufferSize = city.mesh.instanceMatrix.count;
  for (let step = 0; step < 10000; step += 1) {
    city.update(step * 16, atCell(step, 2));
  }
  assert.equal(city.mesh.instanceMatrix.count, bufferSize);
  assert.equal(city.mesh.instanceColor.count, bufferSize);
  assert.equal(city.geometry.getAttribute('aSeed').count, bufferSize);
  assert.equal(city.assigned.size, 48);
  assert.ok(city.stats.spawned <= 48 + 10000 * 6);
  city.dispose();
});
