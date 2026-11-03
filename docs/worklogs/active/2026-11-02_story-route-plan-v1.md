# story-route-plan-v1 — per-map route position and the off-plan line

Status: in progress (branch `claude/story-route-plan-v1`, worktree `/private/tmp/pb-route-plan`)
Base: `claude/objective-graph-v1` @ `18d75a254` (the graph this plan's order is checked against)
Evidence: `docs/findings/objective-graph-rescore.md`; the record commentary read at
`(private notes)`

## Problem Statement
The best local campaign (`qwen36-gpu1_0517`) takes the Stone Badge at turn 550 and needs 1,712 more turns
for the Knuckle Badge; its worst single gap is turn 1552 → 2210, **658 turns and 172 minutes with no story
milestone**. `glm53-mac_0d5d` fires 318 loop guards, 314 of them the same `milestone_drought` alarm. A
stall detector is not a plan: the supervisor registers the drought and cannot say what to do about it.
The record run never explores — Granite Cave and Victory Road without Flash, the Sky Pillar biked through
the holes — because it holds an ordered waypoint list and executes it. That list is the missing piece.

## Decisions
- **The plan is the record's order, not the milestone list's order.** Badges 1 → 3 → 4 → 2 → 5 → 6 → 7 → 8:
  Dewford deferred past Mauville and Lavaridge, collected at level 28; Fortree's gym waits for Steven.
- **The plan is data, the position is derived.** `ROUTE_PLAN` is 31 authored steps (`objective`, `area`,
  `waypoint`); the class only counts what landed and how long ago. No runtime map names, so nothing depends
  on `local_map` semantics.
- **Handoff at the first plan step.** The line appears once the first plan step lands; before that the
  `next-milestone-hint-v1` and objective arms answer. Step 1 of 31 in Rustboro while the run is still in
  Littleroot would be a lie about position.
- **Off-plan is a duration, not a mood.** No plan step for more than 200 turns (the bar the re-score used),
  dated from the turn the last step landed: `off-plan since turn 1552`.
- **One next-step line, not two.** With the plan on, its line replaces the objective line: same objective,
  plus area, waypoint and drought date.

## Invariants
- **INV-RP1** — every `requires` edge into a plan step points at an earlier plan step. A curated order is
  only a route if the graph agrees. This caught `HEAT_BADGE ← LAVARIDGE_TOWN` and
  `FORTREE_GYM_OBSTRUCTION_CLEARED ← DEVON_SCOPE_RECEIVED` before either had a step.
- **INV-RP2** — every plan objective resolves in `OBJECTIVE_NODES`; no id repeats.
- **INV-RP3** — switch off reproduces the briefing bytes exactly.

## Milestones
- [x] `route-plan.ts`: 31 steps, `RoutePlan` (observe/next/completed/status), `OFF_PLAN_TURNS = 200`.
- [x] `route-plan.test.ts` (10): ids resolve, INV-RP1, badge order pinned, position arithmetic, the 1552/2210
      drought, the clock restarting, silence when the plan is done.
- [x] `route-plan-briefing.test.ts` (5): no line in the opening, the full line, only-the-line diff, off
      byte-identical, silence at the end.
- [x] Registry: `SWITCHABLE_FEATURES`, `FEATURES`, `playHarnessFeatures`, preset schema optional,
      `normalizeFeatures`, the v1 preset map, `DEFAULT_NEXT_RUN`; `current.json` gains it in the bundle arm.
- [ ] Explainer page.
- [ ] Ablation (operator's call, not launched by this branch): plan on vs off, same save, N ≥ 3; reads
      turns-to-badge, longest drought in play minutes, `milestone_drought` per 1,000 turns, and the
      off-plan stationary turns as descriptive ON-only.

## Gates
- `pnpm -r build` and `pnpm -r lint` clean both packages.
- agent 386 files / 5437 tests pass (main had 384 / 5422 before this branch's base).

## Surprises
- The graph refuses two obvious plan steps: Lavaridge and the Devon Scope are hard prerequisites of the
  badges that follow them, so they are steps in their own right rather than prose.
- `KNUCKLE_BADGE` is index 59 of the milestone list and `DYNAMO_BADGE` 83: the list is evidence order, the
  plan is route order, and only the plan can say "the second badge comes fourth".

### Merge of the objective-graph review fixes

Merging `claude/objective-graph-v1` in pulled three review fixes that touched this branch:

- One conflict, in `features.ts`: both branches appending a `guidance` entry. Resolved by keeping this
  branch's `story-route-plan-v1` entry and the graph branch's corrected `objective-graph-supervisor-v1`
  wording (the `needs …` fallback is defensive, not routine).
- `KNUCKLE_BADGE` became a step the plan could not take: `BRAWLY_DEFEATED → KNUCKLE_BADGE` is a hard edge in
  the merged graph, the badge is granted inside that trainer script, and INV-RP1 refuses a step whose gate the
  plan never reaches. The Dewford step now names `BRAWLY_DEFEATED` and says the badge follows the battle; the
  badge-order test still proves the deferral, by asserting that step sits after the Heat Badge and before
  Norman.
- Nothing else moved: `pnpm -r build` and `pnpm -r lint` clean, `packages/agent` **386 files / 5447 tests**,
  `packages/viewer` **184 files / 2419 tests**.
