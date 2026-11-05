import * as THREE from 'three';
import { CROWD_VISIBLE_HEIGHT, CrowdModel } from './crowdModel.js';

const PARTS = [
  'body',
  'head',
  'upperArmL',
  'foreArmL',
  'upperArmR',
  'foreArmR',
  'thighL',
  'shinL',
  'thighR',
  'shinR',
];

const SHOULDER_Y = 1.42;
const HIP_Y = 0.78;
const UPPER_ARM = 0.3;
const THIGH = 0.38;
const JOINT_COUNT = 8;
const SHOULDER_RADIUS = 0.115;
const ELBOW_RADIUS = 0.095;
const HIP_RADIUS = 0.115;
const KNEE_RADIUS = 0.095;
function createGeometries() {
  const upperArm = new THREE.BoxGeometry(0.09, UPPER_ARM, 0.09);
  upperArm.translate(0, -UPPER_ARM / 2, 0);
  const foreArm = new THREE.BoxGeometry(0.08, 0.28, 0.08);
  foreArm.translate(0, -0.14, 0);
  const thigh = new THREE.BoxGeometry(0.13, THIGH, 0.16);
  thigh.translate(0, -THIGH / 2, 0);
  const shin = new THREE.BoxGeometry(0.11, 0.36, 0.14);
  shin.translate(0, -0.18, 0);

  return {
    body: new THREE.BoxGeometry(0.42, 0.72, 0.26),
    head: new THREE.SphereGeometry(0.15, 8, 6),
    upperArmL: upperArm,
    foreArmL: foreArm,
    upperArmR: upperArm,
    foreArmR: foreArm,
    thighL: thigh,
    shinL: shin,
    thighR: thigh,
    shinR: shin,
    joint: new THREE.SphereGeometry(1, 8, 6),
  };
}

export class Crowd {
  constructor({
    rng = Math.random,
    streetCapacity = 160,
    dockCapacity = 24,
  } = {}) {
    this.model = new CrowdModel({ rng, streetCapacity, dockCapacity });
    this.capacities = { street: streetCapacity, dock: dockCapacity };

    this.group = new THREE.Group();
    this.group.name = 'crowd';

    this.geometries = createGeometries();
    this.material = new THREE.MeshBasicMaterial({
      color: 0x05070d,
      toneMapped: false,
      fog: true,
    });

    this.streetGroup = this._createLayer(streetCapacity);
    this.streetGroup.name = 'crowd-street';
    this.dockGroup = this._createLayer(dockCapacity);
    this.dockGroup.name = 'crowd-dock';
    this.group.add(this.streetGroup, this.dockGroup);

    this._dummy = new THREE.Object3D();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._color = new THREE.Color();
    for (const mesh of this.streetGroup.children) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.setMatrixAt(index, this._zero);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of this.dockGroup.children) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.setMatrixAt(index, this._zero);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    this._tint();

    this.layer = 'street';
  }

  _createLayer(capacity) {
    const layer = new THREE.Group();
    for (const part of PARTS) {
      const mesh = new THREE.InstancedMesh(
        this.geometries[part],
        this.material,
        capacity,
      );
      mesh.name = `crowd-${part}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = capacity;
      layer.add(mesh);
    }

    const joints = new THREE.InstancedMesh(
      this.geometries.joint,
      this.material,
      capacity * JOINT_COUNT,
    );
    joints.name = 'crowd-joints';
    joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    joints.frustumCulled = false;
    joints.count = capacity * JOINT_COUNT;
    layer.add(joints);

    return layer;
  }

  _tint() {
    for (const layer of [this.streetGroup, this.dockGroup]) {
      for (const mesh of layer.children) {
        const capacity = mesh.count;
        for (let index = 0; index < capacity; index += 1) {
          const shade = 0.012 + (index % 7) * 0.0016;
          this._color.setRGB(shade, shade * 1.1, shade * 1.6);
          mesh.setColorAt(index, this._color);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  update(dt, camera, time = 0) {
    this.layer = camera.y > CROWD_VISIBLE_HEIGHT ? 'dock' : 'street';
    this.model.update(dt, camera, 'street');
    this.model.update(dt, camera, 'dock');
    this._render(this.model.street, this.streetGroup.children, time);
    this._render(this.model.dock, this.dockGroup.children, time);
  }

  _render(people, meshes, time) {
    for (let index = 0; index < people.length; index += 1) {
      const person = people[index];
      const scale = person.active ? person.fade : 0;
      const jointMesh = meshes[PARTS.length];
      const jointBase = index * JOINT_COUNT;
      if (scale <= 0.001) {
        for (let part = 0; part < PARTS.length; part += 1) {
          meshes[part].setMatrixAt(index, this._zero);
        }
        for (let joint = 0; joint < JOINT_COUNT; joint += 1) {
          jointMesh.setMatrixAt(jointBase + joint, this._zero);
        }
        continue;
      }

      const walking =
        person.state === 'walk' ||
        person.state === 'gather' ||
        person.state === 'board' ||
        person.state === 'exitShip' ||
        person.state === 'enterBuilding' ||
        person.state === 'leaveBuilding';
      const swing = walking ? Math.sin(person.phase) : 0;
      let armL = walking ? -swing * 0.45 : 0;
      let armR = walking ? swing * 0.45 : 0;
      let elbowL = -0.18;
      let elbowR = -0.18;
      let legL = swing * 0.55;
      let legR = -swing * 0.55;
      let kneeL = Math.max(0, -swing) * 0.85;
      let kneeR = Math.max(0, swing) * 0.85;

      if (person.state === 'point') {
        armR = -1.35;
        elbowR = -0.05;
      } else if (person.state === 'talk') {
        armL = -0.85 + Math.sin(time * 6 + person.phase) * 0.4;
        armR = -0.85 + Math.sin(time * 6 + person.phase + 1.7) * 0.4;
        elbowL = -0.9 + Math.sin(time * 6.5 + person.phase) * 0.45;
        elbowR = -0.9 + Math.sin(time * 6.5 + person.phase + 1.2) * 0.45;
      }

      const bob = walking ? Math.abs(swing) * 0.035 : 0;
      const cos = Math.cos(person.heading);
      const sin = Math.sin(person.heading);
      const elbowYL = SHOULDER_Y - UPPER_ARM * Math.cos(armL);
      const elbowZL = -UPPER_ARM * Math.sin(armL);
      const elbowYR = SHOULDER_Y - UPPER_ARM * Math.cos(armR);
      const elbowZR = -UPPER_ARM * Math.sin(armR);
      const kneeYL = HIP_Y - THIGH * Math.cos(legL);
      const kneeZL = -THIGH * Math.sin(legL);
      const kneeYR = HIP_Y - THIGH * Math.cos(legR);
      const kneeZR = -THIGH * Math.sin(legR);

      this._write(meshes[0], index, person, 0, 1.12, 0, 0, scale, bob, cos, sin);
      this._write(meshes[1], index, person, 0, 1.62, 0, 0, scale, bob, cos, sin);
      this._write(meshes[2], index, person, -0.26, SHOULDER_Y, 0, armL, scale, bob, cos, sin);
      this._write(meshes[3], index, person, -0.26, elbowYL, elbowZL, armL + elbowL, scale, bob, cos, sin);
      this._write(meshes[4], index, person, 0.26, SHOULDER_Y, 0, armR, scale, bob, cos, sin);
      this._write(meshes[5], index, person, 0.26, elbowYR, elbowZR, armR + elbowR, scale, bob, cos, sin);
      this._write(meshes[6], index, person, -0.1, HIP_Y, 0, legL, scale, bob, cos, sin);
      this._write(meshes[7], index, person, -0.1, kneeYL, kneeZL, legL + kneeL, scale, bob, cos, sin);
      this._write(meshes[8], index, person, 0.1, HIP_Y, 0, legR, scale, bob, cos, sin);
      this._write(meshes[9], index, person, 0.1, kneeYR, kneeZR, legR + kneeR, scale, bob, cos, sin);

      this._writeJoint(jointMesh, jointBase, person, -0.26, SHOULDER_Y, 0, SHOULDER_RADIUS, scale, bob, cos, sin);
      this._writeJoint(jointMesh, jointBase + 1, person, -0.26, elbowYL, elbowZL, ELBOW_RADIUS, scale, bob, cos, sin);
      this._writeJoint(jointMesh, jointBase + 2, person, 0.26, SHOULDER_Y, 0, SHOULDER_RADIUS, scale, bob, cos, sin);
      this._writeJoint(jointMesh, jointBase + 3, person, 0.26, elbowYR, elbowZR, ELBOW_RADIUS, scale, bob, cos, sin);
      this._writeJoint(jointMesh, jointBase + 4, person, -0.1, HIP_Y, 0, HIP_RADIUS, scale, bob, cos, sin);
      this._writeJoint(jointMesh, jointBase + 5, person, -0.1, kneeYL, kneeZL, KNEE_RADIUS, scale, bob, cos, sin);
      this._writeJoint(jointMesh, jointBase + 6, person, 0.1, HIP_Y, 0, HIP_RADIUS, scale, bob, cos, sin);
      this._writeJoint(jointMesh, jointBase + 7, person, 0.1, kneeYR, kneeZR, KNEE_RADIUS, scale, bob, cos, sin);
    }

    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  _write(mesh, index, person, localX, localY, localZ, pitch, scale, bob, cos, sin) {
    this._dummy.position.set(
      person.x + (localX * cos + localZ * sin) * scale,
      person.y + (localY + bob) * scale,
      person.z + (-localX * sin + localZ * cos) * scale,
    );
    this._dummy.rotation.set(pitch, person.heading, 0, 'YXZ');
    this._dummy.scale.setScalar(scale);
    this._dummy.updateMatrix();
    mesh.setMatrixAt(index, this._dummy.matrix);
  }

  _writeJoint(mesh, index, person, localX, localY, localZ, radius, scale, bob, cos, sin) {
    this._dummy.position.set(
      person.x + (localX * cos + localZ * sin) * scale,
      person.y + (localY + bob) * scale,
      person.z + (-localX * sin + localZ * cos) * scale,
    );
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.scale.setScalar(radius * scale);
    this._dummy.updateMatrix();
    mesh.setMatrixAt(index, this._dummy.matrix);
  }

  dispose() {
    for (const geometry of new Set(Object.values(this.geometries))) {
      geometry.dispose();
    }
    this.material.dispose();
    this.group.clear();
    this.streetGroup.clear();
    this.dockGroup.clear();
  }
}
