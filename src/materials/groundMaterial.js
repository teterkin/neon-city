import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';
import { PUDDLE_GLSL } from './buildingMaterial.js';

const VERTEX = /* glsl */ `
  varying vec3 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uCell;
  uniform float uAvenue;
  uniform float uTime;

  varying vec3 vWorld;

  ${PUDDLE_GLSL}

  void main() {
    vec2 p = vWorld.xz;
    float cellX = floor(p.x / uCell);
    float cellZ = floor(p.y / uCell);
    vec2 local = vec2(fract(p.x / uCell), fract(p.y / uCell));

    float edge = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
    float grid = 1.0 - smoothstep(0.0, 0.014, edge);

    float avenueX = step(mod(cellX + 0.5, uAvenue), 0.5);
    float avenueZ = step(mod(cellZ + 0.5, uAvenue), 0.5);
    float avenue = max(avenueX, avenueZ);

    float centerX = 1.0 - smoothstep(0.0, 0.018, abs(local.x - 0.5));
    float centerZ = 1.0 - smoothstep(0.0, 0.018, abs(local.y - 0.5));
    float dashZ = step(0.42, fract(p.y / 7.0));
    float dashX = step(0.42, fract(p.x / 7.0));
    float centerLine = avenueX * centerX * dashZ + avenueZ * centerZ * dashX;

    float grain = vnoise(p * 1.6) * 0.6 + vnoise(p * 7.3) * 0.4;
    float puddle = puddleMask(p);
    float ripple = 0.5 + 0.5 * sin(uTime * 0.8 + grain * 18.0);

    vec3 asphalt = vec3(0.004, 0.005, 0.009) + grain * 0.004;
    asphalt *= mix(1.0, 0.5, puddle * 0.7);

    vec3 color = asphalt;
    color += vec3(0.02, 0.25, 0.4) * grid * 0.22;
    color += vec3(0.55, 0.1, 0.4) * avenue * 0.18;
    color += vec3(0.25, 0.75, 0.95) * centerLine * 0.22;
    color += vec3(0.09, 0.03, 0.15) * puddle * (0.1 + 0.06 * ripple);

    float fogFactor = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    color = mix(color, uFogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createGround({ cell, avenueEvery }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
      uCell: { value: cell },
      uAvenue: { value: avenueEvery },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.PlaneGeometry(4000, 4000);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.06;
  mesh.renderOrder = 0;
  mesh.frustumCulled = false;
  mesh.name = 'ground';

  return {
    mesh,
    material,
    setTime(seconds) {
      material.uniforms.uTime.value = seconds;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
