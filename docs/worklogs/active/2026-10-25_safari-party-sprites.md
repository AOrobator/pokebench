# iPhone Safari party sprite clarity

User authorization (this chat): "Okay, so now that you reproduced it, can you come up with a fix and verify that your changes work?" Phone: iPhone 15 Pro Max, iOS 27.0.1. Scope: correct intermittent sprite smoothing while preserving the approved card layout, sprite artwork, two-frame cadence, identity, six slots and reduced-motion behavior. No baseline updates or unrelated design changes. Candidate in isolated worktree; no live viewer restart, gameplay input or launch.

## Contract and production boundary

Smallest intended paths: trainer-card.ts sprite markup and style.css sprite drawing/animation. No runtime dependency, new owner, harness behavior or feature switch. First prove the image-element alternative in native simulated Safari; retain baseline rendering evidence. Safari simulator runtime iOS27.0 build24A434 is available; exact27.0.1 is not. Headless CLI captures preserve desktop focus. Existing Safari driver cannot discover the simulated device; native rendering proof uses an isolated fixture that opens its sheet through DOM input. Real browser pointer/keyboard checks use headless Chromium; disclose any native touch gap.

## Verification

- [x] Baseline reproduction and renderer comparison in iPhone Safari.
- [x] RED -> GREEN tests and narrow implementation.
- [x] Unit/coverage/lint/build plus exact protected card baselines.
- [x] Built candidate screenshots desktop1280/1440, phone375 and native430; both frames, reopening/scrolling and reduced motion.
- [x] Principles self-review and independent review.

## Evidence

Existing reproduction: canonical runs/mockups/sprite-blur-investigation/ios27, party-crop.png shows same Zigzagoon asset crisp and blurred on one card. Source assets are32x64, alpha0/255 only. Pausing animation, integer dimensions and crisp-edges did not consistently resolve the symptom. Previous image-element attempt had an invalid blank-page capture and proves nothing. New frozen fixture must resolve this before production edits.

Native fixture proof: original CSS-background renderer reproduces smoothing on all six party icons (interior color counts4040/1846/2418/1828/1846/2285). Image-element experiment using the same sheets, same dimensions and top-based two-frame steps preserves12/11/9/11/11/9 colors across three native captures. Both crops inspected through image tools; canonical runs/mockups/safari-sprite-fix/{baseline,image}-party.png. First fixture attempt missed the server's special agent story/catalog module routes; corrected before counting any proof. RED unit checks exercise actual wide/mini cardHtml, decorative image sources, egg resolution and retained titles; original renderer fails both because sprites are backgrounds without image elements. Existing protected assertions/baselines unmodified.

## Implementation and proof

RED commit991a7e612. Production change: retain background animation outside the iOS `-webkit-touch-callout` feature query; use clipped img/top animation inside it. Same32x64 sheets, same0.5s/two frames, same dimensions/titles/egg mapping. Global img replacement was crisp but changed150pixels in protected Chromium375 baseline; narrowed renderer to iOS instead of updating any baseline. All three unchanged protected screenshots then match exactly.

GREEN:55focused tests pass, full justtest4407agent/1953viewer/4159Python plus3exact protected screenshots PASS. First full justtest omitted POKEBENCH_CARD_ART and failed its final screenshot stage due missing art in this worktree; corrected only that environment path and repeated the full gate successfully. Lint initially found an Element.style type error in the new test; removed the implementation-specific style assertion, kept image source/title/alt assertions; final justlint and justverify-vendor PASS. No ignored/xfail/timeout/worker/coverage configuration changes.

Coverage attempts: first completed agent but one existing viewer trace-reader test timed out at5000ms while a full test gate was also running; next attempt timed out existing agent supervisor/live tests at5000ms while other shared-host work was active. Those failures remain retained, never counted as passes. No agent source changed. Final complete justcoverage passed with normal worker/timeout settings, without another owned full test/lint gate in parallel. Agent99.17/92.74/97.61, viewer98.20/91.81/95.37 and Python97.40/93.43/100 L/B/F; all >=90. Previous failed attempts retained, no test or runtime changes to obtain this pass.

Built real viewer on18804 against an immutable copy of ended Roxanne recording `roxanne-autonomous-16gpuh-20261023_gpu1_explore-2` (events/restoration-prefix/frames only), scratch root /tmp/pb-safari-preview-y1vwSB. Pointer and keyboard activation, exact recorded-frame identity, two polling intervals, default/open mobile sheet and reduced-motion CSS passed in headlessChromium1280/1440/375 with zero page errors. Expected unavailable model-discovery API503 in the isolated preview is not a page error. Four screenshots were captured and opened through image tools. No control requests sent to gameplay.

Native simulatedSafari27.0 at430CSSpx/DPR3: actual feature query reports true; image uses tc-image-bob, visible frame tops0 and-64.40625px. Three captures each for frame0,frame1,120pxscroll and reopen:168visible sprite samples (including Mudkip, Marshtomp, Electrike, Combusken, Poochyena and Zigzagoon), all <=16interior colors; blurred baseline produced1828-4040. Four full native screenshots opened and inspected; both frames have sharp pixels and card layout intact. Native sheet open/reopen/scroll is driven by fixture DOM, not genuine touch; Safari WebDriver discovery still unavailable. Genuine pointer/keyboard proof is Chromium only. No physical27.0.1 verification claimed. Evidence in canonical runs/mockups/safari-sprite-fix, including native-quality-final.json and browser-receipt.json.

## Principles Adherence

Current CLAUDE.md selects repoPB1-PB13, superseding the historical draft header. No principles file changed.

| ID | Score | Evidence |
|---|---|---|
| PB1 | N/A | Sprite rendering only; no scoring or native predicates. |
| PB2 | PASS | No run filtering, suppression or original recording changes. |
| PB3 | N/A | No benchmark improvement or gameplay experiment claim. |
| PB4 | PASS | No harness/readout/action changes; vendor gate passes. |
| PB5 | PASS | Only party sprite rasterization changed; original failing and candidate cases retained. |
| PB6 | N/A | No context, compaction or long-run behavior. |
| PB7 | PASS | Original recordings read-only; scratch copied replay reaches matching recorded frame. |
| PB8 | N/A | No model validation/retry policy. |
| PB9 | PASS | User specifically requested blur correction and verification; preserve design rather than approve baseline changes. |
| PB10 | PASS | All original assertions/baselines/gate configurations retained; failed attempts disclosed, final coverage passes. |
| PB11 | PASS | Same pinned assets and browser packages; native27.0 runtime identity and feature-query behavior measured. |
| PB12 | PASS | No ROM copy or protected path; native binding reused read-only in isolated venv. |
| PB13 | PASS | RED/GREEN, worklog, unit/browser/native proof captured; review and final coverage required before completion. |

## Frozen scope and review terminator

Only trainer-card.ts and style.css production paths; one unit test file and this worklog. Native diagnostic fixture is four cards, at most6sprites each; bounded captures inspect known screenshot regions. No new production module, dependency, runtime owner, feature switch, identity allocation, new UI control, card layout, baseline/fixture/protected assertion change, gameplay action or main landing. User authorization is correction and verification, not a requested merge. Terminator: final gates and reviewed isolated candidate, with native touch/version limitations disclosed. Any additional infrastructure or new visual design is a separate scope.

Final gates: justtest4407agent/1953viewer/4159Python and3exactcardbaselines; justcoverage same counts/allfloors; justlint; justbuild; justverify-vendor PASS. Removing only the new sprite img makes both wide/mini regression cases fail on missing source/alt, then exact restoration passes2/2 (/tmp/pb-sprites-{mutation,restored}.log). Candidate fixture and real preview served CSS/renderer byte-identical to the built worktree (served-hashes.json). No protected fixture/assertion/baseline changed. Final browser/native captures inspected. Independent review complete; see closure below.


## Closure

Reviewed source commit fc13848679d85ef08333941520464552959272ad, baseline63e47426b03a427361467040ebf0741740cade79. Frozen binarydiffSHA256 78eea7917a032b1aa2d0979c12bceed3d7bcf86aec34d71226af381bf916b866. Claude CLI actualclaude-opus-5-5, fresh GPT5.6Sol/xhigh, fresh fallback6.1Sol/high and6Astra/high each returned literal VERDICT: LGTM on the same independently checked clean packet. Grok Cursor exit1 out-of-usage; only approved installed Grok harness unavailable, documented two-distinct-model fallback used. Reduced vendor diversity, never Grok LGTM. Final synthesis and receipts in canonical runs/reviews/safari-party-sprites. No source changes after review.

Post-freeze build stampfc13848, repeated native phase0/phase1/120pxscroll/reopen captures126additional visible samples all crisp; verified-quality.json binds source commit. Repeated final real-viewer headless Chromium pointer/keyboard/replay-frame/poll/reduced-motion checks pass at1280/1440/375. One final phone screenshot was taken before its finite opening animation finished; retained as viewer-375-open-early.png, then genuine pointer recheck awaited card visibility and animation completion. Corrected viewer-375-open.png opened and inspected, phone-open-receipt.json records visible sheet bounding box. No production code change or baseline update.

All requested correction/verification complete in isolated branch fix/safari-party-sprites. Implementation fc1384867; final commit contains this review/proof receipt only. Existing168-sample native proof plus final126 samples, both frames and layout proof retained under canonical runs/mockups/safari-sprite-fix. Simulator is27.0, exact physical27.0.1 and native genuine touch unverified. Candidate is not on main or live8790. No shared viewer restart, original recording write, gameplay input, run launch/stop or focus-taking operation performed. Owned preview/fixture services and simulator shut down after proof; worktree and saved simulator remain reusable.

## Landing amendment — October25

The operator explicitly authorizes landing/activation in this chat: "Okay, go ahead and merge it so that I can test it out and then make sure that it's live." This follows disclosure that the selected reviews used the documented fallback for Grok's quota outage; it authorizes this merge and live viewer refresh under that disclosed limitation, rather than relying on automatic self-merge authority. It supersedes the earlier no-main-landing non-goal only. No new gameplay launch/input, run restart or source change is authorized/needed.

Canonical main advanced to3f926f1295e179b3f6ee178da90431286f7f4b15 while this branch was being verified. Merged main into the isolated branch as9a4997f7f0aa1c7674bf21cced7ce50307e94fcd, cleanly; none of trainer-card.ts/style.css/new sprite test changed in incoming main. Refresh gates and review on the combined tree before joining the board; the sprite behavior remains byte-identical to fc1384867. Requested a coordinator landing hold/restart ownership check through justtell-claude; no Claude listener, message saved. Board was empty. Current viewer PID74033 serves clean /private/tmp/pokebench-viewer-capture-f6da68c; default /private/tmp/pokebench-viewer is an unrelated dirty checkout and will be preserved. Use the supported POKEBENCH_VIEWER_WORKTREE override for one coordinated post-landing restart.

Landing gate/review/live proof pending below; prior candidate proof is not live proof.
