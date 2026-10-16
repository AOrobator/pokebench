# warp-arrival-settle-v1: observations wait out door/stairs/warp animations

Pre-launch fix F1 (M4) of `docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (operator-approved 2026-10-16 12:46 AM EDT; bundle switch, ON in the bundle arm only). Branch `claude/warp-arrival-settle`, worktree `/private/tmp/pokebench-m4-warp`. Design: `runs/reviews/2026-10-16-qualification-forensics/harness-engineer-animation.md`.

## Problem

Observations after a door, stairs or warp are captured mid exit animation: the fade settle (`screen_settle.py`) only waits for `gPaletteFade.active` or a black palette, so the capture lands while the game's warp-exit task still holds the player. The model reads "Field controls: locked (dialog, menu, or script…)" on the warp tile, and sometimes never sees that it entered a new map (control-2919 T100/seq 1383, T143/2010, T185/2884, T200–T247/3165–3166).

## Skills loaded

feature-switch, feature-explainer, pokebench-game-state, agent-observability.

## Design (switch ON; OFF = today byte for byte)

- Settle predicate: per emulated frame (existing `on_frame` hook, no sleeps): fade active OR black palette OR (field controls locked AND a warp task is live in gTasks: `Task_DoDoorWarp`, `Task_WarpAndLoadMap`, `Task_ExitDoor`, `Task_ExitNonAnimDoor`, `Task_ExitNonDoor`; pokeemerald `src/field_screen_effect.c` 256–420, 646–727).
- Bound: a waiter that has seen a warp task waits up to `WARP_SETTLE_BOUND_FRAMES` (measured chain ≤ 137 frames; bound 300); fade-only waiters keep 146.
- Label: a capture that still sees lock + warp task reads `Field controls: locked (door/stairs/warp animation still running; observe again)`. A script/message lock with no warp task keeps today's label and is captured at once.
- Structured record: `settle: {frames, reason}` in the observation's state (ON only).
- Press result (with transition-press-result-v1): a warp is reported as `warped during this press: <from> -> <to>` even when `active_ui` is non-null (bundle bug 9).

## Milestones

- [x] Receipt: task function addresses on the real ROM (ROM literal pools + live per-frame probe); exit lengths on the 2F stairs and Birch's lab door
- [x] RED: archived raw-RAM replay (control-2919 seq 1383, 2010, 2884, 3165/3166), script lock captured at once, bound hit labelled, pause releases, T185 + bug 9 press results, registration
- [ ] GREEN, deletion checks, gates
- [ ] Real-ROM probe through the lab door and the 2F stairs, switch ON and OFF
- [ ] Explainer, review (Codex + grok)

## Session Log

- 2026-10-16: worktree created from main fa09dbe6; env venv via `uv sync` plus the mgba binding copied from the main checkout's venv (for real-ROM probes only).
- Receipt (docs/findings/2026-10-16_warp-arrival-settle.md): ROM literal pools give Task_ExitDoor 0x080AF439, Task_ExitNonAnimDoor 0x080AF551, Task_ExitNonDoor 0x080AF611, Task_WarpAndLoadMap 0x080AFA0D (exactly 8 pool refs = 7 CreateTask sites + Task_DoDoorWarp's func switch), Task_DoDoorWarp 0x080AFA89; all five are `push {…,lr}` starts in source order. Live per-frame probe from CLOCK_SET.state (sha1 51007c05…) confirms each task holds the lock: 2F→1F stairs 75 frames, 1F→2F 74, house→Littleroot 95, Littleroot→lab 124, lab→Littleroot 137 (first locked frame to unlocked). Archived control-2919 RAM: seq 1383/2010/2884/3165/3166 each lock + warp task with no fade (today's settle captured at once). Bound 300 frames (2.2× 137; ≤ 7 s at the slowest recorded 42.8 fps, under the 15 s fetch timeout).
- RED: env/tests/env/test_warp_arrival_settle.py (fixture fixtures/warp-settle-2919.json: lock byte, gTasks, gPaletteFade, palette RAM copied from control-2919 archives 236/298/299/427/428/553/554/555/603/604/605 with their sha256): replay chains 1383→1392 2F (7,2), 2010→2020 (5,9), 2884→2894→2900 LAB (6,12), 3165→3166→3174 (7,17), all unlocked; OFF captures each at once; MOM script lock (seq 1126) captured at once with today's label; bound hit labelled, no hang; fade-only keeps 146; held through black load frames; pause releases; observation route label + settle record; OFF payload byte-identical; rerender; production serve.run wiring. packages/agent/src/warp-arrival-press-result.test.ts: T185 (2919) and bug 9 (3f21 T157) press results, OFF texts, factory wiring; registry fixtures updated. Without the implementation: pytest collection ImportError + 3 registry/rerender failures; agent 31 failed; viewer 4 failed.
