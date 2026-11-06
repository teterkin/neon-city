import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoldRepeat } from '../src/holdRepeat.js';

test('hold repeat steps once immediately and then repeats after the delay', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let steps = 0;
  const repeat = createHoldRepeat(() => {
    steps += 1;
  });

  repeat.start();
  assert.equal(steps, 1, 'the first step happens on press');

  t.mock.timers.tick(319);
  assert.equal(steps, 1, 'nothing happens during the delay');
  t.mock.timers.tick(1);
  assert.equal(steps, 1, 'the delay alone does not step');
  t.mock.timers.tick(90);
  assert.equal(steps, 2, 'the first repeat fires');
  t.mock.timers.tick(180);
  assert.equal(steps, 4, 'repeats keep firing');

  repeat.stop();
  t.mock.timers.tick(1000);
  assert.equal(steps, 4, 'stop ends the repeats');
});

test('hold repeat stops before the delay fires', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let steps = 0;
  const repeat = createHoldRepeat(() => {
    steps += 1;
  });

  repeat.start();
  repeat.stop();
  t.mock.timers.tick(1000);
  assert.equal(steps, 1, 'a quick tap never repeats');
});

test('hold repeat restarts cleanly without stacking timers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let steps = 0;
  const repeat = createHoldRepeat(() => {
    steps += 1;
  });

  repeat.start();
  repeat.start();
  assert.equal(steps, 2, 'each press steps once');

  t.mock.timers.tick(320);
  t.mock.timers.tick(90);
  assert.equal(steps, 3, 'only one repeat timer is alive');
  t.mock.timers.tick(90);
  assert.equal(steps, 4, 'repeats continue at the interval');

  repeat.stop();
  repeat.stop();
  t.mock.timers.tick(1000);
  assert.equal(steps, 4, 'repeated stop is safe');
});

test('hold repeat accepts custom timing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let steps = 0;
  const repeat = createHoldRepeat(
    () => {
      steps += 1;
    },
    { delay: 100, interval: 50 },
  );

  repeat.start();
  t.mock.timers.tick(100);
  t.mock.timers.tick(50);
  assert.equal(steps, 2);

  repeat.stop();
});
