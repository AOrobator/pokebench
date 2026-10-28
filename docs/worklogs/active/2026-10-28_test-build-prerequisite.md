# Build TypeScript before the test gate

## Problem Statement
Viewer tests import compiled agent registry/schema exports. Four post-merge gates today first failed because canonical dist was stale, then passed after a build. The coordinator delegated this tooling repair: use a build prerequisite if it adds under roughly30 seconds, otherwise a clear fail-fast check. Existing just build takes about22 seconds, so reuse it before test. Coverage already delegates to test and must inherit the prerequisite. No harness behavior or switch changes.

Authority: trusted coordinator delegation from 00000000-0000-4000-8000-f5efe0494f81; branch from newest main a93b34ec5378f0e43119d3eb9efa7ecd8d963633. The assigned outcome and tests are approved; this worklog translates that scope. Ask the coordinator for START before full gates. No inference, gameplay, recipe activation or GPU use.

## Skills Loaded
feature-worklog, execute-worklog, talk-to-claude, close-the-loop, multi-model-review at review. CLAUDE read. Feature-switch and feature-explainer do not apply: this changes tooling order only, not harness behavior or viewer presentation.

## Architecture
Invoke the existing build recipe as the first command of test. Keep coverage: test. Do not add a stale-state detector, manifest, cache, configuration or runtime owner. One recipe-level regression test invokes the actual just binary and copied real justfile with controlled leaf executables. A fake viewer-coverage command rejects missing/stale compiled content until the existing build recipe reconstructs it; this tests orchestration rather than reimplementing the prerequisite. Full just test from this fresh worktree without manual build proves real TypeScript exports are prepared before real coverage.

## Invariants
- INV-1: test and coverage rebuild missing or stale exports before coverage starts.
- INV-2: build failure stops the gate before coverage or subsequent checks; original failure is visible.
- INV-3: each alias runs TypeScript coverage once and all remaining existing checks; coverage remains the same gate, not another pass.
- INV-4: no harness source, switch, current recipe, coverage floor/exclusion or trainer-card baseline changes.
- INV-5: path handling uses argv lists; fake tools and artifacts live in isolated temporary directories, including a directory with spaces.

## Security Review
No network or model calls. The test uses actual just with fake pnpm/uv/leaf just commands, each confined to its temporary fixture, with a timeout and no detached processes. No credentials, ROM copies, vendor edits or foreground activity. Full gates need the CPU grant. Build adds about22 seconds; the existing final trainer-card build remains unchanged rather than expanding scope.

## Milestones
**M1 — RED**
- [x] Six actual-just cases cover missing/stale artifacts and fail-fast build errors for both aliases.
- [x] RED committed a11837d73 before the recipe change.
**M2 — GREEN**
- [x] Existing just build is the first test command; coverage: test is unchanged.
- [x] Final six GREEN; remove the build call to witness six RED, restore six GREEN; committed b2bc0eb4a.
**M3 — Verify and review**
- [x] Obtain START; sync main; run actual just test first from absent dist with no manual build, then lint/vendor serially. Verify build overhead and coverage order/counts.
- [ ] PB1–PB13 self-review, frozen boundary and patch, Claude + GPT + distinct fallback under the delegated Grok waiver; synthesis.
**M4 — Land**
- [ ] Board/ff-only reviewed tree, then coordinated post-main just test without separate build proves the fix.
- [ ] Coordinate any mandatory viewer refresh; preserve live runs. One evidence-only worklog commit and land-done.

## Closing the Loop
Both recipe-level failure witnesses and a real fresh-worktree full test demonstrate the prerequisite. The post-merge invocation must likewise need no operator/manual build. Keep timing evidence and original failures. No gameplay or UI improvement claim.

## Session Log
Accepted the assignment and created a fresh managed worktree so actual dist is absent for the real gate. Existing build recipe is reused and previously measured about22 seconds. No implementation change yet.

## Surprises
None.

## Multi-Model Review Log
Pending.

## Boy Scout Log
No adjacent cleanup.

## Archive Milestone
Archiving is not authorized.

M1 RED: six intended assertion failures in1.29s on the incumbent recipe. Both test/coverage reject missing and stale compiled content before any build; both build-error cases expose the wrong coverage failure instead of the controlled build failure. Targeted Ruff formatting/check pass. No recipe change yet.

M2 GREEN: add the existing build recipe as the single test prerequisite; coverage remains coverage: test. Six targeted cases pass. Performed dependency-removal mutation gives six intended assertion failures, then restored six GREEN. No test/runtime/harness source changes beyond the tooling regression test. Bootstrap dependencies/submodule and read-only canonical mGBA link prepared; dist has intentionally not been built yet so the real gate can prove the prerequisite.

The initial dependency-header prototype (`test: build`) passed six tests but the committed trainer-card guard rejected the commit: its recipe parser only recognizes `test:` and therefore interpreted the header as removing the existing trainer-card invocation. No receipt was invented and no hook was bypassed or weakened. Restored the incumbent and verified six RED cases with a transport that can delegate nested just build. Final fix keeps the literal test header and every existing command unchanged, adding just build first. Updated fake transport permits only that nested build and the existing trainer-card leaf, preserving full call logs; assertions normalize the optional runner wrapper, not build/coverage behavior. Final six GREEN; remove-inline-build mutation six RED; restored six GREEN. Existing trainer-card recipe and invocation remain byte-identical.

Coordinator queue acknowledged: story post-merge is running, then type-matchup gates, snapshots M5 (~16 minutes), then this task (~5 minutes, ahead of YAML only if YAML is not ready). No full gates or actual TypeScript build started. Ready to sync newest main and run just test first when START arrives. All authorized offline preparation is committed; the remaining blocker is the shared CPU window.

M3 first full gate at3cf815d84: before.json confirms agent compiled exports absent; just test automatically built them in21.44seconds, within the roughly30second target. One workspace build and one workspace coverage pass occurred before Python stopped the command at153.4seconds. Agent/viewer suites reached Python successfully; Python4872passed/3failed. All three failures are the existing tooling test contract: two pinned command lists omit the newly authorized just build, and the report-path check selects commands by obsolete positional indices. Updated the exact full command expectation to include just build (all coverage/card commands retained); locate the Python pytest/gate commands by their executable prefixes rather than positions. Focused wiring+recipe suites12PASS in4.42seconds, Ruff format/checkPASS. Original full failure log retained under runs/test-build-prerequisite/gates-3cf815d84-1793219530249688000. CPU RELEASE sent immediately; lint/vendor were not started after failure. Coordinator notified diagnosis; awaiting next CPU START for committed-source full re-gate. Review boundary additionally includes existing env/tests/tooling/test_gate_wiring.py because it pins the modified recipe. No GPU work.

M3 full gates PASS atbc6aef80fccebe1d03676c5086d650ac2b497913 aftersyncingmain de0fb1464 andpreservingitsviewer8GBheapcommand. Removedonlyownedgeneratedagent/viewerdist; before.json provesregistry/schemaabsent. Invokedjusttestdirectly, nomanualbuild:173.07seconds,firstbuild20.51seconds,1workspacecoveragepass,2workspacebuilds(newprerequisiteandunchangedfinaltrainer-cardbuild). Agent4936/viewer2292/Python4875/gateway116/card3PASS. TSagentcoverage96.58lines/92.70branches/97.50functions; viewer94.61/90.76/94.95; Python97.50/93.62/99.89;gateway99.12/96.22/100, all90%floorsPASS. Lint112.42secondsPASS;vendor0.10secondsPASS. Evidence runs/test-build-prerequisite/gates-bc6aef80f-1793223323243198000/{before,receipt}.json andtargetlogs. CPU RELEASE sentfornextscreenshotbaseline. No-holdstandingruleconfirmedbycoordinator: do notholdmainforreview; inspect/reviewanylaterdelta. No model/gamebehaviorchanges, no GPUwork. Preparingfrozen4-pathpacketandPB1-PB13adherence; ClaudeCLI thenfreshSolnormalGPT/Astradistinctfallback undertaskdelegatedGrokwaiver, reducedvendordiversityexplicit.
