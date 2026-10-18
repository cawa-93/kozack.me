// GLSL-шейдери конвеєра освітлення (§7.2, §7.5, §7.6).
// Pixi v8 сам додає #version 300 es і точність; глобальні матриці — uProjectionMatrix,
// uWorldTransformMatrix (глобальні) і uTransformMatrix (локальна матриця меша).

const MESH_VERTEX_HEAD = /* glsl */ `
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
vec4 project(vec2 p) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  return vec4((mvp * vec3(p, 1.0)).xy, 0.0, 1.0);
}
`;

/** Полігон світла в тайлових координатах; яскравість рахується попіксельно від центру джерела. */
export const LIGHT_VERT = /* glsl */ `
${MESH_VERTEX_HEAD}
out vec2 vPos;
void main() {
  gl_Position = project(aPosition);
  vPos = aPosition;
}
`;

export const LIGHT_FRAG = /* glsl */ `
in vec2 vPos;
out vec4 finalColor;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uLightColor;
uniform float uIntensity;
uniform float uFog;
uniform float uMinB;
uniform float uFlat;
void main() {
  float d = distance(vPos, uCenter);
  if (d > uRadius) discard;
  float x = d / uRadius;
  float fall = pow(max(0.0, 1.0 - x * x), 1.5);
  // Туман послаблює світло з відстанню (§7.5); мінімум яскравості застосовується останнім (§7.3).
  float b = fall * exp(-uFog * d) * uIntensity;
  b = mix(max(b, uMinB), uIntensity, uFlat);
  // М'який край на останніх сотих тайла.
  b *= smoothstep(uRadius, uRadius - 0.04, d);
  finalColor = vec4(uLightColor * b, 1.0);
}
`;

/** Домішування маски видимого в світову маску побаченого (§7.6), бленд max. */
export const SEEN_VERT = /* glsl */ `
${MESH_VERTEX_HEAD}
out vec2 vScreen;
uniform vec2 uCamTL;
uniform float uViewTiles;
void main() {
  gl_Position = project(aPosition);
  vScreen = (aPosition - uCamTL) / uViewTiles;
}
`;

export const SEEN_FRAG = /* glsl */ `
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uLight;
uniform sampler2D uLos;
void main() {
  if (vScreen.x < 0.0 || vScreen.y < 0.0 || vScreen.x > 1.0 || vScreen.y > 1.0) discard;
  vec3 l = texture(uLight, vScreen).rgb;
  float los = texture(uLos, vScreen).r;
  float v = max(l.r, max(l.g, l.b)) * los;
  float seen = step(0.05, v);
  finalColor = vec4(seen, seen, seen, seen);
}
`;

/** Фінальна композиція: живий шар × видиме + пам'ять × побачене × сила × (1 − видиме). */
export const COMPOSITE_VERT = /* glsl */ `
${MESH_VERTEX_HEAD}
in vec2 aUV;
out vec2 vUV;
void main() {
  gl_Position = project(aPosition);
  vUV = aUV;
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uScene;
uniform sampler2D uLight;
uniform sampler2D uLos;
uniform sampler2D uMem;
uniform sampler2D uSeen;
uniform vec2 uCamTL;
// Сцена в піксельній сітці арту з полем: зсув (пікселі текстури), видима частина й повний розмір (§11.4).
uniform vec2 uSceneOff;
uniform float uScenePx;
uniform float uSceneSize;
uniform float uViewTiles;
uniform vec2 uSeenOrigin;
uniform vec2 uSeenSize;
uniform float uMemStrength;
uniform vec3 uMemTint;
uniform float uTime;
uniform float uFog;
uniform float uTexel;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uGrain;
uniform float uFullbright;
uniform float uFogVeil;
uniform float uFogGlow;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 scene = texture(uScene, (uSceneOff + vUV * uScenePx) / uSceneSize).rgb;
  vec3 light = texture(uLight, vUV).rgb;
  float los = texture(uLos, vUV).r;
  vec2 world = uCamTL + vUV * uViewTiles;

  vec3 vis = light * los;
  // Панель розробника (§12.7): «вся мапа» — повне освітлення без обмеження лінією зору.
  vis = mix(vis, vec3(1.0), uFullbright);
  float visL = max(vis.r, max(vis.g, vis.b));

  // Туман рівнів 4–5 (§7.5): пасма двох масштабів (≈3 і ≈1 тайл), що дрейфують у різні боки.
  float fogD = 0.0;
  vec3 fogLight = vec3(0.0);
  if (uFogVeil > 0.0) {
    float a = fbm(world * 0.33 + vec2(uTime * 0.22, uTime * 0.09));
    float b = fbm(world * 1.0 + vec2(-uTime * 0.3, uTime * 0.17));
    // Постійний серпанок + виразні згустки-пасма, щоб рух туману було видно.
    fogD = 0.35 + 0.65 * smoothstep(0.42, 0.66, a * 0.6 + b * 0.4);
    // Світло розсіюється в тумані: ореол за межами полігона світла (кільця вибірок довкола).
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.7853982 + 0.39;
      vec2 o = vec2(cos(ang), sin(ang)) * uFogGlow;
      glow += texture(uLight, vUV + o).rgb * texture(uLos, vUV + o).r;
      glow += texture(uLight, vUV + o * 0.5).rgb * texture(uLos, vUV + o * 0.5).r;
    }
    glow /= 16.0;
    fogLight = max(vis, glow * 0.9);
    // Туман трохи гасить світло всередині пасма.
    vis *= 1.0 - uFogVeil * 0.35 * fogD;
  }

  // Тьмяне світло знебарвлює: у нічному зорі лише обриси без кольору (§7.3.5).
  float lum = dot(scene, vec3(0.299, 0.587, 0.114));
  float sat = smoothstep(0.14, 0.5, visL);
  vec3 sc = mix(vec3(lum), scene, sat);
  vec3 col = sc * vis * 1.35;
  if (uFogVeil > 0.0) {
    // Світла пелена кольору джерела: туман видно лише там, де на нього падає світло (нічний зір не рахується).
    float fl = max(fogLight.r, max(fogLight.g, fogLight.b));
    float lit = smoothstep(0.17, 0.55, fl);
    float veil = uFogVeil * fogD * lit;
    vec3 fogColor = fogLight * 0.95 + vec3(0.04);
    col = mix(col, fogColor, veil);
  }

  // Пам'ять про побачене (§7.6): контури з легким розмиттям, лише там, де зараз не видно.
  if (uMemStrength > 0.0) {
    float m = texture(uMem, vUV).r * 0.4;
    m += texture(uMem, vUV + vec2(uTexel, 0.0)).r * 0.15;
    m += texture(uMem, vUV - vec2(uTexel, 0.0)).r * 0.15;
    m += texture(uMem, vUV + vec2(0.0, uTexel)).r * 0.15;
    m += texture(uMem, vUV - vec2(0.0, uTexel)).r * 0.15;
    float seen = texture(uSeen, (world - uSeenOrigin) / uSeenSize).r;
    float hide = 1.0 - smoothstep(0.02, 0.12, visL);
    col += uMemTint * m * seen * uMemStrength * hide;
  }

  // Зерно й вінʼєтка.
  float g = hash(vUV * 1000.0 + fract(uTime * 7.0)) - 0.5;
  col += g * uGrain * (0.25 + visL);
  vec2 c = vUV - 0.5;
  col *= 1.0 - dot(c, c) * 0.9;

  col = mix(col, uFadeColor, uFade);
  finalColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;
