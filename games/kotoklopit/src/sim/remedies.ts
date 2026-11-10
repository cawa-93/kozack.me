// Від чого товар (§6.4): від яких хвороб і травм допомагає витратний товар — з тих самих правил, за якими гра лікує, тож «і» в
// картці магазину не розходиться з грою.

import { BATH_CURES, DISEASES, DRESSING, ILLNESSES } from "./config";
import type { DiseaseId, IllnessId, Product, Quality } from "./types";

/** Що варіант товару робить із хворобами й травмами. */
export interface Remedy {
  /** Котячі хвороби, які він лікує. */
  cures: DiseaseId[];
  /** Хронічні котячі хвороби, які він тримає під контролем щоденною дозою. */
  controls: DiseaseId[];
  /** Котячі хвороби, від яких він береже, не лікуючи. */
  prevents: DiseaseId[];
  /** Хвороби персонажа, які він лікує. */
  heals: IllnessId[];
  /** Повертає персонажу здоров'я після укусів і подряпин. */
  wounds: boolean;
}

const DISEASE_IDS = Object.keys(DISEASES) as DiseaseId[];
const ILLNESS_IDS = Object.keys(ILLNESSES) as IllnessId[];

/** Хвороби, які лікують курсом ліків цього виду, і хронічні, які він тримає під контролем (§9.5). */
const byMedicine = (product: "pills" | "drops"): Pick<Remedy, "cures" | "controls"> => ({
  cures: DISEASE_IDS.filter((id) => DISEASES[id].cure.kind === product),
  controls: DISEASE_IDS.filter((id) => {
    const cure = DISEASES[id].cure;
    return cure.kind === "control" && cure.medicine === product;
  }),
});

/** Дорогий корм — дієта (§9.5): кілька порцій поспіль лікують хвороби з `cure.kind` «diet». */
const DIET = DISEASE_IDS.filter((id) => DISEASES[id].cure.kind === "diet");

export function remedyOf(product: Product, quality: Quality): Remedy {
  const remedy: Remedy = { cures: [], controls: [], prevents: [], heals: [], wounds: false };
  switch (product) {
    case "pills":
    case "drops":
      return { ...remedy, ...byMedicine(product) };
    case "catFood":
    case "sterileFood":
      if (quality === "premium") remedy.cures.push(...DIET);
      // Стерилізований на звичайному кормі може захворіти на сечокам'яну (§9.8); на кормі для стерилізованих — ні.
      if (product === "sterileFood") remedy.prevents.push("urolithiasis");
      return remedy;
    case "shampoo":
      remedy.cures.push(...BATH_CURES[quality]);
      // Безшерстого, купаного вчасно, дерматит не бере (§8.7) — будь-яким шампунем.
      remedy.prevents.push("dermatitis");
      return remedy;
    case "humanMeds":
      // Ліки для себе діють на хвороби з дозами (§6.5); виснаження минає лише від сну.
      remedy.heals.push(...ILLNESS_IDS.filter((id) => ILLNESSES[id].doses !== null));
      return remedy;
    case "dressing":
      remedy.heals.push(...DRESSING.cures[quality]);
      remedy.wounds = DRESSING.health[quality] > 0;
      return remedy;
    default:
      return remedy;
  }
}

/** Варіант від чогось допомагає — і в його картці магазину є «і» (§6.4). */
export function helps(remedy: Remedy): boolean {
  return remedy.cures.length + remedy.controls.length + remedy.prevents.length + remedy.heals.length > 0 || remedy.wounds;
}
