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

test('play resumes the context, loops the buffer and fades in', async () => {
  const { soundtrack, context } = makeSoundtrack();
  await soundtrack.prepare();
  assert.equal(soundtrack.play(), true);
  assert.equal(soundtrack.playing, true);
  assert.equal(context.state, 'running');

  const source = context.sources[0];
  assert.equal(source.loop, true);
  assert.equal(source.buffer.duration, 35.556);
  assert.equal(source.started, 10);
  assert.ok(
    context.events.some(([type, value]) => type === 'ramp' && value === 0.55),
    'gain should fade in to the configured volume',
  );
});

test('stop fades out and stops the source after the fade', async () => {
  const { soundtrack, context } = makeSoundtrack();
  await soundtrack.prepare();
  soundtrack.play();
  const source = context.sources[0];
  soundtrack.stop();
  assert.equal(soundtrack.playing, false);
  assert.ok(context.events.some(([type, value]) => type === 'ramp' && value === 0));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(source.stopped, true);
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
