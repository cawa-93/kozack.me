// Теми рівнів (§11.2): тема = набір параметрів для процедурного малювання й світильників.

export type LampKind = "electric" | "torch" | "mushroom";

export interface Theme {
  name: string;
  floor: number;
  floorAlt: number;
  floorDetail: number;
  wall: number;
  wallFace: number;
  wallMortar: number;
  lampKind: LampKind;
  lampColor: number;
  /** Амплітуда мерехтіння радіуса світильника. */
  lampFlicker: number;
  /** Колір плям (вода, мох, органіка) — декор підлоги. */
  stain: number;
  stainChance: number;
  /** Згаслі смолоскипи рівня 3 (§11.2): декор поза лімітом. */
  deadTorches: boolean;
  /** Павутинні наривки на стінах (рівень 5). */
  wallWebbing: boolean;
  exit: "hatch" | "stairs" | "crack" | "breach";
}

export const THEMES: Theme[] = [
  {
    name: "Склад",
    floor: 0x5e5a53,
    floorAlt: 0x4d4943,
    floorDetail: 0x6d685f,
    wall: 0x8c867a,
    wallFace: 0xc9c2b2,
    wallMortar: 0x6f695e,
    lampKind: "electric",
    lampColor: 0xffd9a0,
    lampFlicker: 0.015,
    stain: 0x2a2621,
    stainChance: 0.14,
    deadTorches: false,
    wallWebbing: false,
    exit: "hatch",
  },
  {
    name: "Підземелля замку",
    floor: 0x55565a,
    floorAlt: 0x4a4b50,
    floorDetail: 0x67686d,
    wall: 0x4d4f57,
    wallFace: 0x7b7e88,
    wallMortar: 0x33353b,
    lampKind: "torch",
    lampColor: 0xff9a45,
    lampFlicker: 0.08,
    stain: 0x2e3036,
    stainChance: 0.1,
    deadTorches: false,
    wallWebbing: false,
    exit: "stairs",
  },
  {
    name: "Занедбане підземелля замку",
    floor: 0x4a4d48,
    floorAlt: 0x41443f,
    floorDetail: 0x5a5e55,
    wall: 0x44473f,
    wallFace: 0x6c7064,
    wallMortar: 0x2c2f28,
    lampKind: "torch",
    lampColor: 0xff9040,
    lampFlicker: 0.08,
    stain: 0x33482c,
    stainChance: 0.22,
    deadTorches: true,
    wallWebbing: false,
    exit: "stairs",
  },
  {
    name: "Печера",
    floor: 0x3b342c,
    floorAlt: 0x342e27,
    floorDetail: 0x4a4237,
    wall: 0x3a3631,
    wallFace: 0x5d574e,
    wallMortar: 0x26231f,
    lampKind: "mushroom",
    lampColor: 0x62e6c8,
    lampFlicker: 0.04,
    stain: 0x2a3a36,
    stainChance: 0.2,
    deadTorches: false,
    wallWebbing: false,
    exit: "crack",
  },
  {
    name: "Глибока печера",
    floor: 0x322a28,
    floorAlt: 0x2b2422,
    floorDetail: 0x40362f,
    wall: 0x2f2a28,
    wallFace: 0x4f4642,
    wallMortar: 0x1d1917,
    lampKind: "mushroom",
    lampColor: 0x4fc4b0,
    lampFlicker: 0.05,
    stain: 0x3a2e2a,
    stainChance: 0.25,
    deadTorches: false,
    wallWebbing: true,
    exit: "breach",
  },
];

export const BREACH_COLOR = 0xdcefff;
export const MEMORY_TINT = [0.55, 0.64, 0.78];
