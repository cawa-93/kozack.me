// Режим розробки (§11.5): підключається лише в `npm run dev`.

import type { Session } from "../session";
import { Journal } from "./journal";
import { DevPanel } from "./panel";
import { parseLight } from "./lightparam";
import { findScenario } from "./scenarios";

export function installDev(session: Session): void {
  const journal = new Journal(() => session.save.current);
  const panel = new DevPanel(session, journal);
  // Доступ до гри з консолі браузера й автоматичних прогонів: `kotoklopit.save.current`.
  Object.assign(window, { kotoklopit: session });
  const params = new URLSearchParams(window.location.search);
  // Світло доби на задану годину чи без нього (§8.9): ?light=22:30, ?light=night, ?light=off.
  session.lightAt = parseLight(params.get("light"));
  // Запуск одразу в сценарії: ?scenario=sunday-evening.
  const id = params.get("scenario");
  if (id !== null) {
    const scenario = findScenario(id);
    if (scenario) panel.runScenario(id, scenario);
    else journal.add(`Режим розробки: сценарію «${id}» немає`);
  }
}
