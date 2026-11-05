import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundtrack } from '../src/audio.js';

function makeContext() {
  const events = [];
  const gain = {
    value: 1,
    cancelScheduledValues(time) {
      events.push(['cancel', time]);
    },
    setValueAtTime(value, time) {
      this.value = value;
      events.push(['set', value, time]);
    },
    linearRampToValueAtTime(value, time) {
      this.value = value;
      events.push(['ramp', value, time]);
    },
    cancelAndHoldAtTime(time) {
      events.push(['hold', time]);
    },
    setTargetAtTime(value, time, constant) {
      this.value = value;
      events.push(['target', value, time, constant]);
    },
  };
  const context = {
    currentTime: 10,
    state: 'suspended',
    destination: { name: 'destination' },
    events,
    sources: [],
    createGain() {
      return { gain, connect() { return this; }, disconnect() { events.push(['gain-disconnect']); } };
    },
    createBufferSource() {
      const source = {
        loop: false,
        buffer: null,
        started: null,
        stopped: false,
        connect() { return this; },
        disconnect() { events.push(['source-disconnect']); },
        start(time) { this.started = time; events.push(['start', time]); },
        stop() { this.stopped = true; events.push(['stop']); },
      };
      context.sources.push(source);
      return source;
    },
    resume() {
      this.state = 'running';
      events.push(['resume']);
      return Promise.resolve();
    },
    decodeAudioData(bytes) {
      events.push(['decode', bytes.byteLength]);
      return Promise.resolve({ duration: 35.556 });
    },
  };
  return context;
}

function makeSoundtrack(overrides = {}) {
  const context = overrides.context ?? makeContext();
  const soundtrack = new Soundtrack({
    url: 'data:audio/mpeg;base64,AAAA',
    contextFactory: overrides.contextFactory ?? (() => context),
    fetchImpl: overrides.fetchImpl ?? (async () => ({ arrayBuffer: async () => new ArrayBuffer(32) })),
    volume: 0.55,
    fadeIn: 0.6,
    fadeOut: 0.05,
  });
  return { soundtrack, context };
}

test('prepare decodes the embedded track without network access', async () => {
  const { soundtrack, context } = makeSoundtrack();
  assert.equal(await soundtrack.prepare(), true);
  assert.equal(soundtrack.available, true);
  assert.equal(soundtrack.duration, 35.556);
  assert.ok(context.events.some(([type]) => type === 'decode'));
});

test('play is a no-op before prepare', () => {
  const { soundtrack } = makeSoundtrack();
  assert.equal(soundtrack.play(), false);
  assert.equal(soundtrack.playing, false);
});

test('play schedules gapless one-shot buffers instead of relying on loop', async () => {
  const { soundtrack, context } = makeSoundtrack();
  await soundtrack.prepare();
  assert.equal(soundtrack.play(), true);
  assert.equal(soundtrack.playing, true);

  const first = context.sources[0];
  const second = context.sources[1];
  assert.equal(first.loop, false, 'looping a long decoded buffer is avoided');
  assert.equal(first.buffer.duration, 35.556);
  assert.ok(Math.abs(first.started - 10.05) < 1e-9, `lead-in ${first.started}`);
  assert.ok(second, 'next loop should be queued ahead');
  assert.ok(
    Math.abs(second.started - (first.started + 35.556)) < 1e-6,
    `second loop starts at ${second.started}`,
  );
  assert.ok(
    context.events.some(([type, value]) => type === 'ramp' && value === 0.55),
    'gain should fade in to the configured volume',
  );
  soundtrack.stop();
});

test('stop fades out and stops every scheduled buffer', async () => {
  const { soundtrack, context } = makeSoundtrack();
  await soundtrack.prepare();
  soundtrack.play();
  const sources = [...context.sources];
  soundtrack.stop();
  assert.equal(soundtrack.playing, false);
  assert.ok(context.events.some(([type, value]) => type === 'ramp' && value === 0));
  await new Promise((resolve) => setTimeout(resolve, 120));
  for (const source of sources) assert.equal(source.stopped, true);
  assert.equal(soundtrack.scheduleTimer, null);
});

test('starting a new loop stops any lingering source immediately', async () => {
  const { soundtrack, context } = makeSoundtrack();
  await soundtrack.prepare();
  soundtrack.play();
  const first = context.sources[0];
  const beforeCount = context.sources.length;

  soundtrack.stop();
  soundtrack.play();
  const fresh = context.sources.slice(beforeCount);

  assert.equal(first.stopped, true, 'old source must not overlap the new loop');
  assert.ok(fresh.length >= 1);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(soundtrack.playing, true);
  for (const source of fresh) assert.equal(source.stopped, false, 'new source must stay alive');
  soundtrack.stop();
});

test('toggle switches between playing and stopped', async () => {
  const { soundtrack } = makeSoundtrack();
  await soundtrack.prepare();
  assert.equal(soundtrack.toggle(), true);
  assert.equal(soundtrack.playing, true);
  assert.equal(soundtrack.toggle(), false);
  assert.equal(soundtrack.playing, false);
});

test('missing AudioContext leaves the soundtrack unavailable but silent', async () => {
  const { soundtrack } = makeSoundtrack({
    contextFactory: () => {
      throw new Error('no audio');
    },
  });
  assert.equal(await soundtrack.prepare(), false);
  assert.equal(soundtrack.available, false);
  assert.equal(soundtrack.play(), false);
});
