const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD_X = [1, -1, 1, -1, 1, -1, 0, 0, 1, -1, 0, 0];
const GRAD_Y = [1, 1, -1, -1, 0, 0, 1, -1, 0, 0, 1, -1];

export function mulberry32(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPermutation(seed) {
  const random = mulberry32(seed);
  const source = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) source[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = source[i];
    source[i] = source[j];
    source[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) perm[i] = source[i & 255];
  return perm;
}

export function createNoise2D(seed = 1337) {
  const perm = buildPermutation(seed);

  return function noise2D(x, y) {
    const skew = (x + y) * F2;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const unskew = (i + j) * G2;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let t = 0.5 - x0 * x0 - y0 * y0;
    if (t > 0) {
      const g = perm[ii + perm[jj]] % 12;
      t *= t;
      n += t * t * (GRAD_X[g] * x0 + GRAD_Y[g] * y0);
    }
    t = 0.5 - x1 * x1 - y1 * y1;
    if (t > 0) {
      const g = perm[ii + i1 + perm[jj + j1]] % 12;
      t *= t;
      n += t * t * (GRAD_X[g] * x1 + GRAD_Y[g] * y1);
    }
    t = 0.5 - x2 * x2 - y2 * y2;
    if (t > 0) {
      const g = perm[ii + 1 + perm[jj + 1]] % 12;
      t *= t;
      n += t * t * (GRAD_X[g] * x2 + GRAD_Y[g] * y2);
    }

    return Math.max(-1, Math.min(1, 70 * n));
  };
}

export function fbm2(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * noise(x * frequency, y * frequency);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393);
  h = Math.imul(h ^ Math.imul(y | 0, 668265263), 1274126177);
  h = Math.imul(h ^ (seed | 0), 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
