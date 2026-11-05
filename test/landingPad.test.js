import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/config.js';
import { cellLayout, isAvenue } from '../src/layout.js';
import { landingPadsFor } from '../src/landingPadModel.js';
import { TRAFFIC_TYPES } from '../src/trafficModel.js';

const factories = [];
for (let ix = 1; ix <= 200; ix += 1) {
  for (let iz = 1; iz <= 200; iz += 1) {
    const layout = cellLayout(ix, iz);
    if (layout && layout.type === 'factory') factories.push(layout);
  }
}

test('every factory gets two landing pads next to it', () => {
  assert.ok(factories.length > 800, `only ${factories.length} factories`);
  let pads = 0;
  let ships = 0;
  let cargo = 0;
  let emptyPads = 0;
  let singlePads = 0;
  let doublePads = 0;

  for (const layout of factories) {
    const list = landingPadsFor(layout);
    assert.deepEqual(landingPadsFor(layout), list);
    assert.equal(list.length, 2, `factory ${layout.ix}:${layout.iz} has ${list.length} pads`);
    assert.notEqual(
      `${list[0].cellIx}:${list[0].cellIz}`,
      `${list[1].cellIx}:${list[1].cellIz}`,
      'pads share a cell',
    );

    for (const pad of list) {
      pads += 1;
      assert.equal(isAvenue(pad.cellIx, pad.cellIz), false, 'pad sits on an avenue');
      assert.equal(cellLayout(pad.cellIx, pad.cellIz), null, 'pad cell is not cleared');

      const cellX = pad.cellIx * CELL;
      const cellZ = pad.cellIz * CELL;
      assert.ok(pad.x - pad.width / 2 >= cellX + 1.5, 'pad overhangs west');
      assert.ok(pad.x + pad.width / 2 <= cellX + CELL - 1.5, 'pad overhangs east');
      assert.ok(pad.z - pad.depth / 2 >= cellZ + 1.5, 'pad overhangs north');
      assert.ok(pad.z + pad.depth / 2 <= cellZ + CELL - 1.5, 'pad overhangs south');

      const overlapsFactory =
        pad.x - pad.width / 2 < layout.x + layout.w
        && pad.x + pad.width / 2 > layout.x
        && pad.z - pad.depth / 2 < layout.z + layout.d
        && pad.z + pad.depth / 2 > layout.z;
      assert.equal(overlapsFactory, false, 'pad overlaps the factory');

      assert.ok(pad.ships.length >= 0 && pad.ships.length <= 2);
      if (pad.ships.length === 0) emptyPads += 1;
      else if (pad.ships.length === 1) singlePads += 1;
      else doublePads += 1;
      for (const ship of pad.ships) {
        ships += 1;
        if (ship.type === 'cargo') cargo += 1;
        assert.ok(TRAFFIC_TYPES[ship.type], `unknown ship ${ship.type}`);
        const spec = TRAFFIC_TYPES[ship.type];
        const along = pad.longAxis === 'x' ? pad.width : pad.depth;
        const across = pad.longAxis === 'x' ? pad.depth : pad.width;
        const alongOffset = pad.longAxis === 'x' ? ship.x - pad.x : ship.z - pad.z;
        const acrossOffset = pad.longAxis === 'x' ? ship.z - pad.z : ship.x - pad.x;
        assert.ok(Math.abs(alongOffset) + spec.length / 2 <= along / 2 + 1e-6, 'ship sticks out');
        assert.ok(Math.abs(acrossOffset) + spec.width / 2 <= across / 2 + 1e-6, 'ship sticks out');
        assert.ok(Number.isFinite(ship.heading));
      }
    }
  }

  const cargoShare = cargo / ships;
  assert.ok(cargoShare > 0.7 && cargoShare < 0.9, `cargo share ${(cargoShare * 100).toFixed(1)}%`);
  assert.ok(ships > 0, 'no ships parked anywhere');

  const emptyShare = emptyPads / pads;
  const singleShare = singlePads / pads;
  const doubleShare = doublePads / pads;
  assert.ok(emptyShare > 0.26 && emptyShare < 0.34, `empty ${(emptyShare * 100).toFixed(1)}%`);
  assert.ok(singleShare > 0.36 && singleShare < 0.44, `single ${(singleShare * 100).toFixed(1)}%`);
  assert.ok(doubleShare > 0.26 && doubleShare < 0.34, `double ${(doubleShare * 100).toFixed(1)}%`);
});

test('landing pads only exist on factories', () => {
  const tower = cellLayout(1, 3);
  assert.equal(tower.type, 'tower');
  assert.deepEqual(landingPadsFor(tower), []);
  assert.deepEqual(landingPadsFor(null), []);
});
