import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';

const VERTEX = /* glsl */ `
  attribute float aSeed;

  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vSeed;

  void main() {
    vUv = uv;
    vTint = instanceColor;
    vSeed = aSeed;

    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vSeed;

  void main() {
    vec2 uv = vUv;
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float border = 1.0 - smoothstep(0.025, 0.04, edge);
    float inner = 1.0 - smoothstep(0.0, 0.009, abs(edge - 0.05));

    float flicker = 0.85 + 0.15 * sin(uTime * 1.5 + vSeed * 31.0);
    vec3 metal = vec3(0.008, 0.011, 0.018);
    vec3 color = metal;
    color += vTint * 0.025;
    color += vTint * border * 0.55 * flicker;
    color += vTint * inner * 1.2 * flicker;
    color += vec3(0.03, 0.07, 0.09) * step(0.91, fract(uv.y * 26.0)) * 0.08;

    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    color = mix(color, uFogColor, fog);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createHologramFrameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogDensity: { value: FOG_DENSITY },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}
