// Рендер-конвеєр (§7.1–7.6, §13 кроки 10–12):
//   сцена (живий світ, «повністю освітлений») → sceneRT
//   полігони світла з попіксельним спаданням і туманом, адитивно → lightRT
//   полігон зору гравця → losRT
//   маска видимого домішується в світову маску побаченого (max) → seenRT
//   контури пам'яті (геометрія + знімки) → memRT
//   композиція: сцена × світло × зір + пам'ять × побачене × сила × (1 − видиме)
// Поверх — інтерфейс, прив'язаний до персонажа (§12.4): прогрес-бар, витривалість, приціл, підказка.

import {
  Container,
  Geometry,
  Graphics,
  Mesh,
  RenderTexture,
  Shader,
  Sprite,
  Texture,
  autoDetectRenderer,
  type Renderer,
} from "pixi.js";
import {
  ART_PX_PER_TILE,
  ACTION_BAR_OFFSET,
  ACTION_BAR_WIDTH,
  CAMERA_LERP,
  CAMERA_LOOK_OFFSET_MAX,
  FOG_DENSITY,
  FOG_GLOW_RADIUS,
  FOG_VEIL,
  MEMORY_STRENGTH,
  MEMORY_TEXTURE_PX_PER_TILE,
  MOUSE_RETICLE_MAX,
  NIGHTVISION_BRIGHTNESS,
  PLAYER_RADIUS,
  STAMINA_EXHAUST_RECOVER,
  TILE,
  VIEWPORT_TILES,
} from "../config";
import { LEVEL_TRANSITION_TIME } from "../config";
import type { Run } from "../game/run";
import { DEATH_SEQUENCE, VICTORY_SEQUENCE } from "../game/run";
import type { Settings } from "../game/settings";
import type { World } from "../game/world";
import { drawDoor, drawItemAt, drawMatch, drawPlayer, drawSpider, drawSpit, drawSpitDecal, drawWeb, itemLook, setArtAtlas, webLook } from "./art";
import { Lighting, type LitPolygon } from "./lighting";
import { drawLiveMap, drawMemoryMap } from "./mapArt";
import { Memory, itemRotation } from "./memory";
import { COMPOSITE_FRAG, COMPOSITE_VERT, LIGHT_FRAG, LIGHT_VERT, SEEN_FRAG, SEEN_VERT } from "./shaders";
import { MEMORY_TINT } from "./themes";
import { loadAtlas, type Atlas } from "./sprites";

/** Сторона текстури живого шару в пікселях арту: видима область × 16 (§11.4). */
const SCENE_PX = VIEWPORT_TILES * ART_PX_PER_TILE;
/** Поле текстури сцени (пікселі арту з кожного боку) для плавного субпіксельного зсуву камери. */
const SCENE_MARGIN = 1;
const SCENE_RT = SCENE_PX + 2 * SCENE_MARGIN;

export interface EdgeCue {
  /** Кут на джерело звуку відносно гравця (світові координати). */
  angle: number;
  intensity: number;
  cry: boolean;
}

interface LightMesh {
  mesh: Mesh<Geometry, Shader>;
  geom: Geometry;
  u: Record<string, unknown>;
}

const MAX_RT_PIXELS = 1400;

function colorVec(c: number): Float32Array {
  return new Float32Array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
}

export class GameRenderer {
  r!: Renderer;
  /** Піксельарт-атлас (§11.4). */
  atlas!: Atlas;
  private readonly stage = new Container();
  private cssW = 0;
  private cssH = 0;
  /** Сторона квадратного вікна світу в CSS-пікселях (§4). */
  S = 0;
  vpX = 0;
  vpY = 0;
  private rtRes = 1;
  private sceneRT!: RenderTexture;
  private lightRT!: RenderTexture;
  private losRT!: RenderTexture;
  private memRT!: RenderTexture;
  private seenRT: RenderTexture | null = null;
  private readonly scene = new Container();
  private readonly staticSprite = new Sprite();
  private readonly dynG = new Graphics();
  private readonly entG = new Graphics();
  private readonly lightLayer = new Container();
  private readonly lightPool: LightMesh[] = [];
  private readonly losLayer = new Container();
  private readonly losG = new Graphics();
  private readonly seenLayer = new Container();
  private seenMesh!: Mesh<Geometry, Shader>;
  private readonly memLayer = new Container();
  private readonly memSprite = new Sprite();
  private readonly memG = new Graphics();
  private composite!: Mesh<Geometry, Shader>;
  private readonly uiWorld = new Container();
  private readonly uiG = new Graphics();
  private readonly hintSprite = new Sprite();
  private readonly overlay = new Graphics();
  private readonly lighting = new Lighting();
  private readonly memory = new Memory();
  private world: World | null = null;
  private keyIcons = new Map<string, Texture>();
  camX = 0;
  camY = 0;
  private seenOrigin = [0, 0];
  private seenSize = [1, 1];
  private time = 0;
  private walkPhase = 0;
  private moving = false;
  private lastTravel = 0;
  edgeCues: EdgeCue[] = [];
  /** Панель розробника: світло «вся мапа» (§12.7). */
  devFullbright = false;

  async init(parent: HTMLElement): Promise<void> {
    this.atlas = await loadAtlas();
    setArtAtlas(this.atlas);
    this.r = await autoDetectRenderer({
      preference: "webgl",
      background: 0x000000,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    parent.appendChild(this.r.canvas);

    this.scene.addChild(this.staticSprite, this.dynG, this.entG);
    this.losLayer.addChild(this.losG);
    this.memLayer.addChild(this.memSprite, this.memG);
    this.uiWorld.addChild(this.uiG, this.hintSprite);
    this.hintSprite.anchor.set(0.5, 1);

    const seenGeom = new Geometry({ attributes: { aPosition: { buffer: new Float32Array(8), format: "float32x2" } }, indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    const seenShader = Shader.from({
      gl: { vertex: SEEN_VERT, fragment: SEEN_FRAG },
      resources: {
        seenUniforms: { uCamTL: { value: new Float32Array(2), type: "vec2<f32>" }, uViewTiles: { value: VIEWPORT_TILES, type: "f32" } },
        uLight: Texture.WHITE.source,
        uLos: Texture.WHITE.source,
      },
    });
    this.seenMesh = new Mesh({ geometry: seenGeom, shader: seenShader });
    this.seenMesh.blendMode = "max";
    this.seenLayer.addChild(this.seenMesh);

    const compGeom = new Geometry({
      attributes: {
        aPosition: { buffer: new Float32Array(8), format: "float32x2" },
        aUV: { buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), format: "float32x2" },
      },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const compShader = Shader.from({
      gl: { vertex: COMPOSITE_VERT, fragment: COMPOSITE_FRAG },
      resources: {
        compUniforms: {
          uCamTL: { value: new Float32Array(2), type: "vec2<f32>" },
          uSceneOff: { value: new Float32Array([SCENE_MARGIN, SCENE_MARGIN]), type: "vec2<f32>" },
          uScenePx: { value: SCENE_PX, type: "f32" },
          uSceneSize: { value: SCENE_RT, type: "f32" },
          uViewTiles: { value: VIEWPORT_TILES, type: "f32" },
          uSeenOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
          uSeenSize: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
          uMemStrength: { value: 0, type: "f32" },
          uMemTint: { value: new Float32Array(MEMORY_TINT), type: "vec3<f32>" },
          uTime: { value: 0, type: "f32" },
          uFog: { value: 0, type: "f32" },
          uTexel: { value: 0.001, type: "f32" },
          uFade: { value: 0, type: "f32" },
          uFadeColor: { value: new Float32Array(3), type: "vec3<f32>" },
          uGrain: { value: 0.035, type: "f32" },
          uFullbright: { value: 0, type: "f32" },
          uFogVeil: { value: 0, type: "f32" },
          uFogGlow: { value: 0, type: "f32" },
        },
        uScene: Texture.WHITE.source,
        uLight: Texture.WHITE.source,
        uLos: Texture.WHITE.source,
        uMem: Texture.WHITE.source,
        uSeen: Texture.WHITE.source,
      },
    });
    this.composite = new Mesh({ geometry: compGeom, shader: compShader });
    this.stage.addChild(this.composite, this.uiWorld, this.overlay);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.r.resize(this.cssW, this.cssH);
    // Піксель арту — ціла кількість екранних пікселів (§11.4): сторона вікна кратна SCENE_PX.
    const side = Math.floor(Math.min(this.cssW, this.cssH));
    this.S = side >= SCENE_PX ? Math.floor(side / SCENE_PX) * SCENE_PX : side;
    this.vpX = Math.floor((this.cssW - this.S) / 2);
    this.vpY = Math.floor((this.cssH - this.S) / 2);
    this.rtRes = Math.min(this.r.resolution, MAX_RT_PIXELS / this.S);
    const old = [this.sceneRT, this.lightRT, this.losRT, this.memRT];
    const make = () => RenderTexture.create({ width: this.S, height: this.S, resolution: this.rtRes });
    // Живий шар — у піксельній сітці арту, збільшується без згладжування (§11.4); світло — гладке.
    this.sceneRT = RenderTexture.create({ width: SCENE_RT, height: SCENE_RT, resolution: 1 });
    this.sceneRT.source.scaleMode = "nearest";
    this.lightRT = make();
    this.losRT = make();
    this.memRT = make();
    const res = this.composite.shader!.resources;
    res.uScene = this.sceneRT.source;
    res.uLight = this.lightRT.source;
    res.uLos = this.losRT.source;
    res.uMem = this.memRT.source;
    const sres = this.seenMesh.shader!.resources;
    sres.uLight = this.lightRT.source;
    sres.uLos = this.losRT.source;
    for (const rt of old) rt?.destroy(true);
    const pos = this.composite.geometry.getAttribute("aPosition").buffer;
    pos.data = new Float32Array([this.vpX, this.vpY, this.vpX + this.S, this.vpY, this.vpX + this.S, this.vpY + this.S, this.vpX, this.vpY + this.S]);
    this.composite.shader!.resources.compUniforms.uniforms.uTexel = 1.2 / (this.S * this.rtRes);
  }

  /** Новий рівень: статичні текстури, маска побаченого, пам'ять (§7.6: скидається на кожному рівні). */
  setWorld(world: World): void {
    this.world = world;
    const level = world.level;
    const map = level.map;
    // Статична карта — піксельарт 16 пікселів на тайл зі спрайтів атласу (§11.4).
    const live = drawLiveMap(level, this.atlas);
    const oldLive = this.staticSprite.texture;
    const liveTex = Texture.from(live.canvas);
    liveTex.source.scaleMode = "nearest";
    this.staticSprite.texture = liveTex;
    if (oldLive && oldLive !== Texture.EMPTY) oldLive.destroy(true);
    this.staticSprite.position.set(live.originX * TILE, live.originY * TILE);
    this.staticSprite.scale.set(TILE / live.ppt);

    const memPPT = Math.max(12, Math.min(32, Math.floor(2048 / Math.max(map.width, map.height))));
    const mem = drawMemoryMap(level, memPPT);
    const oldMem = this.memSprite.texture;
    this.memSprite.texture = Texture.from(mem.canvas);
    if (oldMem && oldMem !== Texture.EMPTY) oldMem.destroy(true);
    this.memSprite.position.set(mem.originX * TILE, mem.originY * TILE);
    this.memSprite.scale.set(TILE / memPPT);

    const oldSeen = this.seenRT;
    const px = MEMORY_TEXTURE_PX_PER_TILE;
    this.seenRT = RenderTexture.create({ width: map.width * px, height: map.height * px, resolution: 1 });
    this.r.render({ container: new Container(), target: this.seenRT, clear: true, clearColor: [0, 0, 0, 0] });
    this.seenOrigin = [map.originX, map.originY];
    this.seenSize = [map.width, map.height];
    this.composite.shader!.resources.uSeen = this.seenRT.source;
    oldSeen?.destroy(true);
    this.memory.reset();
    this.camX = world.player.x;
    this.camY = world.player.y;
    this.lastTravel = world.player.distanceTravelled;
  }

  // ======================= кадр =======================

  render(run: Run, dt: number, settings: Settings, paused: boolean): void {
    const world = run.world;
    if (world !== this.world) this.setWorld(world);
    if (!paused) this.time += dt;
    const p = world.player;
    const S = this.S;

    // Камера (§4): згладжування й зсув у бік прицілу.
    const aimLen = Math.hypot(p.aimX, p.aimY);
    const look = aimLen > 1e-3 ? (Math.min(aimLen, MOUSE_RETICLE_MAX) / MOUSE_RETICLE_MAX) * CAMERA_LOOK_OFFSET_MAX : 0;
    let tx = p.x + (aimLen > 1e-3 ? (p.aimX / aimLen) * look : 0);
    let ty = p.y + (aimLen > 1e-3 ? (p.aimY / aimLen) * look : 0);
    let zoom = 1;
    if (run.state === "dying" || run.state === "dead") {
      // Смерть (§9.5): завмирання 0.15 с, потім різкий зум на павука.
      const t = Math.min(run.endTimer, DEATH_SEQUENCE);
      const k = Math.max(0, Math.min(1, (t - 0.15) / 0.5));
      const spider = nearestSpider(world);
      if (spider) {
        tx = tx + (spider.x - tx) * k;
        ty = ty + (spider.y - ty) * k;
      }
      zoom = 1 + k * k * 1.6;
    }
    if (!paused) {
      const a = 1 - Math.pow(1 - CAMERA_LERP, dt * 60);
      this.camX += (tx - this.camX) * a;
      this.camY += (ty - this.camY) * a;
    }
    let camX = this.camX;
    let camY = this.camY;
    if (world.shake > 0 && !paused) {
      camX += (Math.random() - 0.5) * world.shake * 0.35;
      camY += (Math.random() - 0.5) * world.shake * 0.35;
    }
    const viewTiles = VIEWPORT_TILES / zoom;
    // Камера плавна (§11.4): сцена рендериться з позиції, прив'язаної до сітки арту, а дробова
    // частина доїжджає зсувом при збільшенні. Світло, зір і пам'ять — від точної позиції.
    const artPx = SCENE_PX / viewTiles;
    const snapX = Math.floor(camX * artPx) / artPx;
    const snapY = Math.floor(camY * artPx) / artPx;
    const ppt = S / viewTiles;
    const camTLx = camX - viewTiles / 2;
    const camTLy = camY - viewTiles / 2;

    // 10. Полігони світла й зору.
    const vision = this.lighting.compute(world, camX, camY, viewTiles / 2 + 1);
    const memStrength = MEMORY_STRENGTH[world.index];
    if (memStrength > 0) this.memory.update(world, this.lighting);
    else world.touched.clear();

    // Живий шар — у текстуру з полем (піксельна сітка арту), центр — прив'язана позиція камери.
    this.scene.scale.set(artPx / TILE);
    this.scene.position.set(SCENE_MARGIN + SCENE_PX / 2 - snapX * artPx, SCENE_MARGIN + SCENE_PX / 2 - snapY * artPx);
    const moved = p.distanceTravelled - this.lastTravel;
    this.lastTravel = p.distanceTravelled;
    if (moved > 0 && moved < 1) this.walkPhase += moved * 7;
    this.moving = moved > 1e-4 && moved < 1;
    this.drawDynamic(world, settings);
    this.r.render({ container: this.scene, target: this.sceneRT, clear: true, clearColor: [0, 0, 0, 1] });

    // Світло.
    this.lightLayer.scale.set(ppt);
    this.lightLayer.position.set(S / 2 - camX * ppt, S / 2 - camY * ppt);
    this.updateLightMeshes(vision.lights, world);
    this.r.render({ container: this.lightLayer, target: this.lightRT, clear: true, clearColor: [0, 0, 0, 1] });

    // Зір гравця (losMask).
    this.losLayer.scale.set(ppt);
    this.losLayer.position.set(S / 2 - camX * ppt, S / 2 - camY * ppt);
    this.losG.clear();
    if (vision.los.length >= 6) this.losG.poly(vision.los).fill(0xffffff);
    this.r.render({ container: this.losLayer, target: this.losRT, clear: true, clearColor: [0, 0, 0, 1] });

    // 11. Пам'ять.
    if (memStrength > 0 && this.seenRT && world.blackout <= 0) {
      const px = MEMORY_TEXTURE_PX_PER_TILE;
      this.seenLayer.scale.set(px);
      this.seenLayer.position.set(-this.seenOrigin[0] * px, -this.seenOrigin[1] * px);
      const buf = this.seenMesh.geometry.getAttribute("aPosition").buffer;
      buf.data = new Float32Array([camTLx, camTLy, camTLx + viewTiles, camTLy, camTLx + viewTiles, camTLy + viewTiles, camTLx, camTLy + viewTiles]);
      const su = this.seenMesh.shader!.resources.seenUniforms.uniforms;
      su.uCamTL = new Float32Array([camTLx, camTLy]);
      su.uViewTiles = viewTiles;
      this.r.render({ container: this.seenLayer, target: this.seenRT, clear: false });
      if (this.memory.dirty) this.memory.draw(this.memG);
      this.memLayer.scale.set(ppt / TILE);
      this.memLayer.position.set(S / 2 - camX * ppt, S / 2 - camY * ppt);
      this.r.render({ container: this.memLayer, target: this.memRT, clear: true, clearColor: [0, 0, 0, 1] });
    }

    // 12. Композиція.
    const u = this.composite.shader!.resources.compUniforms.uniforms;
    u.uCamTL = new Float32Array([camTLx, camTLy]);
    u.uSceneOff = new Float32Array([SCENE_MARGIN + (camX - snapX) * artPx, SCENE_MARGIN + (camY - snapY) * artPx]);
    u.uViewTiles = viewTiles;
    u.uSeenOrigin = new Float32Array(this.seenOrigin);
    u.uSeenSize = new Float32Array(this.seenSize);
    u.uMemStrength = memStrength;
    u.uTime = this.time;
    u.uFog = this.devFullbright ? 0 : FOG_DENSITY[world.index];
    u.uFullbright = this.devFullbright ? 1 : 0;
    u.uFogVeil = this.devFullbright ? 0 : FOG_VEIL[world.index];
    u.uFogGlow = FOG_GLOW_RADIUS[world.index] / viewTiles;
    const fade = this.fadeFor(run, world);
    u.uFade = fade.amount;
    u.uFadeColor = new Float32Array(fade.color);

    // Інтерфейс біля персонажа — поверх маски, нічого не освітлює (§7.3.1.2).
    this.uiWorld.scale.set(ppt / TILE);
    this.uiWorld.position.set(this.vpX + S / 2 - camX * ppt, this.vpY + S / 2 - camY * ppt);
    this.drawCharacterUI(run, world, ppt, fade.amount);
    this.drawOverlay(run, world, settings);
    this.r.render({ container: this.stage });
  }

  private fadeFor(run: Run, world: World): { amount: number; color: number[] } {
    if (run.state === "transition") {
      const t = run.transition / LEVEL_TRANSITION_TIME;
      return { amount: 1 - Math.abs(2 * t - 1), color: [0, 0, 0] };
    }
    if (run.state === "won") {
      const t = Math.min(1, run.endTimer / VICTORY_SEQUENCE);
      return { amount: t * t, color: [0.92, 0.96, 1] };
    }
    if (run.state === "dying" || run.state === "dead") {
      const t = Math.max(0, (run.endTimer - 0.3) / (DEATH_SEQUENCE - 0.3));
      return { amount: Math.min(1, t), color: [0, 0, 0] };
    }
    if (world.blackout > 0) return { amount: 1, color: [0, 0, 0] };
    return { amount: 0, color: [0, 0, 0] };
  }

  // ======================= живий шар =======================

  private drawDynamic(world: World, settings: Settings): void {
    const g = this.dynG;
    g.clear();
    for (const w of world.webs.values()) drawWeb(g, w.tx, w.ty, webLook(w));
    for (const d of world.doors) drawDoor(g, d);
    for (const d of world.decor) {
      if (d.kind === "match") drawMatch(g, d.x, d.y, d.rot, false);
      else if (d.kind === "handcuffs") drawItemAt(g, { kind: "handcuffs", lit: false, exhausted: false }, d.x, d.y, d.rot);
      else drawSpitDecal(g, d.x, d.y, d.rot, Math.min(1, d.ttl));
    }
    for (const m of world.floorMatches) drawMatch(g, m.x, m.y, itemRotation(m.id), true);
    for (const fi of world.floorItems) {
      const k = fi.roll < 1 ? fi.roll * (2 - fi.roll) : 1;
      const x = fi.fromX + (fi.x - fi.fromX) * k;
      const y = fi.fromY + (fi.y - fi.fromY) * k;
      // Піксельарт (§11.4): предмет на підлозі лежить рівно; повертається лише ліхтарик (куди світить) і те, що котиться.
      const rot = fi.item?.kind === "flashlight" ? fi.item.floorDir : (1 - k) * 4;
      drawItemAt(g, itemLook(fi.item), x, y, rot);
    }
    const e = this.entG;
    e.clear();
    for (const f of world.flyingFlares) drawItemAt(e, itemLook(f.item), f.x, f.y, this.time * 14);
    for (const s of world.spits) drawSpit(e, s.x, s.y, s.dx, s.dy);
    for (const s of world.spiders) drawSpider(e, s, this.time, settings.arachnophobiaMode);
    if (world.blackout <= 0) {
      const p = world.player;
      drawPlayer(e, {
        x: p.x,
        y: p.y,
        facing: p.facing,
        hand: world.inv.hand && world.inv.hand.kind !== "handcuffs" ? { ...itemLook(world.inv.hand), lit: world.handLit } : null,
        handcuffed: world.inv.handcuffed,
        stunned: p.stun !== null,
        struggling: p.struggle !== null,
        walkPhase: this.walkPhase,
        moving: this.moving,
      });
    }
  }

  private updateLightMeshes(lights: LitPolygon[], world: World): void {
    const fog = FOG_DENSITY[world.index];
    const list = [...lights];
    // Власне тіло гравця завжди ледь проступає з темряви (рівень нічного зору).
    if (world.blackout <= 0) {
      const p = world.player;
      const r = PLAYER_RADIUS + 0.04;
      const poly: number[] = [];
      for (let i = 0; i < 16; i++) poly.push(p.x + Math.cos((i / 16) * Math.PI * 2) * r, p.y + Math.sin((i / 16) * Math.PI * 2) * r);
      list.push({ src: { x: p.x, y: p.y, radius: r, color: 0xffffff, intensity: NIGHTVISION_BRIGHTNESS, fog: false, nightVision: true }, poly });
    }
    while (this.lightPool.length < list.length) this.lightPool.push(this.makeLightMesh());
    this.lightPool.forEach((lm, i) => {
      if (i >= list.length) {
        lm.mesh.visible = false;
        return;
      }
      const { src, poly } = list[i];
      lm.mesh.visible = true;
      const n = poly.length / 2;
      const sector = src.angle !== undefined;
      const verts = new Float32Array(sector ? poly.length : poly.length + 2);
      let base = 0;
      if (!sector) {
        verts[0] = src.x;
        verts[1] = src.y;
        base = 1;
      }
      verts.set(poly, base * 2);
      const total = n + base;
      const idx: number[] = [];
      for (let k = 1; k < total - 1; k++) idx.push(0, k, k + 1);
      if (!sector) idx.push(0, total - 1, 1);
      lm.geom.getAttribute("aPosition").buffer.data = verts;
      lm.geom.indexBuffer.data = new Uint32Array(idx);
      const u = lm.u as Record<string, unknown>;
      u.uCenter = new Float32Array([src.x, src.y]);
      u.uRadius = src.radius;
      u.uLightColor = colorVec(src.color);
      u.uIntensity = src.intensity;
      u.uFog = src.fog ? fog : 0;
      u.uMinB = src.nightVision ? 0 : NIGHTVISION_BRIGHTNESS;
      u.uFlat = src.nightVision ? 1 : 0;
    });
  }

  private makeLightMesh(): LightMesh {
    const geom = new Geometry({ attributes: { aPosition: { buffer: new Float32Array(6), format: "float32x2" } }, indexBuffer: new Uint32Array([0, 1, 2]) });
    const shader = Shader.from({
      gl: { vertex: LIGHT_VERT, fragment: LIGHT_FRAG },
      resources: {
        lightUniforms: {
          uCenter: { value: new Float32Array(2), type: "vec2<f32>" },
          uRadius: { value: 1, type: "f32" },
          uLightColor: { value: new Float32Array(3), type: "vec3<f32>" },
          uIntensity: { value: 1, type: "f32" },
          uFog: { value: 0, type: "f32" },
          uMinB: { value: NIGHTVISION_BRIGHTNESS, type: "f32" },
          uFlat: { value: 0, type: "f32" },
        },
      },
    });
    const mesh = new Mesh({ geometry: geom, shader });
    mesh.blendMode = "add";
    this.lightLayer.addChild(mesh);
    return { mesh, geom, u: shader.resources.lightUniforms.uniforms };
  }

  // ======================= інтерфейс персонажа =======================

  private drawCharacterUI(run: Run, world: World, ppt: number, fade: number): void {
    const g = this.uiG;
    g.clear();
    this.hintSprite.visible = false;
    if (run.state !== "playing" || world.blackout > 0 || fade > 0.5) return;
    const p = world.player;
    const px = TILE / ppt; // світових пікселів на CSS-піксель
    const barW = ACTION_BAR_WIDTH * TILE;
    const barH = 3 * px;
    const bx = p.x * TILE - barW / 2;
    const by = (p.y - ACTION_BAR_OFFSET) * TILE;

    // Підсвічування інтерактивних об'єктів у досяжності (§7.3.4.2): інтерфейс, діє й у темряві; ціль E — яскравіше.
    if (!world.actions.busy) {
      const near = world.interactables();
      const e = world.actions.resolveInteract();
      const HL = 0xd8d4c8;
      for (const fi of near.items) {
        const isTarget = e.target === fi;
        g.circle(fi.x * TILE, fi.y * TILE, TILE * 0.26).stroke({ width: (isTarget ? 1.6 : 1.1) * px, color: HL, alpha: isTarget ? 0.6 : 0.22 });
      }
      const inset = TILE * 0.06;
      const tileRect = (tx: number, ty: number, isTarget: boolean) =>
        g.rect(tx * TILE + inset, ty * TILE + inset, TILE - 2 * inset, TILE - 2 * inset).stroke({ width: (isTarget ? 1.6 : 1.1) * px, color: HL, alpha: isTarget ? 0.6 : 0.22 });
      for (const d of near.doors) tileRect(d.tx, d.ty, e.door === d);
      if (near.exit) tileRect(world.exitTile.tx, world.exitTile.ty, e.exit);
    }

    // Прогрес-бар дії або смужка знерухомлення (§7.3.1.2, §8).
    const bar = world.actions.barView;
    if (p.stun) {
      const left = Math.max(0, 1 - p.stun.elapsed / p.stun.duration);
      const jerk = world.shake > 0 ? (Math.random() - 0.5) * 2 * px : 0;
      g.rect(bx + jerk, by, barW, barH).fill({ color: 0x9b9b9b, alpha: 0.2 });
      g.rect(bx + jerk, by, barW * left, barH).fill({ color: 0xe8e4dc, alpha: 0.55 });
    } else if (p.struggle !== null) {
      const k = p.struggle / 5;
      g.rect(bx, by, barW, barH).fill({ color: 0x9b9b9b, alpha: 0.2 });
      g.rect(bx, by, barW * (1 - k), barH).fill({ color: 0xe8e4dc, alpha: 0.55 });
    } else if (bar) {
      const total = bar.stages.reduce((a, b) => a + b, 0);
      let fill = bar.elapsed / total;
      let color = 0xd9d6cf;
      let alpha = 0.5;
      let dx = 0;
      if (bar.phase === "cancel") fill *= Math.max(0, 1 - bar.phaseTime / 0.15);
      if (bar.phase === "fail") {
        fill = 1;
        color = 0xa83a32;
        alpha = 0.45 + 0.35 * Math.abs(Math.sin(bar.phaseTime * 30));
        dx = Math.sin(bar.phaseTime * 70) * 1.5 * px;
      }
      g.rect(bx + dx, by, barW, barH).fill({ color: 0x8a8a8a, alpha: 0.18 });
      g.rect(bx + dx, by, barW * Math.min(1, fill), barH).fill({ color, alpha });
      let acc = 0;
      for (let i = 0; i < bar.stages.length - 1; i++) {
        acc += bar.stages[i];
        const x = bx + dx + (barW * acc) / total;
        g.rect(x - 0.5 * px, by - 1.5 * px, px, barH + 3 * px).fill({ color: 0xd9d6cf, alpha: 0.5 });
      }
    }

    // Витривалість під персонажем (§8.2): лише коли запас неповний.
    if (p.stamina < 0.999) {
      const sy = (p.y + ACTION_BAR_OFFSET) * TILE;
      const color = p.exhausted ? 0xa04038 : 0xcfcbc2;
      g.rect(bx, sy, barW, barH * 0.8).fill({ color: 0x8a8a8a, alpha: 0.15 });
      g.rect(bx, sy, barW * p.stamina, barH * 0.8).fill({ color, alpha: p.exhausted ? 0.55 : 0.4 });
      if (p.exhausted) g.rect(bx + barW * STAMINA_EXHAUST_RECOVER - 0.5 * px, sy - 1.5 * px, px, barH + 2 * px).fill({ color: 0xcfcbc2, alpha: 0.6 });
    }

    // Приціл (§8.1): тьмяна мітка 2–3 пікселі.
    g.circle((p.x + p.aimX) * TILE, (p.y + p.aimY) * TILE, 1.5 * px).fill({ color: 0xd0ccc0, alpha: 0.45 });

    // Іконка-підказка клавіші (§11.2.1): тьмяна, пульсує, без тексту.
    if (world.hint) {
      const tex = this.keyIcon(world.hint);
      this.hintSprite.texture = tex;
      this.hintSprite.visible = true;
      this.hintSprite.position.set(p.x * TILE, by - 5 * px);
      const sc = (px * 26) / tex.height;
      this.hintSprite.scale.set(sc);
      this.hintSprite.alpha = 0.35 + 0.2 * Math.sin(this.time * 3);
    }
  }

  /** Іконка клавіші — зображення клавіші з латинським позначенням (§1.3, §8). */
  private keyIcon(key: string): Texture {
    let t = this.keyIcons.get(key);
    if (t) return t;
    const w = key === "Space" ? 150 : 64;
    const h = 64;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "rgba(230,226,215,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 10);
    ctx.stroke();
    ctx.fillStyle = "rgba(230,226,215,0.95)";
    if (key === "Space") {
      ctx.fillRect(w / 2 - 34, h - 22, 68, 5);
      ctx.fillRect(w / 2 - 34, h - 30, 5, 13);
      ctx.fillRect(w / 2 + 29, h - 30, 5, 13);
    } else {
      ctx.font = "bold 36px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(key, w / 2, h / 2 + 2);
    }
    t = Texture.from(c);
    this.keyIcons.set(key, t);
    return t;
  }

  // ======================= екранні ефекти =======================

  private drawOverlay(run: Run, world: World, settings: Settings): void {
    const g = this.overlay;
    g.clear();
    const x0 = this.vpX;
    const y0 = this.vpY;
    const S = this.S;
    const edge = (angle: number, color: number, alpha: number) => {
      // Світіння по краю вікна з боку кута.
      const cx = x0 + S / 2 + Math.cos(angle) * S * 0.5;
      const cy = y0 + S / 2 + Math.sin(angle) * S * 0.5;
      for (let i = 0; i < 6; i++) g.circle(cx, cy, S * (0.1 + i * 0.05)).fill({ color, alpha: (alpha / 6) * (1 - i / 7) });
    };
    // Накладка павутини під час знерухомлення (§8) і боротьби при пробудженні.
    const p = world.player;
    if ((p.stun || p.struggle !== null) && world.blackout <= 0) {
      const a = p.stun ? 0.35 : 0.25;
      for (let i = 0; i < 14; i++) {
        const t = i / 14;
        const ang = t * Math.PI * 2;
        const r0 = S * 0.72;
        const r1 = S * 0.36;
        g.moveTo(x0 + S / 2 + Math.cos(ang) * r0, y0 + S / 2 + Math.sin(ang) * r0).lineTo(x0 + S / 2 + Math.cos(ang + 0.3) * r1, y0 + S / 2 + Math.sin(ang + 0.3) * r1);
      }
      g.stroke({ width: 1.5, color: 0xe8e6dc, alpha: a });
    }
    // Теплий спалах по краях при підбиранні протиотрути (§10.1).
    if (world.antidoteFlash > 0) {
      const a = world.antidoteFlash / 1.2;
      for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) edge(ang, 0xffb060, 0.35 * a);
    }
    // Дублювання звуків картинкою (§14.5).
    if (settings.visualAudioCues && run.state === "playing") {
      for (const cue of this.edgeCues) edge(cue.angle, cue.cry ? 0xff5040 : 0xbfc8d0, cue.cry ? 0.6 * cue.intensity : 0.18 * cue.intensity);
    }
    // Смерть: екран заливає павутина й темрява (§9.5).
    if (run.state === "dying" || run.state === "dead") {
      const k = Math.max(0, Math.min(1, (run.endTimer - 0.15) / 1.0));
      for (let i = 0; i < 40 * k; i++) {
        const a1 = (i * 2.399) % (Math.PI * 2);
        const a2 = a1 + 1.1 + (i % 5) * 0.2;
        g.moveTo(x0 + S / 2 + Math.cos(a1) * S * 0.7, y0 + S / 2 + Math.sin(a1) * S * 0.7).lineTo(x0 + S / 2 + Math.cos(a2) * S * 0.2 * (1 - k), y0 + S / 2 + Math.sin(a2) * S * 0.2 * (1 - k));
      }
      g.stroke({ width: 2, color: 0xdedbd0, alpha: 0.5 * k });
    }
  }

  get visionFrame() {
    return this.lighting.frame;
  }
}

function nearestSpider(world: World) {
  let best = null;
  let bd = Infinity;
  for (const s of world.spiders) {
    const d = Math.hypot(s.x - world.player.x, s.y - world.player.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}
