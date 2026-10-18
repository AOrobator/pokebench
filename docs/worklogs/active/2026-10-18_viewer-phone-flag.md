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
- [ ] Land via the protected queue.

Base SHA (branch point): 0e5ca723.
