import * as THREE from 'three';
import { PALETTE } from './config.js';
import { TRAFFIC_TYPES } from './trafficModel.js';
import { createLandingPadMaterial } from './materials/landingPadMaterial.js';
import { createVehicleMaterial } from './materials/vehicleMaterial.js';

const UP = new THREE.Vector3(0, 1, 0);
const PAD_Y = 0.02;

export class LandingPads {
  constructor(count) {
    this.count = count;
    const buffer = Math.max(1, Math.ceil(count * 0.15));
    this.capacity = { pads: buffer, ships: buffer * 4 };

    this.group = new THREE.Group();
    this.group.name = 'landing-pads';

    this.padGeometry = new THREE.PlaneGeometry(1, 1);
    this.padGeometry.rotateX(-Math.PI / 2);
    this.padMaterial = createLandingPadMaterial();
    this.pads = new THREE.InstancedMesh(
      this.padGeometry,
      this.padMaterial,
      this.capacity.pads,
    );
    this.pads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pads.frustumCulled = false;
    this.pads.count = 0;
    this.pads.renderOrder = 1;

    this.shipGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.shipKind = new THREE.InstancedBufferAttribute(
      new Float32Array(this.capacity.ships),
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

    this.group.add(this.pads, this.ships);

    this.bases = new Array(count).fill(null);
    this._matrix = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._color = new THREE.Color();
  }

  sync(entries) {
    this.bases.fill(null);

    let padIndex = 0;
    let shipIndex = 0;

    for (const { slot, layout, pads } of entries) {
      const base = { start: padIndex, count: pads.length };
      for (const pad of pads) {
        if (padIndex >= this.capacity.pads) break;

        this._matrix.makeRotationY(0);
        this._scale.set(pad.width, 1, pad.depth);
        this._matrix.scale(this._scale);
        this._matrix.setPosition(pad.x, PAD_Y, pad.z);
        this.pads.setMatrixAt(padIndex, this._matrix);
        this._color.setHex(PALETTE[layout.colorIndex].tint);
        this.pads.setColorAt(padIndex, this._color);
        padIndex += 1;

        for (const ship of pad.ships) {
          if (shipIndex >= this.capacity.ships) break;
          const spec = TRAFFIC_TYPES[ship.type];
          this._position.set(ship.x, PAD_Y + spec.height / 2, ship.z);
          this._quaternion.setFromAxisAngle(UP, ship.heading);
          this._scale.set(spec.width, spec.height, spec.length);
          this._matrix.compose(this._position, this._quaternion, this._scale);
          this.ships.setMatrixAt(shipIndex, this._matrix);
          this._color.setHex(spec.tint);
          this.ships.setColorAt(shipIndex, this._color);
          this.shipKind.array[shipIndex] = ship.type === 'cargo' ? 0 : 1;
          shipIndex += 1;
        }
      }
      this.bases[slot] = base;
    }

    this.pads.count = padIndex;
    this.ships.count = shipIndex;
    this._markDirty();
  }

  setTime(seconds) {
    this.padMaterial.uniforms.uTime.value = seconds;
    this.shipMaterial.uniforms.uTime.value = seconds;
  }

  dispose() {
    this.padGeometry.dispose();
    this.shipGeometry.dispose();
    this.padMaterial.dispose();
    this.shipMaterial.dispose();
  }

  _markDirty() {
    this.pads.instanceMatrix.needsUpdate = true;
    this.ships.instanceMatrix.needsUpdate = true;
    if (this.pads.instanceColor) this.pads.instanceColor.needsUpdate = true;
    if (this.ships.instanceColor) this.ships.instanceColor.needsUpdate = true;
    this.shipKind.needsUpdate = true;
  }
}
