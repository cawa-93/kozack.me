// Звороти опису життя з характером (§9.7) усіх розділів рис: кожен розділ — свій файл.

import { LINES as attention } from "./attention";
import { LINES as cats } from "./cats";
import { LINES as courage } from "./courage";
import { LINES as energy } from "./energy";
import { LINES as food } from "./food";
import { LINES as health } from "./health";
import { LINES as hygiene } from "./hygiene";
import { LINES as mischief } from "./mischief";
import { LINES as play } from "./play";
import type { TraitArea } from "../sim/traits";
import type { TraitLifeLines } from "./types";

export const TRAIT_LIFE_LINES: Readonly<Record<TraitArea, TraitLifeLines>> = { energy, attention, food, hygiene, mischief, play, courage, cats, health };
