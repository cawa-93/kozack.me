# Repository instructions for Codex

## Project

This repository contains a simple 2D grid-based tower-defense game.
The player protects a central core by building walls that alter enemy movement.
Enemies may walk around a wall or break through it, depending on which option is faster for their navigation profile.

## Required reading

Before planning or changing code, read:

1. `docs/PRODUCT_SPEC.md`
2. `docs/NAVIGATION_FLOW_FIELD.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DECISIONS.md`
5. The relevant phase in `docs/IMPLEMENTATION_PLAN.md`

Treat these documents as the source of truth. If code and documentation disagree, report the discrepancy before silently changing the design.

## Engineering constraints

- Use TypeScript with `strict: true`.
- Preferred runtime stack: Phaser 4, Vite, and Vitest.
- Preferred grid/pathfinding integration: a maintained Phaser-compatible library such as Rex Board, after verifying current Phaser 4 compatibility and API behavior.
- Do not implement A*, Dijkstra, a binary heap, or a priority queue from scratch unless the user explicitly changes this decision.
- Never run pathfinding separately for every enemy unit.
- Build one shared reverse-cost/flow field per `NavigationProfile`.
- Hundreds of units of the same profile must share the same field.
- Enemy units do not block the global navigation field.
- Keep simulation/domain state separate from Phaser rendering objects.
- Use four-directional grid movement unless the product specification is changed.
- Avoid a physics engine for basic enemy movement.
- Use deterministic tie-breaking in navigation so identical states produce identical directions.
- Add or update automated tests for navigation and game-state changes.
- Prefer small, reviewable changes over broad rewrites.
- Do not add React, Vue, a backend, ECS, or desktop packaging during the initial prototype.

## Workflow

For a complex task:

1. Inspect the repository and relevant docs.
2. State assumptions and identify conflicts.
3. Produce a short implementation plan.
4. Implement only the requested phase or feature.
5. Run the appropriate checks.
6. Summarize changed files, behavior, tests, and any remaining risks.

Do not claim a command passed unless it was actually run successfully.
Do not modify package versions blindly; verify compatibility before installing dependencies.

## Expected commands

Once the project is scaffolded, keep these scripts working and update this section if names change:

- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run typecheck`

## Definition of done

A task is complete only when:

- the requested behavior is implemented;
- TypeScript type-checks;
- relevant tests pass;
- the production build succeeds when applicable;
- documentation is updated when an architectural decision or public contract changes;
- no per-unit pathfinding was introduced.
