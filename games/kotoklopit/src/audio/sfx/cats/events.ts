// Події котів → звуки (§11.4а, `SOUND_PLAN.md`, «Ефекти», рядок `cats`): кожен бабл «вголос» над котом, річчю, що її зачепив
// кіт, чи персонажем, якого кіт вкусив, звучить; думки — ні (хіба тихий звук тіла: позіхнув, ляснув хвостом).

import { isKitten } from "../../../sim/cat";
import { CARRIER_SPOT } from "../../../sim/home";
import type { GameEvent } from "../../../sim/events";
import type { Cat, GameState } from "../../../sim/types";
import type { Cue, SoundAt } from "../types";
import { meowMood, meowSound, voiceRate } from "./voice";

const NONE: readonly Cue[] = [];

const catAt = (id: number): SoundAt => `cat:${id}`;

function catById(state: GameState, id: number): Cat | undefined {
  return state.cats.find((c) => c.id === id);
}

/** Нявкання кота: за віком і ситуацією, його голосом. */
function meow(cat: Cat | undefined, id: number): Cue[] {
  if (!cat) return [{ sound: "meow", at: catAt(id) }];
  return [{ sound: meowSound(cat, meowMood(cat)), at: catAt(id), rate: voiceRate(cat) }];
}

/** Звук з голосом кота (`rate` — його висота), коли кіт відомий. */
function voiced(state: GameState, sound: string, id: number, gain?: number): Cue[] {
  const cat = catById(state, id);
  const cue: Cue = { sound: cat && isKittenVoice(cat, sound) ? "meow-kitten" : sound, at: catAt(id) };
  if (cat) cue.rate = voiceRate(cat);
  if (gain !== undefined) cue.gain = gain;
  return [cue];
}

/** Кошеня не гарчить і не кричить дорослим голосом: його злість і крик — той самий писк. */
function isKittenVoice(cat: Cat, sound: string): boolean {
  return isKitten(cat) && (sound === "cry" || sound === "meow-angry");
}

/** Коротке, що звучить серією («ек-ек-ек», «кх-кх-кх»): той самий звук тричі з паузою `stepMs`, трохи різної висоти. */
function triple(sound: string, at: SoundAt, stepMs: number): Cue[] {
  return [
    { sound, at },
    { sound, at, delayMs: stepMs, rate: 1.05 },
    { sound, at, delayMs: stepMs * 2, rate: 0.97 },
  ];
}

/** Точка іграшки, яку щойно розгриз кіт: самої іграшки вже немає, тож — кіт, що з нею грався. */
function toyCat(state: GameState, toy: number): SoundAt {
  const target = `item:${toy}`;
  const cat = state.cats.find((c) => c.act.target === target);
  return cat ? catAt(cat.id) : null;
}

export function catEvent(event: GameEvent, state: GameState): readonly Cue[] {
  switch (event.type) {
    case "meow": {
      if (event.silent === true) return NONE;
      const cat = catById(state, event.cat);
      // Кота на сходах не видно: він нявкає з-за дверей (§11.4, бабл над дверима).
      if (cat?.away === "stairs") return [{ sound: "meow-door", at: "door", rate: voiceRate(cat) }];
      return meow(cat, event.cat);
    }
    case "carrier-cry": {
      const cat = catById(state, event.cat);
      const cue: Cue = { sound: cat && isKitten(cat) ? "meow-kitten" : "cry", at: { x: CARRIER_SPOT.x, y: CARRIER_SPOT.y } };
      if (cat) cue.rate = voiceRate(cat);
      return [cue];
    }
    case "purr": {
      // Під рукою муркоче петля (`loops`); тут — коротке «мрр» на ласощі, гру й «Щедру душу».
      const activity = state.character.activity;
      if (activity?.kind === "pet" && activity.cat === event.cat) return NONE;
      return event.enjoyed ? [{ sound: "purr", at: catAt(event.cat) }] : NONE;
    }
    case "hissed":
    case "hissed-guests":
      return voiced(state, "hiss", event.cat);
    case "standoff-parted":
      return voiced(state, "hiss", event.cat, 0.7);
    case "standoff":
      return voiced(state, "growl", event.cats[0]);
    case "cat-fight":
      return [{ sound: "fight", at: catAt(event.cats[0]) }];
    case "fight-stopped":
      return [{ sound: "hiss", at: catAt(event.cat), gain: 0.7 }, { sound: "scamper", at: catAt(event.cat), delayMs: 150 }];
    case "bite":
      return [{ sound: "bite", at: catAt(event.cat) }];
    case "clawed":
      return [{ sound: "claw", at: catAt(event.cat) }];
    case "cat-ate":
      return [{ sound: "lick", at: catAt(event.cat), gain: 0.6 }];
    case "stole":
    case "treat-snatched":
      return [{ sound: "crunch", at: catAt(event.cat) }];
    case "coughing":
      return triple("hack", catAt(event.cat), 240);
    case "symptom":
      if (event.symptom === "sneeze") return [{ sound: "sneeze", at: catAt(event.cat) }];
      // Крик болю в лотку (сечокам'яна, §9.5) — вголос; свербіж і очі — думка.
      if (event.symptom === "pain") return voiced(state, "cry", event.cat);
      return NONE;
    case "medicine-spat":
      return [{ sound: "spit", at: catAt(event.cat), rate: event.medicine === "pills" ? 1 : 1.15 }];
    case "catnip":
      if (event.reaction === "frenzy") return voiced(state, "meow-angry", event.cat);
      return event.reaction === "roll" ? [{ sound: "purr", at: catAt(event.cat) }] : NONE;
    case "chatter":
      return triple("chatter", catAt(event.cat), 140);
    case "window-angry":
    case "sulked":
    case "cat-left":
      // Сіпає хвостом, дметься, іде з-під руки — думка, лише тихий звук тіла.
      return [{ sound: "tail", at: catAt(event.cat) }];
    case "play-declined":
      return event.sick ? voiced(state, "hiss", event.cat) : [{ sound: "tail", at: catAt(event.cat) }];
    case "knocked":
      return [{ sound: "smash", at: event.object }];
    case "trinket-fell":
      return [{ sound: event.broken ? "mug-break" : `${event.trinket}-drop`, at: event.object }];
    case "toy-broke":
      return [{ sound: "toy-break", at: toyCat(state, event.toy) }];
    case "scratched":
      // Дряпання звучить петлею, поки триває; подія — його кінець.
      return NONE;
    case "keyboard":
      return [{ sound: "keys", at: "computer" }];
    case "trash-tipped":
      return [{ sound: "bin", at: "trash" }, { sound: "paper", at: "trash", delayMs: 300 }];
    case "chewing":
      return [{ sound: event.what === "wire" ? "chew-wire" : "chew-box", at: catAt(event.cat) }];
    case "wire-chewed":
      return [{ sound: "spark", at: "computer" }];
    case "bag-chewed":
      return [{ sound: "bag-rip", at: "boxes" }];
    case "cabinet-pawed":
      return [{ sound: event.opened ? "cabinet-open" : "cabinet-lock", at: "cat-cabinet" }];
    case "played":
    case "cats-played": {
      const id = event.type === "played" ? event.cat : event.cats[0];
      const cat = catById(state, id);
      return cat ? [{ sound: isKitten(cat) ? "meow-kitten" : "meow-happy", at: catAt(id), rate: voiceRate(cat), gain: 0.7 }] : NONE;
    }
    case "groom-started":
    case "groomed":
    case "nervous":
      return [{ sound: "lick", at: catAt(event.cat), gain: 0.7 }];
    case "cat-cuddled":
      return [{ sound: "purr", at: catAt(event.cat), gain: 0.8 }];
    case "picked-up":
      // Ображений на руках сердиться вголос (§11.4); спокійного несуть мовчки.
      return event.offended ? voiced(state, "meow-angry", event.cat) : NONE;
    case "put-down":
      return [{ sound: "land", at: catAt(event.cat) }];
    case "cat-broke-free":
      return [...voiced(state, "meow-angry", event.cat), { sound: "scamper", at: catAt(event.cat), delayMs: 120 }];
    case "cat-dodged":
    case "scared":
      return [{ sound: "scamper", at: catAt(event.cat) }];
    case "cat-woke":
      return [{ sound: "yawn", at: catAt(event.cat) }];
    case "escaped":
      return [{ sound: "scamper", at: "door" }];
    case "cat-returned":
    case "cat-arrived":
      return meow(catById(state, event.cat), event.cat);
    case "birth":
      return [{ sound: "squeak", at: catAt(event.cat) }];
    case "tap-opened":
      return [{ sound: "tap", at: "sink" }];
    case "mess":
      return messSound(event.mess.kind, { x: event.mess.x, y: event.mess.y });
    case "litter-refused":
    case "cat-refused-food":
      // «Брудно» й «не цей корм» — думки (§11.4): кіт лише понюхав і відходить.
      return NONE;
    default:
      return NONE;
  }
}

/** Звук безладу (§9.12): зригнув грудку чи блюванням — чути; папір розмотано — шелест; решта безладу тиха. */
function messSound(kind: string, at: { x: number; y: number }): readonly Cue[] {
  switch (kind) {
    case "vomit":
    case "hairball":
      return [{ sound: "retch", at }];
    case "paper":
      return [{ sound: "paper", at }];
    case "litter":
      return [{ sound: "dig", at }];
    default:
      return NONE;
  }
}
