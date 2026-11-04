import * as THREE from 'three';
import {
  advanceMeteor,
  isMeteorDone,
  nextMeteorDelay,
  spawnMeteor,
} from './meteorModel.js';
import { createGlowTexture } from './materials/glowTexture.js';

const FORWARD = new THREE.Vector3(0, 0, 1);
const IMPACT_TIME = 0.6;

export class Meteors {
  constructor({ capacity = 5, rng = Math.random } = {}) {
    this.capacity = capacity;
    this.rng = rng;
    this.active = new Array(capacity).fill(null);
    this.impactTimers = new Float32Array(capacity);
    this.impactPositions = Array.from({ length: capacity }, () => new THREE.Vector3());
    this.timer = 2 + rng() * 4;

    this.group = new THREE.Group();
    this.group.name = 'meteors';

    this.streakGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.streakMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.streaks = new THREE.InstancedMesh(
      this.streakGeometry,
      this.streakMaterial,
      capacity,
    );
    this.streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);

    this.impactTexture = createGlowTexture();
    this.impacts = [];
    for (let index = 0; index < capacity; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.impactTexture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 3;
      sprite.scale.setScalar(0.001);
      this.group.add(sprite);
      this.impacts.push(sprite);
    }

    this._matrix = new THREE.Matrix4();
    this._quaternion = new THREE.Quaternion();
    this._position = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._color = new THREE.Color();

    this._matrix.makeScale(0, 0, 0);
    for (let index = 0; index < capacity; index += 1) {
      this.streaks.setMatrixAt(index, this._matrix);
      this.streaks.setColorAt(index, this._color.setHex(0xffffff));
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    this.streaks.instanceColor.needsUpdate = true;
  }

  update(dt, cameraPosition, heading) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.spawnNow(cameraPosition, heading);
      this.timer = nextMeteorDelay(this.rng);
    }

    let dirty = false;
    for (let index = 0; index < this.capacity; index += 1) {
      const meteor = this.active[index];
      if (meteor) {
        advanceMeteor(meteor, dt);
        if (isMeteorDone(meteor)) {
          this.impactPositions[index].set(meteor.x, Math.max(1, meteor.y), meteor.z);
          this.impactTimers[index] = IMPACT_TIME;
          this.active[index] = null;
          this._matrix.makeScale(0, 0, 0);
          this.streaks.setMatrixAt(index, this._matrix);
        } else {
          this._direction.set(meteor.vx, meteor.vy, meteor.vz).normalize();
          this._quaternion.setFromUnitVectors(FORWARD, this._direction);
          this._position.set(meteor.x, meteor.y, meteor.z);
          this._scale.set(meteor.width, meteor.width, meteor.length);
          this._matrix.compose(this._position, this._quaternion, this._scale);
          this.streaks.setMatrixAt(index, this._matrix);
          this.streaks.setColorAt(index, this._color.setHex(meteor.tint));
        }
        dirty = true;
      }

      const impact = this.impacts[index];
      if (this.impactTimers[index] > 0) {
        this.impactTimers[index] = Math.max(0, this.impactTimers[index] - dt);
        const life = this.impactTimers[index] / IMPACT_TIME;
        impact.visible = true;
        impact.position.copy(this.impactPositions[index]);
        impact.scale.setScalar(10 + (1 - life) * 22);
        impact.material.opacity = life * 0.85;
      } else if (impact.visible) {
        impact.visible = false;
        impact.material.opacity = 0;
      }
    }

    if (dirty) {
      this.streaks.instanceMatrix.needsUpdate = true;
      this.streaks.instanceColor.needsUpdate = true;
    }
  }

  spawnNow(cameraPosition, heading) {
    const slot = this.active.findIndex((meteor) => meteor === null);
    if (slot < 0) return null;
    const meteor = spawnMeteor(cameraPosition, heading, this.rng);
    this.active[slot] = meteor;
    return meteor;
  }

  dispose() {
    this.streakGeometry.dispose();
    this.streakMaterial.dispose();
    if (this.impactTexture) this.impactTexture.dispose();
    for (const sprite of this.impacts) sprite.material.dispose();
  }
}
