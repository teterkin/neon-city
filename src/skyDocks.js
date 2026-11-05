import * as THREE from 'three';
import { PALETTE } from './config.js';
import { TRAFFIC_TYPES } from './trafficModel.js';
import { createDockMaterial } from './materials/dockMaterial.js';
import { createVehicleMaterial } from './materials/vehicleMaterial.js';
import { skyDockPose, skyDockShipPose } from './skyDockModel.js';

const UP = new THREE.Vector3(0, 1, 0);
const SHIP = TRAFFIC_TYPES.passenger;

export class SkyDocks {
  constructor(count) {
    this.count = count;
    const buffer = Math.max(1, Math.ceil(count * 0.12));
    this.capacity = { docks: buffer, ships: buffer * 4 };

    this.group = new THREE.Group();
    this.group.name = 'sky-docks';

    this.dockGeometry = new THREE.CylinderGeometry(1, 1, 1, 24, 1);
    this.dockGeometry.translate(0, 0.5, 0);
    this.dockMaterial = createDockMaterial();
    this.docks = new THREE.InstancedMesh(
      this.dockGeometry,
      this.dockMaterial,
      this.capacity.docks,
    );
    this.docks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.docks.frustumCulled = false;
    this.docks.count = 0;

    this.shipGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.shipKind = new THREE.InstancedBufferAttribute(
      new Float32Array(this.capacity.ships).fill(1),
      1,
    );
    this.shipGeometry.setAttribute('aKind', this.shipKind);
    this.shipMaterial = createVehicleMaterial();
    this.ships = new THREE.InstancedMesh(
      this.shipGeometry,
      this.shipMaterial,
      this.capacity.ships,
    );
    this.ships.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ships.frustumCulled = false;
    this.ships.count = 0;

    this.group.add(this.docks, this.ships);

    this.bases = new Array(count).fill(null);
    this._matrix = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._color = new THREE.Color();
  }

  sync(entries) {
    this.bases.fill(null);

    let dockIndex = 0;
    let shipIndex = 0;
    for (const { slot, layout, height, dock } of entries) {
      if (dockIndex >= this.capacity.docks) break;

      const base = { spec: dock, index: dockIndex, ships: [] };
      this._writeDock(dockIndex, dock, skyDockPose(layout, dock, height));
      this._color.setHex(PALETTE[layout.colorIndex].tint);
      this.docks.setColorAt(dockIndex, this._color);
      dockIndex += 1;

      for (let index = 0; index < dock.ships && shipIndex < this.capacity.ships; index += 1) {
        const ship = skyDockShipPose(layout, dock, height, index);
        this._writeShip(shipIndex, layout, ship);
        base.ships.push({ index: shipIndex, i: index });
        shipIndex += 1;
      }

      this.bases[slot] = base;
    }

    this.docks.count = dockIndex;
    this.ships.count = shipIndex;
    this._markDirty();
  }

  writeSlot(slot, layout, height) {
    const base = this.bases[slot];
    if (!base) return;

    this._writeDock(base.index, base.spec, skyDockPose(layout, base.spec, height));
    for (const { index, i } of base.ships) {
      this._writeShip(index, layout, skyDockShipPose(layout, base.spec, height, i));
    }
    this._markDirty();
  }

  setTime(seconds) {
    this.dockMaterial.uniforms.uTime.value = seconds;
    this.shipMaterial.uniforms.uTime.value = seconds;
  }

  dispose() {
    this.dockGeometry.dispose();
    this.shipGeometry.dispose();
    this.dockMaterial.dispose();
    this.shipMaterial.dispose();
  }

  _writeDock(index, spec, pose) {
    this._matrix.makeRotationY(0);
    this._scale.set(spec.radius, spec.thickness, spec.radius);
    this._matrix.scale(this._scale);
    this._matrix.setPosition(pose.x, pose.y, pose.z);
    this.docks.setMatrixAt(index, this._matrix);
  }

  _writeShip(index, layout, ship) {
    this._position.set(ship.x, ship.y + SHIP.height / 2, ship.z);
    this._quaternion.setFromAxisAngle(UP, ship.heading);
    this._scale.set(SHIP.width, SHIP.height, SHIP.length);
    this._matrix.compose(this._position, this._quaternion, this._scale);
    this.ships.setMatrixAt(index, this._matrix);

    this._color.setHex(PALETTE[layout.colorIndex].tint);
    this.ships.setColorAt(index, this._color);
    this.shipKind.array[index] = 1;
  }

  _markDirty() {
    this.docks.instanceMatrix.needsUpdate = true;
    this.ships.instanceMatrix.needsUpdate = true;
    if (this.docks.instanceColor) this.docks.instanceColor.needsUpdate = true;
    if (this.ships.instanceColor) this.ships.instanceColor.needsUpdate = true;
    this.shipKind.needsUpdate = true;
  }
}
