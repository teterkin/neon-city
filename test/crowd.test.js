import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
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
  assert.equal(crowd.streetGroup.children.length, 15);
  assert.equal(crowd.dockGroup.children.length, 15);
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

test('crowd eyes sit on the face and turn with the heading', () => {
  const crowd = new Crowd({
    rng: mulberry32(23),
    streetCapacity: 8,
    dockCapacity: 0,
  });
  crowd.update(1 / 30, camera(3.2), 0);

  const eyes = crowd.streetGroup.children[11];
  const matrices = eyes.instanceMatrix.array;
  const position = (index) => ({
    x: matrices[index * 16 + 12],
    y: matrices[index * 16 + 13],
    z: matrices[index * 16 + 14],
  });
  const index = crowd.model.street.findIndex(
    (person, slot) => {
      if (!person.active || person.fade <= 0.5) return false;
      const bodies = crowd.streetGroup.children[0].instanceColor;
      const luminance =
        0.2126 * bodies.getX(slot) +
        0.7152 * bodies.getY(slot) +
        0.0722 * bodies.getZ(slot);
      return luminance <= 0.5;
    },
  );
  assert.ok(index >= 0);
  const person = crowd.model.street[index];
  person.state = 'browse';
  person.timer = 100;
  person.fade = 1;

  const close = (actual, expected) => Math.abs(actual - expected) < 1e-4;
  const faceRadius = Math.hypot(0.052, 0.132);

  person.heading = 0;
  crowd.update(1 / 30, camera(3.2), 1);
  let left = position(index * 2);
  let right = position(index * 2 + 1);
  assert.ok(close(left.x - person.x, -0.052), 'left eye is on the left cheek');
  assert.ok(close(right.x - person.x, 0.052), 'right eye is on the right cheek');
  assert.ok(close(left.z - person.z, 0.132), 'eyes look along +Z');
  assert.ok(close(right.z - person.z, 0.132), 'both eyes look along +Z');
  assert.ok(close(left.y - person.y, 1.65), 'eyes sit on the head');
  assert.ok(close(Math.hypot(left.x - person.x, left.z - person.z), faceRadius));

  person.heading = Math.PI / 2;
  crowd.update(1 / 30, camera(3.2), 2);
  left = position(index * 2);
  right = position(index * 2 + 1);
  assert.ok(close(left.x - person.x, 0.132), 'eyes look along +X after turning');
  assert.ok(close(left.z - person.z, 0.052), 'left eye trails on +Z after turning');
  assert.ok(close(right.z - person.z, -0.052), 'right eye trails on -Z after turning');

  crowd.dispose();
});

test('crowd eyes blink now and then', () => {
  const crowd = new Crowd({
    rng: mulberry32(31),
    streetCapacity: 12,
    dockCapacity: 0,
  });
  const eyes = crowd.streetGroup.children[11];
  const matrices = eyes.instanceMatrix.array;

  let open = 0;
  let closed = 0;
  for (let step = 0; step < 15 * 30; step += 1) {
    crowd.update(1 / 30, camera(3.2), step / 30);
    for (let index = 0; index < eyes.count; index += 1) {
      const base = index * 16;
      const scaleX = Math.hypot(
        matrices[base],
        matrices[base + 1],
        matrices[base + 2],
      );
      if (scaleX === 0) continue;
      const scaleY = Math.hypot(
        matrices[base + 4],
        matrices[base + 5],
        matrices[base + 6],
      );
      const ratio = scaleY / scaleX;
      if (ratio > 0.99) open += 1;
      if (ratio < 0.2) closed += 1;
    }
  }

  assert.ok(open > 0, 'eyes are open most of the time');
  assert.ok(closed > 0, 'somebody blinks within fifteen seconds');
  assert.ok(open > closed * 10, 'blinking is rare');

  crowd.dispose();
});

test('crowd dresses every person with one stripe front and back', () => {
  const crowd = new Crowd({
    rng: mulberry32(43),
    streetCapacity: 12,
    dockCapacity: 2,
  });

  assert.equal(crowd.streetGroup.children.length, 15);
  const stripes = [0, 1, 2].map((shape) => {
    const stripe = crowd.streetGroup.children[12 + shape];
    assert.equal(stripe.name, `crowd-stripe-${shape}`);
    assert.equal(stripe.count, 24);
    assert.equal(crowd.dockGroup.children[12 + shape].count, 4);
    return stripe;
  });

  const hidden = (mesh, index) => {
    const matrix = mesh.instanceMatrix.array.slice(index * 16, index * 16 + 16);
    return [0, 5, 10, 12, 13, 14].every((slot) => matrix[slot] === 0);
  };
  for (const stripe of stripes) {
    assert.ok(hidden(stripe, 0), 'stripes stay hidden before the first update');
  }

  crowd.update(1 / 30, camera(3.2), 0);
  const index = crowd.model.street.findIndex(
    (person) => person.active && person.fade > 0.5,
  );
  assert.ok(index >= 0, 'somebody is walking');

  const visible = stripes.filter((stripe) => !hidden(stripe, index * 2));
  assert.equal(visible.length, 1, 'exactly one shape per person');
  assert.ok(!hidden(visible[0], index * 2 + 1), 'the back copy is drawn too');

  crowd.dispose();
});

test('crowd stripes vary in tilt and height', () => {
  const crowd = new Crowd({
    rng: mulberry32(53),
    streetCapacity: 24,
    dockCapacity: 0,
  });
  crowd.update(1 / 30, camera(3.2), 0);
  for (const walker of crowd.model.street) {
    if (!walker.active) continue;
    walker.state = 'browse';
    walker.timer = 100;
    walker.fade = 1;
  }
  crowd.update(1 / 30, camera(3.2), 1);

  const stripes = [0, 1, 2].map((shape) =>
    crowd.streetGroup.children[12 + shape],
  );
  let tilted = 0;
  let shifted = 0;
  for (let person = 0; person < 24; person += 1) {
    const walker = crowd.model.street[person];
    if (!walker.active || walker.fade < 0.99) continue;
    const shape = stripes.findIndex((stripe) => {
      const base = person * 2 * 16;
      return Math.hypot(
        stripe.instanceMatrix.array[base],
        stripe.instanceMatrix.array[base + 1],
        stripe.instanceMatrix.array[base + 2],
      ) > 0;
    });
    if (shape < 0) continue;
    const matrix = stripes[shape].instanceMatrix.array;
    const front = person * 2 * 16;
    const back = (person * 2 + 1) * 16;
    if (Math.abs(matrix[front + 1]) > 0.01) tilted += 1;
    if (Math.abs(matrix[front + 13] - walker.y - 1.12) > 0.01) shifted += 1;
    assert.ok(
      Math.abs(matrix[front + 13] - matrix[back + 13]) < 1e-4,
      'front and back stripes share the height',
    );
  }

  assert.ok(tilted > 0, 'some stripes are tilted');
  assert.ok(shifted > 0, 'some stripes sit off centre');

  crowd.dispose();
});

test('crowd stripes match the eyes in color and width', () => {
  const crowd = new Crowd({
    rng: mulberry32(47),
    streetCapacity: 24,
    dockCapacity: 0,
  });
  crowd.update(1 / 30, camera(3.2), 0);

  const bodies = crowd.streetGroup.children[0].instanceColor;
  const eyes = crowd.streetGroup.children[11];
  const stripes = [0, 1, 2].map((shape) =>
    crowd.streetGroup.children[12 + shape],
  );
  const close = (actual, expected) => Math.abs(actual - expected) < 1e-4;

  for (let person = 0; person < 24; person += 1) {
    const walker = crowd.model.street[person];
    if (!walker.active || walker.fade < 0.99) continue;
    const shape = stripes.findIndex((stripe) => {
      const base = person * 2 * 16;
      return Math.hypot(
        stripe.instanceMatrix.array[base],
        stripe.instanceMatrix.array[base + 1],
        stripe.instanceMatrix.array[base + 2],
      ) > 0;
    });
    assert.ok(shape >= 0, 'each active person has a stripe');

    const luminance =
      0.2126 * bodies.getX(person) +
      0.7152 * bodies.getY(person) +
      0.0722 * bodies.getZ(person);
    const size = luminance > 0.5 ? 0.064 : 0.044;
    const eyeColor = [
      eyes.instanceColor.getX(person * 2),
      eyes.instanceColor.getY(person * 2),
      eyes.instanceColor.getZ(person * 2),
    ];

    for (const side of [0, 1]) {
      const base = (person * 2 + side) * 16;
      const matrix = stripes[shape].instanceMatrix.array;
      const stripe = stripes[shape];
      assert.ok(
        close(Math.hypot(matrix[base], matrix[base + 1], matrix[base + 2]), size),
        'stripe width follows the eye size',
      );
      assert.ok(
        close(stripe.instanceColor.getX(person * 2 + side), eyeColor[0]),
        'stripe color matches the eyes',
      );
      assert.ok(close(stripe.instanceColor.getY(person * 2 + side), eyeColor[1]));
      assert.ok(close(stripe.instanceColor.getZ(person * 2 + side), eyeColor[2]));
    }
  }

  crowd.dispose();
});

test('crowd dark eyes are larger and sit further out', () => {
  const crowd = new Crowd({
    rng: mulberry32(41),
    streetCapacity: 24,
    dockCapacity: 0,
  });
  crowd.update(1 / 30, camera(3.2), 0);

  const bodies = crowd.streetGroup.children[0].instanceColor;
  const eyes = crowd.streetGroup.children[11];
  const matrices = eyes.instanceMatrix.array;
  const luminance = (person) =>
    0.2126 * bodies.getX(person) +
    0.7152 * bodies.getY(person) +
    0.0722 * bodies.getZ(person);

  let lightPerson = -1;
  let darkPerson = -1;
  for (let person = 0; person < 24; person += 1) {
    if (crowd.model.street[person].fade < 0.99) continue;
    if (luminance(person) > 0.5 && lightPerson < 0) lightPerson = person;
    if (luminance(person) <= 0.5 && darkPerson < 0) darkPerson = person;
  }
  assert.ok(lightPerson >= 0, 'a light-bodied person exists');
  assert.ok(darkPerson >= 0, 'a dark-bodied person exists');

  const style = (person) => {
    const base = person * 2 * 16;
    const head = crowd.streetGroup.children[1];
    const scale = Math.hypot(
      matrices[base],
      matrices[base + 1],
      matrices[base + 2],
    );
    const dx = matrices[base + 12] - head.instanceMatrix.array[person * 16 + 12];
    const dz = matrices[base + 14] - head.instanceMatrix.array[person * 16 + 14];
    return { scale, reach: Math.hypot(dx, dz) };
  };

  const close = (actual, expected) => Math.abs(actual - expected) < 1e-4;
  const light = style(lightPerson);
  const dark = style(darkPerson);
  assert.ok(close(light.scale, 0.032), 'dark eyes on light bodies are bigger');
  assert.ok(close(dark.scale, 0.022), 'warm eyes keep the small radius');
  assert.ok(close(light.reach, Math.hypot(0.052, 0.138)), 'dark eyes sit further out');
  assert.ok(close(dark.reach, Math.hypot(0.052, 0.132)), 'warm eyes keep the offset');

  crowd.dispose();
});

test('crowd dark eyes blink as well', () => {
  const crowd = new Crowd({
    rng: mulberry32(29),
    streetCapacity: 24,
    dockCapacity: 0,
  });
  const bodies = crowd.streetGroup.children[0].instanceColor;
  const eyes = crowd.streetGroup.children[11];
  const matrices = eyes.instanceMatrix.array;

  let lightPerson = -1;
  for (let person = 0; person < 24; person += 1) {
    const luminance =
      0.2126 * bodies.getX(person) +
      0.7152 * bodies.getY(person) +
      0.0722 * bodies.getZ(person);
    if (luminance > 0.5) {
      lightPerson = person;
      break;
    }
  }
  assert.ok(lightPerson >= 0, 'a light-bodied person exists');

  let closedFrames = 0;
  for (let step = 0; step < 15 * 30; step += 1) {
    crowd.update(1 / 30, camera(3.2), step / 30);
    const base = lightPerson * 2 * 16;
    const scaleX = Math.hypot(
      matrices[base],
      matrices[base + 1],
      matrices[base + 2],
    );
    if (scaleX === 0) continue;
    const scaleY = Math.hypot(
      matrices[base + 4],
      matrices[base + 5],
      matrices[base + 6],
    );
    if (scaleY / scaleX < 0.2) closedFrames += 1;
  }
  assert.ok(closedFrames > 0, 'the dark-eyed person blinks');

  crowd.dispose();
});

test('crowd eyes contrast with the body', () => {
  const crowd = new Crowd({
    rng: mulberry32(29),
    streetCapacity: 24,
    dockCapacity: 4,
  });
  const warm = new THREE.Color(0xfff2c8);
  const dark = new THREE.Color(0x000000);

  let lightBodies = 0;
  let darkBodies = 0;
  for (const layer of [crowd.streetGroup, crowd.dockGroup]) {
    const bodies = layer.children[0].instanceColor;
    const eyes = layer.children[11];
    for (let person = 0; person < layer.children[0].count; person += 1) {
      const luminance =
        0.2126 * bodies.getX(person) +
        0.7152 * bodies.getY(person) +
        0.0722 * bodies.getZ(person);
      const expected = luminance > 0.5 ? dark : warm;
      if (luminance > 0.5) lightBodies += 1;
      else darkBodies += 1;
      for (const eye of [person * 2, person * 2 + 1]) {
        assert.ok(Math.abs(eyes.instanceColor.getX(eye) - expected.r) < 1e-6);
        assert.ok(Math.abs(eyes.instanceColor.getY(eye) - expected.g) < 1e-6);
        assert.ok(Math.abs(eyes.instanceColor.getZ(eye) - expected.b) < 1e-6);
      }
    }
  }

  assert.ok(lightBodies > 0, 'some people are painted light');
  assert.ok(darkBodies > 0, 'some people are painted dark');

  crowd.dispose();
});

test('crowd gives every person a pair of eye instances', () => {
  const crowd = new Crowd({
    rng: mulberry32(17),
    streetCapacity: 12,
    dockCapacity: 4,
  });

  assert.equal(crowd.streetGroup.children.length, 15);
  assert.equal(crowd.dockGroup.children.length, 15);
  const eyes = crowd.streetGroup.children[11];
  assert.equal(eyes.name, 'crowd-eyes');
  assert.equal(eyes.count, 24);
  assert.equal(crowd.dockGroup.children[11].count, 8);

  const matrices = eyes.instanceMatrix.array;
  const eye = (index) => matrices.slice(index * 16, index * 16 + 16);
  const hidden = (index) =>
    [0, 5, 10, 12, 13, 14].every((slot) => eye(index)[slot] === 0);
  assert.ok(hidden(0), 'eyes stay hidden before the first update');

  crowd.update(1 / 30, camera(3.2), 0);
  const activeIndex = crowd.model.street.findIndex(
    (person) => person.active && person.fade > 0.5,
  );
  assert.ok(activeIndex >= 0, 'somebody is walking');
  assert.ok(!hidden(activeIndex * 2), 'left eye is written');
  assert.ok(!hidden(activeIndex * 2 + 1), 'right eye is written');

  const person = crowd.model.street[activeIndex];
  person.state = 'browse';
  person.timer = 100;
  person.fade = 0;
  crowd.update(1 / 30, camera(3.2), 1);
  assert.ok(hidden(activeIndex * 2), 'left eye hides with the body');
  assert.ok(hidden(activeIndex * 2 + 1), 'right eye hides with the body');

  crowd.dispose();
});

test('crowd paints every person with a random neon color', () => {
  const crowd = new Crowd({
    rng: mulberry32(5),
    streetCapacity: 24,
    dockCapacity: 4,
  });

  assert.equal(crowd.material.color.getHex(), 0xffffff);

  for (const mesh of crowd.streetGroup.children) {
    assert.ok(mesh.instanceColor, `${mesh.name} should have instance colors`);
  }

  const body = crowd.streetGroup.children[0];
  const head = crowd.streetGroup.children[1];
  for (let index = 0; index < 24; index += 1) {
    const rgb = body.instanceColor.array.slice(index * 3, index * 3 + 3);
    assert.deepEqual(
      Array.from(head.instanceColor.array.slice(index * 3, index * 3 + 3)),
      Array.from(rgb),
      'head and body of one person share the color',
    );
    assert.ok(Math.max(...rgb) >= 0.8, `person ${index} should glow`);
  }

  const hues = new Set();
  for (let index = 0; index < 24; index += 1) {
    hues.add(head.instanceColor.array.slice(index * 3, index * 3 + 3).join(','));
  }
  assert.ok(hues.size >= 3, 'neighbours should not all share one color');

  crowd.dispose();
});

test('crowd dims limbs and joints but keeps each neon hue', () => {
  const crowd = new Crowd({
    rng: mulberry32(11),
    streetCapacity: 16,
    dockCapacity: 0,
  });
  const body = crowd.streetGroup.children[0];
  const upperArm = crowd.streetGroup.children[2];
  const foreArm = crowd.streetGroup.children[3];
  const shin = crowd.streetGroup.children[7];
  const joints = crowd.streetGroup.children[10];

  const sample = (mesh, index) =>
    Array.from(mesh.instanceColor.array.slice(index * 3, index * 3 + 3));
  const peak = (rgb) => Math.max(...rgb);
  const hue = (rgb) => {
    const top = peak(rgb);
    return rgb.map((channel) => channel / top);
  };

  for (let index = 0; index < 16; index += 1) {
    const torso = sample(body, index);
    const arm = sample(upperArm, index);
    const forearm = sample(foreArm, index);
    const leg = sample(shin, index);
    const joint = sample(joints, index * 8);

    assert.ok(peak(arm) < peak(torso), 'upper arms are dimmer than the torso');
    assert.ok(peak(forearm) < peak(arm), 'forearms are dimmer than upper arms');
    assert.ok(peak(leg) < peak(torso), 'shins are dimmer than the torso');
    assert.ok(peak(joint) < peak(torso), 'joint caps are dimmer than the torso');

    for (const part of [arm, forearm, leg, joint]) {
      for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(
          Math.abs(hue(part)[channel] - hue(torso)[channel]) < 1e-6,
          'all parts keep the hue of the torso',
        );
      }
    }
  }

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
