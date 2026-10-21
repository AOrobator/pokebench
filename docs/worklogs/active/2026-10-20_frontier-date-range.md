# Story Frontier run date range

User request: compare bundle whole-map and control across separate experiments by an inclusive date range.

Viewer-only milestone: From / Through date inputs, either bound optional, clear action, Eastern run-start dates, combined with existing filters. Preserve global human/frontier references and current-run cards; exclude unknown dates only while a date bound is active. Reversed range shows a validation message and no overlays. No harness/recording/experiment changes.

- [x] RED mounted interaction tests: two new tests failed on absent controls; RED commit 72012958.
- [x] Implementation and focused checks: 27 mounted tests pass; viewer lint/build pass.
- [x] Gates and real-snapshot inventory
- [x] Browser clicks, polling and desktop/mobile screenshots
- [ ] Local landing: blocked pending operator review exception; cloud review status below.

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
