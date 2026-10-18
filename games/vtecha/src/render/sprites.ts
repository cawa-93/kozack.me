// Піксельарт-атлас (§11.4): public/sprites/atlas.png + atlas.json, згенеровані `npm run sprites`.
// Назви кадрів — контракт між артом і кодом: кадр можна перемалювати в PNG, не чіпаючи коду.

import { Rectangle, Texture } from "pixi.js";

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Atlas {
  private readonly cache = new Map<string, Texture>();
  private base: Texture | null = null;

  constructor(
    readonly image: HTMLImageElement,
    readonly frames: Record<string, FrameRect>,
  ) {}

  has(name: string): boolean {
    return name in this.frames;
  }

  frame(name: string): FrameRect {
    const f = this.frames[name];
    if (!f) throw new Error(`Кадру «${name}» немає в атласі`);
    return f;
  }

  /** Текстура кадру для Pixi — без згладжування. */
  tex(name: string): Texture {
    let t = this.cache.get(name);
    if (t) return t;
    if (!this.base) {
      this.base = Texture.from(this.image);
      this.base.source.scaleMode = "nearest";
    }
    const f = this.frame(name);
    t = new Texture({ source: this.base.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
    this.cache.set(name, t);
    return t;
  }

  private readonly urls = new Map<string, string>();

  /** Кадр, збільшений у scale разів без згладжування, як data-URL (іконки HUD, §12.4). */
  dataUrl(name: string, scale: number): string {
    const key = `${name}@${scale}`;
    let url = this.urls.get(key);
    if (url) return url;
    const f = this.frame(name);
    const c = document.createElement("canvas");
    c.width = f.w * scale;
    c.height = f.h * scale;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
    url = c.toDataURL();
    this.urls.set(key, url);
    return url;
  }

  /** Намалювати кадр у Canvas2D (статична карта): (x, y) — лівий верхній кут. */
  draw(ctx: CanvasRenderingContext2D, name: string, x: number, y: number): void {
    const f = this.frame(name);
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
  }

  /** Кадр із центром у (cx, cy), повернутий на angle (рад). */
  drawRotated(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, angle: number, ax = 0.5, ay = 0.5): void {
    const f = this.frame(name);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h, -Math.round(f.w * ax), -Math.round(f.h * ay), f.w, f.h);
    ctx.restore();
  }
}

export async function loadAtlas(): Promise<Atlas> {
  const base = `${import.meta.env.BASE_URL}sprites/`;
  const [json, image] = await Promise.all([
    fetch(`${base}atlas.json`).then((r) => r.json() as Promise<{ frames: Record<string, FrameRect> }>),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не вдалося завантажити атлас спрайтів"));
      img.src = `${base}atlas.png`;
    }),
  ]);
  return new Atlas(image, json.frames);
}
