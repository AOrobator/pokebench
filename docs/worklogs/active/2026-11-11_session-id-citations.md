# Session-ID citations

Branch `claude/session-id-citations`, worktree `~/dev/pokebench-session-id-citations`, from main 24e6bf075.

## Problem

The pinned Opus costs in `docs/images/charts/chart-data.json` and `docs/images/charts/COSTS.md` cited the Claude Code session that each figure came from by its 8-hex session ID prefix. Session IDs may not be public (protected-data skill). The publish pipeline's pass3 replaces these two prefixes with placeholders on export, and the operator asked for general session-ID rules in the scrub and guard (outside the repo, `~/.config/pokebench-publish/pass3/session_ids.py` and `~/.config/protected-data/blocklist.txt`).

## Change

Cite "a Claude Code session transcript (outside the repo)" instead of the session ID in the two chart-data `source` strings and the Opus section of COSTS.md. The `source` strings are free text; `readme_charts.py` does not parse them, so the rendered charts do not change.

## Invariants

- No session, chat or thread ID in tracked files.
- Pinned dollar figures and the milestones they are read at are unchanged.
- Docs-only change: no application build, lint or coverage run needed (bounded landing workflow); focused `test_readme_charts.py` still passes.

## Milestones

- [x] M1: replace the citations, focused readme_charts tests green (46 passed). COMMIT: `docs(charts): cite a Claude Code session transcript, not its session ID` (45594130d)
  Outside the repo, same day: pass3/session_ids.py gap tightened (sha256/hash/digest/md5 end shape B), 0 matches on the public history; GUARD_PATTERN added to the blocklist; pass3 blob and message callbacks run session_ids.scrub; the updated pass3 leaves the public main hash unchanged; test_session_ids 4/4 OK.
- [ ] M2: Codex review, land on local main (caller's step, not this branch's author).

## Landing

- 2026-11-11 19:23 ET: GPT review rounds 1-2 BLOCKING on the pass3/guard rule (combined `ID prefix` and `session_id` labels; case-sensitive verbs), both fixed with fixtures; public-history rescans 0 matches each time; round 3 `VERDICT: LGTM`. Branch gates on 59465b224: `just lint` green, `just test` green. Landed fast-forward at 59465b224 as number 1 on the board. Post-merge `just test` green (agent 3,042, viewer 1,286, env 3,446, gateway 39). Export with the new pass3: the last synced public commit is still an ancestor (no public-history change).
