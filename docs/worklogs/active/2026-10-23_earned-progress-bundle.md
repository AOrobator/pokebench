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
- [x] Gates and review
- [x] Landing and future-run configuration proof

## Session log
- Main base ec19227bc; reuse owned clean campaign worktree on new branch. Direct user approval covers activation; no further permission requested.

- RED41-case fixed-design suite observed7new bundle activation cases fail. GREEN41pass after seven recipe-only appends; controlsfalse. Changes preserve formatting and unrelated fields. No currentrun files touched. Campaign runtime owner has next integration window; offering this bounded delta before their freeze, otherwise defer source freeze/landing until release.

- Offline production rehearsal passes all7recipes/8phases: parseFixedDefinition → armPreset → parsePlayPreset/presetFeatures → playHarnessFeatures; clock recordedONonlybundle. Pure dryRunDefinition/soloDefinition generation alsoON. All unrelated recipe fields identical to ec19227bc and parsed/normalized control presets byte-identical; raw control JSON gains explicitfalse, so rawJSONidentity is not claimed. No fixed-run CLI dry-run or launch invoked. Receipts runs/reports/earned-progress-bundle/rehearsal.json.
- Captured5current process identities +3stable run_start record hashes (allclockOFF). Current runs expose process titles rather than preset argv, so no preset-filehash claim. No currentrun files written. Controller2367 uses frozen wrapper capturing latestmain pertrial and feature_recipe; actuallater run_start remains required for execution claim.

- Full preflight correctly caught older bundle-list positional assertions after appending the new switch. Shifted only the3affected existing expectations by one; feature/order semantics retained. No runtime code/testthreshold changes.

- Broader viewer preflight also caught two legacy-order filters that already exclude later treatments. Added clock to those filters, preserving their original feature-order assertions. Current recipe activation remains the sole configuration delta.

- Fake-host production fixed-cli.main rehearsal passes Mac glm53-flash-4h and GPU gym-rustboro-torchic-healed with feature-recipe bundle-v-control-2h, normal dry/solo argv, capturedrun definitionclockON, identicalmodel lane and zero hostmethod accesses. Injected ROM/checkpoint hashes are declared config fixtures, not nativevalidation; no ROM/save file copied or read and no realrun started. Setup needed CLIminimumwall60000 and both declared controlbase/start-hash fixtures. Receipt fake-cli-receipt.json.
- Direct agreed order: campaign actualrelease → this small activation gate/review/landing → cycle-stop stablecompletionwindow. No new sourcefreeze/main/8790 move before campaign release.

- Synced campaign source67137a3e5 without conflicts; activation diff still only7recipefiles/6testfiles/worklog. Rebuilt source; fullnormal4053agent/1747viewer/4050Python and lint/build/vendorpass. Both normalgeneration and fakeCLI overlay rehearsals rerun successfully on newcode. Initial coverage had unchanged live-human/live-target-caller import timeouts then downstream leaked mock state under shared-host load; failed log retained, no test suppression or source change. Repeat coverage without concurrent owned build/rehearsal.

- Final default coverage passes4053agent/1747viewer/4050Python after other test workers exited: agent99.13%lines/92.93%branches/97.61%functions, viewer98.01/91.51/95.10, Python97.37/93.30/100. Previous two failed unchanged-import timeout runs retained; no test timeout/workers/retry/skip/serialization changes. Normal fulltests pass too.
- Synced source67137a3e5 and docs-onlyevidence7d550557d. Campaign owner released board and permits branch reviews but retains short main/8790 source window for actual campaign launch proof; no main/8790 action until direct release or coordination. Next agreed window is this config activation, then cycle-stop. Final review packet remains only14files:7recipes,6testfiles,worklog; no runtime production changes.

## Landing evidence
- Frozen source ea42031d306aed516729fc3f9759ca645fe6e90e fast-forward landed from7d550557d under board#1, actual Codex session 00000000-0000-4000-8000-6e66d6c7b105. Packet SHA2566e630a20c916b6d04206afc901eef3f6ef2756984de68ef677ca088acc55b7ef. Claude cloud, fresh isolated Sol GPT, Astra fallback and supplemental integrity all LGTM. Grok fresh usage-limit failure retained; previously verified general human outage waiver applies; reduced family diversity explicit. Review synthesis/receipts retained runs/reviews/earned-progress-bundle-ea42031d3/. No blockers; preexisting positional-test cleanup outside scope.
- All full branch gates pass as above. Postlanding main just test passes4053agent/1747viewer/4050Python. Actual-main production parse/arm/preset/recorded-feature rehearsal passes seven recipes/eight phases; fake fixed-cli seam proves Mac/GPU overlay clockON and unchanged lane without host accesses. Current source receipt runs/reports/earned-progress-bundle/rehearsal.json and fake-cli-receipt.json. No actual future enabled run_start or gameplay benefit claimed.
- Campaign owner released source window; direct agreed order CLOCK→minimal viewer restoration repair→CYCLE freeze. Viewer owner explicitly granted exclusive one8790refresh after this evidence commit; live refresh receipt retained separately under runs/reports/earned-progress-bundle/. Protected active identities53193/53718/59194/59608/59717/59718/59806/59807 snapshotted before refresh. Existing continuation reader defect belongs to viewer repair; no claim it is fixed by this config patch. Original2367/3395/34823 naturally absent at review, no survival/cause claim. No currentrun/config/controller/worker edits or game restarts. Global defaults/controls and custom campaign clock remainOFF.
