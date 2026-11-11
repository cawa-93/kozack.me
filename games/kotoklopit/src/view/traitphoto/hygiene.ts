// Знімки рис розділу «Гігієна й туалет» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Примети груп: «Розкидання наповнювача» — риє в лотку, а наповнювач на підлозі (чи лад довкола); «Вибагливість до лотка» —
// нюхає брудний лоток і відвертається (чи спокійно сидить у брудному); «Мітки» — поза мітки й калюжка; «Шерстяні грудки» —
// грудка й кашель (чи вмивається без наслідків); «Догляд за шерстю» — жмути шерсті (чи чисте ліжко); «Любов до води» — душова.

import type { ArtId } from "../art/types";
import type { TraitPhotoShots, TraitProp } from "./types";

const prop = (art: ArtId, state: string | null, x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => ({ art, state, x, y, ...more });

/** Відкритий лоток, у якому стоїть кіт, — позаду нього: кадр лотка цілий, і передній борт закрив би кота. */
const BOX_SCALE = 0.65;
const box = (state: string, x = 0, y = -4, scale = BOX_SCALE): TraitProp => prop("item/litter/cheap", state, x, y, { scale });
/** Наповнювач, розкиданий довкола лотка. */
const litter = (x: number, y: number): TraitProp => prop("mess/litter", null, x, y, { front: y > 0, scale: 0.7 });
/** Хвилі запаху над брудним лотком. */
const smell = (x: number, y: number): TraitProp => prop("fx/smell", "a", x, y, { front: true, scale: 0.7 });

/** Свій будиночок позаду кота — «свій кут». */
const HOUSE = (x: number, y: number): TraitProp => prop("item/house/premium", null, x, y, { scale: 0.42 });

/** Душова кабіна позаду кота: кіт — на її піддоні (`tray` — на 22,5 лівіше від pivot і на 5 ближче). */
const SHOWER_SCALE = 0.36;
const shower = (state: "dry" | "running" | "wet", x = 0, y = 0): TraitProp => prop("env/shower", state, x + 22.5 * SHOWER_SCALE, y - 5 * SHOWER_SCALE, { scale: SHOWER_SCALE });

/** Ліжко під котом: кіт лежить на ковдрі (`blanket` — на 33,5 над pivot і на 13 лівіше). */
const BED_SCALE = 0.45;
const bed = (): TraitProp => prop("env/bed", "made", 13 * BED_SCALE, 33.5 * BED_SCALE, { scale: BED_SCALE });

export const SHOTS: TraitPhotoShots = {
  scatter: {
    plus: {
      content: {
        idea: "Щасливо, мружачись, риє в лотку лапою, а наповнювач розлетівся по підлозі обабіч — святковий салют.",
        still: { base: "bury", at: 120, eyes: "arc" },
        props: [box("cheap"), litter(-44, 14), litter(42, 16), litter(-30, -22)],
      },
      calm: {
        idea: "Спокійно гребе в лотку, а довкола на підлозі вже маленька пісочниця з наповнювача.",
        still: { base: "bury", at: 190 },
        props: [box("cheap-used"), litter(-42, 16), litter(40, 14)],
      },
      sulk: {
        idea: "Ображено сидить спиною біля перекопаного лотка, а довкола розкиданий наповнювач.",
        props: [box("cheap-used", -40, -14, 0.65), litter(-14, 18), litter(30, 12)],
      },
      ill: {
        idea: "Знесилений буханець біля розкопаного до дна брудного лотка, довкола — наповнювач на підлозі.",
        props: [box("empty-dirty", -40, -14, 0.65), litter(-24, 16), litter(42, 12)],
      },
    },
    minus: {
      content: {
        idea: "Мружачись, акуратно загрібає за собою в чистому лотку — довкола ні гранули: милується власною роботою.",
        still: { base: "bury", at: 190, eyes: "arc" },
        props: [box("premium")],
      },
      calm: {
        idea: "Спокійно й охайно загрібає в лотку, а на підлозі довкола — порядок, хоч гостей клич.",
        still: { base: "bury", at: 600 },
        props: [box("cheap")],
      },
      sulk: {
        idea: "Спиною до камери, похнюплено вирівнює наповнювач лапкою, як садівник граблями, — з нудьги, однаково ніхто не бачить.",
        still: { base: "bury", at: 600, ears: "side" },
        props: [box("cheap-used")],
      },
      ill: {
        idea: "Хворий кіт старанно загрібає за собою навіть у лотку, повному грудок, — а довкола ні гранули.",
        still: { base: "bury", at: 600, view: "front", eyes: "sick", ears: "side" },
        props: [box("cheap-used")],
      },
    },
  },
  litterPicky: {
    plus: {
      content: {
        idea: "Мружиться біля бездоганно чистого закритого лотка: брудного він не знає.",
        still: { flip: true },
        props: [prop("item/litter/premium", "premium", -44, -8, { scale: 0.6 })],
      },
      calm: {
        idea: "Суворо, як санінспектор, обнюхує лоток із грудками, перш ніж у нього ступити.",
        still: { base: "sniff", at: 0 },
        props: [box("cheap-used", 44, -4, 0.6)],
      },
      sulk: {
        idea: "Ображено сидить спиною до брудного лотка, над яким здіймається запах, — не дарує йому другого шансу.",
        props: [box("cheap-dirty", -54, -12, 0.55), smell(-54, -26)],
      },
      ill: {
        idea: "Хворий кіт тужно нюхає брудний смердючий лоток, якого ніхто не чистить, — і не йде в нього.",
        still: { base: "sniff", at: 0, eyes: "sick", ears: "side" },
        props: [box("cheap-dirty", 44, -4, 0.6), smell(46, -18)],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, вмостившись просто в брудному лотку під хвилями запаху: філософський спокій.",
        props: [box("cheap-dirty"), smell(-26, -30)],
      },
      calm: {
        idea: "Спокійно присів у брудному лотку, над яким пахне, — жодних драм.",
        still: { base: "squat", at: 0 },
        props: [box("cheap-dirty"), smell(-26, -30)],
      },
      sulk: {
        idea: "Похмуро сидить спиною просто в повному лотку — бувало й гірше, скаржитися не буде.",
        props: [box("cheap-dirty"), smell(-30, -30)],
      },
      ill: {
        idea: "Хворий буханець мовчки лежить у брудному лотку без наповнювача — мириться й з цим.",
        props: [box("empty-dirty"), smell(-28, -24)],
      },
    },
  },
  marking: {
    plus: {
      content: {
        idea: "Мружачись, задкує до кута й тремтить піднятим хвостом, а позаду — свіжа мітка: «тут мені добре».",
        still: { base: "mark", at: 0, eyes: "arc" },
        props: [prop("mess/mark", null, -34, -6, { scale: 0.8 })],
      },
      calm: {
        idea: "Спокійно мітить: зад догори, хвіст стовпчиком, під ним — калюжка мітки. Нагадує кутам, хто тут господар.",
        still: { base: "mark", at: 0 },
        props: [prop("mess/mark", null, -34, -6, { scale: 0.8 })],
      },
      sulk: {
        idea: "Насуплено, з опущеними вбік вухами мітить кут: так відзначає кожен день, коли щось іде не так.",
        still: { base: "mark", at: 0, view: "front", eyes: "half", ears: "side" },
        props: [prop("mess/mark", null, -34, -6, { scale: 0.8 })],
      },
      ill: {
        idea: "Знесилений буханець серед калюжок міток: від кожної тривоги задкує в куток.",
        props: [prop("mess/mark", null, -40, -4, { scale: 0.8 }), prop("mess/mark", null, 40, 14, { scale: 0.7, front: true })],
      },
    },
    minus: {
      // Тиха половина: у поведінці її не видно, тож знімок — про спокій у своєму домі, де не треба нічого позначати.
      content: {
        idea: "Блаженно розлігся догори животом перед своїм будиночком: увесь дім і так його, доводити нічого не треба.",
        still: { base: "belly", at: 0, eyes: "arc" },
        props: [HOUSE(-42, -16)],
      },
      calm: {
        idea: "Спокійно лежить буханцем біля свого будиночка, повільно кліпаючи, хвіст охайно підібраний — кутам нічого не загрожує.",
        still: { base: "loaf", eyes: "half" },
        props: [HOUSE(-42, -16)],
      },
      sulk: {
        idea: "Ображено сидить спиною біля свого будиночка, а кути довкола чисті: прикрість тримає в собі.",
        props: [HOUSE(-44, -14)],
      },
      ill: {
        idea: "Хворий клубочок біля свого будиночка, що сховав і носа, і хвіст: тихо тримає всю тривогу в собі.",
        still: { base: "sleep", eyes: "sick", ears: "side" },
        props: [HOUSE(-40, -14)],
      },
    },
  },
  hairballs: {
    plus: {
      content: {
        idea: "Блаженно вмивається, мружачись, а поруч на підлозі — свіжа шерстяна грудка: дрібна плата за красу.",
        still: { base: "groom", at: 1600, eyes: "arc" },
        props: [prop("mess/hairball", null, 40, 12, { front: true, scale: 0.7 })],
      },
      calm: {
        idea: "Спокійно сидить над шерстяною грудкою на килимі — черговий шерстяний сюрприз.",
        props: [prop("mess/hairball", null, 34, 14, { front: true, scale: 0.7 })],
      },
      sulk: {
        idea: "Ображено сидить спиною біля шерстяної грудки: знову розбудив дім кахиканням і дістав сердитий погляд.",
        props: [prop("mess/hairball", null, -34, 14, { front: true, scale: 0.7 })],
      },
      ill: {
        idea: "Хворий кіт, пригнувшись і витягнувши шию, тяжко кахикає над шерстяною грудкою.",
        still: { base: "cough", at: 90, eyes: "sick", ears: "side" },
        props: [prop("mess/hairball", null, 50, 6, { front: true, scale: 0.7 })],
      },
    },
    minus: {
      content: {
        idea: "Чепуриться, мружачись: лиже лапку — шубка гладенька, і жодної грудки довкола.",
        still: { base: "groom", at: 220, eyes: "arc" },
      },
      calm: {
        idea: "Спокійно вмивається, проводячи лапою по морді, — охайно й без наслідків для килима.",
        still: { base: "groom", at: 1600, eyes: "half" },
      },
      sulk: {
        idea: "Похнюплено вмивається на самоті, тихо й охайно, — ніхто й не здогадується, як йому самотньо.",
        still: { base: "groom", at: 220, view: "front", eyes: "half", ears: "side" },
      },
      ill: {
        idea: "Хворий кіт через силу вмивається — на інше сил не лишилося, а шубку доглядає.",
        still: { base: "groom", at: 220, view: "front", eyes: "sick", ears: "side" },
      },
    },
  },
  shedding: {
    plus: {
      content: {
        idea: "Мружиться, а довкола літають і лежать жмути його шерсті: пухнаста любов на кожному светрі.",
        props: [
          prop("mess/fur-tuft", null, -40, 12, { front: true }),
          prop("mess/fur-tuft", null, 38, 16, { front: true }),
          prop("fx/fur-flying", null, -30, -44, { front: true, scale: 0.55 }),
          prop("fx/fur-flying", null, 30, -60, { front: true, scale: 0.5 }),
          prop("fx/fur-flying", null, 40, -30, { front: true, scale: 0.45 }),
        ],
      },
      calm: {
        idea: "Спокійно сидить серед пасом шерсті, що лишилися на підлозі, — і на всьому, що не встигли сховати.",
        props: [prop("mess/fur", null, -38, 12, { front: true }), prop("mess/fur-tuft", null, 38, 14, { front: true }), prop("mess/fur-tuft", null, 24, -10)],
      },
      sulk: {
        idea: "Ображено сидить спиною, а довкола — жмути шерсті, за які він щоразу чує бурчання.",
        props: [prop("mess/fur-tuft", null, -36, 14, { front: true }), prop("mess/fur-tuft", null, 34, 12, { front: true }), prop("mess/fur", null, 20, -14)],
      },
      ill: {
        idea: "Знесилений буханець серед клаптів власної шерсті — від нього лишається хіба що шерсть.",
        props: [prop("mess/fur", null, -36, 12, { front: true }), prop("mess/fur-tuft", null, 40, 12, { front: true })],
      },
    },
    minus: {
      content: {
        idea: "Мружиться на чистому ліжку — ковдра після нього як нова, ні шерстинки.",
        props: [bed()],
      },
      calm: {
        idea: "Спокійно лежить буханцем на ліжку, і на ковдрі не лишається ані шерстинки.",
        still: { base: "loaf", eyes: "open" },
        props: [bed()],
      },
      sulk: {
        idea: "Ображено сидить спиною на ліжку, яке після нього таке саме чисте й порожнє.",
        props: [bed()],
      },
      ill: {
        idea: "Хворий буханець на підлозі під чистим ліжком — туди його не пускають, хоч шерсті він не лишає.",
        props: [prop("env/bed", "made", -46, -18, { scale: 0.4 })],
      },
    },
  },
  water: {
    plus: {
      content: {
        idea: "Мружиться від задоволення просто під струменем води в душовій кабіні — як на курорті.",
        props: [shower("running")],
      },
      calm: {
        idea: "У мокрій після вашого душу кабіні спокійно ловить лапою краплі.",
        still: { base: "knock", at: 400 },
        props: [shower("wet")],
      },
      sulk: {
        idea: "Ображено сидить спиною біля сухої душової: чекає, чи не прийме хтось нарешті душ.",
        props: [shower("dry", 30, -14)],
      },
      ill: {
        idea: "Знесилений буханець лежить на піддоні мокрої душової — єдина розрада в краплях.",
        props: [shower("wet")],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, відвернувшись від калюжі й від душової, де шумить вода: вода тут поза законом, а йому добре й сухим.",
        still: { flip: true, ears: "side" },
        props: [prop("mess/puddle", null, 46, 12, { front: true, scale: 0.7 }), shower("running", 80, -24)],
      },
      calm: {
        idea: "Спокійно, але з розвернутими вбік вухами йде геть від душової, де зашуміла вода.",
        still: { base: "walk", at: 0, flip: true, ears: "side" },
        props: [shower("running", 44, -16)],
      },
      sulk: {
        idea: "Мокрий після купання, сидить у калюжі й ображено вилизується.",
        still: { base: "groom", at: 220, view: "front", eyes: "half", ears: "side" },
        props: [prop("mess/puddle", null, 0, 2, { scale: 0.8 })],
      },
      ill: {
        idea: "Мокрий хворий кіт зіщулився й притиснув вуха біля душової, де шумить вода, — тремтить на самоті.",
        still: { base: "crouch", at: 0, eyes: "sick", ears: "flat", flip: true },
        props: [prop("mess/puddle", null, 0, 2, { scale: 0.8 }), shower("running", 44, -16)],
      },
    },
  },
};
