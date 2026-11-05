import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vTint = instanceColor;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);

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
  varying vec3 vNormal;

  void main() {
    float cap = smoothstep(0.55, 0.75, abs(vNormal.y));
    vec2 p = vUv - 0.5;
    float radius = length(p) * 2.0;

    float ringInner = 1.0 - smoothstep(0.015, 0.045, abs(radius - 0.55));
    float ringOuter = 1.0 - smoothstep(0.012, 0.036, abs(radius - 0.78));
    float ringEdge = 1.0 - smoothstep(0.01, 0.03, abs(radius - 0.95));
    float center = 1.0 - smoothstep(0.0, 0.06, radius);

    float dashes = 1.0 - smoothstep(0.2, 0.45, fract(atan(p.y, p.x) * 6.0 + uTime * 0.12));
    float glow = (ringInner + ringOuter * (0.55 + 0.45 * dashes) + ringEdge * 0.8 + center * 0.6) * cap;

    float pulse = 0.85 + 0.15 * sin(uTime * 1.6);
    vec3 color = vec3(0.012, 0.016, 0.024);
    color += vTint * glow * 1.6 * pulse;
    color += vTint * (1.0 - cap) * smoothstep(0.9, 1.0, vUv.y) * 0.35;

    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
  }
`;

export function createDockMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}
