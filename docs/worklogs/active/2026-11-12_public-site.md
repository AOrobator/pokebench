# Public PokéBench site

Status: **APPROVED by the operator 2026-11-12 ("the worklog is approved"). M1 in progress.**

## Problem Statement

PokéBench is public on GitHub, but the README is the only place to read results. The operator wants a site that is the official home for PokéBench results and updates: one leaderboard, a page per model, a page per released run, update posts for new models or harnesses, the 349 feature explainers browsable inside the site, and the method. Later it can host or link the article. The design is the PokéNav mockup in `runs/mockups/site-pokenav/`, which the operator reviewed over 15 rounds on 2026-11-11 and 11-12: frameless dotted background, coloured option buttons with pixelarticons, game-style text windows, stars plus a Hall of Fame crown, one leaderboard with "(assisted)" and "(local)" inline, light and dark modes with dark charts and a dark turn diagram.

The mockup is hand-written HTML with hard-coded numbers. The real site has to be generated from data, so adding a model or a run means editing data, not HTML. It also has to stay clear of the protected-data rules: it is built from the scrubbed public repo, and every image on it is one a person has looked at.

## Skills Loaded

- `feature-worklog`, `execute-worklog` (gates, landing)
- `close-the-loop` (desktop and phone screenshots of every page, light and dark)
- `protected-data` (public repo, image approval, only the operator pushes)
- `steady-screen` does not apply: the site is static and never redraws itself
- `dataviz` for the chart pages

## Architecture

**Where it lives.** A new workspace package `packages/site` in the private repo, TypeScript, no framework. It reaches the public repo through the existing scrub-sync (export → pass2 → rename → pass3 → merge), like everything else.

**How it builds.** `just site` runs `packages/site` and writes `site/dist/` (gitignored). The generator is a pure function from typed inputs to a map of output path → bytes. A thin entrypoint (`packages/site/src/cli.ts`, excluded as an entrypoint) reads the inputs and writes the map. All logic is tested in memory, so the no-I/O rule holds.

**Inputs (all already tracked, all scrubbed on export):**
- `docs/images/charts/chart-data.json`, `chart-points.json`, `prices.json`: each model's best run, splits and cost. These already drive the README charts.
- A new `site/data/runs.json`: the released runs (today only 67d7), with the release tag, assets, checksums and verify command. Validated into typed values; unknown fields fail.
- A new `site/updates/*.md`: one Markdown file per update post, with front matter (date, title, models). It also feeds a static `feed.xml` (RSS 2.0, generated once per build; nothing runs on a server).
- `docs/explainers/md/*.md` plus their figures: rendered inside the site frame.
- `docs/images/*`: the charts (light and dark), the header and the turn diagram (light and dark).
- Vendored assets: pixelarticons SVGs (MIT, licence file kept), the Press Start 2P font (OFL, self-hosted), the crown and star pixel art.

**Pages.** Home, Results, Models (index and one per model), Runs (one per released run), Updates (index, one per post, feed.xml), Explainers (index with search, one per explainer), Method, Credits. Shared layout: the header, the side buttons (the same on phone), and the light/dark theme from `prefers-color-scheme`. The mockup's `?theme`, `?frame` and `?win` switches are mockup-only and are dropped.

**Hosting.** GitHub Pages on the public repo, built by a GitHub Actions workflow (`.github/workflows/site.yml`) that runs `just site` on push to `main` and deploys `site/dist`. In the private repo the workflow file is inert (it has no remote). The operator's normal push after a scrub-sync is the only thing that publishes; agents never push. URL: `aorobator.github.io/pokebench` unless the operator wants a custom domain (ASK USER).

**Zero network on pages.** Every page loads only its own files: no CDN, no analytics, no third-party fonts. `just pages-check` already asserts this for local pages; the site test does the same for every generated page.

## Invariants

- **INV-1. Data, not HTML.** Every number on a page comes from the inputs. Rationale: adding a model must not mean editing pages. Test: build from a fixture, change one value, assert that every page showing it changes and no other page does.
- **INV-2. Assisted is never pooled or hidden.** A run counts as assisted when it is a Rayquaza-lane run, a weight-edited model, a `custom-` experiment, or a knowledge switch. Its row says "(assisted)" with what helped. Best overall and best unhelped are both shown when an assisted run leads (operator decision 2026-11-05). Test: a fixture with an assisted leader renders both headlines and the inline label.
- **INV-3. Zero network requests.** Generated HTML and CSS reference only files under `site/dist`. Test: scan every output for `http(s)://` in `src`, `href` on `link`/`script`, CSS `url()` and `@import`, allowing only plain outbound `<a>` links.
- **INV-4. Every image is approved.** Every image in `site/dist` has a SHA in the protected-data `approved-images.txt`, or is generated from already-approved sources (charts from the same data). Test: the build lists its images. The guard enforces this on push, as it does now.
- **INV-5. Light and dark both work.** Every page renders in both themes with readable contrast. Text needs 4.5:1, icons and the medal outlines 3:1. Test: a computed-style contrast check in the browser proof. Charts and the turn diagram swap to their dark versions.
- **INV-6. No horizontal scroll** at 375, 768, 834, 984 (Fold7), 1024 and 1280 widths. Test: browser proof.
- **INV-7. Explainers keep their content.** An explainer page in the site shows the same text and figures as `docs/explainers/md/<slug>.md`. Test: render a fixture explainer and compare the text.

## Security Review

- The site is built in CI from the public repo, so it only ever sees scrubbed content. The private-side `just site` preview is local only (`runs/mockups/` via `just pages`), never published.
- No secrets in CI: the Pages deploy uses GitHub's built-in `GITHUB_TOKEN` with `pages: write` and `id-token: write` only. Actions are pinned by commit SHA.
- `site/data/runs.json` and the update posts are new public text. They go through the same pass3 scrub and guard, and get a human read before the operator pushes.
- Explainer Markdown is rendered with raw HTML escaped, except the figure tags the explainers already use. No inline scripts from content.
- The workflow adds a GitHub Actions surface on the public repo. That needs the operator's OK at the activation stage (ASK USER).

## Milestones

Source readiness: M1–M4. Landing and activation are separate stages at the end.

**M1 — Generator core, layout and Home**
Outcome: `just site` builds Home and the shared layout (header, side buttons, both themes, footer) from the chart data, matching the approved mockup. Path set: `packages/site/` (new), root `package.json` workspace entry, `justfile` recipes `site` and `site-serve`, `.gitignore` for `site/dist`. Consumers: the browser and the `just pages` preview. Non-goals: other pages, CI, RSS. Terminator: RED/GREEN, ≥95% lines/branches/functions in `packages/site`, Home proof at six widths in light and dark. Split if the layout needs a template engine dependency.
- [x] Write tests: typed input validation (rejects unknown fields and bad numbers), leaderboard ordering and best-unhelped rule (INV-2), Home stat windows from data (INV-1), zero-network scan (INV-3), theme assets present for both themes. Also: every local reference resolves to a built file; site.json series join the chart series both ways.
- [x] COMMIT: `test(site): cover generator core and Home` (54a027d2f). RED: 6 test files fail to import their modules.
- [x] Implement: `input.ts` (typed, strict site.json), `milestones.ts`, `standings.ts` (order, best unhelped only when an assisted run leads, cheapest unassisted run with ≥ N badges), `format.ts`, `html.ts` (escaping template), `layout.ts` (header, side buttons for built sections only, relative links), `pages/home.ts`, `check.ts` (zero-network and every-local-reference-resolves, run on every build), `site.ts`, `cli.ts` (disk entrypoint, excluded from coverage). `packages/site/assets/site.css` ports the approved mockup; dark mode is `prefers-color-scheme` with dark window interiors, no script. pixelarticons subset + MIT licence in `assets/icons`; fonts copied from `packages/viewer/static/fonts` with their NOTICE. `just site` builds `site/dist` (gitignored).
- [x] Cheap checks: site vitest 71/71, coverage 99.15 stmts / 98.03 branches / 100 functions / 100 lines; tsc and eslint clean.
- [x] Gates (relay START 02:06 ET, RELEASE after): `just lint` exit 0; `just test` exit 0 (site 71, agent 3053, viewer 1313, env 3499, gateway 39; no-I/O guards OK; every floor met); `just verify-vendor` OK after initializing the worktree's submodule from the main checkout's clone (first run failed only because the worktree had no submodule checkout).
- [x] COMMIT: `feat(site): generate Home from chart data` (554b35427)
- [x] Browser proof: Home at 375/768/834/984/1024/1280 in light and dark, headless Chromium against the pages server (`runs/mockups/site-m1/`): 12/12 with no horizontal scroll, zero external requests, zero console errors or 4xx, fonts loaded, every checked text ≥ 4.5:1. Screenshots opened: light 1280 and dark 375.
- [ ] Independent review (Claude, GPT/Codex, Grok lanes per execute-worklog)

**M2 — Results, Models and Runs**
Outcome: the leaderboard with the badges-over-time chart above it, a page per model, and a run page per entry in `site/data/runs.json` with the release assets and the verify command. Path set: `packages/site/src/pages/{results,models,run}.ts`, `site/data/runs.json`. Non-goals: updates, explainers. Terminator as M1. Split if per-run pages need data not in the chart files (for example per-turn costs), which would mean a new export step.
- [ ] Write tests: one row per model's best run; "(assisted)" and "(local)" inline; human record row; stars plus the crown after eight badges with the right `aria-label`; per-model page links; runs.json validation; verify command text
- [ ] COMMIT: `test(site): cover results, models and runs` (RED)
- [ ] Implement
- [ ] Cheap checks; gates; counts
- [ ] COMMIT: `feat(site): results, model and run pages` (GREEN)
- [ ] Browser proof at six widths, both themes; contrast check on medals (INV-5)
- [ ] Independent review

**M3 — Updates and RSS**
Outcome: update posts from `site/updates/*.md`, an index, and `feed.xml`. Path set: `packages/site/src/pages/updates.ts`, `packages/site/src/feed.ts`, `site/updates/2026-11-11-opus-clears-emerald.md` (the first post, text from the mockup). Non-goals: comments or any server. Terminator as M1, plus `feed.xml` validating as RSS 2.0 in a test.
- [ ] Write tests: front-matter validation, newest-first order, escaping, feed item fields and absolute links from the configured base URL
- [ ] COMMIT: `test(site): cover updates and feed` (RED)
- [ ] Implement; cheap checks; gates
- [ ] COMMIT: `feat(site): update posts and RSS feed` (GREEN)
- [ ] Browser proof; independent review

**M4 — Explainers, Method and Credits**
Outcome: all explainers browsable inside the site frame, with an index and client-side search; the Method page with the light and dark turn diagram; Credits listing pixelarticons, Press Start 2P and the game-art policy. Path set: `packages/site/src/pages/{explainers,method,credits}.ts`, `docs/images/harness-loop.webp` and `harness-loop-dark.webp` (approved before commit). Non-goals: editing explainer content; links back to source (the operator: not needed). Terminator as M1, plus INV-7. Split if explainer rendering needs a Markdown dependency we don't already have.
- [ ] Write tests: explainer text parity on fixtures (INV-7), search index contents, figure paths rewritten into `site/dist`, Method diagram light/dark pair
- [ ] COMMIT: `test(site): cover explainers, method and credits` (RED)
- [ ] Implement; cheap checks; gates
- [ ] COMMIT: `feat(site): explainers, method and credits` (GREEN)
- [ ] Browser proof including three explainers at phone width; independent review
- [ ] Freeze source; list exactly what remains before landing

**Landing (private main)**
- [ ] `just land-join`; ff-only merge once number 1; post-main `just test` in a CPU window; evidence commit; `just land-done`

**Activation (public; each step needs the operator)**
- [ ] ASK USER: OK to add the Pages workflow to the public repo, and the URL (default `aorobator.github.io/pokebench`)
- [ ] Scrub-sync to the public copy; look at and approve every new image; lint and test there; guard scan; hand the operator the push command
- [ ] ASK USER: The operator pushes and turns on Pages (Settings → Pages → GitHub Actions)
- [ ] Live proof: every page returns 200 from the Pages URL; desktop and phone screenshots of Home, Results, a model, the run, an update, an explainer and Method, in light and dark; `feed.xml` loads; zero third-party requests in the network log
- [ ] Link the site from the README (another scrub-sync and push)

## Closing the Loop

Per milestone: tests and coverage for code; headless browser screenshots at six widths in both themes, opened and checked; a contrast and no-horizontal-scroll script; the zero-network scan. At activation: the same on the live Pages URL, plus the feed and the network log. No step takes desktop focus.

## Open questions for the operator (do not block approval of M1)

1. ~~Crown style~~ decided 2026-11-12: option E. Stars on a 10×10 pixel grid, the Hall of Fame crown on 16×14, gold with a deep amber outline (#7a4a00); missing badges are grey outline stars (#8a8f98 light, #7d8aa0 dark). Assets in `runs/mockups/site-pokenav/img/icons/{star10-*,crown16-amber}.svg`.
2. Dark-mode window interiors: dark (recommended and current default) or white. Needed by M1.
3. URL: GitHub's default or a custom domain. Needed at activation.
4. The article: link to it, or host a copy as a page. Not in scope until the operator decides.

## Session Log

- 2026-11-12 02:00 ET: M1 RED. New `packages/site` package (vitest, 95% floors, cli.ts excluded as the disk entrypoint), `site/data/site.json` (series → model, local, help, note). The no-I/O guard's repo-frame pattern now also matches `packages/site`, so the guard covers the new package (a widening of what it guards, no new allowance). Dark-mode windows default to dark interiors (recommended; The operator did not choose otherwise).
- 2026-11-12 01:55 ET: The operator picked medal option E (new crown, matching smaller stars).
- 2026-11-12 01:40 ET: plan written on `claude/public-site` from the approved mockup. No implementation.

## Surprises

- The turn diagram exists only as a PNG in the private notes (no HTML source). The dark version was rebuilt as HTML from the same content, reusing the game frame cropped from the original.

## Multi-Model Review Log

**M1 round 1** (frozen BASE b720e63a6, HEAD 554b35427, diff SHA-256 86b4da78…650cc; principles table zero FAIL).
- Claude CLI (~/.claude-review, plan mode): VERDICT: LGTM. Non-blocking: checker misses root-absolute and exotic markup; assisted/help not cross-checked; one test name claims a (local) check it lacks; cheapest tile uses whole-run cost (disclosed).
- Grok (Cursor cursor-grok-4.5-high) and Cursor GPT: unavailable, Cursor usage limit until 11/17 (stderr ActionRequiredError). Per the operator's standing rule (memory claude-review-lane, 2026-10-21/22): Claude + GPT via Codex CLI + one fresh fallback reviewer.
- GPT (Codex CLI gpt-5.6-sol, read-only): VERDICT: BLOCKING. check.ts accepted single-quoted/unquoted remote src, poster, object data, meta refresh, and resolved root-absolute `/site.css` against the page folder. Follow-ups: unused `raw()`; quadratic join.
- Fallback subagent (Sonnet, read-only, fresh): VERDICT: LGTM. Non-blocking: earned-order test does not separate from game order; a test name mislabelled; no duplicate-label or furthest-is-latest cross-checks; checker scope.
- Triage: **Fix** the checker (it is the INV-3 guard; concrete inputs pass wrongly). **Follow-up** (not in this branch): test-name/earned-order test strengthening, assisted⇔help and duplicate-label cross-checks, `raw()` removal, quadratic join, root-relative already fixed here. **Rebut**: cheapest tile wording is the approved plan's rule and is disclosed in the sub-label.
- Fix: check.ts parses any quoting, treats poster/data/action/formaction/background/xlink:href as URL attributes, flags a network URL inside any other attribute (meta refresh), scans `<style>` bodies, and rejects root-absolute paths. 5 new tests, all red before the fix (guard-bites proof). Site 76/76, 99.2/98.14/100/100; tsc, eslint clean; real `just site` still builds clean. COMMIT: `fix(site): make the network and link check fail closed` (this commit).

## Boy Scout Log

(empty)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog after activation
