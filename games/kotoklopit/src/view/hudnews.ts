// Бабл телефона на панелі (§9.9, `Hud.say`): де його зона дотику. Без Phaser.

export interface NewsHit {
  /** Розмір контейнера бабла (`setSize`). */
  size: { width: number; height: number };
  /** Зона дотику (`setInteractive`, `input.hitArea`). */
  area: { x: number; y: number; width: number; height: number };
}

/**
 * Зона дотику бабла `width` × `height`, чий контейнер стоїть у правому верхньому куті бабла (бабл — ліворуч і нижче). Phaser
 * перевіряє зону контейнера від його центру: точку дотику зсуває на `displayOrigin`, а це в контейнера завжди половина розміру.
 * Тож розмір — подвоєний (центр — у куті бабла), а зона — нижня ліва чверть, саме там, де бабл.
 */
export function newsHitArea(width: number, height: number): NewsHit {
  return { size: { width: width * 2, height: height * 2 }, area: { x: 0, y: height, width, height } };
}
