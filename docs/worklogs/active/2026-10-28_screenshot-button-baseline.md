# Screenshot and button baseline

The operator requested one minimal baseline and explicitly approved the prompt quoted below (2026-10-28). GPU1 owner Claude granted N=1, <=30 minutes, :[local inference port] only, normal exclusive lease; GPU0 run 9c88 stays untouched. The approved exploratory run has since completed; see the landing status below.

Approved prompt: You are playing Pokémon Emerald. Make as much progress as you can. You receive screenshots and can use `observe` to view the screen or `press` to press buttons: A, B, START, SELECT, UP, DOWN, LEFT, RIGHT. Choose your actions from what you see.

One bounded milestone: default-off screenshot-button-baseline-v1 selects this prompt and image-only successful observe/press results. A baseline preset disables every other behavior switch, retains ordinary conversation history and private RAM/native scoring/complete exposed reasoning recording. Existing button timing/schema unchanged. No navigation, auto-dialogue, supervisor coaching or injected memory. New errors remain explicit failures rather than invented game evidence. No incumbent activation or promotion. N=1 is exploratory, no effectiveness claim.

- [x] RED and exact OFF tests.
- [x] GREEN, production factory proof and wiring deletion check.
- [x] Prior full gates and review completed with Grok unavailable; fresh landing gate below remains required.
- [x] Fake-game rehearsal proves delivered prompt, tool schemas, screenshots, action/result chain and recorded thinking.
- [x] Launch one GPU1 run from boot, 30m wall maximum, verify viewer, release lease and notify owner.

Production boundary: feature registry and preset/default normalization; play prompt and ToolSwitches mapping; successful game-tool result content; feature explainer/card mapping; single-run preset and ignored launch/rehearsal artifacts. No changes to action semantics, game server, supervisor algorithms, viewer layout or scoring. Runtime source pinned to clean reviewed branch; landing follows normal board if needed for viewer compatibility. GPU lease begins only after rehearsal.

RED: three focused tests fail on inherited prompt, missing preset and leaked text. Command pnpm --filter @pokebench/agent exec vitest run src/screenshot-button-baseline.test.ts. Initial pnpm test -- invocation selected a broad suite; owned process terminated immediately, corrected to exec vitest; no passing full-gate claim.

Additional RED: baseline text-only replies still got the unconditional NUDGE. Added endOnTextOnly opt-in at Governor/production live binding; baseline ends model_error on a no-tool reply without a follow-up. Ordinary OFF policy remains unchanged. This directly enforces the operator-approved no-supervisor-nudges scope; no new retry/coaching policy for existing runs.

Operator correction: do not include premature termination. Removed proposed text-only stop before any real inference. Baseline continues normal assistant replies with empty prompts and retained history through pi start, because pinned pi continue rejects assistant-last history. No injected follow-up text. Preset maxTurns/failureLimit are MAX_SAFE_INTEGER (effectively disabled within30m), replyFailuresEndRun=false. Gateway/model errors retain existing logged resample path but cannot reach the failure cap during the window. Wall cap/operator stop remain. A process/server fault can still prevent continuation; no attempt to hide infrastructure failure.

GREEN: 141 targeted agent tests PASS across baseline/harness/config/registry/preset suites. Fake-model/native-game rehearsal:3requests,exact approved system prompt each time,exact observe/press schemas,no added user coaching,2image tool results,3nonempty assistant thinking records,1button action,private state events retained; second tool-less reply continues to the third request. Receipt runs/baseline-preflight/rehearsal-no-early-stop/receipt.json. First receipt probe mistakenly searched nonexistent thinking event type; corrected to actual assistant.thinking schema and retained failed artifact.

Mutations: prompt condition, ToolSwitches mapping, observe image-only filter and press image-only filter each removed independently; all produced assertion RED then restored. Production live binding deletion made native rehearsal inject NUDGE (noInjectedMessages=false), then restored and rebuilt. Current evidence no GPU traffic.

Round1: Claude and independent GPT BLOCKING on same concrete no-tool→model-error→resume(assistant-last) crash. Accepted in-contract fix, no scope expansion. Reproduced native 3requests/run_end crash and a targeted unit RED. Model-serving evidence gap: /apply-template returns200 but renders assistant prefill; qualification1token under GPU1 lease requested from owner before gameplay. Grok Cursor exit1 out-of-usage (exact receipt retained), no clean verdict. No real GPU inference yet.

Round1 accepted fix GREEN: native no-tool→HTTP400→valid press now sends4requests with exact prompt/tools, no added coaching,2image results,3thinking records,1button action and budget terminal; ordinary OFF suite unchanged. Owner amended GPU1 grant to include exactly1max_tokens=1qualification request inside same30m lease before gameplay. Launcher now gates child spawn on that HTTP/model-response check and stores request/response. /apply-template renders assistant prefill (not a new assistant header), recorded explicitly; no unverified claim of new-turn templating. VM lifecycle rehearsal covers success/nonzero/foreign-lease/busy-slot/dirty-source; it is rerun after qualification gate changes. Full CPU gate still pending.

Pre-full-gate targeted prompt-sync check found3old enhanced-tool fixtures using raw ALL_ON, which unintentionally enabled the new mutually distinct minimal prompt. Fixed only those3fixtureinputs to baselineOFF; every exact tool-description assertion is retained, no allowlist or coverage change. Baseline own fixture separately asserts exact approvedprompt/twotools. RED3/123 then focusedGREEN pending. User has authorized final review/fixes and launch on passingchecks; no productiondelta.

Superseding fixture workaround: retained all original tool-prompt-sync fixture inputs and assertions. Correct production composition instead: select minimal base prompt, then let other enabled switches append their own sections through existing code. Pure baseline allOFF still exactly approvedprompt. Mixedconfiguration with battletool keeps its documentedschema; newfocusedregression plus original3RED tests prove this. No new owner/path/config; no gameplay changes to actualbaseline or OFFpaths.

Final compatibility resolution replaces attempted composition: existing prompt transforms assume documented readout headers, so the baseline is an exclusive mode. One registry-owned predicate recognizes baselineflagON+allothersOFF; mixed presets are rejected by existing dependency validation (including next-run validation). Prompt/tool/live bindings share that predicate. Original enhanced-tool fixtureinputs/assertions restored. Exact actualbaseline and allOFF behavior unchanged. Newmixedpreset refusal plus rawadvancedfactory regression; no new productionowner/path/config. This enforces the operator-approved minimal baseline boundary instead of silently combining incompatible modes.

Full agent coverage pass reached4853PASS with2failures: legacy-preset fixtures in gym-evidence/coherent-battle spread rawcurrentALL_ON, thereby enabling a baseline that did not exist in the simulatedhistoricalpreset. Corrected only these2fixtureinputs to baselineOFF; every ownfeatureomission/default/registry assertion unchanged. Production source unchanged from reviewedcc02d3e77. Failure retained in gates/test-initial-failed.log. Re-run full gates after this bounded test-only fix.

Second full pass: all4855agenttestsPASS; viewer2236PASS/1failure in valid advanced next-run draft fixture spreading rawALL_ON. Set only that validfixture baselineOFF and added an exact HTTP409 assertion for mixedbaseline inputs. All existing registry/draft/history/otherinvalidassertions retained; no application change. Retain test-viewer-fixture-failed.log. New HTTP seam gets its own guard-deletion RED/restored proof before whole-gate repeat.


## Reusable implementation landing (operator request 2026-10-28)

The operator: "land the baseline implementation so we can reuse it but i shouldnt be used for the control or bundle arms". Scope: land the existing default-OFF standalone mode and preset; explicitly exclude it from both current comparison arms. No new gameplay, promotion or historical recording edits. The earlier proposed text-only termination and prompt-composition approaches above were abandoned; the exclusive predicate and uncoached continuation are the final implementation.

Prior implementation gates at189c41932: agent4855, viewer2237, Python4869, gateway116 PASS; lint/build/vendor PASS and approved trainer-card widths unchanged. Prior Claude/GPT/Sol/Astra reviews LGTM; Grok unavailable from usage limits, so those reviews did not authorize self-landing. Native launch-pin rehearsal and HTTP compiled-guard deletion receipts remain under runs/baseline-preflight. Actual exploratory run2026-10-28T19-20-55_qwen36-gpu1-baseline_e845 completed at the scheduled operator cap; lease released. Report: http://127.0.0.1:8791/reports/screenshot-baseline-e845/index.html. No efficacy claim or experiment promotion.

Landing sync to main4c4649b80: preserve the four newer switches, append baseline at index307, normalize it OFF and extend standalone preset with those switches OFF. Current arms retain their existing behavior. New actual-recipe regression: four definitions fail exactly on missing offInBoth membership (arms-red.log); next-run default remains false. Initial stale-dist attempts failed on unknown newer IDs and are not counted as behavioral RED. Build required a matching type-level Exclude for the new optional schema key; corrected before behavioral RED. Full CPU gates queued behind YAML's main viewer-test OOM diagnosis; fresh gates/reviews and board landing pending.

Landing exclusion GREEN: current feature-config owner explicitly lists baseline in offInBoth and features=false. Four actual recipes, both arms, every phase, arm bits and next-run default PASS (5tests). Baseline+governor targeted74tests PASS after sync. The RED is also the performed deletion test for offInBoth membership; the first attempted partial GREEN lacking features=false correctly fails fixed-design validation. Explainer now documents standalone reuse and exclusion from comparison arms. No launcher added.


Current landing smoke at cd0c96c4c: real native game with fake HTTP model returned four requests, exact system prompt and toolset, no injected follow-up, two successful image-only results, three exposed-thinking records, one button press, six private state events and run_end/budget. Receipt: runs/baseline-preflight/rehearsal-landing/receipt.json. No GPU traffic. Explainer pages-check passes; HTTP200 and inspected screenshots at1280/1440/375 show readable cards and no page overflow (wide figure scrolls internally). Evidence: main runs/mockups/screenshot-button-baseline-landing. First copy used wrong cwd and returned404, preserved as receipt-failed-copy.json; corrected copy proves200.

Landing remaining:
- [x] Fresh full gates on synced branch.
- [ ] Frozen principles/boundary and required cloud lane review.
- [ ] Board slot and fast-forward local main.
- [ ] Post-main test and coordinated single viewer refresh/live explainer and OFF-arm proof.

Activation milestone/readiness: baseline applies from boot; it is a reusable ablation configuration, not a patch benefit claim. Initial N=1 establishes feasibility only. Any future run requires its own endpoint coordination. Current comparison arms explicitly exclude this flag. Landing does not activate it.


Fresh landing gates: first full pass at63766d47e passed agent4942/viewer2297/Python4869/gateway116, all per-metric floors, three approved-card widths, lint/build/vendor. Main advanced with the test-build prerequisite during that window; merged9d294b816 into branch with no conflicts, then reran all gates at bdb07f680. Final pass: agent4942, viewer2297, Python4875, gateway116; TS agent lines99.21/branches92.70/functions97.51, viewer98.33/90.76/94.95; Python/gateway floors PASS; cards3 PASS; lint/build/vendor PASS. Source logs: runs/baseline-preflight/landing/gates-synced. RELEASE sent to shared CPU owner immediately. Baseline binary diff remained byte-identical across both main syncs (08cd4bb5ba5ce4e0c67bf70b29e6466ce7938fb02d0da7a588dc91fcea939aff before this evidence-only worklog addition). No extra source changes or inference. Freeze/review now includes this evidence-only update.
