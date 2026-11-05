import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY } from '../config.js';

export const PUDDLE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float puddleMask(vec2 p) {
    float broad = vnoise(p * 0.035);
    float fine = vnoise(p * 0.11);
    return smoothstep(0.38, 0.62, broad * 0.72 + fine * 0.28);
  }
`;

const BUILDING_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aGlow;
  attribute float aShape;

  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vTint;
  varying float vSeed;
  varying float vGlow;
  varying float vShape;

  void main() {
    vTint = instanceColor;
    vSeed = aSeed;
    vGlow = aGlow;
    vShape = aShape;
    vLocal = position;

    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BUILDING_FRAGMENT = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uTime;
  uniform float uMirror;

  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vTint;
  varying float vSeed;
  varying float vGlow;
  varying float vShape;

  ${PUDDLE_GLSL}

  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float roof = smoothstep(0.55, 0.9, abs(n.y));

    float holeDistance = 10.0;
    if (vShape > 3.5) {
      if (vShape > 5.5) {
        vec2 q = vec2(abs(vLocal.x) - 0.24, vLocal.y - 0.52);
        holeDistance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.13;
      } else if (vShape > 4.5) {
        holeDistance = length(vLocal.xy - vec2(0.0, 0.55)) - 0.3;
      } else {
        vec2 q = vec2(vLocal.x / 0.4, (vLocal.y - 0.55) / 0.072727);
        holeDistance = (length(q) - 1.0) * 0.072727;
      }
    }
    float innerWall = 0.0;
    if (vShape > 3.5) {
      float nearHole = 1.0 - smoothstep(0.004, 0.025, abs(holeDistance));
      float notFace = 1.0 - smoothstep(0.47, 0.49, abs(vLocal.z));
      innerWall = nearHole * notFace;
    }

    float facadeU = abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x;
    float floorH = 2.5;
    float bayW = 1.6;

    float fy = floor(vWorld.y / floorH);
    float fx = floor(facadeU / bayW);

    float lit = step(0.55, hash21(vec2(fx, fy) + vSeed * 97.0));
    lit *= 0.65 + 0.35 * hash21(vec2(fy, fx) + vSeed * 31.0);
    float vy = fract(vWorld.y / floorH);
    float band = smoothstep(0.32, 0.42, vy) * (1.0 - smoothstep(0.6, 0.7, vy));
    float ux = fract(facadeU / bayW);
    float column = smoothstep(0.26, 0.34, ux) * (1.0 - smoothstep(0.66, 0.74, ux));

    float verticalStyle = step(0.82, fract(vSeed * 13.7));
    float windows = mix(lit * band * column, lit * 0.7, verticalStyle * 0.55);
    windows *= 1.0 - roof;
    windows *= 1.0 - innerWall;

    float flicker = 0.9 + 0.1 * sin(uTime * 1.7 + vSeed * 63.0);
    vec3 tint = vTint;
    vec3 emissive = tint * windows * (0.55 + vGlow * 0.9) * flicker;

    float edgeCorner = abs(n.x) > abs(n.z) ? abs(vLocal.z) : abs(vLocal.x);
    float cornerStrip =
      smoothstep(0.44, 0.5, edgeCorner) * (1.0 - roof) * (1.0 - step(0.5, vShape));
    float streetFade = exp(-vWorld.y * 0.05);
    emissive += tint * cornerStrip * (0.1 + 0.5 * streetFade);
    emissive += tint * roof * 0.025;

    float topRim =
      smoothstep(0.96, 1.0, vLocal.y) * (1.0 - roof) * step(0.5, vShape);
    float rimPulse = 0.5 + 0.5 * sin(uTime * 2.2 + vSeed * 40.0);
    emissive += tint * topRim * (0.4 + 0.6 * rimPulse) * 1.4;

    float archGlow = 0.0;
    if (vShape > 3.5) {
      float face = smoothstep(0.48, 0.5, abs(vLocal.z));
      archGlow = (1.0 - smoothstep(0.002, 0.012, abs(holeDistance))) * face;
    }
    emissive += tint * archGlow * 1.6;

    float viewDistance = distance(vWorld, cameraPosition);
    float detail = 1.0 - smoothstep(140.0, 480.0, viewDistance);
    windows *= detail;
    emissive += tint * (1.0 - detail) * (0.02 + 0.03 * vGlow);

    vec3 body = vec3(0.004, 0.0055, 0.011) * (0.75 + 0.25 * abs(n.y));
    body += tint * 0.012 * (1.0 - roof * 0.5);
    vec3 color = body + emissive;

    float alpha = 1.0;
    if (uMirror > 0.5) {
      float depthFade = clamp(1.0 + vWorld.y / 14.0, 0.0, 1.0);
      float puddle = puddleMask(vWorld.xz);
      alpha = pow(depthFade, 1.7) * puddle * 0.26;
      color *= 0.8;
    }

    float fogFactor = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uFogDensity, 2.0));
    if (uMirror > 0.5) {
      alpha *= 1.0 - fogFactor;
    } else {
      color = mix(color, uFogColor, fogFactor);
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

export function createBuildingMaterial({ mirror = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
      uTime: { value: 0 },
      uMirror: { value: mirror ? 1 : 0 },
    },
    vertexShader: BUILDING_VERTEX,
    fragmentShader: BUILDING_FRAGMENT,
    transparent: mirror,
    depthWrite: !mirror,
    depthTest: true,
    side: mirror ? THREE.DoubleSide : THREE.FrontSide,
    blending: mirror ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
