// Картка радіо (§8.10): вигляд приймача зі шкалою, станціями, вимикачем і гучністю. Стан читає й змінює лише через `Radio`.

import type { Radio } from "../audio/radio/radio";
import type { Station } from "../audio/radio/schedule";
import { RADIO_STATIONS, RADIO_TEXTS } from "../texts";
import { element, type Card } from "./overlay";
import "./radio.css";

/** Межі шкали, МГц: станції лягають на неї за своєю частотою. */
const DIAL = { from: 86, to: 108 };

const dialPercent = (station: Station): number => {
  const frequency = Number(station.frequency.replace(",", "."));
  return ((frequency - DIAL.from) / (DIAL.to - DIAL.from)) * 100;
};

export function radioCard(radio: Radio, onClose: () => void): Card {
  const root = element("div", "radio");
  const face = element("div", "radio-face");
  const grille = element("div", "radio-grille");
  const dial = element("div", "radio-dial");
  const needle = element("div", "radio-needle");
  dial.append(needle);
  for (const station of radio.stations) {
    const mark = element("span", "radio-mark", station.frequency);
    mark.style.left = `${dialPercent(station)}%`;
    dial.append(mark);
  }
  face.append(grille, dial);

  const tagline = element("p", "radio-tagline");
  const now = element("p", "radio-now");

  const stations = element("div", "radio-stations");
  const buttons = new Map<Station, HTMLButtonElement>();
  for (const station of radio.stations) {
    const button = element("button", "radio-station", RADIO_STATIONS[station.id]?.name ?? station.id);
    button.type = "button";
    button.addEventListener("click", () => {
      radio.choose(station);
      refresh();
    });
    buttons.set(station, button);
    stations.append(button);
  }

  const power = element("button", "radio-power");
  power.type = "button";
  power.addEventListener("click", () => {
    radio.toggle();
    refresh();
  });
  const volume = element("input", "radio-volume");
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.value = String(Math.round(radio.volume * 100));
  volume.setAttribute("aria-label", RADIO_TEXTS.volume);
  volume.addEventListener("input", () => radio.setVolume(Number(volume.value) / 100));
  const label = element("label", "radio-volume-box", RADIO_TEXTS.volume);
  label.append(volume);
  const controls = element("div", "radio-controls");
  controls.append(power, label);

  root.append(face, tagline, now, stations, controls);

  function refresh(): void {
    const chosen = radio.station;
    root.classList.toggle("on", radio.on);
    needle.style.left = `${dialPercent(chosen)}%`;
    tagline.textContent = RADIO_STATIONS[chosen.id]?.tagline ?? "";
    for (const [station, button] of buttons) {
      const active = station === chosen;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    power.textContent = radio.on ? RADIO_TEXTS.turnOff : RADIO_TEXTS.turnOn;
    const track = radio.nowPlaying();
    now.textContent = radio.on && track ? `${RADIO_TEXTS.nowPlaying}: ${track.artist} — ${track.title}` : RADIO_TEXTS.silence;
  }
  refresh();
  // Ефір іде й поки картка відкрита: рядок оновлюється сам і зупиняється, щойно картку закрили.
  const timer = window.setInterval(() => {
    if (root.isConnected) refresh();
    else window.clearInterval(timer);
  }, 1000);

  return { title: "", skin: "radio", body: [root], actions: [], closable: true, onDismiss: onClose };
}
