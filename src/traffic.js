import * as THREE from 'three';
import { createGlowTexture } from './materials/glowTexture.js';
import { createVehicleMaterial } from './materials/vehicleMaterial.js';
import { avoidanceOffset, stepAvoidance } from './avoidanceModel.js';
import {
  TRAFFIC_TYPES,
  advanceVehicle,
  createFleet,
  laneForIndex,
  needsRespawn,
  spawnVehicle,
  vehicleBob,
  vehicleSway,
} from './trafficModel.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Traffic {
  constructor({ count = 64, camera, rng = Math.random, radius = 320 } = {}) {
    this.count = count;
    this.radius = radius;
    this.camera = camera;
    this.rng = rng;
    this.fleet = createFleet(count, camera, rng, radius);

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.kindAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.geometry.setAttribute('aKind', this.kindAttribute);

    this.material = createVehicleMaterial();
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'traffic';

    this.group = new THREE.Group();
    this.group.name = 'traffic-group';
    this.group.add(this.mesh);

    this.glowPositions = new Float32Array(count * 3);
    this.glowColors = new Float32Array(count * 3);
    this.glowGeometry = new THREE.BufferGeometry();
    this.glowGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.glowPositions, 3),
    );
    this.glowGeometry.setAttribute('color', new THREE.BufferAttribute(this.glowColors, 3));
    this.glowTexture = createGlowTexture();
    this.glowMaterial = new THREE.PointsMaterial({
      size: 3.2,
      map: this.glowTexture,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.glows = new THREE.Points(this.glowGeometry, this.glowMaterial);
    this.glows.frustumCulled = false;
    this.group.add(this.glows);

    this._matrix = new THREE.Matrix4();
    this._quaternion = new THREE.Quaternion();
    this._position = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._color = new THREE.Color();

    for (let i = 0; i < count; i += 1) {
      this._write(i, this.fleet[i]);
      this.mesh.setColorAt(i, this._color.setHex(this.fleet[i].tint));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, camera, escort = null) {
    for (let i = 0; i < this.count; i += 1) {
      let vehicle = this.fleet[i];
      advanceVehicle(vehicle, dt);

      if (needsRespawn(vehicle, camera, this.radius)) {
        vehicle = spawnVehicle(camera, this.rng, this.radius, laneForIndex(i));
        this.fleet[i] = vehicle;
        this.mesh.setColorAt(i, this._color.setHex(vehicle.tint));
        this.mesh.instanceColor.needsUpdate = true;
      }

      if (escort) vehicle.avoid = stepAvoidance(vehicle, escort, dt);
      this._write(i, vehicle);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setTime(seconds) {
    this.material.uniforms.uTime.value = seconds;
  }

  dispose() {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.glowGeometry.dispose();
    this.glowMaterial.dispose();
    if (this.glowTexture) this.glowTexture.dispose();
  }

  _write(index, vehicle) {
    const spec = TRAFFIC_TYPES[vehicle.type];
    const bob = vehicleBob(vehicle.phase);
    const sway = vehicleSway(vehicle.phase);
    const swayX = Math.cos(vehicle.heading) * sway;
    const swayZ = -Math.sin(vehicle.heading) * sway;
    const avoid = avoidanceOffset(vehicle);

    this._position.set(
      vehicle.x + swayX + avoid.x,
      vehicle.y + bob,
      vehicle.z + swayZ + avoid.z,
    );
    this._quaternion.setFromAxisAngle(UP, vehicle.heading);
    this._scale.set(spec.width, spec.height, spec.length);
    this._matrix.compose(this._position, this._quaternion, this._scale);

    this.mesh.setMatrixAt(index, this._matrix);
    this.kindAttribute.array[index] =
      vehicle.type === 'cargo' ? 0 : vehicle.type === 'police' ? 2 : 1;
    this.kindAttribute.needsUpdate = true;

    const rearOffset = spec.length * 0.55;
    this.glowPositions[index * 3] =
      vehicle.x + swayX + avoid.x - Math.sin(vehicle.heading) * rearOffset;
    this.glowPositions[index * 3 + 1] = vehicle.y + bob;
    this.glowPositions[index * 3 + 2] =
      vehicle.z + swayZ + avoid.z - Math.cos(vehicle.heading) * rearOffset;

    this._color.setHex(vehicle.tint);
    this.glowColors[index * 3] = this._color.r * 1.5;
    this.glowColors[index * 3 + 1] = this._color.g * 1.5;
    this.glowColors[index * 3 + 2] = this._color.b * 1.5;
    this.glowGeometry.attributes.position.needsUpdate = true;
    this.glowGeometry.attributes.color.needsUpdate = true;
  }
}
