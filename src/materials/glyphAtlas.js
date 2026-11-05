import * as THREE from 'three';
import { mulberry32 } from '../noise.js';

export function createGlyphAtlas({ size = 512, cells = 8 } = {}) {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  context.strokeStyle = '#ffffff';
  context.fillStyle = '#ffffff';
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const cellSize = size / cells;
  const lineWidth = Math.max(2, cellSize * 0.065);

  for (let index = 0; index < cells * cells; index += 1) {
    const rng = mulberry32(1777 + index * 7919);
    const originX = (index % cells) * cellSize;
    const originY = Math.floor(index / cells) * cellSize;
    const padding = cellSize * 0.16;
    const inner = cellSize - padding * 2;
    const left = originX + padding;
    const top = originY + padding;

    context.save();
    context.lineWidth = lineWidth;

    const bars = 2 + Math.floor(rng() * 2);
    for (let bar = 0; bar < bars; bar += 1) {
      const x = left + rng() * inner;
      const y0 = top + rng() * inner * 0.28;
      const y1 = top + inner - rng() * inner * 0.28;
      context.beginPath();
      context.moveTo(x, y0);
      context.lineTo(x, y1);
      context.stroke();
    }

    const rails = 1 + Math.floor(rng() * 2);
    for (let rail = 0; rail < rails; rail += 1) {
      const y = top + rng() * inner;
      const x0 = left + rng() * inner * 0.3;
      const x1 = left + inner - rng() * inner * 0.3;
      context.beginPath();
      context.moveTo(x0, y);
      context.lineTo(x1, y);
      context.stroke();
    }

    if (rng() < 0.72) {
      const cx = left + rng() * inner;
      const cy = top + rng() * inner;
      const radius = cellSize * (0.08 + rng() * 0.1);
      const start = rng() * Math.PI * 2;
      const end = start + (0.6 + rng() * 1.6) * Math.PI;
      context.beginPath();
      context.arc(cx, cy, radius, start, end);
      context.stroke();
    }

    if (rng() < 0.5) {
      const x0 = left + rng() * inner * 0.4;
      const y0 = top + rng() * inner * 0.4;
      const x1 = left + inner * (0.6 + rng() * 0.4);
      const y1 = top + inner * (0.6 + rng() * 0.4);
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.stroke();
    }

    if (rng() < 0.55) {
      const cx = left + rng() * inner;
      const cy = top + rng() * inner;
      context.beginPath();
      context.arc(cx, cy, lineWidth * 0.9, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
