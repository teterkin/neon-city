import { hash2 } from './noise.js';
import { cellLayout } from './layout.js';
import { nearestAvenueFace } from './holograms.js';

export const DOCK_MIN_HEIGHT = 80;

const DOCK_SPACING = 2;
const DOCK_RANK = 631;

function isDockTower(layout) {
  return Boolean(layout) && layout.type === 'tower' && layout.h >= DOCK_MIN_HEIGHT;
}

export function skyDockFor(layout) {
  if (!isDockTower(layout)) return null;

  const rank = hash2(layout.ix, layout.iz, DOCK_RANK);
  for (let dx = -DOCK_SPACING; dx <= DOCK_SPACING; dx += 1) {
    for (let dz = -DOCK_SPACING; dz <= DOCK_SPACING; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      const other = cellLayout(layout.ix + dx, layout.iz + dz);
      if (!isDockTower(other)) continue;
      if (hash2(other.ix, other.iz, DOCK_RANK) > rank) return null;
    }
  }

  const kind = hash2(layout.ix, layout.iz, 607) < 0.5 ? 'roof' : 'wall';
  const radius =
    kind === 'roof'
      ? Math.max(layout.w, layout.d) / 2 + 1.4 + hash2(layout.ix, layout.iz, 611) * 1.1
      : 3.6 + hash2(layout.ix, layout.iz, 611) * 1.6;

  return {
    kind,
    radius,
    thickness: 0.5 + hash2(layout.ix, layout.iz, 617) * 0.3,
    face: kind === 'wall' ? nearestAvenueFace(layout) : null,
    heightFrac: kind === 'wall' ? 0.5 + hash2(layout.ix, layout.iz, 619) * 0.2 : 1,
    ships:
      hash2(layout.ix, layout.iz, 623) >= 0.15
        ? 2 + Math.floor(hash2(layout.ix, layout.iz, 633) * 3)
        : 0,
    shipOffset: hash2(layout.ix, layout.iz, 629) * Math.PI * 2,
    tintIndex: layout.colorIndex,
  };
}

export function skyDockPose(layout, spec, height) {
  const centerX = layout.x + layout.w / 2;
  const centerZ = layout.z + layout.d / 2;

  if (spec.kind === 'roof') {
    return { x: centerX, y: height, z: centerZ };
  }

  const y = height * spec.heightFrac;
  const offset = spec.radius * 0.55;
  if (spec.face === 'x-') return { x: layout.x - offset, y, z: centerZ };
  if (spec.face === 'x+') return { x: layout.x + layout.w + offset, y, z: centerZ };
  if (spec.face === 'z-') return { x: centerX, y, z: layout.z - offset };
  return { x: centerX, y, z: layout.z + layout.d + offset };
}

export function skyDockShipPose(layout, spec, height, index) {
  const dock = skyDockPose(layout, spec, height);
  const count = Math.max(1, spec.ships);
  const angle = spec.shipOffset + (index / count) * Math.PI * 2;
  const distance = spec.radius * 0.48;

  return {
    x: dock.x + Math.cos(angle) * distance,
    y: dock.y + spec.thickness,
    z: dock.z + Math.sin(angle) * distance,
    heading: angle + Math.PI / 2,
  };
}
