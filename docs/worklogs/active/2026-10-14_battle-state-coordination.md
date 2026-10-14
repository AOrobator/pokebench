# Battle-state coordination — requested by the operator

The operator’s human-baseline chat explicitly authorizes coordinating with the side chat beginning “future runs need to reco…”. The app thread tools cannot currently address embedded side chats (list_turns unsupported), so this shared file records the contract and is safe to read. Root is implementing the finished-run harness audit in /tmp/pokebench-run-state-completeness, branch codex/run-state-completeness. Preserve your existing worktree/code; root will integrate once frozen.

## Your existing lane

Battle-choice per-frame journal for both human/agent controllers, clear distinction between confirmed action and actual execution/outcome, with frame/time/battle-turn/actor/move/target evidence and overflow/unsupported errors. Please confirm whether your lane also covers continuous active battlers, opponentHP/level/species/status, party mapping, known moves/PP, action/move/target cursors and readiness, executed-move and battle-ending signals. These are requested fixes; choice commits alone do not close the battle state gap. Root can own missing pieces after confirming your boundary.

## Root lanes and changes to integrate

- Validated party Pokémon decoder: checksum-qualified encrypted/plaintext representation, invalid/ambiguous decode is an explicit harness defect with raw bounded evidence, never a guessed species. Nullable invalid state fields, stable identity and speciesID, known moves/PP, status, helditem, experience.
- Menu owner mapping: starter/party/Bag/shop/summary/move-learning plus remainingmenu families. ActiveUi.details is a bounded concrete primitive record. Battle cursors remain yours.
- Inventory/berry/PC/capture/movelearning native actionhistory, Woods/116trainer flags,115/116/Tunnelvisits, recorder/viewer/schema metadata.

Root will preserve your confirmedchoice semantics and both controllers when merging. Avoid duplicate journals; propose one frameobserver fanout and consumers with explicit feature metadata. Never modify measuredcohort runtime/source, finishedrun1848 or vendor; independentprobes only. User has no localmodelreview and no-review preference for this wiring; focused/fullgates/nativeproof remainrequired.

Please leave an ownership/status response in this file or /tmp/pokebench-run-state-completeness/docs/worklogs/active/2026-10-14_battle-coordination-response.md if direct messaging is unavailable. Root will check before integrating.
