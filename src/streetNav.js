import { AVENUE_EVERY, CELL } from './config.js';
import { avenueCenterX } from './layout.js';

const SPACING = CELL * AVENUE_EVERY;
const HALF_CELL = CELL / 2;
const TURN_RATE = 3.2;
const TURN_SPEED_FACTOR = 0.25;

export function wrapAngle(angle) {
  const twoPi = Math.PI * 2;
  let wrapped = angle % twoPi;
  if (wrapped > Math.PI) wrapped -= twoPi;
  if (wrapped < -Math.PI) wrapped += twoPi;
  return wrapped;
}

export class StreetNav {
  constructor({
    x = avenueCenterX(0),
    z = 0,
    heading = 0,
    rng = Math.random,
    turnChance = null,
    blocksMin = 1,
    blocksMax = 2,
    turnRate = TURN_RATE,
  } = {}) {
    this.x = x;
    this.z = z;
    this.heading = wrapAngle(heading);
    this.targetHeading = this.heading;
    this.turning = false;
    this.rng = rng;
    this.turnChance = turnChance;
    this.blocksMin = blocksMin;
    this.blocksMax = blocksMax;
    this.turnRate = turnRate;
    this.turns = [];
    this.time = 0;
    this.lastTurnDirection = 0;
    this.blocksSinceTurn = 0;
    this.blocksUntilTurn = this._nextBlocks();
    this.snapAxis = null;
    this.snapFrom = 0;
    this.snapTo = 0;
    this.turnSpan = Math.PI / 2;
  }

  update(dt, speed) {
    this.time += dt;
    const step = speed * dt * (this.turning ? TURN_SPEED_FACTOR : 1);
    const previousX = this.x;
    const previousZ = this.z;

    this.x += Math.sin(this.heading) * step;
    this.z += Math.cos(this.heading) * step;

    let turned = false;

    if (this.turning) {
      const delta = wrapAngle(this.targetHeading - this.heading);
      const maxStep = this.turnRate * dt;
      if (Math.abs(delta) <= maxStep) {
        this.heading = this.targetHeading;
        this.turning = false;
        this._finishMerge();
      } else {
        this.heading = wrapAngle(this.heading + Math.sign(delta) * maxStep);
        this._updateMerge();
      }
    } else {
      const alongZ = Math.abs(Math.cos(this.heading)) > 0.5;
      const sign = alongZ
        ? Math.sign(Math.cos(this.heading))
        : Math.sign(Math.sin(this.heading));
      const entryOffset = HALF_CELL - sign * HALF_CELL;
      const previousValue = alongZ ? previousZ : previousX;
      const currentValue = alongZ ? this.z : this.x;
      const before = Math.floor((previousValue - entryOffset) / SPACING);
      const after = Math.floor((currentValue - entryOffset) / SPACING);
      if (after !== before) {
        turned = this._considerTurn(alongZ);
      }
    }

    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      turning: this.turning,
      turned,
    };
  }

  completeTurn() {
    if (!this.turning) return;
    this.heading = this.targetHeading;
    this.turning = false;
    this._finishMerge();
  }

  _nextBlocks() {
    const span = this.blocksMax - this.blocksMin + 1;
    return this.blocksMin + Math.floor(this.rng() * span);
  }

  _considerTurn(alongZ) {
    if (this.turnChance !== null) {
      if (this.rng() >= this.turnChance) return false;
    } else {
      this.blocksSinceTurn += 1;
      if (this.blocksSinceTurn < this.blocksUntilTurn) return false;
    }
    return this._startTurn(alongZ);
  }

  _startTurn(alongZ) {
    const direction = this.rng() < 0.5 ? 1 : -1;
    const axis = alongZ ? 'z' : 'x';
    const value = this[axis];

    this.turns.push({ x: this.x, z: this.z, heading: this.heading, time: this.time });
    this.lastTurnDirection = direction;
    this.snapAxis = axis;
    this.snapFrom = value;
    this.snapTo = avenueCenterX(value);
    this.turnSpan = Math.PI / 2;

    this.targetHeading = wrapAngle(this.heading + (direction * Math.PI) / 2);
    this.turning = true;
    this.blocksSinceTurn = 0;
    this.blocksUntilTurn = this._nextBlocks();
    return true;
  }

  _updateMerge() {
    if (!this.snapAxis) return;
    const remaining = Math.abs(wrapAngle(this.targetHeading - this.heading));
    const progress = Math.min(1, Math.max(0, 1 - remaining / this.turnSpan));
    const eased = progress * progress * (3 - 2 * progress);
    this[this.snapAxis] = this.snapFrom + (this.snapTo - this.snapFrom) * eased;
  }

  _finishMerge() {
    if (!this.snapAxis) return;
    this[this.snapAxis] = this.snapTo;
    this.snapAxis = null;
  }
}
