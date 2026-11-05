import { hash2 } from './noise.js';

export const FACTORY_VARIANTS = 4;

const CHIMNEY_FRACTIONS = {
  1: [0.5],
  2: [0.3, 0.7],
  3: [0.25, 0.5, 0.75],
};

const SILO_FRACTIONS = {
  2: [0.35, 0.65],
  3: [0.25, 0.5, 0.75],
};

export function factoryVariant(layout) {
  return Math.floor(hash2(layout.ix, layout.iz, 302) * FACTORY_VARIANTS) % FACTORY_VARIANTS;
}

export function factoryChimneys(layout) {
  if (!layout || layout.type !== 'factory') return [];
  const count = 1 + Math.floor(hash2(layout.ix, layout.iz, 304) * 3);
  const alongX = layout.w >= layout.d;
  const centerX = layout.x + layout.w / 2;
  const centerZ = layout.z + layout.d / 2;

  return CHIMNEY_FRACTIONS[count].map((fraction, index) => {
    const seed = hash2(layout.ix, layout.iz, 312 + index * 6);
    return {
      x: alongX ? layout.x + layout.w * fraction : centerX,
      z: alongX ? centerZ : layout.z + layout.d * fraction,
      base: layout.h,
      height: 8 + seed * 8,
      radius: 0.6 + seed * 0.4,
      flare: hash2(layout.ix, layout.iz, 322 + index * 5) < 0.2,
      seed,
    };
  });
}

export function factoryParts(layout) {
  if (!layout || layout.type !== 'factory') return [];
  const variant = factoryVariant(layout);
  const centerX = layout.x + layout.w / 2;
  const centerZ = layout.z + layout.d / 2;
  const roof = layout.h;

  if (variant === 0 || variant === 1) {
    const scale = variant === 0 ? 0.5 : 0.62;
    const height =
      variant === 0
        ? 3 + hash2(layout.ix, layout.iz, 306) * 2
        : 4 + hash2(layout.ix, layout.iz, 306) * 3;
    return [
      {
        kind: 'box',
        x: centerX,
        y: roof,
        z: centerZ,
        w: layout.w * scale,
        h: height,
        d: layout.d * scale,
        rotY: 0,
      },
    ];
  }

  if (variant === 2) {
    const alongX = layout.w >= layout.d;
    const length = alongX ? layout.w : layout.d;
    const cross = alongX ? layout.d : layout.w;
    const step = length / 4;
    const parts = [];
    for (let index = 0; index < 4; index += 1) {
      const position = (alongX ? layout.x : layout.z) + step * (index + 0.5);
      parts.push({
        kind: 'prism',
        x: alongX ? position : centerX,
        y: roof,
        z: alongX ? centerZ : position,
        w: step,
        h: 2.2 + hash2(layout.ix, layout.iz, 328 + index) * 1.2,
        d: cross * 0.92,
        rotY: alongX ? 0 : Math.PI / 2,
      });
    }
    return parts;
  }

  const count = 2 + (hash2(layout.ix, layout.iz, 330) < 0.5 ? 0 : 1);
  const alongX = layout.w >= layout.d;
  return SILO_FRACTIONS[count].map((fraction, index) => {
    const seed = hash2(layout.ix, layout.iz, 332 + index * 4);
    return {
      kind: 'cylinder',
      x: alongX ? layout.x + layout.w * fraction : centerX,
      y: roof,
      z: alongX ? centerZ : layout.z + layout.d * fraction,
      r: 1.1 + seed * 0.7,
      h: 5 + seed * 4,
      rotY: 0,
    };
  });
}

export function factoryFence(layout) {
  if (!layout || layout.type !== 'factory') return [];

  const margin = 0.8;
  const thickness = 0.14;
  const height = 0.9;
  const postSize = 0.22;
  const postHeight = 1.15;
  const centerX = layout.x + layout.w / 2;
  const centerZ = layout.z + layout.d / 2;
  const halfW = layout.w / 2 + margin;
  const halfD = layout.d / 2 + margin;

  const rail = (x, z, w, d) => ({
    kind: 'fence',
    x,
    z,
    y: 0,
    w,
    h: height,
    d,
    rotY: 0,
    ground: true,
  });
  const post = (x, z) => ({
    kind: 'fence',
    x,
    z,
    y: 0,
    w: postSize,
    h: postHeight,
    d: postSize,
    rotY: 0,
    ground: true,
  });

  return [
    rail(centerX, centerZ - halfD, halfW * 2, thickness),
    rail(centerX, centerZ + halfD, halfW * 2, thickness),
    rail(centerX - halfW, centerZ, thickness, halfD * 2),
    rail(centerX + halfW, centerZ, thickness, halfD * 2),
    post(centerX - halfW, centerZ - halfD),
    post(centerX + halfW, centerZ - halfD),
    post(centerX - halfW, centerZ + halfD),
    post(centerX + halfW, centerZ + halfD),
    post(centerX, centerZ - halfD),
    post(centerX, centerZ + halfD),
    post(centerX - halfW, centerZ),
    post(centerX + halfW, centerZ),
  ];
}
