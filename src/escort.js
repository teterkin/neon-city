import * as THREE from 'three';
import { escortPose, escortSway } from './trafficModel.js';
import { wrapAngle } from './streetNav.js';

const PLUME_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uThrottle;

  varying float vLife;
  varying float vPulse;
  varying float vImpulse;

  void main() {
    float rate = mix(1.15, 3.2, uThrottle);
    float life = fract(uTime * rate + aSeed);
    vec3 p = position;
    p.z -= life * mix(1.568, 2.576, uThrottle);

    float pulseRate = mix(4.8, 14.0, uThrottle);
    float impulse = pow(0.5 + 0.5 * sin(uTime * pulseRate), 4.0);

    vLife = life;
    vPulse = 0.6 + 0.4 * impulse;
    vImpulse = impulse;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize =
      mix(6.0, 3.0, life)
      * mix(1.0, 0.85, uThrottle)
      * (0.85 + 0.3 * impulse)
      * (100.0 / max(2.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const PLUME_FRAGMENT = /* glsl */ `
  uniform float uThrottle;

  varying float vLife;
  varying float vPulse;
  varying float vImpulse;

  void main() {
    float radius = length(gl_PointCoord - 0.5);
    float alpha =
      smoothstep(0.5, 0.3, radius) * pow(1.0 - vLife, 2.4) * (0.55 + 0.45 * vPulse);
    if (alpha < 0.01) discard;
    vec3 cool = mix(vec3(1.0, 0.35, 0.12), vec3(0.85, 0.02, 0.02), vLife);
    vec3 hot = mix(vec3(1.0, 0.92, 0.7), vec3(1.0, 0.72, 0.5), vLife);
    vec3 color = mix(cool, hot, uThrottle);
    float white = (0.08 + 0.4 * uThrottle) * (0.5 + 0.5 * vImpulse);
    color += vec3(1.0) * white;
    gl_FragColor = vec4(color, alpha * 0.32 * (0.9 + 0.15 * uThrottle));
  }
`;

function part(geometry, color, options = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    blending: options.blending ?? THREE.NormalBlending,
    depthWrite: options.depthWrite ?? true,
    toneMapped: options.toneMapped ?? true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  if (options.rotationX) mesh.rotation.x = options.rotationX;
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;
  return mesh;
}

export class Escort {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'escort';

    this.group.add(part(new THREE.BoxGeometry(1.9, 0.42, 3.2), 0x080b12, { y: 0.12 }));
    this.group.add(
      part(new THREE.BoxGeometry(1.75, 0.2, 1.0), 0x0d2431, { y: 0.34, z: -1.15 }),
    );
    this.group.add(part(new THREE.BoxGeometry(1.5, 0.3, 1.0), 0x080b12, { y: 0.1, z: 1.85 }));
    this.group.add(
      part(new THREE.BoxGeometry(1.4, 0.12, 0.5), 0x0d2431, {
        y: 0.32,
        z: 2.2,
        rotationX: -0.35,
      }),
    );
    this.group.add(part(new THREE.BoxGeometry(1.2, 0.1, 0.9), 0x0d2431, { y: 0.3, z: 1.35 }));

    for (const side of [-1, 1]) {
      this.group.add(
        part(new THREE.BoxGeometry(0.36, 0.3, 2.4), 0x0a1019, { x: side * 1.05, y: 0.02, z: -0.35 }),
      );
      this.group.add(
        part(new THREE.BoxGeometry(0.05, 0.06, 2.1), 0xff35b0, {
          x: side * 1.24,
          y: 0.12,
          z: -0.3,
          toneMapped: false,
        }),
      );
    }

    this.group.add(
      part(new THREE.BoxGeometry(1.35, 0.08, 1.5), 0x05070b, { y: 0.38, z: 0.2 }),
    );

    for (const side of [-1, 1]) {
      this.group.add(
        part(new THREE.BoxGeometry(0.5, 0.35, 0.55), 0x111a24, {
          x: side * 0.45,
          y: 0.42,
          z: 0.05,
        }),
      );
      this.group.add(
        part(new THREE.BoxGeometry(0.5, 0.5, 0.12), 0x0d1a24, {
          x: side * 0.45,
          y: 0.55,
          z: -0.22,
        }),
      );
      this.group.add(
        part(new THREE.BoxGeometry(0.34, 0.4, 0.3), 0x05070b, {
          x: side * 0.45,
          y: 0.62,
          z: 0.02,
        }),
      );
      this.group.add(
        part(new THREE.SphereGeometry(0.16, 10, 8), 0x0a0f16, {
          x: side * 0.45,
          y: 0.92,
          z: 0.02,
        }),
      );
      this.group.add(
        part(new THREE.BoxGeometry(0.04, 0.04, 1.2), 0x36e5ff, {
          x: side * 0.72,
          y: 0.45,
          z: 0.2,
          toneMapped: false,
        }),
      );
    }

    this.group.add(
      part(new THREE.PlaneGeometry(1.25, 0.5), 0x36e5ff, {
        y: 0.72,
        z: 0.78,
        rotationX: -0.45,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.group.add(part(new THREE.BoxGeometry(0.95, 0.06, 0.06), 0xffffff, {
      y: 0.13,
      z: 2.38,
      toneMapped: false,
    }));

    for (const side of [-1, 1]) {
      this.group.add(
        part(new THREE.BoxGeometry(0.22, 0.12, 0.08), 0xffffff, {
          x: side * 0.52,
          y: 0.18,
          z: 2.36,
          toneMapped: false,
        }),
      );
      this.group.add(
        part(new THREE.BoxGeometry(1.1, 0.31, 0.75), 0x1a0a10, {
          x: side * 0.72,
          y: 0.14,
          z: -1.72,
        }),
      );
      this.group.add(
        part(new THREE.BoxGeometry(1.0, 0.28, 0.06), 0xff2a3a, {
          x: side * 0.72,
          y: 0.14,
          z: -2.11,
          toneMapped: false,
        }),
      );
      this.group.add(
        part(new THREE.BoxGeometry(0.84, 0.18, 0.08), 0xff3a2a, {
          x: side * 0.72,
          y: 0.14,
          z: -2.13,
          toneMapped: false,
        }),
      );
    }

    this.plumeGeometry = new THREE.BufferGeometry();
    const particlesPerStream = 16;
    const streamOffsets = [-0.315, -0.105, 0.105, 0.315];
    const plumePerNozzle = streamOffsets.length * particlesPerStream;
    const plumeCount = plumePerNozzle * 2;
    const positions = new Float32Array(plumeCount * 3);
    const seeds = new Float32Array(plumeCount);
    for (let index = 0; index < plumeCount; index += 1) {
      const nozzle = index < plumePerNozzle ? -0.72 : 0.72;
      const local = index % plumePerNozzle;
      const stream = Math.floor(local / particlesPerStream);
      const step = local % particlesPerStream;
      positions[index * 3] = nozzle + streamOffsets[stream];
      positions[index * 3 + 1] = 0.14;
      positions[index * 3 + 2] = -2.3;
      seeds[index] = (step / particlesPerStream + (nozzle > 0 ? 0.37 : 0)) % 1;
    }
    this.plumeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.plumeGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.plumeMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uThrottle: { value: 0 } },
      vertexShader: PLUME_VERTEX,
      fragmentShader: PLUME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.plumes = new THREE.Points(this.plumeGeometry, this.plumeMaterial);
    this.plumes.frustumCulled = false;
    this.group.add(this.plumes);

    this.shadowGeometry = new THREE.PlaneGeometry(1, 1);
    this.shadowGeometry.rotateX(-Math.PI / 2);
    this.shadowMaterial = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.15, d) * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    this.shadow.name = 'escort-shadow';
    this.shadow.position.y = 0.04;
    this.shadow.renderOrder = 1;
    this.shadow.frustumCulled = false;
    this.shadow.visible = false;

    this.position = new THREE.Vector3();
    this.initialized = false;
    this.prevHeading = 0;
    this.bank = 0;
    this.group.scale.setScalar(0.85);
  }

  setThrottle(value) {
    this.plumeMaterial.uniforms.uThrottle.value = Math.min(1, Math.max(0, value));
  }

  update(dt, cameraPosition, heading, time, drop = 3.2, ahead = 20) {
    const target = escortPose(cameraPosition, heading, ahead, drop);
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    const sway = escortSway(time);
    target.x += rightX * sway.lateral;
    target.z += rightZ * sway.lateral;
    target.y += sway.vertical;

    if (!this.initialized) {
      this.position.set(target.x, target.y, target.z);
      this.initialized = true;
    }

    const lambda = 12;
    const blend = 1 - Math.exp(-lambda * dt);
    this.position.x += (target.x - this.position.x) * blend;
    this.position.y += (target.y - this.position.y) * blend;
    this.position.z += (target.z - this.position.z) * blend;

    const delta = wrapAngle(heading - this.prevHeading);
    this.prevHeading = heading;
    const targetBank = THREE.MathUtils.clamp(-delta * 6, -0.5, 0.5);
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-5 * dt));

    this.group.position.copy(this.position);
    this.group.rotation.set(sway.pitch, heading, this.bank, 'YXZ');
    this.plumeMaterial.uniforms.uTime.value = time;

    const altitude = Math.max(0, this.position.y);
    const shadowOpacity = Math.max(0, 1 - altitude / 22) * 0.5;
    this.shadow.visible = shadowOpacity > 0.01;
    if (this.shadow.visible) {
      this.shadow.position.set(this.position.x, 0.04, this.position.z);
      this.shadow.scale.setScalar(3.2 + altitude * 0.05);
      this.shadowMaterial.uniforms.uOpacity.value = shadowOpacity;
    }
  }

  dispose() {
    this.group.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      child.material.dispose();
    });
    this.plumeGeometry.dispose();
    this.plumeMaterial.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
  }
}
