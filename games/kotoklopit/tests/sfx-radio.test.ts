// Шум ефіру радіо (§8.10): петля з файлу групи `radio`, яку грає сам ланцюг станції.

import { describe, expect, it } from "vitest";

import { RADIO } from "../src/audio/config";
import { soundFile } from "../src/audio/sfx/files";
import { group } from "../src/audio/sfx/groups/radio";

describe("шум ефіру (§8.10)", () => {
  it("закодовано петлею, а грає його ланцюг станції — група на події й стан не озвучує нічого", () => {
    expect(group.sounds["static"]?.loop).toBe(true);
    const file = soundFile("radio", "static");
    expect(file?.loop).not.toBeNull();
    expect(file!.loop!.end).toBeGreaterThan(file!.loop!.start);
    expect(group.onEvent).toBeUndefined();
    expect(group.loops).toBeUndefined();
    expect(group.tick).toBeUndefined();
  });

  it("гучність шуму — частка гучності музики", () => {
    expect(RADIO.staticLevel).toBeGreaterThan(0);
    expect(RADIO.staticLevel).toBeLessThanOrEqual(1);
  });
});
