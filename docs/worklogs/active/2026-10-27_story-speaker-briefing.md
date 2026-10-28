# Self-named speakers, native-milestone briefings, reached story lines

## Problem Statement

Bundle run `2026-10-27T17-35-16_qwen36-gpu0_a702` received Mr. Stone's letter at turn 630. It then spent 90+ turns going east on Route 116 and through Rusturf Tunnel, toward a Slateport route it remembered from other games, instead of going south to Mr. Briney's cottage. The read-only analysis is `runs/analysis/a702-dewford-20261027/findings.md`. Three harness readouts are wrong in that stretch, and the code confirms each:

1. **Speaker credit.** `StoryDestinations.speaker()` (`story-destinations.ts`) treats a page as a story line only when its speaker is in `STORY_CHARACTERS`, or is a printed alias of one. In a702, Stone's request pages ("Well, on the way, could you stop off in DEWFORD TOWN?") are recorded as `MAN_2`/`faced_sprite`, his later pages as `MR. STONE`/`name_prefix` (not a story character), and Briney's T621 pages ("You can usually find me in my cottage by the sea near PETALBURG WOODS.") as `EXPERT_M`/`faced_sprite`. None of these can become the Story line, so the result header keeps Dad's T312 "Head for RUSTBORO CITY beyond this town." for 90+ turns.
2. **Briefing done list and quoted dialogue.** `SupervisorBriefing.observe` returns early for every name in `EXTENDED_PROGRESS_NAMES`. RUSTURF_AQUA_GRUNT_DEFEATED, DEVON_GOODS_RECOVERED, STEVEN_LETTER_RECEIVED, POKENAV_RECEIVED, DEVON_PRESIDENT_SCENE_COMPLETE, MATCH_CALL_* are all extended. As a result:
   - they never enter `stories` or `instruction`;
   - the stall briefings at T690/T693/T704 quote Roxanne's T578 Rock Tomb pages as the latest story step with dialogue;
   - the done list (the readout's own `Story:` line) stops at the Route 104 trainers.
3. **Reached line shown as the goal.** Dad's line resolves only to RUSTBORO CITY, which a702 reached at T378 and then beat the Gym in (T578). It is still printed every turn as `Story line heard (DAD, turn 312): … Reached: RUSTBORO CITY …`. The model quoted it as its current goal at T717 and T721.

Operator decision (the operator, 2026-10-28, thread "Why Qwen bundle struggles reaching Dewford"): "lets start with 1-3". Each is its own switch, default OFF. Activation is per the standing rule that harness-correctness fixes go ON in both arms, but only after coordinator confirmation with the operator.

## Skills Loaded

feature-switch, feature-worklog, pokebench-game-state (game's own words), pokebench-trace-forensics (evidence), feature-explainer, close-the-loop.

## Architecture

- `self-named-speaker-v1` (observation, needs `dialogue-auto-advance-v1`): inside one auto-advanced conversation, a page whose own text introduces its speaker by a name in capitals binds that page's sprite-kind speaker label to that name. The page forms are "They call me NAME", "I'm NAME", "I am NAME" and "My name is NAME". The binding covers that page, the following pages with the same `faced_sprite` label, and `name_prefix` pages printing that same name. Those pages are story lines spoken by NAME. Only `StoryDestinations` eligibility changes: the dialogue memory, the readout and the instruction ledger keep the sprite attribution. Off: sprite-kind pages are never story lines.
- `story-briefing-native-milestones-v1` (guard, needs `loop-guard-supervisor-v1`): the briefing also records observed extended story milestones, not only base ones.
  - They enter `stories` and the pending story-page capture.
  - "Dialogue shown with your latest story step…" quotes the latest 4 story calls that came with dialogue, newest first, each whole.
  - "Story steps the game confirms are done" appends the recorded extended steps after the readout's checklist.
  - Off: byte-identical to today.
- `retire-reached-story-line-v1` (observation, needs `unfinished-activity-v1`): a Story line whose every place has been entered since it was said, followed by a later observed story milestone, retires through the existing done path. Trainer wins and measurement-only steps do not count; extended story steps do. With `stale-story-goal-v2` on, the line is omitted. The away-supervisor gets no goal from it. The reason names the place, the arrival turn and the milestone. Off: today's `Story line heard … Reached:` text.

## Invariants

- INV-1: OFF for each switch reproduces today's bytes. Tests replay the a702 contexts with the switch off and compare against the recorded text.
- INV-2: Only the game's own words. Names come from the page text; reasons name recorded milestones and arrivals; no route or place the game has not said.
- INV-3: No truncation of any page or quote.
- INV-4: Sprite-kind pages before a self-introduction, and pages from other sprites, stay unattributed.

## Security Review

No new inputs, I/O or subprocesses. The new code is a pure function over recorded events.

## Milestones

**M1 — self-named-speaker-v1**
- [x] RED tests from a702 T621/T630 pages (Briney's line becomes the Story line; Stone's DEWFORD TOWN line supersedes it; OFF keeps Dad T312; negatives)
- [x] GREEN, registry, presets, wiring, factory test
- [x] Targeted tests

**M2 — story-briefing-native-milestones-v1**
- [x] RED tests from a702 milestones and T621/T630/T663 pages
- [x] GREEN, registry, presets, factory test

**M3 — retire-reached-story-line-v1**
- [x] RED tests (Dad T312, Rustboro reached T378, ROXANNE_DEFEATED T578; trainer wins do not retire)
- [x] GREEN, registry, presets, wiring

**M4 — evidence**
- [x] Offline replay of a702 through the production classes: before/after header and briefing text at T631, T690, T693, T704, T717
- [x] Explainer (`docs/explainers/dewford-readout-fixes.html`, mapped from all three cards); [ ] probe plan (post-letter save, N=8 per arm)
- [ ] Review lanes, landing per board


## Evaluation Plan (ready, not launched)

**Diagnostic A, decision-point probes (cheap; can run in the coordinator's GPU1 window):** `just probe-decision a702 <turn> --switch self-named-speaker-v1=on --switch story-briefing-native-milestones-v1=on --switch retire-reached-story-line-v1=on --samples 8`, on the worktree build, against the GPU1 llama.cpp lane (Qwen3.6-35B-A3B, same settings as a702).
- Cases are a702 turns where the model chose its next direction:
  - T633 (leaving Devon 1F)
  - T664 (Rustboro, left by the EAST edge)
  - T693 (after the drought briefing)
  - T704 (after the map-cycle briefing)
  - T717 (back on Route 116; quoted Dad's line)
  - T726 (re-entered Rustboro)
- Arms: the recorded switches (OFF) vs all three ON, and each switch alone at the turns where it changes context: header turns for 1 and 3, briefing turns for 2.
- Score: the first navigation call's direction toward ROUTE 104 / RUSTBORO south edge / ROUTE104 MR BRINEYS HOUSE vs EAST/NORTH (ROUTE116/ROUTE115/RUSTURF), plus whether the reasoning cites the game's Briney/Stone lines or Meteor Falls / S.S. Tidal / Lilycove.
- Fixed N=8 per arm per case. Published under runs/probes/<id> per the decision-probes skill.
- Exploratory only; no promotion claim.

**Screen B, checkpoint gameplay (needs operator approval of a fixed definition and launch):**
- Start: `runs/checkpoints/RUSTURF_AQUA_GRUNT_DEFEATED/candidates/2026-10-25T10-50-57_gpt-6-astra_429f`. SHA-1 a79eff1569fff7e714b2fb4502637b615d249998, captured at 429f seq 16235 (turn 476): the moment the Rusturf grunt is beaten.
  - From there the run itself hears the goods handback, Briney's "They call me MR. BRINEY." / "…cottage by the sea near PETALBURG WOODS." and, back at Devon, Stone's whole conversation. So switches 1 and 2 can act.
  - I rejected the STEVEN_LETTER_RECEIVED save (SHA-1 0f8ce3d7…, seq 17372). It is captured mid-conversation, after "I'm MR. STONE…" and the DEWFORD request, so a run from it never hears them.
  - Neither save carries Dad's turn-312 line in the run's history, so switch 3 is measured only by Diagnostic A (a702 turns 579–726) or by a boot run.
  - It is Astra's party, before May's Rustboro south-exit scene.
- Model: Qwen3.6-35B-A3B on GPU1.
- Arms: bundle-recipe features with the three switches OFF vs ON, N=8 per arm.
- Outcomes:
  - primary: turns from start to the first entry of ROUTE104 MR BRINEYS HOUSE after the start;
  - secondary: turns to DEWFORD_TOWN.
  - A trial ends at DEWFORD_TOWN, at a 400-turn cap, or by the fixed-run's predeclared ends.
- Cap rationale: the comparison runs took 149 (Astra) and 315–841 (Qwen) turns from the letter to Dewford, so 400 turns favors the faster arm without letting the Qwen tail dominate.
- Rough cost: about 16 s/turn on one slot (a702 ran 96 turns in about 25 min), so 400 turns × 16 trials ≈ 28 GPU-hours at the cap, and less when trials reach Dewford early. That is far beyond the 30-minute probe batches the coordinator allows, so B needs its own design page (experiment-design skill), operator approval and a window.

## Closing the Loop

Targeted vitest suites for the touched files, the offline a702 replay diff, and explainers checked with `just pages-check`. Full suites only with a CPU window from the coordinator.

## Session Log

- 2026-10-28: Round-2 fixes. Three new suites: 26 passed. 20 touched suites: 334 passed. tsc and eslint are clean. The a702 replay is byte-identical.
- 2026-10-28: Round-1 fixes. 25 tests across the three suites. The 20 touched-module suites ran explicitly: 333 passed. (The earlier "328 files, 4643 tests" was a zsh unsplit-filter run that executed the whole agent suite; it also passed.) The offline replay output is byte-identical after the fix.
- 2026-10-28: Registry tests pin absolute positions: SWITCHABLE_FEATURES 281/282/283, playHarnessFeatures 305/306/307 (lesson from grass-strides round 4). 24 tests across the three suites.
- 2026-10-28: Wiring mutations: removing `selfNamed` and `retireReached` from play-wiring each turns its factory test red (1 failed); restored, both pass. Retire suite is now 7 tests (26 across the three).
- 2026-10-28: GREEN. Implementation in story-destinations.ts (selfName, storyStep, constructor flags, goal retirement), loop-supervisor.ts (extended steps, four story dialogues, done list), harness-trust.ts/play-wiring.ts (options), the registry, presets and next-run defaults (all OFF). Targeted gates: 3 new suites 23/23. Agent vitest over the touched-module suites: 328 files, 4643 tests passed. Viewer server/panels/next-run: 385 passed. Agent `tsc -p tsconfig.build.json` and `tsc --noEmit` are clean, and eslint on the touched files is clean. Viewer build is clean. `just pages-check` on the explainer prints nothing. The full `just test` and coverage did not run (CPU window; coordinator asked for targeted tests only).
- 2026-10-28: Offline replay (`runs/analysis/a702-dewford-20261027/replay/replay.mjs`, read-only, worktree dist) of a702's recorded events to T720 through the production HarnessTrust and SupervisorBriefing. OFF reproduces the recorded T704 stall briefing in 15 of 16 lines; the 16th is the headline call counter, which the script passes. The ON header at T631–T717 is Stone's DEWFORD TOWN line, and Dad's reached line retires at T579. The ON briefings at T693 and T704 quote Briney's cottage page and Stone's DEWFORD request. Diff: `runs/analysis/a702-dewford-20261027/replay/prompt-diff.txt`.
- 2026-10-28: RED: 23 tests across self-named-speaker, story-briefing-native-milestones and retire-reached-story-line, built from the a702 extract `test-support/a702-dewford.json.gz` (53 KB: field calls at T312/T578/T621/T630/T634/T663, 79 milestones, 157 arrivals, states at T630/T690, the run's feature set). Without the implementation, 16 fail and 7 pass (the pass-without-impl ones are the OFF/negative cases).
- 2026-10-28: Verified the mechanism in code and in a702 events (dialogue_auto_advance speaker/speaker_source; milestone kinds; EXTENDED_PROGRESS_NAMES early return). Branch `claude/story-speaker-briefing` off main `948095751`.

## Surprises

- stale-story-goal-v1's checklist rule retires any line that resolves only to PETALBURG WOODS once "Petalburg Woods Aqua event complete" is up. So Briney's T621 cottage line (which names PETALBURG WOODS) is retired the moment it would become the goal, and a702 shows no goal T622–629 with switch 1 on. That is a v1 place-based retirement limit, not changed here; follow-up candidate.
- The a702 extract cannot reproduce the recorded T578 quote offline (it came from field messages the extract does not carry), so the unit test asserts "predates turn 621" and the full-stream replay carries the exact comparison.

- The briefing's stale dialogue does not come from the done list. `EXTENDED_PROGRESS_NAMES` milestones are skipped entirely in `SupervisorBriefing.observe` (`campaign-progress-clock-v1` only moves `progress`).

## Multi-Model Review Log

Round 1, frozen packet 948095751..cdac5cc61 (diff sha256 5a448a5e…2788):
- Claude lane (read-only Claude subagent, opus): VERDICT: LGTM. Hardening notes:
  - the self-introduction regex chains a sentence's full stop into the next capitals word ("I'm ROXANNE. POKéMON"), and short words like "OK" match;
  - sprite-kind binding is forward-only by design;
  - the retirement semantics are worth watching in the probe;
  - storyStep and the briefing treat origin differently, but current recorders always set it;
  - the done list could repeat a step under two names.
- Codex CLI gpt-5.6-sol (first try: the default gpt-6.1-sol was rejected for a ChatGPT account; re-run with -m gpt-5.6-sol): VERDICT: BLOCKING.
  - Retirement compared turns, not recorded order, so an arrival and a later story step in the same turn did not retire. ACCEPTED: arrivals, steps and the line's shown-at event now carry seq. Retirement requires a step seq after the line and every arrival. A new test covers same-turn order both ways, and reverting to turn order turns it red.
  - The fixture rebuild cost was noted as non-blocking.
- Grok (cursor-agent grok-4.7-high): lane down. The first call needed --trust; with it, "You're out of usage". Fallback reviewer (sonnet subagent, read-only): VERDICT: LGTM, with the same regex hardening notes (mid-word backtrack "I'm ABCd" → "AB"; "OK").
- Accepted hardening (same batch): NAME_WORD is grouped. A full stop belongs to the name only after a title (MR./MRS./MS./DR./PROF./CAPT.). Words must end where their capitals end, and a name needs at least 3 capitals. New cases: "I'm ROXANNE. POKéMON…" → ROXANNE; "I'm ABCd", "I'm OK!", "I'm MR." → none. The grouping bug was caught by the a702 tests, which failed until the group was added.
Round 2, frozen packet 948095751..dd6109210 (cumulative sha256 2e5d0278…a26c; delta 17ebecfa…f8f8):
- Claude lane (opus subagent): VERDICT: LGTM. It notes that a possessive like "I'm MR. BRINEY's pal" now yields no name, and that shownAt could be lost by a future clone path.
- Fallback (sonnet subagent): VERDICT: LGTM (residual: "I'm SO SORRY" passes the 3-capital rule).
- Codex gpt-5.6-sol: VERDICT: BLOCKING on two points.
  1. The arrival lookup still matched by turn, so a place entered and left earlier in the same turn as the line counted as reached by it. ACCEPTED: the retirement path now passes the line's shown-at seq into arrival(), and "since the line" is by recorded seq. The displayed "Reached" wording (unfinished-activity-v1) keeps its turn semantics. A new test covers arrival→other map→line→step (not retired) and line→arrival→step (retired); reverting to turn order turns it red.
  2. The fixture rebuilt, validated and sorted the whole stream on every a702Events call. ACCEPTED: the events are validated and ordered once and replays take a prefix; the milestone lookup is a map.
 and length; caching a702Events; the binding is forward-only by design.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
