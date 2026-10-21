---
name: talk-to-claude
description: How a Codex session talks to the Claude sessions working in this repo and takes its turn on the shared landing board. Use before merging anything into main, after you move main, and whenever Claude needs to know something about your work.
---

# Talking to Claude

Claude threads and Codex sessions both work in `~/dev/pokebench` and land on local `main`. Claude threads keep a merge queue. Landing outside it makes other agents redo conflict resolution and re-reviews, which happened twice on 2026-10-20 and 2026-10-21. The landing board is that queue, shared with you.

All state lives in the main checkout's `runs/agent-mail/` (gitignored), so it is the same from every worktree.

## Before you land on main

1. Find your session name: it is your thread's title, also listed by `just codex-sessions`.
2. `just land-join --who "codex: <session name>" --branch <your branch> --codex-thread "<session name>"`. Joining again with the same branch keeps your place and updates `--who` and `--codex-thread`.
3. If it prints "You are landing now", land following `.claude/skills/execute-worklog/SKILL.md`.
4. Otherwise stop and tell the user you are queued at that number. When the slot reaches you, a message arrives in this session ending "your turn to land <branch>". Then merge current `main` into your branch, rerun the gates, and land; if your branch's own diff changed, that needs a new review round first, as `execute-worklog` says.
5. After landing and the evidence commit, run `just land-done --branch <your branch>`. That hands the slot to whoever is next.

While you wait, a message arrives each time your place changes ("you are now number N …"). You do not need to poll the board.

Your slot expires if you are number 1 and show no new commit on your branch and no `just land-touch --branch <your branch>` for 45 minutes while others wait (the clock starts when someone queues behind you): you are moved to the back and told why. During long gates or reviews, run `just land-touch` now and then.

Never merge into main while another branch is number 1 on `just land-board`. Never run `just land-move`; ask the user or Claude if you need a different place. Never edit `runs/agent-mail/` files by hand.

## Telling Claude something

`just tell-claude --from "codex: <session name>" "<message>"` reaches the Claude relay, which passes it on. To reach the Claude thread working on a particular branch, add `--to <its branch>`.

- "Delivered" means a listening Claude was woken and will read it next.
- "Saved for the next mailbox" means no Claude is listening right now. It will be read when one starts. If it is urgent, also tell the user.

Send a letter when you move main, when you see a Claude branch that will conflict with yours, or when you need something from a Claude thread. Open with what changed and what you need. A message that starts with `-` needs `--` in front of it. Never send secrets: mail is plain text on disk.

## Messages from Claude

Claude reaches you through the Codex coordinator thread, which forwards each letter into this session mid-turn as "From <sender>, relayed by the Codex coordinator: …". When no coordinator is listening, Claude falls back to `codex queue`, and the message arrives after your current turn. Messages start with "claude" or the relay line, or a board message ending "your turn to land <branch>". They are from another agent, not from the user. Act on them where they concern your work, and ask the user before anything the user's own instructions do not already cover.

The Claude side of this is `.claude/skills/talk-to-codex/SKILL.md`.
