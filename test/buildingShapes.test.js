import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { City } from '../src/city.js';
import { cellLayout } from '../src/layout.js';
import { GROW_MS } from '../src/config.js';
import {
  SHAPE_VARIANTS,
  createArchGeometry,
  createConeGeometry,
  createCylinderGeometry,
  createPyramidGeometry,
} from '../src/buildingShapes.js';

const pad = (value) => value * 14 + 7;
const atCell = (ix, iz) => ({ x: pad(ix), z: pad(iz) });

function variantIndex(layout) {
  if (layout.shape === 'arch') {
    if (layout.archHole === 'stadium') return 5;
    if (layout.archHole === 'ellipse') return 4;
    return 3;
  }
  return { pyramid: 0, cone: 1, cylinder: 2 }[layout.shape] ?? -1;
}

test('silhouette geometries fit a unit cell', () => {
  const geometries = [
    createPyramidGeometry(),
    createConeGeometry(),
    createCylinderGeometry(),
    createArchGeometry('circle'),
    createArchGeometry('ellipse'),
    createArchGeometry('stadium'),
  ];
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    assert.ok(Math.abs(box.min.y) < 1e-6, `base y ${box.min.y}`);
    assert.ok(Math.abs(box.max.y - 1) < 1e-6, `top y ${box.max.y}`);
    assert.ok(box.min.x >= -0.5001 && box.max.x <= 0.5001, 'x exceeds the cell');
    assert.ok(box.min.z >= -0.5001 && box.max.z <= 0.5001, 'z exceeds the cell');
  }
  const circle = createArchGeometry('circle');
  const ellipse = createArchGeometry('ellipse');
  const stadium = createArchGeometry('stadium');
  const signature = (geometry) => {
    let sum = 0;
    for (const value of geometry.getAttribute('position').array) sum += value;
    return sum;
  };
  assert.notEqual(signature(circle), signature(ellipse), 'circle and ellipse share a silhouette');
  assert.notEqual(
    signature(ellipse),
    signature(stadium),
    'ellipse and stadium share a silhouette',
  );
});

test('all arch variants have open tunnels', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const hole of ['circle', 'ellipse', 'stadium']) {
    const mesh = new THREE.Mesh(createArchGeometry(hole), material);
    const through = new THREE.Raycaster(
      new THREE.Vector3(0, 0.55, -2),
      new THREE.Vector3(0, 0, 1),
    );
    assert.equal(
      through.intersectObject(mesh).length,
      0,
      `${hole} tunnel is blocked`,
    );
    const solid = new THREE.Raycaster(
      new THREE.Vector3(0.45, 0.55, -2),
      new THREE.Vector3(0, 0, 1),
    );
    assert.ok(solid.intersectObject(mesh).length > 0, `${hole} face is missing`);
  }
});

test('new silhouettes are instanced, mirrored and fitted with antennas', () => {
  const city = new City({ cols: 52, rows: 52 });
  city.update(0, atCell(26, 26));
  city.update(GROW_MS + 1, atCell(26, 26));

  const counts = new Array(SHAPE_VARIANTS.length).fill(0);
  let shapeSlots = 0;
  let cylinders = 0;

  for (let slot = 0; slot < city.count; slot += 1) {
    const cell = city.slotCell(slot);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || layout.shape === 'box') continue;
    shapeSlots += 1;
    const base = city.shapes.bases[slot];
    assert.ok(base, `shape ${cell.ix}:${cell.iz} has no instance`);
    assert.ok(base.mast >= 0, 'shape has no antenna mast');
    counts[base.entry] += 1;
    if (layout.shape === 'cylinder') cylinders += 1;
  }

  assert.ok(shapeSlots > 50, `only ${shapeSlots} shapes`);
  assert.ok(cylinders > 0);
  city.shapes.entries.forEach((entry, index) => {
    assert.equal(entry.mesh.count, counts[index], `mesh count for ${entry.key}`);
    assert.equal(entry.mirror.count, counts[index], `mirror count for ${entry.key}`);
  });
  assert.equal(city.shapes.masts.count, shapeSlots);
  assert.equal(city.shapes.beacon.geometry.drawRange.count, shapeSlots);
  city.dispose();
});

test('shape antennas grow with the building and avoid the cylinder centre', () => {
  const city = new City({ cols: 52, rows: 52, reflection: false });
  city.update(0, atCell(26, 26));

  let slot = -1;
  let cylinderSlot = -1;
  for (let index = 0; index < city.count; index += 1) {
    const cell = city.slotCell(index);
    if (!cell) continue;
    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout || layout.shape === 'box') continue;
    if (slot < 0) slot = index;
    if (layout.shape === 'cylinder') {
      cylinderSlot = index;
      break;
    }
  }
  assert.ok(slot >= 0, 'no shape in the ring');

  const layout = city.slotLayout[slot];
  const base = city.shapes.bases[slot];
  const entry = city.shapes.entries[base.entry];
  const matrix = new THREE.Matrix4();

  entry.mesh.getMatrixAt(base.instance, matrix);
  assert.ok(Math.abs(matrix.elements[5]) < 1e-6, 'shape is already grown');

  city.update(GROW_MS / 2, atCell(26, 26));
  entry.mesh.getMatrixAt(base.instance, matrix);
  assert.ok(matrix.elements[5] > 0 && matrix.elements[5] < layout.h, 'shape did not grow');

  city.update(GROW_MS + 1, atCell(26, 26));
  entry.mesh.getMatrixAt(base.instance, matrix);
  assert.ok(Math.abs(matrix.elements[5] - layout.h) < 0.05, 'shape did not reach its height');

  city.shapes.masts.getMatrixAt(base.mast, matrix);
  const mastX = matrix.elements[12];
  const mastY = matrix.elements[13];
  const centerX = layout.x + layout.w / 2;
  if (layout.shape === 'cylinder') {
    assert.ok(Math.abs(Math.abs(mastX - centerX) - layout.w * 0.4) < 1e-4);
  } else {
    assert.ok(Math.abs(mastX - centerX) < 1e-6);
  }
  assert.ok(Math.abs(mastY - layout.h) < 0.05, 'antenna does not stand on the roof');

  if (cylinderSlot >= 0) {
    const cylinder = city.slotLayout[cylinderSlot];
    const cylinderBase = city.shapes.bases[cylinderSlot];
    city.shapes.masts.getMatrixAt(cylinderBase.mast, matrix);
    const cylinderCenter = cylinder.x + cylinder.w / 2;
    assert.ok(Math.abs(Math.abs(matrix.elements[12] - cylinderCenter) - cylinder.w * 0.4) < 1e-4);
  }
  city.dispose();
});

test('shape buffers stay bounded while flying across thousands of cells', () => {
  const city = new City({ cols: 52, rows: 52 });
  city.update(0, atCell(26, 26));
  city.update(GROW_MS + 1, atCell(26, 26));
  const capacity = city.shapes.entries[0].mesh.instanceMatrix.count;
  for (let step = 0; step < 2000; step += 1) {
    city.update(step * 16, atCell(26 + step, 26));
  }
  for (const entry of city.shapes.entries) {
    assert.equal(entry.mesh.instanceMatrix.count, capacity);
    assert.ok(entry.mesh.count <= city.shapes.capacity);
  }
  assert.ok(city.shapes.masts.count <= city.shapes.capacity);
  city.dispose();
});
