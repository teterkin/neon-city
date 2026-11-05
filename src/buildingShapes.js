import * as THREE from 'three';
import { ARCH_ASPECT, PALETTE } from './config.js';
import { hash2 } from './noise.js';
import { nearestAvenueFace } from './holograms.js';
import { createFactoryMaterial } from './materials/factoryMaterial.js';
import { createBeaconMaterial } from './materials/plumeMaterial.js';

export const SHAPE_VARIANTS = [
  'pyramid',
  'cone',
  'cylinder',
  'archCircle',
  'archEllipse',
  'archStadium',
];

export function createPyramidGeometry() {
  const geometry = new THREE.CylinderGeometry(0.16, 0.7071, 1, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export function createConeGeometry() {
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.5, 0),
    new THREE.Vector2(0.5, 0.75),
    new THREE.Vector2(0, 1),
  ];
  return new THREE.LatheGeometry(profile, 24);
}

export function createCylinderGeometry() {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export function createArchGeometry(hole = 'circle') {
  const outline = new THREE.Shape();
  outline.moveTo(-0.5, 0);
  outline.lineTo(0.5, 0);
  outline.lineTo(0.5, 1);
  outline.lineTo(-0.5, 1);
  outline.closePath();

  const path = new THREE.Path();
  if (hole === 'stadium') {
    const radius = 0.13;
    const half = 0.24;
    const centerY = 0.52;
    path.moveTo(-half, centerY - radius);
    path.lineTo(half, centerY - radius);
    path.absarc(half, centerY, radius, -Math.PI / 2, Math.PI / 2, false);
    path.lineTo(-half, centerY + radius);
    path.absarc(-half, centerY, radius, Math.PI / 2, (Math.PI * 3) / 2, false);
  } else if (hole === 'ellipse') {
    path.absarc(0, 0.55, 0.3, 0, Math.PI * 2, true);
  } else {
    path.absellipse(0, 0.55, 0.4, 0.4 / ARCH_ASPECT, 0, Math.PI * 2, true);
  }
  outline.holes.push(path);

  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

function createBeaconEmitter(capacity, material) {
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

export class BuildingShapes {
  constructor(count, material, mirrorMaterial) {
    this.count = count;
    this.capacity = Math.max(1, Math.ceil(count * 0.2));
    this.mirrorMaterial = mirrorMaterial;

    this.group = new THREE.Group();
    this.group.name = 'building-shapes';

    this.entries = SHAPE_VARIANTS.map((key, index) => {
      const geometry =
        key === 'pyramid'
          ? createPyramidGeometry()
          : key === 'cone'
            ? createConeGeometry()
            : key === 'cylinder'
              ? createCylinderGeometry()
              : createArchGeometry(
              key === 'archStadium'
                ? 'stadium'
                : key === 'archEllipse'
                  ? 'ellipse'
                  : 'circle',
            );

      const seed = new THREE.InstancedBufferAttribute(
        new Float32Array(this.capacity),
        1,
      );
      const glow = new THREE.InstancedBufferAttribute(
        new Float32Array(this.capacity),
        1,
      );
      const shape = new THREE.InstancedBufferAttribute(
        new Float32Array(this.capacity).fill(index + 1),
        1,
      );
      geometry.setAttribute('aSeed', seed);
      geometry.setAttribute('aGlow', glow);
      geometry.setAttribute('aShape', shape);

      const mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);

      let mirror = null;
      if (mirrorMaterial) {
        mirror = new THREE.InstancedMesh(geometry, mirrorMaterial, this.capacity);
        mirror.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mirror.frustumCulled = false;
        mirror.renderOrder = 2;
        mirror.count = 0;
        this.group.add(mirror);
      }

      return { key, geometry, seed, glow, mesh, mirror };
    });

    this.mastGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
    this.mastGeometry.translate(0, 0.5, 0);
    this.mastMaterial = createFactoryMaterial();
    this.masts = new THREE.InstancedMesh(
      this.mastGeometry,
      this.mastMaterial,
      this.capacity,
    );
    this.masts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.masts.frustumCulled = false;
    this.masts.count = 0;
    this.group.add(this.masts);

    this.beaconMaterial = createBeaconMaterial();
    this.beacon = createBeaconEmitter(this.capacity, this.beaconMaterial);
    this.group.add(this.beacon.points);

    this.bases = new Array(count).fill(null);
    this._matrix = new THREE.Matrix4();
    this._scale = new THREE.Vector3();
    this._color = new THREE.Color();
  }

  sync(entries) {
    this.bases.fill(null);
    const counts = new Array(this.entries.length).fill(0);
    let mastIndex = 0;
    let beaconIndex = 0;

    for (const { slot, layout, height } of entries) {
      const entryIndex = this._variantIndex(layout);
      if (entryIndex < 0) continue;
      const entry = this.entries[entryIndex];
      if (counts[entryIndex] >= this.capacity) continue;

      const instance = counts[entryIndex];
      counts[entryIndex] += 1;
      this._writeInstance(entryIndex, instance, layout, height);

      const base = { entry: entryIndex, instance, mast: -1, beacon: -1 };
      if (mastIndex < this.capacity) {
        const mast = this._antennaPose(layout, height);
        this._writeMast(mastIndex, mast);
        base.mast = mastIndex;
        mastIndex += 1;

        if (beaconIndex < this.capacity) {
          this.beacon.positions[beaconIndex * 3] = mast.x;
          this.beacon.positions[beaconIndex * 3 + 1] = mast.base + mast.height + 0.3;
          this.beacon.positions[beaconIndex * 3 + 2] = mast.z;
          this.beacon.seeds[beaconIndex] = mast.seed;
          base.beacon = beaconIndex;
          beaconIndex += 1;
        }
      }

      this.bases[slot] = base;
    }

    this.entries.forEach((entry, index) => {
      entry.mesh.count = counts[index];
      if (entry.mirror) entry.mirror.count = counts[index];
    });
    this.masts.count = mastIndex;
    this.beacon.geometry.setDrawRange(0, beaconIndex);
    this._markDirty();
  }

  writeSlot(slot, layout, height) {
    const base = this.bases[slot];
    if (!base) return;

    this._writeInstance(base.entry, base.instance, layout, height);
    if (base.mast >= 0) {
      const mast = this._antennaPose(layout, height);
      this._writeMast(base.mast, mast);
      if (base.beacon >= 0) {
        this.beacon.positions[base.beacon * 3] = mast.x;
        this.beacon.positions[base.beacon * 3 + 1] = mast.base + mast.height + 0.3;
        this.beacon.positions[base.beacon * 3 + 2] = mast.z;
      }
    }
    this._markDirty();
  }

  setTime(seconds) {
    this.beaconMaterial.uniforms.uTime.value = seconds;
  }

  dispose() {
    for (const entry of this.entries) entry.geometry.dispose();
    this.mastGeometry.dispose();
    this.mastMaterial.dispose();
    this.beaconMaterial.dispose();
    this.beacon.geometry.dispose();
  }

  _variantIndex(layout) {
    if (layout.shape === 'arch') {
      if (layout.archHole === 'stadium') return 5;
      if (layout.archHole === 'ellipse') return 4;
      return 3;
    }
    if (layout.shape === 'pyramid') return 0;
    if (layout.shape === 'cone') return 1;
    if (layout.shape === 'cylinder') return 2;
    return -1;
  }

  _writeInstance(entryIndex, instance, layout, height) {
    const entry = this.entries[entryIndex];
    const centerX = layout.x + layout.w / 2;
    const centerZ = layout.z + layout.d / 2;
    const rotated =
      layout.shape === 'arch' && nearestAvenueFace(layout).startsWith('x');
    const width = rotated ? layout.d : layout.w;
    const depth = rotated ? layout.w : layout.d;

    this._matrix.makeRotationY(rotated ? Math.PI / 2 : 0);
    this._scale.set(width, height, depth);
    this._matrix.scale(this._scale);
    this._matrix.setPosition(centerX, 0, centerZ);
    entry.mesh.setMatrixAt(instance, this._matrix);

    if (entry.mirror) {
      this._matrix.makeRotationY(rotated ? Math.PI / 2 : 0);
      this._scale.set(width, -height, depth);
      this._matrix.scale(this._scale);
      this._matrix.setPosition(centerX, -0.03, centerZ);
      entry.mirror.setMatrixAt(instance, this._matrix);
    }

    this._color.setHex(PALETTE[layout.colorIndex].tint);
    entry.mesh.setColorAt(instance, this._color);
    if (entry.mirror) entry.mirror.setColorAt(instance, this._color);
    entry.seed.array[instance] = layout.seed;
    entry.glow.array[instance] = layout.glow;
  }

  _antennaPose(layout, height) {
    const centerX = layout.x + layout.w / 2;
    const centerZ = layout.z + layout.d / 2;
    let x = centerX;
    let z = centerZ;
    if (layout.shape === 'cylinder') {
      const side = hash2(layout.ix, layout.iz, 711) < 0.5 ? -1 : 1;
      x += side * layout.w * 0.4;
    }
    return {
      x,
      z,
      base: height,
      height: 4 + hash2(layout.ix, layout.iz, 713) * 8,
      radius: 0.22 + hash2(layout.ix, layout.iz, 717) * 0.14,
      seed: hash2(layout.ix, layout.iz, 719),
    };
  }

  _writeMast(index, mast) {
    this._matrix.makeRotationY(0);
    this._scale.set(mast.radius, mast.height, mast.radius);
    this._matrix.scale(this._scale);
    this._matrix.setPosition(mast.x, mast.base, mast.z);
    this.masts.setMatrixAt(index, this._matrix);
  }

  _markDirty() {
    for (const entry of this.entries) {
      entry.mesh.instanceMatrix.needsUpdate = true;
      if (entry.mirror) {
        entry.mirror.instanceMatrix.needsUpdate = true;
        if (entry.mirror.instanceColor) entry.mirror.instanceColor.needsUpdate = true;
      }
      if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true;
      entry.seed.needsUpdate = true;
      entry.glow.needsUpdate = true;
    }
    this.masts.instanceMatrix.needsUpdate = true;
    this.beacon.geometry.getAttribute('position').needsUpdate = true;
    this.beacon.geometry.getAttribute('aSeed').needsUpdate = true;
  }
}
