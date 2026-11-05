export class Soundtrack {
  constructor({
    url,
    volume = 0.55,
    fadeIn = 0.6,
    fadeOut = 0.35,
    contextFactory,
    fetchImpl,
  } = {}) {
    this.url = url;
    this.volume = volume;
    this.fadeIn = fadeIn;
    this.fadeOut = fadeOut;
    this.contextFactory =
      contextFactory ??
      (() => {
        const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!AudioContextClass) throw new Error('AudioContext is not supported');
        return new AudioContextClass();
      });
    this.fetchImpl = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.context = null;
    this.gain = null;
    this.buffer = null;
    this.source = null;
    this.duration = 0;
    this.available = false;
    this.playing = false;
    this.error = null;
    this.onChange = null;
    this.preparePromise = null;
  }

  prepare() {
    if (this.preparePromise) return this.preparePromise;
    this.preparePromise = (async () => {
      try {
        this.context = this.contextFactory();
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.context.destination);
        const response = await this.fetchImpl(this.url);
        const bytes = await response.arrayBuffer();
        this.buffer = await this.context.decodeAudioData(bytes);
        this.duration = this.buffer.duration;
        this.available = true;
      } catch (error) {
        this.error = error;
        this.available = false;
      }
      return this.available;
    })();
    return this.preparePromise;
  }

  play() {
    if (!this.available || !this.context || !this.buffer) return false;

    try {
      const resumed = this.context.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    } catch {}

    if (this.source) {
      try {
        this.source.stop();
      } catch {}
      this.source.disconnect?.();
      this.source = null;
    }

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.gain);

    const gain = this.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(now);
    } else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
    }
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(this.volume, now + this.fadeIn);
    source.start(now);

    this.source = source;
    this.playing = true;
    this.onChange?.(true);
    return true;
  }

  stop() {
    if (!this.context || !this.source) {
      this.playing = false;
      return;
    }

    const now = this.context.currentTime;
    const gain = this.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(now);
    } else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
    }
    gain.linearRampToValueAtTime(0, now + this.fadeOut);

    const source = this.source;
    this.source = null;
    this.playing = false;
    this.onChange?.(false);

    setTimeout(() => {
      try {
        source.stop();
      } catch {}
      source.disconnect?.();
    }, this.fadeOut * 1000 + 50);
  }

  toggle() {
    if (this.playing) {
      this.stop();
      return false;
    }
    return this.play();
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.gain && this.playing) {
      this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.08);
    }
  }
}
