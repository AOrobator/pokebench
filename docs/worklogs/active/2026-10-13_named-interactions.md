# Named interactions experiment

## Problem Statement
Operator authorized stopping Think Fast trial2 and testing named interactions. Trial1 mistook stairs at (7,1) for clock and ignored generic background candidate (5,1). Add source-grounded interaction identity to existing observation text/recorded state, not new per-turn refreshing or route planning. Preserve old runs and UI handoff.

## Skills Loaded
pokebench-game-state, agent-observability, pokebench-patch-evaluation, feature-worklog. Operator approval is the request to do this test; no additional approval gate inferred.

## Architecture
Existing coherent RAM reader owns positions and interaction definitions. Name verified ROM script identities and live sprite identities; unknown remains explicit. Add independently switchable named-interactions-v1, OFF for legacy v1 presets/default incumbent. Names share existing observe/press delivery, no walkthrough and no game writes.

## Invariants
- INV-N1 Identity matches verified script/graphics; no coordinate-only guesses. Tests wrong script/map/kind and live position movement.
- INV-N2 OFF reproduces incumbent model text and ON adds only identities. Boundary/event compatibility and feature metadata tests.
- INV-N3 All native scoring unchanged; unknown identities remain unknown. Coherent real frame/state/tool text proof and mutation receipts.
- INV-N4 Equal serial experiments: four per arm Think Fast, order OFF/ON/ON/OFF/OFF/ON/ON/OFF; fresh boot, CLOCK_SET native target, 30 minutes/1500 turns, medium4096, retry3, objectivesOFF, existing loop guard ON. Zero completion regression tolerated; speed benefit only if completion at least equal and successful median at least10% faster. No automatic promotion. Downstream starter/gym claim deferred.

## Security Review
External ROM read only, never copied/staged. Pinned vendor and pret reference untouched. Local models reserved for gameplay, external reviews only. Unknown script identity is not proof of object purpose or current availability.

## Milestones
- [ ] RED production reader/delivery/flag tests and source mapping evidence.
- [ ] Implementation, GREEN gates, mutation receipts and coherent native probe.
- [ ] External review, land frozen change, execute eight serial trials and report.

## Closing the Loop
Freeze both complete presets, source/config/ROM/vendor/model provenance and retain every outcome. Use normal production runs, viewer visible. Stop on infrastructure failure, no silent replacements.

## Session Log
2026-10-13 stopped Think Fast trial2 via exact owner launcher SIGTERM -> active model SIGINT; terminal operator_abort recorded, remaining3/4 withheld. Trial1 and2 retained. New worktree based clean main f67a147, separate from UI checkpoint f4d75fe.

## Surprises
Clock already exists in readout as unnamed background at (5,1); exact source WallClock event confirms identity, actual frame shows clock left of stairs. Need ROM-script qualification before labels.

## Multi-Model Review Log
Pending; no local reviewer calls permitted.

## Boy Scout Log
No unrelated UI work.

## Archive Milestone
- [ ] ASK USER: archive after completion.

RED committed692f917, retained red.log: three reader/delivery failures before implementation. Mapping receipt source-mapping.json covers271 exact pointer/signature identities from420 uniquely matched source sign-array events. Labels are script-derived, not NPC personal-name inference. Unknown/ambiguous arrays and non-sign payloads withheld from semantic catalog. Live sprite kinds reused, coordinates from live RAM.

Catalog stores SHA256 digests of16 instruction bytes, not ROM bytes. Pointer plus digest qualifies identity; source files contain no copied ROM content. Synthetic fixtures use an explicitly substituted digest, native probe qualifies real ROM.

GREEN validation: agent656/viewer235 tests, agent coverage98.91 lines/93.99 branches/98.37 functions, viewer98.41/91.75/96.93, Python497 tests and99.43/97.38/100. All independent90 floors pass; lint/build pass. Current source differs only for shared typed normalization, rechecked final coverage. Four retained deletion/restoration receipts: signature, digest, production observation delivery, feature metadata; restored focused tests green. Generator reproduces catalog bytes exactly.

Native proof: first excluded probe failed because shared editable environment selected main reader; isolated venv now resolves worktree source and shared pinned binary libraries. Second excluded probe 2026-10-13T16-51-15_probe-named-interactions_771b delivers Wall clock at(5,1) in normal recorded tool results. Event714, paired frame000714, position(5,2) facingUP, clock-stopped dialog confirms actual interaction identity. Native-observation.json/native-clock-interaction.json retain coherent state/frame/text. Probe's assertion incorrectly expected clock callback before dismissing initial clock dialog and ended crash; retain that failure and qualify only observed label/position/interaction, not clock completion. No benchmark or unsupported completion claimed.

## Review and landing receipt
GREEN568da26 reviewed at diffSHA256bbba9e1701905cf6d844f10151c61235af97a301cd235d98e0fc41b9b0d20665. Grok(exit0, emptystderr), Sol and Astra each explicitLGTM. Astra additionally verified82 matched arrays against unique ROM event-header references. CursorClaude Opus/Sonnet usage limits and boundedClaudeCLI90s timeout retained; mandatory family exhausted, standing independent fallback used, reduced provider diversity declared. Local review requests prohibited by operator; none made. Earlier detachedGrok request lacked terminal receipt and was explicitly unproven/terminated; boundedrepeat supplied valid exit0 and verdict. No blockers outstanding.

Landed main059cc7c with exacttree equality to reviewed568da26. Fast-forward was blocked by another chat's human-playthrough viewer changes; preserved its four UI working edits and untracked worklog, applied only frozenpatch to index, verified stagedtree equals reviewedtree beforecommit. Stale sequencer bytehashes unchanged. Other-chat source remains uncommitted, not included in our landing.

Comparison launched: named-interactions-think-fast-clock-n4, eight serial trials ABBAABBA with4perarm, CLOCK_SET freshboot,30minute/1500turn, medium4096/retry3, objectivesOFF and loopguardON. Frozen clean named-interactions worktree568da26 is the normal production live.js executable; only its ignored runs directory aliases canonicalruns, and isolatedPython environment resolves that worktree's source with pinned shared runtime libraries. This isolates gameplay from continued unrelatedmain UI edits. Complete immutablepresets, servingidentity, plan, trialledger, viewer/driverPIDs, landing/sequencer receipts under canonical runs/launch-receipts/named-interactions-think-fast-clock-n4 and runs/named-interactions-proof. Viewer8793 refreshed for optional name eventfield; preview8796/UIhandoff untouched. FirsttrialOFF2026-10-13T17-07-50_think-fast_805e validated live, no parserproblem, metadataexactcaps/sourceclean/objectivesOFF, actualbuttonpresses. Finite reportjob writes native-qualified comparison.json/md after terminal; no automaticpromotion, no replacement of failure.
