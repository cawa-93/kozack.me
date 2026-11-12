// Вікно втратило фокус (Alt+Tab, дзвінок, шторка сповіщень) чи вкладка пішла у фон (§10): клавішу чи палець, відпущені вже
// поза грою, гра не почує, тож сцена скидає все «натиснуте» — інакше персонаж ішов би сам. Скидання клавіш самого Phaser на це
// не годиться: зупинка будь-якої сцени (гонки після першої поїздки) знімає його в усіх сценах — `KeyboardPlugin.shutdown`
// робить `off(BLUR, resetKeys)` без контексту, а `resetKeys` у всіх сцен одна функція прототипу. Без Phaser.

/** Події гри Phaser (`game.events`), з яких потрібні лише ці дві: `Phaser.Core.Events.BLUR` і `HIDDEN`. */
interface GameEvents {
  on(event: "blur" | "hidden", fn: () => void): unknown;
  off(event: "blur" | "hidden", fn: () => void): unknown;
}

/** Підписати `reset` на втрату фокуса й перехід у фон; повертає відписку (на `SHUTDOWN` сцени). */
export function onFocusLost(events: GameEvents, reset: () => void): () => void {
  // Своя функція на кожну підписку: чужий `off` без контексту її не зачепить.
  const lost = (): void => reset();
  events.on("blur", lost);
  events.on("hidden", lost);
  return () => {
    events.off("blur", lost);
    events.off("hidden", lost);
  };
}
