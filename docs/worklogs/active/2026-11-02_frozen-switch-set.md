# The frozen switch boundary is a set of ids, not an index

Operator instruction (2026-11-02): "lets do the readonly set", against the argument that "the switch test ordering
doesnt make sense. conceptually this is an unordered set".

## What was wrong

`packages/agent/test-support/legacy-features.ts` derived the legacy fixture boundary from a **position**:

```ts
const LAST_FROZEN_SWITCH:SwitchableFeature="map-observability-v1";
export const FROZEN_SWITCH_COUNT=SWITCHABLE_FEATURES.indexOf(LAST_FROZEN_SWITCH)+1;
if(FROZEN_SWITCH_COUNT===0)throw new Error(`${LAST_FROZEN_SWITCH} left the registry`);
export const LATER_SWITCHES=SWITCHABLE_FEATURES.slice(FROZEN_SWITCH_COUNT);
```

Nothing about a flag set is ordered, so that index meant nothing on its own — but it was load-bearing:

- Deleting any frozen id **before** the anchor shifted the boundary by one, pulling the anchor across into
  `LATER_SWITCHES` and rebuilding `LEGACY_ALL_ON` / `BATCH_DEFAULTS_OFF` from the wrong set. That is what turned a
  single deletion into 124 red test files and 154 failures.
- Deleting the anchor itself threw, which made `map-observability-v1` structurally undeletable.
- Registering a switch silently depended on it landing at the end of the array.

## What replaced it

```ts
export const FROZEN_SWITCHES:ReadonlySet<SwitchableFeature>=new Set<SwitchableFeature>([ /* the 276 ids */ ]);
export const LATER_SWITCHES=SWITCHABLE_FEATURES.filter(id=>!FROZEN_SWITCHES.has(id));
```

The set is the moment the fixtures froze, recorded as ids. The registry can now grow, shrink or be reordered
without moving the boundary, and retiring an id simply removes a member. Registering a switch still needs no
fixture edit — an unknown id is absent from the set, so it is "later" by definition. That convenience was the only
reason the append-only contract existed, and it survives without the ordering.

## Consumers converted (3, all of them)

| file | before | after |
| --- | --- | --- |
| `packages/agent/src/features.test.ts:28` | `expect(FROZEN_SWITCH_COUNT).toBe(276)` | `expect(FROZEN_SWITCHES.size).toBe(276)` |
| `packages/agent/src/explorer-guidance-v2.test.ts:39` | `SWITCHABLE_FEATURES.slice(0,FROZEN_SWITCH_COUNT)` | `SWITCHABLE_FEATURES.filter(id=>FROZEN_SWITCHES.has(id))` |
| `packages/viewer/src/map-observability-both-arms.test.ts:17` | `slice(FROZEN_SWITCH_COUNT-3,FROZEN_SWITCH_COUNT)` **toEqual ordered array** | membership of the same three ids, **order not asserted** |

The third one previously asserted the *registration order* of the last three frozen switches. That is the assertion
the operator called out, and it is now membership: it still names which ids were frozen, without claiming the
registry has a meaningful sequence.

## New test

`packages/agent/src/frozen-switches.test.ts`, 4 tests:

1. the split has no gap and no overlap (`frozen ∪ later = registry`, `frozen ∩ later = ∅`);
2. deleting a **non-anchor** frozen id (`bag-healing-items-v1`) leaves `LATER_SWITCHES` byte-identical — under the
   old index this moved the boundary and pulled the anchor through;
3. the anchor is now deletable, where the old code threw;
4. a newly registered switch is later without editing a fixture.

Tests 2–4 each fail against the old index implementation by construction; the old code cannot express them.

## Evidence

| suite | result |
| --- | --- |
| agent, full | **376 files / 5339 tests passed** (26.2s) |
| agent, focused (`features`, `explorer-guidance-v2`, `versioned-stacks`) | 43 passed |
| `frozen-switches.test.ts` | 4 passed |
| viewer, focused (`map-observability-both-arms`) | 2 passed |
| viewer, full | 2399 / 2417 passed, exit 1 |

The viewer's exit 1 and 18 missing tests are the pre-existing `panels.test.ts` SIGABRT, **not this change**: with
these edits stashed on clean `main` (`b39827fc8`) it fails identically (`216 passed (234)`, same
`Worker exited unexpectedly with signal SIGABRT`). It is not load-related — it reproduces with the file run alone.

## What this does NOT do

**The collapse is still not unblocked.** This removes the fixture-boundary cause of the cascade, but roughly 180
absolute position assertions remain in individual tests (`SWITCHABLE_FEATURES.at(N)`, `indexOf(id)).toBe(N)`,
`playHarnessFeatures(...).at(-N)`). Those still encode registry order and will still break on a middle deletion.
Converting them is a separate sweep needing per-site judgment — some index into a list for a value, some assert a
specific switch's position — so it is not a blind codemod. The `versioned-stacks.test.ts` ratchet pins the current
stack set in the meantime.

Not run: `just lint`, `just build` as gates, `just verify-vendor`, `just verify-rom`. The change is TypeScript in
two packages plus tests; `tsc -p tsconfig.json --noEmit` on the agent is clean, and the full suites above compiled
and ran everything they touch.
