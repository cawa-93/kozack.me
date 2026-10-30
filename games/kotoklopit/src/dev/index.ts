// Режим розробки (§11.5): підключається лише в `npm run dev`.

import type { Session } from "../session";
import { Journal } from "./journal";
import { DevPanel } from "./panel";
import { findScenario } from "./scenarios";

export function installDev(session: Session): void {
  const journal = new Journal(() => session.save.current);
  const panel = new DevPanel(session, journal);
  // Доступ до гри з консолі браузера й автоматичних прогонів: `kotoklopit.save.current`.
  Object.assign(window, { kotoklopit: session });
  // Запуск одразу в сценарії: ?scenario=sunday-evening.
  const id = new URLSearchParams(window.location.search).get("scenario");
  if (id !== null) {
    const scenario = findScenario(id);
    if (scenario) panel.runScenario(id, scenario);
    else journal.add(`Режим розробки: сценарію «${id}» немає`);
  }
}
