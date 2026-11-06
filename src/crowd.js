import * as THREE from 'three';
import { PALETTE } from './config.js';
import { CROWD_VISIBLE_HEIGHT, CrowdModel } from './crowdModel.js';

const NEON_COLORS = [
  ...PALETTE.map((entry) => entry.tint),
  0x7dff5a,
  0xff4d4d,
  0x5f8bff,
  0xf2f0ff,
];

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
const PART_BRIGHTNESS = [1, 1, 0.7, 0.55, 0.7, 0.55, 0.7, 0.55, 0.7, 0.55];
const JOINT_BRIGHTNESS = 0.55;
const EYE_COUNT = 2;
const EYE_LIGHT_RADIUS = 0.022;
const EYE_DARK_RADIUS = 0.032;
const EYE_X = 0.052;
const EYE_Y = 1.65;
const EYE_LIGHT_Z = 0.132;
const EYE_DARK_Z = 0.138;
const EYE_LIGHT = 0xfff2c8;
const EYE_DARK = 0x000000;
const EYE_LIGHT_THRESHOLD = 0.5;
const BLINK_MIN_PERIOD = 3;
const BLINK_PERIOD_SPAN = 4;
const BLINK_DURATION = 0.12;
const BLINK_CLOSED = 0.12;
const BODY_Y = 1.12;
const STRIPE_SIDES = 2;
const STRIPE_Z = 0.134;
const STRIPE_ROLL = (22 * Math.PI) / 180;
const STRIPE_OFFSET_X = 0.03;
const STRIPE_OFFSET_Y = 0.12;
function blinkAmount(time, phase) {
  const period =
    BLINK_MIN_PERIOD + (phase / (Math.PI * 2)) * BLINK_PERIOD_SPAN;
  const local = (time + phase * 1.7) % period;
  return local < BLINK_DURATION ? BLINK_CLOSED : 1;
}

function ribbonGeometry(points) {
  const positions = [];
  const push = (x, y) => positions.push(x, y, 0);
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const nx = (-dy / length) * 0.5;
    const ny = (dx / length) * 0.5;
    const aTop = [x1 + nx, y1 + ny];
    const aBottom = [x1 - nx, y1 - ny];
    const bTop = [x2 + nx, y2 + ny];
    const bBottom = [x2 - nx, y2 - ny];
    push(...aBottom);
    push(...bTop);
    push(...aTop);
    push(...aBottom);
    push(...bBottom);
    push(...bTop);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const normals = new Float32Array(positions.length);
  for (let index = 2; index < normals.length; index += 3) normals[index] = 1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

function arcPath() {
  const points = [];
  for (let step = 0; step <= 10; step += 1) {
    const angle = -1.05 + (2.1 * step) / 10;
    points.push([2.4 * Math.sin(angle), 0.9 * Math.cos(angle) - 0.4]);
  }
  return points;
}

function wavePath() {
  const points = [];
  for (let step = 0; step <= 10; step += 1) {
    const x = -2.55 + (5.1 * step) / 10;
    points.push([x, 0.55 * Math.sin((x / 2.55) * Math.PI * 1.5)]);
  }
  return points;
}

const STRIPE_PATHS = [
  [
    [-2.55, -0.15],
    [-1.3, 0.5],
    [0, -0.5],
    [1.3, 0.5],
    [2.55, -0.15],
  ],
  arcPath(),
  wavePath(),
];

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
    stripe0: ribbonGeometry(STRIPE_PATHS[0]),
    stripe1: ribbonGeometry(STRIPE_PATHS[1]),
    stripe2: ribbonGeometry(STRIPE_PATHS[2]),
  };
}

export class Crowd {
  constructor({
    rng = Math.random,
    streetCapacity = 160,
    dockCapacity = 24,
  } = {}) {
    this.rng = rng;
    this.model = new CrowdModel({ rng, streetCapacity, dockCapacity });
    this.capacities = { street: streetCapacity, dock: dockCapacity };

    this.group = new THREE.Group();
    this.group.name = 'crowd';

    this.geometries = createGeometries();
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
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

    const eyes = new THREE.InstancedMesh(
      this.geometries.joint,
      this.material,
      capacity * EYE_COUNT,
    );
    eyes.name = 'crowd-eyes';
    eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    eyes.frustumCulled = false;
    eyes.count = capacity * EYE_COUNT;
    layer.add(eyes);

    for (let shape = 0; shape < STRIPE_PATHS.length; shape += 1) {
      const stripe = new THREE.InstancedMesh(
        this.geometries[`stripe${shape}`],
        this.material,
        capacity * STRIPE_SIDES,
      );
      stripe.name = `crowd-stripe-${shape}`;
      stripe.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      stripe.frustumCulled = false;
      stripe.count = capacity * STRIPE_SIDES;
      layer.add(stripe);
    }

    return layer;
  }

  _tint() {
    this.eyeStyles = { street: [], dock: [] };
    this.stripeStyles = { street: [], dock: [] };
    const layers = [
      ['street', this.streetGroup],
      ['dock', this.dockGroup],
    ];
    for (const [key, layer] of layers) {
      const capacity = layer.children[0].count;
      const colors = Array.from(
        { length: capacity },
        () => NEON_COLORS[Math.floor(this.rng() * NEON_COLORS.length)],
      );
      const eyeStyles = colors.map((hex) => {
        this._color.setHex(hex);
        const luminance =
          0.2126 * this._color.r +
          0.7152 * this._color.g +
          0.0722 * this._color.b;
        return luminance > EYE_LIGHT_THRESHOLD
          ? { color: EYE_DARK, radius: EYE_DARK_RADIUS, z: EYE_DARK_Z }
          : { color: EYE_LIGHT, radius: EYE_LIGHT_RADIUS, z: EYE_LIGHT_Z };
      });
      this.eyeStyles[key] = eyeStyles;
      const stripeStyles = eyeStyles.map((eye) => ({
        shape: Math.floor(this.rng() * STRIPE_PATHS.length),
        roll: (this.rng() * 2 - 1) * STRIPE_ROLL,
        offsetX: (this.rng() * 2 - 1) * STRIPE_OFFSET_X,
        offsetY: (this.rng() * 2 - 1) * STRIPE_OFFSET_Y,
        size: eye.radius * 2,
      }));
      this.stripeStyles[key] = stripeStyles;
      for (let child = 0; child < layer.children.length; child += 1) {
        const mesh = layer.children[child];
        const joints = child === PARTS.length;
        for (let index = 0; index < mesh.count; index += 1) {
          if (child < PARTS.length) {
            const person = index % capacity;
            this._color.setHex(colors[person]);
            this._color.multiplyScalar(PART_BRIGHTNESS[child]);
          } else if (joints) {
            const person = Math.floor(index / JOINT_COUNT) % capacity;
            this._color.setHex(colors[person]);
            this._color.multiplyScalar(JOINT_BRIGHTNESS);
          } else {
            const person = Math.floor(index / STRIPE_SIDES) % capacity;
            this._color.setHex(eyeStyles[person].color);
          }
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
    this._render(
      this.model.street,
      this.streetGroup.children,
      time,
      this.eyeStyles.street,
      this.stripeStyles.street,
    );
    this._render(
      this.model.dock,
      this.dockGroup.children,
      time,
      this.eyeStyles.dock,
      this.stripeStyles.dock,
    );
  }

  _render(people, meshes, time, eyeStyles, stripeStyles) {
    for (let index = 0; index < people.length; index += 1) {
      const person = people[index];
      const scale = person.active ? person.fade : 0;
      const jointMesh = meshes[PARTS.length];
      const jointBase = index * JOINT_COUNT;
      const eyeMesh = meshes[PARTS.length + 1];
      const eyeBase = index * EYE_COUNT;
      const stripeBase = index * STRIPE_SIDES;
      if (scale <= 0.001) {
        for (let part = 0; part < PARTS.length; part += 1) {
          meshes[part].setMatrixAt(index, this._zero);
        }
        for (let joint = 0; joint < JOINT_COUNT; joint += 1) {
          jointMesh.setMatrixAt(jointBase + joint, this._zero);
        }
        for (let eye = 0; eye < EYE_COUNT; eye += 1) {
          eyeMesh.setMatrixAt(eyeBase + eye, this._zero);
        }
        for (let shape = 0; shape < STRIPE_PATHS.length; shape += 1) {
          const stripeMesh = meshes[PARTS.length + 2 + shape];
          stripeMesh.setMatrixAt(stripeBase, this._zero);
          stripeMesh.setMatrixAt(stripeBase + 1, this._zero);
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

      const blink = blinkAmount(time, person.phase);
      const eye = eyeStyles[index];
      this._writeJoint(eyeMesh, eyeBase, person, -EYE_X, EYE_Y, eye.z, eye.radius, scale, bob, cos, sin, blink);
      this._writeJoint(eyeMesh, eyeBase + 1, person, EYE_X, EYE_Y, eye.z, eye.radius, scale, bob, cos, sin, blink);

      const stripe = stripeStyles[index];
      for (let shape = 0; shape < STRIPE_PATHS.length; shape += 1) {
        const stripeMesh = meshes[PARTS.length + 2 + shape];
        if (shape !== stripe.shape) {
          stripeMesh.setMatrixAt(stripeBase, this._zero);
          stripeMesh.setMatrixAt(stripeBase + 1, this._zero);
          continue;
        }
        this._writeStripe(
          stripeMesh,
          stripeBase,
          person,
          stripe.offsetX,
          BODY_Y + stripe.offsetY,
          STRIPE_Z,
          person.heading,
          stripe.roll,
          stripe.size,
          scale,
          bob,
          cos,
          sin,
        );
        this._writeStripe(
          stripeMesh,
          stripeBase + 1,
          person,
          stripe.offsetX,
          BODY_Y + stripe.offsetY,
          -STRIPE_Z,
          person.heading + Math.PI,
          -stripe.roll,
          stripe.size,
          scale,
          bob,
          cos,
          sin,
        );
      }
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

  _writeJoint(mesh, index, person, localX, localY, localZ, radius, scale, bob, cos, sin, squash = 1) {
    this._dummy.position.set(
      person.x + (localX * cos + localZ * sin) * scale,
      person.y + (localY + bob) * scale,
      person.z + (-localX * sin + localZ * cos) * scale,
    );
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.scale.set(radius * scale, radius * scale * squash, radius * scale);
    this._dummy.updateMatrix();
    mesh.setMatrixAt(index, this._dummy.matrix);
  }

  _writeStripe(mesh, index, person, localX, localY, localZ, yaw, roll, size, scale, bob, cos, sin) {
    this._dummy.position.set(
      person.x + (localX * cos + localZ * sin) * scale,
      person.y + (localY + bob) * scale,
      person.z + (-localX * sin + localZ * cos) * scale,
    );
    this._dummy.rotation.set(0, yaw, roll, 'YXZ');
    this._dummy.scale.setScalar(size * scale);
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
