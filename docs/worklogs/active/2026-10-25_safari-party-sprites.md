# iPhone Safari party sprite clarity

User authorization (this chat): "Okay, so now that you reproduced it, can you come up with a fix and verify that your changes work?" Phone: iPhone 15 Pro Max, iOS 27.0.1. Scope: correct intermittent sprite smoothing while preserving the approved card layout, sprite artwork, two-frame cadence, identity, six slots and reduced-motion behavior. No baseline updates or unrelated design changes. Candidate in isolated worktree; no live viewer restart, gameplay input or launch.

## Contract and production boundary

Smallest intended paths: trainer-card.ts sprite markup and style.css sprite drawing/animation. No runtime dependency, new owner, harness behavior or feature switch. First prove the image-element alternative in native simulated Safari; retain baseline rendering evidence. Safari simulator runtime iOS27.0 build24A434 is available; exact27.0.1 is not. Headless CLI captures preserve desktop focus. Existing Safari driver cannot discover the simulated device; native rendering proof uses an isolated fixture that opens its sheet through DOM input. Real browser pointer/keyboard checks use headless Chromium; disclose any native touch gap.

## Verification

- [ ] Baseline reproduction and renderer comparison in iPhone Safari.
- [ ] RED -> GREEN tests and narrow implementation.
- [ ] Unit/coverage/lint/build plus exact protected card baselines.
- [ ] Built candidate screenshots desktop1280/1440, phone375 and native430; both frames, reopening/scrolling and reduced motion.
- [ ] Principles self-review and independent review.

## Evidence

Existing reproduction: canonical runs/mockups/sprite-blur-investigation/ios27, party-crop.png shows same Zigzagoon asset crisp and blurred on one card. Source assets are32x64, alpha0/255 only. Pausing animation, integer dimensions and crisp-edges did not consistently resolve the symptom. Previous image-element attempt had an invalid blank-page capture and proves nothing. New frozen fixture must resolve this before production edits.

Native fixture proof: original CSS-background renderer reproduces smoothing on all six party icons (interior color counts4040/1846/2418/1828/1846/2285). Image-element experiment using the same sheets, same dimensions and top-based two-frame steps preserves12/11/9/11/11/9 colors across three native captures. Both crops inspected through image tools; canonical runs/mockups/safari-sprite-fix/{baseline,image}-party.png. First fixture attempt missed the server's special agent story/catalog module routes; corrected before counting any proof. RED unit checks exercise actual wide/mini cardHtml, decorative image sources, egg resolution and retained titles; original renderer fails both because sprites are backgrounds without image elements. Existing protected assertions/baselines unmodified.
