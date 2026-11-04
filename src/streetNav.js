import { AVENUE_EVERY, CELL } from './config.js';
import { avenueCenterX } from './layout.js';

const SPACING = CELL * AVENUE_EVERY;
const HALF_CELL = CELL / 2;
const TURN_RATE = 3.2;
const TURN_SPEED_FACTOR = 0.25;

function laneIndex(value) {
  return Math.floor((value - HALF_CELL) / SPACING);
}

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
        this._snapToLane();
      } else {
        this.heading = wrapAngle(this.heading + Math.sign(delta) * maxStep);
      }
    } else {
      const alongZ = Math.abs(Math.cos(this.heading)) > 0.5;
      if (alongZ) {
        const before = laneIndex(previousZ);
        const after = laneIndex(this.z);
        if (after !== before) {
          this.z = HALF_CELL + after * SPACING;
          this._snapToLane();
          turned = this._considerTurn();
        }
      } else {
        const before = laneIndex(previousX);
        const after = laneIndex(this.x);
        if (after !== before) {
          this.x = HALF_CELL + after * SPACING;
          this._snapToLane();
          turned = this._considerTurn();
        }
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

  _nextBlocks() {
    const span = this.blocksMax - this.blocksMin + 1;
    return this.blocksMin + Math.floor(this.rng() * span);
  }

  _considerTurn() {
    if (this.turnChance !== null) {
      return this.rng() < this.turnChance ? this._startTurn() : false;
    }
    this.blocksSinceTurn += 1;
    if (this.blocksSinceTurn < this.blocksUntilTurn) return false;
    return this._startTurn();
  }

  _startTurn() {
    const direction = this.rng() < 0.5 ? 1 : -1;
    this.turns.push({ x: this.x, z: this.z, heading: this.heading, time: this.time });
    this.lastTurnDirection = direction;
    this.targetHeading = wrapAngle(this.heading + (direction * Math.PI) / 2);
    this.turning = true;
    this.blocksSinceTurn = 0;
    this.blocksUntilTurn = this._nextBlocks();
    return true;
  }

  _snapToLane() {
    if (Math.abs(Math.cos(this.heading)) > 0.5) {
      this.x = avenueCenterX(this.x);
    } else {
      this.z = avenueCenterX(this.z);
    }
  }
}
