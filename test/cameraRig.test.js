import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig } from '../src/cameraRig.js';

function makeRig() {
  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.5, 1600);
  const dom = {
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    classList: { add() {}, remove() {} },
  };
  return new CameraRig(camera, dom, { keyTarget: null });
}

test('arrow keys smoothly turn the camera and pitch it', () => {
  const rig = makeRig();
  assert.equal(rig.handleLookKey('ArrowLeft', true), true);
  rig.update(0.5);
  assert.ok(rig.targetYaw > 0, `targetYaw ${rig.targetYaw}`);
  assert.ok(rig.lookYaw > 0, `lookYaw ${rig.lookYaw}`);
  rig.handleLookKey('ArrowLeft', false);

  rig.handleLookKey('ArrowUp', true);
  rig.update(0.5);
  assert.ok(rig.targetPitch > 0, `targetPitch ${rig.targetPitch}`);
  assert.ok(rig.lookPitch > 0, `lookPitch ${rig.lookPitch}`);
  rig.handleLookKey('ArrowUp', false);
  rig.dispose();
});

test('opposite arrows cancel and other keys are ignored', () => {
  const rig = makeRig();
  assert.equal(rig.handleLookKey('KeyA', true), false);
  rig.handleLookKey('ArrowLeft', true);
  rig.handleLookKey('ArrowRight', true);
  rig.update(0.5);
  assert.ok(Math.abs(rig.targetYaw) < 1e-9, `targetYaw ${rig.targetYaw}`);
  assert.equal(rig.lookKeys.size, 2);
  rig.dispose();
});

test('arrow look is clamped per mode and returns to the course', () => {
  const rig = makeRig();
  rig.handleLookKey('ArrowLeft', true);
  rig.update(5);
  assert.ok(rig.targetYaw <= 2.4 + 1e-9 && rig.targetYaw > 1.5, `sky yaw ${rig.targetYaw}`);
  rig.handleLookKey('ArrowLeft', false);

  rig.update(2);
  assert.ok(rig.targetYaw < 0.2, `returning yaw ${rig.targetYaw}`);

  rig.handleLookKey('ArrowUp', true);
  rig.update(5);
  assert.ok(rig.targetPitch <= 0.45 + 1e-9 && rig.targetPitch > 0.3, `pitch ${rig.targetPitch}`);
  rig.handleLookKey('ArrowUp', false);

  rig.toggleMode();
  rig.handleLookKey('ArrowLeft', true);
  rig.update(5);
  assert.ok(
    rig.targetYaw <= 0.62 + 1e-9 && rig.targetYaw > 0.3,
    `street yaw ${rig.targetYaw}`,
  );
  rig.handleLookKey('ArrowLeft', false);
  rig.dispose();
});
