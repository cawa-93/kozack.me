// Колізія кола з тайлами (§4): рух вільний, стіни — квадрати 1×1. Коло виштовхується з кожного
// заблокованого тайла вздовж нормалі до найближчої точки, тож гравець ковзає вздовж стін і кутів.

export type BlockedFn = (tx: number, ty: number) => boolean;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Зміщує коло на (dx, dy) з урахуванням стін. Повертає нову позицію центру. */
export function moveCircle(
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number,
  blocked: BlockedFn,
): { x: number; y: number } {
  // Великі зміщення ділимо, щоб не проскочити тонку стіну.
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
  let nx = x;
  let ny = y;
  for (let s = 0; s < steps; s++) {
    nx += dx / steps;
    ny += dy / steps;
    const res = resolve(nx, ny, r, blocked, nx - dx / steps, ny - dy / steps);
    nx = res.x;
    ny = res.y;
  }
  return { x: nx, y: ny };
}

function resolve(x: number, y: number, r: number, blocked: BlockedFn, px: number, py: number): { x: number; y: number } {
  let nx = x;
  let ny = y;
  for (let iter = 0; iter < 4; iter++) {
    let pushed = false;
    const minTx = Math.floor(nx - r);
    const maxTx = Math.floor(nx + r);
    const minTy = Math.floor(ny - r);
    const maxTy = Math.floor(ny + r);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!blocked(tx, ty)) continue;
        const cx = clamp(nx, tx, tx + 1);
        const cy = clamp(ny, ty, ty + 1);
        const ddx = nx - cx;
        const ddy = ny - cy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r * r - 1e-9) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          nx = cx + (ddx / d) * r;
          ny = cy + (ddy / d) * r;
        } else {
          // Центр усередині тайла — повертаємо на попередню позицію.
          nx = px;
          ny = py;
        }
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return { x: nx, y: ny };
}

/** Чи перетинає коло тайл (tx, ty). */
export function circleOverlapsTile(x: number, y: number, r: number, tx: number, ty: number): boolean {
  const cx = clamp(x, tx, tx + 1);
  const cy = clamp(y, ty, ty + 1);
  return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
}

/** Чи вільне коло від заблокованих тайлів. */
export function circleFree(x: number, y: number, r: number, blocked: BlockedFn): boolean {
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (blocked(tx, ty) && circleOverlapsTile(x, y, r, tx, ty)) return false;
    }
  }
  return true;
}
