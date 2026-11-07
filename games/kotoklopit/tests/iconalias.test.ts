// Іконки нового вигляду під старими ключами текстур (крок 16, пакет T3, `iso/iconalias.ts`): текстура-вікно показує рівно
// те саме полотно, що й кадр атласу, — і ту саму вирізку на сторінці, і ту саму обрізку.

import { describe, expect, it } from "vitest";

import { frameCut, type FrameLike } from "../src/view/iso/iconalias";

function frame(over: Partial<FrameLike> = {}): FrameLike {
  return {
    sourceIndex: 1,
    cutX: 300,
    cutY: 40,
    cutWidth: 110,
    cutHeight: 100,
    realWidth: 128,
    realHeight: 128,
    trimmed: true,
    x: 0,
    y: 0,
    ...over,
  };
}

describe("іконка під старим ключем — вікно на кадр атласу", () => {
  it("обрізаний кадр: та сама вирізка на тій самій сторінці й те саме повне полотно", () => {
    expect(frameCut(frame({ x: 9, y: 14 }))).toEqual({
      source: 1,
      x: 300,
      y: 40,
      w: 110,
      h: 100,
      trim: { width: 128, height: 128, x: 9, y: 14 },
    });
  });

  it("необрізаний кадр — без обрізки", () => {
    expect(frameCut(frame({ trimmed: false, cutWidth: 128, cutHeight: 128 })).trim).toBeNull();
  });
});
