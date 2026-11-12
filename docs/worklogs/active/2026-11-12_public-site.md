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
- [x] Write tests: one row per model's best run; "(assisted)" and "(local)" inline; human record row; stars plus the crown after eight badges with the right `aria-label`; per-model page links; runs.json validation; verify command text. Also: site.json `models` (kind, effort, context; every series slug has exactly one model and every model a series; name and local agree), runs.json strict parsing (offset timestamps, 9-char commits, "n of m" links, unique short ids, safe tag/asset names, release shape), every plotted run has exactly one runs.json entry and vice versa, run pages only for released runs, splits table with faster/slower/even/not reached, newest-first runs list, INV-1 on run turns, escaping release text, sizes and short time spans.
- [x] COMMIT: `test(site): cover results, models and runs` (bbb135591). RED: 78 of 126 fail (new modules missing, menu and pages not built).
- [x] Implement: `catalog.ts` (runs.json ⇄ chart series join), `medals.ts` (option E stars + crown), `format.ts` (progressLong, span, size, count, milestoneLabel), `pages/{common,results,models,runs}.ts`; site.json `models` (kind, effort, context); `site/data/runs.json` (13 runs, release for 67d7 from the approved mockup text; no model ids, paths, hosts or token counts); star/crown SVGs copied from the mockup; cards, tables, medals, pills and their dark-mode rules ported into site.css under `prefers-color-scheme`. Menu now home/results/models/runs; Home links to Results.
- [x] Cheap checks: site vitest 138/138, coverage 99.62 stmts / 98.49 branches / 100 functions / 100 lines; tsc and eslint clean; `just site` writes 35 files. Gates on 77d7d34dd (relay START 03:05 ET, RELEASE sent): `just lint` exit 0; `just test` exit 0 (site 138, agent 3053, viewer 1313, env 3499, gateway 39; no-I/O guards OK); `just verify-vendor` OK.
- [x] COMMIT: `feat(site): results, model and run pages` (77d7d34dd)
- [x] Follow-up (coordinator, the operator: "we should probs link thinking traces for particular runs if we've released it on github"): public commit hashes in runs.json (the public history was rewritten; mapped by author time + subject), "code <sha>" links to the public commit, and an optional typed `traces` {tag, files:[{label: thinking|trace|Codex transcript, name}]} per run, linked from the model page runs table and runs.html (TRACES column) with a sentence on what the files hold.
- [x] COMMIT: `test(site): cover commit links and trace links` (57742f5a2). RED: 53 of 142 fail (runs.json rejects `traces`; no links yet).
- [x] Implement: `traces` parsed strictly (fixed labels, plain tag/file names); `harness()` links the public commit; TRACES column on the model runs table and runs.html (stacked and labelled on phones); runs.html intro explains thinking vs trace and the encrypted GPT reasoning; runs.json codes mapped to the public history; dates no longer wrap. Site 142/142, 99.64 / 98.52 / 100 / 100; tsc, eslint clean; `just site` 35 files. Browser: `runs/mockups/site-m2c/`, sitecheck ALL OK for results, models/claude-opus-5-5, runs, runs/67d7; contrast sweep clean; opened runs.html light 1280 and dark 375.
- [x] COMMIT: `feat(site): link public commits and released traces` (this commit)
- [x] Browser proof (pre-gate): `runs/mockups/site-m2/`, sitecheck ALL OK (6 widths × light/dark) for results, models, models/claude-opus-5-5, runs, runs/67d7 and index; an all-text contrast sweep inside `main` (375 and 1280, both themes, 7 pages) found nothing under 4.5:1. Screenshots opened: results light 1280 and dark 375, runs/67d7 light 1280, Opus model dark 375, models light 1280.
- [ ] Independent review

**M3 — Updates and RSS**
Outcome: update posts from `site/updates/*.md`, an index, and `feed.xml`. Path set: `packages/site/src/pages/updates.ts`, `packages/site/src/feed.ts`, `site/updates/2026-11-11-opus-clears-emerald.md` (the first post, text from the mockup). Non-goals: comments or any server. Terminator as M1, plus `feed.xml` validating as RSS 2.0 in a test.
- [x] Write tests: front-matter validation, newest-first order, escaping, feed item fields and absolute links from the configured base URL. Also: the Markdown subset (paragraphs, `##`, `-` lists, bold, code, links; raw HTML escaped; only https or plain relative links, prefixed for nested pages), file names `YYYY-MM-DD-<slug>.md` matching a real date, model slugs known to site.json, ties ordered by file name, pubDate at noon New York with the US DST rule, a tag-balance and escaping check on feed.xml, the feed link in every page head, Home's latest-update card, `base_url` (https, trailing slash). Review follow-ups: run-page headline says estimate, short ids must be `[a-z0-9]{4}`, `size(999_999)` is 1.0 MB. M2 landed on main at 3d64c8f89 (coordinator).
- [x] COMMIT: `test(site): cover updates and feed` (504818453). RED: 81 of 156 fail.
- [x] Implement: `markdown.ts` (the subset), `posts.ts` (strict front matter, real dates, file name ⇄ date, known model slugs; newest first, ties by file name), `feed.ts` (RSS 2.0; pubDate is 12:00 New York on the post date, -0400 from the second Sunday of March to the first Sunday of November, else -0500), `pages/updates.ts` (index, post page with model chips, Home's latest-update card); feed link in every page head; `updates` in the menu; site.json `base_url` = https://aorobator.github.io/pokebench/ (operator has not chosen a domain); cli.ts reads `site/updates/*.md`. Posts: `2026-11-11-opus-clears-emerald.md` (mockup text, links results and runs/67d7) and `2026-11-11-pokebench-goes-public.md` (the mockup's other non-draft post; its METHOD button dropped until M4 builds method.html). Review follow-ups: run headline says ABOUT … (ESTIMATE) when estimated; short ids must be `[a-z0-9]{4}`; `size` moves up a unit at 999.5. Two M2 tests that move 67d7's release now also drop the fixture post that links runs/ab07.html (the build rightly refuses the dangling link). Cheap checks: site 179/179, 99.45 stmts / 98.2 branches / 100 functions / 100 lines; tsc, eslint clean; `just site` 39 files; feed.xml parses with xml.dom.minidom. Gates pending a CPU window.
- [x] COMMIT: `feat(site): update posts and RSS feed` (this commit)
- [x] Browser proof: `runs/mockups/site-m3/`, sitecheck ALL OK for index, updates, the Opus post and results; contrast sweep of index, updates and both posts clean; opened updates and index at 1280 light and 375 dark.
- [ ] Independent review

**M4 — Explainers, Method and Credits**
Outcome: all explainers browsable inside the site frame, with an index and client-side search; the Method page with the light and dark turn diagram; Credits listing pixelarticons, Press Start 2P and the game-art policy. Path set: `packages/site/src/pages/{explainers,method,credits}.ts`, `docs/images/harness-loop.webp` and `harness-loop-dark.webp` (approved before commit). Non-goals: editing explainer content; links back to source (the operator: not needed). Terminator as M1, plus INV-7. Split if explainer rendering needs a Markdown dependency we don't already have.
- [x] Write tests: explainer text parity on fixtures (INV-7), search index contents, figure paths rewritten into `site/dist`, Method diagram light/dark pair. Survey of the 347 Markdown twins: `#`–`###` headings, paragraphs, `-` and `1.` lists with indented continuations, `>` quotes, tables with `\|`, plain ``` fences, `![](slug/fig-N.svg|png)` figures, `*em*`, `**bold**`, `***x.** y*`, backslash escapes, `&gt;`-style entities, and raw HTML only as `<details>`/`<summary>` blocks, `<br>` and `<a id>` anchors; links are sibling `.md`, `#fragments`, https, and the generated "Markdown twin of ../x.html" note (dropped). Tests cover each construct, raw HTML failing the build with the file name, explainer link rewriting (sibling .md → page, repo paths → GitHub blob, nothing leaving the repo, https only), the README groups as the index, every explainer in exactly one group, the search box shown only with script, Method (diagram pair, BROWSE ALL N, CONTRIBUTING only when present), Credits (licence text, fonts table from NOTICE.md, game-art policy) and the Credits footer link. M3 landed on main at efe4dbd85 (coordinator).
- [x] COMMIT: `test(site): cover explainers, method and credits` (6489dab16). RED: 12 tests fail and the doc and explainers suites cannot import their modules.
- [x] Implement: `doc.ts` (block parser for the surveyed subset), `markdown.ts` inline extended (`inlineHtml` with explainer mode: em, `***x.** y*`, escapes, `<br>`, `<a id>` as `<span id>`, five entities, images through a path rule; any other raw HTML fails with the file name; posts keep their escaped-text mode), `explainers.ts` (title/kicker, Markdown-twin note dropped, sibling .md → page, repo paths → GitHub blob, README groups joined both ways), pages explainers/method/credits, `assets/explainers.js` (search, shown only when script runs), footer Credits link, menu now all seven sections. Turn diagram copied to `docs/images/harness-loop.webp` (public repo) and `harness-loop-dark.webp` (mockup). cli.ts reads the README, md files, figures, licence, font notice and whether CONTRIBUTING.md exists. Real build: 347 explainers, 569 figures (564 SVG, 5 PNG game screenshots), 961 files; no explainer failed; figures reference no remote URL (only the SVG xmlns). Three test expectations corrected while implementing (anchor line joins its paragraph; repo paths are three levels up from md/; method.html now exists, so the dangling-link test uses nowhere.html). Site 215/215, 99.5 / 97.43 / 100 / 100; tsc, eslint clean (explainers.js linted without type info). Gates pending a CPU window.
- [x] COMMIT: `feat(site): explainers, method and credits` (d882f8577). Coordinator merged main 41eab0513 → 30f052291. Gates on 30f052291 (relay START 03:52 ET, RELEASE sent): `just lint` 0; `just test` 0 (site 215, agent 3055, viewer 1313, env 3505, gateway 39; no-I/O OK); `just verify-vendor` OK.
- [x] Browser proof: `runs/mockups/site-m4/`, sitecheck ALL OK for explainers, adjacent-tiles-v1, astar-navigation, roxanne-first-interaction-v1, method and credits; all 347 explainer pages at 375 px: no horizontal scroll, no external requests, no 4xx; contrast sweep clean on 7 pages. Opened explainers 1280 light, adjacent-tiles 1280 light, astar 375 dark, method 375 dark.
- [ ] Independent review
- [ ] Freeze source; list exactly what remains before landing

**Follow-up: traces and article** (coordinator, after M4 landed on main at cbc210b2b)
- [x] Tests: site.json `article` {title, url} (https, host, no user/query/fragment, no quotes, spaces or angle brackets; non-ASCII kept as given); Home's READ THE ARTICLE button beside SEE RESULTS; the explainers intro line; a post link to an https URL with non-ASCII path characters (already accepted; kept as a guard).
- [x] COMMIT: `test(site): cover the article link` (62943427b). RED: site.json rejects `article`, so most suites fail.
- [x] Implement and data: `article` parsed and validated (URL kept as given); Home's READ THE ARTICLE button beside SEE RESULTS (no hero line: the hero is the leading-run window and the extra line did not read cleanly there); explainers intro line; 6bbd and 7da5 trace links from release `run-traces-2026-11-12` (all 13 runs now link traces); post `2026-11-12-article-1-is-out.md` with the operator's exact text (needs the operator's approval before public). The post renderer already accepted the non-ASCII URL; no renderer change. It is first in Updates, feed.xml and Home's latest-update card. Site 224/224, 99.5 / 97.49 / 100 / 100; tsc, eslint clean; `just site` 962 files; feed.xml parses; sitecheck ALL OK for index, updates, the new post, explainers and runs from `runs/mockups/site-f1/`.
- [x] COMMIT: `feat(site): link the article and the last two run traces` (this commit)

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

## Activation

- [x] the operator, 2026-11-12 04:10 ET: "ok go" (post wording approved; go for the public sync). Scrubbed export ae5f302c9 merged into the public copy as 83bfd2597 (curated README kept; upstream citation fix a88438275 fast-forwarded first and mirrored into final/README.public.md). New image docs/images/harness-loop-dark.webp viewed and approved. `just site` builds 962 files from the public copy; built output: 0 hits on the 45 blocklist rules, no paths, hosts or keys. Lint 0 and test 0 in the public copy (site 224, agent 3055, viewer 1313, env 3505, gateway 39; no-I/O OK) under relay START 04:20 ET. Guard push scan clean (518 objects, gitleaks); push handed to the operator.
- [x] the operator, 2026-11-12 04:25 ET: "ok" to the Pages workflow. `.github/workflows/site.yml`: on push to main touching the site inputs, or by hand; installs only the site package, runs its tests, builds, deploys site/dist with actions pinned by commit SHA; contents read, pages write and id-token on the deploy job only. Its commands were dry-run in a fresh clone of the public copy (224 tests, 962 files). COMMIT: `ci(site): build and deploy the site to GitHub Pages` (ff7cb56b1). Review: Claude LGTM; GPT BLOCKING: path filters missed inputs that change output or the build (CONTRIBUTING.md, package.json, .node-version, pnpm-workspace.yaml, the no-I/O guard). Added. COMMIT: `ci(site): trigger on every input the site build reads` (this commit).
- [ ] the operator pushes; The operator turns on Pages (Settings → Pages → Source: GitHub Actions).
- [ ] Live proof on https://aorobator.github.io/pokebench/.

## Multi-Model Review Log

**M1 round 1** (frozen BASE b720e63a6, HEAD 554b35427, diff SHA-256 86b4da78…650cc; principles table zero FAIL).
- Claude CLI (~/.claude-review, plan mode): VERDICT: LGTM. Non-blocking: checker misses root-absolute and exotic markup; assisted/help not cross-checked; one test name claims a (local) check it lacks; cheapest tile uses whole-run cost (disclosed).
- Grok (Cursor cursor-grok-4.5-high) and Cursor GPT: unavailable, Cursor usage limit until 11/17 (stderr ActionRequiredError). Per the operator's standing rule (memory claude-review-lane, 2026-10-21/22): Claude + GPT via Codex CLI + one fresh fallback reviewer.
- GPT (Codex CLI gpt-5.6-sol, read-only): VERDICT: BLOCKING. check.ts accepted single-quoted/unquoted remote src, poster, object data, meta refresh, and resolved root-absolute `/site.css` against the page folder. Follow-ups: unused `raw()`; quadratic join.
- Fallback subagent (Sonnet, read-only, fresh): VERDICT: LGTM. Non-blocking: earned-order test does not separate from game order; a test name mislabelled; no duplicate-label or furthest-is-latest cross-checks; checker scope.
- Triage: **Fix** the checker (it is the INV-3 guard; concrete inputs pass wrongly). **Follow-up** (not in this branch): test-name/earned-order test strengthening, assisted⇔help and duplicate-label cross-checks, `raw()` removal, quadratic join, root-relative already fixed here. **Rebut**: cheapest tile wording is the approved plan's rule and is disclosed in the sub-label.
- Fix: check.ts parses any quoting, treats poster/data/action/formaction/background/xlink:href as URL attributes, flags a network URL inside any other attribute (meta refresh), scans `<style>` bodies, and rejects root-absolute paths. 5 new tests, all red before the fix (guard-bites proof). Site 76/76, 99.2/98.14/100/100; tsc, eslint clean; real `just site` still builds clean. COMMIT: `fix(site): make the network and link check fail closed` (335aa66a5).

**M1 round 2** (BASE b720e63a6, HEAD 335aa66a5, SHA-256 3b631350…13ab).
- Claude CLI: VERDICT: LGTM (non-blocking: `>` inside a quoted attribute, script bodies/image-set/SVG not scanned, some tests assert counts only, srcset comma splitting).
- GPT (Codex CLI gpt-5.6-sol): VERDICT: BLOCKING on two parser holes: `<img alt=">" src="https://…">` hides `src`; a quoted CSS `url("…)…")` is not read.
- Fallback subagent: pending at time of writing.
- Round cap reached (2 rounds). Prepared the narrow fix for exactly the two listed inputs, pending the operator's choice: quote-aware TAG pattern and quoted/unquoted `url()` forms; 2 new tests red before, green after. Site 78/78, 99.2/98.18/100/100; tsc, eslint clean; `just site` still builds clean. COMMIT: `fix(site): read quoted values that contain > or )` (5a3ed2fc1).
- Fallback subagent round 2: VERDICT: LGTM (round-1 holes closed, no false positives on emitted markup; its gap 2 is the `>` case fixed in 5a3ed2fc1).
- The operator, 2026-11-12 02:38 ET: "ok" to option A (GPT re-checks the fix, then land) and to menu option D.
- Menu treatment D (the operator): label and icon share a 1 px outline in the option grey; the icon had only a drop shadow, the label an outline plus a 2 px drop. `just site` OK; browser check 12/12 again. COMMIT: `style(site): one outline for menu labels and icons` (15c3b9cca). GPT round 3 reviews 335aa66a5..this commit.
- GPT round 3 (Codex CLI, delta 335aa66a5..15c3b9cca, SHA-256 93b7ce5b…b17494): VERDICT: LGTM.
- Landed: board slot 02:41 ET, `git merge --ff-only 15c3b9cca` on main. Post-merge `just test` on main 15c3b9cca (relay START 02:43 ET): exit 0; site 78, agent 3053, viewer 1313, env 3499, gateway 39; no-I/O guards OK. `just land-done` and RELEASE sent.
- Late finding (coordinator-dispatched isolated GPT re-check of 335aa66a5..5a3ed2fc1, relayed 02:38 ET, read after landing): [P2] the quote-aware TAG pattern let `<img alt=don't src="https://…">` skip the whole tag (base caught it, head did not; Chromium loads the src). Real regression from 5a3ed2fc1, now on main.
- Correction (fix forward on this branch): check.ts reads start tags with a small tokenizer following the HTML attribute states (name, optional =, double/single-quoted or unquoted value up to whitespace or >), and reads <style> bodies from the tokenized end of the start tag. Tests: apostrophe/quote inside unquoted values, upper-case names and spaces around =, <style> with a quoted >, truncated markup (fails closed, never crashes). Apostrophe test red before, all green after. Site 82/82, 99.28/98.46/100/100; tsc, eslint clean; `just site` builds clean. COMMIT: `fix(site): read start tags like the HTML tokenizer` (82df94040).
- Correction review (delta 15c3b9cca..82df94040, SHA-256 4dca53f…c4d6889): Claude CLI VERDICT: LGTM (non-blocking: `</style` prefix match; entity-encoded URLs in non-URL attributes, unchanged from main). GPT (Codex CLI gpt-5.6-sol) VERDICT: BLOCKING on the same `</style` prefix: `<style>/* </stylesheet> */ … url(https://…)</style>` ended the scan early. Fix: only `</style` followed by whitespace, `/`, `>` or end ends the body; test red before, green after. Site 83/83, 99.29/98.46/100/100; tsc, eslint clean; `just site` clean. COMMIT: `fix(site): end a style body only at a real end tag` (62878e3f0).
- GPT re-check (delta 82df94040..62878e3f0): VERDICT: LGTM. Landed: board 02:48 ET, `git merge --ff-only 62878e3f0` on main; post-merge `just test` under relay START 02:49 ET.
- The operator, 2026-11-12 02:46 ET: "i like option c one sticker treatment on both the best". Menu label and icon now share a 1 px outline plus a drop shadow (label 2 px, icon 1 px beyond its outline; phone labels 1 px). `just site` OK; Home browser check 12/12. COMMIT: `style(site): sticker outline and shadow on menu labels and icons` (this commit). Lands with M2.

**M2 round 1** (BASE main 62878e3f0, HEAD 6f4919239, SHA-256 9a9fcb9f…4ef6f3). Gates on 6f4919239 (relay START 03:13 ET, RELEASE after): lint 0; test 0 (site 142, agent 3053, viewer 1313, env 3499, gateway 39; no-I/O OK); verify-vendor OK.
- Claude CLI: VERDICT: LGTM. Follow-ups: run-page headline drops the "estimate" marker; `RunInfo.short` not pattern-checked; progressLong guard; test nits.
- GPT (Codex CLI gpt-5.6-sol): VERDICT: BLOCKING. (1) chart-data.json series runs were never compared with chart-points.json runs, so the two could disagree silently; (2) impossible start times such as 2026-99-99T99:99+99:99 passed the shape check and broke newest-first sorting. Follow-up: size(999_999) renders "1000 kB".
- Coordinator gate (relayed 03:05 ET, the operator told these would be checked): three run summaries checked against the recordings' milestone events. 6056: Stone (t284), Dynamo (986), Heat (1646), Knuckle (1803), then Petalburg Gym: "fourth badge" true, reworded to make the order plain. 6bbd: Stone (252), Dynamo (802), Bicycle (1027); Slateport harbor came at t514, before Mauville, so "then reached Slateport's harbor" was wrong. d41e: Stone, Knuckle, Dynamo (5427) with Shock Wave; harbor at t4663 came before Dynamo, so also wrong. Root cause: run_end's furthest_milestone uses story order, not time. The other five summaries match their recordings (5f0f, 429f, 3bb0, 7da5, 3300).
- Fix batch: ChartSeries keeps its runs and standings rejects any chart-data/chart-points run mismatch; start times must be a real date, time and offset (≤ ±14:00); the three summaries reworded from the recordings. Two new tests red before, green after; the catalog "series with no runs" test now empties both run lists. Site 144/144, 99.65/98.6/100/100; tsc, eslint clean; `just site` OK; browser check ALL OK on runs, Qwen3.8 27B model page and results. COMMIT: `fix(site): cross-check run lists and start times; correct three run summaries` (this commit).

**M3 round 1** (BASE main 3d64c8f89, HEAD c667615c6, SHA-256 6e7b4526…76ae03). Gates on c667615c6 (relay START 03:27 ET, RELEASE after): lint 0; test 0 (site 179, agent 3053, viewer 1313, env 3499, gateway 39; no-I/O OK); verify-vendor OK. M2 post-merge on main 3d64c8f89: test 0 (site 144 …), board released.
- Claude CLI: VERDICT: LGTM.
- GPT (Codex CLI gpt-5.6-sol): VERDICT: BLOCKING. (1) a post containing an XML-illegal character such as U+0001 produced a malformed feed.xml; (2) base_url's shape check accepted values like https://?x=/ that make invalid absolute links.
- Fix: posts reject any character XML 1.0 cannot carry (control characters, lone surrogates), naming its code point; base_url must parse by the URL standard, be https with a host, no user, query or fragment, a path ending in /, and print back unchanged. Two tests red before, green after. Site 180/180, 99.46/98.28/100/100; tsc, eslint clean; `just site` OK. COMMIT: `fix(site): keep the feed well-formed and its base URL valid` (1ab5ccee8).
- Round 2 (delta c667615c6..1ab5ccee8): GPT VERDICT: LGTM. Claude VERDICT: BLOCKING on one remaining base_url input: an empty `?` or `#` (https://a.io/p/?) parses with empty search/hash and prints back unchanged, so joined feed links point at the wrong page. Round cap reached; per the operator's earlier choice for the same situation (fix and re-check, 2026-11-12 02:38 ET) the one-condition fix: reject any ? or # in base_url; two test values, red before, green after. Site 180/180; tsc, eslint clean; `just site` OK. COMMIT: `fix(site): reject an empty query or fragment in base_url` (this commit). Claude re-check of this delta next.

## Boy Scout Log

(empty)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog after activation
