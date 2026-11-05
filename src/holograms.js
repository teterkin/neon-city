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
  if (probability !== null && probability <= 0) return null;
  const chance = probability ?? (layout.h >= 60 ? 0.34 : 0.16);
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
