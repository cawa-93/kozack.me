// Вміст `credits.html` (§2.1): `scripts/credits/plugin.ts` завантажує цей модуль у Node під час збирання й у dev.

import { buildCredits } from "./credits";
import { creditsInput } from "./input";
import { renderCredits } from "./render";

export function creditsHtml(): string {
  return renderCredits(buildCredits(creditsInput()));
}
