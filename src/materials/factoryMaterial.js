import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying float vLocalY;

  void main() {
    vLocalY = position.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FACTORY_FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorld;
  varying float vLocalY;

  void main() {
    float ribs = smoothstep(0.55, 1.0, fract(vLocalY * 9.0));
    vec3 color = vec3(0.011, 0.015, 0.023);
    color += vec3(0.018, 0.03, 0.042) * ribs;
    color += vec3(0.02, 0.038, 0.05) * smoothstep(0.88, 1.0, vLocalY);

    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
  }
`;

const CHIMNEY_FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorld;
  varying float vLocalY;

  void main() {
    vec3 color = vec3(0.012, 0.016, 0.024);
    color += vec3(0.02, 0.032, 0.045) * smoothstep(0.7, 1.0, vLocalY) * 0.5;
    float band = smoothstep(0.8, 0.85, vLocalY) * (1.0 - smoothstep(0.88, 0.93, vLocalY));
    color += vec3(0.9, 0.07, 0.12) * band;

    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
  }
`;

const FENCE_FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorld;
  varying float vLocalY;

  void main() {
    float h = vWorld.x + vWorld.z;
    float a = fract((h + vWorld.y) * 2.6);
    float b = fract((h - vWorld.y) * 2.6);
    float lineA = 1.0 - smoothstep(0.0, 0.16, min(a, 1.0 - a));
    float lineB = 1.0 - smoothstep(0.0, 0.16, min(b, 1.0 - b));
    float net = max(lineA, lineB);
    float topRail = smoothstep(0.86, 0.94, vLocalY);

    vec3 color = vec3(0.02, 0.05, 0.06);
    color += vec3(0.06, 0.3, 0.34) * net;
    color += vec3(0.04, 0.26, 0.3) * topRail;

    float fog = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    color = mix(color, uFogColor, fog);

    float alpha = 0.08 + net * 0.42 + topRail * 0.32;
    alpha *= 1.0 - fog * 0.75;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createMaterial(fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: VERTEX,
    fragmentShader,
  });
}

export function createFactoryMaterial() {
  return createMaterial(FACTORY_FRAGMENT);
}

export function createChimneyMaterial() {
  return createMaterial(CHIMNEY_FRAGMENT);
}

export function createFenceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: VERTEX,
    fragmentShader: FENCE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
