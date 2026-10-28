# Screenshot and button baseline

The operator requested one minimal baseline and explicitly approved the prompt quoted below (2026-10-28). GPU1 owner Claude granted N=1, <=30 minutes, :[local inference port] only, normal exclusive lease; GPU0 run 9c88 stays untouched. No inference yet.

Approved prompt: You are playing Pokémon Emerald. Make as much progress as you can. You receive screenshots and can use `observe` to view the screen or `press` to press buttons: A, B, START, SELECT, UP, DOWN, LEFT, RIGHT. Choose your actions from what you see.

One bounded milestone: default-off screenshot-button-baseline-v1 selects this prompt and image-only successful observe/press results. A baseline preset disables every other behavior switch, retains ordinary conversation history and private RAM/native scoring/complete exposed reasoning recording. Existing button timing/schema unchanged. No navigation, auto-dialogue, supervisor coaching or injected memory. New errors remain explicit failures rather than invented game evidence. No incumbent activation or promotion. N=1 is exploratory, no effectiveness claim.

- [ ] RED and exact OFF tests.
- [ ] GREEN, production factory proof and wiring deletion check.
- [ ] Full gates and cloud review.
- [ ] Fake-game rehearsal proves delivered prompt, tool schemas, screenshots, action/result chain and recorded thinking.
- [ ] Launch one GPU1 run from boot, 30m wall maximum, verify viewer, release lease and notify owner.

Production boundary: feature registry and preset/default normalization; play prompt and ToolSwitches mapping; successful game-tool result content; feature explainer/card mapping; single-run preset and ignored launch/rehearsal artifacts. No changes to action semantics, game server, supervisor algorithms, viewer layout or scoring. Runtime source pinned to clean reviewed branch; landing follows normal board if needed for viewer compatibility. GPU lease begins only after rehearsal.

RED: three focused tests fail on inherited prompt, missing preset and leaked text. Command pnpm --filter @pokebench/agent exec vitest run src/screenshot-button-baseline.test.ts. Initial pnpm test -- invocation selected a broad suite; owned process terminated immediately, corrected to exec vitest; no passing full-gate claim.
