import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';

const SMOKE_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;

  varying float vLife;
  varying vec3 vWorld;

  void main() {
    float life = fract(uTime * 0.085 + aSeed);
    vec3 p = position;
    p.y += life * 22.0;
    p.x += sin(life * 6.283 + aSeed * 37.0) * (0.6 + life * 2.6) + life * 2.4;
    p.z += cos(life * 5.1 + aSeed * 23.0) * (0.5 + life * 2.0) + life * 1.2;

    vLife = life;
    vWorld = p;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = mix(3.0, 10.0, life) * (120.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const SMOKE_FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying float vLife;
  varying vec3 vWorld;

  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.08, radius);
    float alpha = soft * sin(vLife * 3.1416) * 0.26;
    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    alpha *= 1.0 - fog;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(mix(vec3(0.34, 0.36, 0.46), uFogColor, fog), alpha);
  }
`;

const FIRE_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;

  varying float vLife;
  varying vec3 vWorld;

  void main() {
    float life = fract(uTime * 0.5 + aSeed);
    vec3 p = position;
    p.y += life * (2.4 + aSeed * 3.2);
    p.x += sin(life * 6.283 + aSeed * 29.0) * life * 0.9;
    p.z += cos(life * 4.7 + aSeed * 17.0) * life * 0.7;

    vLife = life;
    vWorld = p;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = mix(7.0, 1.5, life) * (150.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const FIRE_FRAGMENT = /* glsl */ `
  uniform float uFogDensity;

  varying float vLife;
  varying vec3 vWorld;

  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.05, radius);
    float alpha = soft * (1.0 - vLife) * 0.85;
    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    alpha *= 1.0 - fog;
    if (alpha < 0.002) discard;
    vec3 color = mix(vec3(1.0, 0.86, 0.38), vec3(1.0, 0.16, 0.02), vLife);
    gl_FragColor = vec4(color, alpha);
  }
`;

const BEACON_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;

  varying float vPulse;
  varying vec3 vWorld;

  void main() {
    float wave = 0.5 + 0.5 * sin(uTime * (2.4 + aSeed * 1.6) + aSeed * 43.0);
    vPulse = pow(wave, 8.0);
    vWorld = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (1.8 + vPulse * 2.4) * (150.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const BEACON_FRAGMENT = /* glsl */ `
  uniform float uFogDensity;

  varying float vPulse;
  varying vec3 vWorld;

  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.05, radius);
    float alpha = soft * (0.12 + vPulse * 0.88);
    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    alpha *= 1.0 - fog;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(vec3(1.0, 0.12, 0.2), alpha);
  }
`;

function createPointsMaterial(vertexShader, fragmentShader, blending = THREE.NormalBlending) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending,
  });
}

export function createSmokeMaterial() {
  return createPointsMaterial(SMOKE_VERTEX, SMOKE_FRAGMENT);
}

export function createFireMaterial() {
  return createPointsMaterial(FIRE_VERTEX, FIRE_FRAGMENT, THREE.AdditiveBlending);
}

export function createBeaconMaterial() {
  return createPointsMaterial(BEACON_VERTEX, BEACON_FRAGMENT, THREE.AdditiveBlending);
}
