import * as THREE from 'three';
import {
  SKY_HEIGHT,
  SKY_SPEED,
  STREET_HEIGHT,
  STREET_SPEED,
} from './config.js';
import { avenueCenterX } from './layout.js';
import { mulberry32 } from './noise.js';
import { StreetNav } from './streetNav.js';

const BASE_YAW = Math.PI;
const SKY_PITCH = -0.24;
const STREET_PITCH = -0.015;
const DRAG_YAW = 0.0042;
const DRAG_PITCH = 0.0032;

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.mode = 'sky';
    this.x = avenueCenterX(0);
    this.z = 0;
    this.height = SKY_HEIGHT;
    this.speed = SKY_SPEED;
    this.heading = 0;
    this.nav = null;
    this.turnChance = null;

    this.lookYaw = 0;
    this.lookPitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

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
    this.mode = this.mode === 'sky' ? 'street' : 'sky';
    this.targetYaw = 0;
    this.targetPitch = 0;
    if (this.mode === 'street') {
      this.x = avenueCenterX(this.x);
      this.nav = new StreetNav({
        x: this.x,
        z: this.z,
        heading: this.heading,
        rng: mulberry32((Math.random() * 0x7fffffff) | 0),
        turnChance: this.turnChance,
      });
    } else {
      this.nav = null;
    }
    if (this.onModeChange) this.onModeChange(this.mode);
  }

  get pitch() {
    const base = this.mode === 'sky' ? SKY_PITCH : STREET_PITCH;
    const portraitTilt = this.camera.aspect < 1 ? -0.07 : 0;
    return base + portraitTilt + this.lookPitch;
  }

  update(dt) {
    const portrait = this.camera.aspect < 1;
    const targetHeight =
      this.mode === 'sky' ? (portrait ? 74 : SKY_HEIGHT) : STREET_HEIGHT;
    const targetSpeed = this.mode === 'sky' ? SKY_SPEED : STREET_SPEED;
    this.height = damp(this.height, targetHeight, 2.1, dt);
    this.speed = damp(this.speed, targetSpeed, 1.6, dt);

    if (this.mode === 'street' && this.nav) {
      const state = this.nav.update(dt, this.speed);
      this.x = state.x;
      this.z = state.z;
      this.heading = state.heading;
    } else {
      this.heading = damp(this.heading, 0, 2.4, dt);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
    }

    if (!this.dragging) {
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
  }

  _apply() {
    this.camera.position.set(this.x, this.height, this.z);
    this.camera.rotation.set(
      this.pitch,
      BASE_YAW + this.heading + this.lookYaw,
      0,
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

      const maxYaw = this.mode === 'street' ? 0.62 : 2.4;
      this.targetYaw = THREE.MathUtils.clamp(this.targetYaw - dx * DRAG_YAW, -maxYaw, maxYaw);
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch - dy * DRAG_PITCH,
        -0.5,
        0.45,
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
  }
}
