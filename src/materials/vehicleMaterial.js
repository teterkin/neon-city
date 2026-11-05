import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';

const VERTEX = /* glsl */ `
  attribute float aKind;

  varying vec3 vLocal;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vKind;

  void main() {
    vTint = instanceColor;
    vKind = aKind;
    vLocal = position;

    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uTime;

  varying vec3 vLocal;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying float vKind;

  void main() {
    vec3 tint = vTint;
    vec3 hull = vec3(0.009, 0.011, 0.02);

    float rear = smoothstep(0.18, 0.48, -vLocal.z);
    float front = smoothstep(0.3, 0.5, vLocal.z);
    float side = smoothstep(0.34, 0.5, abs(vLocal.x));
    float belly = smoothstep(0.2, 0.48, -vLocal.y);

    float pulse = 0.65 + 0.35 * sin(uTime * 4.0 + vLocal.z * 9.0);
    vec3 color = hull;
    color += tint * rear * 1.9 * pulse;
    color += tint * front * 0.55;
    color += tint * side * 0.3;
    color += tint * belly * 0.22;

    if (vKind < 0.5) {
      float ribs = step(0.72, fract(vLocal.z * 7.0)) * step(abs(vLocal.y), 0.32);
      color += tint * ribs * 0.3;
      color += vec3(0.05, 0.06, 0.09) * step(0.4, abs(vLocal.x));
    } else if (vKind < 1.5) {
      float glass = smoothstep(0.08, 0.2, vLocal.y) * (1.0 - smoothstep(0.3, 0.42, vLocal.y));
      color += vec3(0.03, 0.16, 0.24) * glass;
    } else {
      float stripe =
        smoothstep(0.4, 0.5, abs(vLocal.x))
        * (1.0 - smoothstep(0.06, 0.12, abs(vLocal.y)));
      color += tint * stripe * 0.9;

      float bar =
        smoothstep(0.38, 0.46, vLocal.y)
        * (1.0 - smoothstep(0.1, 0.16, abs(vLocal.z)))
        * (1.0 - smoothstep(0.36, 0.44, abs(vLocal.x)));
      float blink = step(0.5, fract(uTime * 2.6));
      vec3 light = mix(vec3(0.1, 0.3, 1.0), vec3(1.0, 0.05, 0.1), blink);
      color += light * bar * 3.2;
    }

    float fogFactor = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    color = mix(color, uFogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createVehicleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.FrontSide,
  });
}
