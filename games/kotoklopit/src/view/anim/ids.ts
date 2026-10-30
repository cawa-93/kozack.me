// Назви анімацій кота й персонажа (крок 16, GRAPHICS_PLAN.md, «Скелети й анімації» і «Анімація»): за ними вигляд обирає,
// що грати (`pose.ts`, `personanim.ts`), а пакети анімації хвилі 2 (N1–N4b) пишуть свої файли. Без Phaser і DOM.
//
// Група — це файл анімацій одного пакета: `src/view/rig/anims/<rig>/<група>.ts` з
// `export const CAT_BASIC = defineAnims(CAT_RIG, { walk: { … }, … })` (`rig/types.ts`). Кожна назва групи має там свою
// анімацію; перевірити повноту можна так: `CAT_BASIC satisfies Record<CatAnimsIn<"basic">, unknown>`.
//
// Види анімацій:
// - основна — тіло цілком (ходьба, сон, дуга); по колу, поки стан триває;
// - разова (`CAT_ONE_SHOT_MS`, `PERSON_ONE_SHOT_MS`) — від події: грає раз (`loop: false`) і рівно стільки мілісекунд,
//   скільки сказано тут, а тоді вигляд повертається до основної;
// - накладка (`CAT_OVERLAYS`, `PERSON_OVERLAYS`) — поверх основної: її доріжки додаються до доріжок основної (rot і pos
//   додаються, scale множиться), тож вона рухає лише свої кістки — хвіст, голову, руки;
// - за поступом (`PERSON_BY_PROGRESS`) — не по годиннику: час анімації — `params.progress` × її тривалість (засинання).
//
// Кадри обличчя кота (очі, рот, вуха) задає `catFace` (`catface.ts`), а не анімації: доріжки цих слотів має сенс писати
// лише в разових (чхання), і поки разова грає, вони перекривають `catFace`.

// --- Кіт ---------------------------------------------------------------------------------------

/** Анімації кота за групами — пакетами хвилі 2. */
export const CAT_ANIM_GROUPS = {
  /**
   * N1 «Кіт — базові» → `rig/anims/cat/basic.ts`: ходьба, біг-зумі, сидить, буханець (лежить, підібравши лапи), спить
   * клубком, їсть, п'є, вмивається, закопує, присідає на лотку, стрибки вгору й униз, ховається (з-під меблів видно очі),
   * на руках, під ковдрою, розпластався, у переносці, животом догори, качається на м'яті.
   */
  basic: ["walk", "run", "sit", "loaf", "sleep", "eat", "drink", "groom", "bury", "squat", "jumpUp", "jumpDown", "hide", "carried", "blanket", "sprawl", "carrier", "belly", "roll"],
  /**
   * N2 «Кіт — поведінка» → `rig/anims/cat/behavior.ts`: спина дугою, шипіння (накладка: голова вперед, вуха назад), клубок
   * бійки, вилизує іншого, боротьба (зверху лапою — `paw`, знизу задніми — `kick`), засідка, дряпає стоячи (і лапає рулон),
   * потягується на килимку, мітить, скидає лапою (і лапає шафку чи смітник), просить (і чекає крана на умивальнику), буцає
   * головою, на клавіатурі, біля вікна, стрибає за пером вудки (і б'є свою іграшку), несе в зубах, гризе, сидить спиною
   * («Образливий» дметься), не хоче гратися (буханець, хвіст сіпається), нюхає (дрібничку, нову річ, м'яту, корм чи лоток,
   * від яких відмовився).
   */
  behavior: ["arch", "hiss", "brawl", "lick", "paw", "kick", "crouch", "scratch", "stretch", "mark", "knock", "beg", "nudge", "keyboard", "window", "pounce", "carry", "chew", "sulk", "decline", "sniff"],
  /**
   * N3 «Кіт — хвороби й почуття» → `rig/anims/cat/feelings.ts`: кашель (перед шерстяною грудкою), чхання (застуда), чухання
   * задньою лапою (блохи, дерматит), тре очі лапою (кон'юнктивіт), кульгає (травма), блює (і зригує грудку), задишка (накладка;
   * дихання й серце після гри), хропе уві сні (дихання), незграбна хода (хребет), «подобається / терпить / пручається» (накладки
   * під рукою й на руках), «попереджає» (накладка за хвилину до кінця терпіння: хвіст б'є сильно й широко, частіше, ніж у
   * того, хто терпить; вуха «літачком» і сердиті очі — з `catFace`; рішення автора 2026-10-30, §10), сумна хода, повільне
   * кліпання (накладка: голова трохи хилиться, очі — з `catFace`).
   */
  feelings: ["cough", "sneeze", "itch", "rubEyes", "limp", "vomit", "pant", "snore", "clumsy", "content", "reluctant", "warn", "struggle", "sadWalk", "slowBlink"],
} as const;

export type CatAnimGroup = keyof typeof CAT_ANIM_GROUPS;
/** Назви анімацій однієї групи кота. */
export type CatAnimsIn<G extends CatAnimGroup> = (typeof CAT_ANIM_GROUPS)[G][number];
/** Будь-яка анімація кота. */
export type CatAnimId = CatAnimsIn<CatAnimGroup>;

/** Усі анімації кота. */
export const CAT_ANIM_IDS: readonly CatAnimId[] = Object.values(CAT_ANIM_GROUPS).flat();

/**
 * Разові анімації кота й їхня тривалість, мс. Стрибки — щойно кіт ступив з підлоги на меблі чи назад (`catTransition`); решта —
 * від подій (`catEventAnims`).
 */
export const CAT_ONE_SHOT_MS = {
  jumpUp: 380,
  jumpDown: 380,
  hiss: 700,
  sneeze: 800,
  itch: 1600,
  rubEyes: 1400,
  vomit: 1500,
  pant: 5000,
} as const satisfies Partial<Record<CatAnimId, number>>;

export type CatOneShotId = keyof typeof CAT_ONE_SHOT_MS;

/** Накладки кота: рухають лише свої кістки поверх основної анімації. */
export const CAT_OVERLAYS: ReadonlySet<CatAnimId> = new Set<CatAnimId>(["hiss", "sneeze", "pant", "content", "reluctant", "warn", "struggle", "slowBlink"]);

// --- Персонаж ----------------------------------------------------------------------------------

/** Анімації персонажа за групами — пакетами хвилі 2. */
export const PERSON_ANIM_GROUPS = {
  /**
   * N4a «Персонаж — рух» → `rig/anims/person/move.ts`: стоїть, іде, ривок, несе (накладка рук: річ у гнізді `held`), тримає
   * кота (накладка рук: кіт у гнізді `arms`), гладить, грається вудочкою, паморочиться (оглушений, збій керування), вкусили
   * чи подряпали (разова), хворий (застуда: стоїть, шмигає носом), кульгає (травма), виснажений (стоїть і плететься — `trudge`),
   * відмова (разова: розводить руками), спіткнувся об кота чи збив кіт (разова), посковзнувся (разова), бере кота на руки й
   * опускає (разові).
   */
  move: ["idle", "walk", "dash", "carry", "holdCat", "pet", "rod", "dizzy", "bitten", "sick", "limp", "exhausted", "trudge", "refuse", "trip", "slip", "pickUp", "putDown"],
  /**
   * N4b «Персонаж — справи» → `rig/anims/person/chores.ts`: працює сидячи за комп'ютером, нарада (летучка й важлива нарада:
   * говорить у камеру), їсть за столом, ліки (разова: п'є таблетку, дає коту ліки), чистить лоток, прибирає безлад, пилососить,
   * пралька (разова: запускає, виймає білизну, виганяє кота з барабана), миски (разова: насипає корм, наливає воду, спорожняє
   * годівницю), розпаковує ящики (разова), двері (разова: забирає пакунки, заносить мамині гостинці, повертає кота зі сходів),
   * телефон (дзвонить мама), засинає в ліжку й падає від виснаження (за поступом), бере й кладе (разові: холодильник, плита,
   * стіл, шафка з кормом — плита готує сама), викидає в смітник (разова), лагодить дріт, купає кота в душі, відкриває кран
   * котові (разова).
   */
  chores: ["work", "meeting", "eat", "meds", "litter", "clean", "vacuum", "washer", "bowl", "unpack", "door", "phone", "fallAsleep", "collapse", "take", "put", "trash", "fix", "bath", "tap"],
} as const;

export type PersonAnimGroup = keyof typeof PERSON_ANIM_GROUPS;
/** Назви анімацій однієї групи персонажа. */
export type PersonAnimsIn<G extends PersonAnimGroup> = (typeof PERSON_ANIM_GROUPS)[G][number];
/** Будь-яка анімація персонажа. */
export type PersonAnimId = PersonAnimsIn<PersonAnimGroup>;

/** Усі анімації персонажа. */
export const PERSON_ANIM_IDS: readonly PersonAnimId[] = Object.values(PERSON_ANIM_GROUPS).flat();

/** Разові анімації персонажа (від подій, `personEventAnim`) і їхня тривалість, мс. */
export const PERSON_ONE_SHOT_MS = {
  bitten: 600,
  refuse: 600,
  trip: 900,
  slip: 900,
  pickUp: 400,
  putDown: 400,
  meds: 900,
  washer: 900,
  bowl: 700,
  unpack: 1100,
  door: 900,
  take: 450,
  put: 450,
  trash: 500,
  tap: 500,
} as const satisfies Partial<Record<PersonAnimId, number>>;

export type PersonOneShotId = keyof typeof PERSON_ONE_SHOT_MS;

/** Накладки персонажа: руки з річчю чи котом поверх ходьби, стояння, ривка. */
export const PERSON_OVERLAYS: ReadonlySet<PersonAnimId> = new Set<PersonAnimId>(["carry", "holdCat"]);

/** Анімації персонажа за поступом: час — `params.progress` × тривалість, без повтору. */
export const PERSON_BY_PROGRESS: ReadonlySet<PersonAnimId> = new Set<PersonAnimId>(["fallAsleep", "collapse"]);
