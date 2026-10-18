// Звук (§14) — синтез у WebAudio, без зовнішніх ассетів. Музики немає (§14.1).
// Павуки звучать позиційно: дистанція й напрямок — шляхом по лабіринту (§14.2), оклюзія — lowpass.

import {
  AMBIENT_DUCK_DISTANCE,
  AUDIO_BFS_INTERVAL,
  SPIDER_AUDIBLE_CALM,
  SPIDER_AUDIBLE_HUNT,
  SPIDER_NOISE_BY_LEVEL,
} from "../config";
import { cellAt, cellCenter, type NavGrid } from "../ai/nav";
import type { Spider } from "../ai/spider";
import type { GameEvent } from "../game/events";
import type { Settings } from "../game/settings";
import type { World } from "../game/world";
import { T } from "../maze/grid";
import type { EdgeCue } from "../render/renderer";
import { lineOfSight } from "../vision/los";

interface SpiderVoice {
  plants: number;
  clickAt: number;
  /** Звуковий стан для візуальних підказок. */
  gain: number;
  pan: number;
  angle: number;
  muffled: boolean;
  cryFlash: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private masterFilter!: BiquadFilterNode;
  private effects!: GainNode;
  /** Павуки — власна підсилена шина під ефектами: ембієнт їх ніколи не маскує (§14.2). */
  private spiderBus!: GainNode;
  private ambient!: GainNode;
  private ambientDuck!: GainNode;
  private noise!: AudioBuffer;
  private ambientNodes: AudioNode[] = [];
  private ambientLevel = -1;
  private voices = new Map<number, SpiderVoice>();
  private bfsTimer = 0;
  private soundDist: Int32Array | null = null;
  private soundParent: Int32Array | null = null;
  private breath: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private duckUntil = 0;
  private settings: Settings;
  edgeCues: EdgeCue[] = [];

  constructor(settings: Settings) {
    this.settings = settings;
  }

  /** Лише в обробнику жесту користувача (§12.5). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = "lowpass";
    this.masterFilter.frequency.value = 20000;
    this.effects = ctx.createGain();
    this.ambient = ctx.createGain();
    this.ambientDuck = ctx.createGain();
    this.effects.connect(this.masterFilter);
    this.spiderBus = ctx.createGain();
    this.spiderBus.gain.value = 1.8;
    this.spiderBus.connect(this.effects);
    this.ambient.connect(this.ambientDuck).connect(this.masterFilter);
    this.masterFilter.connect(this.master).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.02);
    this.effects.gain.setTargetAtTime(s.effects, t, 0.02);
    this.ambient.gain.setTargetAtTime(s.ambient * 0.5, t, 0.02);
  }

  /** Пауза: звуки гри приглушені (§12.6); непритомність і знерухомлення — глухо, як крізь воду. */
  setMuffle(amount: number): void {
    if (!this.ctx) return;
    const f = amount > 0 ? 20000 * Math.pow(0.02, amount) : 20000;
    this.masterFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  // ======================= примітиви =======================

  private noiseSrc(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  private out(pan = 0, gain = 1, lowpass = 20000, bus: GainNode = this.effects): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    let head: AudioNode = g;
    if (lowpass < 19000) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lowpass;
      g.connect(f);
      f.connect(p);
    } else g.connect(p);
    p.connect(bus);
    return head;
  }

  /** Шумовий сплеск через фільтр. */
  private burst(opts: { dur: number; freq: number; q?: number; type?: BiquadFilterType; gain: number; pan?: number; lowpass?: number; attack?: number; sweepTo?: number; delay?: number; bus?: GainNode }): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.setValueAtTime(opts.freq, t0);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + opts.dur);
    f.Q.value = opts.q ?? 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.004));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f).connect(env).connect(this.out(opts.pan, 1, opts.lowpass, opts.bus));
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  }

  private tone(opts: { freq: number; to?: number; dur: number; type?: OscillatorType; gain: number; pan?: number; lowpass?: number; attack?: number; delay?: number; vibrato?: number }): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 23;
      lg.gain.value = opts.vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + opts.dur + 0.05);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.01));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    o.connect(env).connect(this.out(opts.pan, 1, opts.lowpass));
    o.start(t0);
    o.stop(t0 + opts.dur + 0.05);
  }

  // ======================= зразки для меню (§12.6) =======================

  sample(channel: "master" | "effects" | "ambient"): void {
    if (!this.ctx) return;
    if (channel === "ambient") {
      const ctx = this.ctx;
      const src = this.noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      src.connect(f).connect(g).connect(this.ambient);
      src.start();
      src.stop(ctx.currentTime + 0.7);
    } else {
      this.spiderClick(0, 0.5, 20000, true);
    }
  }

  // ======================= події гри =======================

  handleEvents(events: GameEvent[], world: World): void {
    if (!this.ctx) return;
    const p = world.player;
    const pan = (x: number) => Math.max(-1, Math.min(1, (x - p.x) / 6));
    const lvl = world.index;
    for (const e of events) {
      switch (e.type) {
        case "step":
          this.footstep(lvl, e.sprint, e.surface);
          break;
        case "actionStart":
          this.burst({ dur: 0.18, freq: 2400, q: 0.7, gain: 0.05 });
          break;
        case "actionStage":
          if (e.stage === "reload") {
            // Перезарядка (§7.3.7): клацання кришки / булькіт пального.
            this.tone({ freq: 900, to: 600, dur: 0.05, gain: 0.08, type: "square", lowpass: 2500 });
            this.burst({ dur: 0.35, freq: 500, sweepTo: 300, q: 4, gain: 0.07, delay: 0.06 });
            break;
          }
          this.burst({ dur: 0.12, freq: 1800, q: 1, gain: 0.08 });
          this.tone({ freq: 420, dur: 0.06, gain: 0.03, type: "triangle", delay: 0.05 });
          break;
        case "actionCancel":
          this.burst({ dur: 0.06, freq: 2600, q: 0.8, gain: 0.05 });
          break;
        case "actionFail":
          // Глухий «холостий» звук — один для всіх дій (§7.3.1.3).
          this.tone({ freq: 110, to: 70, dur: 0.18, gain: 0.25, type: "sine" });
          this.burst({ dur: 0.1, freq: 300, q: 1.5, gain: 0.12 });
          break;
        case "door":
          this.door(e.variant, e.open, pan(e.x));
          break;
        case "dynamoPress":
          this.tone({ freq: 120 + e.charge * 260, to: 180 + e.charge * 380, dur: 0.22, type: "sawtooth", gain: 0.05, lowpass: 1600 });
          this.burst({ dur: 0.15, freq: 900 + e.charge * 800, q: 2, gain: 0.06 });
          break;
        case "toggle":
          this.burst({ dur: 0.03, freq: 3500, q: 2, gain: 0.12 });
          if (e.kind === "gasLamp" && e.on) this.burst({ dur: 0.5, freq: 800, q: 0.5, gain: 0.08, attack: 0.05 });
          if (e.kind === "lighter") {
            // Клац кришки; запалювання — ще й чирк кремня й коротке «пф» полум'я (§7.3.8).
            this.tone({ freq: 1400, to: 900, dur: 0.04, gain: 0.08, type: "square", lowpass: 3000 });
            if (e.on) this.burst({ dur: 0.25, freq: 2600, q: 0.8, gain: 0.1, delay: 0.05, attack: 0.01 });
          }
          break;
        case "matchStrike":
          this.burst({ dur: 0.12, freq: 3000, q: 0.8, gain: 0.2 });
          this.burst({ dur: 0.7, freq: 1400, q: 0.6, gain: 0.07, delay: 0.08, attack: 0.03 });
          break;
        case "flareIgnite":
          this.burst({ dur: 1.4, freq: 2200, q: 0.4, gain: 0.18, attack: 0.02 });
          break;
        case "flareThrow":
          this.burst({ dur: 0.35, freq: 1200, sweepTo: 500, q: 1, gain: 0.08 });
          break;
        case "itemLand":
          this.tone({ freq: 190, to: 120, dur: 0.1, gain: 0.12, type: "triangle", pan: pan(e.x) });
          if (e.rolled) this.burst({ dur: 0.25, freq: 700, q: 3, gain: 0.05, delay: 0.05, pan: pan(e.x) });
          break;
        case "webTrigger":
          if (e.stinger) this.webStinger();
          break;
        case "webBurn":
          // Спалах павутини (§10.0.2): сухий тріск і шипіння полум'я.
          this.burst({ dur: 0.5, freq: 1600, sweepTo: 700, q: 0.6, gain: 0.14, attack: 0.01, pan: pan(e.x) });
          for (let i = 0; i < 8; i++) this.burst({ dur: 0.03, freq: 2500 + i * 300, q: 3, gain: 0.07, delay: 0.04 + i * 0.045, pan: pan(e.x) });
          break;
        case "webTear":
          for (let i = 0; i < 6; i++) this.burst({ dur: 0.05, freq: 3000 + i * 400, q: 3, gain: 0.08, delay: i * 0.03, pan: pan(e.x) });
          break;
        case "huntCry": {
          const s = world.spiders.find((sp) => sp.id === e.spider);
          if (s) this.huntCry(s, world);
          break;
        }
        case "spitWindup": {
          const s = world.spiders.find((sp) => sp.id === e.spider);
          if (s) {
            const v = this.voiceParams(s, world);
            // Унікальний звук: вологе булькання, що наростає (§14.4).
            this.tone({ freq: 90, to: 260, dur: 0.5, type: "square", gain: 0.12 * Math.max(0.35, v.gain), pan: v.pan, lowpass: v.muffled ? 700 : 2400, vibrato: 40 });
            this.burst({ dur: 0.5, freq: 600, sweepTo: 1800, q: 6, gain: 0.08 * Math.max(0.35, v.gain), pan: v.pan });
          }
          break;
        }
        case "spitFire": {
          const s = world.spiders.find((sp) => sp.id === e.spider);
          if (s) this.burst({ dur: 0.15, freq: 1500, q: 1.2, gain: 0.2, pan: this.voiceParams(s, world).pan });
          break;
        }
        case "spitHit":
          this.tone({ freq: 70, to: 40, dur: 0.35, gain: 0.5 });
          this.burst({ dur: 0.3, freq: 500, q: 0.8, gain: 0.3 });
          break;
        case "spitMiss":
          this.burst({ dur: 0.12, freq: 900, q: 1, gain: 0.08, pan: pan(e.x) });
          break;
        case "struggle":
          for (let i = 0; i < 3; i++) this.burst({ dur: 0.05, freq: 2500 + Math.random() * 2000, q: 4, gain: 0.1 + (e.wake ? e.count * 0.03 : 0), delay: i * 0.025 });
          break;
        case "freed":
          this.burst({ dur: 0.4, freq: 2000, q: 1, gain: 0.2 });
          break;
        case "antidote":
          // Єдиний «добрий» звук у грі.
          this.tone({ freq: 392, dur: 1.2, gain: 0.12, attack: 0.08 });
          this.tone({ freq: 587, dur: 1.2, gain: 0.07, attack: 0.1 });
          break;
        case "blackout":
          this.tone({ freq: 60, to: 30, dur: 2.5, gain: 0.3, attack: 0.02 });
          break;
        case "wake":
          this.burst({ dur: 0.5, freq: 400, q: 0.5, gain: 0.1 });
          break;
        case "death":
          // Найгучніший момент гри (§9.5).
          this.tone({ freq: 55, to: 28, dur: 2.2, gain: 0.9, type: "sawtooth", lowpass: 400 });
          this.burst({ dur: 1.6, freq: 1800, sweepTo: 400, q: 0.7, gain: 0.8, attack: 0.005 });
          this.burst({ dur: 0.9, freq: 4000, sweepTo: 1500, q: 3, gain: 0.5, attack: 0.005 });
          break;
        case "exit":
          if (e.final) this.victory();
          else this.burst({ dur: 1.2, freq: 900, sweepTo: 120, q: 0.6, gain: 0.12, attack: 0.1 });
          break;
        case "exhausted":
          this.burst({ dur: 0.6, freq: 700, q: 0.8, gain: 0.12, attack: 0.1 });
          break;
      }
    }
  }

  private footstep(level: number, sprint: boolean, surface: "floor" | "web" | "wornWeb" | "tornWeb"): void {
    const g = sprint ? 0.1 : 0.06;
    if (surface === "web") {
      this.burst({ dur: 0.22, freq: 600, q: 0.5, gain: g * 1.4, attack: 0.02 });
      return;
    }
    if (surface === "wornWeb") {
      // Провисла павутина: сухіше й тріскучіше за цілу (§10.0.1).
      this.burst({ dur: 0.16, freq: 900, q: 0.6, gain: g * 1.1, attack: 0.02 });
      for (let i = 0; i < 2; i++) this.burst({ dur: 0.03, freq: 3000, q: 4, gain: g * 0.7, delay: 0.03 + i * 0.03 });
      return;
    }
    if (surface === "tornWeb") {
      for (let i = 0; i < 3; i++) this.burst({ dur: 0.03, freq: 3500, q: 4, gain: g, delay: i * 0.02 });
      return;
    }
    switch (level) {
      case 0:
        this.burst({ dur: 0.09, freq: 260, q: 0.8, gain: g * 1.3 });
        if (Math.random() < 0.08) this.tone({ freq: 300, to: 240, dur: 0.25, type: "sawtooth", gain: 0.015, lowpass: 900 });
        break;
      case 1:
        this.burst({ dur: 0.06, freq: 1400, q: 1.5, gain: g });
        this.burst({ dur: 0.06, freq: 1400, q: 1.5, gain: g * 0.3, delay: 0.12 });
        break;
      case 2:
        this.burst({ dur: 0.06, freq: 1300, q: 1.5, gain: g });
        if (Math.random() < 0.35) this.burst({ dur: 0.15, freq: 900, q: 3, gain: g * 0.8, delay: 0.02 });
        this.burst({ dur: 0.06, freq: 1300, q: 1.5, gain: g * 0.35, delay: 0.2 });
        break;
      case 3:
        this.burst({ dur: 0.12, freq: 2200, q: 0.6, gain: g * 0.9 });
        this.burst({ dur: 0.1, freq: 400, q: 1, gain: g * 0.6 });
        break;
      default:
        this.burst({ dur: 0.14, freq: 500, q: 0.7, gain: g * 1.1, attack: 0.015 });
        if (Math.random() < 0.1) this.burst({ dur: 0.04, freq: 3000, q: 3, gain: g, delay: 0.05 });
        break;
    }
  }

  private door(variant: string, open: boolean, pan: number): void {
    if (variant === "wood") {
      this.tone({ freq: open ? 180 : 260, to: open ? 320 : 150, dur: 0.6, type: "sawtooth", gain: 0.06, lowpass: 1200, vibrato: 15, pan });
      if (!open) this.tone({ freq: 90, to: 60, dur: 0.2, gain: 0.3, delay: 0.5, pan });
    } else if (variant === "grate") {
      for (const f of [620, 1250, 1870, 2630]) this.tone({ freq: f, dur: 0.7, type: "triangle", gain: 0.03, pan });
      this.burst({ dur: 0.15, freq: 2500, q: 2, gain: 0.1, pan });
    } else {
      for (let i = 0; i < 10; i++) this.burst({ dur: 0.12, freq: 300 + Math.random() * 900, q: 1.5, gain: 0.12, delay: i * 0.06, pan });
    }
  }

  private webStinger(): void {
    // Найрізкіший звук: хор сичання з усіх боків, без панування (§14.4).
    for (let i = 0; i < 9; i++) {
      const pan = (i / 8) * 2 - 1;
      this.burst({ dur: 1.4 + Math.random() * 0.6, freq: 3000 + Math.random() * 3000, q: 1.2, gain: 0.16, pan, attack: 0.01, delay: Math.random() * 0.15 });
    }
    this.tone({ freq: 70, to: 45, dur: 1.2, gain: 0.25 });
  }

  private huntCry(s: Spider, world: World): void {
    const v = this.voiceParams(s, world);
    const k = s.pitch;
    // Крик полювання (§14.2): миттєва атака, тваринне шипіння-вереск, 0.75 с; завжди чутно, без оклюзії.
    this.burst({ dur: 0.75, freq: 3800 * k, sweepTo: 1600 * k, q: 2.5, gain: 0.55, pan: v.pan, attack: 0.003 });
    this.burst({ dur: 0.6, freq: 7000 * k, q: 1, gain: 0.25, pan: v.pan, attack: 0.003 });
    this.tone({ freq: 1400 * k, to: 700 * k, dur: 0.7, type: "sawtooth", gain: 0.12, pan: v.pan, vibrato: 90, attack: 0.003, lowpass: 5000 });
    this.duckUntil = this.ctx!.currentTime + 0.9;
    const voice = this.voices.get(s.id);
    if (voice) voice.cryFlash = 1;
  }

  private victory(): void {
    // Перший «відкритий» звук: вітер і птахи; низький подовжений тон як видих (§14.1).
    this.tone({ freq: 82, dur: 5, gain: 0.25, attack: 0.8 });
    const ctx = this.ctx!;
    const src = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 500;
    f.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 9);
    src.connect(f).connect(g).connect(this.effects);
    src.start();
    src.stop(ctx.currentTime + 9.2);
    for (let i = 0; i < 7; i++) {
      const base = 2400 + Math.random() * 1600;
      this.tone({ freq: base, to: base * 1.3, dur: 0.12, gain: 0.03, delay: 1 + i * 0.7 + Math.random() * 0.3, pan: Math.random() * 2 - 1 });
    }
  }

  /** Клацання клешнями (§14.2): подвійний сухий клац; у HUNT — злива клацань і сичання. */
  private spiderClick(pan: number, gain: number, lowpass: number, hunt: boolean): void {
    const bus = this.spiderBus;
    const n = hunt ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const d = i * (hunt ? 0.03 : 0.06);
      this.burst({ dur: 0.02, freq: hunt ? 4200 : 3400, q: 9, gain, pan, lowpass, delay: d, attack: 0.001, bus });
      this.burst({ dur: 0.04, freq: 1300, q: 4, gain: gain * 0.6, pan, lowpass, delay: d + 0.004, attack: 0.001, bus });
    }
    if (hunt) this.burst({ dur: 0.35, freq: 5000, q: 0.8, gain: gain * 0.35, pan, lowpass, attack: 0.03, bus });
  }

  /** Опускання лапи (§14.2): чіткий короткий клац + глухий удар хітину. */
  private spiderStep(pan: number, gain: number, lowpass: number, hunt: boolean, delay: number): void {
    const bus = this.spiderBus;
    this.burst({ dur: 0.018, freq: hunt ? 3400 : 2600, q: 10, gain, pan, lowpass, delay, attack: 0.001, bus });
    this.burst({ dur: 0.05, freq: 420, q: 2, gain: gain * 0.8, pan, lowpass, delay: delay + 0.002, attack: 0.002, bus });
  }

  // ======================= безперервне: павуки, дихання, ембієнт =======================

  update(dt: number, world: World, paused: boolean): void {
    if (!this.ctx) return;
    this.updateAmbient(world);
    this.edgeCues = [];
    if (paused) return;
    const now = this.ctx.currentTime;
    // Поле відстаней звуку: BFS від гравця раз на 0.2 с (§14.2).
    this.bfsTimer -= dt;
    if (this.bfsTimer <= 0 || !this.soundDist) {
      this.bfsTimer = AUDIO_BFS_INTERVAL;
      this.soundBfs(world);
    }
    let nearest = Infinity;
    for (const s of world.spiders) {
      let v = this.voices.get(s.id);
      if (!v) {
        v = { plants: s.plants, clickAt: 0, gain: 0, pan: 0, angle: 0, muffled: false, cryFlash: 0 };
        this.voices.set(s.id, v);
      }
      const vp = this.voiceParams(s, world);
      v.gain = vp.gain;
      v.pan = vp.pan;
      v.angle = vp.angle;
      v.muffled = vp.muffled;
      nearest = Math.min(nearest, vp.dist);
      v.cryFlash = Math.max(0, v.cryFlash - dt * 1.5);
      // Завмерлі павуки мовчать (§9.6).
      if (!world.spidersReleased || world.blackout > 0) {
        v.plants = s.plants;
        continue;
      }
      const hunt = s.state !== "calm";
      const lp = vp.muffled ? 1800 : 20000;
      if (vp.gain > 0.01) {
        const steps = s.plants - v.plants;
        for (let i = 0; i < Math.min(steps, 3); i++) this.spiderStep(vp.pan, 0.09 * vp.gain, lp, hunt, i * 0.025);
        if (now >= v.clickAt) {
          this.spiderClick(vp.pan, 0.12 * vp.gain, lp, hunt);
          v.clickAt = now + (hunt ? 0.25 + Math.random() * 0.25 : 2 + Math.random() * 2);
        }
      }
      v.plants = s.plants;
      if (this.settings.visualAudioCues && (vp.gain > 0.02 || v.cryFlash > 0)) {
        this.edgeCues.push({ angle: vp.angle, intensity: Math.max(vp.gain, v.cryFlash), cry: v.cryFlash > 0 });
      }
    }
    // Ducking ембієнту: павук ближче 8 тайлів шляхом або крик (§14.4).
    const duck = nearest <= AMBIENT_DUCK_DISTANCE || now < this.duckUntil ? 0.25 : 1;
    this.ambientDuck.gain.setTargetAtTime(duck, now, 0.15);
    this.updateBreath(world);
  }

  private soundBfs(world: World): void {
    const nav = world.nav;
    const n = nav.w * nav.h;
    const dist = new Int32Array(n).fill(-1);
    const parent = new Int32Array(n).fill(-1);
    const p = world.player;
    // Гравець у префабі камери — поза графом; звуку павуків там немає (на рівні 1 павуків немає).
    const start = cellAt(nav, p.x, p.y);
    dist[start] = 0;
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      const cx = c % nav.w;
      const cy = Math.floor(c / nav.w);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= nav.w || ny >= nav.h) continue;
        const t = nav.map.get(2 * cx + 1 + dx, 2 * cy + 1 + dy);
        // Граф звуку: двері завжди прохідні (§14.2).
        if (t !== T.Floor && t !== T.Hole && t !== T.Door) continue;
        const nb = ny * nav.w + nx;
        if (dist[nb] >= 0) continue;
        dist[nb] = dist[c] + 1;
        parent[nb] = c;
        q.push(nb);
      }
    }
    this.soundDist = dist;
    this.soundParent = parent;
  }

  /** Гучність, панування й оклюзія павука за шляхом лабіринтом (§14.2). */
  private voiceParams(s: Spider, world: World): { gain: number; pan: number; angle: number; muffled: boolean; dist: number } {
    const p = world.player;
    const nav: NavGrid = world.nav;
    const clear = lineOfSight(p.x, p.y, s.x, s.y, (tx, ty) => world.map.opaque(tx, ty));
    let dist = Math.hypot(s.x - p.x, s.y - p.y);
    let dirX = s.x - p.x;
    let dirY = s.y - p.y;
    if (!clear && this.soundDist && this.soundParent) {
      const sc = cellAt(nav, s.x, s.y);
      const cells = this.soundDist[sc];
      if (cells < 0) return { gain: 0, pan: 0, angle: 0, muffled: true, dist: Infinity };
      dist = cells * 2 + 1;
      // Напрямок — на перший вузол шляху від гравця до павука.
      let c = sc;
      const start = cellAt(nav, p.x, p.y);
      while (this.soundParent[c] >= 0 && this.soundParent[c] !== start) c = this.soundParent[c];
      const first = c === start ? { x: s.x, y: s.y } : cellCenter(nav, c);
      dirX = first.x - p.x;
      dirY = first.y - p.y;
    }
    // Павуки тихішають із глибиною (§14.2): дальність і гучність × SPIDER_NOISE_BY_LEVEL.
    const noise = SPIDER_NOISE_BY_LEVEL[world.index];
    const range = (s.state === "calm" ? SPIDER_AUDIBLE_CALM : SPIDER_AUDIBLE_HUNT) * noise;
    const k = Math.max(0, 1 - dist / range);
    // Затухання повільніше за квадратичне (§14.2): на половині дальності павука ще добре чутно.
    const gain = Math.pow(k, 1.4) * (clear ? 1 : 0.75) * noise;
    const len = Math.hypot(dirX, dirY) || 1;
    return { gain, pan: (dirX / len) * 0.85, angle: Math.atan2(dirY, dirX), muffled: !clear, dist };
  }

  private updateBreath(world: World): void {
    const ctx = this.ctx!;
    if (!this.breath) {
      const src = this.noiseSrc();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.effects);
      src.start();
      this.breath = { gain, filter };
    }
    const p = world.player;
    const t = ctx.currentTime;
    // Дихання частішає нижче 30 %, при виснаженні — важке, хрипке (§8.2).
    let level = 0;
    let rate = 0.6;
    if (p.exhausted) {
      level = 0.09;
      rate = 2.2;
    } else if (p.stamina < 0.3) {
      level = 0.05;
      rate = 1.6;
    }
    const phase = (Math.sin(t * Math.PI * rate) + 1) / 2;
    this.breath.gain.gain.setTargetAtTime(level * phase, t, 0.05);
    this.breath.filter.frequency.setTargetAtTime(p.exhausted ? 600 + phase * 500 : 900 + phase * 400, t, 0.05);
  }

  private updateAmbient(world: World): void {
    if (this.ambientLevel === world.index) return;
    this.ambientLevel = world.index;
    for (const n of this.ambientNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        // уже зупинено
      }
      n.disconnect();
    }
    this.ambientNodes = [];
    const ctx = this.ctx!;
    const add = (freq: number, q: number, gain: number, type: BiquadFilterType = "lowpass", lfoRate = 0) => {
      const src = this.noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.ambient);
      if (lfoRate > 0) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = lfoRate;
        lg.gain.value = gain * 0.7;
        lfo.connect(lg).connect(g.gain);
        lfo.start();
        this.ambientNodes.push(lfo);
      }
      src.start();
      this.ambientNodes.push(src, f, g);
    };
    const hum = (freq: number, gain: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.ambient);
      o.start();
      this.ambientNodes.push(o, g);
    };
    // Підкладки тем (§14.4); на рівнях 1–2 майже порожньо.
    switch (world.index) {
      case 0:
        hum(50, 0.012);
        hum(100, 0.006);
        add(400, 0.3, 0.02, "lowpass", 0.07);
        break;
      case 1:
        add(700, 0.4, 0.015, "bandpass", 0.05);
        break;
      case 2:
        add(900, 0.6, 0.035, "bandpass", 0.3);
        add(250, 0.5, 0.02, "lowpass");
        break;
      case 3:
        add(90, 0.7, 0.08, "lowpass", 0.04);
        hum(38, 0.02);
        break;
      default:
        add(80, 0.7, 0.09, "lowpass", 0.03);
        add(3500, 2, 0.006, "bandpass", 0.9);
        break;
    }
  }
}
