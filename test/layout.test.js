import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVENUE_EVERY,
  CELL,
  MAX_HEIGHT,
  MIN_HEIGHT,
  PALETTE,
} from '../src/config.js';
import {
  avenueCenterX,
  cellLayout,
  cellOf,
  isAvenue,
  ringCells,
} from '../src/layout.js';

test('avenue mask uses a stable modulo grid, including negatives', () => {
  assert.equal(isAvenue(0, 3), true);
  assert.equal(isAvenue(3, 0), true);
  assert.equal(isAvenue(7, 7), true);
  assert.equal(isAvenue(-7, 2), true);
  assert.equal(isAvenue(1, 1), false);
  assert.equal(isAvenue(-1, -1), false);
  assert.equal(isAvenue(4, 6), false);
});

test('cell layout is deterministic', () => {
  for (const [ix, iz] of [[3, 4], [-12, 9], [100, -200]]) {
    assert.deepEqual(cellLayout(ix, iz), cellLayout(ix, iz));
  }
});

test('avenue cells stay empty', () => {
  assert.equal(cellLayout(0, 0), null);
  assert.equal(cellLayout(7, 11), null);
  assert.equal(cellLayout(-14, 5), null);
  assert.notEqual(cellLayout(1, 2), null);
});

test('heights stay inside configured bounds and actually vary', () => {
  let lowest = Infinity;
  let highest = -Infinity;
  for (let ix = 0; ix < 180; ix += 1) {
    for (let iz = 0; iz < 180; iz += 1) {
      const layout = cellLayout(ix, iz);
      if (!layout) continue;
      assert.ok(layout.h >= MIN_HEIGHT, `height ${layout.h} below minimum`);
      assert.ok(layout.h <= MAX_HEIGHT, `height ${layout.h} above maximum`);
      lowest = Math.min(lowest, layout.h);
      highest = Math.max(highest, layout.h);
    }
  }
  assert.ok(highest - lowest > 60, `height spread ${highest - lowest} too flat`);
});

test('footprint fits the cell with a visible gap', () => {
  for (let ix = 1; ix < 60; ix += 1) {
    for (let iz = 1; iz < 60; iz += 1) {
      const layout = cellLayout(ix, iz);
      if (!layout) continue;
      assert.ok(layout.w > 0 && layout.d > 0);
      assert.ok(layout.x >= ix * CELL + 1, 'west gap too small');
      assert.ok(layout.x + layout.w <= (ix + 1) * CELL - 1, 'east gap too small');
      assert.ok(layout.z >= iz * CELL + 1, 'north gap too small');
      assert.ok(layout.z + layout.d <= (iz + 1) * CELL - 1, 'south gap too small');
    }
  }
});

test('neon tint and glow are valid for every building', () => {
  for (let ix = 1; ix < 40; ix += 1) {
    for (let iz = 1; iz < 40; iz += 1) {
      const layout = cellLayout(ix, iz);
      if (!layout) continue;
      assert.ok(Number.isInteger(layout.colorIndex));
      assert.ok(layout.colorIndex >= 0 && layout.colorIndex < PALETTE.length);
      assert.ok(layout.glow > 0 && layout.glow <= 3);
      assert.ok(layout.seed >= 0 && layout.seed < 1);
    }
  }
});

test('neighbouring cells are not identical', () => {
  const a = cellLayout(11, 13);
  const b = cellLayout(12, 13);
  assert.notEqual(a.h, b.h);
  assert.notEqual(a.w, b.w);
});

test('rare factories are low, wide and deterministic', () => {
  let buildings = 0;
  let factories = 0;
  for (let ix = 1; ix <= 200; ix += 1) {
    for (let iz = 1; iz <= 200; iz += 1) {
      const layout = cellLayout(ix, iz);
      if (!layout) continue;
      buildings += 1;
      assert.ok(
        layout.type === 'tower' || layout.type === 'factory',
        `unknown type ${layout.type}`,
      );
      if (layout.type !== 'factory') continue;
      factories += 1;
      assert.ok(layout.h >= MIN_HEIGHT, `factory height ${layout.h} below minimum`);
      assert.ok(layout.h <= MIN_HEIGHT + 8, `factory height ${layout.h} too tall`);
      assert.ok(layout.w >= CELL * 0.75 && layout.w <= CELL * 0.85, `factory w ${layout.w}`);
      assert.ok(layout.d >= CELL * 0.75 && layout.d <= CELL * 0.85, `factory d ${layout.d}`);
    }
  }

  const share = factories / buildings;
  assert.ok(share > 0.045 && share < 0.075, `factory share ${(share * 100).toFixed(1)}%`);
  assert.ok(factories > 800, `only ${factories} factories`);
  assert.ok(buildings > 19000, `only ${buildings} buildings left`);
});

test('factories keep a one-building clearing ring', () => {
  let factories = 0;
  for (let ix = 1; ix <= 200; ix += 1) {
    for (let iz = 1; iz <= 200; iz += 1) {
      const layout = cellLayout(ix, iz);
      if (!layout || layout.type !== 'factory') continue;
      factories += 1;
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx === 0 && dz === 0) continue;
          assert.equal(
            cellLayout(ix + dx, iz + dz),
            null,
            `neighbour ${ix + dx}:${iz + dz} of factory ${ix}:${iz} is built up`,
          );
        }
      }
    }
  }
  assert.ok(factories > 800, `only ${factories} factories`);
});

test('cellOf maps world coordinates to cell indices', () => {
  assert.deepEqual(cellOf(0, 0), { ix: 0, iz: 0 });
  assert.deepEqual(cellOf(13.99, 0.01), { ix: 0, iz: 0 });
  assert.deepEqual(cellOf(CELL, 0), { ix: 1, iz: 0 });
  assert.deepEqual(cellOf(-0.1, 0), { ix: -1, iz: 0 });
  assert.deepEqual(cellOf(-CELL, 3 * CELL), { ix: -1, iz: 3 });
});

test('ring covers a unique rectangle centred on the camera cell', () => {
  const cells = ringCells(10, -4, 8, 6);
  assert.equal(cells.length, 48);
  const keys = new Set(cells.map((c) => `${c.ix}:${c.iz}`));
  assert.equal(keys.size, 48);
  assert.ok(keys.has('10:-4'), 'camera cell missing');
  assert.equal(Math.min(...cells.map((c) => c.ix)), 6);
  assert.equal(Math.max(...cells.map((c) => c.ix)), 13);
  assert.equal(Math.min(...cells.map((c) => c.iz)), -7);
  assert.equal(Math.max(...cells.map((c) => c.iz)), -2);
});

test('ring shifts by one cell when the camera crosses a cell boundary', () => {
  const before = new Set(ringCells(0, 0, 8, 8).map((c) => `${c.ix}:${c.iz}`));
  const after = new Set(ringCells(1, 0, 8, 8).map((c) => `${c.ix}:${c.iz}`));
  const overlap = [...before].filter((key) => after.has(key));
  assert.equal(overlap.length, 8 * 7);
});

test('avenueCenterX snaps to the middle of an avenue cell', () => {
  for (const x of [0, 3, 42, 97, 314, -55, -220]) {
    const center = avenueCenterX(x);
    const ix = Math.floor(center / CELL);
    assert.equal(isAvenue(ix, 123), true, `x=${x} -> ix=${ix} is not an avenue`);
    assert.ok(Math.abs(center - x) <= (CELL * AVENUE_EVERY) / 2 + 1e-9);
    assert.equal(avenueCenterX(center), center);
  }
});
