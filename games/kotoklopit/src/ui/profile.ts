// Вкладка «Профіль» телефона (§8.4, §8.6): хто персонаж — портрет, ім'я, посада, ставка за годину й робочий час — і його стани
// тими самими іконками, що на панелі, з назвою й описом; біля назви хвороби — іконка ліків, коли їх сьогодні прийнято (§6.5).

import { ILLNESSES, WORK_END_MINUTE, WORK_START_MINUTE } from "../sim/config";
import { formatClock } from "../sim/time";
import type { GameState, IllnessId } from "../sim/types";
import { hourlyRate } from "../sim/work";
import { fill, JOB_SEEKING, personStateAbout, personStateTitle, POSITION_TITLES, PROFILE_TEXTS } from "../texts";
import type { IconName, Mark } from "../view/iconnames";
import { personStates, type PersonStateId } from "../view/personstates";
import { PERSON_STATE_ICONS, PRODUCT_ICONS } from "../view/symbols";
import { iconImage, markImage, named } from "./icons";
import { element } from "./overlay";
import { drawPortrait, portraitCanvas } from "./portrait";

const ILLNESS_IDS: ReadonlySet<string> = new Set(Object.keys(ILLNESSES));

/**
 * Посада персонажа (§8.6): назва за звертанням, безробітному — «Шукає роботу». Посаду більше ніде не видно, а картка її зміни може
 * загубитися після перезавантаження сторінки; репутації тут немає — вона невидима.
 */
export function positionText(state: GameState): string {
  if (state.job.unemployed) return JOB_SEEKING.replace(/^./, (c) => c.toUpperCase());
  return fill(POSITION_TITLES[state.job.position] ?? "", state.character.address);
}

/** Профіль: картка персонажа й стани. */
export function profileTab(state: GameState): HTMLElement[] {
  return [personCard(state), statesList(state)];
}

/** Портрет, ім'я, посада, ставка за годину й робочий час; безробітному — «шукає роботу» без ставки (§8.6). */
function personCard(state: GameState): HTMLElement {
  const { name, address, look } = state.character;
  const card = element("div", "profile-card");
  const canvas = portraitCanvas(78, 132);
  drawPortrait(canvas, look);
  const side = element("div", "profile-side");
  side.append(element("p", "profile-name", name));
  side.append(element("p", "profile-line profile-position", positionText(state)));
  if (!state.job.unemployed) {
    side.append(element("p", "profile-line", fill(PROFILE_TEXTS.rate, address, { сума: Math.round(hourlyRate(state)) })));
    side.append(element("p", "profile-line profile-muted", fill(PROFILE_TEXTS.hours, address, { від: formatClock(WORK_START_MINUTE), до: formatClock(WORK_END_MINUTE) })));
  }
  card.append(canvas, side);
  return card;
}

/** Стани, що діють зараз, — іконка (з позначкою, як на панелі), назва й опис; без станів — один спокійний рядок. */
function statesList(state: GameState): HTMLElement {
  const box = element("div", "profile-states");
  box.append(element("p", "controls-title", PROFILE_TEXTS.states));
  const ids = personStates(state);
  if (ids.length === 0) {
    box.append(element("p", "profile-muted", PROFILE_TEXTS.calm));
    return box;
  }
  for (const id of ids) box.append(stateRow(state, id));
  return box;
}

function stateRow(state: GameState, id: PersonStateId): HTMLElement {
  const { address } = state.character;
  const row = element("div", "profile-state");
  const look = PERSON_STATE_ICONS[id];
  row.append(stateIcon(look.icon, look.mark));
  const text = element("div", "profile-state-text");
  const name = element("p", "profile-state-name", personStateTitle(id, address));
  if (ILLNESS_IDS.has(id) && medsTaken(state, id as IllnessId)) name.append(element("span", "profile-state-meds", ` · ${named(PRODUCT_ICONS.humanMeds, PROFILE_TEXTS.medsTaken)}`));
  text.append(name, element("p", "profile-state-about", personStateAbout(state, id)));
  row.append(text);
  return row;
}

/** Ліки від хвороби (§6.5) сьогодні прийнято: доза одна на день. Виснаження ліки не беруть. */
function medsTaken(state: GameState, id: IllnessId): boolean {
  if (ILLNESSES[id].doses === null) return false;
  return state.character.illnesses.find((i) => i.id === id)?.lastDose === state.day;
}

/** Іконка стану на паперовому кружечку, з позначкою поверх (✓ «чудово виспався»), як на панелі. */
function stateIcon(icon: IconName, mark: Mark | undefined): HTMLElement {
  const box = element("span", "profile-state-icon");
  const img = iconImage(icon);
  if (img) box.append(img);
  const badge = mark ? markImage(mark) : null;
  if (badge) box.append(badge);
  return box;
}
