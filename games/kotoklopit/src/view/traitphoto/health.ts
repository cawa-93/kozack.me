// Знімки рис розділу «Здоров'я й тіло» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).

import type { TraitPhotoShots, TraitProp } from "./types";

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
/** Торт зі свічками: ювілей довгожителя (не кубок: той — іконка виставки котів). */
const CAKE: TraitProp = { art: "item/cake", state: null, x: 46, y: 8, scale: 0.7, front: true };
/** М'яка лежанка: кіт у ній. */
const CAT_BED: TraitProp = { art: "item/cat-bed", state: null, x: 0, y: 6, scale: 0.85, withCat: true };

const PILLS = icon("pills", 40, -4, 0.36);
const THERMOMETER = icon("thermometer", -42, -6, 0.36);

const FULL_BOWL: TraitProp = { art: "item/bowl/premium", state: "premium-2", x: 42, y: 10, front: true, scale: 0.7 };
/** Вилизана дочиста миска (не синя порожня: ту читали мискою з водою). */
const LICKED_BOWL: TraitProp = { art: "item/bowl/premium", state: "licked", x: 42, y: 10, front: true, scale: 0.7 };
/** Дві вилизані миски збоку, позаду кота: їв за двох. */
const TWO_LICKED_BOWLS: readonly TraitProp[] = [
  { ...LICKED_BOWL, x: 50, y: -2, front: false },
  { ...LICKED_BOWL, x: 68, y: 8, front: false },
];
/** Ваги для кота: кіт стоїть на платформі. */
const SCALES: TraitProp = { art: "item/scales", state: null, x: 0, y: 8, withCat: true };

/** Підвіконня з батареєю: кіт на дошці (`seat`). */
const RADIATOR: TraitProp = { art: "env/sill-living", state: null, x: 13, y: 45, scale: 0.55 };
const COLD = icon("chilly", 34, -60, 0.36);
const HOT = icon("hot", 34, -50, 0.4);
const WATER: TraitProp = { art: "item/water/cheap", state: "full", x: -44, y: 8, scale: 0.7 };
/** Прохолодна плитка з ванної: кіт розлігся на ній. */
const COOL_TILE: TraitProp = { art: "env/cool-tile", state: null, x: 0, y: 4, scale: 0.8, withCat: true };

export const SHOTS: TraitPhotoShots = {
  // Тиха група: знімок — метафора. «+» — торт зі свічками (ювілей довгожителя), «−» — тендітний кіт у м'якій лежанці.
  longevity: {
    plus: {
      content: {
        idea: "Поважний кіт задоволено мружиться біля торта зі свічками: черговий ювілей, а роки над ним не мають влади.",
        props: [CAKE],
      },
      calm: {
        idea: "Кіт статечно сидить біля торта зі свічками: ще один день народження довгожителя.",
        props: [CAKE],
      },
      sulk: {
        idea: "Насуплений кіт сидить біля торта зі свічками: ображений навіть на власному ювілеї, а роки однаково не беруть.",
        props: [CAKE],
      },
      ill: {
        idea: "Хворий кіт лежить буханцем біля торта зі свічками: нездужає, та вперто дотягує до чергового ювілею.",
        props: [{ ...CAKE, x: 48 }],
      },
    },
    minus: {
      content: {
        idea: "Тендітний кіт задоволено лежить буханцем у м'якій лежанці: найм'якше місце в домі — його.",
        still: { base: "loaf", shadow: false },
        props: [CAT_BED],
      },
      calm: {
        idea: "Тендітний кіт обережно сидить у м'якій лежанці, підібгавши лапку: його бережуть, як скарб.",
        still: { bones: { "leg-front-near": -25 }, shadow: false },
        props: [CAT_BED],
      },
      sulk: {
        idea: "Насуплений кіт сидить у м'якій лежанці: потребує дбайливих рук частіше, ніж їх отримує.",
        still: { shadow: false },
        props: [CAT_BED],
      },
      ill: {
        idea: "Хворий кіт зіщулився в м'якій лежанці: тендітний, наче весь світ зі скла.",
        still: { shadow: false },
        props: [CAT_BED],
      },
    },
  },
  // Тиха група: «+» — переноска в павутинні (до ветеринара не їздили роками), «−» — ліки й градусник.
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
        idea: "Кіт задоволено мружиться між ліками й градусником: часто нездужає, зате кожна застуда — привід для турботи.",
        props: [PILLS, THERMOMETER],
      },
      calm: {
        idea: "Кіт спокійно сидить між ліками й градусником: протоптав до ветеринара стежку ширшу, ніж до миски.",
        props: [PILLS, THERMOMETER],
      },
      sulk: {
        idea: "Насуплений кіт сидить біля ліків і градусника: перехворів на все, що кружляло в повітрі.",
        props: [PILLS, THERMOMETER],
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
        idea: "Круглий, як колобок, кіт задоволено лежить буханцем біля повної миски: гордо носить пишні боки.",
        still: { base: "loaf", figure: "fat" },
        props: [FULL_BOWL],
      },
      calm: {
        idea: "Круглий кіт спокійно наминає з повної миски: їсть усе, що дають, і помітно гладшає.",
        still: { base: "eat", at: 1100, eyes: "open", mouth: "eat", figure: "fat" },
        props: [{ ...FULL_BOWL, x: 30, y: 6 }],
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
        idea: "Стрункий кіт радісно потягується біля двох вилизаних мисок: їсть за двох і не змінюється в боках.",
        still: { base: "stretch", at: 600, figure: "slim" },
        props: TWO_LICKED_BOWLS,
      },
      calm: {
        idea: "Стрункий кіт спокійно сидить на вагах біля вилизаної миски: з'їв усе — і жодного зайвого грама.",
        still: { figure: "slim", shadow: false },
        props: [SCALES, { ...LICKED_BOWL, x: 50 }],
      },
      sulk: {
        idea: "Стрункий насуплений кіт сидить біля двох вилизаних мисок: з'їв усе, а боки ні на грам не додались.",
        still: { figure: "slim" },
        props: TWO_LICKED_BOWLS,
      },
      ill: {
        idea: "Стрункий хворий кіт сидить біля двох вилизаних мисок: хоч скільки їсть, а все такий самий.",
        still: { base: "sit", figure: "slim" },
        props: TWO_LICKED_BOWLS,
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
        idea: "Насуплений кіт сидить під пекучим сонцем із краплею поту: спека — не для нього.",
        props: [HOT],
      },
      ill: {
        idea: "Хворий кіт знесилено розпластався на підлозі під пекучим сонцем: знемагає в спеку.",
        still: { base: "sprawl" },
        props: [{ ...HOT, y: -40 }, { ...WATER, state: "empty" }],
      },
    },
  },
};
