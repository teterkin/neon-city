import { hash2 } from './noise.js';

export const HOLO_TINTS = [0x35f6ff, 0xff35b0, 0x9a6bff, 0xffd166];

function modulo(value, base) {
  return ((value % base) + base) % base;
}

export function nearestAvenueFace(layout) {
  const options = [
    { face: 'x-', distance: modulo(layout.ix, 7) },
    { face: 'x+', distance: 7 - modulo(layout.ix, 7) },
    { face: 'z-', distance: modulo(layout.iz, 7) },
    { face: 'z+', distance: 7 - modulo(layout.iz, 7) },
  ];
  const nearest = Math.min(...options.map((option) => option.distance));
  const candidates = options.filter((option) => option.distance === nearest);
  const index = Math.floor(hash2(layout.ix, layout.iz, 353) * candidates.length);
  return candidates[index % candidates.length].face;
}

export function mediaFacadeFor(layout, probability = null, placement = null) {
  if (!layout) return null;
  if (layout.type === 'factory' || layout.shape !== 'box') return null;
  if (probability !== null && probability <= 0) return null;
  const chance = probability ?? (layout.h >= 60 ? 0.4 : 0.2);
  if (hash2(layout.ix, layout.iz, 401) > chance) return null;

  const heightFrac = 0.25 + hash2(layout.ix, layout.iz, 409) * 0.17;
  const topFrac = 0.85 + hash2(layout.ix, layout.iz, 419) * 0.05;
  const centerFrac = topFrac - heightFrac / 2;
  const widthFrac = 0.55 + hash2(layout.ix, layout.iz, 421) * 0.35;
  const tintIndex = Math.floor(hash2(layout.ix, layout.iz, 431) * HOLO_TINTS.length);
  const placementType =
    placement ?? (hash2(layout.ix, layout.iz, 451) < 0.65 ? 'corner' : 'wall');

  return {
    face: nearestAvenueFace(layout),
    placement: placementType,
    widthFrac,
    heightFrac,
    centerFrac,
    tintIndex: tintIndex % HOLO_TINTS.length,
    kind: Math.floor(hash2(layout.ix, layout.iz, 439) * 3),
    seed: hash2(layout.ix, layout.iz, 443),
    projection:
      placementType === 'corner' ? 0.7 + hash2(layout.ix, layout.iz, 457) * 0.7 : 0,
    cornerSide: hash2(layout.ix, layout.iz, 461) < 0.5 ? -1 : 1,
  };
}

export function secondaryMediaFacadeFor(layout, primary) {
  if (!layout || !primary) return null;
  if (hash2(layout.ix, layout.iz, 467) >= 0.1) return null;

  const axis = primary.face.startsWith('x') ? 'z' : 'x';
  const side =
    primary.placement === 'corner'
      ? -primary.cornerSide
      : (hash2(layout.ix, layout.iz, 479) < 0.5 ? -1 : 1);

  const heightFrac = 0.2 + hash2(layout.ix, layout.iz, 487) * 0.14;
  const topFrac = 0.86 + hash2(layout.ix, layout.iz, 491) * 0.04;
  const widthFrac = 0.5 + hash2(layout.ix, layout.iz, 497) * 0.3;

  return {
    face: `${axis}${side < 0 ? '-' : '+'}`,
    placement: 'wall',
    widthFrac,
    heightFrac,
    centerFrac: topFrac - heightFrac / 2,
    tintIndex:
      Math.floor(hash2(layout.ix, layout.iz, 499) * HOLO_TINTS.length)
      % HOLO_TINTS.length,
    kind: Math.floor(hash2(layout.ix, layout.iz, 503) * 3),
    seed: hash2(layout.ix, layout.iz, 509),
    projection: 0,
    cornerSide: side,
  };
}

export function holoPose(layout, spec, height) {
  const offset = 0.02;
  const planeHeight = height * spec.heightFrac;
  const y = height * spec.centerFrac;
  const halfWidth = layout.w / 2;
  const halfDepth = layout.d / 2;

  if (spec.placement === 'corner') {
    const projection = spec.projection;
    const bite = 0.3;
    const seat = 0.02;
    const near = spec.cornerSide < 0;
    if (spec.face === 'x-') {
      return {
        x: layout.x - projection / 2 + bite,
        y,
        z: near ? layout.z + seat : layout.z + layout.d - seat,
        rotationY: near ? Math.PI : 0,
        width: projection,
        height: planeHeight,
      };
    }
    if (spec.face === 'x+') {
      return {
        x: layout.x + layout.w + projection / 2 - bite,
        y,
        z: near ? layout.z + seat : layout.z + layout.d - seat,
        rotationY: near ? Math.PI : 0,
        width: projection,
        height: planeHeight,
      };
    }
    if (spec.face === 'z-') {
      return {
        x: near ? layout.x + seat : layout.x + layout.w - seat,
        y,
        z: layout.z - projection / 2 + bite,
        rotationY: near ? -Math.PI / 2 : Math.PI / 2,
        width: projection,
        height: planeHeight,
      };
    }
    return {
      x: near ? layout.x + seat : layout.x + layout.w - seat,
      y,
      z: layout.z + layout.d + projection / 2 - bite,
      rotationY: near ? -Math.PI / 2 : Math.PI / 2,
      width: projection,
      height: planeHeight,
    };
  }

  if (spec.face === 'x-') {
    return {
      x: layout.x - offset,
      y,
      z: layout.z + halfDepth,
      rotationY: -Math.PI / 2,
      width: layout.d * spec.widthFrac,
      height: planeHeight,
    };
  }
  if (spec.face === 'x+') {
    return {
      x: layout.x + layout.w + offset,
      y,
      z: layout.z + halfDepth,
      rotationY: Math.PI / 2,
      width: layout.d * spec.widthFrac,
      height: planeHeight,
    };
  }
  if (spec.face === 'z-') {
    return {
      x: layout.x + halfWidth,
      y,
      z: layout.z - offset,
      rotationY: Math.PI,
      width: layout.w * spec.widthFrac,
      height: planeHeight,
    };
  }
  return {
    x: layout.x + halfWidth,
    y,
    z: layout.z + layout.d + offset,
    rotationY: 0,
    width: layout.w * spec.widthFrac,
    height: planeHeight,
  };
}
