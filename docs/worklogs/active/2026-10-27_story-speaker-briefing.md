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
- [ ] RED tests from a702 T621/T630 pages (Briney's line becomes the Story line; Stone's DEWFORD TOWN line supersedes it; OFF keeps Dad T312; negatives)
- [ ] GREEN, registry, presets, wiring, factory test
- [ ] Targeted tests

**M2 — story-briefing-native-milestones-v1**
- [ ] RED tests from a702 milestones and T621/T630/T663 pages
- [ ] GREEN, registry, presets, factory test

**M3 — retire-reached-story-line-v1**
- [ ] RED tests (Dad T312, Rustboro reached T378, ROXANNE_DEFEATED T578; trainer wins do not retire)
- [ ] GREEN, registry, presets, wiring

**M4 — evidence**
- [ ] Offline replay of a702 through the production classes: before/after header and briefing text at T631, T690, T693, T704, T717
- [ ] Explainer, probe plan (post-letter save, N=8 per arm)
- [ ] Review lanes, landing per board

## Closing the Loop

Targeted vitest suites for the touched files, the offline a702 replay diff, and explainers checked with `just pages-check`. Full suites only with a CPU window from the coordinator.

## Session Log

- 2026-10-28: RED: 23 tests across self-named-speaker, story-briefing-native-milestones and retire-reached-story-line, built from the a702 extract `test-support/a702-dewford.json.gz` (53 KB: field calls at T312/T578/T621/T630/T634/T663, 79 milestones, 157 arrivals, states at T630/T690, the run's feature set). Without the implementation, 16 fail and 7 pass (the pass-without-impl ones are the OFF/negative cases).
- 2026-10-28: Verified the mechanism in code and in a702 events (dialogue_auto_advance speaker/speaker_source; milestone kinds; EXTENDED_PROGRESS_NAMES early return). Branch `claude/story-speaker-briefing` off main `948095751`.

## Surprises

- The briefing's stale dialogue does not come from the done list. `EXTENDED_PROGRESS_NAMES` milestones are skipped entirely in `SupervisorBriefing.observe` (`campaign-progress-clock-v1` only moves `progress`).

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
