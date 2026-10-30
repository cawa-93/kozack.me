// Вкладка галереї «Скелети» (крок 16, GRAPHICS_PLAN.md: хвиля 1, F4): скелет кота чи персонажа в будь-якому ракурсі,
// напрямі й анімації, з часом із повзунка шелла; перемикачі обвісу (варіанти частин з маніфесту й контракту id) і
// пропорцій; накладка кісток, якорів і гнізд; пробний об'єкт у гнізді (кіт на руках — сам скелет кота в гнізді `arms`).
//
// Анімації — усі групи `src/view/rig/anims/<скелет>/<група>.ts` (`defineAnims`): їх знаходить `import.meta.glob`, тож
// нові файли анімацій з'являються тут самі.

import Phaser from "phaser";

import { addArt } from "../../../view/art/atlas";
import { artEntries } from "../../../view/art/manifest";
import type { ArtId, ArtView, FrameLayer } from "../../../view/art/types";
import { CAT_FIT, CAT_RIG, CAT_VARIANTS } from "../../../view/rig/defs/cat";
import { PERSON_FIT, PERSON_RIG, PERSON_VARIANTS } from "../../../view/rig/defs/person";
import type { RigFit } from "../../../view/rig/rigcore";
import { RigSprite, type Attachable } from "../../../view/rig/rigsprite";
import type { RigAnim, RigDef, SocketCargo } from "../../../view/rig/types";
import { galleryView, onGalleryView } from "../kit";
import type { GalleryContext, GalleryTab, GalleryView } from "../tab";

type LooseRig = RigDef<string, string, string>;
type LooseAnim = RigAnim<string, string>;
type LooseSprite = RigSprite<string, string, string>;

/** Скелети вкладки: визначення, точки арту, варіанти частин і приблизна висота (для масштабу «авто»). */
interface RigChoice {
  title: string;
  def: LooseRig;
  fit: RigFit<string, string, string>;
  variants: Readonly<Record<string, readonly (ArtId | null)[]>>;
  height: number;
}

const RIGS: Readonly<Record<"cat" | "person", RigChoice>> = {
  cat: { title: "Кіт", def: CAT_RIG as unknown as LooseRig, fit: CAT_FIT, variants: CAT_VARIANTS, height: 64 },
  person: { title: "Персонаж", def: PERSON_RIG as unknown as LooseRig, fit: PERSON_FIT, variants: PERSON_VARIANTS, height: 152 },
};
type RigName = keyof typeof RIGS;

/** Групи анімацій: шлях модуля → його експорти (групи `defineAnims`). */
const ANIM_MODULES = import.meta.glob<Record<string, unknown>>("../../../view/rig/anims/*/*.ts", { eager: true });

/** Анімації скелета: «група/назва» → анімація. */
function animsOf(rig: RigName): Map<string, LooseAnim> {
  const found = new Map<string, LooseAnim>();
  for (const path of Object.keys(ANIM_MODULES).sort()) {
    const parts = path.split("/");
    if (parts.at(-2) !== rig) continue;
    const group = (parts.at(-1) ?? "").replace(/\.ts$/, "");
    for (const exported of Object.values(ANIM_MODULES[path] ?? {})) {
      if (typeof exported !== "object" || exported === null) continue;
      for (const [name, anim] of Object.entries(exported)) {
        if (isAnim(anim)) found.set(`${group}/${name}`, anim);
      }
    }
  }
  return found;
}

function isAnim(value: unknown): value is LooseAnim {
  return typeof value === "object" && value !== null && typeof (value as LooseAnim).duration === "number" && typeof (value as LooseAnim).loop === "boolean";
}

/**
 * Варіанти частини слота: з контракту id (`*_VARIANTS`) і з маніфесту — записи тієї самої «родини» (id без останнього
 * сегмента, якщо варіантів кілька), — і «немає».
 */
function slotOptions(choice: RigChoice, slot: string): (ArtId | null)[] {
  const known = choice.variants[slot] ?? [];
  const options = new Set<ArtId | null>(known);
  const base = choice.def.skin[slot];
  const variants = known.filter((v) => v !== null);
  if (base && variants.length > 1) {
    const family = base.slice(0, base.lastIndexOf("/") + 1);
    const depth = base.split("/").length;
    for (const entry of artEntries()) if (entry.id.startsWith(family) && entry.id.split("/").length === depth) options.add(entry.id);
  }
  options.add(null);
  return [...options];
}

/**
 * Пробні речі для гнізд — кадри маніфесту (F5), у тому стані, в якому їх тримають: вудочка — іграшка в руці, у зубах —
 * іграшка й шкарпетка, у руках — тарілка зі стравою; рука, що гладить кота, — рука персонажа (у неї шари, тож вона
 * показує вибраний шар).
 */
const CARGO_LOOK: Readonly<Record<Exclude<SocketCargo, "cat">, { id: ArtId; state?: string; layered?: true }>> = {
  hand: { id: "person/arm", layered: true },
  rod: { id: "item/toy/cheap", state: "hand" },
  held: { id: "item/dish/meal", state: "cheap" },
  toy: { id: "item/toy/cheap", state: "teeth" },
  sock: { id: "mess/sock", state: "carried" },
};

const LAYERS: readonly (FrameLayer | "all")[] = ["all", "ink", "fill", "shade", "detail"];
const SCALES = ["auto", "1", "2", "3", "4"] as const;
const COLORS = { bone: 0xffd166, joint: 0xef476f, anchor: 0x06d6a0, socket: 0x4cc9f0, floor: 0x8a8296 } as const;

interface State {
  rig: RigName;
  view: ArtView;
  flip: boolean;
  anim: string;
  blend: boolean;
  scale: (typeof SCALES)[number];
  layer: FrameLayer | "all";
  skins: Record<RigName, Record<string, ArtId | null>>;
  proportions: Record<RigName, Set<string>>;
  kitten: number;
  bones: boolean;
  anchors: boolean;
  sockets: boolean;
  cargo: string;
}

function mount(ctx: GalleryContext): GalleryView {
  const { scene } = ctx;
  const state: State = {
    rig: "cat",
    view: "front",
    flip: false,
    anim: "",
    blend: true,
    scale: "auto",
    layer: "all",
    skins: { cat: { ...RIGS.cat.def.skin }, person: { ...RIGS.person.def.skin } },
    proportions: { cat: new Set(), person: new Set() },
    kitten: 1,
    bones: true,
    anchors: true,
    sockets: true,
    cargo: "",
  };
  let size = { w: scene.scale.width, h: scene.scale.height };

  const floor = scene.add.graphics();
  ctx.layer.add(floor);
  let sprite: LooseSprite | null = null;
  let overlay: Phaser.GameObjects.Graphics | null = null;
  /** Пробний вміст гнізда і, якщо це кіт, його скелет (його теж оновлюємо щокадру). */
  let cargo: Attachable | null = null;
  let cargoRig: LooseSprite | null = null;
  /** Чи йде час: на зупиненому повзунку змішування поз ніколи б не скінчилося, тож тоді нова поза — одразу. */
  let lastTime = Number.NaN;
  let running = false;

  const root = document.createElement("div");
  root.className = "rigs-tab";
  ctx.panel.append(root);
  const status = document.createElement("p");

  /** Поточна анімація. */
  const animNow = (): LooseAnim | null => animsOf(state.rig).get(state.anim) ?? null;

  /**
   * Видима частина світу, одиниці арту: шелл ставить світ (0, 0) у лівий верхній кут області, а камера має масштаб галереї
   * (`zoom` CSS px на одиницю), тож область у `size` CSS px — це `size / zoom` одиниць.
   */
  const view = (): { w: number; h: number } => {
    const { zoom } = galleryView();
    return { w: size.w / zoom, h: size.h / zoom };
  };

  const scaleNow = (): number => {
    if (state.scale !== "auto") return Number(state.scale);
    const fit = (view().h * 0.62) / RIGS[state.rig].height;
    return Math.max(1, Math.min(4, Math.floor(fit * 2) / 2));
  };

  /** Скелет заново: інший скелет, обвіс, пропорції чи шар. */
  const rebuild = (): void => {
    clearCargo();
    sprite?.destroy();
    const choice = RIGS[state.rig];
    sprite = new RigSprite(scene, choice.def, {
      fit: choice.fit,
      skin: state.skins[state.rig],
      facing: { view: state.view, flip: state.flip },
      proportions: proportionsNow(),
      layer: state.layer === "all" ? undefined : state.layer,
    });
    ctx.layer.add(sprite);
    overlay = scene.add.graphics();
    sprite.add(overlay);
    const anim = animNow();
    const now = ctx.time();
    sprite.update(now);
    if (anim) sprite.play(anim, { from: now, blend: 0 });
    setCargo();
    place();
    sprite.update(now);
    buildPanel();
  };

  const proportionsNow = (): (string | { name: string; weight: number })[] =>
    [...state.proportions[state.rig]].map((name) => (name === "kitten" ? { name, weight: state.kitten } : name));

  const place = (): void => {
    const k = scaleNow();
    const x = view().w / 2;
    const y = view().h * 0.78;
    sprite?.setPosition(x, y).setScale(k);
    floor.clear();
    floor.setPosition(x, y).setScale(k);
    // Ромб плитки 128 × 64 під коренем — щоб видно масштаб відносно підлоги.
    floor.lineStyle(1.5 / k, COLORS.floor, 0.9);
    floor.strokePoints([new Phaser.Math.Vector2(0, -32), new Phaser.Math.Vector2(64, 0), new Phaser.Math.Vector2(0, 32), new Phaser.Math.Vector2(-64, 0)], true, true);
    floor.lineBetween(-80, 0, 80, 0);
  };

  const clearCargo = (): void => {
    if (cargo && sprite) sprite.detach(cargo);
    cargo?.destroy();
    cargo = null;
    cargoRig = null;
  };

  const setCargo = (): void => {
    clearCargo();
    if (!sprite || !state.cargo) return;
    const def = RIGS[state.rig].def;
    const socket = (def.sockets as Readonly<Record<string, { cargo: readonly SocketCargo[] }>>)[state.cargo];
    const kind = socket?.cargo[0];
    if (!kind) return;
    if (kind === "cat") {
      cargoRig = new RigSprite(scene, RIGS.cat.def, { fit: RIGS.cat.fit, skin: state.skins.cat, layer: state.layer === "all" ? undefined : state.layer });
      cargo = cargoRig;
    } else {
      const look = CARGO_LOOK[kind];
      const layer = look.layered && state.layer !== "all" ? state.layer : undefined;
      cargo = addArt(scene, null, look.id, { state: look.state, view: look.layered ? state.view : undefined, layer });
    }
    sprite.attach(state.cargo, cargo);
  };

  const drawOverlay = (): void => {
    if (!sprite || !overlay) return;
    const g = overlay;
    g.clear();
    const rig = sprite.rig;
    const w = 1.5 / Math.abs(sprite.scaleY || 1);
    if (state.bones) {
      for (const bone of rig.bones) {
        const m = bone.world;
        g.lineStyle(w, COLORS.bone, 0.95);
        if (bone.len > 0) g.lineBetween(m.tx, m.ty, m.a * bone.len + m.tx, m.b * bone.len + m.ty);
        g.fillStyle(COLORS.joint, 0.95);
        g.fillCircle(m.tx, m.ty, 1.6 * w);
      }
    }
    const p = { x: 0, y: 0 };
    if (state.anchors) {
      g.lineStyle(w, COLORS.anchor, 1);
      for (const name of rig.anchorNames()) {
        if (!rig.anchor(name, p, false)) continue;
        g.lineBetween(p.x - 4, p.y, p.x + 4, p.y);
        g.lineBetween(p.x, p.y - 4, p.x, p.y + 4);
      }
    }
    if (state.sockets) {
      g.lineStyle(w, COLORS.socket, 1);
      rig.socketIds.forEach((_, i) => {
        const s = rig.socketAt(i);
        if (!s) return;
        g.strokePoints([new Phaser.Math.Vector2(s.x, s.y - 3), new Phaser.Math.Vector2(s.x + 3, s.y), new Phaser.Math.Vector2(s.x, s.y + 3), new Phaser.Math.Vector2(s.x - 3, s.y)], true, true);
        const r = (s.rot * Math.PI) / 180;
        g.lineBetween(s.x, s.y, s.x + Math.cos(r) * 8, s.y + Math.sin(r) * 8);
      });
    }
  };

  // --- Панель ---

  const field = (title: string): HTMLFieldSetElement => {
    const set = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = title;
    set.append(legend);
    root.append(set);
    return set;
  };

  const select = <T extends string>(parent: HTMLElement, label: string, options: readonly (readonly [T, string])[], value: T, change: (v: T) => void): void => {
    const wrap = document.createElement("label");
    wrap.style.display = "block";
    wrap.append(`${label} `);
    const el = document.createElement("select");
    for (const [v, text] of options) {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = text;
      option.selected = v === value;
      el.append(option);
    }
    el.addEventListener("change", () => change(el.value as T));
    wrap.append(el);
    parent.append(wrap);
  };

  const check = (parent: HTMLElement, label: string, value: boolean, change: (v: boolean) => void): void => {
    const wrap = document.createElement("label");
    wrap.style.display = "block";
    const el = document.createElement("input");
    el.type = "checkbox";
    el.checked = value;
    el.addEventListener("change", () => change(el.checked));
    wrap.append(el, ` ${label}`);
    parent.append(wrap);
  };

  const buildPanel = (): void => {
    root.replaceChildren();
    const choice = RIGS[state.rig];

    const main = field("Скелет");
    select(main, "Скелет:", (Object.keys(RIGS) as RigName[]).map((k) => [k, RIGS[k].title] as const), state.rig, (v) => {
      state.rig = v;
      state.anim = animsOf(v).has(state.anim) ? state.anim : "";
      state.cargo = "";
      rebuild();
    });
    select(main, "Ракурс:", [["front", "¾ спереду"], ["back", "¾ ззаду"]] as const, state.view, (v) => {
      state.view = v;
      sprite?.setFacing({ view: v });
      cargoRig?.setFacing({ view: v });
    });
    select(main, "Напрям:", [["right", "праворуч"], ["left", "ліворуч"]] as const, state.flip ? "left" : "right", (v) => {
      state.flip = v === "left";
      sprite?.setFacing({ flip: state.flip });
    });
    const anims = [...animsOf(state.rig).keys()];
    select(main, "Анімація:", [["", "вихідна поза"], ...anims.map((a) => [a, a] as const)], state.anim, (v) => {
      state.anim = v;
      const anim = animNow();
      sprite?.play(anim, { from: ctx.time(), blend: state.blend && running ? undefined : 0 });
    });
    check(main, "змішувати пози при зміні анімації (≈ 120 мс)", state.blend, (v) => (state.blend = v));
    select(main, "Масштаб:", SCALES.map((s) => [s, s === "auto" ? "авто" : `${s}×`] as const), state.scale, (v) => {
      state.scale = v;
      place();
    });
    select(main, "Шар (до компонувальника):", LAYERS.map((l) => [l, l === "all" ? "увесь кадр" : l] as const), state.layer, (v) => {
      state.layer = v;
      sprite?.setLayer(v === "all" ? undefined : v);
      cargoRig?.setLayer(v === "all" ? undefined : v);
    });
    main.append(status);

    const show = field("Накладка");
    check(show, "кістки (жовті) і суглоби", state.bones, (v) => (state.bones = v));
    check(show, "якорі (зелені хрестики)", state.anchors, (v) => (state.anchors = v));
    check(show, "гнізда (блакитні ромби з напрямом)", state.sockets, (v) => (state.sockets = v));
    const sockets = Object.keys(choice.def.sockets);
    select(show, "У гнізді:", [["", "нічого"], ...sockets.map((s) => [s, s] as const)], state.cargo, (v) => {
      state.cargo = v;
      setCargo();
    });

    const props = field("Пропорції");
    for (const name of Object.keys(choice.def.proportions ?? {})) {
      check(props, name, state.proportions[state.rig].has(name), (v) => {
        if (v) state.proportions[state.rig].add(name);
        else state.proportions[state.rig].delete(name);
        sprite?.setProportions(proportionsNow());
      });
    }
    if (choice.def.proportions?.["kitten"]) {
      const wrap = document.createElement("label");
      wrap.style.display = "block";
      wrap.append("вага kitten ");
      const range = document.createElement("input");
      range.type = "range";
      range.min = "0";
      range.max = "1";
      range.step = "0.05";
      range.value = String(state.kitten);
      range.addEventListener("input", () => {
        state.kitten = Number(range.value);
        sprite?.setProportions(proportionsNow());
      });
      wrap.append(range);
      props.append(wrap);
    }

    const skin = field("Обвіс");
    for (const slot of choice.def.slots) {
      const options = slotOptions(choice, slot.id);
      if (options.length <= 2) continue;
      select(
        skin,
        `${slot.id}:`,
        options.map((id) => [id ?? "", id ?? "немає"] as const),
        state.skins[state.rig][slot.id] ?? "",
        (v) => {
          const art = v === "" ? null : (v as ArtId);
          state.skins[state.rig][slot.id] = art;
          // Слоти з тією самою частиною (вуха, лапи) — разом.
          for (const other of choice.def.slots) {
            if (other.id !== slot.id && choice.def.skin[other.id] === choice.def.skin[slot.id] && options.includes(art)) state.skins[state.rig][other.id] = art;
          }
          sprite?.setSkin(state.skins[state.rig]);
          buildPanel();
        },
      );
    }
  };

  const unsubscribe = ctx.onResize?.((w, h) => {
    size = { w, h };
    place();
  });
  // Масштаб галереї змінився — скелет знову посередині видимого.
  const unsubscribeView = onGalleryView(() => place());

  rebuild();

  return {
    update(time: number): void {
      running = time !== lastTime;
      lastTime = time;
      if (!sprite) return;
      cargoRig?.update(time);
      sprite.update(time);
      drawOverlay();
      const anim = sprite.anim;
      const text = anim ? `t = ${Math.round(sprite.rig.time(time))} мс з ${anim.duration}${anim.loop ? ", по колу" : ""}` : "вихідна поза";
      if (status.textContent !== text) status.textContent = text;
    },
    destroy(): void {
      unsubscribe?.();
      unsubscribeView();
      clearCargo();
      sprite?.destroy();
      sprite = null;
      floor.destroy();
      root.remove();
    },
  };
}

export const TAB: GalleryTab = {
  id: "rigs",
  title: "Скелети",
  order: 30,
  mount,
};
