import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';
import { createGlyphAtlas } from './glyphAtlas.js';

const VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aKind;
  attribute float aAspect;

  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vSeed;
  varying float vKind;
  varying float vAspect;

  void main() {
    vUv = uv;
    vTint = instanceColor;
    vSeed = aSeed;
    vKind = aKind;
    vAspect = aAspect;

    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFogDensity;
  uniform sampler2D uGlyphs;

  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vSeed;
  varying float vKind;
  varying float vAspect;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float glyphLayer(vec2 uv, float t, float seed, float baseRows) {
    float aspect = max(0.08, vAspect);
    float cols;
    float rows;
    if (aspect >= 0.7) {
      rows = baseRows;
      cols = clamp(floor(rows * aspect + 0.5), 2.0, 32.0);
    } else {
      cols = 1.0;
      rows = clamp(floor(1.0 / aspect + 0.5), 2.0, 26.0);
    }

    vec2 grid = vec2(uv.x * cols, uv.y * rows);
    grid.y += t * (0.35 + seed * 0.25);
    if (cols > 1.5) grid.x += sin(t * 0.6 + seed * 17.0) * 0.45;

    vec2 cell = floor(grid);
    vec2 local = fract(grid);
    float index = floor(hash21(cell + seed * 57.0) * 64.0);
    vec2 atlasCell = vec2(mod(index, 8.0), floor(index / 8.0));
    vec2 atlasUv = (atlasCell + local * 0.9 + 0.05) / 8.0;

    float glyph = texture2D(uGlyphs, atlasUv).a;
    float pulse = 0.5 + 0.5 * sin(cell.y * 1.7 + t * 2.0 + seed * 23.0);
    return glyph * (0.55 + 0.45 * pulse);
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.8 + vSeed * 41.0;

    float row = floor(uv.y * 30.0);
    float stamp = floor(t * 5.0);
    float glitch = step(0.965, hash21(vec2(row, stamp)));
    uv.x += (hash21(vec2(row * 2.3, stamp + 1.0)) - 0.5) * 0.08 * glitch;

    float scan = 0.5 + 0.5 * sin(uv.y * 260.0 - t * 7.0);
    float wave = 0.5 + 0.5 * sin(uv.y * 24.0 + uv.x * 8.0 + t * 2.0);
    float band = 1.0 - smoothstep(0.0, 0.12, abs(fract(uv.y - t * 0.06) - 0.5));
    float gridX = 1.0 - smoothstep(0.0, 0.03, abs(fract(uv.x * 10.0) - 0.5));
    float gridY = 1.0 - smoothstep(0.0, 0.025, abs(fract(uv.y * 14.0) - 0.5));
    float grid = max(gridX, gridY);
    float bars = 1.0 - smoothstep(0.0, 0.08, abs(fract(uv.x * 5.0 + t * 0.12) - 0.5));

    float glyphs = glyphLayer(uv, t, vSeed, 6.0);
    float headline =
      vAspect >= 0.7
        ? glyphLayer(uv, t * 0.6, vSeed + 9.0, 3.0) *
          smoothstep(0.18, 0.08, abs(uv.y - 0.62))
        : 0.0;

    float header = smoothstep(0.055, 0.0, abs(uv.y - 0.88));
    float footer = smoothstep(0.045, 0.0, abs(uv.y - 0.1));
    vec2 logoUv = uv - vec2(0.18, 0.78);
    float logoRadius = length(logoUv);
    float logoRing = 1.0 - smoothstep(0.055, 0.068, abs(logoRadius - 0.07));
    float logoBar =
      (1.0 - smoothstep(0.0, 0.012, abs(logoUv.x))) *
      (1.0 - smoothstep(0.045, 0.055, abs(logoUv.y)));
    float emblem = max(logoRing, logoBar);

    float pattern;
    if (vKind < 0.5) {
      pattern = glyphs * 1.15 + scan * 0.08 + band * 0.35;
    } else if (vKind < 1.5) {
      pattern = glyphs * 0.85 + grid * 0.25 + wave * 0.12;
    } else {
      pattern = glyphs * 1.0 + bars * 0.25 + band * 0.25;
    }
    pattern += headline * 1.0 + header * 0.25 + footer * 0.12;
    pattern *= 0.8 + 0.2 * sin(t * 4.0 + vSeed * 23.0);

    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float border = 1.0 - smoothstep(0.0, 0.022, edge);
    float fade = smoothstep(0.0, 0.05, edge);

    vec3 color = vTint * (0.5 + pattern * 1.8);
    color += vec3(0.55, 0.95, 1.0) * border * 1.0;
    color += vec3(0.5, 0.95, 1.0) * (glyphs * 0.7 + headline * 1.1);
    color += vTint * (header * 0.9 + footer * 0.45 + emblem * 1.2);
    color += vTint * band * 0.9;

    float alpha =
      (0.04 + glyphs * 0.3 + pattern * 0.2 + border * 0.3 + band * 0.15) * fade;
    alpha += (header * 0.22 + footer * 0.12 + emblem * 0.3) * fade;
    alpha *= 0.82 + 0.18 * sin(t * 11.0 + vSeed * 19.0);

    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    alpha *= 1.0 - fog;
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

export function createHologramMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogDensity: { value: FOG_DENSITY },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uGlyphs: { value: createGlyphAtlas() },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

