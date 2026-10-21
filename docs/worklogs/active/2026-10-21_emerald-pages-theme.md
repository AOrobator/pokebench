# Emerald page theme for explainers, reports and reviews

Requested by the operator, 2026-10-21 (thread "Get a local model to catch rayquaza via pokeagent"): explainer pages need to be Pokémon themed, skills must make that the default, and the PokéNav top of the sample looked glitchy.

## Scope
- `docs/design/emerald-pages.css`: viewer PokéNav look (striped viewer blue, navy POKéBENCH bar, red PokéNav device around `main`, pixel-font headings, Emerald text window frame 1 cards from `graphics/text_window/1.png` palette). No ROM art is committed: frames are CSS, colours only.
- `just pages-theme <files>` (`scripts/pages.sh theme`): inlines the stylesheet with Press Start 2P as a data URI, pins the light palette (rewrites `prefers-color-scheme` queries), wraps `<main>` around main-less pages, idempotent.
- Applied to `docs/explainers/*.html` and `docs/experiments/*.html`; text unchanged.
- CLAUDE.md "Explainers" plus feature-explainer, run-analysis, pokebench-review, pokebench-experiment-design and close-the-loop skills make the theme the default.

## Milestones
- [x] M1 sample (runs/mockups/emerald-pages) sent; PokéNav top glitch fixed (one device shape drawn behind `main`, body isolated)
- [x] M2 stylesheet, `pages-theme`, skills, applied to 171 tracked pages
- [ ] M3 review loop (Claude, Grok, GPT lanes), land ff-only on main, theme the four 2026-10-21 reports in runs/reports

## Commits
- COMMIT: `feat(pages): Emerald PokéNav theme for explainers and experiment pages` (4de1aab73)
- COMMIT: `fix(pages): pixel table headers keep whole words on phones` (ef221f0e9)
- Next: env/tests/tooling/test_pages_theme.py (4 tests) for `pages.sh theme`; breaking the block insert or the colour-scheme rewrite fails a test.
- COMMIT: `test(pages): pages.sh theme placement, idempotence, main wrap and light pin` (d3e2fc095); merged main (11ec91664), themed the new gym-door-label-v1 explainer.
- COMMIT: `docs(explainers): Emerald theme on gym-door-label-v1` (56285e2af). Gates on that tip: lint 0; test agent 3281, viewer 1604 (experiment-cli flaked once under load, 11/11 alone), python 3604; coverage viewer lines 97.9 / branches 91.33 / funcs 94.33, python 97.23/92.98/100.
- Merged main again (589cf5159); themed the new mart-stock-readout-v1 explainer. HTML receipt: re-running the branch's pages.sh theme on main's explainers reproduces all 172 branch pages byte for byte.
- Earlier: pixel table headers no longer break letter by letter on phones (seen in the GLM report's splits table at 375); `pre` scrolls inside the screen.

## Evidence
- All 171 pages at 1280×800 and 375×812 in Chrome: 0 external requests, `<main>` count 1, h1 inside main; only `offscreen-objects-v1.html` scrolls sideways, which it already did before the theme (643px unthemed).
- `just pages-check` on all 171 pages prints nothing; re-running `pages-theme` is byte-identical.
- `pnpm -r test`: agent 3281/3281; viewer 1601/1602, the one failure (`experiment-cli.test.ts` production host pin) passes alone (11/11) and touches nothing changed here.
- Four 2026-10-21 reports themed in runs/reports (not tracked): text identical to the pre-theme copies apart from the style block and colour-scheme queries; 0 requests and 0 page overflow at 1280, 1440 and 375.

## Review round 1 (packet 54640622..fd5cc22f, sha256 49cd6fbe…53ee)
- Claude (CLI, ~/.claude-review): LGTM. Follow-ups: `<main>` would open inside `<head>` on a head+body page; `</main>` lands after `</html>`; colour-scheme rewrite touches prose too; encoding/CRLF; stale dark-mode wording in feature-explainer Craft and the experiment-design overview template.
- Grok (Cursor cursor-grok-4.5-high): BLOCKING on the same wrap placement (`</html></main>` on main-less pages; `<main>` before `</head>`). Accepted.
- GPT (Cursor gpt-5.6-sol-xhigh): not run, Cursor usage limit; GPT lane moves to Codex CLI (standing harness switch).
- RED: 5 new tests (close before `</html>`, open after `<body>`, rerun repairs an earlier wrap, prose untouched, CRLF/UTF-8 kept) fail on the current script.
- RED commit 195e50b91. GREEN: `pages.sh theme` opens `<main>` after `<body>` (else after `</head>`, else after the theme block), closes it before `</body>`, else `</html>`; a rerun removes its earlier wrap first; the colour-scheme rewrite runs only inside `<style>` blocks; files are read and written as UTF-8 with newlines kept. Re-themed: 7 main-less pages now close `</main>` before `</html>`. Skill wording: feature-explainer asks for one light palette, run-analysis says system fonts in the page's own CSS, the experiment overview template drops its dark block. 9/9 theme tests; all 173 pages' text equals main's apart from the theme block, wrap and colour queries; Chrome check of all pages unchanged (only offscreen-objects-v1's pre-existing overflow).

## Review round 2 (packet 54640622..79f4ae46, sha256 5e4c9ae0…5f0b)
- Claude (CLI): LGTM. Grok: LGTM. GPT (Codex CLI gpt-5.6-sol xhigh; Cursor GPT at its usage limit): BLOCKING on evidence only: the sweep used 1280x800/375x812 and never opened `<details>`, while close-the-loop asks for 1280x900, 1440x900 and 375x812 with details closed and open. Accepted.
- All three flagged a hardening follow-up: an orphan `<main data-pb-emerald>` with no `</main>` made `rfind` return -1 and cut the page. Fixed (only strip the wrap when its `</main>` follows it); new test fails on the round-2 script, passes now (10/10).
- Full sweep (runs/mockups/emerald-pages/shots/sweep, results.json): 173 pages x 1280x900, 1440x900, 375x812, details closed and, on the 5 pages with details, opened: 519 views, 0 external requests, one `<main>` each with its h1. A per-element check found tables and long `code` spilling past the narrower phone screen on 10 pages where the unthemed page fit; the phone rules now let tables scroll, wrap long inline code and keep cards inside the screen. After that, no themed page spills anywhere the unthemed page did not; offscreen-objects-v1 keeps its own pre-existing overflow. Four reports re-themed and rechecked at 1280/1440/375 (0 requests, 0 overflow).

## Review round 3 (packet d00cded5..7c59a8d8, sha256 5b55cac8…c82e)
- Grok: LGTM. Claude: BLOCKING, mart-stock-readout-v1's own h2 band (blue gradient, inline-block) stayed under the theme's red h2 text, 1.87:1 contrast. Fix. GPT/Codex: BLOCKING on (1) tags inside HTML comments/scripts, (2) uppercase `PREFERS-COLOR-SCHEME` and colour-scheme text inside CSS `content`, (3) CRLF around an earlier wrap. Triage: uppercase query fix (cheap, one flag); comments/scripts, CSS `content` text and CRLF old wraps rebutted as inputs no page has and the script never writes (follow-up).
- Third round with blockers: asked the operator (fix and land / another round / hold) and made the two fixes meanwhile.
- RED: `test_uppercase_colour_scheme_query_is_pinned` fails on the round-3 script.
- GREEN: colour-scheme queries match case-insensitively; `main h2` drops any page background band (display block, background none). 11/11 theme tests. Re-themed 174 pages and the 4 reports; sweep rerun (522 views at 1280x900/1440x900/375x812, details open on 5 pages): 0 requests, one main + h1 each, only offscreen-objects-v1's pre-existing overflow; no h2-h4 inside main keeps a background on any page.
