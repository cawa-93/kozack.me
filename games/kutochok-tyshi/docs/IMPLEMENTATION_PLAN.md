# Incremental implementation plan

Do not ask Codex to implement the entire game in one task. Complete and verify one phase at a time.

## Phase 0 — Dependency and navigation spike

Goal: prove the chosen library can support the required shared weighted field.

Work:

- Initialize a temporary minimal Phaser 4 + TypeScript + Vite project or use a small isolated spike directory.
- Verify current package compatibility from primary documentation and installed TypeScript types.
- Create a small grid with a core and a wall.
- Run an all-cells weighted search for two navigation profiles.
- Copy accumulated costs into project-owned typed arrays.
- Derive and render direction arrows.
- Remove the wall and rebuild.

Acceptance:

- Two profiles produce visibly different choices.
- No per-unit path request is used.
- Production build and type-check pass.
- Findings are documented before scaffolding the full architecture.

## Phase 1 — Project skeleton and debug grid

Goal: establish maintainable project boundaries.

Work:

- Scaffold Phaser/Vite/TypeScript strict project.
- Add Vitest, linting, and type-check scripts.
- Implement `GridModel`, snapshots, points, and cell layers.
- Render the orthogonal grid, introvert/core, spawn cells, and one fixed-width
  connected book-wall autotile set. Wizard-cat reinforcement changes logical
  HP but not wall width.
- Add debug controls to place/remove walls outside active levels.

Acceptance:

- Grid/domain tests pass without starting Phaser.
- Browser renders the correct logical grid.
- Build succeeds.

## Phase 2 — Shared flow-field service

Goal: create production-shaped fields for all profiles.

Work:

- Add `NavigationProfile` definitions.
- Implement library adapter and `FlowFieldService`.
- Build `Float64Array` route-score maps and `Uint8Array` direction maps.
- Add deterministic tie-breaking.
- Add an overlay to inspect arrows, costs, revision, and rebuild count.
- Add the navigation tests listed in `NAVIGATION_FLOW_FIELD.md`.

Acceptance:

- Fast/weak and slow/strong profiles make different wall decisions.
- The pathfinder invocation counter equals the number of fields built, not the number of units.

## Phase 3 — Large-scale enemy movement

Goal: prove many enemies can follow shared fields.

Work:

- Implement enemy state and view separation; present enemy types as distinct
  social visitors without putting visual identity into navigation profiles.
- Spawn enemies at multiple border cells.
- On each cell boundary, read one direction byte from the shared field.
- Interpolate sprites between cells.
- Add a benchmark/debug scene with at least 1,000 active enemies.

Acceptance:

- Solver count does not increase as enemies move or spawn.
- Units spawned on different reachable cells all move toward the core.
- Core-entry event is emitted correctly.

## Phase 4 — Wall attack and field invalidation

Goal: complete the main maze-versus-breakthrough mechanic.

Work:

- Detect a wall in the selected next cell.
- Enter `attacking-wall` state from the adjacent cell.
- Implement attack timing, wall HP, and `WallAttackersIndex`.
- On destruction, remove the wall, leave persistent nonblocking damaged-book debris,
  increment grid revision, build a complete new field set with the debris's 2x
  movement-time cost, atomically swap it, and resume affected attackers.
- Apply the same debris multiplier to runtime traversal so enemies cross it at
  half ordinary speed. A replacement wall clears debris in its build
  transaction; wall sales never create it.

Acceptance:

- Multiple units can damage the same wall.
- `wall:destroyed` fires once.
- Fields rebuild once per destruction event.
- Moving units switch naturally at their next cell boundary.
- Attackers of the destroyed wall resume.
- Debris is traversable, persists until rebuilt, and costs exactly twice
  ordinary ground in both the shared field and actual movement.

## Phase 5 — Towers, endless levels, resources, and survival loop

Goal: turn the navigation prototype into a playable minimal game.

Work:

- Wizard-cat tower placement only on book walls.
- A kitten support tower unlocked before level 16: cost 110, no damage, fixed
  8-second meow, ten-cell radius, two-second non-additive freeze, dedicated
  event/audio/area wave, a bounded staggered sample of heart bubbles, and one
  presentation-only random cue from a typed bank of thirteen extracted meows.
- A traversable `Sheer Heart Attack` mine unlocked before level 21: cost 300,
  any in-bounds non-wall cell, one-second fuse, one-shot removal of all active
  enemies, pending-spawn preservation, and 10 cardinal wall damage with at
  most one batched navigation rebuild.
- Basic, rapid, and heavy tower targeting, enemy HP, projectiles, and layered
  heavy splash damage. Prototype balance is basic 10 at 1/s, rapid 6 at 2.5/s,
  and heavy 60 at 0.2/s plus 20 damage to every enemy in the target cell and
  15 to every enemy in its four cardinal neighboring cells. The primary target
  receives direct and target-cell damage; area damage never affects walls.
- Heavy targeting groups eligible enemies by logical cell and selects maximum
  occupancy first, then Manhattan distance to the core, squared tower-to-cell
  distance, and row-major cell index. The primary is the first live occupant in
  stable spawn/collection order. Render a clear target-cell wave, outline the
  complete four-cardinal area, and drive victim flashes from authoritative
  damage-zone events.
- Supporting-wall logical reinforcement and wizard-cat destruction with the
  wall: a 100-HP base wall becomes 150 HP after any cat is placed, while tower
  occupancy must not change the book-wall autotile width.
- One binary tower-exposure snapshot per shared navigation rebuild. Mark exact
  five-cell Euclidean ranges for basic, rapid, and heavy towers and the exact
  ten-cell range for Kitten; overlaps do not stack and mines never contribute.
  Minimize the number of exposed destinations first, then physical movement,
  debris, and wall-break time, then the deterministic `Up`, `Right`, `Down`,
  `Left` direction order. Encode each finite Graphlib edge as
  `exposure + (physicalEnterCost / maxFinitePhysicalEnterCost) /
  (4 * cellCount)` and store accumulated scores in `Float64Array`. A
  zero-exposure route must beat an exposed shortcut even through ten walls;
  when every route is exposed, fewer exposed cells must win. Do not change
  runtime speed, terrain multipliers, wall-break duration, or
  one-field-per-profile ownership. Candidate placement must include the
  proposed tower before route validation publishes its fields.
- A persistent whole-coin balance: 20 coins before level 1, then one reward on
  entry to every subsequent build phase derived from the just-completed
  immutable level plan. Credit `0.1` coin per weak visitor, `0.2` per fast
  visitor, `0.5` per strong visitor, add 10, clamp the weighted result to
  20..200 coins, and round it to the nearest whole coin with a positive exact
  half rounded upward. Credits safely saturate in an extreme endless run and
  cannot be changed or duplicated by previews, the prepared next plan, or
  repeated events.
- Smooth late income: levels 1 through 11 use the rounded bounded normalized
  reward directly; from completed level 12 onward, an increase is capped to 20
  coins above the preceding level's normalized reward. Apply any temporary
  zero/double payout only afterward, store the normalized result as the next
  baseline, keep every value integral, and never compare against the accumulated
  balance.
- Transactional construction costs of 1 coin per wall, 5/8/11/110 coins for
  basic/rapid/heavy/kitten towers, and 300 for the mine. Spend only after successful placement and never
  permit a negative balance.
- Build-phase Sell supports both a one-cell click and an inclusive rectangular
  drag. It removes selected walls with their supporting towers and undetonated
  mines, grants full refunds, and publishes at most one navigation rebuild for
  the complete gesture. Combat destruction provides no refund.
- A deterministic endless level generator: weak visitors start at 10 on level
  1, fast visitors at 5 on level 4, and strong visitors at 1 on level 10. Each
  unlocked type follows `ceil(previousCount * 1.4)` through level 15 and
  `ceil(previousCount * 1.15)` through level 19. Beginning with the transition
  into level 20, use bounded type-specific recurrence: weak
  `min(2500, ceil(previous * 1.02))`, fast
  `min(1250, ceil(previous * 1.05))`, and strong
  `min(1500, ceil(previous * 1.18))`. Treat the 5,250 total cap as a gameplay
  and performance contract: late levels become stronger rather than longer.
- Special replacement plans on absolute levels 15 and 77: exactly 100 Roaches
  and no ordinary groups. Each Roach stays at 75 HP and 7.2 cells per second,
  uses a fixed 500 ms spawn interval, ignores enemy count/stat reduction
  bonuses, instantly breaks any wall, heals the social battery by one on
  arrival, and remains targetable by every cat damage zone. Reward it at the
  weak visitor's 0.1-coin weight. Count modifiers, including Twitter Fight,
  never change 100; temporary payout modifiers may still zero or double its
  normalized reward, and blanket protection never suppresses its healing.
- Deterministic proportional interleaving of compact enemy-group counters so
  weak, fast, and strong visitors are spread across the level without changing
  their totals or flattening exponential counts into a per-enemy queue.
- Per-level spawn cadence: subtract 50 ms per level from 500 ms through the
  50 ms level-10 interval, then use 40/30/20 ms on levels 11/12/13 and the
  10 ms interval on ordinary levels 14 through 19. Use 8/6/4 ms on levels
  20/21/22 and the 2 ms floor from ordinary level 23 onward. The floor caps the
  scheduler at 500 visitors per simulation second; special Roach levels 15 and
  77 override it with their fixed 500 ms interval.
- Per-level effective enemy definitions: below level 20, level-1 HP 15/10/40
  gains +1 every two levels, doubled level-1 speed `2.4`/`5.6`/`4 / 3` gains +1
  every three levels, and damage remains 4/2/8. From level 20 let `n = L - 19`:
  HP is `round((baseMaxHp + 9) * (8 + n) / 8)`, movement is
  `(doubledBaseSpeed + 6) * (20 + n) / 20`, and damage is
  `round(baseDamage * (4 + n) / 4)`. Apply damage bonuses once to the wall
  value. Derive `coreBase = max(1, floor(scaledDamage / 4))` from the same
  scaled integer and apply the damage bonus once to that core value.
- Immutable level-specific navigation profiles with stable type IDs. Configure
  and rebuild the shared profile set once at the level boundary; never run
  scaling or pathfinding per enemy.
- One fixed bottom-center spawn for levels 1 through 4. Starting on level 5,
  unique deterministic pseudo-random edge spawns are prepared before the build
  phase: two on level 5, one additional point every five levels, capped at 100.
- Tower/mine unlock enforcement in both simulation and UI: basic before level 1,
  rapid before level 4, heavy before level 10, kitten before level 16, and mine
  before level 21. UI controls for locked
  towers are entirely absent until their unlock build phase.
- Manual build phases with unlimited time before level 1 and between levels,
  with no countdown or auto-start. Arena structures and social-battery HP
  persist; successful completion restores every standing wall to maximum HP in
  one grid revision/shared navigation rebuild while leaving debris intact.
- A run-scoped bonus choice after every third completed level, before any read
  or cache of the next plan. Generate one immutable run-seeded offer without
  duplicates, start with two options, support Skip, and let Wider Thinking add
  up to nine later choices so all eleven other bonuses can fit.
- Implement the twelve bonus effects and logical caps from the product spec:
  bounded healing/max battery, multiplicative visitor slow/weakness/count
  reduction, additive cat damage/rate scaling, current/future wall HP,
  integer dynamic rewards, unique post-level-6 blanket protection, and the
  repeatable Twitter Fight next-level trade-off. Keep
  movement/damage in one level-shared definition set and keep reduced counts
  derived from canonical plans.
- Keep permanent acquisition counts separate from one pending/active non-
  stacking next-level modifier. A successful Start activates the queued type;
  one level consumes it. Blanket preserves positive battery, forces the 0%
  heroine pose while pending/active, zeroes ordinary core-arrival damage, and
  forfeits that level's reward without changing completion, score, wall restore,
  or bonus cadence. Twitter applies after Burn Bridges as weak `ceil(3n/2)`,
  fast `2n`, and strong `3n`, publishes those counts to plan/HUD/scheduler, and
  doubles the post-Social-Debt/rounding/smoothing reward exactly. The normalized
  pre-zero/double reward remains the next smoothing baseline.
- A separate illustrated cozy `BonusScene` that pauses `GameScene`, supports
  2..11 responsive cards and one Skip button, prevents double resolution, and
  resumes the same run after an accepted choice. Its qualitative descriptions
  hide tuning percentages and caps except for exact social-battery gains, and
  it displays `В наявності: N` only for already collected bonuses.
- Build phase, resources, core HP, and defeat; show coins with status at the
  top-left and expose core HP in the UI as social-battery charge. Below level
  20 without bonuses core damage is 1/1/2 for weak/fast/strong; late core
  damage follows the effective level-scaled damage rather than the static base.
- Endless progression after every completion with no finite-level victory in
  the default mode.
- Cartoon-comic HUD with status at top-left, construction at bottom-left, and
  one fixed bottom-right action dock that swaps the mint Start action for
  one-row 2x/4x/10x speed controls.
- Dedicated illustrated start menu with title and one Start action.
- Icon-first gameplay controls with no player-facing navigation telemetry and a
  stable full-plan visitor total rather than an active-sprite count.
- Compact horizontal build cards ordered Sell, wall, then unlocked cats; large
  object art and price footers stay visible while names/descriptions move to
  hover tooltips. All primary HUD surfaces share rounded cozy styling.
- A completed-level final score, namespaced localStorage High Score, and a
  strictly-better `NEW RECORD` badge.
- Separate level Start control, selected-icon toggling, and no Done button.

Acceptance:

- Levels 1 through 10 demonstrate enemy and tower unlocks at the exact build
  boundaries, then level 11 can still be prepared and started manually.
- Generated counts follow the recurrence exactly, level spawn previews remain
  stable across repeated reads and Start, level 16 switches from 1.4 to 1.15,
  and the level-19-to-20 transition produces exactly 2,110 weak, 405 fast, and
  24 strong visitors from the previous 2,068/385/20 groups. Repeated late
  transitions never exceed the 2,500/1,250/1,500 per-type caps, and no level
  starts automatically.
- Multi-type levels emit exact configured quotas in a repeatable mixed order;
  fast and strong visitors appear before the weak group is exhausted, pending
  counts remain exact, and huge groups are never expanded into an enemy array.
- The first spawn remains immediate; later spawns use 500/450/400 ms on levels
  1/2/3, reach 50 ms on level 10, step through 40/30/20 ms on levels 11/12/13,
  remain at 10 ms on ordinary levels 14 through 19, use 8/6/4 ms on levels
  20/21/22, and remain at the 2 ms floor from ordinary level 23 through the
  maximum safe level number. Special Roach levels 15 and 77 instead use 500 ms.
- Levels 1 and 2 use exact base HP, level 3 applies the first `+1` HP bonus,
  and level 4 applies the first speed bonus. Level 19 retains the old HP,
  movement, and damage curves; level 20 switches to the formulas based on
  `n = 1`, including nearest-integer HP/damage. Extreme-level integer stats
  saturate safely, and all units of each type read one shared level-specific
  field. A late wall hit, its navigation break cost, and its derived core
  damage all use the same level-scaled source, with bonuses applied once to
  each resolved wall/core value.
- Spawn points remain deterministic and unique, continue to add one every five
  levels, may grow past the previous count of 20, and never exceed 100 or the
  available border-cell set.
- Levels 15 and 77 each preview, spawn, and resolve exactly 100 Roaches with no
  weak/fast/strong visitors. Their HP, speed, count, and healing stay unchanged
  at maximum relevant bonus stacks; adjacent levels retain ordinary recurrence.
  First wall contact destroys even a reinforced wall and its cat, leaves one
  debris marker, emits one wall destruction, and rebuilds the shared fields
  once. Direct and heavy splash shots can still damage and kill the Roach.
- A kitten pulse damages nobody, freezes moving and wall-attacking visitors for
  exactly two simulation seconds, emits no `tower-shot`, and does not change a
  grid revision or solver invocation count.
- On equal forks and a controlled half-arena fixture, every profile chooses a
  zero-exposure branch even when it must break ten walls. If all alternatives
  are exposed, one exposed destination beats two; equal exposure counts select
  the lower physical movement/debris/wall-break time before deterministic
  direction order. All four tower types use their configured Euclidean radii,
  overlapping ranges remain one binary value, and mine-only changes leave the
  field untouched. Building a tower publishes candidate fields that already
  include its exposure; removing its supporting wall removes exposure in the
  same single rebuild. Exposed and unexposed ordinary cells retain identical
  authoritative traversal duration.
- A mine triggers exactly once on authoritative cell occupancy, remains for
  999 ms, detonates on the next millisecond, removes only active visitors,
  preserves pending spawns, damages cardinal but not diagonal walls, consumes
  itself, and performs no navigation build unless a wall is destroyed.
- A heavy cat selects the densest in-range logical cell with deterministic
  Manhattan-core-distance, squared-tower-distance, and row-major tie-breaks.
  Its shot deals 60 direct plus 20 same-cell damage to the stable-order primary
  target, 20 to every other target-cell enemy, and 15 to enemies in each
  cardinal neighboring cell. An
  adjacent wall takes no damage, and the target wave/area outline plus victim
  flashes stay clear at 1x, 2x, 4x, and 10x.
- Failed builds spend nothing, successful builds cannot overdraw the balance,
  rounded post-level income is credited once, level-12-and-later upward reward
  normalization changes never exceed 20 coins, temporary zero/double payouts do
  not alter the following baseline, the balance always remains a whole number,
  player sales refund full construction cost, and combat destruction refunds
  zero while leaving traversable debris.
- A Sell click remains a one-cell transaction. A reverse-direction rectangle
  previews every included cell, removes mixed walls/towers/mines on release,
  refunds duplicate cells only once, and rebuilds shared navigation exactly
  once when any number of walls was removed. Camera transforms and HUD-covered
  endpoints cannot make the committed bounds diverge from the visible preview.
- Rapid and heavy controls do not exist before their level-4 and level-10
  build phases, then appear with their correct prices.
- Before entering gameplay, the start menu fills the 1080x1080 canvas and its
  icon-only Play button, Enter, and Space all start the same game scene. The
  gameplay HUD never displays pathfinding revision/call data, and its visitor
  value remains equal to the current level plan while units spawn and resolve.
- Build cards stay equal and contiguous at every unlock boundary, Sell remains
  first, one-, two-, and three-digit price labels stay centered without touching
  their coin icon, and every visible card exposes its name and short description
  on hover.
- Start and speed modes reuse one action-dock silhouette with fourteen-pixel
  right/bottom margins. Starting a level swaps `ПОЧАТИ` for 2x/4x/10x without
  moving the dock, and the selected multiplier survives every non-terminal
  between-level transition.
  Defeat reports only fully completed levels, persists a strictly higher record,
  and never marks an equal score as `NEW RECORD`.
- The run continues until social-battery defeat without a completion victory.
- Levels 3, 6, and 9 enter bonus status exactly once before levels 4, 7, and 10
  are prepared. Repeated reads never reroll, wrong/stale choices mutate
  nothing, and Skip resumes build with unchanged stacks.
- Every bonus formula is covered at its logical cap: visitor speed stays
  positive, wall/core damage stays at least 1, each canonical enemy group stays
  at least 1, coins stay integral, maximum battery/wall HP remain bounded,
  and Cat Treats scales all three heavy damage zones and cadence.
- The twelve-entry catalog exposes Twitter Fight from the first offer, keeps
  Blanket unique and locked until six completions, caps Wider Thinking at nine,
  and lays out every supported 2..11-card offer inside the canvas. Lifetime
  counts remain in cards and pause inventory after a temporary effect is spent.
- Blanket remains pending across a rejected Start, forces the 0% pose without
  changing positive HP, prevents ordinary core damage/defeat for exactly one
  successfully started level, grants exactly zero coins despite minimum/Social
  Debt, and still completes score, wall restoration, and bonus cadence. Its
  normalized reward becomes the next smoothing baseline and the following level
  is unprotected.
- Twitter applies after Burn Bridges with exact ceiling and safe saturation,
  changes the actual plan/HUD/spawn quotas, leaves fixed Roach count unchanged,
  and grants exactly twice the normalized reward after Social Debt, rounding,
  bounds, and smoothing. It expires after one level, never stacks in active
  strength, and its doubled grant does not alter the next smoothing baseline.

## Phase 6 — Profiling and polish

Goal: optimize measured bottlenecks only.

Completed development-diagnostics contract:

- Vite development mode accepts `?devLevel=N` for any positive safe integer
  and skips the title screen directly to the unlimited build phase before that
  absolute level number. The wave never starts automatically.
- A compact fixed DEV picker rewrites the same query and reloads the run, while
  automated browser checks navigate directly to URLs such as
  `http://127.0.0.1:5173/?devLevel=10`.
- Arbitrary-level starts move the shared level cursor directly instead of
  simulating skipped levels. They prepare the selected level's plan, spawn
  points, enemy scaling, navigation profiles, and tower unlocks exactly once.
- Every diagnostic launch begins with a pristine arena, full base social
  battery, the ordinary 20 coins plus a 1,000-coin diagnostic bonus, no bonus
  stacks, no synthesized rewards, and a zero completed-level score. Completing
  level `N` advances that score by one while reward and bonus cadence continue
  to use the absolute level number.
- Every Vite development launch initializes both game-scoped audio channels at
  zero volume. Pause-menu sliders can opt back into either channel; production
  defaults are unchanged.
- Development runs bypass High Score persistence. Both the query resolver and
  `GameScene` scene-data bootstrap are gated by `import.meta.env.DEV`, so a
  production build ignores the feature.

Development acceptance:

- `/?devLevel=4` opens build phase 4 with the rapid cat visible and no heavy
  cat; `/?devLevel=10` opens build phase 10 with all three enemy profiles,
  level-10 spawn points, and the heavy cat available.
- No visitor spawns before the normal Start action, skipped levels change no
  rewards or bonus stacks, the diagnostic balance starts at 1,020 coins, and
  completing the selected level records one actual completion rather than `N`
  completions.
- Opening Pause immediately after a development launch shows both audio sliders
  at zero; raising them restores sound for that local run.
- Invalid, duplicate, fractional, non-positive, or unsafe `devLevel` values do
  not activate the override, and the same URL has no effect in production.

Potential work:

- Spatial buckets for tower targeting.
- Object pools.
- Profiling and practical safeguards for the bounded late-level population,
  increasing HP/damage/movement, coin balance, 500-per-simulation-second spawn
  bursts, and run duration.
- Batched or instanced rendering where appropriate.
- Staggered visual updates.
- Better crowd offsets.
- Additional content data.

Completed visual-polish contract:

- smooth cartoon-comic 2D assets with a shallow pseudo-isometric look;
- a dedicated illustrated 1080x1080 start menu with title and Start control;
- an icon-only main-menu Play action, rounded cozy HUD surfaces, compact
  horizontal construction cards, and hover descriptions;
- one fixed scrapbook action dock fourteen pixels from the bottom-right edges:
  build mode shows a mint `ПОЧАТИ` chip without a level number, while active
  mode shows equal 2x/4x/10x chips in the same one-row geometry. The selected
  speed persists through build and bonus phases into the next level;
- a final completed-level score with local High Score persistence and record
  celebration;
- one full-arena `cozy-arena-floor-v2.png` background, one fixed-width
  book-stack autotile set sourced from macro-detail
  `book-stack-texture-v2.png` and rasterized internally at 4x, an
  introvert character with ratio-derived 100/75/50/25/0 social-battery poses,
  three social-visitor types, three attacking wizard cats, one harmless kitten,
  and one standalone mine. Healing reverses the pose progression and the 0%
  pose reuses the blanket-card illustration;
- a standalone `social-crowd-strong-v2.png` strong-visitor sprite that reads as
  one noisy crowd while continuing to represent exactly one domain enemy with
  unchanged behavior, navigation, HP ownership, and logical collision;
- Y-aware overlap, shadows, character bobbing, placement pops, cat casting,
  magical projectiles, heavy cell waves and cardinal collateral flashes, hit
  reactions, poofs, persistent damaged-book-debris terrain, and level banners;
- one presentation-only guest-dialogue scheduler: unscaled random 3-12-second
  intervals, 1.5-second moving bubbles, eight-view cap, ten-cell girl radius,
  kitten-heart conflict suppression, and exact 2000/1000/500/1 short phrase
  catalogs for weak/fast/strong/Roach visitors;
- type-aware visitor facing that accounts for the fast runner's intrinsically
  left-facing source art without changing simulation or navigation state;
- a canonical minimum-zoom camera home state that centers the complete arena,
  locks mouse and keyboard panning at 1x, and automatically restores that view
  whenever the player zooms back out from a movable zoom level;
- the presentation does not change orthogonal input, simulation, or shared
  flow-field behavior.

Completed heroine-state acceptance:

- Exact 75%, 50%, and 25% battery values select their matching visual bands;
  values just above each boundary select the healthier band.
- The ratio uses the mutable maximum after Social Hobby, and healing can move
  through 25% -> 50% -> 75% -> 100% without recreating the core view.
- Zero battery uses the blanket-card source, while every state preserves the
  existing core position, depth, and damage/healing animations.

Completed audio-polish contract:

- separate original looping WAV themes for the start menu and gameplay, with
  one active music owner and clean scene-to-scene replacement;
- distinct wizard-cat shot cues, social-battery damage reaction, defeat cue,
  and generic feedback for control hover/activation, successful placement,
  successful sale, invalid actions, and level start;
- browser-policy-compliant audio unlock after an eligible first interaction,
  without duplicate music while the audio context is suspended;
- one shared cat-fire mix: 150 ms aggregation batches select
  `heavy > basic > rapid`, the rolling budget admits at most six cues per
  real-time second, all shot keys share two voices, and the shot mix is reduced
  by approximately 7 dB;
- real-time rate limiting for other high-frequency presentation cues, without
  changing or coalescing authoritative simulation events;
- a typed `KITTEN_MEOW_KEYS` bank containing all thirteen WAV variants
  extracted from the user-supplied source. Each admitted kitten cue randomly
  selects one member after a shared 500 ms real-time family gate, and all
  variants share one voice while remaining outside the combat-shot budget;
- a cozy Escape pause popup implemented as a modal Phaser scene: gameplay
  updates and combat tweens pause, level music continues, and Resume or Escape
  returns to the same run;
- independent 0-100% music and all-effects sliders whose game-scoped values
  apply immediately and survive pause/resume for the current run;
- 2x/4x/10x speed affects simulation and combat visuals but never audio pitch or
  playback rate;
- reproducible original PCM WAV assets for every non-kitten cue and a typed
  runtime manifest. The procedural generator leaves the thirteen user-supplied
  derived kitten WAVs untouched; source metadata reports artist `344 Audio`
  and copyright year `2021`, without this plan asserting ownership or licensing
  beyond user-supplied provenance.

Audio acceptance:

- the menu and gameplay themes loop in their intended scenes and never overlap;
- every damaging wizard-cat type can supply its matching prioritized combat
  cue, while social-battery hits, defeat, actionable buttons, successful
  placement, and successful sale have audible feedback;
- every one of the thirteen kitten variants is reachable through the typed
  bank. Consecutive admitted meows choose from that bank without changing the
  authoritative `kitten-meowed` event; different variant keys cannot bypass
  the shared 500 ms cooldown or one-voice limit;
- a dense multi-cat volley produces at most one prioritized cue per completed
  150 ms batch, never exceeds six admitted shot cues in a rolling second or two
  simultaneous shot voices, and does not alter the number or order of combat
  events;
- held wall painting and dense combat remain intelligible under cue rate limits;
- the first user gesture unlocks pending audio in browsers that block autoplay;
- selecting 2x, 4x, or 10x does not pitch-shift music or effects;
- the effects slider and development-mode mute apply identically to every
  kitten variant;
- Escape opens only one pause popup, freezes the gameplay scene, and a second
  Escape or Resume restores the existing run while level music stays audible;
- moving either volume slider updates only its own channel, applies the new
  value immediately, and preserves it after closing and reopening the popup.
- beneath the sliders, the pause popup shows every collected bonus once as a
  small illustration with its quantity and omits every zero-stack bonus.
