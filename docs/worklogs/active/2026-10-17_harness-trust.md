# Worklog: harness-trust-v1 and cited-destination-v1

Branch `claude/harness-trust`, worktree `/private/tmp/pokebench-harness-trust`, base `main` f5742c00.

## Problem Statement

The top-50 run analysis (runs/reviews/2026-10-17-run-analysis-top50/) found the model sees true facts and loses them to its priors: it writes "I see May at (10,3)" and walks to Petalburg, invents exits ("Oldale's east exit to Petalburg", e046 s18744), and ignores the readout's story lines. `game-evidence-priority-v1` already tells it the game outranks memory, in the middle of a long system prompt, and has not been enough. Qwen follows the most recent instruction, so the trust has to sit in the latest turn and in tool arguments.

Operator decisions (the operator, top-50 thread):
- 1:49 PM New York proposal, approved 2:12 PM: "I agree with the proposal for the two switches, Harness Trust V1 and Sided [cited] Destination V1. Then those fixes should go into the bundle. They should ship as two individual switches."
- 1:52 PM: the story-goal top line with a supervisor that fires within a couple of turns of the model walking away from it goes into the bundle.
- The operator prefers deterministic help over extra optional tools (2:32 PM).
- Harness messages use the game's own words (skill rule on main at f5742c00).

Coordinator brief (3:17 PM): bundle only (default OFF in presets and DEFAULT_NEXT_RUN; Dual GPU readiness turns them on in the bundle arm; never edit bundle-v-control.json here). Reuse story-destinations-v1's resolver, character-presence data and exit-reachability-v1's check once it lands. No truncation of model input. State from game state, never sleeps. Never send requests to the GPU lanes while trials run. Hold landings touching features.ts, play-preset.ts, events.ts/schemas or readout.py until exit-reachability-v1 lands. Review: Claude, Grok, GPT/Codex, 2-round cap, only correctness or safety blocks.

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, agent-observability, feature-explainer (when writing the explainer), experiment-queue (pending entries), pokebench-game-state (game wording), close-the-loop.

## Architecture

**harness-trust-v1** (agent side only):
1. System prompt: a short numbered priority rule appended at the very end (after every other section, including objective tracking): which evidence wins, in order: (1) the latest thing a story character told you, shown as the Story goal line; (2) the facts read from game memory in each result; (3) never your memory of Pokémon games. It refers to "Game evidence first" when that section is on, instead of repeating it.
2. Every observe, press and navigate_to result starts with a header read from game memory:
   - `Read from game memory, always true:`
   - `Story goal: "<latest story line naming a place>" (turn N, SPEAKER) -> <resolved place and way in>`, from `StoryDestinations` (story-destinations-v1's resolver, shared class); "none yet" when no story character has named a place.
   - `Story characters on this map: NAME at (x,y); ...` from live objects through character-presence's table (`storyCharacter`).
   - `Exits you can walk to: ...` only when exit-reachability-v1's check has a foot answer (M3, after it lands). Never claimed without it.
3. Walk-away supervisor: when the goal resolves to a map with a way in, each result whose position changed is compared with the previous one: on the same map, the straight-line tile distance to the nearest way in on this map; across one map-table edge (a warp or connection from the previous map to the new one), the number of map-table steps to the goal map. Two consecutive steps farther (no closer step in between) add one SUPERVISOR paragraph under the header and record a `story_goal_away` event. Teleports that are not one map-table edge (whiteout, fly, dynamic warps) never count. A new story line resets it.
4. The goal survives a whiteout: the story line is kept across the whiteout and the header shows it on the next result.

**cited-destination-v1** (agent side only): navigate_to's schema gains a required `because` string: the readout line or dialogue, quoted, that makes this the place to go. The wrapper strips it before the walk. It checks the quote, normalised for whitespace, case and quote marks, against every tool result text shown this run. If not found (or under two words), the result starts with one line saying the quote was not found in anything the game showed, and the walk still runs. Each check is recorded as a `destination_citation` event. Texts account for full-map-navigation-v1 and exit-reachability-v1.

## Invariants

- INV-1: OFF is byte-identical: same system prompt, tool list, schemas, results. Test: OFF snapshots against main on fixtures.
- INV-2: every header line is a fact read from game state or the game's own text; nothing guessed, nothing clipped. Test: fixture states (sh02 MOM T74, e962/defa LAB, 4198/2fb4 May on Route 103).
- INV-3: the supervisor fires only on two consecutive farther steps by the player's own movement; teleports never count. Tests: walk-away sequences, whiteout sequence.
- INV-4: no new optional tool; `because` is an argument of an existing tool.
- INV-5: no sleeps; everything from the result's own state.
- INV-6: no new timeline marks (operator decision 2026-10-16): events go to Activity History and the raw-event inspector only.

## Security Review

No new endpoints, subprocesses or files. Quotes from the model are matched as plain strings (no regex built from model text). Places table is the existing validated GET /pokebench/places.

## Milestones

**M1 — harness-trust-v1**

Ordering note: the registry, presets, events schema and wiring all sit on lines exit-reachability-v1 also edits, and the coordinator holds landings that touch them until it lands. So M1a/M2a build and test the modules on their own; M1b/M2b register and wire them after merging main once exit-reachability lands.

- [x] M1a RED: `harness-trust.test.ts` on the 4caa (MAY's LAB, T272/T273) and sh02 (MOM's "He lives", T74) recordings and the ROM map table: trust order text, header exact on press/navigate_to/observe, no-goal and unreadable-table lines, characters line from the readout's own object-list line, walk-away note (two farther moves; closer/standstill/repeat cases; map-table step across a connection; whiteout not counted and goal still shown; goal map, unmeasurable and unknown maps; a new story line), supervisor option off, OFF returns the same tools.
  - 3:27 PM New York: the suite fails at load (no `harness-trust.js`).
  - COMMIT: `test(harness-trust): RED header, trust order and walk-away note from the 4caa and sh02 recordings` (f4db4397)
- [x] M1a GREEN: `harness-trust.ts` (trustSection, goalLine, charactersLine, mapSteps, waysHere, WalkAway, awayText, HarnessTrust, withHarnessTrust taking a plain boolean until M1b). `story-destinations.ts`: `goal()` returns the structured line and resolutions; `block()` is rebuilt from it byte for byte (its 21 tests unchanged and green).
  - Way toward the goal when it is not on this map: the exits of this map that lead one map-table step closer (Route 103's SOUTH edge toward the lab), measured in straight-line tiles; map size from `topology` (or `map_grid`).
  - harness-trust + story-destinations suites 37/37; harness-trust.ts lines 99.1 / branches 88.8 / functions 100 (branches raised in M1b); tsc and eslint clean.
- [ ] GREEN: registry, presets, defaults, events (`story_goal_away`), recorder, viewer Activity History, wiring.
- [ ] Gates

**M2 — cited-destination-v1**
- [ ] RED: schema has required `because`; found / not found / too short; OFF schema unchanged; factory test.
- [ ] GREEN: registry, presets, defaults, events (`destination_citation`), recorder, viewer, wiring, prompt navigate_to text.
- [ ] Gates

**M3 — exit-reachability integration (after it lands on main)**
- [ ] Merge main; exits line from `exitReach`; `because` description names its exit lines.
- [ ] Gates

**M4 — explainers, pending experiments, probes**
- [ ] Explainers for both switches, FEATURE_EXPLAINERS, pending experiments/*.json, readiness rows.
- [ ] Decision probes on/off at the recorded forks, only when no trial runs on the lanes. DEFERRED until lanes are idle.

**M5 — review and land**
- [ ] Review: Claude, Grok, GPT; 2-round cap.
- [ ] Land ff-only on local main; SHA to the coordinator.

## Closing the Loop

Tests from recorded states; viewer Activity History check on a fixture run; probes when lanes idle.

## Session Log

- 2026-10-17 3:25 PM New York: worktree created from main f5742c00; setup done.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive.
