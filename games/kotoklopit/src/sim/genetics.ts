// Зовнішність кота (§9.10): спрощена генетика забарвлення й форми частин тіла.
// Вигляд виводиться з генів, тож палітра реалістична, а плями лягають в анатомічному порядку.

import type { Rng } from "./rng";
import type { Genes, Sex, Shape } from "./types";

/** Частоти алелів у безпородних котів (§9.10, чернетка). */
const ALLELE = {
  orange: 0.2,
  chocolate: 0.06,
  dilute: 0.3,
  solid: 0.55,
  colorpoint: 0.08,
  long: 0.3,
} as const;
/** Тип табі: мармуровий, смугастий, плямистий, тікований. */
const TABBY_WEIGHTS = [0.4, 0.5, 0.05, 0.05] as const;
/** Алель білих плям: немає, трохи, багато. */
const WHITE_WEIGHTS = [0.6, 0.28, 0.12] as const;

function weighted(rng: Rng, weights: readonly number[]): number {
  let roll = rng.next() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

const pair = <T>(make: () => T): [T, T] => [make(), make()];

/** Випадкові гени безпородного кота (§9.10). */
export function randomGenes(rng: Rng, sex: Sex): Genes {
  return {
    orange: Array.from({ length: sex === "female" ? 2 : 1 }, () => rng.chance(ALLELE.orange)),
    black: pair(() => !rng.chance(ALLELE.chocolate)),
    dense: pair(() => !rng.chance(ALLELE.dilute)),
    agouti: pair(() => !rng.chance(ALLELE.solid)),
    tabby: pair(() => weighted(rng, TABBY_WEIGHTS)),
    white: pair(() => weighted(rng, WHITE_WEIGHTS)),
    full: pair(() => !rng.chance(ALLELE.colorpoint)),
    short: pair(() => !rng.chance(ALLELE.long)),
    eyes: rng.int(0, 2),
  };
}

/** Звичайні форми з реалістичною частотою (§9.10); породні форми — лише від породи. */
export function randomShape(rng: Rng): Shape {
  const pick = <T>(options: readonly (readonly [T, number])[]): T =>
    options[weighted(rng, options.map(([, w]) => w))]?.[0] ?? (options[0] as readonly [T, number])[0];
  return {
    muzzle: pick([["normal", 0.8], ["flat", 0.1], ["long", 0.1]] as const),
    ears: pick([["normal", 0.85], ["large", 0.15]] as const),
    tail: pick([["long", 0.8], ["short", 0.1], ["fluffy", 0.1]] as const),
    build: pick([["slim", 0.25], ["normal", 0.5], ["stocky", 0.25]] as const),
    legs: "normal",
    coat: null,
  };
}

export type Pigment = "black" | "chocolate" | "blue" | "lilac" | "orange" | "cream";
export type TabbyPattern = "classic" | "mackerel" | "spotted" | "ticked";
export type EyeColor = "blue" | "green" | "yellow" | "copper";

/** Вигляд кота, виведений із генів (§9.10): що малює графіка. */
export interface Coat {
  /** Основний колір; у черепахових — ще й другий. */
  base: Pigment;
  second: Pigment | null;
  tabby: TabbyPattern | null;
  /** Скільки білого: 0 — немає, 1 — лапки й груди, 2 — біколор, 3 — ван. */
  white: number;
  /** Колорпойнт: тіло світле, колір лише на «кінчиках». */
  pointed: boolean;
  long: boolean;
  eyes: EyeColor;
}

const TABBY: readonly TabbyPattern[] = ["classic", "mackerel", "spotted", "ticked"];

export function coatOf(genes: Genes, shape: Pick<Shape, "coat">): Coat {
  const dilute = !genes.dense[0] && !genes.dense[1];
  const chocolate = !genes.black[0] && !genes.black[1];
  const eumelanin: Pigment = chocolate ? (dilute ? "lilac" : "chocolate") : dilute ? "blue" : "black";
  const red: Pigment = dilute ? "cream" : "orange";
  const oranges = genes.orange.filter(Boolean).length;
  // Черепахове забарвлення — лише в кішки з одним рудим алелем (§9.10).
  const tortie = genes.orange.length === 2 && oranges === 1;
  const allOrange = oranges === genes.orange.length;
  const base = allOrange ? red : eumelanin;
  const agouti = genes.agouti[0] || genes.agouti[1];
  // Руді коти завжди з малюнком.
  const showsTabby = agouti || allOrange;
  const white = Math.min(3, genes.white[0] + genes.white[1]);
  const pointed = !genes.full[0] && !genes.full[1];
  const eyes: EyeColor = pointed || white >= 3 ? "blue" : (["green", "yellow", "copper"] as const)[genes.eyes] ?? "green";
  return {
    base,
    second: tortie ? red : null,
    tabby: showsTabby ? (TABBY[Math.max(genes.tabby[0], genes.tabby[1])] ?? "mackerel") : null,
    white,
    pointed,
    long: shape.coat === null && !genes.short[0] && !genes.short[1],
    eyes,
  };
}
