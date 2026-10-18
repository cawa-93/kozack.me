# Phase 0 dependency and navigation spike

Date: 2026-08-30

## Result

Approved stack:

- `phaser@4.2.1`
- `@dagrejs/graphlib@4.0.5`
- `vite@8.2.2`
- `typescript@6.0.2`
- `vitest@4.1.11`

Phaser 4.2.1 is a stable npm release and builds with the repository's Vite/TypeScript toolchain. Graphlib is the approved weighted graph-search implementation.

## Navigation API used

For every real forward move `u -> v`, the graph stores the encoded route score
of entering `v`: its binary tower-exposure value plus a snapshot-normalized
fraction of physical enter time. Graphlib runs one `alg.dijkstra` call from the
core with `graph.inEdges(node)` as its traversal edge function. This yields the
minimum forward lexicographic route rank from every reachable cell to the core
without reversing the edge semantics.

The adapter then:

1. copies library distances into `Float64Array`;
2. derives one deterministic `Up`, `Right`, `Down`, or `Left` byte per cell;
3. publishes a complete `FlowFieldSet` atomically;
4. lets all enemies of the same profile share the same arrays.

No enemy invokes Graphlib and no project code implements Dijkstra, A*, a heap, or a priority queue.

## Rex Board finding

`phaser4-rex-plugins@4.2.0` supports Phaser 4 and its `findArea` API can perform weighted expansion. It was not selected because its published package and Board/chess lifecycle are disproportionate for a rendering-independent domain service, and its runtime cost property/nullability do not fully match the declarations inspected during the spike.

Primary references:

- Phaser 4.2.1 release: <https://phaser.io/download/release/v4.2.1>
- Graphlib implementation: <https://github.com/dagrejs/graphlib/blob/v4.0.5/lib/alg/dijkstra.ts>
- Graphlib API types: <https://github.com/dagrejs/graphlib/blob/v4.0.5/dist/types/lib/alg/dijkstra.d.ts>
- Rex pathfinder API: <https://rexrainbow.github.io/phaser3-rex-notes/docs/site/board-pathfinder/>

## Verification

The production-shaped adapter has automated coverage for empty grids, zero-damage wall blockers, weak-around versus strong-through routing, shared profiles, 1,000 field reads without solver calls, asymmetric reverse costs, and deterministic ties.
