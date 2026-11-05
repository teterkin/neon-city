import { CELL } from './config.js';
import { hash2 } from './noise.js';
import { cellLayout, isAvenue } from './layout.js';
import { TRAFFIC_TYPES } from './trafficModel.js';

const NEIGHBOURS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const LONG_MIN = 9;
const LONG_SPAN = 2;
const SHORT_MIN = 6;
const SHORT_SPAN = 1.5;

export function landingPadsFor(layout) {
  if (!layout || layout.type !== 'factory') return [];

  const cells = [];
  for (const [dx, dz] of NEIGHBOURS) {
    const ix = layout.ix + dx;
    const iz = layout.iz + dz;
    if (isAvenue(ix, iz)) continue;
    if (cellLayout(ix, iz) !== null) continue;
    cells.push({ ix, iz, dx, dz });
  }
  if (cells.length === 0) return [];

  const start = Math.floor(hash2(layout.ix, layout.iz, 641) * cells.length);
  const count = Math.min(2, cells.length);
  const pads = [];
  for (let index = 0; index < count; index += 1) {
    const cell = cells[(start + index) % cells.length];
    pads.push(makePad(layout, cell, index));
  }
  return pads;
}

function makePad(layout, cell, index) {
  const longAxis = cell.dz !== 0 ? 'x' : 'z';
  const long = LONG_MIN + hash2(layout.ix, layout.iz, 643 + index) * LONG_SPAN;
  const short = SHORT_MIN + hash2(layout.ix, layout.iz, 647 + index) * SHORT_SPAN;
  const width = longAxis === 'x' ? long : short;
  const depth = longAxis === 'x' ? short : long;
  const x = (cell.ix + 0.5) * CELL;
  const z = (cell.iz + 0.5) * CELL;

  const shipCount = 1 + (hash2(layout.ix, layout.iz, 653 + index) < 0.55 ? 1 : 0);
  const ships = [];
  for (let shipIndex = 0; shipIndex < shipCount; shipIndex += 1) {
    const type =
      hash2(layout.ix, layout.iz, 659 + index * 3 + shipIndex) < 0.2
        ? 'passenger'
        : 'cargo';
    const across = shipCount === 1 ? 0 : (shipIndex === 0 ? -1 : 1) * short * 0.2;
    ships.push({
      type,
      x: longAxis === 'x' ? x : x + across,
      z: longAxis === 'x' ? z + across : z,
      heading: longAxis === 'x' ? Math.PI / 2 : 0,
    });
  }

  return {
    cellIx: cell.ix,
    cellIz: cell.iz,
    x,
    z,
    width,
    depth,
    longAxis,
    ships,
  };
}
