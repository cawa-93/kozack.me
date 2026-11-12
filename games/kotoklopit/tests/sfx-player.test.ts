// Програвач звуків (§11.4а, `audio/SOUND.md`, «Ефекти»): запити з тайм-аутом, голоси — лише звукам, що справді звучать; що
// вантажити на старті, а що — лише коли знадобиться.

import { afterEach, describe, expect, it, vi } from "vitest";

import { SFX } from "../src/audio/config";
import { timeoutSignal } from "../src/audio/net";
import { soundBus, type SoundBus } from "../src/audio/sfx/bus";
import { allSoundFiles, soundFile, type SoundFile } from "../src/audio/sfx/files";
import { Player } from "../src/audio/sfx/player";
import { GROUPS } from "../src/audio/sfx/registry";
import { Sounds } from "../src/audio/sfx/sounds";
import { startupFiles } from "../src/audio/sfx/startup";
import { AudioPrefs } from "../src/audio/settings";
import { newGame } from "../src/sim/game";
import { fakeAudio, settle } from "./fakeaudio";

const prefs = (): AudioPrefs => new AudioPrefs(null, ["retro"]);
const bytes = (): Promise<Response> => Promise.resolve(new Response(new ArrayBuffer(16)));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("звуки: завислий запит не глушить решту (Н4)", () => {
  it("звук, чий файл ще не прийшов, не займає голосу: готовий звук звучить, хоч би скільки файлів зависло", async () => {
    const open = soundFile("ui", "open")!.url;
    vi.stubGlobal("fetch", vi.fn((url: string) => (url === open ? bytes() : new Promise<Response>(() => undefined))));
    const audio = fakeAudio();
    const sounds = new Sounds(audio.engine, prefs());
    let hung = 0;
    for (const group of GROUPS) {
      for (const [name, def] of Object.entries(group.sounds)) {
        if (def.loop || (group.id === "ui" && name === "open")) continue;
        sounds.play(group.id, name);
        hung++;
      }
    }
    expect(hung).toBeGreaterThan(SFX.voices);
    sounds.play("ui", "open");
    await settle();
    expect(audio.started()).toHaveLength(1);
  });

  it("звук, що прийшов, зважає на межу голосів у мить, коли справді зазвучав", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio({ hold: true });
    const sounds = new Sounds(audio.engine, prefs());
    // Різні звуки, кожен ще декодується: межа загальна, тож зазвучить не більше `SFX.voices`.
    let asked = 0;
    for (const group of GROUPS) {
      for (const [name, def] of Object.entries(group.sounds)) {
        if (def.loop) continue;
        sounds.play(group.id, name);
        asked++;
      }
    }
    expect(asked).toBeGreaterThan(SFX.voices);
    await settle();
    for (const decode of audio.decodes) decode.resolve();
    await settle();
    expect(audio.started().length).toBe(SFX.voices);
  });

  it("файл звуку просять із тайм-аутом", () => {
    const fetch = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetch);
    const player = new Player(fakeAudio().engine);
    void player.preload([soundFile("ui", "open")!]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("петля, чий файл не прийшов (збій, тайм-аут), пробує знову, поки її не вимкнули", async () => {
    vi.useFakeTimers();
    let fail = true;
    const fetch = vi.fn(() => (fail ? Promise.reject(new Error("тайм-аут")) : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) })));
    vi.stubGlobal("fetch", fetch);
    const audio = fakeAudio();
    const player = new Player(audio.engine);
    const voice = player.loop(soundFile("home", "stove-loop")!, { bus: "world", gain: 1, pan: 0 });
    expect(voice).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.started()).toHaveLength(0);
    fail = false;
    await vi.advanceTimersByTimeAsync(SFX.retryMs);
    expect(audio.started()).toHaveLength(1);
    // Вимкнена петля, чий файл не прийшов, більше не просить.
    fail = true;
    const other = player.loop(soundFile("home", "vacuum-loop")!, { bus: "world", gain: 1, pan: 0 });
    await vi.advanceTimersByTimeAsync(0);
    other?.stop();
    const asked = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SFX.retryMs * 3);
    expect(fetch.mock.calls.length).toBe(asked);
  });

  it("тайм-аут є й там, де браузер не знає `AbortSignal.timeout`", () => {
    vi.useFakeTimers();
    const native = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true, writable: true });
    try {
      const signal = timeoutSignal(1000);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(signal?.aborted).toBe(true);
    } finally {
      Object.defineProperty(AbortSignal, "timeout", { value: native, configurable: true, writable: true });
    }
  });
});

describe("петлі: в унісон не звучать, ритмічна — з початку кола (Б7)", () => {
  const loopFile = (rhythm: boolean): SoundFile => ({ key: `test/${rhythm}`, url: `test-${rhythm}.mp3`, loop: { start: 0.1, end: 8.1, ...(rhythm ? { rhythm: true } : {}) } });

  it("звичайна петля — з випадкового місця кола, ритмічна (музика титрів) — точно з його початку", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio({ seconds: 8.2 });
    const player = new Player(audio.engine);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    player.loop(loopFile(false), { bus: "world", gain: 1, pan: 0 });
    player.loop(loopFile(true), { bus: "music", gain: 1, pan: 0 });
    await settle();
    random.mockRestore();
    const [plain, rhythm] = audio.started();
    expect(plain?.started?.[1]).toBeCloseTo(4.1);
    expect(rhythm?.started?.[1]).toBe(0.1);
    expect(rhythm?.loopStart).toBe(0.1);
    expect(rhythm?.loopEnd).toBe(8.1);
  });

  it("петля каже, коли справді зазвучала, — за годинником звуку, а не в мить запиту: файл ще декодувався", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio({ hold: true });
    // Вихід звуку відстає: семпл контексту 10 с прозвучить у мить 5000 мс `performance.now`.
    audio.context.getOutputTimestamp = () => ({ contextTime: 10, performanceTime: 5000 });
    // Годинник сторінки стоїть разом із фальшивим годинником звуку: між ними немає розбіжності, як і в справжньому, що звучить.
    const clock = vi.spyOn(performance, "now").mockReturnValue(4900);
    const player = new Player(audio.engine);
    const voice = player.loop(loopFile(true), { bus: "music", gain: 1, pan: 0 });
    expect(voice?.startedAt()).toBeNull();
    await settle();
    audio.context.currentTime = 10.25;
    audio.decodes[0]?.resolve();
    await settle();
    expect(audio.started()).toHaveLength(1);
    expect(audio.started()[0]?.started?.[0]).toBe(10.25);
    expect(voice?.startedAt()).toBeCloseTo(5250);
    clock.mockRestore();
  });

  it("контекст стояв (схована вкладка, дзвінок) — петля стояла з ним, тож її долі зсуваються на час паузи", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio();
    let now = 7000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const player = new Player(audio.engine);
    const voice = player.loop(loopFile(true), { bus: "music", gain: 1, pan: 0 });
    await settle();
    expect(voice?.startedAt()).toBeCloseTo(7000);
    // Годинник звуку йде разом із `performance.now`: долі ті самі.
    now += 3000;
    audio.context.currentTime += 3;
    expect(voice?.startedAt()).toBeCloseTo(7000);
    // Вкладку сховали на 10 с: контекст зупинено, його годинник стоїть, а з ним і музика.
    audio.context.state = "suspended";
    now += 10_000;
    expect(voice?.startedAt()).toBeCloseTo(7000);
    // Повернулися: музика грає далі з того самого місця, тож її початок «стався» на 10 с пізніше.
    audio.context.state = "running";
    now += 500;
    audio.context.currentTime += 0.5;
    expect(voice?.startedAt()).toBeCloseTo(17_000);
    now += 2000;
    audio.context.currentTime += 2;
    expect(voice?.startedAt()).toBeCloseTo(17_000);
    clock.mockRestore();
  });

  it("файл декодувався, поки контекст стояв: давній штамп виходу не зсуває долі, вони — від миті, коли звук пішов знову", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio({ hold: true });
    let now = 9000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    // Поки контекст стоїть, штамп виходу — з миті, коли звук зупинився (8 с тому); пішов знову — свіжий.
    audio.context.getOutputTimestamp = () => (audio.context.state === "running" ? { contextTime: audio.context.currentTime, performanceTime: now } : { contextTime: 10, performanceTime: 1000 });
    audio.context.currentTime = 10;
    const player = new Player(audio.engine);
    const voice = player.loop(loopFile(true), { bus: "music", gain: 1, pan: 0 });
    await settle();
    audio.context.state = "suspended";
    audio.decodes[0]?.resolve();
    await settle();
    expect(audio.started()).toHaveLength(1);
    // Вкладка ще 3 с схована, потім звук іде: початок кола чути в мить 12 000.
    now = 12_000;
    audio.context.state = "running";
    now += 500;
    audio.context.currentTime += 0.5;
    expect(voice?.startedAt()).toBeCloseTo(12_000);
    clock.mockRestore();
  });

  it("без `getOutputTimestamp` — з поточного годинника й затримки виходу", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio();
    const now = vi.spyOn(performance, "now").mockReturnValue(7000);
    const player = new Player(audio.engine);
    const voice = player.loop(loopFile(true), { bus: "music", gain: 1, pan: 0 });
    await settle();
    expect(voice?.startedAt()).toBeCloseTo(7000);
    now.mockRestore();
  });
});

describe("звуки на старті: інтерфейс першим, музика титрів — коли знадобиться (П12)", () => {
  const plan = startupFiles(GROUPS);
  const busOf = new Map<string, SoundBus>(GROUPS.flatMap((group) => Object.values(group.sounds).flatMap((def) => def.files.map((name) => [`${group.id}/${name}`, soundBus(def)] as const))));

  it("спершу звуки шини інтерфейсу: картки й кнопки звучать із першого дотику", () => {
    const buses = plan.fetch.map((file) => busOf.get(file.key));
    const lastUi = buses.lastIndexOf("ui");
    expect(buses.indexOf("ui")).toBe(0);
    expect(buses.slice(0, lastUi + 1).every((bus) => bus === "ui")).toBe(true);
  });

  it("музики титрів на старті немає (найбільший файл, потрібен раз на гру); решта — вся й без повторів", () => {
    const keys = plan.fetch.map((file) => file.key);
    expect(keys).not.toContain("ui/credits");
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys, "ui/credits"].sort()).toEqual(allSoundFiles().map((file) => file.key).sort());
  });

  it("кінець гри декодується заздалегідь: звучить раз на гру, і запізнілий звук пропав би", () => {
    expect(plan.warm.map((file) => file.key)).toEqual(["ui/end"]);
  });

  it("розкодований заздалегідь звук не витісняється, хоч скільки звуків декодовано потім", async () => {
    vi.stubGlobal("fetch", vi.fn(bytes));
    const audio = fakeAudio({ seconds: 1 });
    // Межа — на два розкодовані звуки.
    const player = new Player(audio.engine, 2 * 48_000 * 4);
    const end = soundFile("ui", "end")!;
    await player.keep([end]);
    const voice = { take: () => true, free: () => undefined };
    for (const name of ["open", "close", "tab", "notify", "bought"]) player.play(soundFile("ui", name)!, { bus: "ui", gain: 1, pan: 0, rate: 1, delay: 0 }, voice);
    await settle();
    const before = audio.started().length;
    // Готовий звук звучить одразу, у ту саму мить, без декодування.
    player.play(end, { bus: "ui", gain: 1, pan: 0, rate: 1, delay: 0 }, voice);
    expect(audio.started().length).toBe(before + 1);
  });

  it("на екрані кінця гри, коли це пенсія, музику титрів уже тягнуть і декодують", async () => {
    const fetch = vi.fn((_url: string) => bytes());
    vi.stubGlobal("fetch", fetch);
    const audio = fakeAudio({ hold: true });
    const sounds = new Sounds(audio.engine, prefs());
    const state = newGame({ address: "he", difficulty: "normal", seed: 2 }).current;
    sounds.attach({ mode: () => "live", state: () => state });
    const credits = soundFile("ui", "credits")!.url;
    state.end = "health";
    sounds.moment("end");
    await settle();
    expect(fetch.mock.calls.map((call) => call[0])).not.toContain(credits);
    const decoding = audio.decodes.length;
    state.end = "retirement";
    sounds.moment("end");
    await settle();
    expect(fetch.mock.calls.map((call) => call[0])).toContain(credits);
    // Кінець гри вже декодується з першого разу; тепер — ще й музика.
    expect(audio.decodes.length).toBe(decoding + 1);
  });
});
