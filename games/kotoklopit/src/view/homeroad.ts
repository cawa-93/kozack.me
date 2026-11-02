// Дорога додому (§8.5, рішення автора 2026-11-02): коротка катсцена без керування. Та сама дорога з машинами, що й у гонці, але
// вигляд іде згори вниз: камера рухається вниз, а машина персонажа, швидша за камеру, в'їжджає в кадр згори, обганяє камеру
// й виїжджає за нижній край — і персонаж удома біля дверей. Чисті розрахунки без Phaser і DOM (`tests/homeroad.test.ts`);
// малює `RaceScene`. Час дороги додому рахує сим, як і раніше: катсцена його не змінює.
//
// Швидкості й місця — у висотах кадру: арт дороги на вищому полотні більшає разом із ним (`raceScale`), тож катсцена однакова
// на будь-якому екрані. Кадр — функція часу від початку катсцени: кадри з різним кроком показують те саме.

import { raceScale, trafficLook, type TrafficLook } from "./racelook";

export const HOME_ROAD = {
  /** Уся катсцена, мс (§8.5: «близько 3 секунд»). */
  ms: 3000,
  /** Камера, висот кадру за секунду: дорога біжить екраном угору. */
  camera: 1.2,
  /** Попутні машини, висот кадру за секунду: повільніші за камеру — на екрані відстають угору, а своя їх обганяє. */
  traffic: 0.6,
  /** Своя машина торкається передом верхнього краю кадру, мс. */
  enter: 250,
  /** Своя машина вся за нижнім краєм кадру, мс. */
  exit: 2450,
  /** На початку кадр проступає з чорного, наприкінці темніє до чорного (мс): з чорного проступає й квартира. */
  fadeIn: 250,
  fadeOut: 350,
  /** Натискання раніше за це (мс) — ще те, що закрило картку візиту: катсцену воно не пропускає. */
  skipAfter: 200,
  /** Своя смуга — середня: попутні машини — у крайніх, тож своя ні в кого не впирається. */
  lane: 1,
} as const;

/**
 * Від середини машини (pivot) до найдальшого краю її кадру, одиниці арту (`race/car/*`: 72 × 84, pivot y 40): машина далі за
 * стільки від краю кадру — уся за ним, і носом донизу теж.
 */
export const CAR_REACH = 44;

/**
 * Попутні машини на початку катсцени: смуга й y середини (висот кадру). За катсцену камера обганяє їх на
 * (`camera` − `traffic`) × 3 с = 1,8 висоти кадру, тож вони стоять до 2,9 висоти — кадр повний до кінця.
 */
const TRAFFIC: readonly { lane: number; y: number }[] = [
  { lane: 0, y: 0.08 },
  { lane: 2, y: 0.34 },
  { lane: 0, y: 0.62 },
  { lane: 2, y: 1.0 },
  { lane: 0, y: 1.31 },
  { lane: 2, y: 1.52 },
  { lane: 0, y: 1.84 },
  { lane: 2, y: 2.15 },
  { lane: 0, y: 2.47 },
  { lane: 2, y: 2.76 },
];

/** Попутна машина в кадрі: смуга, y середини на екрані й вигляд (носом донизу, як і своя). */
export interface HomeRoadCar {
  lane: number;
  y: number;
  look: TrafficLook;
}

/** Кадр дороги додому. */
export interface HomeRoadFrame {
  /** Скільки проїхала камера, px кадру: дорога зсунута на стільки вгору. */
  camera: number;
  /** Своя машина: y середини на екрані (носом донизу, у смузі `HOME_ROAD.lane`); поза кадром — вище чи нижче за нього. */
  car: number;
  /** Попутні машини, що в кадрі (з запасом на довжину машини). */
  traffic: HomeRoadCar[];
  /** Темрява поверх дороги: 0 — немає, 1 — чорний екран. */
  dark: number;
  /** Катсцена скінчилася: персонаж удома. */
  done: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Скільки пікселів кадру від середини машини до її найдальшого краю на полотні заввишки `height`. */
export function carReach(height: number): number {
  return CAR_REACH * raceScale(height);
}

/**
 * Кадр дороги додому через `ms` мс від початку катсцени на полотні заввишки `height` (одиниці інтерфейсу). Своя машина їде
 * рівно: між `enter` і `exit` вона проходить увесь кадр і ще свою довжину, тож на екрані з'являється згори, а зникає знизу; до
 * і після — за краями.
 */
export function homeRoadFrame(ms: number, height: number): HomeRoadFrame {
  const time = Math.max(0, ms);
  const seconds = time / 1000;
  const reach = carReach(height);
  const camera = HOME_ROAD.camera * height * seconds;
  const top = -reach;
  const bottom = height + reach;
  const car = top + ((bottom - top) * (time - HOME_ROAD.enter)) / (HOME_ROAD.exit - HOME_ROAD.enter);
  const lag = (HOME_ROAD.camera - HOME_ROAD.traffic) * height * seconds;
  const traffic: HomeRoadCar[] = [];
  TRAFFIC.forEach((spot, i) => {
    const y = spot.y * height - lag;
    if (y > top && y < bottom) traffic.push({ lane: spot.lane, y, look: trafficLook({ start: i }) });
  });
  const dark = Math.max(clamp01(1 - time / HOME_ROAD.fadeIn), clamp01((time - (HOME_ROAD.ms - HOME_ROAD.fadeOut)) / HOME_ROAD.fadeOut));
  return { camera, car, traffic, dark, done: time >= HOME_ROAD.ms };
}

/** Чи пропускає катсцену натискання через `ms` мс від її початку (§8.5: «натискання її пропускає»). */
export function canSkipHomeRoad(ms: number): boolean {
  return ms >= HOME_ROAD.skipAfter;
}
