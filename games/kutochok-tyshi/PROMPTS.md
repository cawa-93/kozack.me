# Suggested Codex prompts

## 1. First repository audit

```text
Read AGENTS.md and every file under docs/. Do not write game code yet.

Inspect the repository and report:
1. your understanding of the core gameplay and the shared flow-field requirement;
2. decisions already fixed versus open product decisions;
3. the smallest technical spike needed to validate Phaser 4 plus the candidate grid/pathfinding library;
4. package/API compatibility risks that must be verified from current primary sources;
5. a file-by-file plan for Phase 0.

Critical constraint: do not propose per-unit A*, and do not implement A*, Dijkstra, a heap, or a priority queue from scratch.
```

## 2. Implement Phase 0 only

```text
Read AGENTS.md, docs/NAVIGATION_FLOW_FIELD.md, docs/DECISIONS.md, and Phase 0 in docs/IMPLEMENTATION_PLAN.md.

Implement only the Phase 0 dependency/navigation spike. First verify current package compatibility. Use a maintained library for the all-cells weighted search. Do not start the full game architecture yet.

The spike must visibly demonstrate one wall, one core, and two profiles:
- fast/weak prefers walking around;
- slow/strong prefers breaking through.

Add a debug visualization of accumulated cost and next direction. Run typecheck, tests, and production build. Document exact library APIs used, any caveats, and whether the candidate is approved for Phase 1.
```

## 3. Scaffold the real project after the spike passes

```text
The Phase 0 spike has been approved. Read AGENTS.md and the docs again.

Implement Phase 1 only. Preserve domain/rendering separation, TypeScript strict mode, and the documented scripts. Reuse only the validated parts of the spike. Do not implement enemy movement, wall combat, towers, or waves yet.

At the end, run tests, typecheck, lint, and build, then summarize the result and list any deviations from the docs.
```

## 4. Review a completed phase

```text
Review the current working tree against AGENTS.md and the acceptance criteria for Phase N in docs/IMPLEMENTATION_PLAN.md.

Look specifically for:
- accidental per-unit pathfinding;
- Phaser dependencies leaking into domain code;
- reversed edge costs in the reverse search;
- nondeterministic tie-breaking;
- missing tests or commands that were claimed but not run;
- unnecessary abstractions or dependencies.

Do not modify code yet. Return findings ordered by severity with file and line references, followed by the smallest repair plan.
```
