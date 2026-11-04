import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEnvironment, nextTier, pickQuality, qualitySettings } from '../src/quality.js';
import { detectWebGL } from '../src/webglSupport.js';

test('mobile devices always get the low tier', () => {
  assert.equal(pickQuality({ isMobile: true, cores: 12, webgl2: true }), 'low');
});

test('desktop with enough cores gets the high tier', () => {
  assert.equal(pickQuality({ isMobile: false, cores: 8, webgl2: true }), 'high');
  assert.equal(pickQuality({ isMobile: false, cores: 16, webgl2: true }), 'high');
});

test('weak or WebGL1-only devices fall back to low', () => {
  assert.equal(pickQuality({ isMobile: false, cores: 2, webgl2: true }), 'low');
  assert.equal(pickQuality({ isMobile: false, cores: 16, webgl2: false }), 'low');
});

test('low tier fits the mobile instance budget', () => {
  const low = qualitySettings('low');
  const high = qualitySettings('high');
  assert.ok(low.ring * low.ring <= 1200, `low ring ${low.ring} too big`);
  assert.ok(high.ring > low.ring);
  assert.ok(low.pixelRatio <= 1.25);
  assert.ok(high.pixelRatio <= 2);
  assert.equal(low.bloom, true);
});

test('tier only degrades, never oscillates back up', () => {
  assert.equal(nextTier('high', 60), 'high');
  assert.equal(nextTier('high', 38), 'low');
  assert.equal(nextTier('low', 60), 'low');
  assert.equal(nextTier('high', 45), 'high');
});

test('environment detection understands mobile and Telegram user agents', () => {
  const desktop = detectEnvironment(
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', hardwareConcurrency: 10, maxTouchPoints: 0 },
    { innerWidth: 1440, devicePixelRatio: 2 },
  );
  assert.equal(desktop.isMobile, false);

  const iphone = detectEnvironment(
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', hardwareConcurrency: 6, maxTouchPoints: 5 },
    { innerWidth: 390, devicePixelRatio: 3 },
  );
  assert.equal(iphone.isMobile, true);

  const telegram = detectEnvironment(
    { userAgent: 'Mozilla/5.0 (Linux; Android 14) Telegram-Android/12.0', hardwareConcurrency: 8, maxTouchPoints: 5 },
    { innerWidth: 412, devicePixelRatio: 2.6 },
  );
  assert.equal(telegram.isMobile, true);
});

test('webgl detection reports unsupported, WebGL1 and WebGL2', () => {
  assert.deepEqual(detectWebGL(() => ({ getContext: () => null })), { supported: false, version: 0 });
  assert.deepEqual(
    detectWebGL(() => ({ getContext: (name) => (name === 'webgl' ? {} : null) })),
    { supported: true, version: 1 },
  );
  assert.deepEqual(
    detectWebGL(() => ({ getContext: (name) => (name === 'webgl2' ? {} : null) })),
    { supported: true, version: 2 },
  );
  assert.deepEqual(
    detectWebGL(() => {
      throw new Error('no canvas');
    }),
    { supported: false, version: 0 },
  );
});
