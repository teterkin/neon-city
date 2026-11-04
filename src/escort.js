import * as THREE from 'three';
import { escortPose } from './trafficModel.js';
import { wrapAngle } from './streetNav.js';

function part(geometry, color, options = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    blending: options.blending ?? THREE.NormalBlending,
    depthWrite: options.depthWrite ?? true,
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

    this.group.add(part(new THREE.BoxGeometry(1.7, 0.42, 3.6), 0x080b12));
    this.group.add(
      part(new THREE.BoxGeometry(0.9, 0.28, 1.0), 0x0d2431, { y: 0.02, z: 1.9 }),
    );
    this.group.add(
      part(new THREE.BoxGeometry(0.78, 0.3, 1.1), 0x17475c, { y: 0.28, z: 0.55 }),
    );
    this.group.add(
      part(new THREE.BoxGeometry(0.34, 0.24, 2.1), 0x0a1019, { x: 1.0, z: -0.25 }),
    );
    this.group.add(
      part(new THREE.BoxGeometry(0.34, 0.24, 2.1), 0x0a1019, { x: -1.0, z: -0.25 }),
    );
    this.group.add(
      part(new THREE.BoxGeometry(0.06, 0.07, 1.9), 0xff35b0, { x: 1.22, z: -0.3 }),
    );
    this.group.add(
      part(new THREE.BoxGeometry(0.06, 0.07, 1.9), 0xff35b0, { x: -1.22, z: -0.3 }),
    );

    this.engine = part(new THREE.PlaneGeometry(1.55, 0.58), 0x8dfbff, {
      z: -1.78,
      rotationY: Math.PI,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(this.engine);

    this.group.add(
      part(new THREE.PlaneGeometry(2.4, 1.1), 0x36e5ff, {
        z: -1.86,
        rotationY: Math.PI,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.group.add(
      part(new THREE.PlaneGeometry(0.34, 0.34), 0xff8de0, {
        x: 1.22,
        y: 0.02,
        z: -1.2,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.group.add(
      part(new THREE.PlaneGeometry(0.34, 0.34), 0xff8de0, {
        x: -1.22,
        y: 0.02,
        z: -1.2,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.group.add(
      part(new THREE.PlaneGeometry(2.5, 3.7), 0xff35b0, {
        y: -0.26,
        rotationX: -Math.PI / 2,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.position = new THREE.Vector3();
    this.initialized = false;
    this.prevHeading = 0;
    this.bank = 0;
    this.group.scale.setScalar(0.85);
  }

  update(dt, cameraPosition, heading, time, drop = 3.2, ahead = 20) {
    const target = escortPose(cameraPosition, heading, ahead, drop);
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    const sway = Math.sin(time * 0.8) * 0.45 + Math.sin(time * 1.9) * 0.12;
    target.x += rightX * sway;
    target.z += rightZ * sway;
    target.y += Math.sin(time * 1.6) * 0.14;

    if (!this.initialized) {
      this.position.set(target.x, target.y, target.z);
      this.initialized = true;
    }

    const lambda = 9;
    const blend = 1 - Math.exp(-lambda * dt);
    this.position.x += (target.x - this.position.x) * blend;
    this.position.y += (target.y - this.position.y) * blend;
    this.position.z += (target.z - this.position.z) * blend;

    const delta = wrapAngle(heading - this.prevHeading);
    this.prevHeading = heading;
    const targetBank = THREE.MathUtils.clamp(-delta * 6, -0.5, 0.5);
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-5 * dt));

    this.group.position.copy(this.position);
    this.group.rotation.set(0, heading, this.bank, 'YXZ');
    this.engine.material.opacity = 0.82 + 0.18 * Math.sin(time * 11);
  }

  dispose() {
    this.group.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      child.material.dispose();
    });
  }
}
