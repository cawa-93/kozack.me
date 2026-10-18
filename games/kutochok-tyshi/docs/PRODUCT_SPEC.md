# Product specification

## Working concept

A simple 2D tower-defense game played on a rectangular grid.
The player protects an introverted young woman who has surrounded her quiet
evening with books and wizard cats while increasingly enthusiastic visitors
arrive with social activities.

The presentation is polished cartoon-comic 2D with a slight pseudo-isometric
three-quarter look. Pseudo-isometry is rendering only: the simulation, input,
36x36 grid, four-directional movement, cell occupancy, and navigation costs
remain orthogonal. The game is intended for free distribution, initially as a
browser game.

## Level layout

- Every level is a grid.
- The protected core is presented as the introverted girl and occupies a cell
  near the center.
- Social visitors spawn on map-border cells.
- More difficult levels may activate more spawn points.
- All ground enemies move from cell to cell.

Resolved for the default endless mode:

- Levels continue for as long as the social battery remains above zero. Every
  completed level returns to a manual build phase with unlimited time, after a
  bonus choice on each third completion; there is no final campaign level and
  no victory state in the default run.
- Weak visitors are present from level 1, which starts with 10 weak visitors.
  Fast visitors unlock on level 4 with an initial count of 5. Strong visitors
  unlock on level 10 with an initial count of 1.
- Each ordinary enemy type has its own count sequence. After that type's first
  level, levels through 15 use `ceil(previous count * 1.4)`, and levels 16
  through 19 use `ceil(previous count * 1.15)`. Beginning with the transition
  into level 20, each type receives its own bounded late curve:
  - weak: `min(2500, ceil(previous count * 1.02))`;
  - fast: `min(1250, ceil(previous count * 1.05))`;
  - strong: `min(1500, ceil(previous count * 1.18))`.
  A type that has not unlocked contributes zero. Once a type reaches its cap,
  its count remains at that cap. Special Roach replacement levels never feed
  their population back into these ordinary sequences. The ordinary population
  is therefore bounded at 5,250 visitors; late pressure comes from stronger,
  faster enemies rather than an ever-longer spawn queue.
- When a level contains multiple visitor types, their exact per-type counts are
  emitted in one deterministic interleaved schedule instead of exhausting the
  weak, then fast, then strong group. Each unlocked type is distributed across
  the level in proportion to its share, including rare types, and replays use
  the same order.
- Level 1 uses `0.5` seconds between scheduled visitors. Levels 2 through 10
  reduce that interval by `0.05` seconds each, reaching `0.05` seconds on
  level 10. Levels 11, 12, and 13 use `0.04`, `0.03`, and `0.02` seconds;
  ordinary levels 14 through 19 use `0.01` seconds. Late ordinary levels then
  step through `0.008`, `0.006`, and `0.004` seconds on levels 20, 21, and 22,
  reaching the hard minimum of `0.002` seconds on level 23. This caps the
  scheduler at 500 visitors per simulation second. Special Roach levels 15
  and 77 instead use their fixed `0.5`-second interval. The player's 2x, 4x,
  or 10x game-speed multiplier is applied after this simulation-time cadence.
- The core has 200 HP. In player-facing UI this value is the girl's **social
  battery**; the internal domain continues to call it core HP.
- The girl's arena sprite is a presentation-only reflection of current social
  battery divided by its current maximum. Above 75% it uses the existing calm
  100% reading pose; above 50% through exactly 75% it uses the guarded 75%
  pose; above 25% through exactly 50% it uses the withdrawn 50% pose; above 0%
  through exactly 25% it uses the blanket-wrapped 25% pose. At 0% it reuses the
  exact `Сховатись під ковдру і плакати` illustration. Healing and maximum-HP
  bonuses move the sprite back through the same ratio bands. The queued and
  active Hide Under a Blanket effect is the sole override: it forces the 0%
  blanket pose throughout the next build phase and level without changing the
  positive battery value or its numeric HUD. The ratio-derived pose returns as
  soon as that one level ends.
- Levels 1 through 4 use one spawn point at the center of the bottom edge.
  Level 5 uses two spawn points; another point is added every five levels,
  capped at 100 active points. Equivalently, the active count is
  `min(100, 1 + floor(levelNumber / 5))`.
- Starting with level 5, all active spawn points are unique deterministic
  pseudo-random edge cells. A level's points are prepared before its build
  phase and remain stable for previews, route validation, tests, and replays.
- Level-1 maximum HP is 15 for weak, 10 for fast, and 40 for strong visitors.
  Levels below 20 use `baseMaxHp + floor((L - 1) / 2)`: levels 1 and 2 use the
  base values, and the first `+1` HP applies on level 3. For level 20 and later,
  let `n = L - 19` and let the level-19 baseline be `baseMaxHp + 9`; maximum HP
  is `round((baseMaxHp + 9) * (8 + n) / 8)`. Nearest-integer rounding happens
  once after scaling, and the result saturates at the largest safe integer.
- All level-1 movement speeds are twice their original prototype values: weak
  visitors move at `2.4`, fast visitors at `5.6`, and strong visitors at
  `4 / 3` cells per second. Levels below 20 use
  `doubledBaseSpeed + floor((L - 1) / 3)`, so the first additional `+1` cells
  per second applies on level 4. For level 20 and later, let `n = L - 19` and
  scale the level-19 baseline as
  `(doubledBaseSpeed + 6) * (20 + n) / 20`.
- Ordinary level damage remains at the type's base value below level 20: 4 for
  weak, 2 for fast, and 8 for strong visitors. For level 20 and later, let
  `n = L - 19` and use `round(baseDamage * (4 + n) / 4)`. This one scaled
  integer is the common source for wall hits, shared navigation cost, and the
  later core-damage derivation. Earplugs modifies the resolved wall and core
  values exactly once, with the existing nearest-integer rounding and hard
  minimum of 1.
- Effective enemy definitions and navigation profiles are prepared once per
  level. Profile IDs remain stable, and every enemy with the same profile on
  that level shares one flow field; stat scaling must never introduce
  per-unit pathfinding.
- Between-level movement and damage bonuses are folded into those same shared
  definitions once before the affected level. They never create per-enemy
  modifier or pathfinding work.
- Visitor sprites face their current movement or wall-attack target whenever
  that target has a horizontal component. Rendering accounts for each source
  texture's intrinsic orientation: in particular, the fast runner is authored
  facing left and must not use the right-facing assumption of the other visitor
  art. This mirroring is presentation-only and never changes cells, targets, or
  navigation.
- The strong visitor is rendered as one compact, noisy crowd rather than one
  person. The crowd is still exactly one enemy in domain state: it has one HP
  pool, one movement and attack state, one logical-cell collision footprint,
  and the unchanged strong navigation profile and behavior.
- During an active level, one presentation-only scheduler occasionally gives a
  live visitor a short social invitation bubble. A new attempt occurs after a
  random 3-12 real-time seconds, at most one bubble is created per attempt,
  each bubble remains readable for exactly 1.5 real-time seconds, and no more
  than eight ordinary dialogue bubbles may coexist.
- A dialogue candidate must be within a ten-cell Euclidean radius of the girl,
  must not already own a dialogue bubble, and must not be frozen by a kitten.
  The bubble follows the moving sprite and disappears immediately if that
  visitor resolves. Pause freezes its clock; 2x/4x/10x speed does not shorten the
  interval or lifetime.
- Fixed compact Ukrainian catalogs contain exactly 2,000 unique weak-visitor
  phrases, 1,000 fast-visitor phrases, and 500 noisy-crowd phrases, all at most
  30 Unicode characters. Longer short phrases wrap without shrinking the
  14-pixel font. Roach has exactly one phrase: `І-Ґо-Ґо`.
- Ordinary dialogue is visually wider and plum/lavender-accented so it cannot
  be mistaken for a spawn-noise marker or the kitten's compact heart bubble.
  A kitten meow dismisses ordinary dialogue over affected visitors before its
  heart feedback appears. Dialogue never mutates enemy or navigation state.

## Player structures

### Wall

- Can be placed on a valid buildable grid cell.
- Has 100 base HP in the prototype.
- Costs 1 coin to build. A failed placement spends nothing.
- Alters enemy route cost.
- Is not absolutely impassable: an enemy may choose to destroy it.
- Combat destruction leaves a nonblocking damaged-book-pile terrain marker in the
  wall's cell. Entering that cell takes twice as long as ordinary ground, both
  in authoritative enemy movement and in every shared flow-field cost. The
  debris persists until the player successfully builds a new wall in that
  cell; that build clears it. Selling a wall never creates debris, and selling
  a later replacement does not restore debris that its construction cleared.
- After a successfully completed level, every surviving wall is restored to
  its own maximum HP. Destroyed walls remain debris and are never revived by
  this transition.
- Walls are rendered as colorful stacks of books. Adjacent cells use one
  deterministic N/E/S/W autotile set and join into a continuous book corridor.
- Each tile shows four or five oversized cover-and-page bands rather than a
  dense micro-book mosaic. The source is rasterized to a 120x120 internal
  texture and displayed in the unchanged 30x30 logical cell, keeping book
  silhouettes legible at 1x and crisp at the 2.5x camera maximum.
- Every book-wall tile uses the same fixed visual width whether or not a wizard
  cat occupies it. The cardinal connectors reach the matching neighboring tile
  edge and exposed sides receive the same page-and-cover outline, so straight
  segments, turns, junctions, and end caps remain seamless.
- The books may show shallow top and side faces for the pseudo-isometric style,
  but their logical footprint remains exactly one orthogonal cell.

### Reinforced supporting wall

- Behaves like a normal wall and uses the same book-stack visual.
- A wizard cat increases its HP and therefore its traversal/breaking cost, but
  does not change its rendered width or autotile variant.

### Wizard cat (tower)

- Can be placed only on a wall cell.
- The wall and tower are separate logical layers of the same grid cell.
- Only one tower may occupy a wall cell.
- Any tower adds 50 HP to both the current and maximum HP of its supporting
  wall, bringing an undamaged prototype wall from 100 to 150 HP.
- Destroying the supporting wall destroys its tower in the same simulation
  update.
- Every finite grid cell inside at least one standing tower's exact Euclidean
  range is considered tower-exposed for route selection. Basic, rapid, and
  heavy towers expose their five-cell radius; Kitten exposes its ten-cell
  radius. Exposure is binary: overlapping tower ranges never stack or increase
  the route bias. `Sheer Heart Attack` and future mine-layer objects are not
  towers and never expose cells.
- Route selection first minimizes the number of tower-exposed destination
  cells entered. Only when two routes enter the same number of exposed cells
  does it minimize authoritative estimated travel time, including terrain and
  wall-breaking time. A route with zero exposure therefore always wins over an
  exposed route, even when the safe route crosses half the arena and requires
  breaking ten walls. If every route is exposed, fewer exposed cells still
  wins; equal danger falls back to physical time and then the deterministic
  `Up`, `Right`, `Down`, `Left` direction order.
- Tower danger is solver-only. It does not slow authoritative movement, alter
  terrain multipliers, or add wall-breaking time. One immutable binary
  exposure snapshot is shared by every profile field built for the navigation
  revision.
- The three damaging towers use a five-cell Euclidean targeting radius. Basic and
  rapid towers prefer the enemy closest to the core, with deterministic
  distance and stable-ID tie-breaking. The heavy tower instead chooses the
  in-range logical cell containing the most live enemies. Equal-density cells
  prefer the smaller Manhattan distance to the core, then the shorter squared
  tower-to-cell distance, then the smaller row-major cell index. Within the
  selected cell, the primary target is the first live enemy in stable
  spawn/collection order.
- The basic tower costs 5 coins and deals 10 damage at 1 shot per second.
- The rapid tower costs 8 coins and deals 6 damage at 2.5 shots per second.
- The heavy tower costs 11 coins and deals 60 direct damage at 0.2 shots per
  second. It also deals 20 splash damage to every enemy in the primary
  target's logical cell, including the primary target, plus 15 damage to every
  enemy in each of the four cardinal neighboring cells. Therefore the primary
  target takes 80 total damage. Heavy-area damage affects enemies only: it
  never damages book walls or other structures.
- The three damaging tower types are presented as visually distinct wizard cats: a
  precise cat mage, a rapid spark cat, and a heavy sage cat.
- The basic cat is available before level 1. The rapid spark cat unlocks for
  the build phase before level 4, and the heavy sage cat unlocks for the build
  phase before level 10. A locked cat has no build control in the HUD and
  cannot be selected or placed through either the UI or the simulation API.
- When firing, the cat turns toward the target and performs a casting animation.
  Its magical projectile faces its travel direction.
- A heavy impact renders an unmistakable cell-sized magical wave at the target
  cell and outlines all four cardinal cells in its area, even when one is
  empty. Enemies actually hit receive distinct zone-colored flashes from
  authoritative damage events. Feedback must remain readable at 2x, 4x, and 10x
  speed and must not imply that book walls took damage.
- A fourth tower, `Кошенятко`, costs 110 coins and unlocks in the build phase
  before level 16. Its player description is `Неймовірно миленьке`. It deals
  no damage and fires no projectile. Whenever at least one live visitor is
  within its ten-cell Euclidean radius, it meows, freezes every visitor in that
  radius for two simulation seconds, then waits eight simulation seconds before
  it can meow again. Reapplication takes the greater remaining duration rather
  than adding durations. The meow freezes movement and wall-attack progress,
  preserves the visitor's current target/state, and never rebuilds navigation.
- A meow produces a visible radius wave and a bounded, deterministic sample of
  staggered cream speech bubbles with heart variants. All affected visitors
  freeze even though only roughly two of every fifteen, capped for late-level
  presentation safety, receive bubbles. Cat Treats does not alter this fixed
  eight-second support cadence or two-second duration.
- Visitor health bars are hidden at full HP and appear only after damage.

### Sheer Heart Attack (mine)

- This single-use mine costs 300 coins and unlocks in the build phase before
  level 21. It is a traversable structure-layer object, not a wall or tower.
- It may occupy any in-bounds cell without a wall or another mine, including
  debris, core, spawn, and edge cells. A later wall cannot be built over it.
- The first visitor that authoritatively occupies its cell triggers a one-second
  simulation-time fuse. Detonation consumes the mine, instantly resolves every
  currently active visitor on the level, and leaves future scheduled spawns
  untouched.
- Detonation deals exactly 10 damage to walls in the four cardinal neighboring
  cells; diagonals are unaffected. Multiple destroyed walls, attached cats,
  debris, attacker release, and navigation invalidation are applied as one
  batch with at most one shared-field rebuild.
- An undetonated mine can be sold during a build phase for its complete price.
  A triggered/detonated mine grants no combat refund.

## Player economy

- The run begins with 20 coins in the build phase before level 1.
- Completing a level prepares a normalized reward computed
  from the just-completed immutable level plan: `0.1` coin per weak visitor or
  Roach, `0.2` per fast visitor, `0.5` per strong visitor, plus a static 10
  coins. The weighted result is clamped to the inclusive range from 20 to 200
  coins, then rounded to the nearest whole coin; because rewards are positive,
  an exact `.5` rounds upward. A 100-Roach special level therefore grants the
  ordinary 20-coin minimum before Social Debt.
- The just-completed plan owns that normalized reward; the
  prepared next plan, repeated reads, previews, or attempts to start a level
  cannot change or duplicate the income.
- Burn Bridges changes the immutable plan before the level starts, so its
  reduced actual visitor counts also drive that level's weighted reward.
  Social Debt is snapshotted when the level starts and applies only to that
  level's future completion reward.
- Rewards for completed levels 1 through 11 use that rounded, bounded value
  directly. Starting with the level-12 reward, an otherwise larger result may
  increase by at most 20 coins over the preceding completed level's normalized
  reward. Temporary next-level payout effects apply only after this smoothing:
  Hide Under a Blanket grants exactly zero, bypassing every minimum, while
  Twitter Fight grants exactly twice the normalized whole-coin result. The
  normalized result, not the temporary zero/double payout, becomes the baseline
  for smoothing the following level. Smoothing compares rewards, never the
  player's accumulated balance.
- Coins persist as whole integer units for the complete endless run, so the
  player never has a fractional balance. The balance never becomes negative,
  and credits saturate at the largest safe integer.
- A wall costs 1 coin. Basic, rapid, heavy, and kitten towers cost 5, 8, 11,
  and 110 coins respectively. `Sheer Heart Attack` costs 300 coins.
- Only a successful build transaction spends coins. Invalid cells, blocked
  routes, locked towers, occupied walls, and insufficient funds leave the
  balance unchanged. A held wall-paint gesture builds only the affordable
  valid cells in input order.
- Selling a wall during a build phase refunds its complete 1-coin price. If a
  tower occupies that wall, its complete tower price is refunded in the same
  transaction. One Sell gesture may include multiple walls and towers.
- Selling an undetonated mine refunds its complete 300-coin price, including
  when it is part of a multi-cell Sell gesture.
- A wall destroyed by enemies is lost together with its tower and grants no
  refund.

## Between-level bonuses

- The catalog contains twelve bonus types. An offer can grow from two to at
  most eleven cards, because Wider Thinking itself disappears once every other
  eligible type fits.
- After successfully completing levels 3, 6, 9, and every third level after
  that, the run pauses before preparing the next level and presents a bonus
  choice. The just-completed level's snapshotted reward is credited first, so a
  chosen bonus affects level 4/7/10 onward and never changes income already
  earned.
- A normal offer contains two distinct options selected once from a stable
  run-seeded random ordering. Reopening or rereading an offer cannot reroll it.
  The player may choose exactly one offered option or use the separate Skip
  action. Skip changes no stack and still consumes that opportunity.
- Every option has its own cozy illustration. The high-cost blanket trade-off
  card
  keeps the same illustration, copy, and dimensions as other cards but uses a
  distinct dark warning treatment. The modal pauses simulation,
  construction, camera input, and speed controls while keeping the level music
  loop alive. Twitter Fight has its own cozy warning illustration at
  `/assets/bonuses/bonus-twitter-fight.png`.
- Player-facing bonus descriptions stay qualitative and do not expose balance
  percentages, stack caps, or other tuning values. Exact values remain visible
  only when an option restores social battery or increases its maximum. A card
  shows `В наявності: N` only after that bonus has already been collected; an
  unowned bonus has no stack label.
- Percent reductions compound multiplicatively. Counts use exact ceiling
  arithmetic from the canonical unmodified level plan, and every non-empty
  enemy group retains at least one visitor. Damage uses nearest-integer
  rounding with a hard minimum of 1. These rules prevent negative speed,
  zero-damage visitors, and recursive count shrinkage.
- Bonus caps are deliberately lower than or equal to the global 20-pick limit:

| Bonus | Effect per pick | Logical cap and maximum |
|---|---|---|
| Vacation | Restore the social battery fully | 5 full restores |
| Find a social hobby | +50 maximum and current battery | 8; maximum battery 600 |
| Move house | Visitor speed ×0.91 | 10; ×0.389, with a 0.25 cells/s floor |
| Buy earplugs | Visitor wall/core damage ×0.91 | 10; integer damage remains at least 1 |
| Burn bridges | Visitor counts ×0.95 | 10; ×0.599 after ceiling, minimum 1 per group |
| Wider thinking | +1 option on later offers | 9; at most all 11 other bonuses are shown |
| Cat treats | Cat damage and shots/s +10% | 5; ×1.5 to each stat, ×2.25 DPS |
| Pet the cats | Restore 100 battery | 20; clamped to the current maximum |
| Thick literature | +50 current/max HP to book walls | 8; base wall HP 500, or 550 with a cat |
| Social debt | Reward and both bounds +10% | 10; ×2 reward with bounds 40..400 |
| Hide under a blanket and cry | The next level cannot drain battery, but pays no coins | Unique; one lifetime pick, available after level 6 |
| Twitter Fight | The next level has ×1.5 weak, ×2 fast, and ×3 strong visitors, then pays ×2 | 20 lifetime picks; the temporary strength does not stack |

- Vacation and Pet the cats are omitted while the battery is already full.
  Capped bonuses are omitted. Wider thinking is omitted whenever the current
  option count already covers every other eligible bonus; if fewer than two
  bonuses remain, that scheduled opportunity is skipped instead of showing an
  invalid one-card offer.
- Social hobby raises both maximum and current charge by 50. Vacation and Pet
  the cats clamp healing to the current maximum. Thick literature upgrades all
  standing walls atomically and also changes the base HP of future walls;
  existing tower reinforcement remains a separate +50.
- Cat treats uses `1 + 0.1 * stacks` for both damage and shots per second. It
  scales direct, target-cell splash, and adjacent-cell splash identically.
- Social debt multiplies the complete reward formula, including the static 10
  coins, and changes the minimum to `20 + 2 * stacks` and maximum to
  `200 + 20 * stacks`. The result stays a whole coin and retains the existing
  post-level-11 smoothing limit.
- Hide under a blanket and cry first becomes eligible in the choice after
  completing level 6 and remains unique. Selecting it queues protection for the
  next successfully started level. During its pending build phase and active
  level, the heroine uses the 0% blanket visual but keeps her actual positive
  battery. Ordinary core arrivals deal zero damage and cannot cause defeat;
  walls and cats remain vulnerable, and Roach healing still works. The level
  completes, increments score, restores surviving walls, and advances bonus
  cadence normally, but credits exactly zero coins even when Social Debt would
  raise the minimum. Its normalized reward still becomes the next smoothing
  baseline, and protection then clears.
- Twitter Fight is eligible from the first bonus offer. Selecting it queues one
  non-stacking modifier for the next successfully started level. First apply
  Burn Bridges to each present canonical group, then use exact ceiling to
  multiply weak counts by `3/2`, fast counts by `2`, and strong counts by `3`.
  Missing types remain missing and these temporary counts never feed procedural
  recurrence. The immutable prepared plan, spawn scheduler, build/level HUD
  total, and reward formula all use the increased counts. After Social Debt,
  whole-coin rounding, bounds, and post-level-11 smoothing produce the
  normalized reward, the actual grant is exactly doubled. The undoubled
  normalized value becomes the following level's smoothing baseline, and the
  modifier clears after that level.
- Bonus stack counts are lifetime acquisition counts. They continue to drive
  offer caps, the card's `В наявності: N`, and pause-menu inventory after a
  temporary effect has been consumed; they are not active-effect strength.
  Only one choice can arm a boundary, so Hide Under a Blanket and Twitter Fight
  cannot overlap in ordinary play.

## Enemy navigation idea

Visitors use the existing enemy simulation and compare routes lexicographically:
first by the number of tower-exposed destination cells entered, then by
estimated physical travel and wall-breaking time. The deterministic
`Up`, `Right`, `Down`, `Left` order resolves a remaining tie. Any route with no
tower exposure therefore beats every exposed alternative regardless of its
length or the number of breakable walls on it. If no zero-exposure route exists,
visitors choose the route with the fewest exposed cells before considering
physical time.
A route may go around walls or through walls.

Examples:

- A fast, weak enemy usually takes a longer open route because movement is cheap and breaking walls is slow.
- A slow, strong enemy may take a direct route through a wall because detouring is expensive and breaking the wall is quick.

The game is expected to have approximately three or four navigation profiles and hundreds of simultaneous units per profile.
The implementation must therefore avoid one pathfinding calculation per unit.

## Special Roach levels

- Absolute levels 15 and 77 replace the ordinary generated population with
  exactly one compact group of 100 `roach` enemies. No weak, fast, or strong
  visitors appear in either special level; adjacent levels retain the ordinary
  progression.
- The first Roach spawns immediately and every later Roach spawns after a fixed
  500 ms simulation interval. The ordinary late-level cadence does not apply to
  these two replacement levels.
- Roach uses five times the base weak HP and three times the base weak speed:
  exactly 75 HP and 7.2 cells per second. Its group count, HP, speed, and
  one-point social-battery healing never scale with the level number and ignore
  Burn Bridges, Move, and Earplugs bonuses. Terrain multipliers such as paper
  debris still apply while crossing that terrain.
- Roach instantly breaks any book wall on first contact. This destroys a cat
  supported by that wall, leaves the ordinary damaged-book debris, and publishes the
  same single navigation rebuild as every other combat wall destruction.
- Reaching the introvert restores one social-battery point, clamped to the
  current maximum, then resolves the Roach normally. It never damages the
  battery and never triggers damage audio or hit presentation.
- Roach remains a normal tower-combat target with one HP pool. Basic, rapid,
  and heavy cats, including both heavy splash zones, can damage and kill it
  before it reaches the core.
- Burn Bridges and Twitter Fight never change the fixed 100-Roach group. If a
  temporary payout modifier is applied to a Roach plan, Twitter Fight still
  doubles its normalized completion reward and Hide Under a Blanket still pays
  zero; blanket protection does not suppress Roach's one-point healing.
- Presentation uses one original right-facing, handstand-galloping horse
  sprite in the same cozy cartoon-comic style as the other visitors.

## Visitor interaction with book walls

Base wall damage per attack is 4 for weak enemies, 2 for fast enemies, and 8
for strong enemies. Ordinary levels below 20 use those values directly; level
20 and later apply the late damage curve defined above. The resulting effective
damage remains part of the level-shared navigation profile because it affects
the estimated time required to break a book wall.

When an enemy's field points into a cell containing a wall:

1. The enemy remains in the adjacent cell.
2. Its movement state pauses.
3. It enters an `attacking-wall` state and plays a social-activity attack
   animation, such as a speech bubble, invitation, or karaoke burst.
4. Its attacks reduce the wall's HP.
5. Multiple enemies may attack the same wall.
6. When the wall is destroyed, its cell becomes persistent nonblocking paper
   debris and navigation fields are rebuilt once for that combined cost
   change.
7. Enemies attacking that wall stop attacking and continue using the new field.

Roach is the explicit exception to the timed attack loop: its navigation
profile prices wall breaking at zero time, and its first contact performs the
ordinary destruction transaction immediately while still emitting one attack
effect for presentation.

Paper debris halves real movement speed while an enemy traverses its cell. The
shared flow fields price the same traversal as twice ordinary movement time, so
route choice and runtime travel remain consistent. Debris never attacks or
damages an enemy; it is only slower terrain.

For the first version, an enemy that starts attacking a wall remains committed to that wall until it is destroyed, the enemy dies, or the target becomes invalid.

## Reaching the introvert

When an enemy enters the core cell:

1. Emit an `enemy:reached-core` event.
2. Reduce core HP, presented in the UI as social-battery charge, by the enemy's
   core damage.
3. Remove or recycle the enemy.
4. If core HP reaches zero, emit a defeat event.

Ordinary core damage first derives from that level's scaled damage as
`coreBase = max(1, floor(scaledDamage / 4))`. Earplugs is then applied exactly
once to `coreBase`, using nearest-integer rounding and the same minimum of 1;
it is never reapplied at core arrival. Before level 20, without bonuses, the
resolved values remain 1 for weak, 1 for fast, and 2 for strong visitors.
While Hide Under a Blanket is active, each ordinary arrival resolves with zero
core damage without emitting damage feedback or evaluating defeat; the stored
battery value remains unchanged.
Roach instead emits a distinct healing arrival and restores exactly one point
up to the current maximum.

## Prototype arena rendering

- The application opens on a dedicated 1080x1080 start menu rather than
  constructing the gameplay scene immediately. The menu contains a full-screen
  cartoon illustration, the title `Куточок тиші`, and one centered icon-only
  Play control; Enter and Space activate the same transition.
- One continuous cream-and-blush reading-room background covers the complete
  1080x1080 arena. `cozy-arena-floor-v2.png` is scaled once to the arena bounds;
  it is not repeated per 30x30 cell. Its medium-scale parquet, woven zones,
  stars, and leaves stay low contrast so characters and book walls remain
  readable.
- The construction grid is a separate overlay and is visible only while a
  wall, tower, or sell tool is active during a build phase.

## Prototype audio

- The start menu has one cozy looping music theme. Entering gameplay replaces
  it with one separate looping level theme, which continues through active
  levels and the unlimited build phases without overlapping the menu loop.
- Each damaging wizard-cat type has a matching casting/shot sound. The
  introvert plays a short reaction sound whenever a visitor drains her social
  battery, and defeat stops the level music before playing a dedicated loss
  cue.
- Each admitted `Кошенятко` meow randomly selects one of thirteen extracted
  WAV variants exposed by the typed `KITTEN_MEOW_KEYS` bank. Selection is a
  presentation-only choice and never enters the simulation event, freeze
  state, navigation, or deterministic replay data. All thirteen variants share
  one real-time family cooldown of 500 ms and one combined voice, so several
  kittens cannot bypass the limiter by selecting different files. This family
  remains outside the shared combat-shot budget.
- Dense cat fire uses one shared presentation budget instead of playing one
  sound for every authoritative shot event. Shots received during each 150 ms
  window are represented by at most one cue, selected in the priority order
  heavy, basic, then rapid. The combined shot pool permits at most six cues in
  any rolling real-time second and at most two simultaneous voices across all
  three cat sounds. Shot assets are mixed approximately 7 dB below their
  original levels. This batching never removes or delays simulation damage,
  projectiles, or casting animation.
- Interactive controls use quiet generic hover and activation sounds. A
  successful wall or tower placement, a successful sale/removal, an invalid
  construction action, and starting a level have short distinct feedback cues.
  Held wall painting may rate-limit repeated placement sounds so dense building
  remains readable rather than becoming an audio burst.
- Every prototype cue other than the kitten bank remains original WAV content
  produced by the project's procedural audio generator. The thirteen kitten
  variants are derived from the user-supplied `kitten_crying.mp3`; its embedded
  metadata reports artist `344 Audio` and copyright year `2021`, so this
  specification makes no ownership or licensing claim beyond recording that
  the source was supplied by the user. The generator deliberately leaves the
  extracted kitten bank untouched. Browser autoplay restrictions are respected:
  when audio starts locked, the requested music begins only after the first
  eligible pointer or keyboard gesture.
- The 2x, 4x, and 10x controls accelerate simulation and combat visuals only. Music
  and sound-effect pitch and playback rate remain unchanged.
- Pressing Escape during gameplay opens a cozy modal pause popup. The Phaser
  gameplay scene, including simulation input, updates, timers, and combat
  tweens, remains paused until Escape or the Resume control closes the popup;
  the game-scoped level-music loop continues normally while paused. Opening the
  popup discards any incomplete combat-audio batch so an old volley cannot play
  after resume.
- The pause popup exposes two independent 0-100% sliders: one multiplies music
  volume and immediately updates the active loop, while the other multiplies
  every sound effect, including combat and UI feedback. Their values remain in
  effect for the current browser run and across pause/resume transitions; they
  do not change simulation state. The kitten bank uses this same effects
  multiplier, and development-mode muting applies to every variant.
- Beneath the sliders, the pause popup shows the collected bonuses as small
  illustrated icons with their current quantities. It reads a presentation
  snapshot of the run's lifetime acquisition counts and never mutates bonus
  state. A consumed one-level bonus therefore remains visible in this inventory
  even though it is no longer active.

## Prototype camera and construction controls

- The mouse wheel zooms the world camera from 1x through 2.5x around the cursor,
  except that returning to the 1x minimum atomically restores the centered
  full-arena home view.
- At 1x the arena is centered and camera panning is locked. Above 1x, when
  neither wall painting nor rectangular Sell selection owns the left mouse
  button, holding it and dragging pans the camera; arrow keys and WASD also pan
  it. In that zoomed state a map edge may reach the center of the viewport, so
  at most half of the visible screen may extend beyond the level on each axis.
- Holding the left mouse button while the wall tool is active paints walls
  continuously. Sparse pointer samples are joined by a four-connected grid line
  so fast or diagonal drags do not leave gaps.
- The HUD uses a separate camera and remains fixed while the world camera moves.
  Coins, compact level status, the full planned visitor count, and the
  social-battery meter use separate scrapbook-style chips at the top-left
  instead of one notification-style panel. The construction menu is at the
  bottom-left, and one fixed action dock is at the bottom-right. During a build
  phase the dock contains the mint `ПОЧАТИ` action; during an active level the
  same dock contains one row of 2x, 4x, and 10x speed chips. The
  visitor number is the complete count configured for the prepared/current
  level and does not decrease as visitors spawn or leave the arena.
- Player-facing controls are icon-first. Construction buttons pair their object
  icon with the coin price, while sell, Start, resource, visitor, battery, and
  speed controls use immediately recognisable symbols plus only the short text
  needed for their value. Navigation revision and solver counters are developer
  diagnostics and are never shown in the gameplay HUD.
- The build menu is one compact horizontal row ordered as Sell, book wall, then
  the unlocked wizard cats and mine. Every equal-size card shows a large object image
  over its coin price; the coin and the complete integer price form one centered
  inline group with a stable gap, including three-digit prices. Sell uses a
  return symbol instead of a price. Locked cats
  occupy no slot, so the rounded panel shrinks and the remaining cards reflow.
  Hovering a card opens a temporary Ukrainian tooltip with its name and a short
  description.
- HUD panels, tool cards, Start, and speed controls use rounded warm surfaces,
  soft shadows, and restrained cream, blush, lavender, and sage accents rather
  than rigid rectangular debug styling.
- The level Start control is separate from the construction panel. It starts
  only the next available level and is available throughout the manual build
  phase. Its label is only `ПОЧАТИ`; the level number remains in the status
  panel instead of being duplicated in the action.
- Clicking the currently selected construction icon again deselects its tool
  and hides the construction grid. There is no separate Done button.
- While a level is spawning visitors or remains active, the HUD shows 2x, 4x,
  and 10x speed buttons in one row.
  Selecting a speed scales simulation and combat animation time; selecting the
  active speed again returns to 1x. The selected speed remains stored while the
  dock shows `ПОЧАТИ`, through bonus selection, and into the next level. It
  resets only when the run ends or a fresh run is initialized.
- Every available wizard-cat build button includes the matching cat icon.
  Buttons for tower types that have not unlocked are absent rather than shown
  disabled.
- A separate Sell tool removes defenses during a build phase. A click selects
  one cell; holding and dragging previews an inclusive rectangular area, then
  release removes every wall and undetonated mine in it. A supported tower is
  removed with its wall. The complete price of every removed object is
  refunded. One gesture is one simulation transaction and rebuilds all shared
  navigation fields at most once, after every selected wall has been removed.
  While the gesture is held, wheel/keyboard camera transforms are locked and
  HUD-covered pointer positions retain the last visible selection endpoint.

## Endless manual level lifecycle

- Before level 1 and after ordinary completions, the run enters a build phase
  with unlimited time, no countdown, and no automatic start. Every third
  completion first enters the mandatory bonus-choice pause; choosing or
  skipping then prepares and enters the next build phase.
- The player explicitly starts the next level with the separate Start control.
- Book walls, wizard cats, their maximum HP, the coin balance, and the girl's
  remaining social battery persist across the entire endless run on the shared
  arena. Surviving walls enter every post-level transition at full HP. The
  transition also credits the bounded
  reward derived from the just-completed immutable level plan exactly once.
- The next level plan, including its deterministic spawn points and
  bonus-adjusted enemy counts, is prepared only after a pending bonus choice is
  resolved, then remains fixed throughout construction so the displayed
  preview and navigation validation match the level that will start.
- The prepared compact group counters are streamed through the deterministic
  interleaver; the scheduler never expands a level into a per-visitor queue.
- All navigation fields are current before a level starts. During an active
  level, fields are rebuilt when a wall is destroyed and leaves debris. A
  successful replacement build clears debris in the same construction
  transaction and publishes fields for the resulting wall cost rather than an
  intermediate ground state.
- Completing any level returns through the optional bonus boundary to the next
  manual build phase. There is no level-completion victory; only depleting the
  social battery ends the run in defeat. Selecting the unique blanket option
  instead protects exactly the next level and forfeits that level's payout.
- The final screen reports
  `Витримано соціальних подій: <completed level count>`. A failed current level
  is never included. The best completed-level count is stored in browser
  `localStorage`; a strictly higher result replaces it and adds a `NEW RECORD`
  badge. Equal and lower results keep the existing record.
- The defeat overlay reuses the exact `Сховатись під ковдру` bonus illustration.

## Development level launch

- Vite development mode accepts `?devLevel=N`, where `N` is a positive safe
  integer. A valid value skips the title screen and opens the unlimited build
  phase immediately before level `N`; it never starts the wave automatically.
- The launch is a fresh diagnostic run: pristine arena, full base social
  battery, the ordinary 20 coins plus a 1,000-coin diagnostic bonus, no bonus
  stacks, no synthesized rewards, and zero levels actually completed. The
  prepared plan, enemy stats, spawn points, visitor total, and cat unlocks all
  use level `N` directly.
- Previous levels are not simulated or materialized. Starting the selected
  wave still builds exactly one shared flow field per active navigation
  profile, never one field per skipped level or enemy.
- A compact development toolbar can replace `N` and reload the same contract.
  Developer-launched results never update the browser High Score.
- Every Vite development launch initializes both music and effects volume to
  zero. The pause-menu sliders may opt back into audio for the current run;
  production defaults remain unchanged.
- Production builds ignore both the query parameter and forged scene launch
  data, preserving the ordinary title-screen level-1 start.

The navigation invalidation API must still be generic enough to support future
construction during an active level. If that is enabled, `wall:built` and
`wall:upgraded` must also invalidate fields.

## Initial non-goals

- Multiplayer
- Server backend
- Account system
- Physics-based movement
- Enemies acting as pathfinding blockers
- Air units
- General-purpose or stacking status-effect framework beyond the kitten freeze
- Complex tower upgrade trees
- Multiple arenas or a branching map campaign
- Desktop packaging before the browser prototype works

## Open product decisions

These must be resolved before their corresponding features are implemented:

- Are diagonal attacks allowed while movement remains four-directional?
- Can enemies change navigation profile during an active level?
- Is wall damage used in future field rebuilds, or does navigation always price a wall from `maxHp`?

Resolved for the prototype: multiple enemies may share one logical cell. Small deterministic visual offsets keep overlapping sprites readable; enemy occupancy never invalidates the global field.
