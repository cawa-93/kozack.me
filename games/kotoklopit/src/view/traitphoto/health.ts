// Знімки рис розділу «Здоров'я й тіло» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitBubble, TraitPhotoShots, TraitProp } from "./types";

/** Іконка як річ на фото: pivot у центрі, тож на підлозі y — мінус половина висоти. */
const icon = (name: string, x: number, y: number, scale = 0.4): TraitProp => ({ art: `icon/${name}`, state: null, x, y, scale });

/** Переноска, у якій давно не їздили: павутина на ній. */
const DUSTY_CARRIER: readonly TraitProp[] = [
  { art: "item/carrier/cheap", state: "body", x: 56, y: -6, scale: 0.6 },
  { art: "mess/cobweb", state: "corner", x: 58, y: 56, scale: 0.4 },
];
/** Та сама переноска далі позаду й убік, дверцятами не до кота. */
const DUSTY_CARRIER_AWAY: readonly TraitProp[] = [
  { art: "item/carrier/cheap", state: "body", x: 70, y: -24, scale: 0.5 },
  { art: "mess/cobweb", state: "corner", x: 72, y: 28, scale: 0.33 },
];
/** Торт зі свічками-цифрами «20»: ювілей довгожителя (не кубок: той — іконка виставки котів). */
const CAKE: TraitProp = { art: "item/cake", state: null, x: 46, y: 8, scale: 0.7, front: true };
/**
 * Картонна коробка з наліпкою «крихке» (келих), у якій сидить кіт, як у квартирі (`bigboxlook.ts`): коробка — під котом на
 * висоті, де він у ній сидить (`top` 48), передні стінки й наліпка на правій грані — поверх нього. `lift` — на скільки кіт вищий
 * за дно: буханець без нього майже не видно з-за борту.
 */
const fragileBox = (lift = 0): TraitProp[] => [
  { art: "env/boxes", state: "pile-1", x: 0, y: 48 + lift },
  { art: "env/boxes/front", state: "pile-1", x: 0, y: 48 + lift, front: true },
  { art: "item/fragile-sign", state: null, x: 30, y: 31 + lift, scale: 1.3, front: true },
];
const FRAGILE_BOX = fragileBox();

const PILLS = icon("pills", 40, -4, 0.36);
const THERMOMETER = icon("thermometer", -42, -6, 0.36);
/** Чхання застуди: бризки від носа, ідуть за головою. */
const SNEEZE: TraitProp = { art: "fx/sneeze", state: null, x: 2, y: -4, socket: "teeth", scale: 0.8 };

const FULL_BOWL: TraitProp = { art: "item/bowl/premium", state: "premium-2", x: 42, y: 10, front: true, scale: 0.7 };
/** Вилизана дочиста миска (не синя порожня: ту читали мискою з водою). */
const LICKED_BOWL: TraitProp = { art: "item/bowl/premium", state: "licked", x: 42, y: 10, front: true, scale: 0.7 };
/** Дві вилизані миски збоку, позаду кота: їв за двох. */
const TWO_LICKED_BOWLS: readonly TraitProp[] = [
  { ...LICKED_BOWL, x: 50, y: -2, front: false },
  { ...LICKED_BOWL, x: 68, y: 8, front: false },
];
/** Ваги для кота: кіт стоїть на платформі. */
const SCALES: TraitProp = { art: "item/scales", state: null, x: 0, y: 8 };
/** Думка «ожиріння ✗» (іконка хвороби в лікаря — товстий кіт на вагах). */
const NOT_FAT: readonly TraitBubble[] = [{ kind: "think", icon: "obese", mark: "no" }];

/** Підвіконня з батареєю: кіт на дошці (`seat`). */
const RADIATOR: TraitProp = { art: "env/sill-living", state: null, x: 13, y: 45, scale: 0.55 };
const COLD = icon("chilly", 34, -60, 0.36);
const HOT = icon("hot", 34, -50, 0.4);
const WATER: TraitProp = { art: "item/water/cheap", state: "full", x: -44, y: 8, scale: 0.7 };
/** Прохолодна плитка з ванної: кіт розлігся на ній. */
const COOL_TILE: TraitProp = { art: "env/cool-tile", state: null, x: 0, y: 4, scale: 0.8 };

export const SHOTS: TraitPhotoShots = {
  // Тиха група: знімок — метафора. «+» — торт зі свічками «20» (ювілей довгожителя), «−» — кіт у коробці з наліпкою «крихке».
  longevity: {
    plus: {
      content: {
        idea: "Поважний кіт задоволено мружиться біля торта зі свічками «20»: черговий ювілей, а роки над ним не мають влади.",
        props: [CAKE],
      },
      calm: {
        idea: "Кіт статечно сидить біля торта зі свічками «20»: ще один день народження довгожителя.",
        props: [CAKE],
      },
      sulk: {
        idea: "Насуплений кіт сидить біля торта зі свічками «20»: ображений навіть на власному ювілеї, а роки однаково не беруть.",
        props: [CAKE],
      },
      ill: {
        idea: "Хворий кіт із градусником лежить буханцем біля торта зі свічками «20»: нездужає, та вперто дотягує до чергового ювілею.",
        props: [{ ...CAKE, x: 62 }],
      },
    },
    minus: {
      content: {
        idea: "Кіт задоволено мружиться, сидячи в картонній коробці з наліпкою «крихке» (келих): тендітний, поводитися обережно.",
        still: { shadow: false },
        props: FRAGILE_BOX,
      },
      calm: {
        idea: "Кіт спокійно сидить у картонній коробці з наліпкою «крихке» (келих): його бережуть, як скляний скарб.",
        still: { shadow: false },
        props: FRAGILE_BOX,
      },
      sulk: {
        idea: "Насуплений кіт сидить у картонній коробці з наліпкою «крихке» (келих): потребує дбайливих рук частіше, ніж їх отримує.",
        still: { shadow: false },
        props: FRAGILE_BOX,
      },
      ill: {
        idea: "Хворий кіт із градусником зіщулився в картонній коробці з наліпкою «крихке» (келих): тендітний, наче сам зі скла.",
        still: { shadow: false },
        props: fragileBox(6),
      },
    },
  },
  // Тиха група: «+» — переноска в павутинні (до ветеринара не їздили роками), «−» — чхає біля градусника (хворий — серед ліків).
  hardiness: {
    plus: {
      content: {
        idea: "Пашить здоров'ям кіт задоволено мружиться біля переноски, обплетеної павутиною: ветеринара знає хіба що в обличчя.",
        props: DUSTY_CARRIER,
      },
      calm: {
        idea: "Кіт спокійно сидить біля переноски в павутинні: до ветеринара не їздили так давно, що павук устиг обжитися.",
        props: DUSTY_CARRIER,
      },
      sulk: {
        idea: "Насуплений кіт сидить біля запилюженої переноски: ніколи не хворіє, тож про нього й не дуже хвилюються.",
        props: DUSTY_CARRIER,
      },
      ill: {
        idea: "Хворий кіт зі сльозою все ж сидить рівно, спиною до далекої переноски в павутинні: тримається на лапах там, де інший зліг би.",
        still: { base: "sit", flip: true },
        props: DUSTY_CARRIER_AWAY,
      },
    },
    minus: {
      content: {
        idea: "Кіт мружиться й чхає — бризки від носа, поруч градусник: знову застудився, зате кожна застуда — привід для турботи.",
        still: { mouth: "meow" },
        props: [THERMOMETER, SNEEZE],
      },
      calm: {
        idea: "Кіт сидить і чхає, заплющивши очі, — бризки від носа, поруч градусник: знову застуда, до ветеринара стежка ширша, ніж до миски.",
        still: { eyes: "closed", mouth: "meow" },
        props: [THERMOMETER, SNEEZE],
      },
      sulk: {
        idea: "Насуплений кіт із притиснутими вухами чхає — бризки від носа, поруч градусник: перехворів на все, що кружляло в повітрі.",
        still: { mouth: "meow" },
        props: [THERMOMETER, SNEEZE],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем серед ліків і градусника: раз у раз нездужає й довго одужує.",
        props: [PILLS, THERMOMETER],
      },
    },
  },
  // Головний знак — статура: «+» — круглий кіт (`figure: "fat"`), «−» — стрункий (`slim`); поруч миски й ваги.
  chubby: {
    plus: {
      content: {
        idea: "Круглий, як колобок, кіт задоволено лежить буханцем на вагах, поруч повна миска: гордо носить пишні боки.",
        still: { base: "loaf", figure: "fat", shadow: false },
        props: [SCALES, { ...FULL_BOWL, x: 60, y: 12 }],
      },
      calm: {
        idea: "Круглий кіт спокійно наминає з повної миски, стоячи на вагах: їсть усе, що дають, і помітно гладшає.",
        still: { base: "eat", at: 1100, eyes: "open", mouth: "eat", figure: "fat", shadow: false },
        props: [SCALES, { ...FULL_BOWL, x: 34, y: 6 }],
      },
      sulk: {
        idea: "Круглий насуплений кіт сидить на вагах: ображений на те, що вони показують.",
        still: { figure: "fat", shadow: false },
        props: [SCALES],
      },
      ill: {
        idea: "Круглий хворий кіт важко лежить на вагах: зайва вага вже не на користь.",
        still: { figure: "fat", shadow: false },
        props: [SCALES],
      },
    },
    minus: {
      content: {
        idea: "Стрункий кіт радісно потягується біля двох вилизаних мисок, думка «ожиріння ✗»: їсть за двох і не змінюється в боках.",
        still: { base: "stretch", at: 600, figure: "slim" },
        props: TWO_LICKED_BOWLS,
        bubbles: NOT_FAT,
      },
      calm: {
        idea: "Стрункий кіт спокійно сидить біля двох вилизаних мисок, думка «ожиріння ✗»: з'їв за двох — і жодного зайвого грама.",
        still: { figure: "slim" },
        props: TWO_LICKED_BOWLS,
        bubbles: NOT_FAT,
      },
      sulk: {
        idea: "Стрункий насуплений кіт сидить біля двох вилизаних мисок, думка «ожиріння ✗»: з'їв усе, а боки ні на грам не додались.",
        still: { figure: "slim" },
        props: TWO_LICKED_BOWLS,
        bubbles: NOT_FAT,
      },
      ill: {
        idea: "Стрункий хворий кіт сидить біля двох вилизаних мисок, думка «ожиріння ✗»: хоч скільки їсть, а все такий самий.",
        still: { base: "sit", figure: "slim" },
        props: TWO_LICKED_BOWLS,
        bubbles: NOT_FAT,
      },
    },
  },
  warmth: {
    plus: {
      content: {
        idea: "Кіт солодко спить клубком на підвіконні просто над батареєю: живе на батареї.",
        still: { base: "sleep", eyes: "closed", shadow: false },
        props: [RADIATOR],
      },
      calm: {
        idea: "Кіт спокійно лежить буханцем на теплому підвіконні над батареєю й дивиться на нас.",
        still: { base: "loaf", shadow: false },
        props: [RADIATOR],
      },
      sulk: {
        idea: "Насуплений кіт сидить на підвіконні над батареєю: хоч тепло зігріє.",
        still: { shadow: false },
        props: [RADIATOR],
      },
      ill: {
        idea: "Хворий кіт зіщулився біля холодної батареї й думає «холодно»: мерзне й шукає тепла, якого бракує.",
        props: [{ ...RADIATOR, x: -48, y: -6 }],
        bubbles: [{ kind: "think", icon: "chilly" }],
      },
    },
    minus: {
      content: {
        idea: "Кіт по-панськи розпластався на прохолодній плитці й мружиться, поруч сніжинка: полярник, якому холод — у радість.",
        still: { base: "sprawl" },
        props: [COOL_TILE, { ...COLD, y: -40 }],
      },
      calm: {
        idea: "Кіт спокійно лежить буханцем на прохолодній плитці, поруч сніжинка: прохолода милша за м'яке крісло.",
        still: { base: "loaf" },
        props: [COOL_TILE, { ...COLD, x: -30, y: -40 }],
      },
      sulk: {
        idea: "Насуплений кіт сидить під пекучим сонцем і важко дихає, висолопивши язика, поруч порожня миска для води: спека — не для нього.",
        still: { overlay: "pant", at: 600 },
        props: [{ ...HOT, x: -32, y: -68 }, { ...WATER, state: "empty", x: 50, y: 12, front: true }],
      },
      ill: {
        idea: "Хворий кіт знесилено розпластався на підлозі під пекучим сонцем: знемагає в спеку.",
        still: { base: "sprawl" },
        props: [{ ...HOT, y: -40 }, { ...WATER, state: "empty" }],
      },
    },
  },
};
