import {
  AVENUE_EVERY,
  CELL,
  MAX_HEIGHT,
  MIN_HEIGHT,
  PALETTE,
  SEED,
} from './config.js';
import { createNoise2D, fbm2, hash2 } from './noise.js';

const districtNoise = createNoise2D(SEED);
const FACTORY_CHANCE = 0.05;
const FACTORY_SALT = 241;
const NEIGHBOURS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function factoryCandidate(ix, iz) {
  return !isAvenue(ix, iz) && hash2(ix, iz, FACTORY_SALT) < FACTORY_CHANCE;
}

function isFactory(ix, iz) {
  if (!factoryCandidate(ix, iz)) return false;
  const own = hash2(ix, iz, FACTORY_SALT);
  return NEIGHBOURS.every(([dx, dz]) => {
    if (!factoryCandidate(ix + dx, iz + dz)) return true;
    return hash2(ix + dx, iz + dz, FACTORY_SALT) > own;
  });
}

function nextToFactory(ix, iz) {
  return NEIGHBOURS.some(([dx, dz]) => isFactory(ix + dx, iz + dz));
}

export function modulo(value, base) {
  return ((value % base) + base) % base;
}

export function isAvenue(ix, iz) {
  return modulo(ix, AVENUE_EVERY) === 0 || modulo(iz, AVENUE_EVERY) === 0;
}

export function cellOf(worldX, worldZ) {
  return { ix: Math.floor(worldX / CELL), iz: Math.floor(worldZ / CELL) };
}

export function cellLayout(ix, iz) {
  if (isAvenue(ix, iz)) return null;
  const factory = isFactory(ix, iz);
  if (!factory && nextToFactory(ix, iz)) return null;

  const district = fbm2(districtNoise, ix * 0.045, iz * 0.045, 4);
  const density = (district + 1) / 2;
  const towers = Math.pow(density, 2.8);
  const jitter = hash2(ix, iz, 17);
  const type = factory ? 'factory' : 'tower';
  const height =
    type === 'factory'
      ? MIN_HEIGHT + hash2(ix, iz, 311) * 7
      : MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * (towers * 0.9 + jitter * 0.1);

  const widthFrac = type === 'factory'
    ? 0.76 + hash2(ix, iz, 31) * 0.08
    : 0.46 + hash2(ix, iz, 31) * 0.24;
  const depthFrac = type === 'factory'
    ? 0.76 + hash2(ix, iz, 73) * 0.08
    : 0.46 + hash2(ix, iz, 73) * 0.24;
  const width = CELL * widthFrac;
  const depth = CELL * depthFrac;

  const colorIndex = Math.floor(hash2(ix, iz, 131) * PALETTE.length) % PALETTE.length;
  const glow = PALETTE[colorIndex].glow * (0.75 + hash2(ix, iz, 197) * 0.55);

  return {
    ix,
    iz,
    type,
    x: ix * CELL + (CELL - width) / 2,
    z: iz * CELL + (CELL - depth) / 2,
    w: width,
    d: depth,
    h: height,
    colorIndex,
    glow,
    seed: hash2(ix, iz, 211),
  };
}

export function ringCells(centerIx, centerIz, cols, rows) {
  const halfCols = Math.floor(cols / 2);
  const halfRows = Math.floor(rows / 2);
  const cells = new Array(cols * rows);
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const iz = centerIz + row - halfRows;
    for (let col = 0; col < cols; col += 1) {
      cells[index] = { ix: centerIx + col - halfCols, iz };
      index += 1;
    }
  }
  return cells;
}

export function avenueCenterX(worldX) {
  const avenueIndex = Math.round((worldX / CELL - 0.5) / AVENUE_EVERY);
  return (avenueIndex * AVENUE_EVERY + 0.5) * CELL;
}
