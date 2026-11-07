// Котячі сліди у вигляді квартири (§9.12, «Котячі сліди в квартирі»; §8.3): кожен слід — накладка `env/trace/…` на своєму
// господарі (`TRACE_OVERLAYS`, `iso/looks.ts`) з тим самим полотном, pivot, роздільністю й станами, тож лягає на нього точно.
// Накладку видно, лише поки слід є й видно господаря, і в стані господаря. Сценарії: на старті й у звичайних — квартира
// ціла, у «прожитій» і великих старих зграях — зі слідами.

import { describe, expect, it } from "vitest";

import { applyScenario, FILE_SCENARIOS } from "../src/dev/scenarios";
import { newGame } from "../src/sim/game";
import { OBJECTS, ROOMS } from "../src/sim/home";
import { addTrace, BOX_TRACES, CAT_TRACES, traces } from "../src/sim/traces";
import type { CatTrace, GameState } from "../src/sim/types";
import { artEntries, artEntry } from "../src/view/art/manifest";
import { WALL_SEGMENTS } from "../src/view/art/manifest/lib/geometry";
import type { ArtId } from "../src/view/art/types";
import { boxesState, cabinetLook, TRACE_OVERLAYS, traceFrame, traceHostArt, type IsoFrame } from "../src/view/iso/looks";

/** Накладки, які квартира показала б для цього стану (без огляду на те, чи відчинені двері). */
const shown = (state: GameState): ArtId[] => TRACE_OVERLAYS.filter((o) => traceFrame(state, o) !== null).map((o) => o.id);

function frameOf(state: GameState, id: ArtId): IsoFrame | null {
  const overlay = TRACE_OVERLAYS.find((o) => o.id === id);
  if (!overlay) throw new Error(`Немає накладки «${id}»`);
  return traceFrame(state, overlay);
}

const BOX_OVERLAYS: readonly ArtId[] = ["env/trace/boxes-claws", "env/trace/boxes-claws/front", "env/trace/boxes-chewed", "env/trace/boxes-chewed/front"];
const sorted = (list: readonly string[]): string[] => [...list].sort();

describe("накладки котячих слідів (iso/looks.ts)", () => {
  it("кожен слід — накладка env/trace/…, і кожна накладка маніфесту — чийсь слід", () => {
    for (const trace of CAT_TRACES) expect(TRACE_OVERLAYS.some((o) => o.trace === trace), trace).toBe(true);
    const ids = TRACE_OVERLAYS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const manifest = artEntries()
      .filter((e) => e.id.startsWith("env/trace/"))
      .map((e) => e.id);
    expect(sorted(ids)).toEqual(sorted(manifest));
    // Сліди на коробках — двома накладками: на купі й на передніх стінках верхньої коробки поверх кота.
    expect(sorted(TRACE_OVERLAYS.filter((o) => BOX_TRACES.includes(o.trace)).map((o) => o.id))).toEqual(sorted(BOX_OVERLAYS));
  });

  it("накладка має полотно, pivot, роздільність і стани свого господаря, а господар є у квартирі", () => {
    for (const overlay of TRACE_OVERLAYS) {
      const entry = artEntry(overlay.id);
      const host = artEntry(traceHostArt(overlay.host));
      expect(entry, overlay.id).toBeDefined();
      expect(host, `${overlay.id}: господар ${traceHostArt(overlay.host)}`).toBeDefined();
      expect(entry?.size, overlay.id).toEqual(host?.size);
      expect(entry?.pivot, overlay.id).toEqual(host?.pivot);
      expect(entry?.res, overlay.id).toBe(host?.res);
      expect(entry?.states, overlay.id).toEqual(host?.states);
      const where = overlay.host;
      switch (where.kind) {
        case "floor":
        case "wall":
          expect(ROOMS.some((r) => r.id === where.room), overlay.id).toBe(true);
          break;
        case "segment":
          // Згасає разом зі стіною — лише внутрішні стіни згасають.
          expect(WALL_SEGMENTS.find((s) => s.id === where.segment)?.kind, overlay.id).toBe("inner");
          break;
        case "object":
          expect(OBJECTS.some((o) => o.id === where.object), overlay.id).toBe(true);
          break;
        default:
          break;
      }
    }
    expect(traceHostArt({ kind: "floor", room: "kitchen" })).toBe("env/room/kitchen/floor");
    expect(traceHostArt({ kind: "wall", room: "living" })).toBe("env/room/living/wall");
    expect(traceHostArt({ kind: "door-leaf" })).toBe("env/door/leaf");
    expect(traceHostArt({ kind: "boxes-front" })).toBe("env/boxes/front");
  });

  it("на старті квартира ціла — жодної накладки; слід з'явився посеред дня — його накладка одразу є", () => {
    const { current } = newGame({ address: "she", difficulty: "normal", seed: 1 });
    expect(traces(current)).toEqual([]);
    expect(shown(current)).toEqual([]);
    addTrace(current, "sofa");
    expect(shown(current)).toEqual(["env/trace/sofa"]);
    expect(frameOf(current, "env/trace/sofa")).toEqual({ id: "env/trace/sofa", state: null });
    for (const trace of CAT_TRACES) addTrace(current, trace);
    // Коробок на старті немає — і слідів на них теж.
    expect(sorted(shown(current))).toEqual(sorted(TRACE_OVERLAYS.filter((o) => !BOX_TRACES.includes(o.trace)).map((o) => o.id)));
  });

  it("стан накладки — як у господаря: шафка зачинена чи відчинена, скільки коробок у купі; без купи сліди коробок не видно", () => {
    const state = applyScenario(FILE_SCENARIOS["boxes"]!).current;
    state.home.traces = [...CAT_TRACES];
    const pile = boxesState(state);
    expect(pile).not.toBeNull();
    for (const id of BOX_OVERLAYS) expect(frameOf(state, id), id).toEqual({ id, state: pile });
    expect(frameOf(state, "env/trace/cabinet")).toEqual({ id: "env/trace/cabinet", state: "closed" });
    state.home.cabinetOpen = true;
    expect(cabinetLook(state).body.state).toBe("open");
    expect(frameOf(state, "env/trace/cabinet")).toEqual({ id: "env/trace/cabinet", state: "open" });
    // Купу розпакували: накладок на коробках немає з того самого кадру, хоч перелік слідів ще не прибрано (`tidyBoxTraces`).
    state.home.boxes = {};
    expect(boxesState(state)).toBeNull();
    for (const id of BOX_OVERLAYS) expect(frameOf(state, id), id).toBeNull();
    expect(frameOf(state, "env/trace/sofa")).not.toBeNull();
  });
});

describe("котячі сліди в сценаріях", () => {
  /** Сценарії зі слідами й що в них є; решта — ціла квартира, як на старті. */
  const LIVED: Record<string, readonly CatTrace[]> = {
    "cat-traces": CAT_TRACES,
    "many-cats": CAT_TRACES.filter((t) => !BOX_TRACES.includes(t)),
    "ten-cats": CAT_TRACES.filter((t) => !BOX_TRACES.includes(t)),
  };

  it("«прожита» квартира — усі сліди й купа ящиків зі слідами на ній; великі старі зграї — усі, крім слідів коробок; решта — ціла", () => {
    for (const [name, scenario] of Object.entries(FILE_SCENARIOS)) {
      const state = applyScenario(scenario).current;
      expect(sorted(traces(state)), name).toEqual(sorted(LIVED[name] ?? []));
    }
    const lived = applyScenario(FILE_SCENARIOS["cat-traces"]!).current;
    expect(lived.cats.length).toBeGreaterThan(1);
    expect(boxesState(lived)).not.toBeNull();
    expect(sorted(shown(lived))).toEqual(sorted(TRACE_OVERLAYS.map((o) => o.id)));
  });
});
