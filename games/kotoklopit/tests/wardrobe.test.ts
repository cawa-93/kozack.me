// Шафа в спальні (§8.7): ціль дії, а зовнішність змінює редактор. Порожніми руками картку відкриває сцена, тож сама дія нічого не
// робить; з річчю в руках — відмова.

import { describe, expect, it } from "vitest";

import { changeLook } from "../src/sim/character";
import { interact, newGame } from "../src/sim/game";
import { objectById } from "../src/sim/home";
import { targetOf } from "../src/sim/targets";
import { recordEvents } from "./helpers";

function atWardrobe() {
  const save = newGame({ address: "she", difficulty: "normal", seed: 1 });
  const wardrobe = objectById("wardrobe");
  const body = save.current.character.body;
  body.x = wardrobe.x + 0.5;
  body.y = wardrobe.y + 1.3;
  body.facing = { x: 0, y: -1 };
  return save;
}

describe("шафа (§8.7)", () => {
  it("біля шафи вона — ціль дії", () => {
    expect(targetOf(atWardrobe().current)?.id).toBe("wardrobe");
  });

  it("порожніми руками дія нічого не змінює й не відмовляє: редактор відкриває сцена", () => {
    const save = atWardrobe();
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events.filter((e) => e.type === "refused")).toEqual([]);
  });

  it("з річчю в руках — відмова «руки зайняті»", () => {
    const save = atWardrobe();
    save.current.character.held = { kind: "raw", quality: "cheap" };
    const { events, stop } = recordEvents();
    interact(save);
    stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "refused", reason: "hands-full" }));
    expect(save.current.character.held).toEqual({ kind: "raw", quality: "cheap" });
  });

  it("нова зовнішність стає зовнішністю персонажа", () => {
    const save = atWardrobe();
    const look = { ...save.current.character.look, build: 2 };
    changeLook(save.current, look);
    expect(save.current.character.look).toEqual(look);
  });
});
