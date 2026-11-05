import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Escort } from '../src/escort.js';

test('escort is a complete convertible with thruster plumes', () => {
  const escort = new Escort();
  assert.ok(escort.group.children.length >= 20, `only ${escort.group.children.length} parts`);
  assert.ok(escort.plumes.isPoints);
  assert.equal(escort.plumes.geometry.getAttribute('position').count, 128);
  assert.equal(escort.plumes.geometry.getAttribute('aSeed').count, 128);

  const camera = new THREE.Vector3(0, 96, 0);
  escort.update(0.016, camera, 0, 1.5, 6, 22);
  assert.ok(Number.isFinite(escort.position.x));
  assert.ok(Number.isFinite(escort.position.y));
  assert.ok(Number.isFinite(escort.position.z));
  assert.ok(Number.isFinite(escort.group.rotation.y));
  assert.ok(Math.abs(escort.plumeMaterial.uniforms.uTime.value - 1.5) < 1e-9);
  assert.equal(escort.shadow.visible, false, 'shadow should hide high above the street');

  const streetCamera = new THREE.Vector3(0, 3.2, 0);
  escort.update(1, streetCamera, 0, 2, 1.2, 15);
  assert.ok(escort.shadow.visible, 'shadow should show near the street');
  assert.ok(Math.abs(escort.shadow.position.y - 0.04) < 1e-9);
  assert.ok(escort.shadowMaterial.uniforms.uOpacity.value > 0.2);

  escort.setThrottle(0.75);
  assert.ok(Math.abs(escort.plumeMaterial.uniforms.uThrottle.value - 0.75) < 1e-9);
  escort.setThrottle(2);
  assert.equal(escort.plumeMaterial.uniforms.uThrottle.value, 1);
  escort.dispose();
});

test('plume emitters form four continuous streams per nozzle', () => {
  const escort = new Escort();
  const positions = escort.plumes.geometry.getAttribute('position');
  const seeds = escort.plumes.geometry.getAttribute('aSeed');
  const centers = [-0.72, 0.72];

  for (let nozzleIndex = 0; nozzleIndex < centers.length; nozzleIndex += 1) {
    const start = nozzleIndex * 64;
    const columns = new Map();
    for (let index = start; index < start + 64; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      assert.ok(Math.abs(z + 2.3) < 1e-6, `plume start z ${z}`);
      assert.ok(Math.abs(y - 0.14) < 1e-6, `stream should stay level, y ${y}`);
      const key = x.toFixed(4);
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key).push(seeds.getX(index));
    }

    assert.equal(columns.size, 4, `nozzle ${nozzleIndex} has ${columns.size} streams`);
    const offsets = [...columns.keys()].map(Number).map((x) => x - centers[nozzleIndex]);
    for (const offset of offsets) {
      assert.ok(Math.abs(offset) <= 0.42 + 1e-6, `stream offset ${offset}`);
    }
    assert.ok(Math.abs((Math.min(...offsets) + Math.max(...offsets)) / 2) < 1e-6);
    const sortedOffsets = [...offsets].sort((a, b) => a - b);
    const spacing = sortedOffsets[1] - sortedOffsets[0];
    for (let index = 1; index < sortedOffsets.length; index += 1) {
      assert.ok(
        Math.abs(sortedOffsets[index] - sortedOffsets[index - 1] - spacing) < 1e-6,
        `nozzle ${nozzleIndex} streams are not evenly spaced`,
      );
    }

    for (const column of columns.values()) {
      assert.equal(column.length, 16, 'each stream needs sixteen staggered particles');
      const sorted = [...column].sort((a, b) => a - b);
      for (let index = 1; index < sorted.length; index += 1) {
        assert.ok(
          Math.abs(sorted[index] - sorted[index - 1] - 1 / 16) < 1e-5,
          `stream phases ${sorted.join(', ')}`,
        );
      }
    }
  }
  escort.dispose();
});

test('plume streams do not swirl over time', () => {
  const escort = new Escort();
  assert.ok(
    !/\bp\.[xy]\b/.test(escort.plumeMaterial.vertexShader),
    'plume must not drift sideways',
  );
  escort.dispose();
});

test('plume tails fade out before the stream end', () => {
  const escort = new Escort();
  assert.match(escort.plumeMaterial.fragmentShader, /pow\(1\.0 - vLife, 2\.4\)/);
  escort.dispose();
});

test('plume length is compressed by another thirty percent', () => {
  const escort = new Escort();
  const match = escort.plumeMaterial.vertexShader.match(
    /p\.z -= life \* mix\(([\d.]+), ([\d.]+), uThrottle\);/,
  );
  assert.ok(match, 'plume length line not found');
  assert.ok(
    Math.abs(Number(match[1]) - 2.8 * 0.8 * 0.7) < 1e-9,
    `min length ${match[1]}`,
  );
  assert.ok(
    Math.abs(Number(match[2]) - 4.6 * 0.8 * 0.7) < 1e-9,
    `max length ${match[2]}`,
  );
  escort.dispose();
});

test('plume tips are rounded instead of sharp', () => {
  const escort = new Escort();
  assert.match(escort.plumeMaterial.vertexShader, /mix\(6\.0, 3\.0, life\)/);
  assert.match(escort.plumeMaterial.fragmentShader, /smoothstep\(0\.5, 0\.3, radius\)/);
  escort.dispose();
});
