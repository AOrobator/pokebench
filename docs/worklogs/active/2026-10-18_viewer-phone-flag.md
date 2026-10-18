# Viewer phone breakpoint, one flag

## Problem Statement

The viewer's phone-vs-desktop switch existed as the literal `700px` in seven places: `matchMedia` in `app.ts` and five `@media` blocks in `style.css`. Changing the breakpoint meant editing all of them in lockstep, and the Fold 7 unfolded (750 CSS px portrait, 832 landscape) cleared 700 everywhere and got the desktop chrome. The user wants the fold inner screen, portrait or landscape, on the phone layout, and wants the value kept in one place.

## Skills Loaded

pokebench-agent-workflow.

## Architecture

`src/phone.ts` is the single owner of the breakpoint. `syncPhoneFlag(doc)` evaluates two arms — narrow `(max-width: 700px)` and short-landscape `(max-width: 880px) and (max-height: 800px)` — and mirrors the result onto `<html>` as `[data-phone]`; `watchPhoneFlag` adds the resize listener. All three entry points (index `main.ts`, `workbench-main.ts`, `human-main.ts`) call `watchPhoneFlag(document)` before boot; `app.ts` `placeForWidth` uses `syncPhoneFlag`. The five phone `@media` blocks in `style.css` became `:root[data-phone]`-prefixed rules. CSS cannot read a custom property in a media query (`@custom-media` is unshipped), so JS owns the constant and CSS keys off the flag; the cost is one frame of desktop layout before JS runs, acceptable for a viewer that draws nothing without JS.

Arms are queried per-arm and OR-ed in TS, not comma-joined: happy-dom 20.14.5 `matchMedia` ANDs comma lists instead of OR-ing them (verified by probe). The short arm's bounds: 880 above the widest fold landscape (832), 800 above the tallest fold landscape viewport (750) and below every fold portrait height (832+), so fold portrait and laptop windows stay desktop. A window under 700 wide still flips phone, as before; the short arm adds that for windows ≤880 wide and ≤800 tall.

`server.ts` `BROWSER_MODULES` gains `phone` (the page loads ES modules without a bundler; a test enforces the allowlist).

## Invariants

- INV-1: `700px`/`880px`/`800px` appear in no viewer source file but `phone.ts`; `style.css` has no `@media …700/880px` left. A test walks `src/*.ts` to enforce it.
- INV-2: `[data-phone]` is on exactly when either arm matches, on load and on every resize, on all three pages.
- INV-3: Desktop at 1440×900 and fold portrait 750×832; phone at 375 wide and fold landscape 832×750.

## Observability

None added. The flag attribute is visible in devtools on `<html>`.

## Progress

- [x] `phone.ts` module + wiring in `app.ts` and the three entry points.
- [x] Five `@media (max-width:700px)` blocks → `:root[data-phone]` rules.
- [x] `BROWSER_MODULES` allowlist + tests updated (mobile-layout, run-head, trainer-card-app, trace-page-layout); flag-flip and fold-viewport tests added.
- [x] Gate: `pnpm lint` clean; viewer `pnpm coverage` 81 files / 1149 tests pass (95.3% stmts / 91.4% branch, ≥90 floor); `pnpm build` clean. pytest unaffected (no env change) — 2478 passed / 229 ROM-skipped on the parent commit.
- [x] Headless Chrome probes at real viewports: 390×844 phone, 750×832 desktop, 832×750 phone, 1440×813 desktop.
- [x] Review round 1, two GPT-family lanes on one sealed packet (base 0e5ca723 head 85b8d353, diff sha256 99c69cd5…d8ef8): cursor-agent gpt-5.3-codex-xhigh LGTM; codex exec gpt-5.6-sol BLOCKING (2 blockers).
  - Taken (blocker 1): the `:root[data-phone]` prefix raises specificity, reviving the `.inspection-nav { height:650px }` that `@media`-equal specificity kept dead — proven by computed-style A/B at 390×844 and 375×667 (623→650px, 620→650px, 7 cascaded diffs). Fix: delete the dead declaration (2026-10-16 trace worklog already recorded it dead); A/B now 0 diffs with the flag live.
  - Taken (blocker 2): the literal guard only scanned non-test `src/*.ts` plus one `@media max-width` CSS pattern; adversarial mutations `@media(max-height:800px)` in style.css and `@media(max-width:700px)` in human.css passed green. Fix: substring scan of all three widths across static css/html files + non-test sources; both mutations now fail with named messages.
  - Not taken (hardening): `watchPhoneFlag` listener idempotence — entry points run once per document; per the lane, no repeated-entry-point failure demonstrated.
- [x] Review round 2 on e5f506b9 (codex gpt-5.6-sol): round-1 blockers verified fixed by the lane (dead rule gone; adversarial cases caught). New BLOCKING finding taken: shared-gate fixture I/O — guard did 199 reads (3 widths × 67 files); rewritten to one read per fixture (67) with all assertions in memory. Not taken (hardening): double syncPhoneFlag per resize on index (frozen wiring), threshold-mutant boundary pins, per-page flag tests, string-based CSS assertions generally (browser A/B covers head).
- [x] Review round 3 on de12ffe9 (codex gpt-5.6-sol): LGTM. Round-2 blocker verified resolved (67 reads, in-memory asserts, mutation caught); digest reproduced independently; non-blocking notes dispositioned as above. Review loop closed: 2× BLOCKING taken, 1× LGTM.
- [x] Merge of main (ab5091ca) into the branch: one conflict (`BROWSER_MODULES` union — main added `metric-history`, branch added `phone`). Main's metric-history feature added a new `@media(max-width:700px)` block; the guard failed it by design and it became `:root[data-phone]` rules (merge-conversion commit; live-DOM proof under flag: label border-right 0, padding 8px, strong 13px). 16 JIT/next-run test failures in the fresh worktree were the stale pre-merge `dist/` (`@pokebench/agent` exports build output; `just-in-time-prompt-v1` missing) — `pnpm -r build` cleared them, not a code defect.
- [x] Gates on the merged tree: `pnpm lint` both stacks clean; agent 2456 tests (155 files); viewer 1172 tests (84 files); coverage agent 98/94.27/98.32/99.23, viewer 95.4/91.46/93.83/97.64 (floor 90); `pnpm -r build` clean; pytest 2478 passed / 229 ROM-skipped. One coverage run after the merge printed 4 failures that never reproduced in three following full runs — recorded as an unreproduced flake, likely the concurrent rebuild racing the first run.
- [x] Computed-style A/B on the merged CSS (main = base, merged head): 0 diffs with the flag at 390×844 (phone live, deck flex-column) and without it at 832×750 and 750×832 (desktop).
- [x] Land: `git merge --ff-only viewer-phone-flag` → main `ab5091ca..ac448f6a` (operator instruction "land your work on main", 2026-10-18). `just viewer-main` restarted 8790 at `ac448f6a`; 2 live gameplay processes untouched. Custody facts kept separate per review-loop discipline: the LGTM packet was `0e5ca723..de12ffe9`; the landed tree adds the main merge and the metric-history block conversion (implementation bytes differ from the reviewed head by exactly that mechanical conversion, re-gated with live-DOM proof). Gate completeness: GPT/Codex lane LGTM (round 3) + GPT-5.3-codex-xhigh LGTM (round 1); Claude and Grok lanes ran post-landing on the landed packet `ab5091ca..ac448f6a` — results appended below.

Base SHA (branch point): 0e5ca723.
