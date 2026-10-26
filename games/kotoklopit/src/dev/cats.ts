// Розділ «Коти» панелі розробника (§11.5): додати й прибрати кота, змінити вік, стать, приховані
// шкали, потреби й риси, показати приховані числа над котами.

import { createCat, traitLevel, weightOf } from "../sim/cat";
import { WEIGHT } from "../sim/config";
import { addCat } from "../sim/night";
import { forgetRelations, relation } from "../sim/relations";
import { stateRng } from "../sim/rng";
import { TRAIT_GROUPS, traitGroup, traitName } from "../sim/traits";
import type { Cat, CatNeed, Save, TraitLevel } from "../sim/types";
import type { Session } from "../session";
import { fill } from "../texts";

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Partial<Record<string, string>>, ...children: (Node | string)[]) => HTMLElementTagNameMap[K];

const NEEDS: [CatNeed, string][] = [
  ["hunger", "голод"],
  ["thirst", "спрага"],
  ["toilet", "туалет"],
  ["fatigue", "втома"],
  ["attention", "увага"],
  ["play", "гра"],
];

const round = (v: number): number => Math.round(v * 10) / 10;

export class CatsSection {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;

  constructor(
    private readonly session: Session,
    private readonly el: El,
    private readonly button: (label: string, action: () => void) => HTMLButtonElement,
    private readonly changed: (what: string) => void,
  ) {
    const hidden = el("input", { type: "checkbox" });
    hidden.addEventListener("change", () => (session.showHidden = hidden.checked));
    this.list = el("div", { class: "dev-cats" });
    this.root = el(
      "div",
      {},
      el(
        "div",
        { class: "dev-row" },
        this.button("+ кошеня", () => this.add(1)),
        this.button("+ дорослий", () => this.add(4)),
        el("label", { class: "dev-check" }, hidden, "Приховане над котами"),
      ),
      this.list,
    );
  }

  private get save(): Save {
    return this.session.save;
  }

  private add(ageWeeks: number): void {
    const state = this.save.current;
    const cat = createCat(state, stateRng(state, "conditions"), { source: "shelter", ageWeeks, at: { x: state.character.body.x, y: state.character.body.y + 0.6 } });
    cat.arrivedDay = state.day - 2;
    addCat(state, cat);
    this.changed(`кіт ${cat.name} (${ageWeeks} тиж.)`);
    this.render();
  }

  /** Перебудувати список котів: після змін складу чи відкриття панелі. */
  render(): void {
    const el = this.el;
    const cats = this.save.current.cats;
    if (cats.length === 0) {
      this.list.replaceChildren(el("p", { class: "dev-hint" }, "Котів немає."));
      return;
    }
    this.list.replaceChildren(...cats.map((cat) => this.card(cat)));
  }

  /** Оновити живі числа, не чіпаючи поле, яке зараз редагують. */
  refresh(): void {
    for (const input of this.list.querySelectorAll<HTMLInputElement>("input[data-cat]")) {
      if (document.activeElement === input) continue;
      const cat = this.find(Number(input.dataset["cat"]));
      const field = input.dataset["field"] ?? "";
      if (!cat) continue;
      input.value = String(round(this.read(cat, field)));
    }
    for (const out of this.list.querySelectorAll<HTMLElement>("[data-act]")) {
      const cat = this.find(Number(out.dataset["act"]));
      if (cat) out.textContent = `${cat.act.kind}${cat.act.goal ? " (іде)" : ""} · ${round(cat.x)}, ${round(cat.y)}${cat.away ? " · на сходах" : ""}`;
    }
    for (const out of this.list.querySelectorAll<HTMLElement>("[data-relations]")) {
      const cat = this.find(Number(out.dataset["relations"]));
      if (cat) out.textContent = this.relations(cat);
    }
  }

  /** Стосунки з іншими котами (§9.4): від +50 — друзі, до −50 — вороги. */
  private relations(cat: Cat): string {
    const state = this.save.current;
    const parts = state.cats.filter((c) => c.id !== cat.id).map((c) => `${c.name} ${round(relation(state, cat, c))}`);
    return parts.length > 0 ? `Стосунки: ${parts.join(", ")}` : "";
  }

  private find(id: number): Cat | undefined {
    return this.save.current.cats.find((c) => c.id === id);
  }

  private read(cat: Cat, field: string): number {
    if (field === "age") return cat.ageWeeks;
    if (field === "weight") return weightOf(cat);
    if (field === "health" || field === "mood" || field === "love") return cat[field];
    return cat.needs[field as CatNeed] ?? 0;
  }

  private write(cat: Cat, field: string, value: number): void {
    const v = Math.max(0, Math.min(100, value));
    if (field === "age") cat.ageWeeks = Math.max(0, Math.round(value));
    // Вага (§9.12, «Схильність до повноти»): норма — без поля.
    else if (field === "weight") {
      if (v === WEIGHT.norm) delete cat.weight;
      else cat.weight = v;
    } else if (field === "health" || field === "mood" || field === "love") cat[field] = v;
    else cat.needs[field as CatNeed] = v;
  }

  private number(cat: Cat, field: string, label: string): HTMLElement {
    const el = this.el;
    const input = el("input", { type: "number", step: "1", "data-cat": String(cat.id), "data-field": field });
    input.value = String(round(this.read(cat, field)));
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      this.write(cat, field, value);
      this.changed(`${cat.name}: ${label} — ${value}`);
    });
    return el("label", { class: "dev-field" }, el("span", {}, label), input);
  }

  private card(cat: Cat): HTMLElement {
    const el = this.el;
    const sex = cat.sex;
    const traits = el(
      "ul",
      { class: "dev-traits" },
      ...cat.traits.map((t) =>
        el(
          "li",
          {},
          `${fill(traitName(t), sex)} (${traitGroup(t.group).title} ${t.level > 0 ? "+" : ""}${t.level}${t.known ? ", відома" : `, бачено ${t.seen}`}) `,
          this.button("×", () => {
            cat.traits = cat.traits.filter((x) => x !== t);
            this.changed(`${cat.name}: прибрано рису ${t.group}`);
            this.render();
          }),
        ),
      ),
    );
    const groups = el("select", {}, ...TRAIT_GROUPS.map((g) => el("option", { value: g.id }, g.title)));
    const level = el("select", {}, ...["2", "1", "-1", "-2"].map((v) => el("option", { value: v }, v)));
    const addTrait = this.button("+ риса", () => {
      const group = groups.value;
      cat.traits = cat.traits.filter((t) => t.group !== group);
      cat.traits.push({ group, level: Number(level.value) as TraitLevel, seen: 0, known: true });
      this.changed(`${cat.name}: риса ${group} ${level.value} (разом ${traitLevel(cat, group)})`);
      this.render();
    });
    const sexSelect = el("select", {}, el("option", { value: "female" }, "кішка"), el("option", { value: "male" }, "кіт"));
    sexSelect.value = sex;
    sexSelect.addEventListener("change", () => {
      cat.sex = sexSelect.value === "male" ? "male" : "female";
      this.changed(`${cat.name}: стать — ${cat.sex}`);
      this.render();
    });
    return el(
      "div",
      { class: "dev-cat" },
      el("div", { class: "dev-row" }, el("strong", {}, cat.name), sexSelect, el("span", { class: "dev-hint", "data-act": String(cat.id) }), this.button("Прибрати", () => {
        const state = this.save.current;
        state.cats = state.cats.filter((c) => c.id !== cat.id);
        forgetRelations(state, cat);
        if (state.character.held?.kind === "cat" && state.character.held.cat === cat.id) state.character.held = null;
        this.changed(`прибрано кота ${cat.name}`);
        this.render();
      })),
      el("div", { class: "dev-grid" }, this.number(cat, "age", "Вік, тиж."), this.number(cat, "health", "Здоров'я"), this.number(cat, "mood", "Настрій"), this.number(cat, "love", "Любов"), this.number(cat, "weight", "Вага")),
      el("div", { class: "dev-grid" }, ...NEEDS.map(([need, label]) => this.number(cat, need, label))),
      el("p", { class: "dev-hint", "data-relations": String(cat.id) }, this.relations(cat)),
      traits,
      el("div", { class: "dev-row" }, groups, level, addTrait),
    );
  }
}
