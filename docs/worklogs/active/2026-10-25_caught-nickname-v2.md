# Capture input and nickname coherence

Problem: Astra 429f pinned aacff237 observed registration and nickname YES/NO as battle_resolving. Existing capture switches were OFF. Native archive replay establishes existing decoders recognize both; nickname active_ui remains contradictory even with V1 ON.

Authorization: The operator approved enabling existing capture switches in both arms and adding a versioned nickname coherence fix (2026-10-25). One bounded milestone; no measured-run modification, gameplay, process changes, messages or shared refresh. Landing not included in this branch milestone.

Skills loaded: feature-switch, feature-explainer, agent-observability, pokebench-game-state, trace-forensics. Source: clean pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, Cmd_trygivecaughtmonnick and Task_HandleCaughtMonPageInput; US ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7.

Architecture: retain V1 recognition/wait ownership. V2 depends on V1 and projects its verified ready nickname prompt into ActiveUi before all readout/event consumers. No automatic answers or batch-policy changes. Maintained current recipe promotes dex V1, nickname V1 and V2 in both arms. New omitted V2 remains OFF for historical compatibility.

Invariants: V2 OFF preserves prior state/readout exactly. ON only projects ready, diagnostic-free, battle-owned nickname YES/NO. Invalid/transitional/unrelated owners retain prior behavior. Both-arm activation belongs only to current recipe; frozen artifacts unchanged. No RAM writes.

Security: no new endpoints, tools, subprocesses or input policy. Local self-contained explainer only.

## Milestone
- [x] RED: native-backed prompt projection and real recipe materialization.
- [ ] GREEN: registry, production server wiring, projection, shared recipe and explainer.
- [ ] Tests, lint, build, coverage and wiring deletion proof.
- [ ] Independent review; report native gameplay proof pending.

## Closing the loop
Use retained archives from 429f and existing native-derived fixtures; no new gameplay. Later isolated native validation requires explicit launch authorization. Review/commit/landing status reported separately.

## Session log
- Read repo rules and current worklog. Created isolated worktree from main; measured run remains pinned and untouched.

## Surprises
- Nickname V1 corrects battle.prompt and wait phase, but active_ui performs a separate battle read without turn_action_prompt. V2 addresses that projection only.

## Multi-model review log
Pending.

## Boy Scout log
None.

## Archive
User gated; not requested.

- RED: production archive tests fail for all three ready cursors and missing server default (4 failed, 7 passed). Initial attempt lacked ROM environment and is excluded. Native archive fixtures bind source run/sequence/hash; no ROM included.
