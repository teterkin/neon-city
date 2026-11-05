import * as THREE from 'three';
import {
  SKY_HEIGHT,
  SKY_SPEED,
  STREET_HEIGHT,
  STREET_SPEED,
} from './config.js';
import { avenueCenterX } from './layout.js';
import { mulberry32 } from './noise.js';
import { StreetNav, wrapAngle } from './streetNav.js';

const BASE_YAW = Math.PI;
const SKY_PITCH = -0.24;
const STREET_PITCH = -0.015;
const DRAG_YAW = 0.0042;
const DRAG_PITCH = 0.0032;
const LOOK_YAW_RATE = 1.6;
const LOOK_PITCH_RATE = 0.9;
const PITCH_MIN = -0.5;
const PITCH_MAX = 0.45;
const SKY_YAW_LIMIT = 2.4;
const STREET_YAW_LIMIT = 0.62;
const LOOK_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export class CameraRig {
  constructor(camera, domElement, { keyTarget = typeof window !== 'undefined' ? window : null } = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.keyTarget = keyTarget;
    this.mode = 'sky';
    this.x = avenueCenterX(0);
    this.z = 0;
    this.height = SKY_HEIGHT;
    this.speed = SKY_SPEED;
    this.targetSpeed = null;
    this.heading = 0;
    this.roll = 0;
    this.turnChance = null;
    this.turnFlashUntil = 0;
    this.lastTurnDirection = 0;
    this.nav = null;

    this.lookYaw = 0;
    this.lookPitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.lookKeys = new Set();

    this.dragging = false;
    this.pointerId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.idleTime = 0;

    this.onModeChange = null;
    this.onLook = null;

    this._bind();
    this._apply();
  }

  toggleMode() {
    if (this.mode === 'street') {
      if (this.nav) {
        this.nav.completeTurn();
        this.x = this.nav.x;
        this.z = this.nav.z;
        this.heading = this.nav.heading;
        this.nav = null;
      }
      this.mode = 'sky';
    } else {
      this.mode = 'street';
      this.roll = 0;
      this.nav = new StreetNav({
        x: this.x,
        z: this.z,
        heading: this.heading,
        rng: mulberry32((Math.random() * 0x7fffffff) | 0),
        turnChance: this.turnChance,
      });
    }
    this.targetYaw = 0;
    this.targetPitch = 0;
    if (this.onModeChange) this.onModeChange(this.mode);
  }

  setTurnChance(chance) {
    this.turnChance = chance;
    if (this.nav) this.nav.turnChance = chance;
  }

  get pitch() {
    const base = this.mode === 'sky' ? SKY_PITCH : STREET_PITCH;
    const portraitTilt = this.camera.aspect < 1 ? -0.07 : 0;
    return base + portraitTilt + this.lookPitch;
  }

  get yawLimit() {
    return this.mode === 'street' ? STREET_YAW_LIMIT : SKY_YAW_LIMIT;
  }

  handleLookKey(code, pressed) {
    if (!LOOK_CODES.has(code)) return false;
    if (pressed) {
      this.lookKeys.add(code);
      this.idleTime = 0;
    } else {
      this.lookKeys.delete(code);
    }
    return true;
  }

  resetLook() {
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.idleTime = 0;
  }

  update(dt) {
    const portrait = this.camera.aspect < 1;
    const targetHeight =
      this.mode === 'sky' ? (portrait ? 74 : SKY_HEIGHT) : STREET_HEIGHT;
    const targetSpeed =
      this.targetSpeed ?? (this.mode === 'sky' ? SKY_SPEED : STREET_SPEED);
    this.height = damp(this.height, targetHeight, 2.1, dt);
    this.speed = damp(this.speed, targetSpeed, 1.6, dt);

    if (this.mode === 'street' && this.nav) {
      const previousHeading = this.heading;
      const state = this.nav.update(dt, this.speed);
      this.x = state.x;
      this.z = state.z;
      this.heading = state.heading;

      if (state.turned) {
        this.turnFlashUntil = performance.now() + 1300;
        this.lastTurnDirection = this.nav.lastTurnDirection;
      }

      const headingRate =
        dt > 0 ? wrapAngle(this.heading - previousHeading) / dt : 0;
      const targetRoll = THREE.MathUtils.clamp(-headingRate * 0.04, -0.22, 0.22);
      this.roll = damp(this.roll, targetRoll, 6, dt);
    } else {
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      this.roll = damp(this.roll, 0, 5, dt);
    }

    const yawInput =
      (this.lookKeys.has('ArrowLeft') ? 1 : 0)
      - (this.lookKeys.has('ArrowRight') ? 1 : 0);
    const pitchInput =
      (this.lookKeys.has('ArrowUp') ? 1 : 0)
      - (this.lookKeys.has('ArrowDown') ? 1 : 0);

    if (yawInput !== 0 || pitchInput !== 0) {
      this.idleTime = 0;
      const limit = this.yawLimit;
      this.targetYaw = THREE.MathUtils.clamp(
        this.targetYaw + yawInput * LOOK_YAW_RATE * dt,
        -limit,
        limit,
      );
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch + pitchInput * LOOK_PITCH_RATE * dt,
        PITCH_MIN,
        PITCH_MAX,
      );
      if (this.onLook) this.onLook();
    }

    if (!this.dragging && this.lookKeys.size === 0) {
      this.idleTime += dt;
      if (this.idleTime > 1.4) {
        this.targetYaw = damp(this.targetYaw, 0, 1.4, dt);
        this.targetPitch = damp(this.targetPitch, 0, 1.4, dt);
      }
    }

    this.lookYaw = damp(this.lookYaw, this.targetYaw, 9, dt);
    this.lookPitch = damp(this.lookPitch, this.targetPitch, 9, dt);
    this._apply();
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    if (this.keyTarget) {
      this.keyTarget.removeEventListener('keydown', this._onKeyDown);
      this.keyTarget.removeEventListener('keyup', this._onKeyUp);
      this.keyTarget.removeEventListener('blur', this._onBlur);
    }
  }

  _apply() {
    this.camera.position.set(this.x, this.height, this.z);
    this.camera.rotation.set(
      this.pitch,
      BASE_YAW + this.heading + this.lookYaw,
      this.roll,
      'YXZ',
    );
  }

  _bind() {
    this._onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.idleTime = 0;
      this.domElement.setPointerCapture?.(event.pointerId);
      this.domElement.classList.add('dragging');
    };

    this._onPointerMove = (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.idleTime = 0;

      const maxYaw = this.yawLimit;
      this.targetYaw = THREE.MathUtils.clamp(this.targetYaw - dx * DRAG_YAW, -maxYaw, maxYaw);
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch - dy * DRAG_PITCH,
        PITCH_MIN,
        PITCH_MAX,
      );
      if (this.onLook) this.onLook();
    };

    this._onPointerUp = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = null;
      this.idleTime = 0;
      this.domElement.classList.remove('dragging');
    };

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointercancel', this._onPointerUp);

    this._onKeyDown = (event) => {
      if (this.handleLookKey(event.code, true)) event.preventDefault();
    };
    this._onKeyUp = (event) => {
      if (this.handleLookKey(event.code, false)) event.preventDefault();
    };
    this._onBlur = () => this.lookKeys.clear();

    if (this.keyTarget) {
      this.keyTarget.addEventListener('keydown', this._onKeyDown);
      this.keyTarget.addEventListener('keyup', this._onKeyUp);
      this.keyTarget.addEventListener('blur', this._onBlur);
    }
  }
}
