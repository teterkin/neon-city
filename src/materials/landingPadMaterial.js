import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vTint = instanceColor;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vWorld;

  void main() {
    vec2 p = vUv;
    float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
    float dash = step(0.45, fract((p.x + p.y) * 22.0 - uTime * 0.6));
    float border = (1.0 - smoothstep(0.025, 0.055, edge)) * (0.55 + 0.45 * dash);

    float bars = smoothstep(0.28, 0.32, p.y) * (1.0 - smoothstep(0.68, 0.72, p.y));
    float left = 1.0 - smoothstep(0.025, 0.045, abs(p.x - 0.36));
    float right = 1.0 - smoothstep(0.025, 0.045, abs(p.x - 0.64));
    float middle =
      (1.0 - smoothstep(0.02, 0.04, abs(p.y - 0.5)))
      * smoothstep(0.34, 0.38, p.x)
      * (1.0 - smoothstep(0.62, 0.66, p.x));
    float h = (left + right) * bars + middle;

    float glow = border + h * 0.9;
    vec3 color = vTint * glow * 1.6;
    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    color = mix(color, uFogColor, fog);

    float alpha = clamp(glow, 0.0, 1.0) * 0.85 * (1.0 - fog * 0.7);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createLandingPadMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
