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
- [ ] Re-review (round 2) on the fixed head via codex exec.
- [ ] Land via the protected queue.

Base SHA (branch point): 0e5ca723.
