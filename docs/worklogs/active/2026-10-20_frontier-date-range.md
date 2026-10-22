# Story Frontier run date range

User request: compare bundle whole-map and control across separate experiments by an inclusive date range.

Viewer-only milestone: From / Through date inputs, either bound optional, clear action, Eastern run-start dates, combined with existing filters. Preserve global human/frontier references and current-run cards; exclude unknown dates only while a date bound is active. Reversed range shows a validation message and no overlays. No harness/recording/experiment changes.

- [x] RED mounted interaction tests: two new tests failed on absent controls; RED commit 72012958.
- [x] Implementation and focused checks: 27 mounted tests pass; viewer lint/build pass.
- [x] Gates and real-snapshot inventory
- [x] Browser clicks, polling and desktop/mobile screenshots
- [x] Local landing: operator authorized review exception; live proof below.

Initial binding: main clean; shared 8790 comparisons tab 1657055914 belongs to another browser-control session and could not be acquired. Preserve it; candidate verification will use an owned tab and GET-only snapshot server. Existing 8799 preview belongs to another task and is preserved.

## Verification and review receipt

Source commit94c970f7d03065581b01632a51d9bb651dc15d2c; base24648e12730d02f829675582f36be4077d48fd37; binary diff SHA256 f1b8d4f20244881e76f5b602d774e3bfc1eddbc1d9a7bc6d2ab41ed34172064e. Final viewer build clean94c970f7. Source and candidate status stayed unchanged throughout review. This follow-up commit records evidence only.

- Gates:3031 agent,1499 viewer,3166 Python tests; zero skips. Lines/branches/functions coverage: agent99.16/93.04/97.57, viewer97.81/91.07/94.15, Python97.11/92.69/100. TS/Python lint, builds and vendor verification pass. Experiment audit on real runs prints nothing.
- Snapshot445 unique records. Oct19–20 Eastern selects96. Clearing restores445exactly. Chart3997->663->3997 unique points; same global frontier a8f9. Independent Python zoneinfo date-set equality passes.
- Browser owned tab1657055929, GET-only snapshot server8801: inclusive bounds, reversed error, pointer/keyboard clearing, range retention over polls, width1280/1440/375 screenshots opened and no horizontal overflow. Current cards preserved. Queue/sprite routes intentionally unavailable on isolated preview; no shared-server or gameplay actions. Original8790 tab1657055914 was controlled by another session and preserved. Screenshots at canonical runs/mockups/frontier-date-range/shots; screenshot8791 URLs return200.
- User explicitly requested outlier compatibility. Oct19–20 active: ON663points/OFF695/ON663; exactly32 f28d points restored and re-hidden. Full baseline and repeated polls retain ON and zero f28d points. Raw receipt browser-outliers.json. Narrow Oct20 excludes f28d because its true Eastern start date isOct19 despite its UTC run ID.
- Required operand mutation evidence supplied from disposable git archive, leaving candidate untouched:10 separate mutations all redden intended tests; baseline and restored27tests pass. Astra independently confirmed fall-DST inclusive boundaries.
- Independent no-history read-only GPT/Sol(gpt-5.6-sol xhigh) and Astra(gpt-6-astra high) reviews both LGTM; each reproduced exact digest and clean pre/post identity. Reduced vendor diversity, never Claude approval. Tasks /root/date_range_gpt_review and /root/date_range_astra_review.
- Claude CLI unauthenticated; Cursor Opus/Sonnet/Haiku all usage-capped. Grok completed a source review with no in-scope code defects but terminal VERDICT: BLOCKING because its Ask-mode harness rejected every shell invocation needed to independently reproduce packet digest/status. This identity evidence gap is retained; not reported as approval or a code defect. No permission-setting workaround attempted.
- Proof, logs, mutation receipts and synthesis retained under this worktree runs/date-range-proof/. Shared main advanced independently to e9584cf0. No merge/restart/live claim. Landing requires operator exception for unavailable Claude and incomplete Grok identity verification, then integration checks and live proof.

## Operator-authorized landing

The operator replied "yes" to the explicit request to land using the two independent fallback approvals, after disclosure that Claude is unavailable and Grok could not independently verify source identity. This authorizes the review exception. Syncing current main35e152ca; only textual conflict was two independent CSS blocks appended at EOF, both retained. Date-range logic and tests are unchanged; upstream frontier coverage repair is preserved. Integration gates and live proof follow.

Integration at83b85b17:3046 agent/1508 viewer/3470 Python tests pass; coverage agent99.14/92.97/97.59, viewer97.82/91.07/94.19, Python97.21/92.86/100. Full lint/build/vendor pass, real-run experiment audit silent. Reviewed source delta is identical after excluding one blank CSS separator line; both upstream coverage CSS rules preserved. Main advanced to90fa7789 only by adding a fixed experiment definition and its worklog, so these are synced before fast-forward landing; no launch is performed.

## Landing and live proof

Fast-forward landed95498e57f223c5e45799a85b845eec2328602167. Final sync included the latest GLM worklog-only amendment. Post-landing tests on canonical main all pass:3046 agent,1508 viewer,3470 Python (8024total). No skips or gate changes.

Viewer refreshed2026-10-20 about22:01EDT. Initial just viewer-main reported success but its child did not retain a listener after the command ended. Verified no listener remained, then started the already-built95498e57 CLI with a detached process session and the canonical environment/runs root. Sole listenerPID84442, served stamp clean95498e57. Both pre-existing gameplayPIDs81421/81428 remained alive. No game restarts or experiment launches.

Live Chrome tab1657055936 at127.0.0.1:8790/comparisons: FromOct19 / ThroughOct20 selects96recordings across experiments; clear pointer/Enter restores445, reversed range shows error. Hide time outliers: after all445recordings loaded, ON710/OFF742/ON710 points; precisely32f28d points restored/re-hidden with exact ON identity match. Full baseline retains hiding; date bounds and toggle survive repeated5-second polls. All96selected run measurement records available. Final API problems empty; no stale-build errors, no browser console errors. Original user tab still controlled by another session, preserved; owned live result tab left open.

Opened final live1440desktop/375phone screenshots; controls fit, no horizontal overflow. Screenshots canonical runs/mockups/frontier-date-range/shots/live-desktop-1440.png and live-phone-375.png. Receipts under candidate runs/date-range-proof/live-browser-outliers.json and live-workbench.json. The earlier670point check occurred while unrelated reference recordings warmed; final710point check uses the complete catalog. This evidence-only closeout changes only docs/worklogs/.
