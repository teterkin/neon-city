import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOT_STAGES, stageProgress } from '../src/loadProgress.js';

test('boot stages are labelled with positive weights', () => {
  assert.ok(BOOT_STAGES.length >= 3);
  for (const stage of BOOT_STAGES) {
    assert.equal(typeof stage.label, 'string');
    assert.ok(stage.label.length > 0);
    assert.ok(stage.weight > 0);
  }
});

test('progress is monotonic and ends at one', () => {
  let previous = 0;
  for (let index = 0; index < BOOT_STAGES.length; index += 1) {
    const ratio = stageProgress(BOOT_STAGES, index);
    assert.ok(ratio > previous, `stage ${index} did not advance`);
    assert.ok(ratio <= 1);
    previous = ratio;
  }
  assert.equal(previous, 1);
});

test('progress clamps out-of-range stage indices', () => {
  assert.equal(stageProgress(BOOT_STAGES, -10), stageProgress(BOOT_STAGES, 0));
  assert.equal(
    stageProgress(BOOT_STAGES, 999),
    stageProgress(BOOT_STAGES, BOOT_STAGES.length - 1),
  );
  assert.ok(stageProgress(BOOT_STAGES, 0) > 0);
});
