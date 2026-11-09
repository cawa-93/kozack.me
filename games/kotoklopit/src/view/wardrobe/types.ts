// Гардероб персонажа (§5.1, `WARDROBE.md`): спільне для реєстрів — запис варіанта, колір і вигляд, як його вдягнено. Без
// Phaser і DOM.

import type { Look } from "../../sim/types";

/** Варіант ряду редактора: назва й вага для «Випадково». */
export interface WardrobeEntry {
  /** Назва в редакторі (значення повзунка). */
  readonly name: string;
  /** Вага для «Випадково» (`randomLook`): менше — рідше, 0 — ніколи випадково; без неї — 1. */
  readonly weight?: number;
}

/** Варіант-колір: колір 0xRRGGBB, яким компонувальник фарбує заливку. */
export interface WardrobeColor extends WardrobeEntry {
  readonly color: number;
}

/** Одяг, на який лягає візерунок. */
export type Garment = "top" | "bottom";

/**
 * Вигляд, як його вдягнено (`wearOf`): усі поля `Look` із типовими значеннями, номери — у межах реєстрів, поєднання
 * застосовано: візерунок, що не лягає на фасон, — однотонний; акцент у зачіски без маски — немає; низ комбінезона — з верху.
 */
export interface Wear extends Readonly<Required<Look>> {
  /** Низ — частина верху (`TopCut.bottom`): фасон низу задає верх, ноги — кольором і візерунком верху. */
  readonly suit: boolean;
}
