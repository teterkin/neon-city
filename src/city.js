import * as THREE from 'three';
import { GROW_MS, PALETTE } from './config.js';
import { cellLayout, cellOf, ringCells } from './layout.js';
import { createBuildingMaterial } from './materials/buildingMaterial.js';

const IDENTITY = new THREE.Quaternion();
const BLACK = new THREE.Color(0x000000);

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export class City {
  constructor({ cols = 52, rows = cols, reflection = true } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.count = cols * rows;

    this.group = new THREE.Group();
    this.group.name = 'city';

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.geometry.translate(0, 0.5, 0);

    this.seedAttribute = new THREE.InstancedBufferAttribute(new Float32Array(this.count), 1);
    this.glowAttribute = new THREE.InstancedBufferAttribute(new Float32Array(this.count), 1);
    this.seedAttribute.setUsage(THREE.DynamicDrawUsage);
    this.glowAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aSeed', this.seedAttribute);
    this.geometry.setAttribute('aGlow', this.glowAttribute);

    this.material = createBuildingMaterial({ mirror: false });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'buildings';
    this.group.add(this.mesh);

    this.reflection = null;
    this.reflectionMaterial = null;
    if (reflection) {
      this.reflectionMaterial = createBuildingMaterial({ mirror: true });
      this.reflection = new THREE.InstancedMesh(
        this.geometry,
        this.reflectionMaterial,
        this.count,
      );
      this.reflection.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.reflection.frustumCulled = false;
      this.reflection.renderOrder = 2;
      this.reflection.name = 'reflections';
      this.group.add(this.reflection);
    }

    this.assigned = new Map();
    this.free = [];
    for (let slot = this.count - 1; slot >= 0; slot -= 1) this.free.push(slot);

    this.slotIx = new Int32Array(this.count);
    this.slotIz = new Int32Array(this.count);
    this.slotX = new Float32Array(this.count);
    this.slotZ = new Float32Array(this.count);
    this.slotW = new Float32Array(this.count);
    this.slotD = new Float32Array(this.count);
    this.slotH = new Float32Array(this.count);
    this.slotSpawnAt = new Float64Array(this.count);
    this.slotActive = new Uint8Array(this.count);
    this.slotAssigned = new Uint8Array(this.count);
    this.slotBuilding = new Uint8Array(this.count);

    this.stats = {
      rebuilds: 0,
      spawned: 0,
      released: 0,
      active: 0,
      buildings: 0,
      cell: { ix: Number.NaN, iz: Number.NaN },
    };

    this._matrix = new THREE.Matrix4();
    this._mirrored = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._color = new THREE.Color();
    this._dirtyMatrix = false;
    this._dirtyColor = false;
    this._dirtyAttributes = false;

    this._matrix.makeScale(0, 0, 0);
    for (let slot = 0; slot < this.count; slot += 1) {
      this.mesh.setMatrixAt(slot, this._matrix);
      this.mesh.setColorAt(slot, BLACK);
      if (this.reflection) {
        this.reflection.setMatrixAt(slot, this._matrix);
        this.reflection.setColorAt(slot, BLACK);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    if (this.reflection) {
      this.reflection.instanceMatrix.needsUpdate = true;
      this.reflection.instanceColor.needsUpdate = true;
    }
  }

  update(now, position) {
    const { ix, iz } = cellOf(position.x, position.z);
    let rebuilt = 0;

    if (ix !== this.stats.cell.ix || iz !== this.stats.cell.iz) {
      rebuilt = this._refill(now, ix, iz);
      this.stats.cell = { ix, iz };
      this.stats.rebuilds += 1;
    }

    this.stats.active = this._animate(now);
    this._flush();
    return { rebuilt, animating: this.stats.active };
  }

  slotCell(slot) {
    if (!this.slotAssigned[slot]) return null;
    return { ix: this.slotIx[slot], iz: this.slotIz[slot] };
  }

  setTime(seconds) {
    this.material.uniforms.uTime.value = seconds;
    if (this.reflectionMaterial) this.reflectionMaterial.uniforms.uTime.value = seconds;
  }

  dispose() {
    this.mesh.dispose();
    if (this.reflection) this.reflection.dispose();
    this.geometry.dispose();
    this.material.dispose();
    if (this.reflectionMaterial) this.reflectionMaterial.dispose();
    this.group.clear();
    this.assigned.clear();
    this.free.length = 0;
  }

  _refill(now, centerIx, centerIz) {
    const cells = ringCells(centerIx, centerIz, this.cols, this.rows);
    const desired = new Set(cells.map((cell) => `${cell.ix}:${cell.iz}`));

    for (const [key, slot] of this.assigned) {
      if (desired.has(key)) continue;
      this.assigned.delete(key);
      this.free.push(slot);
      this._release(slot);
      this.stats.released += 1;
    }

    let spawned = 0;
    for (const cell of cells) {
      const key = `${cell.ix}:${cell.iz}`;
      if (this.assigned.has(key)) continue;
      const slot = this.free.pop();
      if (slot === undefined) continue;
      this.assigned.set(key, slot);
      this._spawn(slot, cell, now);
      spawned += 1;
    }

    this.stats.spawned += spawned;
    return spawned;
  }

  _spawn(slot, cell, now) {
    this.slotAssigned[slot] = 1;
    this.slotIx[slot] = cell.ix;
    this.slotIz[slot] = cell.iz;
    this.slotSpawnAt[slot] = now;

    const layout = cellLayout(cell.ix, cell.iz);
    if (!layout) {
      this.slotBuilding[slot] = 0;
      this.slotActive[slot] = 0;
      this.slotW[slot] = 0;
      this.slotD[slot] = 0;
      this._writeMatrix(slot, 0);
      this._setColor(slot, BLACK, 0, 0);
      return;
    }

    this.slotBuilding[slot] = 1;
    this.stats.buildings += 1;

    this.slotX[slot] = layout.x;
    this.slotZ[slot] = layout.z;
    this.slotW[slot] = layout.w;
    this.slotD[slot] = layout.d;
    this.slotH[slot] = layout.h;
    this.slotActive[slot] = 1;

    this._writeMatrix(slot, 0);
    this._color.setHex(PALETTE[layout.colorIndex].tint);
    this._setColor(slot, this._color, layout.seed, layout.glow);
  }

  _release(slot) {
    if (this.slotBuilding[slot] === 1) {
      this.slotBuilding[slot] = 0;
      this.stats.buildings -= 1;
    }
    this.slotAssigned[slot] = 0;
    this.slotActive[slot] = 0;
    this.slotSpawnAt[slot] = 0;
    this.slotW[slot] = 0;
    this.slotD[slot] = 0;
    this.slotH[slot] = 0;
    this._writeMatrix(slot, 0);
    this._setColor(slot, BLACK, 0, 0);
  }

  _setColor(slot, color, seed, glow) {
    this.mesh.setColorAt(slot, color);
    this.seedAttribute.array[slot] = seed;
    this.glowAttribute.array[slot] = glow;
    if (this.reflection) this.reflection.setColorAt(slot, color);
    this._dirtyColor = true;
    this._dirtyAttributes = true;
  }

  _writeMatrix(slot, height) {
    const width = this.slotW[slot];
    const depth = this.slotD[slot];
    const x = this.slotX[slot];
    const z = this.slotZ[slot];

    this._position.set(x, 0, z);
    this._scale.set(width, height, depth);
    this._matrix.compose(this._position, IDENTITY, this._scale);
    this.mesh.setMatrixAt(slot, this._matrix);

    if (this.reflection) {
      this._position.set(x, -0.03, z);
      this._scale.set(width, -height, depth);
      this._mirrored.compose(this._position, IDENTITY, this._scale);
      this.reflection.setMatrixAt(slot, this._mirrored);
    }

    this._dirtyMatrix = true;
  }

  _animate(now) {
    let animating = 0;
    for (let slot = 0; slot < this.count; slot += 1) {
      if (this.slotActive[slot] !== 1) continue;
      const progress = (now - this.slotSpawnAt[slot]) / GROW_MS;
      if (progress >= 1) {
        this._writeMatrix(slot, this.slotH[slot]);
        this.slotActive[slot] = 0;
      } else {
        const eased = easeOutCubic(Math.max(0, progress));
        this._writeMatrix(slot, this.slotH[slot] * eased);
        animating += 1;
      }
    }
    return animating;
  }

  _flush() {
    if (this._dirtyMatrix) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.reflection) this.reflection.instanceMatrix.needsUpdate = true;
      this._dirtyMatrix = false;
    }
    if (this._dirtyColor) {
      this.mesh.instanceColor.needsUpdate = true;
      if (this.reflection) this.reflection.instanceColor.needsUpdate = true;
      this._dirtyColor = false;
    }
    if (this._dirtyAttributes) {
      this.seedAttribute.needsUpdate = true;
      this.glowAttribute.needsUpdate = true;
      this._dirtyAttributes = false;
    }
  }
}
