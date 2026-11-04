import * as THREE from 'three';
import { FOG_COLOR } from '../config.js';

const VERTEX = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;

  varying vec3 vDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);

    vec3 color = uFogColor;
    color = mix(color, vec3(0.012, 0.004, 0.026), smoothstep(0.02, 0.3, h));
    color = mix(color, vec3(0.002, 0.002, 0.006), smoothstep(0.3, 0.8, h));
    color += vec3(0.16, 0.02, 0.19) * exp(-h * 16.0) * smoothstep(0.0, 0.03, h) * 0.8;

    vec2 starUV = dir.xz / max(dir.y + 0.7, 0.25) * 210.0;
    float star = step(0.9968, hash21(floor(starUV)));
    color += vec3(0.7, 0.85, 1.0) * star * smoothstep(0.05, 0.45, h) * 0.55;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSky() {
  const geometry = new THREE.SphereGeometry(1200, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = 'sky';

  return {
    mesh,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
