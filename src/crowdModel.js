import { AVENUE_EVERY, CELL } from './config.js';
import { cellLayout, cellOf, modulo } from './layout.js';
import { landingPadsFor } from './landingPadModel.js';
import {
  DOCK_MIN_HEIGHT,
  skyDockFor,
  skyDockPose,
  skyDockShipPose,
} from './skyDockModel.js';

export const CROWD_SPEED_MIN = 0.8;
export const CROWD_SPEED_MAX = 2.0;
export const CROWD_RADIUS = 90;
export const CROWD_SITE_RADIUS = 140;
export const CROWD_VISIBLE_HEIGHT = 40;
export const CROWD_ROAD_CLEARANCE = 5.6;

export function insideRoadCentre(value) {
  const cell = Math.floor(value / CELL);
  if (modulo(cell, AVENUE_EVERY) !== 0) return false;
  const center = (cell + 0.5) * CELL;
  return Math.abs(value - center) < CROWD_ROAD_CLEARANCE;
}

export function crossesRoad(x1, z1, x2, z2) {
  const distance = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(1, Math.ceil(distance * 2));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    if (insideRoadCentre(x) || insideRoadCentre(z)) return true;
  }
  return false;
}

export function keepOffRoad(value) {
  const cell = Math.floor(value / CELL);
  if (modulo(cell, AVENUE_EVERY) !== 0) return value;
  const center = (cell + 0.5) * CELL;
  const delta = value - center;
  if (Math.abs(delta) >= CROWD_ROAD_CLEARANCE) return value;
  return center + (delta >= 0 ? CROWD_ROAD_CLEARANCE : -CROWD_ROAD_CLEARANCE);
}

const SPAWN_MIN = 25;
const SPAWN_MAX = 85;
const TEMPO_MIN = 8;
const TEMPO_MAX = 20;

export function worldSites(x, z, radius = CROWD_SITE_RADIUS) {
  const cells = Math.ceil(radius / CELL);
  const { ix: centerIx, iz: centerIz } = cellOf(x, z);
  const pads = [];
  const docks = [];

  for (let iz = centerIz - cells; iz <= centerIz + cells; iz += 1) {
    for (let ix = centerIx - cells; ix <= centerIx + cells; ix += 1) {
      const layout = cellLayout(ix, iz);
      if (!layout) continue;
      if (layout.type === 'factory') {
        for (const pad of landingPadsFor(layout)) pads.push(pad);
      } else if (layout.h >= DOCK_MIN_HEIGHT) {
        const dock = skyDockFor(layout);
        if (!dock || dock.ships <= 0) continue;
        const pose = skyDockPose(layout, dock, layout.h);
        const ships = [];
        for (let index = 0; index < dock.ships; index += 1) {
          ships.push(skyDockShipPose(layout, dock, layout.h, index));
        }
        docks.push({
          ...pose,
          radius: dock.radius,
          thickness: dock.thickness,
          ships,
        });
      }
    }
  }

  return { pads, docks };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makePerson(layer, rng) {
  const baseSpeed = 1.05 + rng() * 0.6;
  return {
    active: false,
    layer,
    state: 'walk',
    timer: 0,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    axis: 'z',
    dir: 1,
    baseSpeed,
    speed: baseSpeed,
    tempoLeft: TEMPO_MIN + rng() * (TEMPO_MAX - TEMPO_MIN),
    tempoChanges: 0,
    phase: rng() * Math.PI * 2,
    fade: 1,
    angle: 0,
    site: null,
    path: null,
    group: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
}

function moveTowards(person, x, z, speed, dt) {
  const dx = x - person.x;
  const dz = z - person.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 1e-6) {
    const step = Math.min(distance, speed * dt);
    person.x += (dx / distance) * step;
    person.z += (dz / distance) * step;
    person.heading = Math.atan2(dx, dz);
  }
  return distance;
}

export class CrowdModel {
  constructor({
    rng = Math.random,
    streetCapacity = 160,
    dockCapacity = 24,
    sites = null,
  } = {}) {
    this.rng = rng;
    this.sites = sites;
    this.siteCache = null;
    this.currentSites = sites ?? { pads: [], docks: [] };
    this.nextGroup = 1;
    this.pendingGroup = null;
    this.street = Array.from({ length: streetCapacity }, () => makePerson('street', rng));
    this.dock = Array.from({ length: dockCapacity }, () => makePerson('dock', rng));
  }

  update(dt, camera, layer = 'street') {
    this.currentSites = this._sitesFor(camera);
    if (layer === 'dock') {
      for (const person of this.dock) {
        if (!person.active) this._spawnDock(person, camera);
        if (!person.active) continue;
        this._updateDock(person, dt, camera);
        if (Math.hypot(person.x - camera.x, person.z - camera.z) > CROWD_SITE_RADIUS) {
          this._spawnDock(person, camera);
        }
      }
      return;
    }

    for (const person of this.street) {
      if (!person.active) this._spawnStreet(person, camera);
      this._updateStreet(person, dt, camera);
      if (Math.hypot(person.x - camera.x, person.z - camera.z) > CROWD_RADIUS + 25) {
        this._spawnStreet(person, camera);
      }
    }
  }

  _sitesFor(camera) {
    if (this.sites) return this.sites;
    const key = `${Math.floor(camera.x / CELL)}:${Math.floor(camera.z / CELL)}`;
    if (!this.siteCache || this.siteCache.key !== key) {
      this.siteCache = { key, ...worldSites(camera.x, camera.z) };
    }
    return this.siteCache;
  }

  _updateStreet(person, dt, camera) {
    this._updateTempo(person, dt);
    switch (person.state) {
      case 'walk':
        this._walkState(person, dt);
        break;
      case 'browse':
      case 'readSign':
      case 'point':
        person.timer -= dt;
        if (person.timer <= 0) this._setWalking(person);
        break;
      case 'enterBuilding':
        this._enterBuilding(person, dt, camera);
        break;
      case 'leaveBuilding':
        this._leaveBuilding(person, dt);
        break;
      case 'gather':
        this._gatherState(person, dt);
        break;
      case 'talk':
        person.timer -= dt;
        if (person.timer <= 0) {
          person.group = 0;
          this._setWalking(person);
        }
        break;
      case 'board':
        this._boardState(person, dt, camera);
        break;
      case 'exitShip':
        person.fade = Math.min(1, person.fade + dt / 0.8);
        if (person.fade >= 1) {
          this._setWalking(person);
          this._pathToLane(person);
        }
        break;
      default:
        this._setWalking(person);
        break;
    }
  }

  _walkState(person, dt) {
    if (person.path) {
      const remaining = this._moveStreet(
        person,
        person.path.x,
        person.path.z,
        person.speed,
        dt,
      );
      if (remaining < 0.25) person.path = null;
    } else {
      const before = person.axis === 'x' ? person.x : person.z;
      const step = person.speed * dt;
      const nextX = person.axis === 'x' ? person.x + person.dir * step : person.x;
      const nextZ = person.axis === 'z' ? person.z + person.dir * step : person.z;
      if (this._blocked(nextX, nextZ)) {
        person.dir *= -1;
        person.timer = 4 + this.rng() * 8;
      } else {
        person.x = nextX;
        person.z = nextZ;
      }
      person.heading =
        person.axis === 'x'
          ? person.dir > 0
            ? Math.PI / 2
            : -Math.PI / 2
          : person.dir > 0
            ? 0
            : Math.PI;
      const after = person.axis === 'x' ? person.x : person.z;
      if (
        Math.floor(before / CELL) !== Math.floor(after / CELL) &&
        this.rng() < 0.3
      ) {
        const offset = (this.rng() * 2 - 1) * 0.6;
        if (person.axis === 'x') {
          person.x = Math.round(person.x / CELL) * CELL + offset;
          person.axis = 'z';
        } else {
          person.z = Math.round(person.z / CELL) * CELL + offset;
          person.axis = 'x';
        }
        person.dir = this.rng() < 0.5 ? 1 : -1;
      }
    }

    person.phase += person.speed * dt * 3.2;

    if (person.path) return;
    person.timer -= dt;
    if (person.timer <= 0) this._chooseStreetAction(person);
  }

  _blocked(x, z) {
    return insideRoadCentre(x) || insideRoadCentre(z);
  }

  _moveStreet(person, x, z, speed, dt) {
    const dx = x - person.x;
    const dz = z - person.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-6) return 0;
    const step = Math.min(distance, speed * dt);
    const nx = person.x + (dx / distance) * step;
    const nz = person.z + (dz / distance) * step;
    if (this._blocked(nx, nz)) {
      this._turnAway(person);
      return Infinity;
    }
    person.x = nx;
    person.z = nz;
    person.heading = Math.atan2(dx, dz);
    return distance;
  }

  _turnAway(person) {
    person.state = 'walk';
    person.timer = 4 + this.rng() * 8;
    this._pathToLane(person);
  }

  _updateTempo(person, dt) {
    person.tempoLeft -= dt;
    if (person.tempoLeft > 0) return;
    const factor = 0.75 + this.rng() * 0.55;
    person.speed = clamp(
      person.baseSpeed * factor,
      CROWD_SPEED_MIN,
      CROWD_SPEED_MAX,
    );
    person.tempoLeft = TEMPO_MIN + this.rng() * (TEMPO_MAX - TEMPO_MIN);
    person.tempoChanges += 1;
  }

  _updateDock(person, dt, camera) {
    switch (person.state) {
      case 'walk':
        this._walkDock(person, dt);
        break;
      case 'browse':
        person.timer -= dt;
        if (person.timer <= 0) this._setDockWalking(person);
        break;
      case 'board':
        this._boardDock(person, dt, camera);
        break;
      case 'exitShip':
        person.fade = Math.min(1, person.fade + dt / 0.8);
        if (person.fade >= 1) {
          this._setDockWalking(person);
          person.angle = Math.atan2(
            person.z - person.site.z,
            person.x - person.site.x,
          );
        }
        break;
      default:
        this._setDockWalking(person);
        break;
    }
  }

  _walkDock(person, dt) {
    const site = person.site;
    const radius = Math.max(0.6, site.radius * 0.55);
    person.angle += (person.dir * person.speed * dt) / radius;
    person.x = site.x + Math.cos(person.angle) * radius;
    person.z = site.z + Math.sin(person.angle) * radius;
    person.y = site.y + site.thickness;
    person.heading = Math.atan2(
      -Math.sin(person.angle) * person.dir,
      Math.cos(person.angle) * person.dir,
    );
    person.phase += person.speed * dt * 3.2;
    this._updateTempo(person, dt);

    person.timer -= dt;
    if (person.timer > 0) return;
    if (site.ships.length > 0 && this.rng() < 0.25) {
      const ship = site.ships[Math.floor(this.rng() * site.ships.length)];
      person.state = 'board';
      person.targetX = ship.x;
      person.targetY = ship.y;
      person.targetZ = ship.z;
      return;
    }
    if (this.rng() < 0.2) {
      person.state = 'browse';
      person.timer = 3 + this.rng() * 4;
      return;
    }
    this._setDockWalking(person);
  }

  _setDockWalking(person) {
    person.state = 'walk';
    person.timer = 6 + this.rng() * 12;
  }

  _boardDock(person, dt, camera) {
    const remaining = moveTowards(
      person,
      person.targetX,
      person.targetZ,
      person.speed * 1.1,
      dt,
    );
    person.y = person.targetY;
    if (remaining >= 0.4) return;
    person.fade -= dt / 0.8;
    if (person.fade > 0) return;
    const ships = person.site.ships;
    if (!ships.length) {
      this._spawnDock(person, camera);
      return;
    }
    const ship = ships[Math.floor(this.rng() * ships.length)];
    person.x = ship.x;
    person.y = ship.y;
    person.z = ship.z;
    person.fade = 0;
    person.state = 'exitShip';
  }

  _dockPopulation(site) {
    const deck = site.y + site.thickness;
    let count = 0;
    for (const person of this.dock) {
      if (!person.active) continue;
      if (Math.abs(person.y - deck) > 4) continue;
      if (Math.hypot(person.x - site.x, person.z - site.z) < site.radius + 1) {
        count += 1;
      }
    }
    return count;
  }

  _spawnDock(person, camera) {
    const docks = (this.currentSites?.docks ?? []).filter(
      (site) => this._dockPopulation(site) < 4,
    );
    if (!docks.length) {
      person.active = false;
      return;
    }
    const site = docks[Math.floor(this.rng() * docks.length)];
    person.active = true;
    person.site = site;
    person.fade = 1;
    person.state = 'walk';
    person.angle = this.rng() * Math.PI * 2;
    person.dir = this.rng() < 0.5 ? 1 : -1;
    person.timer = 6 + this.rng() * 12;
    person.phase = this.rng() * Math.PI * 2;
    const radius = Math.max(0.6, site.radius * 0.55);
    person.x = site.x + Math.cos(person.angle) * radius;
    person.z = site.z + Math.sin(person.angle) * radius;
    person.y = site.y + site.thickness;
    person.heading = Math.atan2(
      -Math.sin(person.angle) * person.dir,
      Math.cos(person.angle) * person.dir,
    );
  }

  _chooseStreetAction(person) {
    const ship = this._nearestShip(person.x, person.z, 35);
    if (ship && this.rng() < 0.2) {
      person.state = 'board';
      person.targetX = ship.x;
      person.targetZ = ship.z;
      return;
    }
    const roll = this.rng();
    if (roll < 0.06) {
      const facade = this._nearestFacade(person);
      if (facade) {
        person.state = 'enterBuilding';
        person.targetX = facade.x;
        person.targetZ = facade.z;
        person.heading = facade.heading;
        return;
      }
    }
    if (roll < 0.18) {
      this._idle(person, 'browse', 3, 3);
      return;
    }
    if (roll < 0.28) {
      this._idle(person, 'readSign', 3, 4);
      return;
    }
    if (roll < 0.34) {
      this._idle(person, 'point', 1.5, 1.5);
      return;
    }

    person.state = 'walk';
    person.timer = 6 + this.rng() * 12;
  }

  _idle(person, state, min, span) {
    person.state = state;
    person.timer = min + this.rng() * span;
    const layout = this._nearestBuilding(person);
    if (layout) {
      const cx = layout.x + layout.w / 2;
      const cz = layout.z + layout.d / 2;
      person.heading = Math.atan2(cx - person.x, cz - person.z);
    }
  }

  _setWalking(person) {
    person.state = 'walk';
    person.timer = 6 + this.rng() * 12;
  }

  _nearestBuilding(person) {
    const baseIx = Math.floor(person.x / CELL);
    const baseIz = Math.floor(person.z / CELL);
    let best = null;
    let bestDistance = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const layout = cellLayout(baseIx + dx, baseIz + dz);
        if (!layout) continue;
        const cx = layout.x + layout.w / 2;
        const cz = layout.z + layout.d / 2;
        const distance = Math.hypot(cx - person.x, cz - person.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = layout;
        }
      }
    }
    return best;
  }

  _nearestFacade(person) {
    const layout = this._nearestBuilding(person);
    if (!layout) return null;
    const cx = layout.x + layout.w / 2;
    const cz = layout.z + layout.d / 2;
    const options = [
      { x: layout.x - 0.45, z: cz },
      { x: layout.x + layout.w + 0.45, z: cz },
      { x: cx, z: layout.z - 0.45 },
      { x: cx, z: layout.z + layout.d + 0.45 },
    ];
    let best = null;
    let bestDistance = Infinity;
    for (const option of options) {
      if (crossesRoad(person.x, person.z, option.x, option.z)) continue;
      const distance = Math.hypot(option.x - person.x, option.z - person.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = option;
      }
    }
    if (!best) return null;
    return {
      x: best.x,
      z: best.z,
      heading: Math.atan2(best.x - person.x, best.z - person.z),
    };
  }

  _enterBuilding(person, dt, camera) {
    const remaining = this._moveStreet(
      person,
      person.targetX,
      person.targetZ,
      person.speed * 1.05,
      dt,
    );
    if (remaining >= 0.3) return;
    person.fade -= dt / 0.8;
    if (person.fade > 0) return;
    this._spawnFromDoor(person, camera);
  }

  _spawnFromDoor(person, camera) {
    const facade = this._facadeNear(camera);
    if (!facade) {
      this._spawnStreet(person, camera);
      return;
    }
    person.x = facade.x;
    person.z = facade.z;
    person.y = 0;
    person.fade = 0;
    person.state = 'leaveBuilding';
    person.heading = facade.heading;
  }

  _leaveBuilding(person, dt) {
    person.fade = Math.min(1, person.fade + dt / 0.8);
    if (person.fade < 1) return;
    this._setWalking(person);
    this._pathToLane(person);
  }

  _pathToLane(person) {
    const snapX = Math.round(person.x / CELL) * CELL;
    const snapZ = Math.round(person.z / CELL) * CELL;
    if (Math.abs(person.x - snapX) <= Math.abs(person.z - snapZ)) {
      person.axis = 'z';
      person.path = { x: snapX, z: person.z };
    } else {
      person.axis = 'x';
      person.path = { x: person.x, z: snapZ };
    }
    person.dir = this.rng() < 0.5 ? 1 : -1;
  }

  _facadeNear(camera) {
    const baseIx = Math.floor(camera.x / CELL);
    const baseIz = Math.floor(camera.z / CELL);
    let best = null;
    let bestDistance = Infinity;
    for (let dx = -4; dx <= 4; dx += 1) {
      for (let dz = -4; dz <= 4; dz += 1) {
        const layout = cellLayout(baseIx + dx, baseIz + dz);
        if (!layout) continue;
        const cx = layout.x + layout.w / 2;
        const cz = layout.z + layout.d / 2;
        const distance = Math.hypot(cx - camera.x, cz - camera.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = layout;
        }
      }
    }
    if (!best) return null;
    const cx = best.x + best.w / 2;
    const cz = best.z + best.d / 2;
    const options = [
      { x: best.x - 0.45, z: cz },
      { x: best.x + best.w + 0.45, z: cz },
      { x: cx, z: best.z - 0.45 },
      { x: cx, z: best.z + best.d + 0.45 },
    ];
    let door = options[0];
    let doorDistance = Infinity;
    for (const option of options) {
      const distance = Math.hypot(option.x - camera.x, option.z - camera.z);
      if (distance < doorDistance) {
        doorDistance = distance;
        door = option;
      }
    }
    return {
      x: door.x,
      z: door.z,
      heading: Math.atan2(cx - door.x, cz - door.z),
    };
  }


  _spawnStreet(person, camera) {
    person.active = true;
    person.fade = 1;
    person.group = 0;
    person.path = null;

    if (this.pendingGroup) {
      this._joinGroup(person);
      return;
    }

    const pad = this._pickPad(camera);
    if (pad && this.rng() < 0.15) {
      person.x = keepOffRoad(
        pad.x + (this.rng() - 0.5) * Math.max(0.5, pad.width - 1),
      );
      person.z = keepOffRoad(
        pad.z + (this.rng() - 0.5) * Math.max(0.5, pad.depth - 1),
      );
      person.y = 0;
      person.state = 'walk';
      person.timer = 6 + this.rng() * 12;
      person.phase = this.rng() * Math.PI * 2;
      this._pathToLane(person);
      person.heading = Math.atan2(
        person.path.x - person.x,
        person.path.z - person.z,
      );
      return;
    }

    const angle = this.rng() * Math.PI * 2;
    const distance = SPAWN_MIN + this.rng() * (SPAWN_MAX - SPAWN_MIN);
    const px = camera.x + Math.cos(angle) * distance;
    const pz = camera.z + Math.sin(angle) * distance;

    const axis = this.rng() < 0.5 ? 'x' : 'z';
    const offset = (this.rng() * 2 - 1) * 0.6;
    const dir = this.rng() < 0.5 ? 1 : -1;

    person.state = 'walk';
    person.timer = 4 + this.rng() * 12;
    person.axis = axis;
    person.dir = dir;
    if (axis === 'x') {
      person.x = px;
      person.z = Math.round(pz / CELL) * CELL + offset;
    } else {
      person.x = Math.round(px / CELL) * CELL + offset;
      person.z = pz;
    }
    person.x = keepOffRoad(person.x);
    person.z = keepOffRoad(person.z);
    person.y = 0;
    person.heading =
      axis === 'x'
        ? dir > 0
          ? Math.PI / 2
          : -Math.PI / 2
        : dir > 0
          ? 0
          : Math.PI;
    person.phase = this.rng() * Math.PI * 2;

    if (this.rng() < 0.16) {
      const groupAngle = this.rng() * Math.PI * 2;
      const groupDistance = 10 + this.rng() * 40;
      const targetX =
        Math.round((camera.x + Math.cos(groupAngle) * groupDistance) / CELL) * CELL;
      const targetZ =
        Math.round((camera.z + Math.sin(groupAngle) * groupDistance) / CELL) * CELL;
      const id = this.nextGroup;
      this.nextGroup += 1;
      const size = 2 + Math.floor(this.rng() * 4);
      this.pendingGroup = {
        id,
        targetX,
        targetZ,
        members: size - 1,
      };
      this._makeGroupMember(person, targetX, targetZ, id);
    }
  }

  _makeGroupMember(person, targetX, targetZ, id) {
    const angle = this.rng() * Math.PI * 2;
    const stand = 0.7 + this.rng() * 0.3;
    person.x = keepOffRoad(targetX + Math.cos(angle) * (1.5 + this.rng() * 2.5));
    person.z = keepOffRoad(targetZ + Math.sin(angle) * (1.5 + this.rng() * 2.5));
    person.y = 0;
    person.state = 'gather';
    person.group = id;
    person.targetX = keepOffRoad(targetX + Math.cos(angle) * stand);
    person.targetZ = keepOffRoad(targetZ + Math.sin(angle) * stand);
    person.heading = Math.atan2(
      person.targetX - person.x,
      person.targetZ - person.z,
    );
    person.phase = this.rng() * Math.PI * 2;
    person.fade = 1;
  }

  _joinGroup(person) {
    const group = this.pendingGroup;
    this._makeGroupMember(person, group.targetX, group.targetZ, group.id);
    group.members -= 1;
    if (group.members <= 0) this.pendingGroup = null;
  }

  _gatherState(person, dt) {
    const remaining = this._moveStreet(
      person,
      person.targetX,
      person.targetZ,
      person.speed * 1.1,
      dt,
    );
    if (remaining >= 0.3) return;
    person.state = 'talk';
    person.timer = 8 + this.rng() * 12;
    person.heading = this.rng() * Math.PI * 2;
  }

  _boardState(person, dt, camera) {
    const remaining = this._moveStreet(
      person,
      person.targetX,
      person.targetZ,
      person.speed * 1.2,
      dt,
    );
    if (remaining >= 0.5) return;
    person.fade -= dt / 0.8;
    if (person.fade > 0) return;
    this._exitAtShip(person, camera);
  }

  _exitAtShip(person, camera) {
    const ships = this._ships();
    if (!ships.length) {
      this._spawnStreet(person, camera);
      return;
    }
    const ship = ships[Math.floor(this.rng() * ships.length)];
    person.x = ship.x + (this.rng() - 0.5) * 0.8;
    person.z = ship.z + (this.rng() - 0.5) * 0.8;
    person.y = ship.y ?? 0;
    person.fade = 0;
    person.state = 'exitShip';
    person.group = 0;
    person.path = null;
    person.heading = this.rng() * Math.PI * 2;
  }

  _ships() {
    const ships = [];
    for (const pad of this.currentSites?.pads ?? []) {
      for (const ship of pad.ships) ships.push(ship);
    }
    return ships;
  }

  _nearestShip(x, z, radius) {
    let best = null;
    let bestDistance = radius;
    for (const ship of this._ships()) {
      if (crossesRoad(x, z, ship.x, ship.z)) continue;
      const distance = Math.hypot(ship.x - x, ship.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ship;
      }
    }
    return best;
  }

  _pickPad(camera) {
    const pads = this.currentSites?.pads ?? [];
    if (!pads.length) return null;
    const angle = this.rng() * Math.PI * 2;
    const distance = 15 + this.rng() * (CROWD_RADIUS - 15);
    const x = camera.x + Math.cos(angle) * distance;
    const z = camera.z + Math.sin(angle) * distance;
    let best = pads[0];
    let bestDistance = Infinity;
    for (const pad of pads) {
      const padDistance = Math.hypot(pad.x - x, pad.z - z);
      if (padDistance < bestDistance) {
        bestDistance = padDistance;
        best = pad;
      }
    }
    return best;
  }
}
