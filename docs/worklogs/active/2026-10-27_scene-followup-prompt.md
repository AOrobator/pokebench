# scene-followup-prompt-v1: talk to a scene's people before older instructions

Status: in progress (single milestone, prompt-line switch)
Branch: claude/scene-followup-prompt-v1 (worktree /private/tmp/pokebench-scene-followup)
Evidence: runs/reports/run-analysis/2026-10-27_astra-frontier/ (sections/astra.md P2, sections/switches.md divergence A)

## Scope
- One guidance switch, `scene-followup-prompt-v1`, default OFF. ON adds one overworld system-prompt paragraph telling the model that after a scene plays it should talk to that scene's people who are still nearby before following older instructions.
- Generic wording: no character, place, item or story event names; no hint of what happens next (no-story-foreknowledge stays satisfied). Nothing truncated.
- Activation: experiments/feature-configs/current.json `switches` (bundle ON, control OFF). Rebased onto the promote-control landing ff88c3a03.
- Non-goals: no probe or run launch (the 9e33 seq 52193 probe needs a GPU window from the operator), no change to other switches.

## Evidence cases
- Astra t415→t425 (seq 13936→14218): saw the theft scene, went to the employee; goods back at t476.
- Qwen 9e33 t1384–1390 (seq 52168–52437): same scene, called it "a random encounter with a thug" (seq 52193) and went south; heard the employee 4,270 turns later.

## M1
- [x] RED: registry, prompt OFF/ON, presets, defaults, current.json wiring (packages/agent/src/scene-followup-prompt.test.ts: 8/8 fail as expected)
- [x] GREEN: registry (features.ts, last in SWITCHABLE_FEATURES/FEATURES/playHarnessFeatures), presets default false, DEFAULT_NEXT_RUN false, play-config SCENE_FOLLOWUP_SECTION after ID cards (overworld), current.json switches + features false. Wiring deleted once → 5/8 red, restored → 8/8. Pinned counts: guidance 96→97, explorer-guidance-v2 list, map-observability tail.
- [x] Explainer docs/explainers/scene-followup-prompt-v1.html (pages-theme, pages-check clean) + FEATURE_EXPLAINERS + README; panels/server tests extended
- [x] Gates: agent vitest 4483/4483, viewer vitest 2033/2033, pytest 4425 passed, trainer-card-check 3/3 (POKEBENCH_CARD_ART=main's runs/sprites/trainer-card-v1; worktree has no ROM-derived art), lint clean, build clean, coverage: python lines 97.47 / branches 93.58 / functions 100; viewer all-files 95.86/91.66/95.35; agent above floor. Worktree setup: vendor submodule init (verify-vendor OK), main's mgba binding linked into the worktree venv for mypy.
- [ ] Review lanes (Claude, GPT, fallback for Grok)
- [ ] Land ff-only via landing board
- [x] Probe context-only rehearsal (CPU): `probe-decision 9e33 1385 --switch scene-followup-prompt-v1=on --context-only` against a scratch runs-root (events truncated after seq 52440; the 2.2 GB file exceeds Node's string limit). Flipped context differs in system prompt only.
- [ ] Probe on matching Mac server (the operator approved 2026-10-27 via coordinator): UD-Q4_K_M copied from GPU box, 9e33 container flags (ctx 65536, -b 2048 -ub 512, KV q4_0, parallel 1, --reasoning-budget 1024, jinja)

## Multi-Model Review Log

### Round 1 (packet cbf527da0e1b29bd061157878a16993177d02c8aafed2c9ade5a0c0664b04bd3, base cedef5876, head 61148c973)
- Principles self-review: 0 FAIL (docs/worklogs/active/2026-10-27_scene-followup-principles.md).
- Claude CLI lane (~/.claude-review, plan mode): VERDICT: LGTM. Non-blocking: new constant sits under the people-id-cards comment (cosmetic, follow-up); example clause mirrors the motivating scene (wording is the operator's requested categories; operator's call); denylist test is weak (follow-up).
- GPT lane (cursor-agent gpt-5.6-sol-xhigh): BLOCKED, "You're out of usage". Codex out of tokens until ~Nov 1.
- Grok lane (cursor-agent cursor-grok-4.5-high): BLOCKED, same Cursor usage error.
- Standing fallback (fresh read-only subagents, distinct models; never counts as a cloud lane): Sonnet LGTM, Opus LGTM. The same non-blocking notes, plus a watch item: "before older instructions" vs instruction-goal ledger when both are ON (the ledger is offInBoth now).
- Triage: no Fix items. Follow-ups: comment placement, a stronger genericity test.
- Landing: GPT cloud lane missing, so no self-merge; asked the operator.

## Prompt research (2026-10-27, after review; not landed)
- The operator: do not land the system-prompt line; research prompting. Land board released.
- Report: runs/reports/run-analysis/2026-10-27_scene-followup-prompt-research/index.html (viewer Reports). Probe lanes: runs/probes/scene-followup-9e33-20261027 (viewer /probes).
- Replay fix: probe decisionContext skipped context-token-budget-v1; budgeted replay matches 9e33 t1385 at 60,107 prompt tokens (all Qwen contexts exact).
- Result: the built line (system prompt) 0/16 vs 0/16. A once-only SUPERVISOR note after a guarded scene trigger, quoting the scene's lines and naming its participants: DEV 90/96, fresh held-out (5 unseen runs) 141/160 vs off 5/160, forced misfire 2/32.
- Next: a new switch (e.g. scene-followup-note-v1) with the guarded trigger and SUPERVISOR template, after the operator picks the variant. This branch's scene-followup-prompt-v1 stays unlanded.
- Follow-ups: probe library ContextBudget gap, Replay gymHealWarning hook, 536 MB log limit; llama.cpp hybrid checkpoint loop.

## M2: rebuild as a guarded SUPERVISOR note (the operator picked "Supervisor: quoted lines + names", 2026-10-27)
Branch reset onto main 896088908 (the unlanded system-prompt version is kept at refs/heads/backup/scene-followup-prompt-v1-line).
- Same id scene-followup-prompt-v1; no system-prompt line. Trigger (game state only, one dialogue_auto_advance):
  >=2 pages with no speaker and other people on screen; on-screen people change between those pages; the
  player's tile is the same on those pages; stop=field_free; no page has a speaker the game or harness attributed.
- On that call's tool_result, the next request gets one user message "SUPERVISOR: …" (the probe's quoted lines +
  names template, verbatim pages, no truncation); the next tool_result clears it. Recorded as ledger_context.
- needs script-line-presence-v1 (on_screen page data). current.json: bundle ON, control OFF.
- [x] RED: packages/agent/src/scene-followup.test.ts on recorded fixtures (test-support/scene-followup-events.json:
  theft 9e33/d41e fire; woods, museum, Birch lab, Birch rescue, "Don't leave me", Rusturf grunt, gym youngster quiet)
- [x] GREEN: packages/agent/src/scene-followup.ts (sceneFollowup, sceneFollowupNote, sceneFollowupContext), wrapped around the final transformContext in play-wiring.ts so the note is the request's last message; script-line-presence exports onScreenItem (no behavior change). Registry/presets/next-run/legacy fixtures/current.json (bundle ON, control OFF); type-gap-registry tail window shifted by one. Wiring deleted once -> 2 factory tests red, restored -> 11/11.
- [x] Production replay: 9e33 t1385 via decisionContext with the switch on ends in exactly the probe note; all other messages equal OFF except transient timestamps; system prompt unchanged.
- [x] Explainer rewritten (pages-check clean), FEATURE_EXPLAINERS + README + panels/server tests; report status section added.
- [x] Gates (final code): build, lint clean; agent vitest 4624/4624, viewer 2091/2091, pytest 4440 + 69, trainer-card 3/3. Coverage: stopped at coordinator CPU rule, pending a heavy-CPU window.
- [ ] Gates, review (Claude + fallback; GPT out, the operator approved landing without it), land ff-only

### M2 review round 1 (packet 596b1fb019e303704451718f74be808fe8efd1e98d95911dc8a0717c4cda3f58; base b3a2bf941 / 948095751, same diff)
- Principles: 0 FAIL. Claude CLI lane: VERDICT: LGTM. Fallback Sonnet: LGTM. Fallback Opus: LGTM. GPT lane out (Cursor usage, Codex tokens); The operator approved landing on Claude + fallback.
- Triage, all follow-ups (no Fix):
  - several tool calls in one turn: a later result clears the note before it is sent (spec-literal); count it in the fixed run.
  - live.ts autoTalkContext wraps outside contextTools and can append after the note in rare loop cases. The play-wiring comment overclaims "final message".
  - a text-only reply resends the note without a new ledger_context; a continuation restore may deliver it once without a ledger record.
  - boundary text said type-gap-registry shifted (it no longer is); a redundant legacy-features entry.

### M2 fix (coordinator: reviewer note 1 is a real delivery bug)
- [x] RED 6300479d7: same-turn second tool result dropped the note; a text-only reply resent it.
- [x] GREEN: the note is armed by the scene's own tool result, joins each request until a non-error assistant reply follows a request that carried it, then is cleared for good. A failed model call keeps it. ledger_context is recorded once, at first delivery. 14/14 scene-followup tests; targeted agent tests 70/70; production replay at 9e33 t1385 still ends in the exact probe note.
- Follow-up kept: live.ts autoTalkContext can append after the note in rare loop cases.
- Re-review round 2 (fix delta e5a61cb9): Sonnet BLOCKING, a real bug. On continuation, replayed history armed the note from an old scene and nothing cleared it (the clear required sent===true). Fixed with RED/GREEN: any non-error, non-aborted assistant reply after arming clears it. Live, that reply answers the request that carried it; on replay, the turn already passed. 14/14.
- Round 2 verdicts on delta e5a61cb9: Claude LGTM, Opus LGTM, Sonnet BLOCKING (replay re-arm; fixed in 46b6054c1/19ace7a30 as above). Opus/Claude note production restore paths call the transform at each replayed turn_start, so the old guard also held there; the any-successful-reply clear is kept as the simpler, safer rule. Added tests: aborted reply keeps the note; a newer scene replaces an undelivered note. 16/16.
