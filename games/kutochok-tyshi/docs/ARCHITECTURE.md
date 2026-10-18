# Architecture

## Design goal

Keep the grid simulation testable without rendering while allowing Phaser to
handle scenes, sprites, input, animation, sound, and visual interpolation. The
cartoon-comic pseudo-isometric look is a Phaser presentation concern only; it
must not change the orthogonal grid, world-to-cell mapping, four-directional
movement, or navigation snapshots.

## Suggested source layout

```text
src/
├── dev/
│   ├── DevelopmentLaunch.ts
│   └── DevelopmentLauncher.ts
├── domain/
│   ├── bonuses.ts
│   ├── grid/
│   │   ├── GridModel.ts
│   │   ├── GridSnapshot.ts
│   │   ├── GridCell.ts
│   │   └── GridPoint.ts
│   ├── enemies/
│   │   ├── Enemy.ts
│   │   ├── EnemyDefinition.ts
│   │   ├── NavigationProfile.ts
│   │   └── EnemyState.ts
│   ├── structures/
│   │   ├── Mine.ts
│   │   ├── Wall.ts
│   │   ├── Tower.ts
│   │   └── Core.ts
│   └── events/
│       ├── GameEvents.ts
│       └── EventBus.ts
├── navigation/
│   ├── FlowField.ts
│   ├── FlowFieldService.ts
│   ├── FlowFieldSet.ts
│   ├── TraversalCost.ts
│   └── GraphlibFlowFieldService.ts
├── persistence/
│   └── HighScoreStore.ts
├── systems/
│   ├── EnemyMovementSystem.ts
│   ├── WallCombatSystem.ts
│   ├── WallAttackersIndex.ts
│   ├── CoreSystem.ts
│   ├── BuildSystem.ts
│   ├── GameSimulation.ts
│   ├── BonusMath.ts
│   ├── BonusSystem.ts
│   ├── LevelGenerator.ts
│   └── LevelSystem.ts
├── game/
│   ├── audio/
│   │   ├── AudioAssets.ts
│   │   ├── GameAudioDirector.ts
│   │   ├── GameAudio.ts
│   │   └── VolumeMath.ts
│   ├── scenes/
│   │   ├── MenuScene.ts
│   │   ├── GameScene.ts
│   │   ├── PauseScene.ts
│   │   └── BonusScene.ts
│   ├── ui/
│   │   ├── BonusChoiceLayout.ts
│   │   └── BonusPresentation.ts
│   ├── views/
│   │   ├── EnemyView.ts
│   │   ├── WallView.ts
│   │   ├── TowerView.ts
│   │   └── CoreView.ts
│   └── input/
│       └── BuildController.ts
├── data/
│   ├── enemies.ts
│   ├── mines.ts
│   ├── towers.ts
│   └── levels.ts
└── tests/
    ├── navigation/
    └── systems/
```

The exact tree may evolve, but preserve the dependency direction:

```text
domain <- navigation/systems <- Phaser game layer
```

Domain objects must not depend on Phaser.
A library-specific navigation adapter must return project-owned `FlowField` data. The current adapter depends on Graphlib, not Phaser.

## Main services

### GridModel

Owns cells, walls, damaged-book-debris terrain markers, core position, the active
level's spawn positions, and `revision`. Active spawn positions may be replaced
only at a build-phase boundary. They are copied into immutable snapshots so
construction and level start validation use the same prepared set. Changing
spawn positions alone does not change traversal costs and therefore does not
increment the topology revision or require a new flow-field search.

A newly placed wall has 100 current and maximum HP. Adding any tower increases
both values by 50, so an undamaged supporting wall has 150 HP; removing a tower
as part of selling its wall removes the complete cell rather than attempting to
reverse reinforcement on a surviving wall.

Successful level completion atomically restores only damaged standing walls to
each cell's authoritative maximum HP. If anything changed, the grid publishes
one revision and `GameSimulation` performs one shared navigation rebuild.
Destroyed cells and their debris markers are never restored.

Combat destruction replaces a wall with traversable damaged-book debris in the same
logical mutation. The debris persists until a successful wall build clears it;
selling never creates debris and does not restore debris previously cleared by
construction. A snapshot represents debris as terrain cost, not as a structure
or enemy blocker.

### FlowFieldService

```ts
interface FlowFieldService {
    build(
        snapshot: NavigationCostSnapshot,
        profile: NavigationProfile,
    ): FlowField;

    buildAll(
        snapshot: NavigationCostSnapshot,
        profiles: readonly NavigationProfile[],
    ): FlowFieldSet;
}
```

The implementation delegates the weighted all-cells search to
`@dagrejs/graphlib`. Project code builds forward edges, asks Graphlib to
traverse incoming edges from the core, and copies the result into project-owned
typed arrays.

`GameSimulation` assembles one immutable navigation-cost snapshot per rebuild
from the `GridModel` snapshot and the complete candidate tower set. That
snapshot contains a binary tower-exposure array shared by every profile build.
Basic, rapid, and heavy towers mark cells in their exact five-cell Euclidean
radius; Kitten marks its exact ten-cell radius. Overlaps remain `1`, and mines
are excluded. For each profile build, the adapter calculates physical enter
costs, finds the maximum finite cost, and encodes every finite edge as:
`towerExposure + (physicalEnterCost / maxFinitePhysicalEnterCost) /
(4 * cellCount)`. Graphlib therefore minimizes exposed destination count first
and physical movement, debris, and wall-break time second. A zero-exposure
route always beats an exposed route even through ten walls; when every route
is exposed, fewer exposed cells win. Remaining equal-score directions use the
stable `Up`, `Right`, `Down`, `Left` order. Accumulated scores use
`Float64Array`. This solver-only priority is not a terrain multiplier or
authoritative duration.

### EnemyMovementSystem

- Reads shared flow fields.
- Makes one next-cell decision at cell boundaries.
- Starts wall attacks instead of entering occupied wall cells.
- Applies the destination terrain multiplier to authoritative traversal time;
  damaged-book debris halves effective movement speed while crossing that cell, in
  agreement with its 2x flow-field enter cost.
- Never applies tower exposure to movement speed or transition progress;
  enemies only read the route direction produced by that priority.
- Does not run pathfinding.

### WallCombatSystem

- Applies attack damage.
- Treats `instantWallBreak` as a first-contact transaction: emit one attack
  presentation event, apply the wall's full current HP, then reuse the ordinary
  tower removal, debris, attacker release, and one-rebuild destruction path.
- Emits `wall:destroyed` exactly once.
- Removes the wall from the grid.
- Coordinates with `WallAttackersIndex`.
- Removes a tower in the destroyed wall cell before navigation is rebuilt.
- Treats combat destruction as a loss: neither the wall's 1-coin cost nor an
  attached tower's price is credited back to the player.
- Leaves damaged-book debris in the destroyed wall cell and publishes one topology
  revision for the combined wall removal and terrain-cost change. It never
  exposes an intermediate ordinary-ground snapshot.

### Tower combat

- Tower state and enemy HP are authoritative simulation data, independent of
  Phaser images and health bars.
- Towers acquire targets by shared enemy state; they never run pathfinding.
- Cooldowns are simulation-time values and preserve fractional fire rates.
- Basic and rapid cats deal 10 damage at 1 shot per second and 6 damage at 2.5
  shots per second. Both retain closest-to-core targeting with deterministic
  distance and stable-ID tie-breaking.
- A heavy cat fires at 0.2 shots per second. It groups all in-range live
  enemies by logical cell, selects the cell with the greatest occupancy, then
  resolves equal density by Manhattan distance to the core, squared
  tower-to-cell distance, and row-major cell index. The primary target is the
  first live occupant in stable spawn/collection order. Target selection
  remains deterministic and does not perform pathfinding.
- A heavy shot snapshots the primary target cell and its four cardinal
  neighbors at fire time. It applies 60 direct plus 20 same-cell splash damage
  to the primary target, 20 splash to every other enemy in that cell, and 15
  damage to every enemy in each cardinal neighboring cell. These area layers
  operate only on enemies and never call wall-combat or structure-damage APIs.
- Heavy impacts emit the authoritative target cell and per-victim damage zone
  so Phaser can outline the five-cell area and flash actual victims without
  recomputing combat from visual sprite positions.
- Enemy death removes it from the active collection and notifies `LevelSystem`
  exactly like reaching the core.
- Tower availability is an authoritative simulation rule, not a Phaser-only
  button state. Basic, rapid, and heavy towers unlock for build phases before
  levels 1, 4, and 10 respectively. Placement APIs reject locked types; the
  Phaser layer omits their build controls entirely until those levels.
- Basic, rapid, and heavy placements cost 5, 8, and 11 coins respectively.
  Only an accepted placement spends its price.
- Kitten is a fourth `TowerType` with `behavior: charm`, unlock level 16, a
  ten-cell Euclidean radius, and no damage path. A meow scans the shared live
  enemy collection once, sets an orthogonal `stunRemainingMs` with `max`, and
  emits a dedicated event. Enemy movement consumes frozen simulation time
  before processing any leftover delta, so movement and wall attacks pause
  without replacing or restoring `EnemyState`. Its fixed 8 s / 2 s cadence is
  outside Cat Treats and the dense-shot audio budget.
- Every standing tower contributes its configured Euclidean radius to the
  binary shared tower-exposure snapshot. Contributions are static structure
  state, not cooldown, DPS, target, or Cat Treats state. A candidate tower is
  included before placement validation publishes fields; destroying or selling
  its supporting wall removes the tower before the one resulting rebuild.

### Mine layer

- Mines live in a separate `Map<string, Mine>` owned by `GameSimulation`.
  They are traversable, absent from `GridSnapshot`, and never create a flow
  field or a per-unit pathfinding request.
- Mines do not contribute tower exposure. A mine-only placement or sale does
  not invalidate shared navigation.
- Placement and sale are build-phase transactions. The literal mine placement
  contract accepts any in-bounds non-wall, non-mine cell and makes wall builds
  reject occupied mine cells.
- Authoritative spawn and cell-boundary commits call one O(1) mine lookup. A
  triggered mine advances its fuse only in simulation time.
- `Sheer Heart Attack` snapshots and batch-resolves all currently active
  enemies, leaves the spawn mixer's pending counters intact, then applies
  cardinal wall damage. Destroyed walls and dependent towers produce at most
  one navigation rebuild for the complete batch.

### NavigationCoordinator

Recommended orchestration role:

- listens for navigation-invalidating events;
- derives one binary tower-exposure snapshot per rebuild and reuses it for all
  profile fields;
- builds a new field set;
- atomically publishes it;
- reports unreachable required cells;
- resumes affected enemies.

### CoreSystem

- applies damage from `enemy:reached-core`;
- applies bounded healing from the distinct `enemy:healed-core` Roach arrival;
- emits `core:destroyed` when HP reaches zero;
- removes/recycles the enemy.
- exposes core HP as authoritative domain state; the Phaser HUD presents the
  same value as the introvert's social battery without duplicating it.
- derives ordinary core damage from the current level's scaled damage as
  `coreBase = max(1, floor(scaledDamage / 4))`, then applies enemy weakening
  once to `coreBase` with nearest-integer rounding and a minimum of 1. The
  result is stored in the shared effective definition and is not recalculated
  at arrival. Levels below 20 without bonuses still resolve to 1/1/2 for
  weak/fast/strong.
  Roach instead restores one point without entering the damage/audio path and
  cannot raise HP above the current maximum.
- while the one-level blanket protection flag is active, resolves every
  ordinary core arrival with zero damage. It preserves positive core HP, emits
  no core-damage feedback, and cannot enter the defeat branch; Roach still uses
  its distinct bounded-healing branch.

### LevelGenerator

- creates a deterministic `LevelPlan` from a positive level number;
- exposes the full visitor count by saturating-summing the plan's compact group
  counters. During a build phase the count belongs to the prepared next level;
  while spawning or active it remains fixed to the current level plan;
- starts weak visitors at 10 on level 1, fast visitors at 5 on level 4, and
  strong visitors at 1 on level 10;
- replaces the complete ordinary population on absolute levels 15 and 77 with
  one `{ enemyType: 'roach', count: 100 }` group. It does not calculate or
  retain ordinary groups for those two plans;
- advances each unlocked type independently with
  `ceil(previousCount * 1.4)` through level 15 and
  `ceil(previousCount * 1.15)` on levels 16 through 19. The transition into
  level 20 and every later ordinary transition instead uses a type-specific
  bounded curve: weak `min(2500, ceil(previous * 1.02))`, fast
  `min(1250, ceil(previous * 1.05))`, and strong
  `min(1500, ceil(previous * 1.18))`. The resulting ordinary population is
  bounded at 5,250 and special replacement plans never feed back into it;
- uses one bottom-center spawn on levels 1 through 4;
- from level 5, chooses all active spawn points as unique deterministic
  pseudo-random edge cells, with two points on level 5, one additional point
  every five levels, and a cap of 100;
- derives randomness from a stable run seed and level number so asking for a
  preview cannot consume or reroll another level's result.
- resolves one immutable set of effective enemy definitions for level `L`.
  Levels below 20 retain maximum HP
  `baseMaxHp + floor((L - 1) / 2)`, movement speed
  `doubledBaseSpeed + floor((L - 1) / 3)`, and base damage 4/2/8. For level 20
  and later, let `n = L - 19`: round HP from the level-19 baseline as
  `round((baseMaxHp + 9) * (8 + n) / 8)`, scale movement as
  `(doubledBaseSpeed + 6) * (20 + n) / 20`, and round damage as
  `round(baseDamage * (4 + n) / 4)`. Level-1 HP bases remain 15/10/40 and
  speed bases remain `2.4`, `5.6`, and `4 / 3` cells per second;
- applies between-level weakening once to the already level-scaled damage,
  keeps effective integer damage at least 1, and saturates integer HP/damage at
  `Number.MAX_SAFE_INTEGER` for extreme level numbers;
- keeps the Roach definition fixed at 75 HP and 7.2 cells per second with
  instant wall breaking and one-point healing. Level progression, Move,
  Earplugs, and Burn Bridges never modify those four values.
- constructs the effective compact groups in a fixed order: canonical ordinary
  recurrence, then Burn Bridges' exact reduction, then an armed Twitter Fight
  multiplier of `ceil(weak * 3/2)`, `fast * 2`, and `strong * 3`, with safe-
  integer saturation. It neither creates an absent group nor reapplies the
  ordinary progression caps. Roach replacement plans remain exactly one group
  of 100 regardless of either count modifier;

Every level-specific navigation profile keeps its type's stable ID and is
shared by every matching unit on that level. Because the speed value affects
route cost, entering a level with changed effective profiles configures the
coordinator once and prepares one new field per profile. It never produces a
profile or a pathfinding request per unit.

The generated plan is cached for the entire build phase. The previewed plan,
construction validation, Start command, and spawn scheduler must all consume
that same immutable object.

The late curve deliberately keeps population bounded while increasing HP,
damage, movement speed, strong-enemy share, and scheduler throughput. This is
the architectural expression of the stronger-not-longer goal: difficulty may
rise indefinitely without turning each level into an indefinitely growing
queue of weak presentation and simulation objects.

### LevelSystem

- owns the prepared next plan and the current `build`, `spawning`, or `active`
  phase of the endless run;
- starts a level only through an explicit `startNextLevel` command;
- emits no countdown and never advances from a build phase in `update`;
- returns its internal phase to build with unlimited time after every completed
  level. `GameSimulation` may hold the public run in `bonus` before requesting
  the next deterministic plan; the default mode never emits campaign victory;
- schedules directly from group counters with a deterministic proportional
  midpoint merge instead of flattening exponentially growing counts into an
  `EnemyType[]` queue. It preserves every group quota while distributing all
  unlocked visitor types across the complete spawn duration;
- compares normalized next positions exactly, uses a rotating deterministic
  tie priority, and retains only `O(group count)` cursor state;
- snapshots one cadence for the active level. Levels 1 through 10 use
  `campaignBaseInterval - 50 ms * (levelNumber - 1)`, producing 500 ms through
  50 ms. Levels 11, 12, and 13 use 40, 30, and 20 ms, and ordinary levels 14
  through 19 use 10 ms. Levels 20, 21, and 22 use 8, 6, and 4 ms;
  ordinary level 23 onward uses the 2 ms floor, capping throughput at 500
  visitors per simulation second. Roach replacement levels 15 and 77 override
  that curve with a fixed 500 ms interval. The first spawn remains immediate
  and later spawns consume the selected interval through the existing
  simulation delta, including the global game-speed multiplier;
- advances spawn points with a dedicated modulo cursor, independent of the
  saturating public level and campaign spawn ordinals;
- keeps arena, wall, tower, core, and coin state in `GameSimulation`, so
  replacing a level plan never resets persistent run state.

Its narrow `invalidateNextLevelPreparation` command clears only a lazily cached
build-phase plan. Bonus resolution calls it before reading the next definition,
so Burn Bridges can modify canonical counts without changing an already active
level or rerolling spawn points.

`GameSimulation.completedLevelCount` advances only when it accepts a real
`level-completed` event while the run is still active. If social-battery defeat
and the last enemy resolution happen in the same update, that failed level is
therefore not counted even if the scheduler has no remaining enemies.

### BonusSystem

`BonusSystem` owns only stack counts, offer eligibility, and the one pending
immutable offer. It does not mutate the grid, enemies, towers, core, or coins.
After every third successful completion, `GameSimulation` passes completed
level and battery state into `createOffer` before any next-plan read.

- offer ranking hashes one run seed, completed level, and bonus ID, then samples
  without replacement; repeated reads return the same object;
- a matching offer ID and one offered type, or `null` for Skip, resolves the
  offer exactly once;
- capped and currently meaningless healing choices are filtered;
- Wider Thinking changes only later offer widths and removes itself when all
  other eligible options already fit. Its cap is nine, allowing all eleven
  other catalog entries to fit;
- fewer than two eligible bonuses consumes the scheduled opportunity without
  creating an invalid UI offer.

After a valid resolution, `GameSimulation` applies the selected domain effect,
invalidates the lazy next-plan cache, and only then prepares level data and
enters public `build`.

`BonusSystem` stack counts are lifetime acquisition counts: they continue to
drive caps, card labels, and pause inventory after a one-level effect is spent.
`GameSimulation` separately owns one non-stacking next-level modifier with
pending and active phases. Selecting Hide Under a Blanket or Twitter Fight arms
the pending phase; only a successful Start promotes it to active. A rejected
Start leaves it pending. At the level-completion boundary it clears after enemy
resolution, score increment, and wall restoration; the already prepared payout
is then credited and the next bonus/build state is created. A terminal level
result consumes it with the run.
One offer resolves one type, so ordinary play can never arm both modifiers for
the same level. Hide Under a Blanket is unique with one lifetime acquisition;
Twitter Fight may be acquired at most twenty times, but every acquisition has
the same one-level strength and never stacks with a previous use.

All negative visitor modifiers compound. Burn Bridges transforms a freshly
generated canonical plan with exact integer ceiling arithmetic. Move and
Earplugs transform one immutable set of per-level enemy definitions and shared
navigation profiles. Cat Treats scales all damaging-tower damage zones and
divides their base attack intervals by the same additive multiplier; the
kitten's fixed support cadence is excluded. Thick Literature updates
all current walls in one grid revision and changes the future wall base.
Twitter Fight transforms the Burn-reduced compact groups before the immutable
plan/HUD snapshot and never changes profiles. Blanket protection changes only
core-arrival resolution and presentation; walls, towers, movement, and attacks
continue normally.

### Economy and build transactions

`GameSimulation` owns one authoritative non-negative coin balance for the
complete run. Values are represented internally as whole integer coins:

- initialize it to 20 before the level-1 build phase;
- when a completed level transitions into the next build phase, derive its
  normalized weighted reward from that just-completed immutable `LevelPlan`: one tenth per
  weak visitor, two tenths per fast visitor, five tenths per strong visitor,
  plus 10 coins;
- clamp the weighted result to the inclusive 20-to-200-coin range and then
  round it to the nearest whole coin, with a positive exact half rounded
  upward;
- when Social Debt was active at Start, multiply the whole weighted formula by
  `(10 + stacks) / 10`, use dynamic bounds `20 + 2 * stacks` and
  `200 + 20 * stacks`, and still return one whole integer. Burn Bridges'
  already-reduced immutable group counts are the counts used by this formula;
- grant that direct result for completed levels 1 through 11. Starting with
  level 12, cap an upward change to at most 20 coins over the normalized reward
  of the preceding completed level, while preserving the current
  integer bounds (20..200 without Social Debt, up to 40..400 at its cap).
  Reward smoothing compares consecutive normalized rewards, not the accumulated
  coin balance;
- after normalization, map the active one-level modifier to payout factor zero
  for Hide Under a Blanket, two for Twitter Fight, or one otherwise. Zero
  bypasses every minimum; doubling happens after Social Debt, rounding, bounds,
  and smoothing. Store the pre-factor normalized result as the next smoothing
  baseline, so neither zero nor doubling leaks into subsequent income;
- credit that resulting whole-coin payout once; previews, repeated updates, and failed
  Start commands cannot duplicate it, and the prepared next plan cannot affect
  the reward owned by the level that just completed;
- persist the balance through level plans and saturate the public coin balance
  at `Number.MAX_SAFE_INTEGER`;
- spend 1 coin for each successfully placed wall, each tower definition's
  5/8/11/110-coin price, or the mine's 300-coin price only after all placement
  and route checks pass;
- when a successful wall placement targets debris, clear that terrain marker
  and install the wall in the same transaction and topology revision;
- reject unaffordable construction before mutation, so the balance cannot
  become negative;
- on a successful build-phase sale, atomically refund 1 coin for every selected
  wall and the complete price of every attached tower, if present;
- refund every selected undetonated mine's complete 300-coin price without
  changing the grid revision;
- treat one rectangular Sell gesture as one transaction: deduplicate cells,
  emit the existing per-object events, and publish one final shared navigation
  field set if at least one wall was removed;
- never call the refund path for combat destruction.

Construction, sale, reinforcement, coin mutation, and navigation publication
form one simulation transaction. Phaser controls display outcomes but never
own or independently change the balance.

### Run score persistence

`HighScoreStore` is a small Phaser-independent browser persistence adapter. It
reads and writes one namespaced `localStorage` key, validates non-negative safe
integer values, treats missing/corrupt/unavailable storage as zero, and writes
only when the completed-level score is strictly greater than the stored value.
The game scene consumes its result to render the final score, best score, and
optional `NEW RECORD` badge; persistence never influences simulation outcomes.
Runs created with the development level override bypass `updateHighScore`, so
skipping directly to a late level cannot pollute normal player progress.

### Development launch bootstrap

`DevelopmentLaunch` strictly parses one `devLevel` query value as a positive
safe integer. `DevelopmentLauncher` mounts a small DOM form only under
`import.meta.env.DEV`, while `MenuScene` uses the same resolver to skip directly
to `GameScene`. `GameScene.init` applies a second compile-time development guard
before forwarding the requested number and fixed 1,000-coin diagnostic bonus to
`GameSimulation`; production scene data cannot enable this path. The simulation
adds that bonus to the ordinary 20-coin fresh-run balance.

`MenuScene` also initializes the game-scoped music and effects multipliers to
zero under `import.meta.env.DEV`, before either menu music or a diagnostic scene
transition is requested. Pause sliders can raise either value for that local
run. The director's production defaults remain one and are never changed by the
development bootstrap.

`LevelSystem` owns a separate next-level cursor so a fresh build phase may point
at level `N` while `currentLevelNumber` remains null and the actual completed
count remains zero. `GameSimulation` prepares only level `N`'s immutable plan,
spawn points, effective enemy definitions, and shared navigation profiles. It
does not replay levels `1..N-1`, grant their rewards, or synthesize bonus stacks.
The wave still starts only through the ordinary Start command and builds its
flow fields through the normal one-per-profile boundary.

### Audio presentation

Audio is owned entirely by the Phaser presentation layer. A game-scoped audio
director preloads a typed asset manifest, keeps at most one looping music track
alive, switches from the menu theme to the level theme at the scene boundary,
and stops music before the defeat cue. Simulation events such as `tower-shot`,
`enemy-reached-core`, and `level-defeat` may trigger sounds, but audio playback
never mutates simulation state or changes deterministic event order.

Short non-combat effects use real-time cue gates to limit held-build, core-hit,
hover, and invalid-action bursts. Cat fire has one shared combat mixer across
all three shot keys: it selects at most one representative from each 150 ms
batch using `heavy > basic > rapid` priority, admits at most six cues in a
rolling real-time second, and gives all shot keys one combined two-voice pool.
The shot asset mix is approximately 7 dB below its original level. The gates
and mixer are presentation-only and do not suppress, delay, or merge the
underlying simulation events. Game-speed controls continue to scale simulation
delta and combat tweens; they do not change audio playback rate or pitch.

The thirteen extracted kitten-meow assets form one typed
`KITTEN_MEOW_KEYS` family. After a logical kitten cue passes its shared 500 ms
real-time gate, `GameAudioDirector` uses presentation-only randomness to choose
one member and asks the backend to enforce one combined voice across the
complete family. A rejected simultaneous cue does not select or play another
variant. Kitten meows remain outside the combat-shot aggregation and rolling
budget, but use the ordinary effects-volume multiplier and development-mode
mute. The selected asset key never enters `SimulationEvent`, domain state,
navigation, or deterministic replay data.

Music and effects have separate game-scoped volume multipliers. Updating the
music multiplier immediately changes the active loop and also applies to future
loops; updating the effects multiplier applies to all subsequently played
one-shots. Both values survive scene pause/resume for the current `Phaser.Game`
instance and never enter domain state or deterministic replay data.

The Web Audio context may begin suspended under browser autoplay policy. The
director requests the appropriate music immediately and relies on Phaser's
normal pointer/keyboard unlock path to resume it after the first eligible user
gesture; it must not create duplicate loops while waiting for unlock or during
scene transitions.

All non-kitten cues are original PCM WAV files under `public/assets/audio`,
built reproducibly by the project audio-generation script. The thirteen kitten
WAVs are extracted derivatives of the user-supplied `kitten_crying.mp3`; the
source's embedded metadata reports artist `344 Audio` and copyright year
`2021`, and the architecture makes no ownership or licensing assertion beyond
its user-supplied provenance. The procedural generator does not create or
overwrite this bank. Runtime code consumes only the manifest's stable keys,
source URLs, loop flags, and mix volumes; asset generation and extraction never
run in the game loop.

### PauseScene

`PauseScene` is a modal Phaser presentation scene launched over `GameScene`.
Escape asks `GameScene` to finish pending build input, clear any unfinished
combat-audio batch, pause itself, and run the popup. While paused, simulation
updates, gameplay timers, input, and scene-owned tweens do not advance. The
game-scoped audio director is not paused, so the current level-music loop
continues and the popup can play UI feedback and apply its independent music
and effects sliders.

Only one pause popup may be active. Escape or the popup's Resume action resumes
the existing `GameScene` and stops `PauseScene`; it does not reconstruct the
simulation or reset speed, camera, construction state, or audio multipliers.
`GameScene` also passes a read-only snapshot of current bonus stacks. The pause
scene renders only positive lifetime acquisition counts as small illustrated
icons with quantities beneath the sliders. Consuming a temporary next-level
effect does not remove its inventory icon. The popup must stay presentation-only
and must not own or mutate domain state.

### BonusScene

`BonusScene` is a second modal Phaser presentation scene, opened only from an
authoritative `bonus-offered` simulation event. `GameScene` clears transient
build/pan/audio input, preserves the selected game-speed multiplier, pauses
itself, and passes the frozen offer plus one resolver callback. The scene never
rolls options or owns stacks.

The 1080x1080 modal lays out 2..11 illustrated cards in one or two independently
centered rows and keeps a separate Skip action. Player-facing descriptions hide
percentage tuning and stack caps except for exact social-battery gains. A card
shows `В наявності: N` only for a positive current stack. A card click disables
every input surface before invoking the resolver; a stale or rejected offer
re-enables input, while an accepted choice resumes the same `GameScene` and
stops the modal. Escape cannot open `PauseScene` through this boundary. Twelve
individual image assets use stable paths from the exhaustive bonus-definition
record.

## Domain events

Use a small event bus for infrequent cross-system events, not per-frame movement.

Suggested event contracts:

```ts
type GameEventMap = {
    'wall:built': WallBuiltEvent;
    'wall:upgraded': WallUpgradedEvent;
    'wall:destroyed': WallDestroyedEvent;
    'wall:sold': WallSoldEvent;
    'navigation:rebuilt': NavigationRebuiltEvent;
    'enemy:reached-core': EnemyReachedCoreEvent;
    'enemy:healed-core': EnemyHealedCoreEvent;
    'tower:shot': TowerShotEvent;
    'tower:destroyed': TowerDestroyedEvent;
    'enemy:damaged': EnemyDamagedEvent;
    'enemy:died': EnemyDiedEvent;
    'core:destroyed': CoreDestroyedEvent;
    'level:started': LevelStartedEvent;
    'level:completed': LevelCompletedEvent;
    'bonus:offered': BonusOfferedEvent;
    'bonus:selected': BonusSelectedEvent;
    'bonus:skipped': BonusSkippedEvent;
};
```

Do not make every enemy subscribe to every event.
Systems own collections of enemies and indexes.

## Enemy state machine

Initial states:

```text
spawning
moving
attacking-wall
stuck
dead
reached-core
```

Transitions must be explicit and testable.

## Rendering

A Phaser view mirrors domain state:

- domain position is a grid cell plus transition progress;
- visual position is interpolated between cell centers;
- shallow top faces, side faces, shadows, sprite offsets, and Y-based depth may
  create a pseudo-isometric appearance, but no view may alter logical cell
  coordinates or navigation;
- animation changes when the domain state changes;
- destroying a view must not be the only way domain state is removed.
- the core view is an introverted girl, while core HP is labeled as social
  battery only in presentation. A pure resolver derives one of the
  100/75/50/25/0 visual states from authoritative `coreHp / coreMaxHp`; Phaser
  swaps the texture only when that derived band changes. The 100% state reuses
  the established core sprite, the 0% state derives from the exact blanket
  bonus source, and all states retain the same Image position, depth, bob,
  hit-shake, alpha-flash, and healing presentation. No tint or visual state is
  written back into simulation. The one explicit presentation override is
  `isBlanketProtectionActive`: pending build protection and active level
  protection both force state 0 without mutating HP or the numeric HUD; once
  that level ends, the resolver immediately returns to the ratio-derived state;
- weak and fast enemy views are individual social visitors carrying coffee or
  invitations, while the strong view uses `social-crowd-strong-v2.png` to show
  one compact noisy crowd. That composite sprite still mirrors one domain
  enemy with one HP pool, movement/attack state, logical-cell collision
  footprint, and unchanged strong navigation profile;
- Roach uses the standalone `social-roach-special-v1.png` source: one original
  right-facing brown horse galloping upside down on its forelegs. It remains
  one logical enemy with generic tower-hit, HP-bar, death-poof, and shadow
  presentation. Core arrival uses a green healing response rather than the
  girl's red hit shake or damage sound;
- visitor-facing logic combines the current horizontal movement or wall-attack
  direction with each texture's intrinsic orientation. The fast-runner source
  art faces left, while other visitor art may use a different baseline; any
  resulting horizontal flip belongs only to the Phaser view and cannot mutate
  simulation targets, cells, or navigation;
- guest speech uses one `GameScene` presentation scheduler, not timers on
  `RuntimeEnemy` and not simulation events. Every 3-12 unscaled real-time
  seconds it performs one deadline-only scan of live visitors, reservoir-
  samples one non-stunned candidate inside the girl's ten-cell Euclidean
  radius, and creates at most one 1.5-second bubble. Up to eight tracked views
  follow their enemy sprites and are cleaned on enemy resolution, level end,
  or scene shutdown. Fixed combinatorial catalogs provide exactly
  2000/1000/500 compact weak/fast/strong phrases; Roach maps only to
  `І-Ґо-Ґо`;
- spawn-marker views mirror the prepared next/current level spawn set and are
  added or removed when the build phase advances to a new plan. Each uses a
  pulsing exact-cell anchor and an animated noise-dialogue bubble displaced
  inward from the map edge;
- tower views include three attacking wizard cats plus the harmless kitten.
  Shot-event endpoints drive attacking-cat facing, casting motion, aura
  orientation, and projectile rotation;
- kitten-meow events drive one radius wave, a compact deterministic sample of
  staggered heart bubbles, and one randomly selected cue from the thirteen-key
  typed meow bank after its shared family gate admits playback. Frozen enemies
  suppress walk/attack bobbing while retaining their authoritative sprite
  position;
- the mine is drawn from a standalone matte-cleaned source texture. Trigger and
  detonation events drive its warning pulse, map-scale shockwave, flash, wall
  impacts, and dedicated explosion cue;
- heavy impacts use an explicit target-cell wave and outline all four cardinal
  area cells, including empty ones. Per-victim damage events drive separate
  hit flashes. These views remain readable at accelerated game speeds and
  never infer structure damage from visual overlap;
- full-health visitor bars stay hidden and do not affect simulation state;
- every wall uses the same fixed-width book-stack autotile silhouette. Tower
  occupancy still reinforces domain HP but never changes wall width or texture
  variant;
- wall autotiles use the macro-detail `book-stack-texture-v2.png` source and a
  4x internal Canvas resolution (120x120) while Phaser displays them at the
  unchanged 30x30 cell size. Linear filtering remains enabled for the smooth
  comic art, but maximum camera zoom never upscales a 30px source texture;
- damaged-book debris is a nonblocking terrain view under enemies and
  structures. Four deterministic high-resolution variants show disordered
  piles of torn, bent, and opened books. A pile persists after combat
  destruction until a new wall is built there, then disappears; a sale never
  spawns or restores it;
- the floor is one world image scaled to the complete 1080x1080 arena, not a
  texture repeated once per logical cell;
- coins, status, planned visitor total, and social battery use separate compact
  scrapbook chips at top-left, the build menu bottom-left, and one fixed
  scrapbook action dock at fourteen pixels from the bottom-right edges on the
  separate UI camera. The dock swaps a mint `ПОЧАТИ` chip for one row of
  2x/4x/10x speed chips without changing its outer geometry;
- the build menu lays out Sell first, then the wall, unlocked tower cards, and
  the unlocked mine card in
  one compact horizontal row. Each card owns an object image and price footer;
  hover tooltips carry the descriptive text outside the permanent HUD;
- while Sell is active, its left-button gesture replaces camera dragging. A
  click is a one-cell selection; a drag renders one inclusive translucent
  world-space rectangle and marks the sellable cells inside it. Tool changes,
  pause, scene exit, and build-phase exit cancel an unfinished selection.
  Keyboard pan and wheel zoom are locked while the pointer is held, and fixed
  HUD regions cannot update the last visible world-space endpoint;
- the start menu uses a centered icon-only Play control. Gameplay panels and
  actions share rounded warm cards and soft shadows;
- the final overlay reads the authoritative completed-level score and decorates
  a strictly improved persisted result with `NEW RECORD`;
- the level Start control is outside the build panel and shares the action dock
  with speed controls. Its copy never duplicates the level number. Active build
  icons toggle off when clicked again, so no Done control exists;
- level labels show an unbounded level number without a finite denominator;
  a locked cat has no button, hit target, or selection state until its unlock
  build phase;
- active-level speed controls multiply the single simulation delta and Phaser
  combat-tween time scale; camera input continues to use unscaled frame time.
  Changing speed does not create per-unit updates or pathfinding requests, and
  does not alter music or sound-effect playback rate. Selecting 2x, 4x, or 10x
  persists through build and bonus phases into the next level; selecting the
  active chip again returns to 1x, and terminal/fresh-run boundaries reset it.
- the world camera treats minimum zoom as a canonical home state: the full
  arena is centered, drag and keyboard panning cannot change scroll, and a
  zoom transition back to minimum replaces cursor anchoring with an atomic
  center reset. Above minimum zoom, both pan inputs retain the half-viewport
  overflow bounds.

## Performance guidelines

- Use shared field typed arrays.
- Keep generated enemy groups as counts and stream the spawn schedule; never
  allocate an array with one entry per exponentially scaling enemy.
- Avoid creating temporary objects in per-unit hot loops where practical.
- Use object pooling for enemies/projectiles only after profiling shows allocation pressure.
- Do not attach a physics body to every enemy for basic grid movement.
- Later, use spatial buckets for tower target acquisition instead of every tower scanning every enemy.
- Keep field directions, costs, grid revision, and solver invocation count
  available to developer diagnostics and tests, but outside the player HUD.
