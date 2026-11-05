import test from 'node:test';
import assert from 'node:assert/strict';
import { cellLayout } from '../src/layout.js';
import {
  FACTORY_VARIANTS,
  factoryChimneys,
  factoryFence,
  factoryParts,
  factoryVariant,
} from '../src/factoryModel.js';
import { CELL } from '../src/config.js';

const factories = [];
for (let ix = 1; ix <= 200; ix += 1) {
  for (let iz = 1; iz <= 200; iz += 1) {
    const layout = cellLayout(ix, iz);
    if (layout && layout.type === 'factory') factories.push(layout);
  }
}

test('factory silhouettes cover four procedural variants', () => {
  assert.ok(factories.length > 800, `only ${factories.length} factories`);
  const counts = new Array(FACTORY_VARIANTS).fill(0);
  for (const layout of factories) {
    const variant = factoryVariant(layout);
    assert.ok(variant >= 0 && variant < FACTORY_VARIANTS, `variant ${variant}`);
    counts[variant] += 1;
  }
  for (let variant = 0; variant < FACTORY_VARIANTS; variant += 1) {
    const share = counts[variant] / factories.length;
    assert.ok(share > 0.15 && share < 0.35, `variant ${variant} share ${(share * 100).toFixed(1)}%`);
  }
});

test('factories carry one to three seeded chimneys', () => {
  let chimneys = 0;
  let flares = 0;
  for (const layout of factories) {
    const list = factoryChimneys(layout);
    assert.ok(list.length >= 1 && list.length <= 3, `${list.length} chimneys`);
    assert.deepEqual(factoryChimneys(layout), list);
    for (const chimney of list) {
      chimneys += 1;
      if (chimney.flare) flares += 1;
      assert.ok(chimney.radius >= 0.6 && chimney.radius <= 1, `radius ${chimney.radius}`);
      assert.ok(chimney.height >= 8 && chimney.height <= 16, `height ${chimney.height}`);
      assert.ok(Math.abs(chimney.base - layout.h) < 1e-9, 'chimney is not on the roof');
      assert.ok(chimney.seed >= 0 && chimney.seed < 1);
      assert.ok(chimney.x - chimney.radius >= layout.x, 'chimney overhangs west');
      assert.ok(chimney.x + chimney.radius <= layout.x + layout.w, 'chimney overhangs east');
      assert.ok(chimney.z - chimney.radius >= layout.z, 'chimney overhangs north');
      assert.ok(chimney.z + chimney.radius <= layout.z + layout.d, 'chimney overhangs south');
    }
  }
  const flareShare = flares / chimneys;
  assert.ok(flareShare > 0.12 && flareShare < 0.28, `flare share ${(flareShare * 100).toFixed(1)}%`);
});

test('roof kits stay inside the footprint and match their variant', () => {
  for (const layout of factories) {
    const variant = factoryVariant(layout);
    const parts = factoryParts(layout);
    assert.deepEqual(factoryParts(layout), parts);

    if (variant === 0 || variant === 1) {
      assert.equal(parts.length, 1);
      assert.equal(parts[0].kind, 'box');
    } else if (variant === 2) {
      assert.equal(parts.length, 4);
      assert.ok(parts.every((part) => part.kind === 'prism'));
    } else {
      assert.ok(parts.length >= 2 && parts.length <= 3);
      assert.ok(parts.every((part) => part.kind === 'cylinder'));
    }

    for (const part of parts) {
      assert.equal(part.y, layout.h, 'roof part is not on the roof');
      assert.ok(part.h > 0);
      const halfX = part.kind === 'cylinder' ? part.r : part.w / 2;
      const halfZ = part.kind === 'cylinder' ? part.r : part.d / 2;
      const alongX = part.kind !== 'cylinder' && Math.abs(part.rotY) > 1e-6 ? halfZ : halfX;
      const alongZ = part.kind !== 'cylinder' && Math.abs(part.rotY) > 1e-6 ? halfX : halfZ;
      assert.ok(part.x - alongX >= layout.x - 1e-9, 'roof kit overhangs west');
      assert.ok(part.x + alongX <= layout.x + layout.w + 1e-9, 'roof kit overhangs east');
      assert.ok(part.z - alongZ >= layout.z - 1e-9, 'roof kit overhangs north');
      assert.ok(part.z + alongZ <= layout.z + layout.d + 1e-9, 'roof kit overhangs south');
    }
  }
});

test('factories are fenced inside their own plot', () => {
  for (const layout of factories) {
    const fence = factoryFence(layout);
    assert.equal(fence.length, 12);
    assert.deepEqual(factoryFence(layout), fence);

    const rails = fence.filter((part) => part.h < 1);
    const posts = fence.filter((part) => part.h >= 1);
    assert.equal(rails.length, 4);
    assert.equal(posts.length, 8);

    const centerX = layout.x + layout.w / 2;
    const centerZ = layout.z + layout.d / 2;
    const midposts = posts.filter(
      (part) => Math.abs(part.x - centerX) < 1e-9 || Math.abs(part.z - centerZ) < 1e-9,
    );
    assert.equal(midposts.length, 4, 'each side needs its own mid post');

    for (const part of fence) {
      assert.equal(part.kind, 'fence');
      assert.equal(part.ground, true);
      assert.ok(part.h >= 0.8 && part.h <= 1.2, `fence height ${part.h}`);
      assert.ok(
        part.x - part.w / 2 >= layout.ix * CELL + 0.2,
        'fence pokes into the west street',
      );
      assert.ok(
        part.x + part.w / 2 <= (layout.ix + 1) * CELL - 0.2,
        'fence pokes into the east street',
      );
      assert.ok(
        part.z - part.d / 2 >= layout.iz * CELL + 0.2,
        'fence pokes into the north street',
      );
      assert.ok(
        part.z + part.d / 2 <= (layout.iz + 1) * CELL - 0.2,
        'fence pokes into the south street',
      );
    }
  }
});

test('chimneys and roof kits only exist on factories', () => {
  const tower = cellLayout(1, 3);
  assert.equal(tower.type, 'tower');
  assert.deepEqual(factoryChimneys(tower), []);
  assert.deepEqual(factoryParts(tower), []);
  assert.deepEqual(factoryChimneys(null), []);
  assert.deepEqual(factoryParts(null), []);
});
