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
    this.scheduleTimer = null;
    this.nextLoopStart = 0;
    this.leadIn = 0.05;
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
        this._smoothBufferSeam();
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
    this._stopScheduler();

    const now = this.context.currentTime;
    const startAt = now + this.leadIn;
    this.nextLoopStart = startAt;
    this._scheduleLoop(this.nextLoopStart);
    this.nextLoopStart += this.buffer.duration;
    this._scheduleLoop(this.nextLoopStart);
    this.nextLoopStart += this.buffer.duration;
    this.scheduleTimer = setInterval(() => this._scheduleAhead(), 5000);
    this.scheduleTimer?.unref?.();

    const gain = this.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(now);
    } else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
    }
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(this.volume, startAt + this.fadeIn);

    this.playing = true;
    this.onChange?.(true);
    return true;
  }

  stop() {
    this._stopScheduler();
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

  _scheduleLoop(when) {
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.gain);
    source.onended = () => this.liveSources.delete(source);
    source.start(when);
    this.liveSources.add(source);
    if (!this.source) this.source = source;
  }

  _scheduleAhead() {
    if (!this.playing || !this.context || !this.buffer) return;
    const horizon = this.context.currentTime + this.buffer.duration * 1.5;
    while (this.nextLoopStart < horizon) {
      this._scheduleLoop(this.nextLoopStart);
      this.nextLoopStart += this.buffer.duration;
    }
  }

  _stopScheduler() {
    if (this.scheduleTimer === null) return;
    clearInterval(this.scheduleTimer);
    this.scheduleTimer = null;
  }

  _smoothBufferSeam() {
    const buffer = this.buffer;
    if (!buffer || typeof buffer.getChannelData !== 'function') return;
    const fade = Math.min(
      Math.round(0.005 * buffer.sampleRate),
      Math.floor(buffer.length / 10),
    );
    if (fade < 2) return;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      const first = data[0];
      for (let k = 0; k < fade; k += 1) {
        const index = data.length - 1 - k;
        const weight = 0.5 * (1 + Math.cos((Math.PI * k) / fade));
        data[index] = data[index] * (1 - weight) + first * weight;
      }
    }
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
