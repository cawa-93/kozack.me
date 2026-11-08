// Газування в гонці (§8.5): гравець натиснув газ, коли той був відпущений, — мотор гарчить. Як часто, обмежує пауза звуку
// (`cooldownMs` у групі `trip`): газ підтискають часто. Кличе сцена гонки щокадру.

export class Revs {
  private pressed = false;

  /** Кадр гонки: чи газ щойно натиснули. */
  tick(throttle: number): boolean {
    const pressed = throttle > 0;
    const started = pressed && !this.pressed;
    this.pressed = pressed;
    return started;
  }
}
