import { mulberry32 } from '../../src/noise.js';

const TAU = Math.PI * 2;
const BEATS_PER_BAR = 4;

const CHORDS = [
  { root: 33, pad: [57, 60, 64, 69], arp: [69, 72, 76, 79] },
  { root: 29, pad: [53, 57, 60, 65], arp: [65, 69, 72, 77] },
  { root: 36, pad: [48, 52, 55, 60], arp: [60, 64, 67, 72] },
  { root: 31, pad: [55, 59, 62, 67], arp: [67, 71, 74, 79] },
];

const BASS_OFFSETS = [0, 0, 12, 0, 7, 0, 12, 0];
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 0, 2, 0, 1, 2, 3, 2, 3, 1, 2];
const PAD_PAN = [-0.55, -0.18, 0.18, 0.55];

const LEAD_MOTIF = [
  [[69, 2], [72, 1], [76, 1]],
  [[77, 2], [76, 1], [72, 1]],
  [[67, 2], [72, 2]],
  [[71, 4]],
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function panGains(pan) {
  const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function adsr(t, duration, attack, decay, sustain, release) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < duration) return sustain;
  const tail = t - duration;
  if (tail < release) return sustain * (1 - tail / release);
  return 0;
}

function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function saw(phase, increment) {
  return 2 * phase - 1 - polyBlep(phase, increment);
}

function createFilter(sampleRate) {
  let low = 0;
  let band = 0;
  return {
    process(input, cutoff, q = 0.9) {
      const f = 2 * Math.sin((Math.PI * Math.min(cutoff, sampleRate * 0.44)) / sampleRate);
      low += f * band;
      const high = input - low - q * band;
      band += f * high;
      return low;
    },
  };
}

export function loopSampleCount(bpm, bars, sampleRate = 44100) {
  return Math.round(((bars * BEATS_PER_BAR * 60) / bpm) * sampleRate);
}

export function encodeWav(left, right, sampleRate = 44100, bitDepth = 16) {
  const channels = 2;
  const bytesPerSample = bitDepth / 8;
  const dataSize = left.length * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < left.length; i += 1) {
    for (const sample of [left[i], right[i]]) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, Math.round(clamped * 32767), true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

export function renderTrack({ bpm = 108, bars = 16, sampleRate = 44100, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const totalSamples = loopSampleCount(bpm, bars, sampleRate);
  const beatSamples = (60 / bpm) * sampleRate;
  const barSamples = beatSamples * BEATS_PER_BAR;
  const sixteenth = beatSamples / 4;
  const eighth = beatSamples / 2;

  const bass = new Float32Array(totalSamples);
  const drumsL = new Float32Array(totalSamples);
  const drumsR = new Float32Array(totalSamples);
  const padL = new Float32Array(totalSamples);
  const padR = new Float32Array(totalSamples);
  const arpL = new Float32Array(totalSamples);
  const arpR = new Float32Array(totalSamples);
  const leadL = new Float32Array(totalSamples);
  const leadR = new Float32Array(totalSamples);
  const fxL = new Float32Array(totalSamples);
  const fxR = new Float32Array(totalSamples);

  const wrapIndex = (index) => ((index % totalSamples) + totalSamples) % totalSamples;
  const add = (buffer, index, value) => {
    buffer[wrapIndex(index)] += value;
  };

  const noise = () => rng() * 2 - 1;

  function renderBass(start, midi, velocity, gateSamples) {
    const frequency = midiToFreq(midi);
    const increment = frequency / sampleRate;
    const filter = createFilter(sampleRate);
    let phase = 0;
    let phaseDetuned = 0;
    let subPhase = 0;
    const length = Math.ceil(gateSamples + 0.08 * sampleRate);
    const gain = 0.25 * velocity;

    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const transient = t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) * 7);
      const gate = t < gateSamples / sampleRate ? 1 : Math.exp(-(t - gateSamples / sampleRate) * 70);
      phase += increment;
      if (phase >= 1) phase -= 1;
      phaseDetuned += increment * 1.006;
      if (phaseDetuned >= 1) phaseDetuned -= 1;
      subPhase += increment * 0.5;
      if (subPhase >= 1) subPhase -= 1;

      const raw =
        saw(phase, increment) * 0.6 +
        saw(phaseDetuned, increment * 1.006) * 0.2 +
        Math.sin(TAU * subPhase) * 0.5;
      const cutoff = 140 + 1100 * Math.exp(-t * 24) + velocity * 220;
      const filtered = filter.process(raw, cutoff, 1.05);
      add(bass, start + i, Math.tanh(filtered * 1.9) * transient * gate * gain);
    }
  }

  function renderPad(start, midi, lengthSamples, pan, gain) {
    const frequency = midiToFreq(midi);
    const increment = frequency / sampleRate;
    const filter = createFilter(sampleRate);
    const [gainL, gainR] = panGains(pan);
    let phaseA = rng();
    let phaseB = rng();
    let phaseC = rng();
    const total = Math.ceil(lengthSamples + 0.5 * sampleRate);
    const attack = 0.28;
    const release = 0.45;
    const duration = lengthSamples / sampleRate;

    for (let i = 0; i < total; i += 1) {
      const t = i / sampleRate;
      const envelope = adsr(t, duration, attack, 0.15, 0.82, release);
      if (envelope <= 0) continue;
      phaseA += increment;
      if (phaseA >= 1) phaseA -= 1;
      phaseB += increment * 1.004;
      if (phaseB >= 1) phaseB -= 1;
      phaseC += increment * 0.996;
      if (phaseC >= 1) phaseC -= 1;

      const raw =
        (saw(phaseA, increment) + saw(phaseB, increment * 1.004) + saw(phaseC, increment * 0.996)) / 3;
      const filtered = filter.process(raw, 1050, 0.72);
      const sample = filtered * envelope * gain;
      add(padL, start + i, sample * gainL);
      add(padR, start + i, sample * gainR);
    }
  }

  function renderArp(start, midi, velocity, pan, gateSamples) {
    const frequency = midiToFreq(midi);
    const increment = frequency / sampleRate;
    const filter = createFilter(sampleRate);
    const [gainL, gainR] = panGains(pan);
    let phase = 0;
    const length = Math.ceil(gateSamples + 0.09 * sampleRate);
    const gain = 0.16 * velocity;

    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const attack = t < 0.003 ? t / 0.003 : 1;
      const gate = t < gateSamples / sampleRate ? 1 : Math.exp(-(t - gateSamples / sampleRate) * 55);
      phase += increment;
      if (phase >= 1) phase -= 1;
      const cutoff = 280 + 2600 * Math.exp(-t * 30) + velocity * 300;
      const filtered = filter.process(saw(phase, increment), cutoff, 0.85);
      const sample = Math.tanh(filtered * 1.6) * Math.exp(-t * 7) * attack * gate * gain;
      add(arpL, start + i, sample * gainL);
      add(arpR, start + i, sample * gainR);
    }
  }

  function renderLead(start, midi, lengthSamples, velocity) {
    const frequency = midiToFreq(midi);
    let phase = 0;
    let secondPhase = 0;
    const filter = createFilter(sampleRate);
    const total = Math.ceil(lengthSamples + 0.55 * sampleRate);
    const duration = lengthSamples / sampleRate;
    const gain = 0.19 * velocity;

    for (let i = 0; i < total; i += 1) {
      const t = i / sampleRate;
      const envelope = adsr(t, duration, 0.025, 0.12, 0.72, 0.55);
      if (envelope <= 0) continue;
      const vibratoDepth = 0.0035 * clamp((t - 0.12) / 0.35, 0, 1);
      const vibrato = 1 + vibratoDepth * Math.sin(TAU * 5.1 * t);
      const increment = (frequency / sampleRate) * vibrato;
      phase += increment;
      if (phase >= 1) phase -= 1;
      secondPhase += increment * 0.5;
      if (secondPhase >= 1) secondPhase -= 1;

      const raw = saw(phase, increment) * 0.75 + Math.sin(TAU * secondPhase) * 0.25;
      const filtered = filter.process(raw, 2400, 0.8);
      const sample = Math.tanh(filtered * 1.35) * envelope * gain;
      add(leadL, start + i, sample * 0.9);
      add(leadR, start + i, sample * 0.75);
    }
  }

  function renderKick(start, velocity) {
    let phase = 0;
    const length = Math.ceil(0.42 * sampleRate);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const frequency = 46 + 120 * Math.exp(-t * 26);
      phase += (TAU * frequency) / sampleRate;
      const body = Math.sin(phase) * Math.exp(-t * 7.5);
      const click = noise() * Math.exp(-t * 190) * 0.35;
      const sample = Math.tanh((body + click) * 1.5) * velocity * 0.9;
      add(drumsL, start + i, sample);
      add(drumsR, start + i, sample);
    }
  }

  function renderSnare(start, velocity) {
    let lastNoise = 0;
    const length = Math.ceil(0.3 * sampleRate);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const white = noise();
      lastNoise += (white - lastNoise) * 0.35;
      const band = white - lastNoise;
      const tone = Math.sin(TAU * 185 * t) * Math.exp(-t * 28) * 0.4;
      const envelope = Math.exp(-t * 13);
      const burst = t < 0.022 ? 1 : Math.exp(-(t - 0.022) * 60) * 0.35;
      const clap = white * burst * 0.5;
      const sample = Math.tanh((band * 0.8 + tone + clap) * envelope) * velocity * 0.5;
      add(drumsL, start + i, sample * 0.95);
      add(drumsR, start + i, sample * 0.85);
    }
  }

  function renderHat(start, velocity, open, pan) {
    let lastNoise = 0;
    const [gainL, gainR] = panGains(pan);
    const length = Math.ceil((open ? 0.18 : 0.055) * sampleRate);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const white = noise();
      const high = white - lastNoise;
      lastNoise += (white - lastNoise) * 0.55;
      const envelope = Math.exp(-t * (open ? 14 : 60));
      const sample = high * envelope * velocity * 0.16;
      add(drumsL, start + i, sample * gainL);
      add(drumsR, start + i, sample * gainR);
    }
  }

  function renderCrash(start, velocity) {
    let lastNoise = 0;
    const length = Math.ceil(1.4 * sampleRate);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const white = noise();
      const high = white - lastNoise;
      lastNoise += (white - lastNoise) * 0.75;
      const envelope = Math.exp(-t * 3.2) * (t < 0.004 ? t / 0.004 : 1);
      const sample = high * envelope * velocity * 0.18;
      add(fxL, start + i, sample);
      add(fxR, start + i, sample * 0.9);
    }
  }

  function renderRiser(start, lengthSamples, velocity) {
    const filter = createFilter(sampleRate);
    let lastNoise = 0;
    for (let i = 0; i < lengthSamples; i += 1) {
      const t = i / lengthSamples;
      const white = noise();
      lastNoise = white;
      const cutoff = 280 + 5200 * t * t;
      const filtered = filter.process(white, cutoff, 0.9);
      const sample = filtered * t * t * velocity * 0.35;
      add(fxL, start + i, sample);
      add(fxR, start + i, sample * 0.92);
    }
  }

  function renderGlitch(start, lengthSamples, velocity) {
    let held = 0;
    for (let i = 0; i < lengthSamples; i += 1) {
      if (i % 4 === 0) held = noise();
      const crushed = Math.round(held * 7) / 7;
      const gate = i % 6125 < 2000 ? 1 : 0.2;
      const sample = crushed * gate * velocity * 0.16;
      add(fxL, start + i, sample);
      add(fxR, start + i, sample * -0.8);
    }
  }

  for (let barIndex = 0; barIndex < bars; barIndex += 1) {
    const chord = CHORDS[barIndex % CHORDS.length];
    const barStart = barIndex * barSamples;

    chord.pad.forEach((note, index) => {
      renderPad(barStart, note, barSamples * 0.98, PAD_PAN[index % PAD_PAN.length], 0.09);
    });

    for (let step = 0; step < 8; step += 1) {
      const midi = chord.root + BASS_OFFSETS[step];
      const velocity = step === 0 || step === 3 ? 1 : 0.82;
      renderBass(barStart + step * eighth, midi, velocity, eighth * 0.82);
      if (barIndex >= 8 && step === 7) {
        renderBass(barStart + step * eighth + sixteenth, midi, 0.55, sixteenth * 0.9);
      }
    }

    for (let beat = 0; beat < 4; beat += 1) {
      renderKick(barStart + beat * beatSamples, beat === 0 ? 1 : 0.92);
      if (barIndex % 8 === 7 && beat === 3) {
        renderKick(barStart + beat * beatSamples + eighth, 0.55);
      }
    }

    renderSnare(barStart + beatSamples, 0.9);
    renderSnare(barStart + 3 * beatSamples, 0.95);

    for (let step = 0; step < 8; step += 1) {
      const open = barIndex >= 4 && step % 2 === 1;
      const velocity = step % 2 === 0 ? 0.85 : 0.55;
      renderHat(barStart + step * eighth, velocity, open, step % 2 === 0 ? -0.22 : 0.22);
    }
    if (barIndex >= 8) {
      for (let step = 0; step < 16; step += 1) {
        if (step % 2 === 0) continue;
        renderHat(barStart + step * sixteenth, 0.3, false, step % 4 === 1 ? -0.35 : 0.35);
      }
    }

    for (let step = 0; step < 16; step += 1) {
      const index = ARP_PATTERN[step];
      const octave = step % 8 >= 4 ? 12 : 0;
      const midi = chord.arp[index] + octave;
      const velocity = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.75 : 0.55;
      const pan = step % 2 === 0 ? -0.32 : 0.32;
      renderArp(barStart + step * sixteenth, midi, velocity, pan, sixteenth * 0.62);
      if ((barIndex === 10 || barIndex === 11) && step % 4 === 0) {
        renderArp(barStart + step * sixteenth + sixteenth * 0.5, midi + 12, 0.35, 0, sixteenth * 0.4);
      }
    }

    const leadBars = barIndex >= 4 && barIndex <= 7;
    const climaxBars = barIndex >= 12 && barIndex <= 15;
    if (leadBars || climaxBars) {
      const motif = LEAD_MOTIF[barIndex % 4];
      let cursor = barStart;
      for (const [note, beats] of motif) {
        const shift = climaxBars ? 12 : 0;
        renderLead(cursor, note + shift, beats * beatSamples * 0.96, climaxBars ? 0.9 : 0.85);
        cursor += beats * beatSamples;
      }
    }

    if (barIndex === 7 || barIndex === 15) {
      renderRiser(barStart + 2 * beatSamples, 2 * beatSamples, 0.8);
      for (let hit = 0; hit < 4; hit += 1) {
        renderSnare(barStart + 3 * beatSamples + hit * sixteenth, 0.5 + hit * 0.12);
      }
    }

    if (barIndex === 0 || barIndex === 8) {
      renderCrash(barStart, 0.9);
    }

    if (barIndex === 11) {
      for (let hit = 0; hit < 3; hit += 1) {
        renderGlitch(barStart + (4 + hit * 4) * sixteenth, sixteenth * 2, 0.9);
      }
    }
  }

  const duckedBass = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    const sinceBeat = i % Math.round(beatSamples);
    const duck = 1 - 0.5 * Math.exp(-sinceBeat / (0.075 * sampleRate));
    duckedBass[i] = bass[i] * duck;
  }

  for (let i = 0; i < totalSamples; i += 1) {
    if (barIndexFor(i) >= 10 && barIndexFor(i) <= 11) {
      const held = arpL[Math.floor(i / 3) * 3] ?? arpL[i];
      const crushed = Math.round(held * 24) / 24;
      const gate = i % Math.round(sixteenth) < Math.round(sixteenth * 0.62) ? 1 : 0.3;
      arpL[i] = crushed * gate;
      arpR[i] = crushed * gate;
    }
  }

  function barIndexFor(sample) {
    return Math.floor(sample / barSamples) % bars;
  }

  const delaySamples = Math.max(1, Math.round(beatSamples * 0.75));
  const sendL = new Float32Array(totalSamples);
  const sendR = new Float32Array(totalSamples);
  const verbSend = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i += 1) {
    const duck = 1 - 0.5 * Math.exp(-(i % Math.round(beatSamples)) / (0.075 * sampleRate));
    sendL[i] = (arpL[i] * 0.35 + leadL[i] * 0.3) * duck;
    sendR[i] = (arpR[i] * 0.35 + leadR[i] * 0.3) * duck;
    verbSend[i] =
      padL[i] * 0.32 +
      padR[i] * 0.32 +
      drumsL[i] * 0.12 +
      drumsR[i] * 0.12 +
      leadL[i] * 0.22 +
      leadR[i] * 0.22 +
      fxL[i] * 0.35 +
      fxR[i] * 0.35;
  }

  function pingPongDelay(inputL, inputR) {
    const lineL = new Float32Array(delaySamples);
    const lineR = new Float32Array(delaySamples);
    const wetL = new Float32Array(totalSamples);
    const wetR = new Float32Array(totalSamples);
    for (let n = 0; n < totalSamples * 2; n += 1) {
      const readIndex = n % delaySamples;
      const sourceIndex = n % totalSamples;
      const outL = lineL[readIndex];
      const outR = lineR[readIndex];
      lineL[readIndex] = inputL[sourceIndex] + outR * 0.38;
      lineR[readIndex] = inputR[sourceIndex] + outL * 0.38;
      wetL[sourceIndex] = outL;
      wetR[sourceIndex] = outR;
    }
    return [wetL, wetR];
  }

  function reverb(input, sampleRateValue, spread) {
    const combLengths = [1116, 1188, 1277, 1356].map((length) => length + spread);
    const allpassLengths = [556, 441].map((length) => length + spread);
    const combs = combLengths.map((length) => ({
      line: new Float32Array(length),
      index: 0,
      damp: 0,
    }));
    const allpasses = allpassLengths.map((length) => ({
      line: new Float32Array(length),
      index: 0,
    }));
    const wet = new Float32Array(totalSamples);
    for (let n = 0; n < totalSamples * 2; n += 1) {
      const sourceIndex = n % totalSamples;
      let sum = 0;
      for (const comb of combs) {
        const out = comb.line[comb.index];
        comb.damp = out * 0.62 + comb.damp * 0.38;
        comb.line[comb.index] = input[sourceIndex] + comb.damp * 0.77;
        comb.index = (comb.index + 1) % comb.line.length;
        sum += out;
      }
      let value = sum / combs.length;
      for (const allpass of allpasses) {
        const out = allpass.line[allpass.index];
        const next = value + out * 0.5;
        allpass.line[allpass.index] = next;
        allpass.index = (allpass.index + 1) % allpass.line.length;
        value = out - next * 0.5;
      }
      wet[sourceIndex] = value;
    }
    return wet;
  }

  const [delayL, delayR] = pingPongDelay(sendL, sendR);
  const reverbL = reverb(verbSend, sampleRate, 0);
  const reverbR = reverb(verbSend, sampleRate, 23);

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  let previousL = 0;
  let previousR = 0;
  let dcL = 0;
  let dcR = 0;
  let peak = 0;

  for (let i = 0; i < totalSamples; i += 1) {
    const sinceBeat = i % Math.round(beatSamples);
    const duck = 1 - 0.5 * Math.exp(-sinceBeat / (0.075 * sampleRate));
    let mixL =
      duckedBass[i] * 1.0 +
      drumsL[i] * 0.52 +
      padL[i] * 1.15 * duck +
      arpL[i] * 1.0 * duck +
      leadL[i] * 0.9 +
      fxL[i] * 0.55 +
      delayL[i] * 0.42 +
      reverbL[i] * 0.55;
    let mixR =
      duckedBass[i] * 1.0 +
      drumsR[i] * 0.52 +
      padR[i] * 1.15 * duck +
      arpR[i] * 1.0 * duck +
      leadR[i] * 0.9 +
      fxR[i] * 0.55 +
      delayR[i] * 0.42 +
      reverbR[i] * 0.55;

    dcL = mixL - previousL + 0.995 * dcL;
    dcR = mixR - previousR + 0.995 * dcR;
    previousL = mixL;
    previousR = mixR;

    mixL = Math.tanh(dcL * 1.15);
    mixR = Math.tanh(dcR * 1.15);
    left[i] = mixL;
    right[i] = mixR;
    peak = Math.max(peak, Math.abs(mixL), Math.abs(mixR));
  }

  const normalization = peak > 0 ? 0.86 / peak : 1;
  for (let i = 0; i < totalSamples; i += 1) {
    left[i] *= normalization;
    right[i] *= normalization;
  }

  const seamFade = Math.min(
    Math.round(0.004 * sampleRate),
    Math.floor(totalSamples / 10),
  );
  const smoothSeam = (buffer) => {
    const first = buffer[0];
    for (let k = 0; k < seamFade; k += 1) {
      const index = buffer.length - 1 - k;
      const weight = 0.5 * (1 + Math.cos((Math.PI * k) / seamFade));
      buffer[index] = buffer[index] * (1 - weight) + first * weight;
    }
  };
  smoothSeam(left);
  smoothSeam(right);

  return {
    left,
    right,
    bpm,
    bars,
    sampleRate,
    stems: {
      bass: duckedBass,
      drumsL,
      drumsR,
      padL,
      padR,
      arpL,
      arpR,
      leadL,
      leadR,
      fxL,
      fxR,
    },
  };
}
