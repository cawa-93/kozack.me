// Знімки рис розділу «Гігієна й туалет» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Примети груп: «Розкидання наповнювача» — риє в лотку, а наповнювач на підлозі (чи загрібає лапою, а довкола лад); «Вибагливість
// до лотка» — нюхає брудний лоток і відвертається (чи спокійно сидить і спить у брудному); «Мітки» — задкує в кут кімнати, а під
// хвостом калюжка (чи спочиває в чистому куті); «Шерстяні грудки» — грудка й кашель (чи вмивається без наслідків); «Догляд за
// шерстю» — пасма шерсті (чи чиста щітка для вичісування); «Любов до води» — душова.

import type { ArtId } from "../art/types";
import type { IconName, Mark } from "../iconnames";
import type { TraitBubble, TraitPhotoShots, TraitProp, TraitStill } from "./types";

const prop = (art: ArtId, state: string | null, x: number, y: number, more: Partial<TraitProp> = {}): TraitProp => ({ art, state, x, y, ...more });
const think = (icon: IconName, mark?: Mark): TraitBubble => ({ kind: "think", icon, ...(mark ? { mark } : {}) });

/**
 * Меблі й лотки, у яких кіт стоїть чи біля яких сидить, — за розміром кота (`withCat`): місце від кореня кота й так за ним, і
 * кошеня опинилося б поза лотком чи кабіною. Розмір — для дорослого кота.
 */
const furniture = { withCat: true } as const;

/** Відкритий лоток, у якому стоїть кіт, — позаду нього: кадр лотка цілий, і передній борт закрив би кота. */
const BOX_SCALE = 1.2;
const box = (state: string, x = 0, y = -4, scale = BOX_SCALE): TraitProp => prop("item/litter/cheap", state, x, y, { scale, ...furniture });
/**
 * Загрібає: лапа злітає над наповнювачем (`bury` на 120 мс), а голову піднято — опущена до лапи, вона ховала морду, і кота читали
 * таким, що спить у лотку.
 */
const RAKE: TraitStill = { base: "bury", at: 120, bones: { neck: -4, head: -24 } };
/** Наповнювач, розкиданий довкола лотка. */
const litter = (x: number, y: number): TraitProp => prop("mess/litter", null, x, y, { front: y > 0, scale: 0.7 });
/** Хвилі запаху над брудним лотком. */
const smell = (x: number, y: number, scale = 0.7): TraitProp => prop("fx/smell", "a", x, y, { front: true, scale });

/** Кут кімнати позаду кота (pivot — підлога в самому куті): туди «Мітчик» задкує й мітить. */
const corner = (x = 0, y = -16): TraitProp => prop("env/corner", null, x, y, { scale: 1.1, ...furniture });
/** Калюжка мітки під піднятим хвостом того, хто задкує в кут. */
const mark = (x = -28, y = -2, more: Partial<TraitProp> = {}): TraitProp => prop("mess/mark", null, x, y, { scale: 0.8, ...more });

/** Щітка-рукавичка для вичісування на підлозі перед котом — чиста, без жодної шерстинки. */
const brush = (x = 34, y = 12): TraitProp => prop("item/brush", null, x, y, { front: y > 0, scale: 1.2 });

/** Душова кабіна позаду кота: кіт — на її піддоні (`tray` — на 22,5 лівіше від pivot і на 5 ближче). */
const SHOWER_SCALE = 0.65;
const shower = (state: "dry" | "running" | "wet", x = 0, y = 0): TraitProp => prop("env/shower", state, x + 22.5 * SHOWER_SCALE, y - 5 * SHOWER_SCALE, { scale: SHOWER_SCALE, ...furniture });

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
        idea: "Похнюплено сидить біля перекопаного лотка, а довкола на підлозі розкиданий наповнювач: знову насварили.",
        props: [box("cheap-used", -40, -14), litter(-14, 18), litter(30, 12)],
      },
      ill: {
        idea: "Знесилений буханець біля розкопаного до дна брудного лотка, довкола — наповнювач на підлозі.",
        props: [box("empty-dirty", -40, -14), litter(-24, 16), litter(42, 12)],
      },
    },
    minus: {
      content: {
        idea: "Мружачись, акуратно загрібає лапою в чистому лотку — довкола ні гранули: милується власною роботою.",
        still: { ...RAKE, eyes: "arc" },
        props: [box("premium")],
      },
      calm: {
        idea: "Спокійно й охайно загрібає в лотку, а на підлозі довкола — порядок, хоч гостей клич.",
        still: RAKE,
        props: [box("cheap")],
      },
      sulk: {
        idea: "Похнюплено, але старанно вирівнює наповнювач лапкою, як садівник граблями: навіть сумний, загрібає за собою до гранули.",
        still: { base: "bury", at: 600 },
        props: [box("cheap-used")],
      },
      ill: {
        idea: "Хворий кіт старанно загрібає лапою в лотку з рівним чистим наповнювачем — довкола ні гранули.",
        still: { ...RAKE, eyes: "sick", ears: "side" },
        props: [box("cheap")],
      },
    },
  },
  litterPicky: {
    plus: {
      content: {
        idea: "Мружиться біля бездоганно чистого закритого лотка: брудного він не знає.",
        still: { flip: true },
        props: [prop("item/litter/premium", "premium", -44, -8, { scale: 1.1, ...furniture })],
      },
      calm: {
        idea: "Суворо, як санінспектор, обнюхує лоток із грудками, перш ніж у нього ступити.",
        still: { base: "sniff", at: 0 },
        props: [box("cheap-used", 44, -4, 1.1)],
      },
      sulk: {
        idea: "Ображено сидить осторонь брудного лотка, над яким здіймається запах: у такий не піде — хай спершу приберуть.",
        props: [box("cheap-dirty", -54, -12, 1), smell(-54, -26)],
      },
      ill: {
        idea: "Хворий кіт тужно нюхає брудний смердючий лоток, якого ніхто не чистить, — і не йде в нього.",
        still: { base: "sniff", at: 0, eyes: "sick", ears: "side" },
        props: [box("cheap-dirty", 44, -4, 1.1), smell(46, -18)],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, вмостившись просто в брудному лотку під хвилями запаху: філософський спокій.",
        props: [box("cheap-dirty"), smell(-26, -30)],
      },
      calm: {
        idea: "Байдуже, напівзаплющивши очі, присів у брудному лотку, над яким пахне, — жодних драм.",
        still: { base: "squat", at: 0, eyes: "half" },
        props: [box("cheap-dirty"), smell(-26, -30)],
      },
      sulk: {
        idea: "Похмуро сидить просто в повному лотку — бувало й гірше, скаржитися не буде.",
        props: [box("cheap-dirty"), smell(-30, -30, 0.45)],
      },
      ill: {
        idea: "Хворий кіт спить клубочком просто в брудному лотку, як у ліжку: йому й тут добре.",
        still: { base: "sleep", eyes: "sick" },
        props: [box("cheap-dirty"), smell(-30, -26, 0.45)],
      },
    },
  },
  marking: {
    plus: {
      content: {
        idea: "Мружачись, задкує в кут кімнати й тремтить піднятим хвостом, а під ним — свіжа мітка: «тут мені добре».",
        still: { base: "mark", at: 0, eyes: "arc" },
        props: [corner(), mark()],
      },
      calm: {
        idea: "Спокійно мітить кут: зад догори, хвіст стовпчиком, під ним — калюжка мітки. Нагадує кутам, хто тут господар.",
        still: { base: "mark", at: 0 },
        props: [corner(), mark()],
      },
      sulk: {
        idea: "Насуплено, з опущеними вбік вухами мітить кут: так відзначає кожен день, коли щось іде не так.",
        still: { base: "mark", at: 0, view: "front", eyes: "half", ears: "side" },
        props: [corner(), mark()],
      },
      ill: {
        idea: "Хворий, а все одно задкує в кут і мітить, тремтячи хвостом: так тамує кожну тривогу.",
        still: { base: "mark", at: 0, eyes: "sick", ears: "side" },
        props: [corner(), mark()],
      },
    },
    minus: {
      // Тиха половина: у поведінці її не видно, тож знімок — той самий кут, що в «Мітчика», чистий, і кіт у ньому спочиває.
      content: {
        idea: "Блаженно розлігся животом догори в чистому куті кімнати: увесь дім і так його, позначати нічого.",
        still: { base: "belly", at: 0, eyes: "arc" },
        props: [corner()],
      },
      calm: {
        idea: "Спокійно дрімає буханцем у чистому куті, повільно кліпаючи, хвіст охайно підібраний: кутам нічого не загрожує.",
        still: { base: "loaf", eyes: "half" },
        props: [corner()],
      },
      sulk: {
        idea: "Ображено сидить у чистому куті, але не мітить його: прикрість тримає в собі.",
        props: [corner()],
      },
      ill: {
        idea: "Хворий клубочок у чистому куті, що сховав і носа, і хвіст: тихо тримає всю тривогу в собі — ні калюжки довкола.",
        still: { base: "sleep", eyes: "sick", ears: "side" },
        props: [corner()],
      },
    },
  },
  hairballs: {
    plus: {
      content: {
        idea: "Блаженно вилизує лапку, мружачись, а поруч на підлозі — свіжа шерстяна грудка: дрібна плата за красу.",
        still: { base: "groom", at: 220, eyes: "arc" },
        props: [prop("mess/hairball", null, 40, 12, { front: true, scale: 0.7 })],
      },
      calm: {
        idea: "Спокійно сидить над шерстяною грудкою на килимі — черговий шерстяний сюрприз.",
        props: [prop("mess/hairball", null, 34, 14, { front: true, scale: 0.7 })],
      },
      sulk: {
        idea: "Похнюплено сидить біля свіжої шерстяної грудки: знову розбудив дім кахиканням і дістав сердитий погляд.",
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
        idea: "Мружачись, вилизує лапку поруч із чистою щіткою для вичісування: шубку доглядають, тож грудок не буває.",
        still: { base: "groom", at: 220, eyes: "arc" },
        props: [brush(-36, 10)],
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
        idea: "Мружиться, а довкола на підлозі — пасма його шерсті: пухнаста любов на кожному светрі.",
        props: [prop("mess/fur", null, -38, 12, { front: true }), prop("mess/fur", null, 38, 16, { front: true }), prop("mess/fur", null, 26, -12)],
      },
      calm: {
        idea: "Спокійно сидить серед пасом шерсті, що лишилися на підлозі, — і на всьому, що не встигли сховати.",
        props: [prop("mess/fur", null, -38, 12, { front: true }), prop("mess/fur-tuft", null, 38, 14, { front: true }), prop("mess/fur-tuft", null, 24, -10)],
      },
      sulk: {
        idea: "Похнюплено сидить серед пасом власної шерсті, за які щоразу чує бурчання.",
        props: [prop("mess/fur", null, -36, 14, { front: true }), prop("mess/fur", null, 34, 12, { front: true }), prop("mess/fur-tuft", null, 20, -14)],
      },
      ill: {
        idea: "Знесилений буханець серед клаптів власної шерсті — від нього лишається хіба що шерсть.",
        props: [prop("mess/fur", null, -36, 12, { front: true }), prop("mess/fur-tuft", null, 40, 12, { front: true })],
      },
    },
    minus: {
      content: {
        idea: "Мружиться поруч із щіткою для вичісування, на якій ані шерстинки: вичісувати з нього нічого.",
        props: [brush()],
      },
      calm: {
        idea: "Спокійно лежить буханцем біля чистої щітки для вичісування: після нього на ній ні шерстинки.",
        still: { base: "loaf", eyes: "open" },
        props: [brush(40, 8)],
      },
      sulk: {
        idea: "Похнюплено сидить біля чистої щітки для вичісування: вичісувати нічого, тож і уваги менше.",
        props: [brush()],
      },
      ill: {
        idea: "Хворий буханець лежить, а позаду чиста щітка для вичісування: шерсті він не лишає навіть зараз.",
        props: [brush(-40, -8)],
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
        idea: "Ображено сидить просто в сухій душовій кабіні: чекає, чи не ввімкне хтось нарешті воду.",
        props: [shower("dry")],
      },
      ill: {
        idea: "Сухий хворий буханець лежить біля сухої душової кабіни, дивиться на неї й думає про воду: сумує, що краплі не падають.",
        props: [shower("dry", 30, -14)],
        bubbles: [think("drop")],
      },
    },
    minus: {
      content: {
        idea: "Мружиться, сухий і подалі від душової, де шумить вода, і думає «води не треба»: йому добре, поки вода там.",
        still: { flip: true },
        props: [shower("running", 96, -30)],
        bubbles: [think("drop", "no")],
      },
      calm: {
        idea: "Притиснувши вуха, рішуче йде геть від душової, де зашуміла вода.",
        still: { base: "walk", at: 0, flip: true, ears: "flat" },
        props: [shower("running", 70, -24)],
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
