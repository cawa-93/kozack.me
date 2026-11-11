// Знімки рис розділу «Гігієна й туалет» на фото титрів (§4.2; `TRAIT_GROUPS`, `TRAITS.md`).
//
// Примети груп: «Розкидання наповнювача» — риє в лотку, а наповнювач на підлозі (чи стоїть на наповнювачі й загрібає лапою, а
// довкола лад); «Вибагливість до лотка» — нюхає брудний лоток і відвертається (чи присів у брудному з думкою «бруд — гаразд»);
// «Мітки» — задкує в кут кімнати, а під хвостом калюжка (чи спочиває в чистому куті з перекресленою калюжкою в думці); «Шерстяні
// грудки» — грудка й кашель (чи вилизується, а грудка в думці перекреслена); «Догляд за шерстю» — пасма шерсті (чи чиста щітка й
// перекреслений жмут у думці); «Любов до води» — душова.

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

/** Відкритий лоток позаду кота: кадр лотка цілий, і поверх кота передній борт закрив би його. */
const BOX_SCALE = 1.2;
const box = (state: string, x = 0, y = -4, scale = BOX_SCALE): TraitProp => prop("item/litter/cheap", state, x, y, { scale, ...furniture });
/**
 * Лоток під котом, що стоїть на наповнювачі, як у грі (`LITTER_SEAT.lift` над точкою лотка): лапи — на наповнювачі, передній борт
 * — нижче за них (трохи глибше, ніж у грі, і лівіше від середини: лапа, що гребе, лягає на наповнювач, а не на борт). Кіт біля
 * переднього борту (`box` як є) перекривав його лапами, і його читали таким, що лежить у лотку, звісившись через борт.
 */
const inBox = (state: string, scale = 1): TraitProp => box(state, 6 * scale, 16 * scale, scale);
/**
 * Загрібає: ближня лапа б'є в наповнювач (`bury` на 190 мс), далеко від рота, — піднята до морди (120 мс) читалася вмиванням.
 * Голову піднято: опущена до лапи, вона ховала морду, і кота читали таким, що спить у лотку.
 */
const RAKE: TraitStill = { base: "bury", at: 190, bones: { neck: -4, head: -26 } };
/** Наповнювач, розкиданий довкола лотка. */
const litter = (x: number, y: number): TraitProp => prop("mess/litter", null, x, y, { front: y > 0, scale: 0.7 });
/** Хвилі запаху над брудним лотком. */
const smell = (x: number, y: number, scale = 0.7): TraitProp => prop("fx/smell", "a", x, y, { front: true, scale });

/** Кут кімнати позаду кота (pivot — підлога в самому куті): туди «Мітчик» задкує й мітить. */
const corner = (x = 0, y = -16): TraitProp => prop("env/corner", null, x, y, { scale: 1.1, ...furniture });
/** Калюжка мітки під піднятим хвостом того, хто задкує в кут. */
const mark = (x = -28, y = -2, more: Partial<TraitProp> = {}): TraitProp => prop("mess/mark", null, x, y, { scale: 0.8, ...more });

/** Щітка для вичісування на підлозі перед котом — чиста, без жодної шерстинки. */
const brush = (x = 34, y = 12): TraitProp => prop("item/brush", null, x, y, { front: y > 0, scale: 1.2 });

/**
 * Вилизує лапу: лапа нижче, біля рота, язик на ній. Лапу на носі й очах (`groom` як є) без очей-дужок читали «ховає морду», а з
 * хворими очима — «тре око».
 */
const LICK_PAW: TraitStill = { base: "groom", at: 220, mouth: "tongue", bones: { "leg-front-near": 42, head: 8 } };

/**
 * Думка «цього немає» — перекреслений кадр безладу в хмарці думки, складеній із речей: тиху половину («не мітить», «без грудок»,
 * «не линяє») інакше не видно. Іконки гри тут не стають: мітки серед них немає, а `cough` і `fur` — з рудим котом поза переліком
 * заміни шерсті (`COAT_ICONS`). (x, y) — вістря хмарки: над головою, де його ставить бабл гри. Розмір — як у бабла гри на фото
 * (`PHOTO_BUBBLE_SCALE`), але за котом (`withCat`): місця частин — від кореня кота, і під кошеням вони б роз'їхались.
 */
const THOUGHT_SCALE = 0.5;
/** Центр поля іконки від вістря `ui/bubble/think` (точка `icon` − pivot). */
const THOUGHT_ICON = { x: 22.5, y: -59 } as const;
const absent = (art: ArtId, size: number, x: number, y: number): TraitProp[] => {
  const at = { x: x + THOUGHT_ICON.x * THOUGHT_SCALE, y: y + THOUGHT_ICON.y * THOUGHT_SCALE };
  const part = { front: true, ...furniture } as const;
  return [
    prop("ui/bubble/think", null, x, y, { ...part, scale: THOUGHT_SCALE }),
    // Pivot кадру безладу — підлога під ним, трохи нижче від середини малюнка.
    prop(art, null, at.x, at.y + 1, { ...part, scale: size }),
    prop("icon/mark/no", null, at.x, at.y, { ...part, scale: THOUGHT_SCALE }),
  ];
};
/** «Не мітить»: перекреслена калюжка мітки. */
const noMark = (x: number, y: number): TraitProp[] => absent("mess/mark", 0.45, x, y);
/** «Без грудок»: перекреслена шерстяна грудка. */
const noHairball = (x: number, y: number): TraitProp[] => absent("mess/hairball", 0.45, x, y);
/** «Не линяє»: перекреслений жмут шерсті. */
const noFur = (x: number, y: number): TraitProp[] => absent("mess/fur-tuft", 0.7, x, y);

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
        idea: "Мружачись, стоїть на чистому наповнювачі й акуратно загрібає його лапою — за бортом ні гранули: милується власною роботою.",
        still: { ...RAKE, eyes: "arc" },
        props: [inBox("premium")],
      },
      calm: {
        idea: "Спокійно стоїть у лотку й охайно загрібає наповнювач лапою, а на підлозі довкола — порядок, хоч гостей клич.",
        still: RAKE,
        props: [inBox("cheap")],
      },
      sulk: {
        idea: "Насуплений, але старанно загрібає наповнювач лапою, стоячи в лотку: навіть ображений, прибирає за собою до гранули.",
        still: RAKE,
        props: [inBox("cheap-used")],
      },
      ill: {
        idea: "Хворий кіт із градусником стоїть у лотку й старанно загрібає лапою рівний наповнювач — довкола ні гранули.",
        still: RAKE,
        props: [inBox("cheap")],
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
        idea: "Спокійно присів у брудному лотку, над яким пахне, і думає «бруд — гаразд»: робить свої справи без жодних драм.",
        still: { base: "squat", at: 0 },
        props: [inBox("cheap-dirty", 1.1), smell(-48, -2, 0.6)],
        bubbles: [think("dirty", "ok")],
      },
      sulk: {
        idea: "Насуплений, а все одно присів у повному лотку й думає «бруд — гаразд»: ображений не на лоток, ходить і в такий.",
        still: { base: "squat", at: 0 },
        props: [inBox("cheap-dirty", 1.1), smell(-48, -2, 0.6)],
        bubbles: [think("dirty", "ok")],
      },
      ill: {
        idea: "Хворий кіт із градусником присів у брудному лотку й думає «бруд — гаразд»: і нездужаючи ходить у повний.",
        still: { base: "squat", at: 0 },
        props: [inBox("cheap-dirty", 1.1), smell(-48, -2, 0.6)],
        bubbles: [think("dirty", "ok")],
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
      // Тиха половина: у поведінці її не видно, тож знімок — той самий кут, що в «Мітчика», чистий, кіт у ньому спочиває, а
      // калюжка мітки в його думці перекреслена.
      content: {
        idea: "Блаженно розлігся животом догори в чистому куті кімнати, а калюжка мітки в думці перекреслена: увесь дім і так його, позначати нічого.",
        still: { base: "belly", at: 0, eyes: "arc" },
        props: [corner(), ...noMark(24, -47)],
      },
      calm: {
        idea: "Спокійно дрімає буханцем у чистому куті, хвіст охайно підібраний, а калюжка мітки в думці перекреслена: кутам нічого не загрожує.",
        still: { base: "loaf", eyes: "half" },
        props: [corner(), ...noMark(28, -58)],
      },
      sulk: {
        idea: "Ображено сидить у чистому куті, а калюжка мітки в думці перекреслена: прикрість тримає в собі, кутів не мітить.",
        props: [corner(), ...noMark(25, -74)],
      },
      ill: {
        idea: "Хворий клубочок із градусником у чистому куті, а калюжка мітки в думці перекреслена: тривогу тримає в собі — ні калюжки довкола.",
        still: { base: "sleep", eyes: "sick", ears: "side" },
        props: [corner(), ...noMark(26, -43)],
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
      // Тиха половина: вилизується, а наслідку — грудки — немає: вона перекреслена в думці.
      content: {
        idea: "Мружачись, вилизує лапку, а шерстяна грудка в думці перекреслена: вмивається досхочу — і жодних грудок.",
        still: { base: "groom", at: 220, eyes: "arc" },
        props: noHairball(25, -74),
      },
      calm: {
        idea: "Спокійно вилизує лапу, язик на ній, а шерстяна грудка в думці перекреслена: охайно й без наслідків для килима.",
        still: LICK_PAW,
        props: noHairball(25, -74),
      },
      sulk: {
        idea: "Насуплено, з вухами назад вилизує лапу, а шерстяна грудка в думці перекреслена: і ображений вмивається без наслідків.",
        still: LICK_PAW,
        props: noHairball(25, -74),
      },
      ill: {
        idea: "Хворий кіт через силу вилизує лапу, а шерстяна грудка в думці перекреслена: шубку доглядає, і грудок від того немає.",
        still: LICK_PAW,
        props: noHairball(29, -73),
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
        idea: "Мружиться поруч із щіткою для вичісування, на якій ані шерстинки, а жмут шерсті в думці перекреслений: вичісувати з нього нічого.",
        props: [brush(), ...noFur(18, -78)],
      },
      calm: {
        idea: "Спокійно лежить буханцем біля чистої щітки для вичісування, а жмут шерсті в думці перекреслений: після нього на ній ні шерстинки.",
        still: { base: "loaf", eyes: "open" },
        props: [brush(40, 8), ...noFur(28, -58)],
      },
      sulk: {
        idea: "Насуплено сидить біля чистої щітки для вичісування, а жмут шерсті в думці перекреслений: вичісувати нічого, тож і уваги менше.",
        props: [brush(), ...noFur(25, -74)],
      },
      ill: {
        idea: "Хворий буханець із градусником, позаду — чиста щітка для вичісування, а жмут шерсті в думці перекреслений: шерсті він не лишає навіть зараз.",
        props: [brush(-40, -8), ...noFur(40, -51)],
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
        idea: "Хворий буханець із градусником лежить просто на піддоні сухої душової кабіни й думає «краплі?»: чекає, чи не ввімкнуть йому воду.",
        props: [shower("dry")],
        bubbles: [think("drop", "ask")],
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
