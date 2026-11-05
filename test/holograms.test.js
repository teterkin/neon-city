import test from 'node:test';
import assert from 'node:assert/strict';
import { cellLayout } from '../src/layout.js';
import {
  HOLO_TINTS,
  holoPose,
  mediaFacadeFor,
  nearestAvenueFace,
  secondaryMediaFacadeFor,
} from '../src/holograms.js';

const layout = cellLayout(1, 3);

test('media facade selection is deterministic', () => {
  const first = mediaFacadeFor(layout, 1);
  const second = mediaFacadeFor(layout, 1);
  assert.deepEqual(first, second);
  assert.ok(first);
});

test('media facades can be disabled or forced', () => {
  assert.equal(mediaFacadeFor(layout, 0), null);
  assert.ok(mediaFacadeFor(layout, 1));
  assert.equal(mediaFacadeFor(null, 1), null);
});

test('facades face the nearest avenue', () => {
  assert.equal(nearestAvenueFace(cellLayout(1, 3)), 'x-');
  assert.equal(nearestAvenueFace(cellLayout(6, 3)), 'x+');
  assert.equal(nearestAvenueFace(cellLayout(3, 1)), 'z-');
  assert.equal(nearestAvenueFace(cellLayout(3, 6)), 'z+');
});

test('default ad density covers roughly a quarter of buildings', () => {
  let buildings = 0;
  let short = 0;
  let shortAds = 0;
  let tall = 0;
  let tallAds = 0;
  for (let ix = 1; ix <= 200; ix += 1) {
    for (let iz = 1; iz <= 200; iz += 1) {
      const cell = cellLayout(ix, iz);
      if (!cell) continue;
      buildings += 1;
      const spec = mediaFacadeFor(cell, null);
      if (cell.h >= 60) {
        tall += 1;
        if (spec) tallAds += 1;
      } else {
        short += 1;
        if (spec) shortAds += 1;
      }
    }
  }

  const overall = (shortAds + tallAds) / buildings;
  const shortShare = shortAds / short;
  const tallShare = tallAds / tall;
  assert.ok(overall > 0.25 && overall < 0.29, `overall ${(overall * 100).toFixed(1)}%`);
  assert.ok(shortShare > 0.19 && shortShare < 0.21, `short ${(shortShare * 100).toFixed(1)}%`);
  assert.ok(tallShare > 0.38 && tallShare < 0.42, `tall ${(tallShare * 100).toFixed(1)}%`);
  assert.ok(buildings > 20000);
});

test('facade spec stays inside the chosen wall', () => {
  const spec = mediaFacadeFor(layout, 1, 'wall');
  assert.equal(spec.placement, 'wall');
  assert.ok(spec.face.startsWith('x') || spec.face.startsWith('z'));
  assert.ok(spec.widthFrac >= 0.5 && spec.widthFrac <= 0.92);
  assert.ok(spec.heightFrac >= 0.25 && spec.heightFrac <= 0.58);
  const top = spec.centerFrac + spec.heightFrac / 2;
  const bottom = spec.centerFrac - spec.heightFrac / 2;
  assert.ok(bottom >= 0.04 && top <= 0.96, `vertical span ${bottom}..${top}`);
  assert.ok(spec.seed >= 0 && spec.seed < 1);
  assert.ok(Number.isInteger(spec.tintIndex));
  assert.ok(spec.tintIndex >= 0 && spec.tintIndex < HOLO_TINTS.length);
  assert.ok([0, 1, 2].includes(spec.kind));
});

test('corner facades are preferred and project from the corner', () => {
  let corners = 0;
  let walls = 0;
  for (let ix = 1; ix < 60; ix += 1) {
    for (let iz = 1; iz < 60; iz += 1) {
      const cell = cellLayout(ix, iz);
      if (!cell) continue;
      const spec = mediaFacadeFor(cell, 1);
      if (spec.placement === 'corner') {
        corners += 1;
        assert.ok(spec.projection >= 0.7 && spec.projection <= 1.4);
        assert.ok([-1, 1].includes(spec.cornerSide));
      } else {
        walls += 1;
      }
    }
  }
  assert.ok(corners > 0 && walls > 0);
  assert.ok(corners > walls, `corners ${corners}, walls ${walls}`);
});

test('corner blades are seated in the building and face the street', () => {
  const seat = 0.02;
  const frameInset = 0.012;
  for (const [ix, iz, face] of [
    [1, 3, 'x-'],
    [6, 3, 'x+'],
    [3, 1, 'z-'],
    [3, 6, 'z+'],
  ]) {
    const cell = cellLayout(ix, iz);
    const spec = mediaFacadeFor(cell, 1, 'corner');
    assert.equal(spec.placement, 'corner');
    const pose = holoPose(cell, spec, cell.h);
    const projection = spec.projection;
    const normalX = Math.sin(pose.rotationY);
    const normalZ = Math.cos(pose.rotationY);

    assert.ok(pose.height > 0);
    assert.ok(pose.width === projection);

    if (face === 'x-') {
      assert.ok(Math.abs(pose.x - (cell.x - projection / 2 + 0.3)) < 1e-9);
      assert.ok(pose.x - projection / 2 < cell.x - 0.25);
    } else if (face === 'x+') {
      assert.ok(Math.abs(pose.x - (cell.x + cell.w + projection / 2 - 0.3)) < 1e-9);
      assert.ok(pose.x + projection / 2 > cell.x + cell.w + 0.25);
    } else if (face === 'z-') {
      assert.ok(Math.abs(pose.z - (cell.z - projection / 2 + 0.3)) < 1e-9);
      assert.ok(pose.z - projection / 2 < cell.z - 0.25);
    } else {
      assert.ok(Math.abs(pose.z - (cell.z + cell.d + projection / 2 - 0.3)) < 1e-9);
      assert.ok(pose.z + projection / 2 > cell.z + cell.d + 0.25);
    }

    if (face.startsWith('x')) {
      assert.ok(Math.abs(normalX) < 1e-9, `blade must run along x, normalX ${normalX}`);
      if (spec.cornerSide < 0) {
        assert.ok(Math.abs(pose.z - (cell.z + seat)) < 1e-9, 'near blade is not seated');
        assert.ok(normalZ < -0.99, `near blade faces inward, normalZ ${normalZ}`);
      } else {
        assert.ok(Math.abs(pose.z - (cell.z + cell.d - seat)) < 1e-9, 'far blade is not seated');
        assert.ok(normalZ > 0.99, `far blade faces inward, normalZ ${normalZ}`);
      }
      const frameZ = pose.z - normalZ * frameInset;
      assert.ok(
        frameZ > cell.z && frameZ < cell.z + cell.d,
        `backing pokes out of the side wall: ${frameZ} vs ${cell.z}..${cell.z + cell.d}`,
      );
    } else {
      assert.ok(Math.abs(normalZ) < 1e-9, `blade must run along z, normalZ ${normalZ}`);
      if (spec.cornerSide < 0) {
        assert.ok(Math.abs(pose.x - (cell.x + seat)) < 1e-9, 'near blade is not seated');
        assert.ok(normalX < -0.99, `near blade faces inward, normalX ${normalX}`);
      } else {
        assert.ok(Math.abs(pose.x - (cell.x + cell.w - seat)) < 1e-9, 'far blade is not seated');
        assert.ok(normalX > 0.99, `far blade faces inward, normalX ${normalX}`);
      }
      const frameX = pose.x - normalX * frameInset;
      assert.ok(
        frameX > cell.x && frameX < cell.x + cell.w,
        `backing pokes out of the side wall: ${frameX} vs ${cell.x}..${cell.x + cell.w}`,
      );
    }
  }
});

test('wall screens and frames stay inside the building silhouette', () => {
  for (let ix = 1; ix < 50; ix += 1) {
    for (let iz = 1; iz < 50; iz += 1) {
      const cell = cellLayout(ix, iz);
      if (!cell) continue;
      const spec = mediaFacadeFor(cell, 1, 'wall');
      const pose = holoPose(cell, spec, cell.h);
      const frameWidth = pose.width + 0.16;
      const frameHeight = pose.height + 0.16;

      assert.ok(
        pose.y - frameHeight / 2 >= -1e-6 && pose.y + frameHeight / 2 <= cell.h + 1e-6,
        'wall panel sticks above the roof',
      );

      if (spec.face.startsWith('x')) {
        const wall = spec.face === 'x-' ? cell.x : cell.x + cell.w;
        assert.ok(Math.abs(pose.x - wall) <= 0.03, 'screen off the wall');
        assert.ok(pose.z - frameWidth / 2 >= cell.z - 1e-6);
        assert.ok(pose.z + frameWidth / 2 <= cell.z + cell.d + 1e-6);
      } else {
        const wall = spec.face === 'z-' ? cell.z : cell.z + cell.d;
        assert.ok(Math.abs(pose.z - wall) <= 0.03, 'screen off the wall');
        assert.ok(pose.x - frameWidth / 2 >= cell.x - 1e-6);
        assert.ok(pose.x + frameWidth / 2 <= cell.x + cell.w + 1e-6);
      }
    }
  }
});

test('facade ads sit in the upper part of the building', () => {
  let checked = 0;
  for (let ix = 1; ix < 40; ix += 1) {
    for (let iz = 1; iz < 40; iz += 1) {
      const cell = cellLayout(ix, iz);
      if (!cell) continue;
      const spec = mediaFacadeFor(cell, 1, 'wall');
      const top = spec.centerFrac + spec.heightFrac / 2;
      const bottom = spec.centerFrac - spec.heightFrac / 2;
      assert.ok(top >= 0.84 && top <= 0.91, `top ${top}`);
      assert.ok(bottom >= 0.38, `bottom ${bottom}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100);
});

test('holoPose puts a wall plane just outside the facade', () => {
  for (const [ix, iz, expected] of [
    [1, 3, 'x-'],
    [6, 3, 'x+'],
    [3, 1, 'z-'],
    [3, 6, 'z+'],
  ]) {
    const cell = cellLayout(ix, iz);
    const spec = mediaFacadeFor(cell, 1, 'wall');
    assert.equal(spec.face, expected);
    const pose = holoPose(cell, spec, cell.h);
    const offset = 0.02;
    assert.ok(pose.height > 0);
    assert.ok(pose.width > 0);
    assert.ok(pose.y - pose.height / 2 >= 0);
    assert.ok(pose.y + pose.height / 2 <= cell.h);

    if (expected === 'x-') {
      assert.ok(Math.abs(pose.x - (cell.x - offset)) < 1e-9);
      assert.ok(Math.abs(pose.width - cell.d * spec.widthFrac) < 1e-9);
      assert.equal(pose.rotationY, -Math.PI / 2);
    } else if (expected === 'x+') {
      assert.ok(Math.abs(pose.x - (cell.x + cell.w + offset)) < 1e-9);
      assert.equal(pose.rotationY, Math.PI / 2);
    } else if (expected === 'z-') {
      assert.ok(Math.abs(pose.z - (cell.z - offset)) < 1e-9);
      assert.ok(Math.abs(pose.width - cell.w * spec.widthFrac) < 1e-9);
      assert.equal(pose.rotationY, Math.PI);
    } else {
      assert.ok(Math.abs(pose.z - (cell.z + cell.d + offset)) < 1e-9);
      assert.equal(pose.rotationY, 0);
    }
  }
});

test('secondary facades add a rare wall panel on a perpendicular side', () => {
  let buildings = 0;
  let secondary = 0;
  for (let ix = 1; ix <= 100; ix += 1) {
    for (let iz = 1; iz <= 100; iz += 1) {
      const cell = cellLayout(ix, iz);
      if (!cell) continue;
      buildings += 1;
      const primary = mediaFacadeFor(cell, 1);
      const spec = secondaryMediaFacadeFor(cell, primary);
      assert.deepEqual(secondaryMediaFacadeFor(cell, primary), spec);
      if (!spec) continue;

      secondary += 1;
      assert.equal(spec.placement, 'wall');
      assert.notEqual(
        spec.face.startsWith('x'),
        primary.face.startsWith('x'),
        `secondary ${spec.face} is not perpendicular to ${primary.face}`,
      );

      const pose = holoPose(cell, spec, cell.h);
      const frameWidth = pose.width + 0.16;
      const top = spec.centerFrac + spec.heightFrac / 2;
      const bottom = spec.centerFrac - spec.heightFrac / 2;
      assert.ok(top >= 0.84 && top <= 0.91, `top ${top}`);
      assert.ok(bottom >= 0.38, `bottom ${bottom}`);

      if (spec.face.startsWith('x')) {
        const wall = spec.face === 'x-' ? cell.x : cell.x + cell.w;
        assert.ok(Math.abs(pose.x - wall) <= 0.03, 'secondary off the wall');
        assert.ok(pose.z - frameWidth / 2 >= cell.z - 1e-6);
        assert.ok(pose.z + frameWidth / 2 <= cell.z + cell.d + 1e-6);
      } else {
        const wall = spec.face === 'z-' ? cell.z : cell.z + cell.d;
        assert.ok(Math.abs(pose.z - wall) <= 0.03, 'secondary off the wall');
        assert.ok(pose.x - frameWidth / 2 >= cell.x - 1e-6);
        assert.ok(pose.x + frameWidth / 2 <= cell.x + cell.w + 1e-6);
      }
    }
  }

  const share = secondary / buildings;
  assert.ok(share > 0.08 && share < 0.12, `share ${(share * 100).toFixed(1)}%`);
  assert.ok(buildings > 7000);
});

test('secondary facades need a primary facade', () => {
  const cell = cellLayout(1, 3);
  assert.equal(secondaryMediaFacadeFor(null, mediaFacadeFor(cell, 1)), null);
  assert.equal(secondaryMediaFacadeFor(cell, null), null);
});
