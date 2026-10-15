---
name: feature-switch
description: Put every PokeBench harness behavior change behind a registered feature switch whose OFF state reproduces the previous behavior, so it can be A/B tested in the experiment queue. Use whenever a change alters what the model sees, the tools it gets, how actions execute, navigation/planning, guards or prompts; not for pure measurement, viewer-only or no-behavior refactors.
---

# Every behavior change ships behind a switch

Operator rule (2026-10-14): "we need a skill so that you always include switches for changes." A change that can alter what the agent does must have a switch, so it can be measured against the incumbent before anyone calls it an improvement. A change with no switch has no OFF arm and cannot be queued.

## Does this change need a switch?

It needs one if it changes any of these: the system prompt, tool list or tool descriptions, the readout or state JSON the model receives, how a press or `navigate_to` executes, planner rules, guards, recovery feedback, or any default the agent depends on.

It does not need one if it is:
- a measurement feature (use `measured()`; it records without changing model input);
- a viewer-only change;
- a refactor proven byte-identical by tests;
- a fix to recording or grading that the model never sees.

If unsure, add the switch.

Already-landed behavior that never had a switch gets one retroactively, as `elevation-transitions-v1` did. Its default is ON, so presets and runs keep today's behavior, and OFF restores the behavior from before it landed.

## Checklist (all in the same change)

1. **Registry** (`packages/agent/src/features.ts`):
   - Append the id to `SWITCHABLE_FEATURES`.
   - Add a `FEATURES` entry in the same position: group, `needs`, title, and user-facing copy that includes ` Off: ` and says exactly what OFF does.
   - Append `...when(id)` at the end of `playHarnessFeatures`. Never reorder this list; recorded runs depend on it.
   - Use `needs` only if ON is meaningless or invalid without the other switch. A default-ON switch whose dependency can be OFF must use `needs: null`, or old presets fail validation.
2. **Presets** (`packages/agent/src/play-preset.ts`): make the id optional in `FeatureSetSchema` and give it a value in `normalizeFeatures`. A new treatment defaults to `false` when omitted. A retroactive switch on landed behavior defaults to `true`. Set `flagFeatures` the same way.
3. **Defaults**: set `DEFAULT_NEXT_RUN` in `packages/viewer/src/next-run.ts`. New treatments start OFF until they win an experiment.
4. **Server side**: if the game server applies the switch, add it to `SERVER_FEATURES` in both `features.ts` and `env/pokebench_env/readout.py`, and to the Python default-off list if it starts OFF.
5. **Wiring**: thread the switch from `FeatureSet` to the behavior through the production factory (for example `withNavigation`, `playTools`, `playSystemPrompt`). Do not read env vars or globals.
6. **Tests**:
   - OFF reproduces the previous behavior exactly: same plan, same prompt, same tools and same readout bytes.
   - ON produces the new behavior.
   - A factory-level test proves the production path honors the switch.
   - Delete the wiring once and watch that test go red, then restore it and record it in the worklog.
   - Update the registry counts and the legacy harness-feature lists.
7. **Explainer**: write it with `.claude/skills/feature-explainer/SKILL.md` and map the id in `FEATURE_EXPLAINERS` (`packages/viewer/src/panels.ts`).
8. **Register it as pending** in the same merge: add `experiments/<id>.json` with no `queuePosition`. Follow `.claude/skills/experiment-queue/SKILL.md`. The entry records the switch id, hypothesis, arms (the shared incumbent with this switch flipped), activation milestone, readiness and `source.commit` set to the merge SHA. Record the readiness verdict in `docs/experiments/readiness.md`. The entry moves into the queue only when readiness passes. Never approve or start it yourself; only the operator approves measured runs.
9. **Restart the viewer** after the merge with `just viewer-main`. The viewer on 8790 validates `experiments/*.json` against the switches in its own build, so a viewer built before the merge reports the new switch as invalid until it is rebuilt.

## Veto

- A behavior change with no switch, or a switch whose OFF state is not the previous behavior.
- Changing a default to ON for a new treatment before an experiment supports it.
- Reordering `SWITCHABLE_FEATURES`, `FEATURES` or `playHarnessFeatures`.
- Reading the switch anywhere other than the `FeatureSet` passed to the factory.
- Merging a switch without its pending experiment entry.
