// Знімки рис на фото титрів (§4.2) усіх розділів рис: кожен розділ — свій файл.

import type { TraitArea } from "../../sim/traits";
import { SHOTS as attention } from "./attention";
import { SHOTS as cats } from "./cats";
import { SHOTS as courage } from "./courage";
import { SHOTS as energy } from "./energy";
import { SHOTS as food } from "./food";
import { SHOTS as health } from "./health";
import { SHOTS as hygiene } from "./hygiene";
import { SHOTS as mischief } from "./mischief";
import { SHOTS as play } from "./play";
import type { TraitPhotoShots } from "./types";

export const TRAIT_PHOTOS: Readonly<Record<TraitArea, TraitPhotoShots>> = { energy, attention, food, hygiene, mischief, play, courage, cats, health };
