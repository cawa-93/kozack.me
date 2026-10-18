# Architecture decisions

## ADR-001: Shared flow fields instead of per-unit paths

**Status:** Accepted

For each navigation profile, build one reverse cost map from the core and one next-direction map.
All units with that profile share it.

Reason: the game expects three or four profiles and hundreds of units per profile. Per-unit A* would scale with unit count and duplicate nearly identical work.

## ADR-002: Navigation profile is separate from enemy definition

**Status:** Accepted

Only values that influence route choice belong in `NavigationProfile`.
Multiple enemy definitions may share one profile and one field.

## ADR-003: Walls are expensive, not absolutely blocked

**Status:** Accepted

A wall cell has a traversal cost based on movement time plus estimated destruction time.
This lets weak/fast and strong/slow profiles choose different routes naturally.

## ADR-004: Use a maintained graph-search implementation

**Status:** Accepted

The project will not implement A*, Dijkstra, a priority queue, or a heap from scratch.
A library performs the all-cells weighted search. Project code adapts its output to project-owned typed arrays.

The Phase 0 spike selected `@dagrejs/graphlib@4.0.5`.

The grid adapter creates a directed forward edge `u -> v` with weight equal to
the encoded route-selection score of entering `v`: its binary tower-exposure
priority plus normalized physical enter cost as defined by ADR-038. It calls
the library's `alg.dijkstra` once from the core while traversing incoming edges,
then copies accumulated scores into `Float64Array` and derives deterministic
directions into `Uint8Array`.

Rex Board for Phaser 4 was evaluated but not selected. Its pathfinder can perform a weighted all-cells search, but the published plugin is tightly coupled to Phaser Board/chess objects, is substantially larger, and its runtime cost fields/nullability disagree with its declarations. Graphlib keeps the simulation testable without rendering and exposes the exact all-cells distance result required here.

## ADR-005: Enemies do not block the global field

**Status:** Accepted

Enemy occupancy changes too often to be part of the global cost map.
Crowding is handled visually or by a future local steering layer.

## ADR-006: Field rebuilds follow navigation-cost changes

**Status:** Accepted for prototype

Build fields before an active level and rebuild when a wall is destroyed.
Do not rebuild after every damage tick.
Wall creation and maximum-HP upgrades invalidate fields because they change
traversal cost; selling a wall also invalidates fields because it removes that
cost. Tower placement and removal invalidate the binary exposure snapshot and
reuse the same shared rebuild already required by supporting-wall
reinforcement or destruction. Ordinary damage ticks, tower cooldowns, and
targets do not. If building during an active level is later enabled, the same
invalidation rules apply.

## ADR-007: Attack walls from an adjacent cell

**Status:** Accepted

An enemy does not move into an intact wall cell.
It pauses in the adjacent cell, attacks, and enters only after the wall has been removed and the current field points there.

## ADR-008: Domain state is independent of rendering

**Status:** Accepted

Phaser objects display the simulation but do not own authoritative HP, route
state, or grid occupancy. Player-facing metaphors are also presentation-only:
the introverted girl is the core, social battery is core HP, book stacks are
walls, wizard cats are towers, and visitors are enemies.

## ADR-009: Browser-first distribution

**Status:** Accepted

Build an HTML5/browser prototype first. Desktop wrapping is deferred.

## ADR-010: Towers reinforce and depend on their supporting wall

**Status:** Accepted

A tower occupies a separate structure layer but can exist only over one wall.
Only one tower is allowed per wall cell. A base wall has 100 current and
maximum HP. Tower placement adds 50 to both values, bringing an undamaged
supporting wall to 150 HP, invalidates the wall-cost snapshot, and rebuilds the
shared navigation fields. When that wall is destroyed, its tower is destroyed
in the same update before the new fields are published. Selling the supporting
wall during a build phase removes both layers and rebuilds navigation once.

The reinforcement is logical only in the current visual design. Placing any
wizard cat does not enlarge the supporting book wall or select another autotile
variant; every connected book wall keeps one fixed-width silhouette.

## ADR-011: Pseudo-isometry is rendering only

**Status:** Accepted

The game uses a cartoon-comic 2D style with a shallow pseudo-isometric
three-quarter appearance. Phaser may add visible top/side faces, directional
shadows, sprite offsets, and Y-sorted depth. The simulation remains a 36x36
orthogonal grid with the existing four-directional movement and cell mapping.

Horizontal visitor facing is also rendering-only. Each source texture has an
intrinsic left- or right-facing orientation; notably, the fast runner is
authored facing left. The Phaser view combines that baseline with the current
movement or wall-attack target instead of applying one shared right-facing
assumption. Mirroring a sprite never changes its domain position, target, or
flow-field direction.

The strong visitor is rendered as a compact noisy crowd, but that crowd is one
composite presentation object for one domain enemy. It does not create extra
units, HP pools, movement states, targets, collision cells, or navigation work;
the established strong behavior and profile remain authoritative.

Reason: the new style needs more dimensional character without invalidating
the tested flow-field, construction, camera, targeting, and input contracts.

## ADR-012: Endless manual levels share persistent run state

**Status:** Accepted

The default game is an endless sequence of levels on one shared arena. Levels
start only when the player uses the separate Start control. Completing any
level enters a build phase with unlimited time, no timer, and no automatic
transition, then prepares the next level.

Book walls, wizard cats, each wall's maximum HP, the coin balance, and the
core's social-battery HP persist between levels. Successful level completion
atomically restores all surviving walls to their individual maximum HP and
rebuilds the shared profile fields once if any wall changed; destroyed walls
remain debris. Navigation fields remain shared by profile and are prepared
from the current persistent grid before each manual start. Level completion
never emits a victory state in the default mode;
depleting the social battery ends the run in defeat.

Reason: manual pacing lets the player inspect and adjust the same defensive
layout between encounters without introducing redundant arena states or
invalidating the existing navigation architecture. Endless progression keeps
that loop running for as long as the defense survives.

## ADR-013: Level generation is deterministic and independently scaled by type

**Status:** Accepted

The default level generator uses these unlock and initial-count rules:

- weak visitors: level 1, count 10;
- fast visitors: level 4, count 5;
- strong visitors: level 10, count 1;
- basic, rapid, heavy, and kitten towers: build phases before levels 1, 4, 10,
  and 16; `Sheer Heart Attack` unlocks before level 21.

The build HUD contains controls only for currently unlocked tower types. A
locked type has no visible or interactive control, while the simulation API
still enforces the same unlock boundary independently.

After an enemy type unlocks, levels through 15 use
`ceil(previousCount * 1.4)`, and levels 16 through 19 use
`ceil(previousCount * 1.15)`. Beginning with the transition into level 20,
weak uses `min(2500, ceil(previousCount * 1.02))`, fast uses
`min(1250, ceil(previousCount * 1.05))`, and strong uses
`min(1500, ceil(previousCount * 1.18))`. Counts are stored as group counters
and consumed by the spawn scheduler without allocating one queue entry per
enemy. The ordinary plan is bounded at 5,250 visitors, and Roach replacement
plans never feed their static population into those sequences.

Levels 1 through 4 use the fixed bottom-center spawn. Level 5 has two active
spawns; the count increases by one every five levels and is capped at 100. From
level 5 onward, every active point is a unique deterministic pseudo-random edge
cell derived from the stable run seed and level number. The next immutable
level plan is generated once before its build phase and reused for spawn
markers, route validation, level start, and replay.

Reason: deterministic preparation makes a random-looking endless run testable
and prevents the arena preview from changing after the player has built for it.
Independent recurrence preserves each enemy type's intended introduction. The
post-level-20 caps stop weak-unit volume from dominating run duration while the
larger strong recurrence deliberately shifts the late composition toward the
most threatening visitor. The counter-based scheduler still avoids a
per-enemy queue.

## ADR-014: Enemy combat and navigation stats scale once per level

**Status:** Accepted

Level 1 uses maximum HP 15/10/40, movement speeds
`2.4`/`5.6`/`4 / 3` cells per second, and damage 4/2/8 for weak/fast/strong
visitors. Levels below 20 retain maximum HP
`baseMaxHp + floor((L - 1) / 2)`, movement speed
`doubledBaseSpeed + floor((L - 1) / 3)`, and base damage. For level 20 and
later, let `n = L - 19`; maximum HP is
`round((baseMaxHp + 9) * (8 + n) / 8)`, movement speed is
`(doubledBaseSpeed + 6) * (20 + n) / 20`, and damage is
`round(baseDamage * (4 + n) / 4)`. Nearest-integer HP and damage saturate at
`Number.MAX_SAFE_INTEGER` instead of overflowing in an extreme endless run.

Earplugs is applied exactly once to the already level-scaled wall damage, with
the existing nearest-integer rounding and minimum of 1. Wall attacks and shared
navigation read that effective value. Core damage independently derives
`coreBase = max(1, floor(scaledDamage / 4))`, then applies Earplugs once to that
base with the same rounding and minimum. Arrival reads the stored result; it
must not reapply Earplugs or fall back to the unscaled level-1 definition.

Effective definitions and navigation profiles are immutable and generated once
for the level. Navigation profile IDs stay stable by enemy type, and all units
of that type share the same level-specific profile and flow field. A changed
speed therefore causes one coordinated profile-set rebuild at the level
boundary, never one pathfinding calculation per unit.

Reason: applying progression in shared level data keeps spawned enemies,
movement, wall/core combat, construction previews, and weighted route costs
consistent without weakening the flow-field architecture. Accelerated stats
after level 20 create pressure by making each visitor matter rather than by
extending the spawn queue.

## ADR-015: Coins are persistent transactional run state

**Status:** Accepted

The level-1 build phase starts with 20 coins. Entering a subsequent build phase
after completing a level derives a normalized reward from the just-completed immutable
level plan: one tenth of a coin per weak visitor, two tenths per fast visitor,
five tenths per strong visitor, plus 10 coins. The reward is clamped to 20..200
coins and then rounded to the nearest whole coin, with a positive exact half
rounded upward.

Rewards through completed level 11 use that result directly. Starting with the
level-12 reward, an upward change is capped at 20 coins over the normalized
reward of the preceding completed level. After this smoothing, a one-level
payout modifier maps Hide Under a Blanket to zero, Twitter Fight to exactly
double, and an ordinary level to the normalized amount. The pre-modifier
normalized amount is stored as the next smoothing baseline; zero/double never
feeds back into later smoothing. The resulting whole-coin payout is credited
exactly once and smoothing compares rewards rather than the accumulated balance.

Coin values are represented internally as whole integer units, so the player
never has a fractional balance. The just-completed plan owns the reward; the
prepared next level cannot affect it. The balance persists for the endless run,
never becomes negative, and the public coin balance saturates at
`Number.MAX_SAFE_INTEGER`.

A wall costs 1 coin. Basic, rapid, heavy, and kitten towers cost 5, 8, 11, and
110 coins; `Sheer Heart Attack` costs 300.
Only successful construction spends funds. Selling a wall during a build phase
refunds the full wall price and, when present, the attached tower's full price
in the same transaction. Combat destruction of the wall and tower never
refunds anything.
An undetonated mine is also removable through Sell for a complete refund;
detonation consumes it without a refund.

Reason: a single authoritative simulation balance makes construction choices
meaningful while keeping failed placement, route validation, repeated level
events, and rendering state unable to create or lose coins accidentally. One
explicit rounding boundary keeps every subsequent construction and refund
transaction in whole coins.

## ADR-016: Startup and gameplay HUD are separate icon-first surfaces

**Status:** Accepted

The application starts in a dedicated menu scene with a full-screen illustrated
background, the game title, and one Start action. Gameplay is constructed only
after that action. The fixed gameplay HUD favours object and action icons over
descriptive copy and never exposes navigation revision or solver telemetry.

The visitor indicator shows the saturating sum of every group in the immutable
level plan. During construction it previews the next prepared level; after
Start it remains the total for that level instead of becoming a count of only
spawned, visible, or surviving visitors.

Reason: the menu gives the run a clear entry point, while an icon-first HUD
preserves arena visibility. Reading visitor totals from the level plan also
makes the value stable and meaningful throughout streamed spawning.

## ADR-017: Build actions are compact cards and survival score is local

**Status:** Accepted

The build HUD is one dynamically sized horizontal row. Sell is always first,
followed by the book wall and only the wizard cats unlocked for the prepared
level. Equal-size rounded cards show the object illustration above a compact
price footer. Names and explanations live in hover tooltips instead of permanent
button copy. The start-menu action is a centered Play icon without a label, and
the remaining HUD surfaces use the same warm rounded visual language.

The run score is the number of levels fully completed before defeat. It is
owned by `GameSimulation`, so a level that depletes the social battery on its
final visitor is not accidentally counted. The browser layer compares that
score with one validated, namespaced `localStorage` record. Only a strictly
higher value is stored and receives the `NEW RECORD` badge.

Reason: card reflow avoids empty unlocked slots and makes every action visually
scannable. Keeping the score authoritative while isolating persistence preserves
deterministic simulation tests and still gives the endless run a durable goal.

## ADR-018: Visitor types use deterministic proportional spawn interleaving

**Status:** Accepted

When a level contains several visitor groups, `LevelSystem` does not exhaust
them in configuration order. For each spawn, a compact mixer selects the group
whose next normalized midpoint `(spawned + 0.5) / groupCount` occurs earliest.
Cross-products use exact integer arithmetic, and equal positions use a rotating
deterministic priority. This spreads common and rare types over the complete
level while preserving every configured per-type count and replay order.

The mixer stores one cursor per compact group and never constructs a
per-visitor array. Spawn-point round-robin uses its own bounded modulo cursor so
saturation of the public endless-run ordinals cannot freeze point rotation.

Reason: interleaved arrivals produce more varied encounters without adding
random replay state, changing level population, or violating the endless
generator's memory guarantees.

## ADR-019: Spawn cadence accelerates per level with a fixed throughput cap

**Status:** Accepted

The campaign's configured spawn interval is the level-1 base. Levels 1 through
10 subtract 50 ms per level from the 500 ms base, reaching 50 ms on level 10.
Levels 11, 12, and 13 then use 40, 30, and 20 ms, and ordinary levels 14
through 19 use the 10 ms interval. Levels 20, 21, and 22 use 8, 6, and 4 ms,
and ordinary level 23 onward uses the 2 ms floor. The fixed Roach
replacement levels 15 and 77 are an explicit exception: the first Roach still
spawns immediately, but every later Roach uses a 500 ms interval.

The 2 ms minimum caps the scheduler at 500 visitors per simulation second.
The existing 2x/4x/10x control scales the complete simulation clock and may
therefore execute those simulation seconds faster in real time.

Reason: later encounters begin more urgently while both the early 50-to-10 ms
and late 10-to-2 ms transitions avoid abrupt throughput jumps. Together with
the bounded post-level-20 population, the higher cap drains the complete
schedule promptly without permitting zero cadence or an unbounded per-update
spawn loop.

## ADR-020: Book-wall art uses macro detail at four-times render resolution

**Status:** Accepted

The wall source is `book-stack-texture-v2.png`: four or five broad book layers
with crisp cover outlines and pale page blocks, not the previous dense shelf
microtexture. Each of the 16 logical 30x30 autotile masks is rasterized to a
120x120 Canvas texture and then displayed at one cell. The mask geometry,
26-pixel logical footprint, cardinal joins, and smooth global texture filtering
remain unchanged.

Reason: large visual bands make the object identifiable at arena scale, while
the 4x internal resolution supplies enough native pixels for 2.5x camera zoom
and the 58px HUD preview without blurring other smooth comic assets.

## ADR-021: Dense cat fire uses one shared presentation-audio budget

**Status:** Accepted

All basic, rapid, and heavy tower shots enter one game-scoped combat mixer.
Each 150 ms real-time batch emits at most one representative cue, with heavy
preferred over basic and basic over rapid. The combined mixer admits at most
six cues in a rolling second and at most two concurrent voices across all shot
assets. Their manifest volumes are approximately 7 dB below the previous mix.

This policy affects presentation only. Every authoritative `tower-shot` event,
damage application, projectile, and casting animation still occurs in its
original deterministic order.

Reason: late endless levels can generate many simultaneous shots. A global
budget preserves occasional, informative combat accents without letting the
number or type of active cats turn the soundtrack into continuous noise.

## ADR-022: Pause is a modal Phaser scene with game-scoped audio controls

**Status:** Accepted

Escape pauses `GameScene` and runs one `PauseScene` overlay. Simulation updates,
gameplay input, scene timers, and combat tweens stop; the current game-scoped
music loop continues. Escape or Resume closes the modal and resumes the same
gameplay scene instead of rebuilding the run. An incomplete combat-audio batch
is cleared when pause opens so stale fire cannot sound after resume.

The popup owns two independent runtime sliders. Music volume immediately
updates the active and future loop, while effects volume applies to every
subsequent one-shot. Both multipliers live in the audio director for the
current `Phaser.Game` instance and remain presentation-only.

The paused gameplay scene passes a read-only bonus-stack snapshot to the popup.
Only collected bonuses appear beneath the sliders as compact illustrated icons
with quantities; the popup cannot change the authoritative stacks.

Reason: a separate modal scene gives Phaser one clear pause boundary and lets
the player adjust sound while the simulation is frozen. Keeping music and
effects in the existing game-scoped director avoids duplicate loops and keeps
audio preferences independent from deterministic domain state.

## ADR-023: Heavy-cat impact is density-targeted cell combat

**Status:** Accepted

The basic cat remains 10 damage at 1 shot per second for 5 coins. The rapid cat
uses 6 damage at 2.5 shots per second for 8 coins. The heavy cat costs 11 coins
and fires at 0.2 shots per second: its primary enemy receives 60 direct damage
plus 20 target-cell splash, every other enemy in that logical cell receives 20,
and enemies in the four cardinal neighboring cells receive 15. No layer of the
heavy attack damages walls or any other structure.

Unlike the two single-target cats, the heavy cat groups eligible live enemies
by logical cell and targets the densest cell in its five-cell Euclidean range.
Equal-density candidates prefer smaller Manhattan distance to the core, then
shorter squared tower-to-cell distance, then smaller row-major cell index. The
primary is the selected cell's first live occupant in stable spawn/collection
order. Damage uses authoritative logical cells rather than interpolated sprite
positions and stays deterministic.

The Phaser layer renders an explicit target-cell impact wave, outlines the
complete four-cardinal area, and flashes actual victims from authoritative
damage-zone events. Presentation does not discover extra victims or reapply
damage.

Reason: higher direct damage alone mostly became overkill and left the slow cat
weaker per coin than multiple basic cats. Density-aware layered area damage
gives it a clear crowd-control role, while cell-authoritative targeting and
feedback make the splash both testable and visible.

## ADR-024: Late endless progression uses staged growth limits

**Status:** Accepted

Population recurrence remains `ceil(previous * 1.4)` through level 15 and
`ceil(previous * 1.15)` through level 19. From level 20 it becomes bounded and
type-specific: weak ×1.02 up to 2,500, fast ×1.05 up to 1,250, and strong ×1.18
up to 1,500, always using ceiling before the cap. Ordinary spawn cadence uses
8/6/4 ms on levels 20/21/22 and the 2 ms floor from level 23. At the same
boundary, HP, damage, and movement leave their early additive curves and scale
from the level-19 baseline by `(8+n)/8`, `(4+n)/4`, and `(20+n)/20`
respectively, where `n = L - 19`; HP and damage use nearest-integer rounding.
Starting with the reward for completed level 12, the normalized whole-coin
reward may still increase by at most 20 over the preceding level's normalized
reward and remains within its current bounded reward range. Temporary zero or
double payout is applied afterward and never becomes the next baseline.

Reason: the late game should become stronger, not longer. The 5,250 ordinary
visitor ceiling and 500-per-simulation-second spawn cap bound schedule length
and presentation load. Faster HP, damage, and movement growth makes every
surviving visitor more consequential, while the stronger strong-enemy
recurrence shifts composition toward units able to breach walls. Income
smoothing continues to stop one transition from leaping ahead of build costs.

## ADR-025: Combat-destroyed walls become slow paper terrain

**Status:** Accepted

Destroying a book wall in combat atomically removes its structure and leaves a
nonblocking damaged-book-debris terrain marker. Debris has a traversal multiplier of
2, so a profile's shared flow field prices the cell at twice ordinary movement
time and the movement system crosses it at half ordinary speed. It persists
until a successful replacement-wall build clears it in the same construction
transaction. Selling a wall never creates debris, and selling a replacement
does not restore the cleared marker.

The combined wall removal and debris installation publishes one grid revision
and one rebuilt field set. A replacement build likewise publishes no
intermediate debris-free ground field. Debris is terrain rather than a
structure, never blocks placement, and never damages an enemy.

Reason: a broken defense should leave a readable, strategically meaningful
scar without introducing a new blocker or per-unit navigation. Pricing the
same multiplier in shared fields and runtime movement preserves estimated-time
route choice.

## ADR-026: Bonus offers are a gated, immutable between-level transaction

**Status:** Accepted

After completed levels divisible by three, the public run enters `bonus` after
crediting the completed level's already-snapshotted reward but before reading
the next level definition. `BonusSystem` creates one immutable offer by hashing
a run seed, completed level, and eligible bonus IDs. It owns offer identity and
stack counts only. The UI may resolve one offered type or Skip once; it cannot
roll options, apply effects directly, or resolve a stale offer.

Normal offers start with two distinct options. Wider Thinking adds one option
to later offers and removes itself when all other eligible bonuses already fit,
giving it an absolute cap of nine across the twelve-entry catalog and allowing
all eleven other bonuses to be shown. Capped bonuses, healing that would be a
no-op, and the blanket choice before completed level 6 are excluded. If fewer
than two options remain, the scheduled opportunity is consumed without opening
a one-card modal.

Passive reductions compound: Move and Earplugs use `0.91^stacks`, Burn Bridges
uses exact `ceil(canonicalCount * 0.95^stacks)`, and every outgoing integer
damage/group count remains at least 1. Cat Treats uses the bounded additive
multiplier `1 + 0.1 * stacks` for both damage and shots per second. Social Debt
uses that additive multiplier for the entire level reward and scales its base
20..200 bounds to at most 40..400. Healing clamps to the mutable battery maximum;
Social Hobby caps that maximum at 600; Thick Literature caps base wall HP at
500. The blanket option remains unique, unlocks after completed level 6, and
arms one protected no-reward level instead of emitting defeat. Twitter Fight is
eligible from the first offer and may be acquired twenty times, each time arming
the same non-stacking one-level population/reward trade-off. All bonus
definitions remain at or below the product-wide 20-pick ceiling.

After choose/Skip, `GameSimulation` invalidates any lazy build-plan cache,
applies the effect, then prepares the next level. Burn Bridges therefore changes
the actual level groups and reward source without feeding reduced counts back
into procedural recurrence. Twitter Fight then applies exact weak `ceil(3n/2)`,
fast `2n`, and strong `3n` transforms to those reduced groups with safe-integer
saturation, without creating absent groups or reapplying ordinary progression
caps. Move/Earplugs configure one shared effective
profile per enemy type at the boundary, Thick Literature changes all standing
walls in one grid revision, and no bonus introduces per-unit pathfinding.

Presentation uses a dedicated modal `BonusScene` with 2..11 illustrated cards
and a separate Skip action. It pauses the existing `GameScene`, blocks double
resolution and pause-menu overlap, leaves level music alive, and resumes the
same run only after the domain accepts the choice.

Card copy deliberately hides balance percentages, general numeric tuning, and
maximum-stack limits. Exact numeric values remain only for social-battery gains.
The current stack is rendered as `В наявності: N` only after the player owns
that bonus; unowned cards have no inventory badge. Stack counts are lifetime
acquisition history for eligibility and inventory, not the active strength or
remaining duration of a temporary next-level modifier.

Reason: delaying next-level preparation is the only reliable point where a
choice can affect counts, profiles, rewards, and persistent defenses without
retroactively changing the completed level or invalidating the build preview.
Immutable offers make random selection testable and prevent UI rerolls, while
per-effect caps preserve endless-mode strategy instead of converging to
invulnerability or unbounded DPS.

## ADR-027: Development starts use a direct fresh-run level cursor

**Status:** Accepted

Only Vite development mode recognizes `?devLevel=N`. A valid positive safe
integer skips the title scene and creates a fresh build phase before level `N`;
the wave still requires the ordinary Start action. A fixed development toolbar
rewrites the same query contract, making it usable by both people and browser
automation. Production ignores the query and rejects the scene-data override
through a second `import.meta.env.DEV` guard.

The simulation does not fast-forward. `LevelSystem` initializes a separate
next-level cursor at `N`, while current level and actually completed count stay
empty/zero. `GameSimulation` prepares only level `N`'s plan, deterministic spawn
points, effective enemies, tower unlock boundary, and profile set. The arena,
social battery, and bonus stacks use fresh-run defaults; the ordinary 20-coin
balance receives one fixed 1,000-coin diagnostic bonus. No skipped reward or
bonus is invented. Completing the selected level increments the real run score
by one even though level events retain their absolute level number for cadence
and bonus checkpoints.

Developer-launched scores never update `localStorage` High Score. Starting the
wave still runs the normal navigation preparation exactly once per profile.

Reason: direct initialization makes late-level testing fast and deterministic
without triggering earlier spawns, rewards, offers, pathfinding builds, or
exponentially large transient work, while the explicit development boundary
keeps shipped gameplay unchanged.

## ADR-028: Roach is a fixed special-level replacement profile

**Status:** Accepted

Absolute levels 15 and 77 replace their complete ordinary generated population
with exactly 100 `roach` enemies. Neighboring levels continue the canonical
weak/fast/strong recurrence as if the replacement had not fed back into it.
The first Roach spawns immediately and the remaining group uses a fixed 500 ms
interval rather than the ordinary late-level cadence.
Roach derives its constants once from the base weak visitor: 75 HP and 7.2
cells per second. Its count, HP, speed, and one-point core healing ignore level
scaling, Burn Bridges, Move, and Earplugs. It contributes the weak visitor's
0.1-coin reward weight, so the unmodified 100-Roach plan grants the normal
20-coin minimum. Twitter Fight also leaves its count at exactly 100, but still
doubles the normalized payout if applied; Hide Under a Blanket pays zero while
leaving Roach's positive healing intact.

Roach owns a fourth stable navigation profile with `instantWallBreak: true`.
The flow field prices a wall as movement time only, while first runtime contact
emits one wall-shot and reuses the ordinary atomic destruction transaction:
remove a supporting cat, remove the wall, leave damaged-book debris, release attackers,
and rebuild every shared field once. Finite damage values and a positive attack
interval remain in the profile; JavaScript `Infinity` and zero-interval loops
are not used.

Core arrival is modeled as a distinct `enemy-healed-core` event. It restores
one point up to the mutable maximum, resolves the enemy, and never enters the
damage sound, shake, or defeat path. Tower selection and direct/splash damage
remain type-agnostic, so cats can kill Roach normally.

Reason: an explicit compact replacement plan keeps the joke visible even in
late exponential progression. Fixed shared data preserves the requested
immunity to scaling without adding per-unit branches to pathfinding, while
separate heal and instant-break capabilities prevent misleading signed-damage
workarounds in simulation and presentation.

## ADR-029: Kitten runtime control and mines remain outside navigation profiles

**Status:** Accepted

`Кошенятко` is a fourth wall-supported tower unlocked before level 16. It has
no damage or projectile contract. Its fixed eight-second meow freezes every
live enemy in a ten-cell Euclidean radius for two simulation seconds. Freeze is
orthogonal runtime state, uses the maximum remaining duration instead of
addition, and pauses both movement and wall-attack progress without replacing
the enemy's target or navigation profile. It is deliberately unaffected by Cat
Treats. Presentation samples and staggers heart bubbles; it never creates a
bubble object for every late-level unit.

`Sheer Heart Attack` is a separate traversable mine layer unlocked before level
21. The literal latest placement rule overrides the general edge-building rule
for mines only: any in-bounds cell is valid when it contains neither a wall nor
another mine. Its one-second fuse batch-resolves only currently active enemies,
leaves pending spawns intact, damages cardinal walls by 10, consumes the mine,
and causes at most one navigation rebuild when the wall batch changes topology.
Undetonated build-phase sales refund 300 coins.

ADR-036 narrows this decision for static structure-aware routing: Kitten's
standing ten-cell tower range contributes to the same binary exposure snapshot
as every other tower. Its current cooldown, active freeze, affected-enemy set,
and remaining stun duration still never enter a profile or trigger a rebuild.
Mines contribute no exposure and remain completely absent from route cost.

Reason: neither temporary immobilization nor a traversable mine trigger is a
terrain cost, and neither should produce per-unit searches. Static tower
presence is cheap to snapshot once and share, while dedicated simulation events
still let Phaser render meow/bubble/explosion feedback and play sounds without
becoming combat authority.

## ADR-030: Guest dialogue is one sparse unscaled presentation scheduler

**Status:** Accepted

Visitor speech is presentation-only. `GameScene` owns one global deadline and
checks candidates only after a random 3-12 real-time seconds. It reservoir-
samples at most one non-stunned visitor inside the girl's ten-cell Euclidean
radius, creates a bubble for 1.5 real-time seconds, and tracks at most eight
ordinary dialogue views. Bubbles follow existing enemy sprites and are removed
on enemy resolution, level end, or scene shutdown. Pause freezes the scheduler,
while 2x/4x/10x simulation speed never changes reading time.

The fixed combinatorial copy catalogs contain exactly 2,000 unique weak phrases,
1,000 fast phrases, 500 strong-crowd phrases, and only `І-Ґо-Ґо` for Roach.
Every phrase is capped at 30 Unicode characters and the renderer wraps long
short phrases without reducing font size. Kitten-affected visitors lose any
ordinary dialogue before the distinct compact heart feedback appears.

Reason: one sparse presentation pass avoids thousands of per-enemy timers and
keeps dialogue density independent of late-level population and game speed.
Keeping copy and visuals outside simulation preserves deterministic combat,
shared navigation profiles, and replay-relevant state.

## ADR-031: Rectangular Sell is one batched simulation transaction

**Status:** Accepted

While Sell is active, its left-button gesture owns rectangular selection
instead of camera panning. A click is the degenerate one-cell rectangle; a drag
previews inclusive grid bounds and commits only on release. The operation may
remove walls, their attached towers, and undetonated mines. It ignores empty
cells and non-defense terrain, refunds every removed object at full price, and
deduplicates repeated cells. Camera transforms are locked while the gesture is
held, and entering a fixed HUD region preserves the last visible endpoint so
the committed rectangle always matches its preview.

The simulation emits the existing per-object sale/destruction events but
publishes only one final shared navigation field set when the batch removed at
least one wall. A mine-only batch does not rebuild navigation. Cancelling the
gesture, leaving the scene, changing tools, or leaving the build phase mutates
nothing.

Reason: one visible selection gesture should be one authoritative economy and
topology transaction. Batching avoids a flow-field rebuild storm for large
rectangles while preserving the established single-click sale contract.

## ADR-032: Heroine battery poses are derived presentation state

**Status:** Accepted

The heroine's arena pose is selected only from authoritative
`coreHp / coreMaxHp`: ratios above 75% use 100, above 50% use 75, above 25% use
50, above zero use 25, and zero uses 0. Exact quarter boundaries enter their
matching lower band. Healing and a changed maximum automatically resolve the
new band in either direction; no separate pose value is stored in simulation.
The sole explicit override is queued or active blanket protection, which forces
the 0% pose without writing zero into core HP. It clears after that one level and
the ratio mapping becomes authoritative again.

The 100% state reuses the original introvert sprite. Three standalone sources
provide 75%, 50%, and 25%, while 0% reuses the exact blanket-card illustration
source. Runtime matte cleanup creates uniform 96px textures and swaps them on
the existing Phaser Image, preserving position, depth, bobbing, hit, and heal
effects. The former health tint is removed so it cannot distort the authored
state art.

Reason: one pure ratio mapping keeps visuals synchronized with damage, healing,
and maximum-battery bonuses without duplicating domain state or affecting
navigation, combat, or replay behavior.

## ADR-033: Build Start and speed controls share one persistent action dock

**Status:** Accepted

The bottom-right HUD owns one fixed 280x72 scrapbook panel whose shadow ends
fourteen pixels from both arena edges. During build it contains one compact mint
`ПОЧАТИ` chip without a duplicated level number. During spawning and combat the
same panel swaps in one row of equal 2x, 4x, and 10x chips. The complete dock,
including padding and shadow, is one HUD input boundary.

The selected multiplier remains presentation state on `GameScene`. It persists
through build and bonus phases into the next level, while clicking the selected
chip toggles back to 1x. A terminal state or fresh run returns to 1x. Speed
continues to scale the one simulation delta and scene combat tweens without
changing audio playback rate, guest-dialogue real-time clocks, navigation
profiles, or per-unit pathfinding work.

Reason: one stable anchor removes the floating Start action and layout jump at
level start. Explicit 10x acceleration makes very large endless levels faster
to inspect, while persistence avoids making the player reselect the same pace
after every build phase.

## ADR-034: Vite development audio starts muted

**Status:** Accepted

`MenuScene` initializes both game-scoped audio multipliers to zero only under
`import.meta.env.DEV`, before it requests menu music or transfers a diagnostic
launch to `GameScene`. The pause sliders remain authoritative runtime controls,
so a developer may enable either channel after launch. The audio director keeps
its production defaults unchanged.

Reason: repeated late-level diagnostics should not unexpectedly produce dense
music or combat audio, while retaining an immediate manual path for audio QA and
compile-time isolation from shipped behavior.

## ADR-035: Kitten meows use one presentation-only variant family

**Status:** Accepted

The support kitten uses thirteen WAV variants extracted from the user-supplied
`kitten_crying.mp3`. The typed runtime manifest exposes the complete family as
`KITTEN_MEOW_KEYS`. Each admitted logical meow randomly selects one family
member in the Phaser audio layer; the selected key is not added to
`kitten-meowed`, domain state, navigation state, or deterministic replay data.
This decision changes no part of the fixed eight-second charm cadence,
two-second freeze, affected-enemy set, or deterministic heart-bubble sampling
specified by ADR-029.

The complete family shares one 500 ms real-time cooldown and one simultaneous
voice across all thirteen keys. It remains outside the shared combat-shot
aggregation and six-per-second budget, while continuing to use the common
effects-volume multiplier, development-mode mute, browser unlock behavior, and
speed-independent playback rate.

All other current audio cues remain original outputs of the procedural project
generator. The kitten source's embedded metadata reports artist `344 Audio` and
copyright year `2021`; this decision records only that the file was supplied by
the user and makes no broader ownership or licensing claim. The generator does
not create or overwrite the extracted kitten bank.

Reason: audible variation gives repeated support pulses more character, while
one family-level gate prevents separate asset keys from multiplying noise.
Keeping the choice in presentation preserves deterministic gameplay, and
recording the distinct provenance avoids an inaccurate all-assets-generated
claim.

## ADR-036: Tower exposure is a binary solver-only route preference

**Status:** Partially superseded by ADR-038

The binary coverage, exact radii, non-stacking overlap, shared-snapshot
ownership, and absence of runtime slowdown remain accepted. ADR-038 supersedes
the fixed two-cell surcharge, bounded-detour limit, and physical-first ordering
below.

Every finite destination cell inside at least one standing tower's exact
Euclidean range is marked exposed. Basic, rapid, and heavy towers use radius 5;
Kitten uses radius 10. Exposure is binary and does not stack when ranges
overlap. Mines are explicitly excluded. It never changes runtime movement
speed, terrain multipliers, wall attack cadence, or damage. Permanent blockers
remain blockers.

The original accepted version converted that bit into a fixed, finite additive
preference and therefore allowed a sufficiently expensive safe detour to lose
to a dangerous shortcut. That bounded weighting and physical-first ordering
are no longer normative; ADR-038 replaces them with exposure-count-first route
selection.

`GameSimulation` derives one immutable exposure snapshot from the complete
candidate tower set per navigation rebuild. Every profile field uses that same
snapshot, and every enemy continues to read only its shared field. Tower
placement includes the candidate tower before validation; supporting-wall
destruction or sale removes its tower before the one final rebuild. Cooldowns,
targets, enemies, and mine state never invalidate exposure.

This decision still qualifies ADR-006 and narrows ADR-029 only for Kitten's
static tower range; temporary charm state remains outside navigation. ADR-038
now owns the ordering and Graphlib score encoding.

Reason: computing binary coverage once per shared rebuild preserves the
one-field-per-profile architecture and avoids behavior that depends on the
number of overlapping defenses.

## ADR-037: Temporary bonus picks arm exactly one next level

**Status:** Accepted

Hide Under a Blanket is a unique post-level-6 protection pick. Twitter Fight is
a twelfth catalog entry, eligible
from the first offer and capped at twenty lifetime acquisitions. Wider Thinking
therefore caps at nine, and the largest offer contains all eleven other types.
Both temporary types increment the same permanent acquisition inventory used by
eligibility, `В наявності`, and the pause popup; consuming their gameplay effect
does not decrement those values.

`GameSimulation` owns one separate non-stacking pending/active modifier. A
successful choice arms the pending modifier for the next prepared level, and
only a successful Start promotes it to active. Failed route validation or any
other rejected Start leaves it pending. At the level-completion boundary it
clears after normal enemy resolution, score increment, and surviving-wall
restoration; the already prepared payout is then credited and the next bonus or
build state is created. A terminal outcome consumes it with the run. Because one
offer may resolve only one card, ordinary play cannot arm both modifiers
together.

Blanket protection forces the heroine's 0% source while pending and active but
does not mutate positive core HP or its numeric HUD. Active ordinary arrivals
resolve for zero damage and cannot trigger core-hit feedback or defeat. Walls,
towers, and enemies continue normally, and Roach healing remains positive. A
protected level completes and scores normally but its payout factor is exactly
zero, bypassing the reward minimum and Social Debt.

Twitter Fight transforms the Burn-Bridges-adjusted compact plan with exact
ceiling: weak ×3/2, fast ×2, and strong ×3. It preserves absent groups, safely
saturates counts, does not reapply ordinary count caps, and does not feed its
result into later recurrence. The plan, scheduler, HUD total, and weighted
reward all use those actual groups. Roach replacement groups stay exactly 100.

Reward calculation always computes the normalized value first from actual
groups, Social Debt, its dynamic bounds, whole-coin half-up rounding, and the
post-level-11 smoothing rule. Blanket then maps payout to zero; Twitter maps it
to exactly double; ordinary levels map it unchanged. The normalized pre-factor
value is stored as the next smoothing baseline. Twitter therefore doubles even
a Roach-plan reward without changing the Roach count, while neither its doubled
grant nor Blanket's zero changes the following level's smoothing trajectory.

Reason: separating lifetime collection from one-level activation preserves the
existing offer and inventory model without accidentally stacking temporary
power. Applying count changes before plan publication keeps previews and spawn
quotas honest, while applying payout only after normalization makes zero/double
exact and prevents temporary rewards from destabilizing long-run income.

## ADR-038: Tower exposure is the primary lexicographic route criterion

**Status:** Accepted; supersedes the bounded weighting portion of ADR-036

Routes first minimize the number of tower-exposed destination cells entered.
Only routes with the same exposure count compare authoritative estimated
physical time, including ordinary movement, debris multipliers, and wall-break
time. A remaining local tie uses the existing deterministic `Up`, `Right`,
`Down`, `Left` order. Any zero-exposure route therefore beats an exposed route
even if it crosses half the arena and breaks ten walls. If every route is
exposed, one exposed destination beats two before physical time is considered.

Graphlib continues to own the weighted all-cells search. For one snapshot and
profile, the adapter first computes every destination's physical enter cost and
the maximum finite value, then encodes each finite directed edge as:

```text
physicalFraction =
    (physicalEnterCost / maxFinitePhysicalEnterCost) / (4 * cellCount)
enterScore = towerExposure == 1
    ? 1 + physicalFraction
    : physicalFraction
```

Permanent blockers remain infinite and do not become graph edges. Every
positive-cost optimal route is simple and contains fewer than `cellCount`
moves, so its complete physical fraction is less than `1/4`. One additional
exposed destination therefore dominates every finite physical detour. Equal
exposure counts retain the physical-time ordering because all physical costs in
one field share the same positive normalization factor. Accumulated route
scores use `Float64Array` so the secondary physical ordering remains readable
beside the integer exposure component.

ADR-036's binary exposure semantics remain unchanged: overlapping tower ranges
do not stack within a cell, all profiles reuse one immutable exposure snapshot,
and mines contribute nothing. Exposure affects only the shared solver score;
it never changes runtime speed, terrain multipliers, attack cadence, damage, or
the one-field-per-profile architecture.

Reason: visitors should treat defended territory as categorically less safe,
not merely a few seconds slower. A snapshot-bounded scalar encoding provides
that lexicographic behavior while retaining the maintained Graphlib search and
shared-field performance model.

## ADR-039: Production build is published under a site subpath

**Status:** Accepted

The game is published by the kozack.me site at `/games/kutochok-tyshi/`.
`vite.config.ts` sets this `base` only for `vite build` and writes the output to
`../../public/games/kutochok-tyshi`, the static files directory of the site.
Every public asset URL is built from `import.meta.env.BASE_URL` instead of a
root-relative `/assets/...` literal. The development server and Vitest keep the
`/` base, so local URLs and asset-path tests are unchanged.

Reason: the game must work from a subdirectory of a larger static site while
remaining an independent Vite project that is rebuilt only when it changes.
