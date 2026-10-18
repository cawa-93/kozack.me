import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 24_000;
const TAU = Math.PI * 2;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIRECTORY = resolve(SCRIPT_DIRECTORY, '../public/assets/audio');

function createBuffer(durationSeconds) {
  return new Float64Array(Math.ceil(durationSeconds * SAMPLE_RATE));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function softClip(value) {
  return Math.tanh(value * 1.25) / Math.tanh(1.25);
}

function envelope(time, duration, attack, release, curve = 1) {
  const attackGain = attack <= 0 ? 1 : clamp(time / attack, 0, 1);
  const releaseGain = release <= 0
    ? 1
    : clamp((duration - time) / release, 0, 1);
  return Math.min(attackGain, releaseGain) ** curve;
}

function addTone(buffer, options) {
  const {
    start,
    duration,
    frequency,
    frequencyEnd = frequency,
    amplitude,
    attack = 0.005,
    release = Math.min(0.15, duration * 0.5),
    wave = 'sine',
    harmonics = [],
    vibratoHz = 0,
    vibratoDepth = 0,
    curve = 1,
  } = options;
  const firstSample = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  let phase = 0;

  for (let offset = 0; offset < sampleCount; offset += 1) {
    const index = firstSample + offset;
    if (index >= buffer.length) {
      break;
    }

    const time = offset / SAMPLE_RATE;
    const progress = clamp(time / duration, 0, 1);
    const glideFrequency = frequency * (frequencyEnd / frequency) ** progress;
    const vibrato = 1 + Math.sin(TAU * vibratoHz * time) * vibratoDepth;
    phase += (TAU * glideFrequency * vibrato) / SAMPLE_RATE;

    let sample;
    if (wave === 'triangle') {
      sample = triangle(phase);
    } else if (wave === 'square') {
      sample = Math.sin(phase) >= 0 ? 1 : -1;
    } else {
      sample = Math.sin(phase);
    }

    for (const [multiple, strength] of harmonics) {
      sample += Math.sin(phase * multiple) * strength;
    }

    buffer[index] += sample
      * amplitude
      * envelope(time, duration, attack, release, curve);
  }
}

function addNoise(buffer, options) {
  const {
    start,
    duration,
    amplitude,
    attack = 0,
    release = duration,
    seed = 1,
    lowPass = 0.12,
    highPass = 0,
  } = options;
  const firstSample = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  let state = seed >>> 0;
  let low = 0;

  for (let offset = 0; offset < sampleCount; offset += 1) {
    const index = firstSample + offset;
    if (index >= buffer.length) {
      break;
    }
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const raw = (state / 0xffff_ffff) * 2 - 1;
    const previousLow = low;
    low += (raw - low) * lowPass;
    const filtered = highPass > 0
      ? low - previousLow * highPass
      : low;
    const time = offset / SAMPLE_RATE;
    buffer[index] += filtered
      * amplitude
      * envelope(time, duration, attack, release, 1.4);
  }
}

function addBell(buffer, start, note, amplitude = 0.16, duration = 0.72) {
  const frequency = midi(note);
  addTone(buffer, {
    start,
    duration,
    frequency,
    amplitude,
    attack: 0.004,
    release: duration,
    harmonics: [[2, 0.28], [3, 0.11], [4, 0.04]],
    curve: 0.72,
  });
}

function addPluck(buffer, start, note, amplitude = 0.12, duration = 0.34) {
  addTone(buffer, {
    start,
    duration,
    frequency: midi(note),
    amplitude,
    attack: 0.003,
    release: duration,
    wave: 'triangle',
    harmonics: [[2, 0.16], [3, 0.06]],
    curve: 0.65,
  });
}

function addPad(buffer, start, duration, notes, amplitude) {
  const voiceAmplitude = amplitude / notes.length;
  for (const [index, note] of notes.entries()) {
    addTone(buffer, {
      start,
      duration,
      frequency: midi(note),
      amplitude: voiceAmplitude,
      attack: 0.35,
      release: 0.45,
      harmonics: [[2, 0.07]],
      vibratoHz: 4.1 + index * 0.17,
      vibratoDepth: 0.0015,
    });
  }
}

function addKick(buffer, start, amplitude = 0.25) {
  addTone(buffer, {
    start,
    duration: 0.2,
    frequency: 118,
    frequencyEnd: 48,
    amplitude,
    attack: 0.002,
    release: 0.19,
    curve: 0.7,
  });
  addNoise(buffer, {
    start,
    duration: 0.035,
    amplitude: amplitude * 0.18,
    release: 0.035,
    lowPass: 0.2,
    seed: 91 + Math.round(start * 100),
  });
}

function addShaker(buffer, start, amplitude = 0.08, seed = 1) {
  addNoise(buffer, {
    start,
    duration: 0.08,
    amplitude,
    attack: 0.002,
    release: 0.075,
    lowPass: 0.68,
    highPass: 0.98,
    seed,
  });
}

function makeMenuMusic() {
  const duration = 12;
  const buffer = createBuffer(duration);
  const chords = [
    [48, 55, 59, 64],
    [45, 52, 55, 60],
    [41, 48, 52, 57],
    [43, 50, 55, 59],
  ];
  const arpeggios = [
    [72, 76, 79, 83, 79, 76, 74, 79],
    [69, 72, 76, 79, 76, 72, 71, 76],
    [65, 69, 72, 76, 72, 69, 67, 72],
    [67, 71, 74, 79, 74, 71, 69, 74],
  ];

  for (let bar = 0; bar < 4; bar += 1) {
    const barStart = bar * 3;
    addPad(buffer, barStart + 0.02, 2.94, chords[bar], 0.2);
    for (let step = 0; step < 8; step += 1) {
      addPluck(buffer, barStart + step * 0.375 + 0.02, arpeggios[bar][step], 0.095, 0.31);
    }
    addBell(buffer, barStart + 0.02, arpeggios[bar][0] + 12, 0.045, 0.82);
    addShaker(buffer, barStart + 1.5, 0.025, 700 + bar);
  }

  return buffer;
}

function makeLevelMusic() {
  const duration = 12;
  const buffer = createBuffer(duration);
  const chords = [
    [45, 52, 57, 60],
    [41, 48, 53, 57],
    [43, 50, 55, 59],
    [40, 47, 52, 55],
    [45, 52, 57, 60],
    [43, 50, 55, 59],
  ];
  const bassRoots = [45, 41, 43, 40, 45, 43];
  const motifs = [
    [69, 72, 76, 72, 74, 72, 69, 67],
    [65, 69, 72, 69, 67, 69, 65, 64],
    [67, 71, 74, 71, 72, 71, 67, 66],
    [64, 67, 71, 67, 69, 67, 64, 62],
    [69, 72, 76, 79, 76, 74, 72, 69],
    [67, 71, 74, 79, 74, 71, 69, 67],
  ];

  for (let bar = 0; bar < 6; bar += 1) {
    const barStart = bar * 2;
    addPad(buffer, barStart + 0.015, 1.94, chords[bar], 0.115);
    for (let beat = 0; beat < 4; beat += 1) {
      const beatStart = barStart + beat * 0.5;
      addKick(buffer, beatStart + 0.01, beat % 2 === 0 ? 0.2 : 0.14);
      addPluck(buffer, beatStart + 0.015, bassRoots[bar] + (beat === 3 ? 7 : 0), 0.11, 0.24);
      addShaker(buffer, beatStart + 0.26, 0.05, 900 + bar * 8 + beat);
    }
    for (let step = 0; step < 8; step += 1) {
      addPluck(buffer, barStart + step * 0.25 + 0.02, motifs[bar][step], 0.085, 0.2);
    }
  }

  return buffer;
}

function makeBasicShot() {
  const buffer = createBuffer(0.42);
  addTone(buffer, {
    start: 0,
    duration: 0.3,
    frequency: 480,
    frequencyEnd: 1_180,
    amplitude: 0.35,
    attack: 0.006,
    release: 0.24,
    harmonics: [[2, 0.16]],
  });
  addBell(buffer, 0.055, 88, 0.22, 0.34);
  addNoise(buffer, { start: 0, duration: 0.16, amplitude: 0.13, release: 0.16, lowPass: 0.34, seed: 11 });
  return buffer;
}

function makeRapidShot() {
  const buffer = createBuffer(0.2);
  addTone(buffer, {
    start: 0,
    duration: 0.15,
    frequency: 940,
    frequencyEnd: 1_920,
    amplitude: 0.31,
    attack: 0.002,
    release: 0.14,
    wave: 'triangle',
    harmonics: [[2, 0.08]],
  });
  addNoise(buffer, { start: 0, duration: 0.065, amplitude: 0.12, release: 0.06, lowPass: 0.55, seed: 22 });
  return buffer;
}

function makeHeavyShot() {
  const buffer = createBuffer(0.78);
  addTone(buffer, {
    start: 0,
    duration: 0.62,
    frequency: 310,
    frequencyEnd: 82,
    amplitude: 0.48,
    attack: 0.008,
    release: 0.56,
    harmonics: [[2, 0.24], [3, 0.1]],
    vibratoHz: 18,
    vibratoDepth: 0.008,
  });
  addNoise(buffer, { start: 0, duration: 0.42, amplitude: 0.33, release: 0.42, lowPass: 0.08, seed: 33 });
  addBell(buffer, 0.08, 48, 0.16, 0.62);
  return buffer;
}

function makeCoreDamage() {
  const buffer = createBuffer(0.72);
  addTone(buffer, {
    start: 0,
    duration: 0.55,
    frequency: 520,
    frequencyEnd: 205,
    amplitude: 0.32,
    attack: 0.01,
    release: 0.38,
    wave: 'triangle',
    vibratoHz: 9,
    vibratoDepth: 0.022,
  });
  addTone(buffer, {
    start: 0.1,
    duration: 0.5,
    frequency: 390,
    frequencyEnd: 165,
    amplitude: 0.16,
    attack: 0.015,
    release: 0.39,
  });
  return buffer;
}

function makeDefeat() {
  const buffer = createBuffer(3.25);
  const notes = [67, 64, 60, 55, 48];
  const starts = [0.02, 0.48, 0.95, 1.48, 2.05];
  for (let index = 0; index < notes.length; index += 1) {
    addBell(buffer, starts[index], notes[index], index === notes.length - 1 ? 0.24 : 0.19, index === notes.length - 1 ? 1.15 : 0.62);
  }
  addPad(buffer, 1.94, 1.22, [36, 43, 48, 51], 0.22);
  addTone(buffer, {
    start: 2.02,
    duration: 1.12,
    frequency: 96,
    frequencyEnd: 52,
    amplitude: 0.18,
    attack: 0.04,
    release: 0.92,
  });
  return buffer;
}

function makeUiClick() {
  const buffer = createBuffer(0.13);
  addTone(buffer, { start: 0, duration: 0.08, frequency: 690, frequencyEnd: 880, amplitude: 0.26, attack: 0.002, release: 0.07, wave: 'triangle' });
  addTone(buffer, { start: 0.035, duration: 0.075, frequency: 1_100, amplitude: 0.12, attack: 0.002, release: 0.068 });
  return buffer;
}

function makeUiHover() {
  const buffer = createBuffer(0.09);
  addTone(buffer, { start: 0, duration: 0.07, frequency: 1_180, frequencyEnd: 1_360, amplitude: 0.16, attack: 0.002, release: 0.06 });
  return buffer;
}

function makeBuildPlace() {
  const buffer = createBuffer(0.42);
  addNoise(buffer, { start: 0, duration: 0.22, amplitude: 0.26, release: 0.2, lowPass: 0.075, seed: 44 });
  addTone(buffer, { start: 0, duration: 0.2, frequency: 128, frequencyEnd: 78, amplitude: 0.3, attack: 0.004, release: 0.18 });
  addTone(buffer, { start: 0.12, duration: 0.24, frequency: 620, frequencyEnd: 780, amplitude: 0.14, attack: 0.004, release: 0.2, wave: 'triangle' });
  return buffer;
}

function makeSellRemove() {
  const buffer = createBuffer(0.48);
  addNoise(buffer, { start: 0, duration: 0.25, amplitude: 0.13, release: 0.24, lowPass: 0.3, seed: 55 });
  addTone(buffer, { start: 0, duration: 0.32, frequency: 280, frequencyEnd: 820, amplitude: 0.2, attack: 0.006, release: 0.25, wave: 'triangle' });
  addBell(buffer, 0.15, 83, 0.17, 0.28);
  addBell(buffer, 0.24, 88, 0.12, 0.22);
  return buffer;
}

function makeInvalid() {
  const buffer = createBuffer(0.28);
  addTone(buffer, { start: 0, duration: 0.12, frequency: 176, frequencyEnd: 148, amplitude: 0.27, attack: 0.003, release: 0.11, wave: 'triangle' });
  addTone(buffer, { start: 0.12, duration: 0.13, frequency: 165, frequencyEnd: 132, amplitude: 0.25, attack: 0.003, release: 0.12, wave: 'triangle' });
  return buffer;
}

function makeLevelStart() {
  const buffer = createBuffer(1.05);
  const notes = [60, 64, 67, 72];
  for (let index = 0; index < notes.length; index += 1) {
    addBell(buffer, 0.03 + index * 0.14, notes[index], 0.2, 0.62);
  }
  addTone(buffer, { start: 0, duration: 0.72, frequency: 180, frequencyEnd: 390, amplitude: 0.12, attack: 0.02, release: 0.48, wave: 'triangle' });
  return buffer;
}

function makeMineExplosion() {
  const buffer = createBuffer(1.7);
  addTone(buffer, {
    start: 0,
    duration: 1.35,
    frequency: 155,
    frequencyEnd: 34,
    amplitude: 0.58,
    attack: 0.003,
    release: 1.2,
    harmonics: [[2, 0.25], [3, 0.08]],
  });
  addNoise(buffer, {
    start: 0,
    duration: 1.2,
    amplitude: 0.62,
    attack: 0.002,
    release: 1.15,
    lowPass: 0.055,
    seed: 777,
  });
  addTone(buffer, {
    start: 0.04,
    duration: 0.52,
    frequency: 1_180,
    frequencyEnd: 220,
    amplitude: 0.21,
    attack: 0.002,
    release: 0.48,
    wave: 'triangle',
  });
  addBell(buffer, 0.1, 40, 0.22, 1.25);
  return buffer;
}

function normalize(buffer, peakTarget, edgeFadeSeconds = 0.012) {
  let peak = 0;
  for (const sample of buffer) {
    peak = Math.max(peak, Math.abs(sample));
  }
  const gain = peak > 0 ? peakTarget / peak : 1;
  const fadeSamples = Math.min(
    Math.floor(edgeFadeSeconds * SAMPLE_RATE),
    Math.floor(buffer.length / 2),
  );
  for (let index = 0; index < buffer.length; index += 1) {
    const fadeIn = fadeSamples === 0 ? 1 : clamp(index / fadeSamples, 0, 1);
    const fadeOut = fadeSamples === 0
      ? 1
      : clamp((buffer.length - 1 - index) / fadeSamples, 0, 1);
    buffer[index] = softClip(buffer[index] * gain) * Math.min(fadeIn, fadeOut);
  }
}

function encodeWave(buffer) {
  const bytesPerSample = 2;
  const dataLength = buffer.length * bytesPerSample;
  const output = Buffer.alloc(44 + dataLength);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataLength, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  output.writeUInt16LE(bytesPerSample, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < buffer.length; index += 1) {
    const value = Math.round(clamp(buffer[index], -1, 1) * 32_767);
    output.writeInt16LE(value, 44 + index * bytesPerSample);
  }
  return output;
}

const assets = [
  ['music-menu.wav', makeMenuMusic, 0.8],
  ['music-level.wav', makeLevelMusic, 0.82],
  ['shot-basic.wav', makeBasicShot, 0.86],
  ['shot-rapid.wav', makeRapidShot, 0.82],
  ['shot-heavy.wav', makeHeavyShot, 0.88],
  ['core-damage.wav', makeCoreDamage, 0.84],
  ['defeat.wav', makeDefeat, 0.84],
  ['ui-click.wav', makeUiClick, 0.72],
  ['ui-hover.wav', makeUiHover, 0.56],
  ['build-place.wav', makeBuildPlace, 0.82],
  ['sell-remove.wav', makeSellRemove, 0.78],
  ['invalid.wav', makeInvalid, 0.72],
  ['level-start.wav', makeLevelStart, 0.8],
  ['mine-explosion.wav', makeMineExplosion, 0.92],
];

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
for (const [fileName, create, peak] of assets) {
  const samples = create();
  normalize(samples, peak);
  const output = encodeWave(samples);
  await writeFile(resolve(OUTPUT_DIRECTORY, fileName), output);
  const duration = samples.length / SAMPLE_RATE;
  stdout.write(
    `${fileName.padEnd(20)} ${duration.toFixed(2)} s  ${(output.length / 1024).toFixed(1)} KiB\n`,
  );
}
