// Налаштування рендерера для запечених частин котів і персонажа (крок 16, T1; `GRAPHICS_PLAN.md`, «Що знати хвилям 2–3»).
//
// Шейдер Phaser 4 вибирає текстуру пакета малювання точним порівнянням інтерпольованого номера текстури
// (`outTexDatum == float(INDEX)`, GetTexture.glsl). На відеокарті це точно, а в програмному WebGL (SwiftShader — знімки й
// браузери без апаратного прискорення, llvmpipe на Linux) на повернутих зображеннях номер часом «пливе»: шматки повернутих
// запечених частин (а кожна частина кота — своя текстура) зникають чи беруть чужу текстуру. З однією текстурою на пакет
// номер завжди 0 — точно, ціною більшої кількості викликів малювання.
//
// Рішення T1: лише там, де WebGL програмний, — `render.maxTextures = 1`; на відеокарті (телефони й комп'ютери гравців) —
// як типово (до 16 текстур на пакет), бо 20 котів × ≈ 12 частин — це сотні зображень, і без пакетування по кілька текстур
// виклики малювання множаться. Пакувати запечені кадри в спільні полотна теж розв'язало б, але складніше (динамічне
// пакування з витісненням) і нічого не дає там, де рендерер апаратний. Без Phaser: лише DOM.

/** Назви програмних рендерерів WebGL: SwiftShader (Chromium/Edge без GPU), llvmpipe і softpipe (Mesa), WARP (Windows). */
export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|warp/i;

/** Назва рендерера WebGL цієї сторінки (без прискорення — назва програмного); WebGL немає — null. */
export function webglRenderer(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    // Пробний контекст більше не потрібен: браузер тримає їх обмежену кількість.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return null;
  }
}

/** Чи рендерер програмний (за назвою). */
export function isSoftwareRenderer(name: string | null): boolean {
  return name !== null && SOFTWARE_RENDERER.test(name);
}

/**
 * Налаштування `render` для `new Phaser.Game` за графікою сторінки: у новій графіці на програмному WebGL — одна текстура на
 * пакет; інакше — нічого (старий вигляд не змінюється до хвилі 3). `renderer` — щоб перевірити без браузера.
 */
export function catRenderConfig(gfx: string, renderer: () => string | null = webglRenderer): { maxTextures: number } | null {
  if (gfx !== "iso") return null;
  return isSoftwareRenderer(renderer()) ? { maxTextures: 1 } : null;
}
