# Moving NPC semantic target

## Authorized outcome
The operator approved the minimal bounded follow repair, default OFF, ON in bundle arms, tested, reviewed and landed. Do not touch active runs. A loaded object selected by the model may move without changing identity. Reuse supported approach planning and checked native interaction; return on unavailable identity, interruption, unreachable geometry or a shared bounded attempt limit. No route selection, new game facts, static-template behavior changes, or launches.

## Scope and milestone
One implementation milestone: RED regression; GREEN behavior/registry/presets/explainer and future bundle settings; required gates; frozen three-cloud-lane review; landing board; fast-forward merge and protected live-viewer verification. All active run artifacts, leases, processes and frozen run checkouts are excluded.

## Evidence
User reports 190 aborts in 0517 and Briney stalls in three runs. Main semantic-navigation.ts rejects target coordinate drift during travel and facing; sameTargetIdentity also includes coordinates. We verify the code mechanism, not the reported run counts here.
Game source: clean pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, field_control_avatar.c GetInteractedObjectEventScript selects the current object at the facing position/elevation (including counters). Reuse interactionRecipient rather than trusting a cached tile.

## Invariants and verification
- OFF follows the original code, description and result unchanged.
- ON follows only a loaded object with stable local ID/native slot/elevation/activation on the requested map.
- Fresh planning after every bounded movement action. Check the current native recipient before face/A. Shared attempt bound includes facing and precondition retries.
- Return immediately on battle/dialogue/script/map/UI ownership changes, disappearance or changed identity. Existing trainer sight and script-boundary checks remain effective.
- Production playGameTools wiring exercised; registry/preset/default/bundle declaration and explainer delivery tested.

## Session log
- Created isolated codex/moving-npc-target from ebed5a7f3. Dependencies installed offline. No active runs changed.
- RED: production-wiring regression file: 5 failures / 8 passes, including moved-target travel/facing/A races, budget and absent default registration. Receipt /tmp/moving-npc-red.log.

## Gates and review
Pending. No experiments authorized or launched.

- GREEN implementation: loaded A-activated object branch reuses approaches/checked navigation/checked press. New checked navigation option limits each segment to one action. Shared 32-attempt bound includes rejected input preconditions. Stops on identity, native recipient, field ownership, map and script/sight boundaries. Tool description and overworld prompt describe the bound only ON.
- Default-OFF registry/preset/flag/viewer default and harness metadata wired. Five maintained bundle definitions (bundle-v-control, bundle-v-control-2h, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h): shared base false, bundle switch true. Historical/versioned protocols and control-base bytes unchanged. No active run/preset copies touched.
- Eight adversarial checks performed and restored: production switch wiring; native-slot/elevation/activation identity operands; native recipient; pre-input drift; one-command segment limit; 32-attempt cap. Each targeted regression failed. Restoration passed. /tmp/moving-npc-mutations.json and /tmp/moving-npc-mutation-*.log retain separate receipts.
- Headless Chromium explainer checks at 1280/1440/375, expanded/collapsed, with no page errors or document overflow. Inspected all six screenshots; corrected mobile source hash wrapping and gave diagram its own horizontal scroll. Local proof /tmp/moving-npc-page-proof.json and main runs/mockups/moving-npc-target-v1/shots.
- Initial full checks retained: preset schema requiredness was corrected; legacy fixture lists/catalog count updated without changing frozen prompt digests. Concurrent full-test/coverage attempts exposed unrelated child-startup output race and full-explainer rendering timeout. No production runner/test timing was changed. Clean sequential gates pending.

- Final focused file: 24 passed, including stationary ON/OFF exact result, continuous drift bound, long route total cap, native recorder delivery, and sight exclusion/refusal from production-shaped game-server reply. /tmp/moving-npc-sight2.log.
- Coordinator requested no heavy checks pending explicit CPU admission; stopped only this chat's owned qualification tree (root 62401) before test/coverage stages. No gameplay or shared viewer signals. Normal landing queue and designated viewer tree /private/tmp/pokebench-viewer-qwen36-20261024 apply. Final full gates await CPU window; no clean-gate claim.

- GREEN commit ed28a6382. Integrated main 42edb3f22 (trigger boundary promotion and recipe-fixture caching) without conflicts. Its trigger-boundary both-arm promotion remains intact; this NPC switch stays bundle-only. Preparing exact clean integration tip for CPU admission.
- Synced again to main 7133032cc after its landing evidence commit; final CPU-ready tip reported to coordinator.

## Operator scope amendment: one maintained feature configuration
The operator explicitly requested one maintained feature config, future-launcher migration, archive bundle-cook-1h/whole-map-cook-1h/whole-map-pair-2h, then review and land the NPC fix, leaving active runs untouched. Prior CPU READY withdrawn.

Design: experiments/feature-configs/current.json owns the current two-hour control baseline and treatment switches. The retained Qwen and GLM protocol JSONs reference it; loader materializes a self-contained definition before approval/run and hashes both source and recipe. Existing complete historical definitions still parse without external configuration. The three archived protocol files preserve current-main bytes and live histories/pinned copies remain untouched. Current Qwen vs GLM treatment differs only in full-map navigation and pacing; future shared config uses the newer Qwen baseline (whole-map ON, original-speed pacing OFF). No existing run is reconfigured.

New production path scope: fixed-design.ts pure source materialization/schema; fixed-definition.ts filesystem owner; fixed-cli.ts load/plan/receipt; tracked feature config and protocol refs; future launcher declarations/documentation and integration/rehearsal tests. No scheduler, lease, controller state or model endpoint mutations.
- Consolidation RED: fixed-definition.test.ts fails because the source loader/materializer does not exist; /tmp/moving-npc-feature-config-red.log. Preserve both-arm promotions union from retained donors (including pacing), while keeping the newer whole-map control baseline.

- Consolidation implementation: pure typed reference materialization in fixed-design.ts; file owner fixed-definition.ts; CLI plans keep references rather than flattening back into sources; approvals hash both source/config, and exploratory source receipts save exact resolved flags. Three retained future protocols now reference current.json. Newer Qwen baseline retained, plus explicit common-promotions union (original-speed-pacing, named-warp destinations, exit-labels-v2) from the general donor.
- New read-only history seam: experiment-cohorts.ts indexes archive titles after current definitions. CLI analyze permits archived complete definitions; launch/approve/load does not fall back to archives. This is necessary to keep historical recorded runs and their analysis usable after moving the files. Tests use one recipe-text adapter to materialize references and read archived protocol fixtures; older baseline assertions are explicitly labeled historical.
- Future GLM wrapper stops supplying a competing definition as a feature donor; its source protocol's featureRecipe reference supplies current features automatically. Qwen latest-main launcher already loads through the same CLI; schedule, model, lane, duration, checkpoint and currently running controller code/env remain unchanged.
- Focused config tests initially GREEN (9); CLI source/reference/approval tests green except preserved missing-file diagnostic, corrected. A fake current-GLM runner rehearsal chained two serial trials and wrote presets/status/ledger; audit assertion API corrected before final run. No new inference/game process was launched. Heavy gates are held for the coordinator's priority recovery window; requested a max20s focused LIGHT check only.

- Archive compatibility is read-only. Added archive fallback solely for explicit historical analysis, and archived titles to the existing provenance owner. New launch/default load refuses retired IDs. Existing complete definition hashes remain byte-exact; reference hashes bind exact raw source/config text. Plan writes source refs unchanged.
- Central test adapter recipeText(URL,utf8) resolves current source refs and explicitly retained archived protocol fixtures. Production loader API: readFixedDefinition(root,id[,allowArchive=false]); parseFixedDefinition(text[,readRecipe]) remains pure. Other feature owners were notified to append registered defaults/arm policy in current.json after migration and leave archived snapshots untouched.
- Source-title preservation check against canonical current sources: {"before": 27, "after": 27, "removed": [], "added": [], "changed": {}}. This verifies title metadata only; built viewer/real-run proof remains pending coordinated qualification.

- Integrated main 429375802 (reviewed startup/serial fixture repairs) cleanly. No feature/protocol policy changed by that merge; migration qualification still pending explicit CPU admission.

- Static migration cleanup removed an obsolete fixture reader import; diff whitespace validation passes. Full checks remain queued, with no changed gate thresholds or retry suppression.

- Bounded targeted migration check terminal: agent 623 passed/14 failed, viewer 578 passed/7 failed (11.25s total; owned children released). New loader/CLI/runner tests passed. Failures were old donor feature promotions/switch positions. Updated explicit maintained-baseline expectations while retaining archived treatment assertions; GLM now receives the same navigation recovery as Qwen. Original heal-first control policy remains tested against archived bundle-cook bytes. No retries/weakening. Final checks pending.
