// Підказки керування (§11.3а): клавіатура й телефон кажуть про те саме, а кнопки екрана показані в стані, який у них є.

import { describe, expect, it } from "vitest";

import { BUTTON_STATES, svgInState } from "../src/ui/controls";
import { CONTROLS_KEYBOARD, CONTROLS_RACE_KEYBOARD, CONTROLS_RACE_TOUCH, CONTROLS_TOUCH, type ControlHint } from "../src/texts";
import { artEntry } from "../src/view/art/manifest";
import { HUD_ART, TOUCH_ART } from "../src/view/iso/hudlook";

const purposes = (hints: readonly ControlHint[]): string[] => hints.map((hint) => hint.what);

describe("підказки керування", () => {
  it("на клавіатурі й на телефоні — ті самі призначення, у тому самому порядку", () => {
    expect(purposes(CONTROLS_TOUCH)).toEqual(purposes(CONTROLS_KEYBOARD));
    expect(purposes(CONTROLS_RACE_TOUCH)).toEqual(purposes(CONTROLS_RACE_KEYBOARD));
  });

  it("кнопки екрана показані в стані, що є в кадрі", () => {
    expect(artEntry(TOUCH_ART.action)?.states).toContain(BUTTON_STATES.action);
    expect(artEntry(TOUCH_ART.dash)?.states).toContain(BUTTON_STATES.dash);
    expect(artEntry(HUD_ART.phone)?.states).toContain(BUTTON_STATES.phone);
  });

  it("у SVG лишається один стан, решта ховається, як у конвеєрі арту", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="st-idle"/><g class="st-held"/></svg>';
    const shown = svgInState(svg, "idle");
    expect(shown).toContain('[class*="st-"]{display:none}');
    expect(shown).toContain(".st-idle{display:inline}");
    expect(shown.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>')).toBe(true);
    expect(shown).toContain('<g class="st-held"/>');
  });
});
