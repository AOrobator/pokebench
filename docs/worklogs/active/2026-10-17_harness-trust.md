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
- [x] M1b+M2b RED (both switches, one commit; registered after exit-reachability-v1, merged in at ffae6e9c): `packages/agent/src/harness-trust-wire.test.ts` (registry order, needs, OFF copy, playHarnessFeatures, state-only list, preset defaults OFF, system prompt last and OFF byte-identical incl. after objective tracking, cited prompt rule only with navigation, production playGameTools for both, navigate_to `because` with whole-map and exit-reach text, event schemas, and one pinned-pi run delivering the header and walk-away note with story_goal_away recorded before the result) and `packages/viewer/src/harness-trust.test.ts` (DEFAULT_NEXT_RUN OFF, Activity History rows, trace categories, raw inspector, no timeline mark).
  - 3:33 PM New York: agent 8 fail (switches not registered), viewer 3 fail.
  - COMMIT: `test(harness-trust,cited-destination): RED registry, presets, prompt, factory, events, pi delivery and viewer rows` (43d4794d)
- [x] GREEN: registry (SWITCHABLE_FEATURES, FEATURES copy, playHarnessFeatures, state-only list), presets (schema, normalize default OFF, flagFeatures), DEFAULT_NEXT_RUN, events `story_goal_away` and `destination_citation` (schema regenerated), recorder methods, tail lines, decision-probe replay ports, `playSystemPrompt` (cited rule then trust order, last), `playGameTools` (cited around everything, harness-trust outermost), viewer Activity History text, trace labels (SUP / NAV), model known types. Recorder methods are optional in the wrapper types and a wrapper switched ON without them throws at construction (the low-hp v2 pattern), so older test recorders need no change.
  - Mechanical test updates for two more registered switches: registry positions (`.at(-N)`, `.slice`) moved by two; feature literals and `off(...)` lists that turned story-destinations OFF now turn these two OFF as well; guidance count 40 -> 42; switchboard rows 99 -> 101.
  - Wiring break: `withHarnessTrust(cited,false,...)` and `withCitedDestination(facts,false,...)` in play-wiring turned 3 factory/pi tests red; `if(false)` for the trust order in play-config turned 2 prompt tests red; restored, 8/8.
  - Extra branch tests for harness-trust.ts (edges from each side, door to an unlisted map, sideways and closer moves, unresolved goals, a map the table cannot count from, "1 map", recorder guard, malformed table).
- [x] Gates: just test (vitest agent 2164 -> 2168 with the branch tests, viewer 1107; pytest 2544), just lint clean, just build OK, just coverage: Python lines 97.63 / branches 93.76 / functions 100; agent lines 99.16 / branches 94.3 / functions 98.15 (harness-trust.ts 100 / 96.97 / 100, cited-destination.ts 100 / 97.7 / 100); viewer lines 97.62 / branches 91.38 / functions 93.79.

**M2 — cited-destination-v1**
- [x] M2a RED: `cited-destination.test.ts`: schema (required `because`, other properties and tools unchanged, description), text per full-map and exit-reach, OFF same tools; 4caa T272 MAY's line found across its line break and curly quotes (walk gets no `because`, result unchanged); not found line; too short; only earlier non-error results count, newest cited; image-only result; arguments without `because` pass through.
  - 3:29 PM New York: the suite fails at load (no `cited-destination.js`).
  - COMMIT: `test(cited-destination): RED required because on navigate_to, checked against what the game showed` (48e61240)
- [x] M2a GREEN: `cited-destination.ts` (becauseDescription, normalise, Citations, citationText, withCitedDestination taking a plain boolean until M2b). Plain-string matching only (no regex from model text); unique normalised result texts searched newest first.
  - 8/8; cited-destination.ts lines 100 / branches 97.7 / functions 100; tsc and eslint clean.
- [ ] GREEN: registry, presets, defaults, events (`destination_citation`), recorder, viewer, wiring, prompt navigate_to text.
- [ ] Gates

**M3 — exit-reachability integration**
- [x] `because` description names exit-reachability's not-reachable exits (done in M2a/M2b).
- [x] RED: exits line from exit_reach foot labels on the recorded 0e05 Route 104 (south half) and 4198 Route 103 states (exit-reach-states fixture): only foot exits, grouped doorways, "none" wording, nothing without exit_reach / with a malformed mask / for a map the table lacks, unknown and dynamic warps left out, and placed after the characters line in the header.
  - 3:48 PM New York: 4 fail (no `exitsLine`).
  - COMMIT: `test(harness-trust): RED exits-you-can-walk-to line from exit-reachability's foot labels` (51f0a585)
- [x] GREEN: `exitsLine` (foot labels only, names from the map table, doorways grouped; null without a well-formed mask) joins the header after the characters line; FEATURES copy says so.
- [x] Gates: just test (agent 2172, viewer 1107; pytest 2544), lint clean, build OK, coverage agent 99.18 lines / 94.43 branches / 98.15 functions (harness-trust.ts 100 / 96.4 / 100), viewer 97.62 / 91.38 / 93.79, Python 97.63 / 93.76 / 100.
- [ ] Gates

**M4 — explainers, pending experiments, probes**
- [x] (Gates after: agent 2172, viewer 1111, pytest 2544; lint, build, coverage pass as before.) Explainers `docs/explainers/harness-trust-v1.html` and `cited-destination-v1.html` (recorded header, trust order, walk-away figure with the 4caa numbers, rules table, wiring; schema, check flow, found/not-found), README entries, FEATURE_EXPLAINERS mapping, panels and server route tests; `just pages-check` prints nothing. Pending entries `experiments/harness-trust.json` and `experiments/cited-destination.json` (exit-reachability's finals incumbent with only the switch flipped; provisional source.commit c6c340ec, repin at merge) and readiness rows; `just experiments-check` ok (89).
- [ ] Decision probes on/off at the recorded forks, only when no trial runs on the lanes. DEFERRED until lanes are idle.

**Self-check before review**
- [x] RED: the map table must be read once per player name (story-destinations-v1 does; the player's house is named after the player, so a table read before naming would mis-resolve "He lives" for the player's own house). 4:05 PM New York: fails, 1 read instead of 3.

**M5 — review and land**
- [ ] Review: Claude, Grok, GPT; 2-round cap.
- [ ] Land ff-only on local main; SHA to the coordinator.

## Closing the Loop

Tests from recorded states; viewer Activity History check on a fixture run; probes when lanes idle.

## Session Log

- 2026-10-17 3:25 PM New York: worktree created from main f5742c00; setup done.

## Surprises

- 3:30 PM New York: exit-reachability-v1 is still in review. Rather than registering on main and re-resolving the same registry lines later, this branch merges `claude/exit-reachability` (tip 3e8d7228) now and registers after it; when it lands, merging main is a no-op for those lines. M3 (exits line) can use `exitReach` directly.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive.
