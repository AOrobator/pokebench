# Explainer-twins test: a fake tailnet host instead of the real one

Status: M1 in progress on `claude/twins-fake-host` (worktree `~/dev/pokebench-twins-fake-host`), off main 79704679f. The operator 2026-11-11 21:11Z ("3. sure", to the item relayed by the coordinator): swap the real tailnet hostname on line 37 of `env/tests/env/test_explainer_twins.py` for a fake one, then gate, review and land.

## Problem Statement

`test_scrub_removes_machine_and_chat_details` used the operator's real Tailscale hostname as its sample input. The publish scrub rewrites it in the public copy, but the private test should not carry it either.

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`

## Architecture

Test data only: `box.<real tailnet id>.ts.net:8447` becomes `box.example.ts.net:8447`, the same string the public copy already has. The scrubber's tailnet rule matches any `*.ts.net` host, so the assertions are unchanged.

## Invariants

- **INV-1** No real tailnet id remains in the file (`grep` before and after).
- **INV-2** The scrub test still proves `<tailnet-host>` replacement (30/30 focused tests).

## Security Review

Removes a private hostname from a test; adds nothing.

## Milestones

**M1**
- [x] Edit; focused tests 30/30; ruff clean
- [ ] Full gates (CPU window requested first)
- [ ] Codex review
- [ ] Land (the operator approved landing in the same answer)

## Closing the Loop

## Session Log

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
