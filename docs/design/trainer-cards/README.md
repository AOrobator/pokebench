# Operator-approved trainer cards

The operator's October 21 screenshot (`reference-2026-10-21.png` beside this file) is the design reference (reconfirmed October 24, chat 00000000-0000-4000-8000-442532a64cf1). The original implementation is 2269190c3^; design choice is recorded in docs/worklogs/2026-10-16_trainer-card-header.md.

Preserve experiment name in the blue tab (model/id fallback for an ungrouped run), trainer sprite and name, colored TYPE/BUNDLE or TYPE/CONTROL badge when recorded, milestone/place/trial line, STORY and TIME bars, six party boxes, progress tier, milestone glow and accurate WATCHING/LIVE/PAUSED/REPLAY state. Missing arm/trial metadata stays absent. Queue removal does not authorize removal of recorded run identity.

## Required approval and checks

Any change to these fields, card appearance, visual baselines, fixture inputs, protected assertions or this protection requires explicit approval from the operator for the specific change. A cleanup/refactor request and a reviewer suggestion are not design approval. Do not delete/negate assertions or regenerate baselines merely to obtain a pass. Keep scheduling controls separate from run identity.

Run `just trainer-card-check` (also included in `just test`). It builds and renders fixed cards through the production renderer, CSS, ROM art and font at 1280/1440/375 in headless Chromium; animations/time/data are fixed. Baselines are for the locally pinned Playwright Chromium on macOS. Install that browser with `PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm --filter @pokebench/viewer exec playwright install chromium --only-shell`. ROM-derived art remains ignored under runs/sprites/trainer-card-v1; set POKEBENCH_CARD_ART to that directory when checking an isolated worktree. To use an installed matching headless shell, set POKEBENCH_CHROMIUM to its executable.

Baseline update command (only after specific operator approval): `pnpm --filter @pokebench/viewer exec playwright test -c design-tests/playwright.config.mjs --update-snapshots`. Inspect all changed images. Record the reason, exact user quote and source chat/message in the worklog and in docs/design/trainer-card-approval.json. That receipt contains current `parent` (HEAD), `user_quote`, `source`, and `files`: the exact protected staged paths mapped to their SHA-256, or null for deletion. The pre-commit hook uses the committed guard, rejects absent/stale/inexact receipts, and prevents reusing an old approval on a later commit. It records authorization; it cannot authenticate a human quote or defeat deliberate hook bypass. Agents must never invent approval or bypass hooks.

Review must compare changes with this contract and the preserved screenshot intent, not just green tests. Run the visual check after the final build and verify the served viewer after landing. Browser work must preserve desktop focus.
