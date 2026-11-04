export const METEOR_TINTS = [0x9df9ff, 0xffd9a0, 0xff9de0];

export function nextMeteorDelay(rng, min = 7, max = 16) {
  return min + rng() * (max - min);
}

export function spawnMeteor(camera, heading, rng, radius = 260) {
  const angle = heading + (rng() - 0.5) * 1.5;
  const distance = 100 + rng() * (radius - 100);
  const startX = camera.x + Math.sin(angle) * distance;
  const startZ = camera.z + Math.cos(angle) * distance;
  const startY = camera.y + 60 + rng() * 140;

  const targetDistance = distance * (0.45 + rng() * 0.25);
  const targetX = camera.x + Math.sin(angle) * targetDistance + (rng() - 0.5) * 30;
  const targetZ = camera.z + Math.cos(angle) * targetDistance + (rng() - 0.5) * 30;
  const targetY = 0;

  const dx = targetX - startX;
  const dy = targetY - startY;
  const dz = targetZ - startZ;
  const distanceToTarget = Math.hypot(dx, dy, dz) || 1;
  const speed = 120 + rng() * 120;
  const inv = 1 / distanceToTarget;

  return {
    x: startX,
    y: startY,
    z: startZ,
    vx: dx * inv * speed,
    vy: dy * inv * speed,
    vz: dz * inv * speed,
    speed,
    life: distanceToTarget / speed,
    age: 0,
    length: 6 + speed * 0.055 + rng() * 3,
    width: 0.2 + rng() * 0.18,
    tint: METEOR_TINTS[Math.floor(rng() * METEOR_TINTS.length)],
  };
}

export function advanceMeteor(meteor, dt) {
  meteor.x += meteor.vx * dt;
  meteor.y += meteor.vy * dt;
  meteor.z += meteor.vz * dt;
  meteor.life -= dt;
  meteor.age += dt;
  return meteor;
}

export function isMeteorDone(meteor) {
  return meteor.life <= 0 || meteor.y <= 0;
}
