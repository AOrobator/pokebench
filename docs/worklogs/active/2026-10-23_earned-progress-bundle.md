# Earned campaign progress in future bundle runs

## Problem and authorization
User: "Enable the earned-progress clock in the bundle for future runs, but leave the current runs alone."
Activate the already-reviewed campaign-progress-clock-v1 only in the maintained bundle recipe arms. Controls, global defaults, current frozen presets/controllers/gameplay and runtime services remain unchanged. No new launch or restart of runs is authorized.

## Scope
Seven maintained definitions matching the existing named-move guard contract: bundle-v-control, bundle-v-control-2h, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, gym-rustboro-torchic, gym-rustboro-torchic-healed. Add false to each base, append the switch to each bundle list. Preserve historical/versioned definitions and all other fields. No production runtime change.

## Skills
feature-switch, execute-worklog, talk-to-claude, close-the-loop; review contract and PB1-PB13 apply. Existing feature explainer and clock wiring need no redesign. Operator approval supersedes initial default-OFF activation hold for bundle recipes only.

## Proof
RED generated bundle/control tests, GREEN exact armPreset/armFeatures/dry-run checks; compare all unrelated definition fields and controls, retain current run preset/config hashes and process starts. No GPU/model/emulator calls. Deterministic gates and frozen cloud/fallback review, serialized landing. A later run_start is required before claiming the feature ran; no run launch is part of this task.

## Status
- [x] RED/GREEN recipe proof
- [ ] Gates and review
- [ ] Landing and future-run configuration proof

## Session log
- Main base ec19227bc; reuse owned clean campaign worktree on new branch. Direct user approval covers activation; no further permission requested.

- RED41-case fixed-design suite observed7new bundle activation cases fail. GREEN41pass after seven recipe-only appends; controlsfalse. Changes preserve formatting and unrelated fields. No currentrun files touched. Campaign runtime owner has next integration window; offering this bounded delta before their freeze, otherwise defer source freeze/landing until release.

- Offline production rehearsal passes all7recipes/8phases: parseFixedDefinition → armPreset → parsePlayPreset/presetFeatures → playHarnessFeatures; clock recordedONonlybundle. Pure dryRunDefinition/soloDefinition generation alsoON. All unrelated recipe fields identical to ec19227bc and parsed/normalized control presets byte-identical; raw control JSON gains explicitfalse, so rawJSONidentity is not claimed. No fixed-run CLI dry-run or launch invoked. Receipts runs/reports/earned-progress-bundle/rehearsal.json.
- Captured5current process identities +3stable run_start record hashes (allclockOFF). Current runs expose process titles rather than preset argv, so no preset-filehash claim. No currentrun files written. Controller2367 uses frozen wrapper capturing latestmain pertrial and feature_recipe; actuallater run_start remains required for execution claim.

- Full preflight correctly caught older bundle-list positional assertions after appending the new switch. Shifted only the3affected existing expectations by one; feature/order semantics retained. No runtime code/testthreshold changes.
