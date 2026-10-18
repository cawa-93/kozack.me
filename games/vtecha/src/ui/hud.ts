// HUD (§12.4): лише спорядження. Дві групи з піксельними знаками над ними — «рука» (долоня) й
// «рюкзак» (3 слоти з клавішами 1–3); іконки предметів і шкали, без підписів (§1.3).
// Кайдани (§11.2.1): у руці — кайдани, від них крізь рюкзак тягнеться ланцюг, на слотах — замки.
// Значок протиотрути — біля знака руки. Таймера немає.

import { MATCHBOOK_SIZE } from "../config";
import type { Item } from "../game/items";
import type { World } from "../game/world";
import type { Atlas } from "../render/sprites";

interface SlotEls {
  root: HTMLElement;
  icon: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
}

/** Стан слота для відображення. */
type SlotView = { kind: "item"; item: Item; lit: boolean } | { kind: "empty" } | { kind: "cuffs" } | { kind: "locked" };

export class Hud {
  readonly root: HTMLElement;
  private readonly hand: SlotEls;
  private readonly slots: SlotEls[] = [];
  private readonly antidote: HTMLElement;
  private readonly timer: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly atlas: Atlas,
  ) {
    this.root = el("div", "hud");

    // Рука: знак долоні над окремим слотом у бронзовій рамці.
    const handGroup = el("div", "hud-group hud-hand");
    const handHead = el("div", "hud-head");
    handHead.innerHTML = this.img("ui_hand", 2);
    this.antidote = el("div", "hud-antidote");
    this.antidote.innerHTML = this.img("icon_antidote", 2);
    handHead.append(this.antidote);
    const handFrame = el("div", "hud-frame hand-frame");
    this.hand = this.makeSlot();
    handFrame.append(this.hand.root);
    handGroup.append(handHead, handFrame);

    // Рюкзак: знак рюкзака над спільною шкіряною рамкою з трьома слотами.
    const packGroup = el("div", "hud-group hud-pack");
    const packHead = el("div", "hud-head");
    packHead.innerHTML = this.img("ui_backpack", 2);
    const packFrame = el("div", "hud-frame pack-frame");
    for (let i = 0; i < 3; i++) {
      const s = this.makeSlot();
      const key = el("div", "slot-key");
      key.innerHTML = this.img(`ui_key_${i + 1}`, 2);
      s.root.append(key);
      this.slots.push(s);
      packFrame.append(s.root);
    }
    packGroup.append(packHead, packFrame);

    // Ланцюг кайданів: від руки крізь увесь рюкзак (видно лише в кайданах).
    const chain = el("div", "hud-chain");
    chain.style.backgroundImage = `url(${this.atlas.dataUrl("ui_chain", 3)})`;

    this.root.append(handGroup, packGroup, chain);
    this.timer = el("div", "debug-timer");
    parent.append(this.root, this.timer);
  }

  private makeSlot(): SlotEls {
    const root = el("div", "slot");
    const icon = el("div", "slot-icon");
    const bar = el("div", "slot-bar");
    const fill = el("div", "slot-fill");
    bar.append(fill);
    root.append(icon, bar);
    return { root, icon, bar, fill };
  }

  /** Піксельна іконка з атласу, збільшена в scale разів без згладжування (§11.4). */
  private img(name: string, scale: number): string {
    const f = this.atlas.frame(name);
    return `<img src="${this.atlas.dataUrl(name, scale)}" width="${f.w * scale}" height="${f.h * scale}" alt="">`;
  }

  /** Іконка предмета — окремий детальний кадр інвентаря 16 × 16 (§12.4) у стані «увімкнений» чи «вичерпаний». */
  private icon(item: Item, lit: boolean): string {
    const base = this.atlas.has(`icon_${item.kind}`) ? `icon_${item.kind}` : `item_${item.kind}`;
    const name = lit && this.atlas.has(`${base}_lit`) ? `${base}_lit` : item.exhausted && this.atlas.has(`${base}_spent`) ? `${base}_spent` : base;
    return this.img(name, 3);
  }

  private setSlot(s: SlotEls, view: SlotView): void {
    const sig = view.kind === "item" ? `${view.item.kind}:${view.item.exhausted}:${view.lit}` : view.kind;
    if (s.icon.dataset.sig !== sig) {
      s.icon.dataset.sig = sig;
      s.icon.innerHTML =
        view.kind === "item" ? this.icon(view.item, view.lit) : view.kind === "cuffs" ? this.img("ui_handcuffs", 3) : view.kind === "locked" ? this.img("ui_lock", 3) : "";
    }
    const item = view.kind === "item" ? view.item : null;
    s.root.classList.toggle("empty", view.kind === "empty");
    s.root.classList.toggle("locked", view.kind === "locked");
    s.root.classList.toggle("lit", view.kind === "item" && view.lit);
    s.root.classList.toggle("spent", !!item?.exhausted);
    if (!item) {
      s.bar.style.visibility = "hidden";
      return;
    }
    s.bar.style.visibility = "visible";
    const segmented = item.kind === "matchbook";
    s.bar.classList.toggle("segmented", segmented);
    s.bar.style.setProperty("--segments", String(MATCHBOOK_SIZE));
    s.fill.style.width = `${Math.max(0, Math.min(1, item.resourceFraction)) * 100}%`;
  }

  /** Розташування: на бічному полі, якщо воно є; інакше тьмяно поверх нижнього краю вікна (§4). */
  layout(vpX: number, vpY: number, S: number): void {
    const hudW = this.root.offsetWidth || 340;
    const margin = vpX;
    if (margin >= hudW + 32) {
      this.root.classList.remove("overlay");
      this.root.style.left = `${Math.max(16, margin - hudW - 16)}px`;
      this.root.style.bottom = `${vpY + 16}px`;
      this.root.style.transform = "";
    } else {
      this.root.classList.add("overlay");
      this.root.style.left = `${vpX + S / 2}px`;
      this.root.style.bottom = `${vpY + 8}px`;
      this.root.style.transform = "translateX(-50%)";
    }
  }

  update(world: World | null, visible: boolean, debugTimer: string | null): void {
    this.root.style.display = visible && world ? "" : "none";
    this.timer.style.display = debugTimer ? "" : "none";
    if (debugTimer) this.timer.textContent = debugTimer;
    if (!world || !visible) return;
    const inv = world.inv;
    const cuffed = inv.handcuffed;
    this.root.classList.toggle("cuffed", cuffed);
    const view = (item: Item | null, lit: boolean): SlotView => (item ? { kind: "item", item, lit } : { kind: "empty" });
    this.setSlot(this.hand, cuffed ? { kind: "cuffs" } : view(inv.hand, world.handLit));
    this.slots.forEach((s, i) => this.setSlot(s, cuffed ? { kind: "locked" } : view(inv.backpack[i], false)));
    this.antidote.style.visibility = world.hasAntidote ? "visible" : "hidden";
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
