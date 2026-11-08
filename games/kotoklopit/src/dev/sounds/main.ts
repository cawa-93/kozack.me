// Каталог звуків (`sounds.html`): лише в `npm run dev` і на прев'ю Netlify, як галерея арту (вхід додає `vite.config.ts` лише з
// `__DEV_TOOLS__`). Кожен звук гри з назвою, тим, коли звучить (`about/`), файлами-варіантами й джерелами; автор слухає й
// вирішує: затвердити, замінити чи прибрати (`review.ts`, зберігає `store.ts`). Звук, змінений після рішення, позначено:
// його треба переслухати.

import { SFX } from "../../audio/config";
import { GROUPS } from "../../audio/sfx/registry";
import { soundFile, type EncodedGroup } from "../../audio/sfx/files";
import type { Sources } from "../../audio/sfx/sourcetypes";
import { ABOUT } from "./about";
import { buildCatalog, type CatalogFile, type CatalogGroup, type CatalogSound } from "./catalog";
import { Listener } from "./listen";
import {
  countStatuses,
  decide,
  DECISIONS,
  FILTERS,
  matchesFilter,
  reviewStatus,
  toggleVariant,
  withComment,
  type Decision,
  type Filter,
  type Review,
  type ReviewStatus,
} from "./review";
import "./sounds.css";
import { ReviewStore, type StoreMode } from "./store";

const ENCODED = import.meta.glob<EncodedGroup>("/audio/sfx/*/encoded.json", { import: "default", eager: true });
const SOURCES = import.meta.glob<Sources>("/audio/sfx/*/sources.json", { import: "default", eager: true });

/** Налаштування сторінки в цьому браузері. */
const PREFS_KEY = "kotoklopit:sounds-page";
/** Коментар пишеться, коли автор на мить зупинився. */
const COMMENT_DELAY_MS = 600;

const DECISION_TEXT: Readonly<Record<Decision, { icon: string; label: string; key: string }>> = {
  ok: { icon: "✓", label: "Затверджено", key: "1" },
  replace: { icon: "↻", label: "Замінити", key: "2" },
  delete: { icon: "✕", label: "Видалити", key: "3" },
};
const FILTER_TEXT: Readonly<Record<Filter, string>> = {
  all: "Усі",
  none: "Без рішення",
  stale: "Змінено",
  ok: "Затверджено",
  replace: "Замінити",
  delete: "Видалити",
};
/** Позначка файлу-варіанта при рішенні щодо частини файлів. */
const PICK_TEXT: Readonly<Record<"replace" | "delete", string>> = { replace: "замінити", delete: "прибрати" };

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Readonly<Record<string, string>> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child);
  return element;
}

const number = (value: number, digits = 1): string => value.toLocaleString("uk-UA", { maximumFractionDigits: digits });
const LICENSE_TEXT: Readonly<Record<string, string>> = { "CC0-1.0": "CC0", PD: "суспільне надбання" };
const license = (id: string): string => LICENSE_TEXT[id] ?? id.replace(/^CC-BY-/, "CC BY ");

interface Prefs {
  gameGain: boolean;
  filter: Filter;
}

function readPrefs(): Prefs {
  const prefs: Prefs = { gameGain: true, filter: "all" };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    if (typeof saved.gameGain === "boolean") prefs.gameGain = saved.gameGain;
    if (saved.filter && (FILTERS as readonly string[]).includes(saved.filter)) prefs.filter = saved.filter;
  } catch {
    // Немає сховища — типові.
  }
  return prefs;
}

class Page {
  readonly listener = new Listener();
  readonly cards: SoundCard[] = [];
  readonly prefs = readPrefs();
  private readonly chips = new Map<Filter, HTMLButtonElement>();
  private readonly storeNote = h("span", { class: "s-store" });
  private readonly groupSections: { el: HTMLElement; sections: { el: HTMLElement; cards: SoundCard[] }[] }[] = [];

  constructor(
    readonly store: ReviewStore,
    private readonly catalog: CatalogGroup[],
  ) {}

  mount(root: HTMLElement): void {
    const bar = this.renderBar();
    const main = h("main", { class: "s-main" });
    for (const group of this.catalog) main.append(this.renderGroup(group));
    root.append(bar, main);
    // Висота смуги — відступ, щоб картка під фокусом не ховалася під нею; на телефоні смуга не липне — і відступу немає.
    new ResizeObserver(() => {
      const sticky = getComputedStyle(bar).position === "sticky";
      document.documentElement.style.setProperty("--bar-h", `${sticky ? bar.offsetHeight : 0}px`);
    }).observe(bar);
    this.updateCounts();
    this.applyFilter();
    document.addEventListener("keydown", (event) => this.onKey(event));
  }

  savePrefs(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // Без сховища налаштування живуть до перезавантаження.
    }
  }

  setStoreMode(mode: StoreMode): void {
    this.storeNote.textContent = mode === "disk" ? "Рішення пишуться в audio/sfx/review.json" : "Сервера немає: рішення лише в цьому браузері — завантажте файл";
    this.storeNote.classList.toggle("is-warning", mode === "browser");
  }

  updateCounts(): void {
    const counts = countStatuses(this.cards.map((card) => card.status));
    for (const [filter, chip] of this.chips) chip.querySelector(".s-count")!.textContent = String(counts[filter]);
  }

  /** Сховати картки поза фільтром. Змінене рішення картку не ховає одразу — лише наступний вибір фільтра. */
  applyFilter(): void {
    for (const [filter, chip] of this.chips) chip.setAttribute("aria-pressed", String(filter === this.prefs.filter));
    for (const group of this.groupSections) {
      let groupVisible = false;
      for (const section of group.sections) {
        let sectionVisible = false;
        for (const card of section.cards) {
          const visible = matchesFilter(card.status, this.prefs.filter);
          card.el.hidden = !visible;
          card.el.classList.remove("is-out");
          sectionVisible ||= visible;
        }
        section.el.hidden = !sectionVisible;
        groupVisible ||= sectionVisible;
      }
      group.el.hidden = !groupVisible;
    }
  }

  /** Картка більше не підходить під фільтр: лишається, але бліда. */
  markFiltered(card: SoundCard): void {
    card.el.classList.toggle("is-out", !matchesFilter(card.status, this.prefs.filter));
  }

  private renderBar(): HTMLElement {
    const gain = h("input", { type: "checkbox" });
    gain.checked = this.prefs.gameGain;
    gain.addEventListener("change", () => {
      this.prefs.gameGain = gain.checked;
      this.savePrefs();
    });
    const download = h("button", { type: "button", class: "s-button" }, "Завантажити рішення");
    download.addEventListener("click", () => this.store.download());
    this.setStoreMode(this.store.mode);

    const filters = h("div", { class: "s-filters", role: "group", "aria-label": "Фільтр" });
    for (const filter of FILTERS) {
      const chip = h("button", { type: "button", class: `s-chip s-chip-${filter}` }, FILTER_TEXT[filter], " ", h("span", { class: "s-count" }));
      chip.addEventListener("click", () => {
        this.prefs.filter = filter;
        this.savePrefs();
        this.applyFilter();
      });
      this.chips.set(filter, chip);
      filters.append(chip);
    }
    const nav = h("nav", { class: "s-nav" });
    for (const group of this.catalog) {
      const count = group.sections.reduce((sum, section) => sum + section.sounds.length, 0);
      nav.append(h("a", { href: `#g-${group.id}` }, group.title, " ", h("span", { class: "s-count" }, String(count))));
    }
    return h(
      "header",
      { class: "s-bar" },
      h(
        "div",
        { class: "s-row" },
        h("h1", {}, "Звуки Котоклопіту"),
        nav,
        h("label", { class: "s-toggle", title: "Як у грі на повному повзунку «Звуки»: gain групи й шина — квартира тихіша за інтерфейс і з приглушеними верхами (SFX). Без позначки — файл на повну." }, gain, " гучність як у грі"),
        download,
      ),
      h("div", { class: "s-row" }, filters, this.storeNote),
      h("p", { class: "s-keys" }, "Клавіші: ↑ ↓ — звук, пробіл — слухати, 1 2 3 — рішення, C — коментар, Esc — вийти з коментаря."),
    );
  }

  private renderGroup(group: CatalogGroup): HTMLElement {
    const el = h("section", { class: "s-group", id: `g-${group.id}` }, h("h2", {}, group.title));
    const sections: { el: HTMLElement; cards: SoundCard[] }[] = [];
    for (const section of group.sections) {
      const sectionEl = h("section", { class: "s-section" }, h("h3", {}, section.title));
      const cards = section.sounds.map((sound) => new SoundCard(sound, this));
      for (const card of cards) sectionEl.append(card.el);
      this.cards.push(...cards);
      sections.push({ el: sectionEl, cards });
      el.append(sectionEl);
    }
    this.groupSections.push({ el, sections });
    return el;
  }

  private onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest("textarea, input")) {
      if (event.key === "Escape") target.closest<HTMLElement>(".s-card")?.focus();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const card = this.cards.find((c) => c.el.contains(target)) ?? null;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.move(card, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!card) return;
    if (event.key === " " && target.tagName !== "BUTTON" && target.tagName !== "A") {
      event.preventDefault();
      card.toggleAll();
      return;
    }
    const decision = DECISIONS.find((d) => event.code === `Digit${DECISION_TEXT[d].key}` || event.code === `Numpad${DECISION_TEXT[d].key}`);
    if (decision) {
      event.preventDefault();
      card.decide(decision);
    } else if (event.code === "KeyC") {
      event.preventDefault();
      card.openComment();
    }
  }

  private move(from: SoundCard | null, step: 1 | -1): void {
    const visible = this.cards.filter((card) => !card.el.hidden);
    if (visible.length === 0) return;
    const index = from ? visible.indexOf(from) : -1;
    const next = visible[index < 0 ? (step > 0 ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, index + step))]!;
    next.el.focus();
    next.el.scrollIntoView({ block: "nearest" });
  }
}

class SoundCard {
  readonly el: HTMLElement;
  status: ReviewStatus = "none";
  private readonly playAll: HTMLButtonElement;
  private readonly rows: { file: CatalogFile; pick: HTMLLabelElement; box: HTMLInputElement; pickText: HTMLElement }[] = [];
  private readonly buttons = new Map<Decision, HTMLButtonElement>();
  private readonly comment = h("textarea", { class: "s-comment", rows: "2", placeholder: "Що не так: гуде, тихо, не той звук, зайвий…" });
  private readonly commentButton = h("button", { type: "button", class: "s-link" }, "+ коментар");
  private readonly badge = h("span", { class: "s-badge" });
  private commentTimer = 0;

  constructor(
    readonly sound: CatalogSound,
    private readonly page: Page,
  ) {
    const tags = [
      sound.loop && "петля",
      sound.ui && "інтерфейс",
      sound.files.length > 1 && `${sound.files.length} варіанти`,
      `гучність ${number(sound.gain, 2)}`,
    ].filter((tag): tag is string => typeof tag === "string");
    this.playAll = this.playButton(sound.files.length > 1 && !sound.loop ? "Слухати всі варіанти" : "Слухати", () => sound.files);
    const files = h("ol", { class: "s-files" });
    for (const file of sound.files) files.append(this.renderFile(file));
    const decide = h("div", { class: "s-decide" });
    for (const decision of DECISIONS) {
      const { icon, label, key } = DECISION_TEXT[decision];
      const button = h("button", { type: "button", class: `s-decision s-${decision}`, title: `${label} (${key})` }, h("span", { "aria-hidden": "true" }, icon), " ", label);
      button.addEventListener("click", () => this.decide(decision));
      this.buttons.set(decision, button);
      decide.append(button);
    }
    decide.append(this.commentButton);
    this.commentButton.addEventListener("click", () => this.openComment());
    this.comment.addEventListener("input", () => {
      window.clearTimeout(this.commentTimer);
      this.commentTimer = window.setTimeout(() => this.saveComment(), COMMENT_DELAY_MS);
    });
    this.comment.addEventListener("blur", () => this.saveComment());

    this.el = h(
      "article",
      { class: "s-card", tabindex: "0", "data-key": sound.key },
      h(
        "div",
        { class: "s-head" },
        this.playAll,
        h("div", { class: "s-titles" }, h("h4", {}, sound.title), h("div", { class: "s-meta" }, h("code", {}, sound.key), ...tags.map((tag) => h("span", { class: "s-tag" }, tag)))),
        this.badge,
      ),
      h("p", { class: "s-when" }, sound.when),
      files,
      decide,
      this.comment,
    );
    this.render();
  }

  get review(): Review | undefined {
    return this.page.store.reviews[this.sound.key];
  }

  decide(decision: Decision): void {
    this.save(decide(this.review, decision, this.fileNames(), this.sound.print, new Date().toISOString()));
  }

  openComment(): void {
    this.el.classList.add("has-comment");
    this.comment.focus();
  }

  toggleAll(): void {
    this.playAll.click();
  }

  private fileNames(): string[] {
    return this.sound.files.map((f) => f.name);
  }

  private save(review: Review | null): void {
    this.page.store.set(this.sound.key, review);
    this.render();
    this.page.updateCounts();
    this.page.markFiltered(this);
  }

  private saveComment(): void {
    window.clearTimeout(this.commentTimer);
    if ((this.review?.comment ?? "") === this.comment.value.trim()) return;
    this.save(withComment(this.review, this.comment.value, this.sound.print, new Date().toISOString()));
  }

  private render(): void {
    const review = this.review;
    this.status = reviewStatus(review, this.sound.print);
    this.el.dataset["status"] = this.status;
    for (const [decision, button] of this.buttons) {
      button.setAttribute("aria-pressed", String(review?.decision === decision));
      button.classList.toggle("is-stale", this.status === "stale" && review?.decision === decision);
    }
    this.badge.textContent = this.status === "stale" ? "Звук змінено після рішення — переслухайте" : "";
    this.badge.hidden = this.status !== "stale";
    if (document.activeElement !== this.comment) this.comment.value = review?.comment ?? "";
    const partial = (review?.decision === "replace" || review?.decision === "delete") && this.rows.length > 1 ? review.decision : null;
    const chosen = new Set(review?.variants ?? this.fileNames());
    for (const row of this.rows) {
      row.pick.hidden = partial === null;
      row.box.checked = chosen.has(row.file.name);
      if (partial) row.pickText.textContent = PICK_TEXT[partial];
    }
    this.el.classList.toggle("has-comment", Boolean(review?.comment) || review?.decision === "replace" || review?.decision === "delete" || this.el.classList.contains("has-comment"));
  }

  private renderFile(file: CatalogFile): HTMLElement {
    const box = h("input", { type: "checkbox" });
    const pickText = h("span");
    const pick = h("label", { class: "s-pick" }, box, " ", pickText);
    box.addEventListener("change", () => {
      const review = this.review;
      if (review) this.save(toggleVariant(review, file.name, this.fileNames(), new Date().toISOString()));
    });
    this.rows.push({ file, pick, box, pickText });
    const length = file.seconds === null ? "не закодовано" : `${number(file.seconds)} с`;
    const source = file.source;
    return h(
      "li",
      { class: "s-file" },
      h(
        "div",
        { class: "s-file-row" },
        this.playButton("Слухати цей файл", () => [file]),
        h("span", { class: "s-fname" }, file.name),
        h("span", { class: "s-dur" }, length),
        file.note && h("span", { class: "s-note" }, file.note),
        pick,
      ),
      source &&
        h(
          "div",
          { class: "s-src" },
          h("a", { href: source.url, target: "_blank", rel: "noreferrer" }, source.title),
          ` — ${source.author}, ${license(source.license)}`,
        ),
      file.shared.length > 0 && h("div", { class: "s-shared" }, `Той самий файл: ${file.shared.map((t) => `«${t}»`).join(", ")}`),
    );
  }

  private playButton(title: string, files: () => readonly CatalogFile[]): HTMLButtonElement {
    const button = h("button", { type: "button", class: "s-play", title, "aria-label": title }, "▶");
    if (!files().some((f) => f.url !== null)) button.disabled = true;
    button.addEventListener("click", () => {
      if (button.classList.contains("is-playing")) {
        this.page.listener.stop();
        return;
      }
      button.classList.add("is-playing");
      button.textContent = "■";
      const game = this.page.prefs.gameGain;
      const gain = game ? this.sound.gain * (this.sound.ui ? SFX.uiLevel : SFX.worldLevel) : 1;
      void this.page.listener.play(files(), { gain, far: game && !this.sound.ui }, this.sound.loop, () => {
        button.classList.remove("is-playing");
        button.textContent = "▶";
      });
    });
    return button;
  }
}

async function main(): Promise<void> {
  const root = document.getElementById("sounds")!;
  const byGroup = <T>(files: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(files).map(([path, data]) => [path.split("/").at(-2)!, data]));
  const catalog = buildCatalog({
    groups: GROUPS,
    about: ABOUT,
    encoded: byGroup(ENCODED),
    sources: byGroup(SOURCES),
    url: (group, file) => soundFile(group, file)?.url ?? null,
  });
  let page: Page | null = null;
  const store = await ReviewStore.load((mode) => page?.setStoreMode(mode));
  page = new Page(store, catalog);
  page.mount(root);
}

void main();
