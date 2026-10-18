# Navigation and flow-field specification

## Core rule

Do not calculate an individual path for each enemy.
Create one shared flow field for every distinct `NavigationProfile`.

A unit asks only:

> From my current cell, which neighboring cell should I enter next?

## Navigation profile

A navigation profile contains only values that affect route choice.
Visual appearance, HP, rewards, and unrelated combat stats do not create a new field.

Suggested contract:

```ts
export interface NavigationProfile {
    readonly id: string;
    readonly cellsPerSecond: number;
    readonly damagePerHit: number;
    readonly attackIntervalMs: number;
    readonly instantWallBreak?: boolean;
}
```

Two enemy definitions may share one navigation profile.

Between levels, Move and Earplugs bonuses resolve one new effective profile per
ordinary enemy type: speed is multiplied by `0.91^moveStacks` with a 0.25
cells/s floor, and wall damage by `0.91^earplugStacks` with nearest-integer
rounding and a minimum of 1. The special Roach profile remains fixed at 7.2
cells per second and `instantWallBreak: true`, independent of those bonuses.
Profile IDs remain stable, and every matching unit still shares the one
resulting field. Bonus math is never evaluated as per-unit pathfinding.

One-level bonus state also stays outside navigation ownership. Twitter Fight
changes compact level-group counts before the immutable plan is published, but
does not change an enemy definition or create a new profile. Hide Under a
Blanket changes only authoritative core-arrival resolution and the heroine's
presentation override; it does not change movement, walls, or route cost. Burn
Bridges followed by Twitter Fight may therefore change how many units read a
field, never how many shared fields are built.

## Grid model

Movement is four-directional:

- up
- right
- down
- left

A cell may contain separate logical layers:

```ts
export interface GridCell {
    readonly terrain: TerrainLayer;
    readonly structure: StructureLayer | null;
}
```

The navigation solver must use an immutable grid snapshot for each build.

That navigation snapshot also contains one binary tower-exposure value per
cell. It is derived once from all standing towers whenever the shared fields
are rebuilt. Basic, rapid, and heavy towers use their exact five-cell Euclidean
radius; Kitten uses its exact ten-cell Euclidean radius. A cell covered by any
number of tower ranges has exposure `1`, so overlaps do not stack. Mines are
excluded. The same exposure array is reused for every navigation profile in
that rebuild.

The prototype terrain layer distinguishes ordinary ground from persistent
paper debris left by combat-destroyed book walls. Paper debris is traversable,
does not occupy the structure layer, and uses a terrain multiplier of `2`.
Successfully building a replacement wall clears debris before the new snapshot
is published. Selling a wall does not create or restore debris.

## Forward route score

The field compares complete routes lexicographically:

1. minimize the number of tower-exposed destination cells entered;
2. among routes with the same exposure count, minimize authoritative estimated
   physical time, including ground movement, debris, and wall breaking;
3. resolve a remaining local direction tie in `Up`, `Right`, `Down`, `Left`
   order.

Consequently, any zero-exposure route beats every exposed alternative even if
the safe route crosses half the arena and breaks ten walls. When every route is
exposed, one exposed destination beats two regardless of physical distance;
physical time decides only after exposure counts tie. Exposure remains binary,
so overlapping tower ranges never add more than one danger step per entered
cell.

First calculate each destination's physical enter cost. For ordinary ground:

```text
movementTimeMs = 1000 / cellsPerSecond
physicalEnterCost = movementTimeMs * terrainMultiplier
```

The current terrain multipliers are `1` for ordinary ground and `2` for paper
debris. The multiplier belongs to the destination cell. Runtime traversal must
apply that terrain rule: entering and crossing debris takes twice as long, or
equivalently moves at half the profile's ordinary-ground speed. Applying the
terrain multiplier only in the solver or only in movement is invalid because
route choice would disagree with authoritative physical time.

For a wall:

```text
hitsRequired = ceil(routeHp / damagePerHit)
breakTimeMs = hitsRequired * attackIntervalMs
physicalEnterCost = movementTimeMs + breakTimeMs
```

For a profile with `instantWallBreak: true`, `breakTimeMs` is exactly zero and
the wall's physical enter cost is `movementTimeMs`. Runtime must perform the
matching destruction transaction on first contact. Do not model the exception
with JavaScript `Infinity` or a zero attack interval: both violate the finite
profile contract and a zero interval can make the attack loop non-terminating.

For permanently blocked terrain:

```text
physicalEnterCost = Infinity / library BLOCKER value
```

Graphlib accepts one finite scalar edge weight, so each field build encodes the
two route components without using an arbitrary fixed danger constant:

```text
cellCount = width * height
maxFinitePhysicalEnterCost = max(all finite physicalEnterCost values)
physicalFraction =
    (physicalEnterCost / maxFinitePhysicalEnterCost) / (4 * cellCount)
enterScore = towerExposure == 1
    ? 1 + physicalFraction
    : physicalFraction
```

Permanent blockers keep an infinite score and are omitted from finite graph
edges. Every finite physical fraction is positive. A simple route contains
fewer than `cellCount` moves, so all of its physical fractions sum to less than
`1/4`: one additional exposed destination therefore always dominates every
possible physical detour. Routes with equal exposure counts compare the same
normalized sum, preserving the ordering of their real physical times. Store
the accumulated route score in `Float64Array`; it is a solver rank, not a
duration in milliseconds.

Tower exposure changes route priority only and never changes runtime speed.

`routeHp` policy for the prototype:

- Build fields using the wall HP snapshot at field-generation time.
- Do not rebuild after every hit.
- Rebuild when the wall is destroyed.
- This intentionally favors stable behavior over continuously perfect optimization.

## Reverse cost map

The solver starts at the core and expands outward across the entire grid.
The result for each cell is the minimum encoded route score to the core.

This is reverse Dijkstra / an integration field conceptually, but the graph search must be provided by a maintained library. Custom project code may adapt library output; it must not reimplement the graph-search algorithm.

Because the search runs in reverse, carefully verify edge-score direction. The
stored value must represent the forward lexicographic route score from a cell
toward the core: the entered destination's exposure bit plus its normalized
physical cost. Add asymmetric test cases with walls so an accidentally reversed
cost callback cannot pass unnoticed.

## Direction field

After the library has produced accumulated cost for every reachable cell, derive one direction byte per cell by examining the four neighbors and choosing the neighbor with the lowest valid forward total:

```text
forward enter score of neighbor + neighbor's accumulated score
```

This local conversion is allowed. It is not a second pathfinding implementation.

Suggested compact representation:

```ts
export const enum FlowDirection {
    Up = 0,
    Right = 1,
    Down = 2,
    Left = 3,
    None = 255,
}

export interface FlowField {
    readonly profileId: string;
    readonly gridRevision: number;
    readonly width: number;
    readonly height: number;
    readonly costToCore: Float64Array;
    readonly nextDirection: Uint8Array;
}
```

Index formula:

```ts
const index = y * width + x;
```

Use deterministic tie-breaking, for example `Up`, `Right`, `Down`, `Left`, unless game design later requires directional variety.

## Field ownership

```ts
export type FlowFieldSet = ReadonlyMap<string, FlowField>;
```

There is one active `FlowFieldSet` for the current grid revision.
All units with the same profile read the same arrays.

## Rebuild lifecycle

Build all fields:

- before an active level begins;
- after a tower is placed, using a candidate exposure snapshot that already
  includes that proposed tower;
- after `wall:destroyed`, which atomically replaces that structure with paper
  debris, removes any supported tower exposure, and changes the
  destination-cell cost;
- after a replacement wall is built over debris, clearing the terrain marker
  and installing the wall in the same topology revision;
- after one completed rectangular Sell transaction removes one or more walls;
  all selected structures are removed first, then exactly one final field set
  is rebuilt regardless of the rectangle size;
- after Thick Literature atomically increases the current HP of every standing
  wall, because the wall-break route cost changes even though topology does not;
- later, after any other event that changes navigational topology or cost.

Rebuild behavior:

1. Capture an immutable grid snapshot and derive one binary tower-exposure
   array for the complete candidate structure state.
2. Build every profile's field into a new set.
3. Validate that required spawn cells can reach the core.
4. Atomically replace the old active set with the new set.
5. Increment or preserve the matching grid revision.
6. Resume enemies affected by the topology change.

Units already moving between cells may finish that transition. On the next cell decision they read the newly active field automatically.

## Enemy runtime lookup

A moving enemy stores:

```ts
interface EnemyNavigationState {
    readonly profileId: string;
    cellX: number;
    cellY: number;
}
```

At each cell boundary:

1. Read `nextDirection[index]` from the active field for the profile.
2. Resolve the neighboring cell.
3. If direction is `None`, enter a safe `stuck` state and report diagnostics.
4. If the next cell contains a wall, attack it from the current cell, or break
   it immediately when the shared profile declares `instantWallBreak`.
5. Otherwise move to the next cell using that destination terrain's movement
   multiplier; paper debris therefore takes twice ordinary traversal time.
6. If the next cell is the core, resolve core damage on arrival.

No unit stores a complete route array.
No unit invokes the pathfinder.

## Wall attackers index

Maintain an index:

```ts
Map<WallId, Set<EnemyId>>
```

This is used to resume only the enemies attacking a destroyed wall.
Do not register one global event listener per enemy.

## Congestion

Enemies must not be global blockers in the flow-field build.
For the prototype, multiple enemies may share a logical cell or use small visual offsets.
Any later crowd behavior must be a local steering/reservation layer and must not trigger global pathfinding after every unit move.

## Library spike requirements

Before committing to Rex Board or another library, create a minimal technical spike proving that the selected version can:

1. represent the project grid;
2. apply a dynamic weighted cost callback per navigation profile;
3. perform an all-reachable-cells search from the core;
4. expose accumulated cost for every reachable cell;
5. treat selected cells as blockers;
6. work with current Phaser 4 and TypeScript builds;
7. rebuild after a wall is removed.

Do not build the full game until this spike passes.

## Required navigation tests

At minimum:

1. Empty grid points every reachable cell toward the core.
2. Permanently blocked cells are never selected.
3. A fast/weak profile walks around a test wall.
4. A slow/strong profile breaks through the same test wall.
5. Two enemy definitions sharing a profile use the same `FlowField` object.
6. One thousand units can read the same field without invoking the solver.
7. Destroying a wall changes the grid revision and swaps all fields.
8. Moving units use the new field at their next cell boundary.
9. Attackers of the destroyed wall resume.
10. Unreachable spawn cells are reported clearly.
11. Edge-cost direction is correct in reverse search.
12. Tie-breaking is deterministic.
13. Debris is traversable but has exactly twice ordinary-ground movement cost
    in both the field and runtime traversal.
14. Destroying a wall publishes fields that include debris in its former cell;
    building a replacement clears that debris without publishing an
    intermediate terrain-only field.
15. Selling a wall leaves ordinary ground and never creates debris.
16. A zero-exposure route wins even when it crosses half the arena and requires
    breaking ten walls while the exposed alternative is short and open.
17. When every route is exposed, fewer exposed destination cells win before
    physical travel or wall-breaking time; equal exposure counts fall back to
    physical time and then deterministic `Up`, `Right`, `Down`, `Left` order.
18. Overlapping ranges remain one binary exposure and do not stack; basic,
    rapid, heavy, and Kitten use their exact Euclidean radii, while mines create
    no exposure.
19. Tower exposure changes only the shared field's route score. Runtime
    traversal duration on exposed ordinary ground remains identical to
    unexposed ordinary ground for the same profile.
20. A newly placed tower is present in the candidate exposure snapshot, and
    destroying its supporting wall removes that exposure in the same single
    shared rebuild.

## Performance target

Prototype benchmark target:

- 3–4 navigation profiles;
- several hundred active units per profile;
- benchmark at least 1,000 total active enemies;
- no pathfinder calls caused by individual enemy movement;
- field rebuild cost depends mainly on grid size and profile count, not unit count.

Collect measurements before doing low-level optimization.
