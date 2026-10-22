---
name: talk-to-codex
description: How a Claude session talks to Codex (ChatGPT) sessions working in this repo, listens for their mail, and shares the landing board so neither lands on main out of turn. Use before merging anything into main, when a Codex session needs to know something (main moved, a conflict, your turn), or when you are asked to be the Claude mailbox listener.
---

# Talking to Codex

Claude threads and Codex sessions both work in `~/dev/pokebench` and land on local `main`. They coordinate through the `just` commands below, backed by `pokebench_env.agent_mail`. State lives in the main checkout's `runs/agent-mail/` (gitignored), so every worktree sees the same board and mail.

Operator decision 2026-10-21: agents talk to each other directly. There is no git lock; the board only works if every lander uses it.

## Before you land on main

0. Get ready first: merge current `main` into your branch, pass the gates and get the review verdicts that `.claude/skills/execute-worklog/SKILL.md` requires. Number 1 has only 30 minutes, so never join to do this work.
1. `just land-join --who "claude: <thread title>" --branch <your branch>`.
2. Number 1 means you are landing now. Anything else means wait: run `just claude-mailbox --for <your branch> --timeout 540` with `run_in_background` and stop. That is your own mailbox: board notices for your branch go there and nowhere else. The board mails you "your turn to land <branch>" when the slot reaches you. Each time the mailbox returns, also run `just land-board`, since another listener may have taken your letter; handle other letters as "Being the mailbox listener" says and start it again. While waiting, `just land-board` shows the queue.
3. Land as `.claude/skills/execute-worklog/SKILL.md` says, including the evidence commit. If `main` moved since your review, merge it and rerun the gates. If that changes your branch's own diff, it needs a new review: run `just land-done --branch <your branch>` now, review, and join again.
4. `just land-done --branch <your branch>`. That tells the next entry it is up: a Codex session the same way as `just tell-codex` (the Codex coordinator when it is listening, else `codex queue`), a Claude thread through its mailbox. If `codex queue` fails, `land-done` exits non-zero and prints the `just tell-codex` command to send by hand. Send it.

Whenever someone leaves the board or is moved, every entry whose place changed is told its new number: Codex sessions the same way as `just tell-codex`, Claude threads by mail. Relay those to the coordinator like any other letter.

`just land-move --branch B --before C` moves B to just above C and tells everyone whose place changed. Use it only when the operator says so, or the coordinator passes on the operator's words.

Number 1 holds the slot for 30 minutes from the moment it takes it (operator decision 2026-10-22). After that, if anyone is waiting, it is moved to the back and told why. Commits do not extend it. So run gates and reviews on a branch synced with current `main` before your turn, and use the slot only for the final sync (and gate rerun if `main` moved), merge, `just test` on main, evidence commit and `just land-done`. A holder alone on the board keeps the slot, but its 30 minutes still count from when it took it.

Never merge into main while someone else is number 1. Never remove someone else's entry; the keeper moves an overdue number 1 back.

## Telling a Codex session something

1. `just codex-sessions` lists recent Codex sessions by name, newest first, with times in New York time.
2. `just tell-codex "<session name or id>" "<message>"`. A session name is turned into its thread id from `~/.codex/session_index.jsonl`. When the Codex coordinator thread is listening and the id is known, your letter goes to it and it forwards it into that session mid-turn (the command says "Delivered to the Codex coordinator"). Otherwise it falls back to `codex queue`, which the session reads only when its current turn ends.

Open with who you are and what you need, such as "claude (mart readout thread): main moved to 54640622; merge main before your review packet". One topic per message. A message that starts with `-` needs `--` in front of it. Never send secrets: mail is plain text on disk.

Neither route confirms Codex has read it; the Codex session answers with `just tell-claude` when it has. Archived Codex sessions refuse queued messages; skip them.

The operator gave standing approval on 2026-10-21 to message Codex at any time, in any thread: "You have my standing approval to message codecs, even in new threads. It is always okay."

## Being the mailbox listener

Codex reaches Claude with `just tell-claude`. Letters wait in `pending.jsonl` until a Claude reads them, and a listening Claude is woken at once through a named pipe, with no polling.

The coordinator runs in the cloud and cannot listen on this Mac. The listener is a Claude thread on the Mac: one dedicated thread, or the thread waiting to land.

Letters with no addressee (`just tell-claude` without `--to`) go to the shared relay mailbox. One thread listens there and relays; every thread waiting to land listens on its own mailbox with `--for <branch>`.

1. Run `just claude-mailbox --timeout 540` with `run_in_background` (the relay; add `--for <branch>` for your own mailbox). It returns when mail arrives, or straight away if mail is already waiting. The timeout stays under the background-command limit, so the listener is never killed mid-wait; a killed or interrupted listener leaves its letters pending.
2. Read the letters it printed. Act on any about your own work. Relay every other letter to the coordinator with `send_message` (`session_id` `@parent`, `visibility` `sent_to_shared_agent`), quoting it whole.
3. Start `just claude-mailbox --timeout 540` again right away. Exit code 3 means the timeout passed with no mail; restart it the same way.

Each listener claims its letters in its own `runs/agent-mail/delivering-<pid>.jsonl` and drops them only after printing them. Two listeners never get the same letter, and a listener that dies mid-way hands its letters to the next one, so after a crash you may see a letter twice. A dead listener is recognized by its process id, so in the rare case that id is reused before the next listener runs, its letters wait in `delivering-<pid>.jsonl`; tell the operator. If `claude-mailbox` fails with "unreadable letter", tell the operator rather than editing the files.

Without crashes, only one listener receives each letter. If two threads listen, whichever wakes first gets it and must relay what is not its own.

## Commands

| Command | What it does |
|---|---|
| `just land-board` | Who is landing and who is waiting |
| `just land-join --who W --branch B [--codex-thread T]` | Join the board; prints your position |
| `just land-done --branch B` | Leave the board; tell everyone their new place |
| `just land-keeper` | Start once, detached: LLM-free; moves number 1 to the back 30 minutes after it took the slot, if anyone waits |
| `just land-move --branch B --before C` | Move B above C (operator's word only); tell who moved |
| `just tell-codex "<session>" "<message>"` | Reach a Codex session: via the Codex coordinator mid-turn, else `codex queue` |
| `just codex-mailbox [--timeout S]` / `just codex-mailbox-done --claim N` | The Codex coordinator's listener and acknowledgement (Codex side only) |
| `just codex-wake-watch <coordinator thread id>` | Start once, detached: LLM-free watcher that wakes the idle Codex coordinator when mail arrives |
| `just codex-sessions [--limit N]` | Recent Codex session names |
| `just tell-claude [--from W] [--to BRANCH] "<message>"` | Leave a letter for Claude: one thread's branch, or the relay |
| `just claude-mailbox [--for BRANCH] [--timeout S]` | Wait for letters to your branch, or to the relay; run in the background |

The Codex side of this is `.claude/skills/talk-to-claude/SKILL.md`.
