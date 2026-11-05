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
    this.filter = null;
    this.buffer = null;
    this.source = null;
    this.liveSources = new Set();
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
        if (typeof this.context.createBiquadFilter === 'function') {
          this.filter = this.context.createBiquadFilter();
          this.filter.type = 'highpass';
          this.filter.frequency.value = 28;
          this.gain.connect(this.filter);
          this.filter.connect(this.context.destination);
        } else {
          this.gain.connect(this.context.destination);
        }
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

    this._stopLiveSources();

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.gain);
    source.onended = () => this.liveSources.delete(source);

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

    this.liveSources.add(source);
    this.source = source;
    this.playing = true;
    this.onChange?.(true);
    return true;
  }

  stop() {
    if (!this.context || this.liveSources.size === 0) {
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

    this.source = null;
    this.playing = false;
    this.onChange?.(false);

    const fading = [...this.liveSources];
    setTimeout(() => {
      for (const source of fading) {
        try {
          source.stop();
        } catch {}
        source.disconnect?.();
        this.liveSources.delete(source);
      }
    }, this.fadeOut * 1000 + 50);
  }

  _stopLiveSources() {
    for (const source of this.liveSources) {
      try {
        source.stop();
      } catch {}
      source.disconnect?.();
    }
    this.liveSources.clear();
    this.source = null;
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
