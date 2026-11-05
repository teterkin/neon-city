import * as THREE from 'three';
import { factoryChimneys, factoryFence, factoryParts } from './factoryModel.js';
import {
  createChimneyMaterial,
  createFactoryMaterial,
  createFenceMaterial,
} from './materials/factoryMaterial.js';
import {
  createBeaconMaterial,
  createFireMaterial,
  createSmokeMaterial,
} from './materials/plumeMaterial.js';

export const SMOKE_PER_CHIMNEY = 8;
export const FIRE_PER_FLARE = 10;

const MESH_CAPACITY_KEY = {
  box: 'boxes',
  prism: 'prisms',
  cylinder: 'cylinders',
  fence: 'fences',
};

function createPrismGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5,
    -0.5, 0, -0.5, 0.5, 1, -0.5, 0.5, 0, -0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 1, 0.5,
    -0.5, 0, -0.5, 0.5, 1, 0.5, 0.5, 1, -0.5,
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5,
    -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    0.5, 0, -0.5, 0.5, 1, -0.5, 0.5, 1, 0.5,
    0.5, 0, -0.5, 0.5, 1, 0.5, 0.5, 0, 0.5,
  ];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createInstanced(geometry, material, capacity) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

function createEmitter(capacity, material) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 3);
  const seeds = new Float32Array(capacity);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setDrawRange(0, 0);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { geometry, positions, seeds, points };
}

export class FactoryParts {
  constructor(count) {
    this.count = count;
    const buffer = Math.max(1, Math.ceil(count * 0.2));
    this.capacity = {
      chimneys: buffer * 3,
      boxes: buffer,
      prisms: buffer * 4,
      cylinders: buffer * 3,
      fences: buffer * 12,
      smoke: count * 2,
      fire: count,
      beacons: count,
    };

    this.group = new THREE.Group();
    this.group.name = 'factory-parts';

    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.boxGeometry.translate(0, 0.5, 0);
    this.cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
    this.cylinderGeometry.translate(0, 0.5, 0);
    this.chimneyGeometry = new THREE.CylinderGeometry(0.85, 1, 1, 8, 1);
    this.chimneyGeometry.translate(0, 0.5, 0);
    this.prismGeometry = createPrismGeometry();

    this.factoryMaterial = createFactoryMaterial();
    this.chimneyMaterial = createChimneyMaterial();
    this.fenceMaterial = createFenceMaterial();

    this.boxes = createInstanced(
      this.boxGeometry,
      this.factoryMaterial,
      this.capacity.boxes,
    );
    this.prisms = createInstanced(
      this.prismGeometry,
      this.factoryMaterial,
      this.capacity.prisms,
    );
    this.cylinders = createInstanced(
      this.cylinderGeometry,
      this.factoryMaterial,
      this.capacity.cylinders,
    );
    this.chimneys = createInstanced(
      this.chimneyGeometry,
      this.chimneyMaterial,
      this.capacity.chimneys,
    );
    this.fences = createInstanced(
      this.boxGeometry,
      this.fenceMaterial,
      this.capacity.fences,
    );
    this.group.add(this.boxes, this.prisms, this.cylinders, this.chimneys, this.fences);

    this.smokeMaterial = createSmokeMaterial();
    this.fireMaterial = createFireMaterial();
    this.beaconMaterial = createBeaconMaterial();
    this.smoke = createEmitter(this.capacity.smoke, this.smokeMaterial);
    this.fire = createEmitter(this.capacity.fire, this.fireMaterial);
    this.beacons = createEmitter(this.capacity.beacons, this.beaconMaterial);
    this.group.add(this.smoke.points, this.fire.points, this.beacons.points);

    this.meshes = {
      box: this.boxes,
      prism: this.prisms,
      cylinder: this.cylinders,
      fence: this.fences,
    };

    this.bases = new Array(count).fill(null);
    this._matrix = new THREE.Matrix4();
    this._scale = new THREE.Vector3();
  }

  sync(entries) {
    this.bases.fill(null);

    let chimneyIndex = 0;
    let smokeIndex = 0;
    let fireIndex = 0;
    let beaconIndex = 0;
    const meshIndex = { box: 0, prism: 0, cylinder: 0, fence: 0 };

    for (const { slot, layout, height } of entries) {
      const grow = layout.h > 0 ? height / layout.h : 0;
      const base = { chimneys: [], parts: [] };

      for (const chimney of factoryChimneys(layout)) {
        if (chimneyIndex >= this.capacity.chimneys) break;
        base.chimneys.push({ chimney, index: chimneyIndex });
        this._writeChimney(chimneyIndex, chimney, height, grow);
        chimneyIndex += 1;

        const top = layout.h + chimney.height;
        for (let i = 0; i < SMOKE_PER_CHIMNEY && smokeIndex < this.capacity.smoke; i += 1) {
          const angle = (i / SMOKE_PER_CHIMNEY) * Math.PI * 2 + chimney.seed * 6.283;
          const offset = chimney.radius * 0.45;
          this.smoke.positions[smokeIndex * 3] = chimney.x + Math.cos(angle) * offset;
          this.smoke.positions[smokeIndex * 3 + 1] = top;
          this.smoke.positions[smokeIndex * 3 + 2] = chimney.z + Math.sin(angle) * offset;
          this.smoke.seeds[smokeIndex] = (chimney.seed + i * 0.137) % 1;
          smokeIndex += 1;
        }

        if (chimney.flare) {
          for (let i = 0; i < FIRE_PER_FLARE && fireIndex < this.capacity.fire; i += 1) {
            const angle = (i / FIRE_PER_FLARE) * Math.PI * 2 + chimney.seed * 4.1;
            const offset = chimney.radius * 0.3;
            this.fire.positions[fireIndex * 3] = chimney.x + Math.cos(angle) * offset;
            this.fire.positions[fireIndex * 3 + 1] = top + 0.2;
            this.fire.positions[fireIndex * 3 + 2] = chimney.z + Math.sin(angle) * offset;
            this.fire.seeds[fireIndex] = (chimney.seed + i * 0.091) % 1;
            fireIndex += 1;
          }
        }

        if (beaconIndex < this.capacity.beacons) {
          this.beacons.positions[beaconIndex * 3] = chimney.x;
          this.beacons.positions[beaconIndex * 3 + 1] = top + 0.35;
          this.beacons.positions[beaconIndex * 3 + 2] = chimney.z;
          this.beacons.seeds[beaconIndex] = chimney.seed;
          beaconIndex += 1;
        }
      }

      for (const part of [...factoryParts(layout), ...factoryFence(layout)]) {
        const capacity = this.capacity[MESH_CAPACITY_KEY[part.kind]];
        if (meshIndex[part.kind] >= capacity) break;
        const index = meshIndex[part.kind];
        base.parts.push({ part, index });
        this._writePart(index, part, height);
        meshIndex[part.kind] += 1;
      }

      this.bases[slot] = base;
    }

    this.boxes.count = meshIndex.box;
    this.prisms.count = meshIndex.prism;
    this.cylinders.count = meshIndex.cylinder;
    this.fences.count = meshIndex.fence;
    this.chimneys.count = chimneyIndex;
    this._markMeshesDirty();

    this.smoke.geometry.setDrawRange(0, smokeIndex);
    this.fire.geometry.setDrawRange(0, fireIndex);
    this.beacons.geometry.setDrawRange(0, beaconIndex);
    this._markEmittersDirty(smokeIndex > 0, fireIndex > 0, beaconIndex > 0);
  }

  writeSlot(slot, layout, height) {
    const base = this.bases[slot];
    if (!base) return;
    const grow = layout.h > 0 ? height / layout.h : 0;

    for (const { chimney, index } of base.chimneys) {
      this._writeChimney(index, chimney, height, grow);
    }
    for (const { part, index } of base.parts) {
      this._writePart(index, part, height);
    }
    this._markMeshesDirty();
  }

  setTime(seconds) {
    this.smokeMaterial.uniforms.uTime.value = seconds;
    this.fireMaterial.uniforms.uTime.value = seconds;
    this.beaconMaterial.uniforms.uTime.value = seconds;
  }

  dispose() {
    this.boxGeometry.dispose();
    this.cylinderGeometry.dispose();
    this.chimneyGeometry.dispose();
    this.prismGeometry.dispose();
    this.factoryMaterial.dispose();
    this.chimneyMaterial.dispose();
    this.fenceMaterial.dispose();
    this.smokeMaterial.dispose();
    this.fireMaterial.dispose();
    this.beaconMaterial.dispose();
    this.smoke.geometry.dispose();
    this.fire.geometry.dispose();
    this.beacons.geometry.dispose();
  }

  _writeChimney(index, chimney, roofHeight, grow) {
    this._matrix.makeRotationY(0);
    this._scale.set(chimney.radius, chimney.height * grow, chimney.radius);
    this._matrix.scale(this._scale);
    this._matrix.setPosition(chimney.x, roofHeight, chimney.z);
    this.chimneys.setMatrixAt(index, this._matrix);
  }

  _writePart(index, part, roofHeight) {
    this._matrix.makeRotationY(part.rotY);
    if (part.kind === 'cylinder') {
      this._scale.set(part.r, part.h, part.r);
    } else {
      this._scale.set(part.w, part.h, part.d);
    }
    this._matrix.scale(this._scale);
    this._matrix.setPosition(part.x, part.ground ? 0 : roofHeight, part.z);
    this.meshes[part.kind].setMatrixAt(index, this._matrix);
  }

  _markMeshesDirty() {
    this.boxes.instanceMatrix.needsUpdate = true;
    this.prisms.instanceMatrix.needsUpdate = true;
    this.cylinders.instanceMatrix.needsUpdate = true;
    this.fences.instanceMatrix.needsUpdate = true;
    this.chimneys.instanceMatrix.needsUpdate = true;
  }

  _markEmittersDirty(smoke, fire, beacons) {
    if (smoke) {
      this.smoke.geometry.getAttribute('position').needsUpdate = true;
      this.smoke.geometry.getAttribute('aSeed').needsUpdate = true;
    }
    if (fire) {
      this.fire.geometry.getAttribute('position').needsUpdate = true;
      this.fire.geometry.getAttribute('aSeed').needsUpdate = true;
    }
    if (beacons) {
      this.beacons.geometry.getAttribute('position').needsUpdate = true;
      this.beacons.geometry.getAttribute('aSeed').needsUpdate = true;
    }
  }
}
