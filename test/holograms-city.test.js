import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City } from '../src/city.js';
import { cellLayout } from '../src/layout.js';
import { GROW_MS } from '../src/config.js';
import { HOLO_TINTS, holoPose, mediaFacadeFor } from '../src/holograms.js';

const pad = (value) => value * 14 + 7;
const atCell = (ix, iz) => ({ x: pad(ix), z: pad(iz) });

function firstBuildingSlot(city) {
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (layout && layout.type === 'tower' && layout.shape === 'box') return slot;
  }
  return -1;
}

test('city instances media facades on buildings', () => {
  const city = new City({ cols: 8, rows: 6, holoProbability: 1 });
  city.update(0, atCell(8, 8));
  city.update(GROW_MS + 1, atCell(8, 8));

  assert.equal(city.holograms.isInstancedMesh, true);
  assert.equal(city.holograms.count, city.count * 2);

  const slot = firstBuildingSlot(city);
  const cell = city.slotCell(slot);
  const layout = cellLayout(cell.ix, cell.iz);
  const spec = mediaFacadeFor(layout, 1);
  const pose = holoPose(layout, spec, layout.h);

  const matrix = new THREE.Matrix4();
  city.holograms.getMatrixAt(slot, matrix);
  const e = matrix.elements;
  assert.ok(Math.abs(e[12] - pose.x) < 1e-4, `x ${e[12]} vs ${pose.x}`);
  assert.ok(Math.abs(e[13] - pose.y) < 1e-4, `y ${e[13]} vs ${pose.y}`);
  assert.ok(Math.abs(e[14] - pose.z) < 1e-4, `z ${e[14]} vs ${pose.z}`);
  assert.ok(Math.abs(e[5] - pose.height) < 1e-4, `height ${e[5]} vs ${pose.height}`);

  const color = new THREE.Color();
  city.holograms.getColorAt(slot, color);
  const expected = new THREE.Color(HOLO_TINTS[spec.tintIndex]);
  assert.ok(Math.abs(color.r - expected.r) < 1e-3);
  assert.ok(city.stats.holograms > 0);
  city.dispose();
});

test('avenue slots have no media facade geometry', () => {
  const city = new City({ cols: 8, rows: 6, holoProbability: 1 });
  city.update(0, atCell(8, 8));
  city.update(GROW_MS + 1, atCell(8, 8));

  const matrix = new THREE.Matrix4();
  let checked = 0;
  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell || cellLayout(cell.ix, cell.iz)) continue;
    city.holograms.getMatrixAt(slot, matrix);
    assert.equal(matrix.elements[5], 0);
    checked += 1;
  }
  assert.ok(checked > 0);
  city.dispose();
});

test('media facades get a physical frame behind the screen', () => {
  const city = new City({ cols: 8, rows: 6, holoProbability: 1 });
  city.update(0, atCell(8, 8));
  city.update(GROW_MS + 1, atCell(8, 8));

  assert.equal(city.holoFrames.isInstancedMesh, true);
  assert.equal(city.holoFrames.count, city.count * 2);

  const slot = firstBuildingSlot(city);
  const cell = city.slotCell(slot);
  const layout = cellLayout(cell.ix, cell.iz);
  const spec = mediaFacadeFor(layout, 1);
  const pose = holoPose(layout, spec, layout.h);

  const screen = new THREE.Matrix4();
  const frame = new THREE.Matrix4();
  city.holograms.getMatrixAt(slot, screen);
  city.holoFrames.getMatrixAt(slot, frame);
  assert.ok(frame.elements[0] > screen.elements[0], 'frame should be wider than screen');
  assert.ok(frame.elements[5] > screen.elements[5], 'frame should be taller than screen');
  assert.ok(
    Math.abs(frame.elements[14] - pose.z) < 0.2,
    'frame should sit just behind the screen',
  );

  const avenue = city.slotCell(0);
  if (avenue && !cellLayout(avenue.ix, avenue.iz)) {
    city.holoFrames.getMatrixAt(0, frame);
    assert.equal(frame.elements[5], 0);
  }
  city.dispose();
});

test('media panels intersect the rendered building volume', () => {
  const city = new City({ cols: 16, rows: 12, holoProbability: 1, reflection: false });
  city.update(0, atCell(8, 8));
  city.update(GROW_MS + 1, atCell(8, 8));

  city.geometry.computeBoundingBox();
  city.holoGeometry.computeBoundingBox();

  const matrix = new THREE.Matrix4();
  const building = new THREE.Box3();
  const panel = new THREE.Box3();
  let checked = 0;
  let secondary = 0;

  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || !mediaFacadeFor(layout, 1)) continue;

    city.mesh.getMatrixAt(slot, matrix);
    building.copy(city.geometry.boundingBox).applyMatrix4(matrix);

    city.holograms.getMatrixAt(slot, matrix);
    panel.copy(city.holoGeometry.boundingBox).applyMatrix4(matrix);

    assert.ok(
      building.clone().expandByScalar(0.05).intersectsBox(panel),
      `panel ${cell.ix}:${cell.iz} floats: building x ${building.min.x.toFixed(2)}..${building.max.x.toFixed(2)}`
        + ` z ${building.min.z.toFixed(2)}..${building.max.z.toFixed(2)},`
        + ` panel x ${panel.min.x.toFixed(2)}..${panel.max.x.toFixed(2)}`
        + ` z ${panel.min.z.toFixed(2)}..${panel.max.z.toFixed(2)}`,
    );
    checked += 1;

    city.holograms.getMatrixAt(city.count + slot, matrix);
    if (matrix.elements[5] === 0) continue;
    panel.copy(city.holoGeometry.boundingBox).applyMatrix4(matrix);
    assert.ok(
      building.clone().expandByScalar(0.05).intersectsBox(panel),
      `secondary panel ${cell.ix}:${cell.iz} floats:`
        + ` panel x ${panel.min.x.toFixed(2)}..${panel.max.x.toFixed(2)}`
        + ` z ${panel.min.z.toFixed(2)}..${panel.max.z.toFixed(2)}`,
    );
    secondary += 1;
  }

  assert.ok(checked > 20, `checked ${checked} panels`);
  assert.ok(secondary > 0, `checked ${secondary} secondary panels`);
  city.dispose();
});

test('some buildings carry a second media facade instance', () => {
  const city = new City({ cols: 16, rows: 12, holoProbability: 1, reflection: false });
  city.update(0, atCell(8, 8));
  city.update(GROW_MS + 1, atCell(8, 8));

  assert.equal(city.holograms.count, city.count * 2);
  assert.equal(city.holoFrames.count, city.count * 2);

  const matrix = new THREE.Matrix4();
  let secondary = 0;
  for (let slot = 0; slot < city.count; slot += 1) {
    city.holograms.getMatrixAt(city.count + slot, matrix);
    if (matrix.elements[5] !== 0) secondary += 1;
  }
  assert.ok(secondary > 0, 'no secondary panels written');
  city.dispose();
});

test('holoProbability zero leaves every facade empty', () => {
  const city = new City({ cols: 8, rows: 6, holoProbability: 0 });
  city.update(0, atCell(8, 8));
  city.update(GROW_MS + 1, atCell(8, 8));

  assert.equal(city.stats.holograms, 0);
  const matrix = new THREE.Matrix4();
  for (let slot = 0; slot < city.holograms.count; slot += 1) {
    city.holograms.getMatrixAt(slot, matrix);
    assert.equal(matrix.elements[5], 0);
  }
  city.dispose();
});
