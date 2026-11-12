# Gateway thinking in CURRENT

Authorized JOB viewer-opus-bridge-thinking-20261111, relayed from the operator 20:42 ET.
Branch `codex/viewer-opus-bridge-thinking`, base `306a6e8d8`.

## Scope
Viewer-only fallback for empty recorded thinking, bound to successful session-gateway calls for the exact run. Preserve native thinking and original recordings. Match timestamps and reply; reject ambiguous/missing records. Inject transcript reads for pure tests. No shared viewer restart without the operator. Screenshot task is independent.

## Milestone
- [x] RED pure injected-reader tests committed.
- [x] GREEN implementation and focused checks.
- [x] CPU window, full gates, headless browser proof at desktop/phone widths, trainer-card check.
- [x] Principles, frozen Claude and GPT reviews (Grok standing waiver per job).
- [x] Landing board, main test; report landed separately from activation.

## Evidence
Read-only example: run 1121 assistant seq 5628, turn 97, call_945; bridge launch-receipts/opus55-control-4h-20261107/bridge/calls.jsonl request 945 completes 1ms before event. Transcript call-945-1.jsonl contains a 503-character thinking block. Session also serves other runs, so run binding is mandatory.

RED: focused no-I/O suite: 1 expected failure, 9 pass; fallback remains empty under stub. COMMIT: `test(viewer): specify gateway thinking fallback` (this commit).

GREEN: 19 no-I/O tests pass (`gateway-thinking.test.ts`, `current-api-unit.test.ts`); viewer tsc and changed-file ESLint pass. Initial package links caused duplicate private types; replaced with normal offline install. Tests initially needed agent build output; copied unchanged main agent dist for cheap checks, full build pending CPU grant.
Implementation: asynchronous read-only disk adapter discovers bounded bridge manifests under runs/*/bridge, launch-receipts/*/bridge, probes/*/bridge; caches file signatures and parsed index for 5 seconds. Successful session calls must bind exact run and archive session, with event request ID + timestamp + exact reply. CURRENT has no call ID, so it binds the latest successful gateway completion at/before the snapshot timestamp and requires exact reply. Ambiguity and absent/private thinking keep native display. Raw archives and projector checkpoints never change.
COMMIT: `fix(viewer): recover gateway thinking in CURRENT responses` (this commit). Full gates, browser proof, reviews and landing pending.

Scope amendment from verify-release job relayed 20:51 ET: include released agent-trace in view-release, thinking panel and Activity History, exact turn97 screenshot; reuse broadcast request/reply mapping rather than timestamp guessing. Existing broadcast joins request==turn, unsafe for continuation offsets (97 vs945); revised implementation uses recorded call_N request and exact reply, and resolves CURRENT's thought through the original bounded recent event reader. Timestamp-only association removed.
Release RED: in-memory unpack test fails with missing bridge/calls/call-945-1.jsonl, proving agent-trace is currently ignored. COMMIT: `test(release): require gateway thinking archives in playback` (this commit). CPU grant released unused because scope changed; will re-request after cheap checks.

Revised GREEN: original event call_N + reply binding, last successful gateway attempt, session validation and terminal result parsing (same request/reply principle as broadcast). CURRENT resolves its original assistant from bounded recent source events; no temporal guessing. Shared async reader also hydrates legacy head/stream/trace-history responses. view-release now stages optional SHA256SUMS-verified agent-trace calls and a run-bound manifest, with rollback on corrupt JSON, links, duplicates or digest mismatch. Releases without traces remain supported; previously unpacked traced releases require fresh extraction.
Cheap checks: viewer focused 19 pass; release 31 pass; viewer tsc, changed-file ESLint and Ruff, release mypy and diff check pass. COMMIT: `fix(viewer): bind thinking to recorded calls and release archives` (this commit).

R1 frozen source 7dc9521c3 / binary diff71cf3f06…e2c8: Claude LGTM; independent GPT BLOCKING (valid gateway prose-wrapped JSON/non-string notes rejected; latest-attempt test used identical transcripts). Both accepted as Fix; no other source domains added. Parser RED adds production gateway edge cases, observing 3 failures. Strengthened attempt fixtures use distinct thoughts/replies. COMMIT: `test(viewer): cover gateway reply parser compatibility` (this commit).
Full gates at R1 pass: 3042 agent /1301 viewer /3451 env /39 gateway, no-I/O proof; lint/build/vendor pass. Trainer headless initially lacked ignored art; rerun with read-only main art passes all3 widths without baseline changes. Initial CURRENT proof shows actual turn97 text (465 characters; earlier 503 estimate corrected), final browser proof pending correction build.

Correction GREEN: gateway whole/fenced/embedded JSON candidate order now mirrors gateway parse_reply; non-string notes compare parsed JSON values so Python's ASCII escapes/spacing remain equivalent. Distinct retry transcripts prove the highest successful attempt wins. 23 focused no-I/O tests pass, viewer tsc and changed-file lint pass. Eight distinct break/restore receipts (run/request/session/reply/attempt/native-thinking/snapshot delivery/API wiring) each fail when broken, and restored suite passes23. R1 review had finished before these working-tree mutation checks; original frozen diff remains intact. Receipts: runs/reviews/gateway-thinking/mutations/receipt.json.
COMMIT: `fix(viewer): accept native gateway reply formats` (this commit). Preparing R2 cumulative review; original scope/domains unchanged.
Claude R1 observations triage: archive format expansion and stale-copy selection are follow-ups (ambiguous/unsupported archives fail closed); >8MiB manifests and refresh parse cost are bounded display limits; disconnected stream write and late-archive invalidation are follow-ups, with no demonstrated correctness bug in current archives. No scope expansion to satisfy advisory findings.

## Integration compatibility
Main advanced from 306a6e8d8c0a2c484a8ae2203e950ca56aea37bb to e2b02706444ad5a78b2e3022402a035752661534 during R2. Upstream changes are mailbox addressing/archive logic, its tests and workflow prose, plus a new mail-archive recipe. They do not alter viewer/release contracts, schemas, dependencies, build/test recipes or consumers. Reviewed production delta remains byte-identical against new main (excluding evidence-only docs/worklogs), SHA256 7a737f6841ba6f6418c038e0cf5e9dc53906aac6ea059c91cc27f4a531b124c0. Retain frozen reviews, full gates, trainer and browser evidence on their original pins. Required combined post-main `just test` will cover new upstream tests.
R2 frozen616c0cf27 / digest401aa0f3…9148: Claude and independent GPT both terminal LGTM; same complete cumulative packet, clean pre/post identity reproduced. Grok standing waiver from assigned job. GPT pathological malformed-JSON scan-cost concern is follow-up; no new production domain. Session comparisons also separately broken/restored in memory with mixed-session records (both prove refusal, wrong attachment when broken, refusal after restoration); no candidate changes.
COMMIT: integration of main mailbox changes and evidence (this merge commit).

## Final candidate proof
R2 full lint/build/test/vendor pass:3042 agent,1305 viewer,3451 env,39 gateway; no-I/O guards and floors pass. Trainer-card protection and baseline screenshots3/3 pass unchanged.
Read-only real-data check on main runs/:1121 seq5628/turn97 goes from0 to465 thinking characters using request945, beginning “MAXIE is down, so the next stop is Jagged Pass…”. No run filtering, grading or source log writes.
Headless candidate6/6:Chromium and WebKit at1280×900,1440×900,375×812. CURRENT and expanded trace/raw inspector show the native text and original240×160 recorded frame. Pointer/keyboard trace toggles and party→trace return preserve disclosure state. All12 final screenshots plus missing-thinking screenshot opened and visually inspected. Missing thinking is simulated in the browser only, then unroute/reload restores native text. Final receipt has no page errors. Served main.js equals built bytes,SHA256a2fe34d2b64e3010e594f46d60bb48114fe9a8219bf532bfbb8305127265fbaa.
Steady-screen RAF proof at desktop/phone in both engines:7 forced changed updates each,192–255 sampled frames,0px maximum movement, focus held. Final receipt runs/gateway-thinking-proof/receipt-final.json; RAF receipt steady-raf.json. Initial failed proof attempts are retained:missing art; absent scratch projector; active truncated recording's unavailable live service; invalid injected summary/snapshot revision pair; hidden desktop select; follow-latest inadvertently enabled; one WebKit interrupted intercepted request, resolved with wait-for-handler cleanup. These were fixture issues corrected without production changes.
Proof fixture copies the exact original prefix through seq5628, one original frame and native bridge call945; a clearly documented synthetic terminal seq5629 makes that prefix offline replay only. It is not a claim about the actual run's terminal state. Original recordings and shared services untouched. Scratch server stopped. Local copies under runs/mockups/viewer-gateway-thinking/; checked screenshot links return200.
COMMIT: `docs(worklog): record gateway thinking verification` (this commit). Implementation/review/proof complete; board landing and combined main test pending. Activation held: no viewer-main without the operator's words.

## Landing and activation hold
Landed fast-forward main e2b027064→642b66588 as board#1 with this chat's exact ID 00000000-0000-4000-8000-52a30bedb61e. Post-main `nice -n10 just test` completed EXIT0:3042 agent,1305 viewer,3466 env (including upstream mailbox tests),39 gateway; coverage floors and no-I/O proof pass. Receipt:owned worktree runs/reviews/gateway-thinking/post-main-test.log.
CPU scheduler granted priority START at21:34 ET, then sent HOLD after our test began because another branch had already started its gates. Attempted to identify and stop only the owned main gate. It finished naturally before targeted termination; no process was killed. Two premature mailbox stop claims were corrected explicitly with the exit0 receipt. CPU released; no additional suite started.
All final screenshots inspected and linked under http://127.0.0.1:8791/viewer-gateway-thinking/. Source landing is complete. Activation remains held:shared8790 listener PID78013 still serves its previous cached build; no viewer-main was run. No gameplay process was started, stopped or changed.
COMMIT: `docs(worklog): record gateway thinking landing and main checks` (this evidence-only commit).
