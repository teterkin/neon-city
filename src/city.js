import * as THREE from 'three';
import { GROW_MS, PALETTE } from './config.js';
import {
  HOLO_TINTS,
  holoPose,
  mediaFacadeFor,
  secondaryMediaFacadeFor,
} from './holograms.js';
import { cellLayout, cellOf, ringCells } from './layout.js';
import { createBuildingMaterial } from './materials/buildingMaterial.js';
import { createHologramMaterial } from './materials/hologramMaterial.js';
import { createHologramFrameMaterial } from './materials/hologramFrameMaterial.js';

const IDENTITY = new THREE.Quaternion();
const BLACK = new THREE.Color(0x000000);


export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export class City {
  constructor({
    cols = 52,
    rows = cols,
    reflection = true,
    holoProbability = null,
  } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.count = cols * rows;
    this.holoProbability = holoProbability;

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

    this.holoCapacity = this.count * 2;
    this.holoGeometry = new THREE.PlaneGeometry(1, 1);
    this.holoSeedAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(this.holoCapacity),
      1,
    );
    this.holoKindAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(this.holoCapacity),
      1,
    );
    this.holoAspectAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(this.holoCapacity).fill(1),
      1,
    );
    this.holoSeedAttribute.setUsage(THREE.DynamicDrawUsage);
    this.holoKindAttribute.setUsage(THREE.DynamicDrawUsage);
    this.holoAspectAttribute.setUsage(THREE.DynamicDrawUsage);
    this.holoGeometry.setAttribute('aSeed', this.holoSeedAttribute);
    this.holoGeometry.setAttribute('aKind', this.holoKindAttribute);
    this.holoGeometry.setAttribute('aAspect', this.holoAspectAttribute);
    this.hologramMaterial = createHologramMaterial();
    this.holograms = new THREE.InstancedMesh(
      this.holoGeometry,
      this.hologramMaterial,
      this.holoCapacity,
    );
    this.holograms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.holograms.frustumCulled = false;
    this.holograms.renderOrder = 1;
    this.holograms.name = 'holograms';
    this.group.add(this.holograms);

    this.frameGeometry = new THREE.PlaneGeometry(1, 1);
    this.holoFrameSeedAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(this.holoCapacity),
      1,
    );
    this.holoFrameSeedAttribute.setUsage(THREE.DynamicDrawUsage);
    this.frameGeometry.setAttribute('aSeed', this.holoFrameSeedAttribute);
    this.holoFrameMaterial = createHologramFrameMaterial();
    this.holoFrames = new THREE.InstancedMesh(
      this.frameGeometry,
      this.holoFrameMaterial,
      this.holoCapacity,
    );
    this.holoFrames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.holoFrames.frustumCulled = false;
    this.holoFrames.name = 'hologram-frames';
    this.group.add(this.holoFrames);

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
    this.slotLayout = new Array(this.count).fill(null);
    this.slotHolo = new Array(this.count).fill(null);
    this.slotHolo2 = new Array(this.count).fill(null);
    this.stats = {
      rebuilds: 0,
      spawned: 0,
      released: 0,
      active: 0,
      buildings: 0,
      holograms: 0,
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
    this._dirtyHoloMatrix = false;
    this._dirtyHoloColor = false;
    this._dirtyHoloAttributes = false;
    this._dirtyFrameMatrix = false;
    this._dirtyFrameColor = false;
    this._dirtyFrameAttributes = false;

    this._matrix.makeScale(0, 0, 0);
    for (let slot = 0; slot < this.count; slot += 1) {
      this.mesh.setMatrixAt(slot, this._matrix);
      this.mesh.setColorAt(slot, BLACK);
      if (this.reflection) {
        this.reflection.setMatrixAt(slot, this._matrix);
        this.reflection.setColorAt(slot, BLACK);
      }
    }
    for (let instance = 0; instance < this.holoCapacity; instance += 1) {
      this.holograms.setMatrixAt(instance, this._matrix);
      this.holograms.setColorAt(instance, BLACK);
      this.holoFrames.setMatrixAt(instance, this._matrix);
      this.holoFrames.setColorAt(instance, BLACK);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.holograms.instanceMatrix.needsUpdate = true;
    this.holograms.instanceColor.needsUpdate = true;
    this.holoFrames.instanceMatrix.needsUpdate = true;
    this.holoFrames.instanceColor.needsUpdate = true;
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
    this.hologramMaterial.uniforms.uTime.value = seconds;
    this.holoFrameMaterial.uniforms.uTime.value = seconds;
    if (this.reflectionMaterial) this.reflectionMaterial.uniforms.uTime.value = seconds;
  }

  dispose() {
    this.mesh.dispose();
    if (this.reflection) this.reflection.dispose();
    this.holograms.dispose();
    this.holoFrames.dispose();
    this.geometry.dispose();
    this.holoGeometry.dispose();
    this.frameGeometry.dispose();
    this.material.dispose();
    this.hologramMaterial.dispose();
    this.holoFrameMaterial.dispose();
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
      this.slotLayout[slot] = null;
      this.slotHolo[slot] = null;
      this.slotHolo2[slot] = null;
      this._writeMatrix(slot, 0);
      this._setColor(slot, BLACK, 0, 0);
      this._setHolo(slot, null);
      return;
    }

    this.slotBuilding[slot] = 1;
    this.stats.buildings += 1;
    this.slotLayout[slot] = layout;
    this.slotHolo[slot] = mediaFacadeFor(layout, this.holoProbability);
    this.slotHolo2[slot] = this.slotHolo[slot]
      ? secondaryMediaFacadeFor(layout, this.slotHolo[slot])
      : null;
    if (this.slotHolo[slot]) this.stats.holograms += 1;

    this.slotX[slot] = layout.x;
    this.slotZ[slot] = layout.z;
    this.slotW[slot] = layout.w;
    this.slotD[slot] = layout.d;
    this.slotH[slot] = layout.h;
    this.slotActive[slot] = 1;

    this._writeMatrix(slot, 0);
    this._color.setHex(PALETTE[layout.colorIndex].tint);
    this._setColor(slot, this._color, layout.seed, layout.glow);
    this._setHolo(slot, this.slotHolo[slot]);
  }

  _release(slot) {
    if (this.slotHolo[slot]) this.stats.holograms -= 1;
    this.slotLayout[slot] = null;
    this.slotHolo[slot] = null;
    this.slotHolo2[slot] = null;
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
    this._setHolo(slot, null);
  }

  _setColor(slot, color, seed, glow) {
    this.mesh.setColorAt(slot, color);
    this.seedAttribute.array[slot] = seed;
    this.glowAttribute.array[slot] = glow;
    if (this.reflection) this.reflection.setColorAt(slot, color);
    this._dirtyColor = true;
    this._dirtyAttributes = true;
  }

  _setHolo(slot, spec) {
    this._setHoloInstance(slot, spec);
    this._setHoloInstance(this.count + slot, this.slotHolo2[slot]);
    this._dirtyHoloColor = true;
    this._dirtyHoloAttributes = true;
    this._dirtyFrameColor = true;
    this._dirtyFrameAttributes = true;
  }

  _setHoloInstance(instance, spec) {
    if (!spec) {
      this.holograms.setColorAt(instance, BLACK);
      this.holoFrames.setColorAt(instance, BLACK);
      this.holoSeedAttribute.array[instance] = 0;
      this.holoKindAttribute.array[instance] = 0;
      this.holoFrameSeedAttribute.array[instance] = 0;
      return;
    }
    this._color.setHex(HOLO_TINTS[spec.tintIndex]);
    this.holograms.setColorAt(instance, this._color);
    this.holoFrames.setColorAt(instance, this._color);
    this.holoSeedAttribute.array[instance] = spec.seed;
    this.holoKindAttribute.array[instance] = spec.kind;
    this.holoFrameSeedAttribute.array[instance] = spec.seed;
  }

  _writeMatrix(slot, height) {
    const width = this.slotW[slot];
    const depth = this.slotD[slot];
    const x = this.slotX[slot];
    const z = this.slotZ[slot];

    this._position.set(x + width / 2, 0, z + depth / 2);
    this._scale.set(width, height, depth);
    this._matrix.compose(this._position, IDENTITY, this._scale);
    this.mesh.setMatrixAt(slot, this._matrix);

    if (this.reflection) {
      this._position.set(x + width / 2, -0.03, z + depth / 2);
      this._scale.set(width, -height, depth);
      this._mirrored.compose(this._position, IDENTITY, this._scale);
      this.reflection.setMatrixAt(slot, this._mirrored);
    }

    this._writeHologram(slot, height);
    this._dirtyMatrix = true;
  }

  _writeHologram(slot, height) {
    const layout = this.slotLayout[slot];
    this._writeHoloInstance(slot, this.slotHolo[slot], layout, height);
    this._writeHoloInstance(this.count + slot, this.slotHolo2[slot], layout, height);
    this._dirtyHoloMatrix = true;
    this._dirtyHoloAttributes = true;
    this._dirtyFrameMatrix = true;
  }

  _writeHoloInstance(instance, spec, layout, height) {
    if (!spec || !layout || height <= 0.01) {
      this._matrix.makeScale(0, 0, 0);
      this.holograms.setMatrixAt(instance, this._matrix);
      this.holoFrames.setMatrixAt(instance, this._matrix);
      this.holoAspectAttribute.array[instance] = 1;
      return;
    }

    const pose = holoPose(layout, spec, height);
    this._matrix.makeRotationY(pose.rotationY);
    this._scale.set(pose.width, pose.height, 1);
    this._matrix.scale(this._scale);
    this._matrix.setPosition(pose.x, pose.y, pose.z);
    this.holograms.setMatrixAt(instance, this._matrix);

    const normalX = Math.sin(pose.rotationY);
    const normalZ = Math.cos(pose.rotationY);
    this._matrix.makeRotationY(pose.rotationY);
    this._scale.set(pose.width + 0.16, pose.height + 0.16, 1);
    this._matrix.scale(this._scale);
    this._matrix.setPosition(
      pose.x - normalX * 0.012,
      pose.y,
      pose.z - normalZ * 0.012,
    );
    this.holoFrames.setMatrixAt(instance, this._matrix);

    this.holoAspectAttribute.array[instance] =
      pose.width / Math.max(0.001, pose.height);
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
    if (this._dirtyHoloMatrix) {
      this.holograms.instanceMatrix.needsUpdate = true;
      this._dirtyHoloMatrix = false;
    }
    if (this._dirtyHoloColor) {
      this.holograms.instanceColor.needsUpdate = true;
      this._dirtyHoloColor = false;
    }
    if (this._dirtyHoloAttributes) {
      this.holoSeedAttribute.needsUpdate = true;
      this.holoKindAttribute.needsUpdate = true;
      this.holoAspectAttribute.needsUpdate = true;
      this._dirtyHoloAttributes = false;
    }
    if (this._dirtyFrameMatrix) {
      this.holoFrames.instanceMatrix.needsUpdate = true;
      this._dirtyFrameMatrix = false;
    }
    if (this._dirtyFrameColor) {
      this.holoFrames.instanceColor.needsUpdate = true;
      this._dirtyFrameColor = false;
    }
    if (this._dirtyFrameAttributes) {
      this.holoFrameSeedAttribute.needsUpdate = true;
      this._dirtyFrameAttributes = false;
    }
  }
}
