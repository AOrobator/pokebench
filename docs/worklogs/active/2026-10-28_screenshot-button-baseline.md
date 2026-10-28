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

Additional RED: baseline text-only replies still got the unconditional NUDGE. Added endOnTextOnly opt-in at Governor/production live binding; baseline ends model_error on a no-tool reply without a follow-up. Ordinary OFF policy remains unchanged. This directly enforces the operator-approved no-supervisor-nudges scope; no new retry/coaching policy for existing runs.

Operator correction: do not include premature termination. Removed proposed text-only stop before any real inference. Baseline continues normal assistant replies with empty prompts and retained history through pi start, because pinned pi continue rejects assistant-last history. No injected follow-up text. Preset maxTurns/failureLimit are MAX_SAFE_INTEGER (effectively disabled within30m), replyFailuresEndRun=false. Gateway/model errors retain existing logged resample path but cannot reach the failure cap during the window. Wall cap/operator stop remain. A process/server fault can still prevent continuation; no attempt to hide infrastructure failure.

GREEN: 141 targeted agent tests PASS across baseline/harness/config/registry/preset suites. Fake-model/native-game rehearsal:3requests,exact approved system prompt each time,exact observe/press schemas,no added user coaching,2image tool results,3nonempty assistant thinking records,1button action,private state events retained; second tool-less reply continues to the third request. Receipt runs/baseline-preflight/rehearsal-no-early-stop/receipt.json. First receipt probe mistakenly searched nonexistent thinking event type; corrected to actual assistant.thinking schema and retained failed artifact.

Mutations: prompt condition, ToolSwitches mapping, observe image-only filter and press image-only filter each removed independently; all produced assertion RED then restored. Production live binding deletion made native rehearsal inject NUDGE (noInjectedMessages=false), then restored and rebuilt. Current evidence no GPU traffic.
