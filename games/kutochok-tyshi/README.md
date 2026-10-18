# Book Fort — grid-based tower defense prototype

This repository is intended to be developed with Codex in an IDE.

Start by reading `AGENTS.md`, then the files under `docs/`.
The documents deliberately separate stable product decisions from implementation details so future Codex chats can recover the project context from the repository instead of relying on conversation history.

## Current intended stack

- Phaser 4.2.1
- TypeScript 6 in strict mode
- Vite 8
- Vitest 4
- `@dagrejs/graphlib` for one maintained-library weighted search per navigation profile

## Implemented prototype

The repository contains an endless manually paced run on one persistent
1080×1080 arena with a 36×36 grid:

- the protected core is presented as an anime-inspired introverted girl, and
  her 200 core HP appears in the HUD as a **social battery**;
- the world uses polished cartoon-comic 2D art with shallow pseudo-isometric
  faces and shadows while all simulation and input remain on the unchanged
  orthogonal grid;
- the first build phase starts with 20 coins. Choose **Книжки · 1 монета** to
  reveal the build grid and place affordable book walls;
- hold the left mouse button and drag to paint a connected run of walls instead
  of clicking each cell separately;
- the complete outer cell ring is unavailable for construction;
- `cozy-arena-floor-v2.png` is drawn once across the full 1080×1080 arena,
  while neighboring book-wall tiles join through one deterministic N/E/S/W
  autotile;
- book walls have 100 base HP and one fixed visual width. A cat raises its
  supporting wall to 150 HP, but never enlarges or swaps the wall visual;
- use the mouse wheel to zoom from 1× to 2.5×. At the 1× home view the arena is
  centered and camera movement is locked; above 1×, drag with the left mouse
  button whenever neither wall painting nor Sell selection is active, or use
  WASD/arrow keys, to move the world camera up to half a viewport beyond the
  level edge. Returning to 1× automatically restores the centered full-arena
  view;
- choose **Прибрати** and click one defense, or drag an inclusive rectangle, to
  remove every book wall, attached cat, and undetonated mine in the selected
  cells. Selling refunds all complete construction prices, while combat
  destruction refunds nothing;
- click the active book, sell, or cat icon again to deselect it and hide the
  construction grid; there is no Done button;
- use the separate **Почати рівень N** control to start every next level;
- after every completed level the game waits in a build phase with unlimited
  time and no automatic start. Books, cats, wall HP, and social-battery HP
  persist for the whole run;
- while a level is active, use **2×** or **4×** to accelerate simulation and
  combat animations; press the selected speed again for 1×;
- place an unlocked cat mage, spark cat, or sage cat on a book-wall tile for
  5, 8, or 11 coins. The basic cat is available for level 1, the rapid cat
  unlocks for level 4, and the heavy cat unlocks for level 10. Locked-cat
  controls are not shown at all before their build phase;
- wizard cats cast automatically, visitor HP bars show combat damage, and
  destroying a supporting book wall also removes its cat;
- combat-destroyed walls leave persistent paper debris. The cell remains
  passable but takes twice as long to cross; building a replacement wall clears
  it, while selling a wall never creates debris;
- cat buttons contain matching icons; cats face the target and cast distinct
  magical projectiles along the shot direction; full-health bars stay hidden;
- the harmless `Кошенятко` uses a typed bank of thirteen short WAV meows
  extracted from the user-supplied `kitten_crying.mp3`. Each admitted pulse
  randomly chooses one variant, while the complete bank shares one 500 ms
  real-time cooldown and one voice and remains outside the combat-shot budget.
  The effects slider and development mute cover the complete bank, while game
  speed never changes its playback rate or pitch;
- basic towers deal 10 damage at 1/s, and rapid towers deal 6 at 2.5/s. Heavy
  towers fire at 0.2/s into the densest in-range logical cell: 60 direct plus
  20 target-cell damage hits the primary, every other enemy there takes 20,
  and enemies in four cardinal neighboring cells take 15. The layered impact
  never damages walls and has a distinct cell wave and collateral flashes;
- weak and fast social visitors carry coffee or invitations, while each strong
  visitor is drawn as one noisy crowd. The crowd remains one logical enemy with
  unchanged behavior, collision, and navigation. The three profiles compare
  detours with book-breaking cost and deal 4, 2, and 8 wall damage respectively;
- level-1 visitors have 15/10/40 HP and move at
  `2.4`/`5.6`/`4 / 3` cells per second for weak/fast/strong. Through level 19,
  HP increases by 1 every two levels and movement gains 1 cell/s every three
  levels. From level 20, ordinary HP grows by one eighth of its level-19 value,
  damage by one quarter of base damage, and movement by one twentieth of its
  level-19 value per further level. Every type still shares one stable-ID,
  level-specific navigation field;
- levels 15 and 77 are joke replacement waves containing exactly 100
  handstand-galloping Roaches and no ordinary visitors. Every Roach has fixed
  75 HP and 7.2 cells/s, spawns at a fixed 500 ms interval, instantly breaks
  any book wall, heals one social-battery point on arrival, ignores enemy
  stat/count bonuses, and can still be damaged or killed by all cats;
- weak visitors begin with 10 on level 1, fast visitors with 5 on level 4, and
  strong visitors with 1 on level 10. Each unlocked type's next count uses
  `ceil(previous * 1.4)` through level 15 and `ceil(previous * 1.15)` on levels
  16–19. From level 20, weak/fast/strong counts use type-specific growth of
  `1.02`/`1.05`/`1.18` and stop at `2500`/`1250`/`1500` respectively;
- spawn intervals fall from 500 ms on level 1 to 50 ms on level 10, then use
  40/30/20 ms on levels 11/12/13 before reaching 10 ms on level 14. Levels
  20/21/22/23 use 8/6/4/2 ms, after which the cadence stays capped at 500
  visitors per simulation second; the Roach replacement levels 15 and 77
  instead use their fixed 500 ms cadence;
- reaching the introvert drains one quarter of an ordinary visitor's
  level-scaled damage, floored and kept at least 1; Earplugs then modifies that
  core value once. This is 1/1/2 for the three types before late scaling. A
  Roach instead restores one up to the current maximum;
- levels 1–4 use one bottom-center spawn. Level 5 has two active spawns, then
  one is added every five levels up to 100; from level 5 all active points are
  unique deterministic pseudo-random edge cells prepared before building;
- level completion always leads to the next build phase. The default endless
  mode has no campaign-victory level and ends only when the social battery is
  depleted;
- entering each post-level build phase credits, exactly once, the rounded and
  20-to-200-clamped value of
  `10 + weak×0.1 + roach×0.1 + fast×0.2 + strong×0.5` from the completed level.
  Starting with completed level 12, that granted reward may
  rise by at most 20 coins over the preceding granted reward. The persistent
  whole-coin balance never becomes negative; only successful construction
  spends coins;
- destroying a wall rebuilds all shared profile fields with the resulting
  paper-debris cost and resumes its attackers.
- the fixed HUD places coins, status, and social battery at top-left,
  construction at bottom-left, and active-level speed controls at bottom-right;
- shadows, walking bobs, build pops, cat casting, magical impacts, hit
  reactions, poofs, and level banners provide presentation animation without
  changing authoritative game state.

Run locally:

```text
npm install
npm run dev
```

`npm run generate:audio` reproducibly rebuilds the project's original
non-kitten cues. It intentionally does not create or overwrite the thirteen
extracted kitten variants. The supplied source metadata reports artist
`344 Audio` and copyright year `2021`; this repository description records the
source as user-supplied and makes no additional ownership or licensing claim.

### Start from a specific level in development

Open the Vite development server with a `devLevel` query parameter, for
example:

```text
http://127.0.0.1:5173/?devLevel=10
```

This skips the title screen and opens the unlimited build phase immediately
before level 10; the wave still starts only after the ordinary Start button is
pressed. The compact **DEV** level picker in the upper-right corner can reload
the game at any other positive whole-number level. Direct `?devLevel=N` URLs
are the standard shortcut for future browser testing of level-specific
features.

Each such launch is intentionally fresh: the arena is empty, the social
battery is full, the balance is 1,020 coins (the ordinary 20 plus a 1,000-coin
diagnostic bonus), skipped levels grant no rewards or bonuses, and only levels
actually completed in that launch count toward the final score. Development
runs never update the saved High Score. Production builds ignore both the query
parameter and the scene override.

Verification:

```text
npm run test
npm run typecheck
npm run lint
npm run build
```

See `PROMPTS.md` for suggested first Codex tasks.
