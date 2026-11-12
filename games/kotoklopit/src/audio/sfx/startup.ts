// Що вантажити, щойно звук розблоковано (§11.4а, `audio/SOUND.md`, «Ефекти»): спершу шина інтерфейсу — картки й кнопки
// звучать із першого дотику, — далі решта. Лінивого (`lazy`, музика титрів) на старті немає: його беруть, коли знадобиться.
// `warm` — ще й декодувати заздалегідь, після решти.

import { soundBus } from "./bus";
import { soundFile, type SoundFile } from "./files";
import type { SoundGroup } from "./types";

export function startupFiles(groups: readonly SoundGroup[]): { fetch: SoundFile[]; warm: SoundFile[] } {
  const ui: SoundFile[] = [];
  const rest: SoundFile[] = [];
  const warm: SoundFile[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const def of Object.values(group.sounds)) {
      if (def.lazy) continue;
      for (const name of def.files) {
        const file = soundFile(group.id, name);
        if (!file || seen.has(file.key)) continue;
        seen.add(file.key);
        (soundBus(def) === "ui" ? ui : rest).push(file);
        if (def.warm) warm.push(file);
      }
    }
  }
  return { fetch: [...ui, ...rest], warm };
}
