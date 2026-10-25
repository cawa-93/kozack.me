// Стан думками й настрій з поведінки (§11.4, правка автора 2026-10-25): про що час від часу думають кіт
// і персонаж, як часто, і коли кіт повільно моргає чи сумує. Без Phaser — щоб тести могли перевірити.

import { hungerThreshold } from "../sim/catai";
import { LOVE_BEHAVIOR, MOOD_LOOK, THOUGHTS } from "../sim/config";
import { inView } from "../sim/knowledge";
import type { Cat, CatActKind, GameState, StatName } from "../sim/types";
import type { IconName } from "./icons";
import type { EventBubble } from "./symbols";

/** Кіт думає, лише коли сидить, блукає чи йде по увагу — не за їжею, грою, сном чи в бійці. */
const THINKING_ACTS: ReadonlySet<CatActKind> = new Set<CatActKind>(["idle", "wander", "attention"]);

/** Показники персонажа й їхні іконки — ті самі, що на панелі (`hud.ts`). */
const PERSON_STATS: readonly (readonly [StatName, IconName])[] = [
  ["health", "heart"],
  ["satiety", "food"],
  ["hygiene", "soap"],
  ["sanity", "mind"],
];

/** Кіт сам грається — гуляє «заради гри» (§9.12): думати «хочу гратися» саме тоді нема чого. */
const playing = (cat: Cat): boolean => cat.act.kind === "wander" && cat.act.target === "play";

const isHeld = (state: GameState, cat: Cat): boolean => {
  const held = state.character.held;
  return held?.kind === "cat" && held.cat === cat.id;
};

/** Про що думає кіт (§11.4): голод, спрага, смуток, гра, увага — верхнє в цьому списку; null — ні про що. */
export function catThought(state: GameState, cat: Cat): IconName | null {
  if (cat.away !== null || !THINKING_ACTS.has(cat.act.kind) || playing(cat) || isHeld(state, cat)) return null;
  const needs = cat.needs;
  if (needs.hunger >= hungerThreshold(cat) - THOUGHTS.hungerLead) return "kibble";
  if (needs.thirst >= THOUGHTS.thirst) return "drop";
  if (cat.mood < THOUGHTS.sad) return "sad";
  if (needs.play >= THOUGHTS.play) return "toy";
  if (needs.attention >= THOUGHTS.attention) return "heart";
  return null;
}

/** Про що думає персонаж (§11.4): найнижчий показник під межею; не в поїздці й не з душової кабіни. */
export function personThought(state: GameState): IconName | null {
  const character = state.character;
  const activity = character.activity;
  if (state.trip !== null || (activity?.kind === "use" && activity.inside === true)) return null;
  let lowest: { value: number; icon: IconName } | null = null;
  for (const [stat, icon] of PERSON_STATS) {
    const value = character.stats[stat];
    if (value < THOUGHTS.personLow && (lowest === null || value < lowest.value)) lowest = { value, icon };
  }
  return lowest?.icon ?? null;
}

/** Настрій з поведінки (§11.4): «blink» — повільно моргає до персонажа, «sad» — сумна поза. */
export type CatLook = "blink" | "sad";

/** Як кіт показує настрій: сумний — завжди, щасливий і відданий — лише поруч із персонажем, сидячи. */
export function catLook(state: GameState, cat: Cat): CatLook | null {
  if (cat.away !== null || cat.act.kind === "sleep" || cat.act.kind === "lap") return null;
  if (cat.mood < THOUGHTS.sad) return "sad";
  if (cat.mood < MOOD_LOOK.blinkMood || cat.love < LOVE_BEHAVIOR.devoted) return null;
  if (!THINKING_ACTS.has(cat.act.kind) || cat.act.goal !== null || playing(cat) || isHeld(state, cat)) return null;
  const body = state.character.body;
  if (Math.hypot(body.x - cat.x, body.y - cat.y) > MOOD_LOOK.blinkDistance || !inView(state, cat)) return null;
  return "blink";
}

/** Тривалість повільного моргання, мс: заплющує, тримає, розплющує. */
const BLINK = { close: 450, hold: 350, open: 450 } as const;

/**
 * Наскільки заплющені очі кота, що моргає (0 — розплющені, 1 — заплющені): раз на `MOOD_LOOK.blinkSeconds`,
 * у кожного кота зі своїм зсувом, щоб кілька котів не моргали разом.
 */
export function blinkAmount(time: number, catId: number): number {
  const period = MOOD_LOOK.blinkSeconds * 1000;
  const t = (((time + catId * 2333) % period) + period) % period;
  if (t < BLINK.close) return t / BLINK.close;
  if (t < BLINK.close + BLINK.hold) return 1;
  if (t < BLINK.close + BLINK.hold + BLINK.open) return 1 - (t - BLINK.close - BLINK.hold) / BLINK.open;
  return 0;
}

interface Wait {
  /** Скільки секунд уже є про що думати. */
  waited: number;
  /** Скільки треба чекати до наступної думки. */
  wait: number;
}

/**
 * Хто й коли думає (§11.4): проміжки — у реальних секундах гри без пауз (рахує сцена, лише поки гра йде).
 * Кожен кіт — раз на ~`THOUGHTS.catSeconds`, між різними котами — щонайменше `catGapSeconds`, обидва
 * діляться на множник складності; коли котів багато, думає той, хто найдовше чекає понад свій проміжок, тож
 * кожен рідше, але ніхто не забутий. Персонаж — раз на ~`personSeconds`; думки кота й персонажа — не разом.
 * Перша думка — через проміжок після того, як стан настав; після поїздки й ночі (сцена бере новий годинник) —
 * теж. Розкид — детермінований, без `Math.random`.
 */
export class ThoughtClock {
  private readonly cats = new Map<number, Wait>();
  private person: Wait | null = null;
  private sinceCat = Number.POSITIVE_INFINITY;
  private sinceAny = Number.POSITIVE_INFINITY;
  private count = 0;

  /** Наступний проміжок із розкидом ±`THOUGHTS.jitter`. */
  private next(base: number): number {
    this.count += 1;
    const r = Math.sin(this.count * 12.9898) * 43758.5453;
    return base * (1 + THOUGHTS.jitter * (2 * (r - Math.floor(r)) - 1));
  }

  /**
   * Минуло `seconds` гри: які думки показати зараз. `taken` — чи вже висить бабл над тим, хто думає
   * (тоді думка чекає, доки він звільниться).
   */
  tick(state: GameState, seconds: number, taken: (owner: string) => boolean): EventBubble[] {
    const thoughts: EventBubble[] = [];
    if (state.trip !== null) {
      // Поки персонаж у поїздці, ніхто не думає, а вдома — чекають з нуля.
      this.cats.clear();
      this.person = null;
      return thoughts;
    }
    const frequency = THOUGHTS.frequency[state.difficulty];
    const catSeconds = THOUGHTS.catSeconds / frequency;
    this.sinceCat += seconds;
    this.sinceAny += seconds;
    // Чекають усі, хто має про що думати, а думає той, хто найдовше чекає понад свій проміжок.
    let ready: { thought: EventBubble; wait: Wait; over: number } | null = null;
    const thinking = new Set<number>();
    for (const cat of state.cats) {
      const icon = inView(state, cat) ? catThought(state, cat) : null;
      if (icon === null) continue;
      thinking.add(cat.id);
      let wait = this.cats.get(cat.id);
      if (!wait) {
        wait = { waited: 0, wait: this.next(catSeconds) };
        this.cats.set(cat.id, wait);
      }
      wait.waited += seconds;
      const at = `cat:${cat.id}` as const;
      const over = wait.waited - wait.wait;
      if (over >= 0 && !taken(at) && (ready === null || over > ready.over)) ready = { thought: { kind: "think", at, icon }, wait, over };
    }
    // Кому вже нема про що думати — наступного разу чекає з нуля.
    for (const id of this.cats.keys()) if (!thinking.has(id)) this.cats.delete(id);
    if (ready && this.sinceCat >= THOUGHTS.catGapSeconds / frequency && this.sinceAny >= THOUGHTS.apartSeconds) {
      thoughts.push(ready.thought);
      ready.wait.waited = 0;
      ready.wait.wait = this.next(catSeconds);
      this.sinceCat = 0;
      this.sinceAny = 0;
    }

    const icon = personThought(state);
    if (icon === null) {
      this.person = null;
      return thoughts;
    }
    this.person ??= { waited: 0, wait: this.next(THOUGHTS.personSeconds) };
    this.person.waited += seconds;
    if (this.person.waited >= this.person.wait && !taken("person") && this.sinceAny >= THOUGHTS.apartSeconds) {
      thoughts.push({ kind: "think", at: "person", icon });
      this.person = { waited: 0, wait: this.next(THOUGHTS.personSeconds) };
      this.sinceAny = 0;
    }
    return thoughts;
  }
}
