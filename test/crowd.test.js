import test from 'node:test';
import assert from 'node:assert/strict';
import { Crowd } from '../src/crowd.js';
import { mulberry32 } from '../src/noise.js';

function camera(y = 3.2) {
  return { x: 0, y, z: 0 };
}

test('crowd renders ten body parts and joint caps for one layer', () => {
  const crowd = new Crowd({
    rng: mulberry32(3),
    streetCapacity: 32,
    dockCapacity: 8,
  });

  assert.equal(crowd.group.name, 'crowd');
  assert.equal(crowd.streetGroup.children.length, 11);
  assert.equal(crowd.dockGroup.children.length, 11);
  for (const mesh of crowd.streetGroup.children.slice(0, 10)) {
    assert.equal(mesh.count, 32);
  }
  const streetJoints = crowd.streetGroup.children[10];
  assert.equal(streetJoints.name, 'crowd-joints');
  assert.equal(streetJoints.count, 32 * 8);
  const dockJoints = crowd.dockGroup.children[10];
  assert.equal(dockJoints.count, 8 * 8);

  crowd.update(1 / 30, camera(3.2), 1);
  assert.equal(crowd.layer, 'street');
  assert.equal(crowd.streetGroup.visible, true);
  assert.equal(crowd.dockGroup.visible, true);
  assert.ok(crowd.model.street.some((person) => person.active));
  const streetMatrix = crowd.streetGroup.children[0].instanceMatrix.array;
  assert.ok(streetMatrix.some((value) => value !== 0), 'street matrices written');

  crowd.update(1 / 30, camera(96), 2);
  assert.equal(crowd.layer, 'dock');
  assert.equal(crowd.streetGroup.visible, true);
  assert.equal(crowd.dockGroup.visible, true);
  assert.ok(crowd.model.dock.some((person) => person.active));
  assert.ok(crowd.model.street.some((person) => person.active));
  const dockMatrix = crowd.dockGroup.children[0].instanceMatrix.array;
  assert.ok(dockMatrix.some((value) => value !== 0), 'dock matrices written');

  for (let step = 0; step < 20 * 30; step += 1) {
    crowd.update(1 / 30, camera(96), 2 + step / 30);
  }
  for (const mesh of crowd.dockGroup.children.slice(0, 10)) {
    assert.equal(mesh.count, 8);
  }
  assert.equal(crowd.dockGroup.children[10].count, 8 * 8);
  crowd.dispose();
});

test('crowd limbs bend at elbows and knees', () => {
  const crowd = new Crowd({
    rng: mulberry32(9),
    streetCapacity: 12,
    dockCapacity: 0,
  });
  crowd.update(1 / 30, camera(3.2), 0);
  const forearm = crowd.streetGroup.children[3];
  const shin = crowd.streetGroup.children[7];
  const beforeArm = Float32Array.from(forearm.instanceMatrix.array);
  const beforeLeg = Float32Array.from(shin.instanceMatrix.array);
  for (let step = 1; step < 30; step += 1) {
    crowd.update(1 / 30, camera(3.2), step / 30);
  }
  const armChanged = forearm.instanceMatrix.array.some(
    (value, index) => Math.abs(value - beforeArm[index]) > 1e-4,
  );
  const legChanged = shin.instanceMatrix.array.some(
    (value, index) => Math.abs(value - beforeLeg[index]) > 1e-4,
  );
  assert.ok(armChanged, 'forearm matrices should animate');
  assert.ok(legChanged, 'shin matrices should animate');
  crowd.dispose();
});

test('joint caps fill seams and follow the bodies', () => {
  const crowd = new Crowd({
    rng: mulberry32(13),
    streetCapacity: 16,
    dockCapacity: 0,
  });
  crowd.update(1 / 30, camera(3.2), 0);
  const joints = crowd.streetGroup.children[10];
  assert.equal(joints.name, 'crowd-joints');
  assert.equal(joints.count, 16 * 8);

  const before = Float32Array.from(joints.instanceMatrix.array);
  assert.ok(before.some((value) => value !== 0), 'joint matrices should be written');
  for (let step = 1; step < 30; step += 1) {
    crowd.update(1 / 30, camera(3.2), step / 30);
  }
  const changed = joints.instanceMatrix.array.some(
    (value, index) => Math.abs(value - before[index]) > 1e-4,
  );
  assert.ok(changed, 'joint caps should move with the walk cycle');
  crowd.dispose();
});
