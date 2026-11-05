import test from 'node:test';
import assert from 'node:assert/strict';
import { cellLayout } from '../src/layout.js';
import { nearestAvenueFace } from '../src/holograms.js';
import {
  DOCK_MIN_HEIGHT,
  skyDockFor,
  skyDockPose,
  skyDockShipPose,
} from '../src/skyDockModel.js';

const towers = [];
const shortTowers = [];
const factories = [];
for (let ix = 1; ix <= 200; ix += 1) {
  for (let iz = 1; iz <= 200; iz += 1) {
    const layout = cellLayout(ix, iz);
    if (!layout) continue;
    if (layout.type === 'factory') factories.push(layout);
    else if (layout.h >= DOCK_MIN_HEIGHT) towers.push(layout);
    else shortTowers.push(layout);
  }
}

test('sky docks only appear on skyscrapers', () => {
  assert.ok(towers.length > 1000, `only ${towers.length} skyscrapers`);
  let docks = 0;
  let roofs = 0;
  let walls = 0;
  let emptyDocks = 0;

  for (const layout of towers) {
    const spec = skyDockFor(layout);
    assert.deepEqual(skyDockFor(layout), spec);
    if (!spec) continue;
    docks += 1;
    if (spec.ships === 0) emptyDocks += 1;
    assert.ok(spec.ships >= 0 && spec.ships <= 4, `ships ${spec.ships}`);
    assert.ok(spec.radius >= 3.5 && spec.radius <= 8.5, `radius ${spec.radius}`);
    assert.ok(spec.thickness >= 0.5 && spec.thickness <= 0.8);
    if (spec.kind === 'roof') {
      roofs += 1;
      assert.equal(spec.face, null);
      assert.equal(spec.heightFrac, 1);
    } else {
      walls += 1;
      assert.ok(spec.heightFrac >= 0.5 && spec.heightFrac <= 0.7);
      assert.equal(spec.face, nearestAvenueFace(layout));
    }
  }

  assert.ok(roofs > 0 && walls > 0);
  const emptyShare = emptyDocks / docks;
  assert.ok(emptyShare > 0.1 && emptyShare < 0.2, `empty docks ${(emptyShare * 100).toFixed(1)}%`);
  assert.ok(shortTowers.length > 0);
  assert.equal(skyDockFor(shortTowers[0]), null);
  assert.equal(skyDockFor(factories[0]), null);
  assert.equal(skyDockFor(null), null);
});

test('sky docks are spread evenly with a minimum spacing', () => {
  const docks = [];
  for (const layout of towers) {
    if (skyDockFor(layout)) docks.push(layout);
  }
  assert.ok(docks.length > 300, `only ${docks.length} docks`);

  let minSpacing = Infinity;
  for (let i = 0; i < docks.length; i += 1) {
    for (let j = i + 1; j < docks.length; j += 1) {
      const distance = Math.max(
        Math.abs(docks[i].ix - docks[j].ix),
        Math.abs(docks[i].iz - docks[j].iz),
      );
      minSpacing = Math.min(minSpacing, distance);
    }
  }
  assert.ok(minSpacing >= 3, `docks are only ${minSpacing} cells apart`);

  for (const start of [1, 51, 100, 149]) {
    const count = docks.filter(
      (dock) =>
        dock.ix >= start
        && dock.ix < start + 52
        && dock.iz >= start
        && dock.iz < start + 52,
    ).length;
    assert.ok(count > 15 && count < 45, `window ${start} has ${count} docks`);
  }
});

test('docks sit on roofs or bite into walls with ships on top', () => {
  let checked = 0;
  for (const layout of towers) {
    const spec = skyDockFor(layout);
    if (!spec) continue;
    checked += 1;
    const pose = skyDockPose(layout, spec, layout.h);

    if (spec.kind === 'roof') {
      assert.ok(Math.abs(pose.x - (layout.x + layout.w / 2)) < 1e-9);
      assert.ok(Math.abs(pose.z - (layout.z + layout.d / 2)) < 1e-9);
      assert.equal(pose.y, layout.h);
      assert.ok(spec.radius > Math.max(layout.w, layout.d) / 2, 'roof dock does not overhang');
    } else {
      assert.ok(Math.abs(pose.y - layout.h * spec.heightFrac) < 1e-9);
      if (spec.face === 'x-') assert.ok(pose.x + spec.radius > layout.x, 'disc does not reach the wall');
      else if (spec.face === 'x+') assert.ok(pose.x - spec.radius < layout.x + layout.w);
      else if (spec.face === 'z-') assert.ok(pose.z + spec.radius > layout.z);
      else assert.ok(pose.z - spec.radius < layout.z + layout.d);
    }

    for (let index = 0; index < spec.ships; index += 1) {
      const ship = skyDockShipPose(layout, spec, layout.h, index);
      const distance = Math.hypot(ship.x - pose.x, ship.z - pose.z);
      assert.ok(distance < spec.radius, `ship ${index} off the platform`);
      assert.ok(Math.abs(ship.y - (pose.y + spec.thickness)) < 1e-9, 'ship is not on the deck');
      assert.ok(Number.isFinite(ship.heading));
    }
  }
  assert.ok(checked > 200, `only ${checked} docks`);
});
