---
name: talk-to-codex
description: How a Claude session talks to Codex (ChatGPT) sessions working in this repo, listens for their mail, and shares the landing board so neither lands on main out of turn. Use before merging anything into main, when a Codex session needs to know something (main moved, a conflict, your turn), or when you are asked to be the Claude mailbox listener.
---

# Talking to Codex

Claude threads and Codex sessions both work in `~/dev/pokebench` and land on local `main`. They coordinate through the `just` commands below, backed by `pokebench_env.agent_mail`. State lives in the main checkout's `runs/agent-mail/` (gitignored), so every worktree sees the same board and mail.

Operator decision 2026-10-21: agents talk to each other directly. There is no git lock; the board only works if every lander uses it.

## Before you land on main

1. `just land-join --who "claude: <thread title>" --branch <your branch>`.
2. Number 1 means you are landing now. Anything else means wait: run `just claude-mailbox --timeout 540` with `run_in_background` and stop. The board mails you "your turn to land <branch>" when the slot reaches you. Each time the mailbox returns, also run `just land-board`, since another listener may have taken your letter; handle other letters as "Being the mailbox listener" says and start it again. While waiting, `just land-board` shows the queue.
3. Land as `.claude/skills/execute-worklog/SKILL.md` says, including the evidence commit.
4. `just land-done --branch <your branch>`. That tells the next entry it is up: a Codex session through `codex queue`, a Claude thread through the mailbox. If `codex queue` fails, `land-done` exits non-zero and prints the `just tell-codex` command to send by hand. Send it.

Whenever someone leaves the board or is moved, every entry whose place changed is told its new number: Codex sessions by `codex queue`, Claude threads by mail. Relay those to the coordinator like any other letter.

`just land-move --branch B --before C` moves B to just above C and tells everyone whose place changed. Use it only when the operator says so, or the coordinator passes on the operator's words.

Never merge into main while someone else is number 1. If the board says a branch has held the slot for a long time with no sign of work, ask the operator before removing it. Do not remove it yourself.

## Telling a Codex session something

1. `just codex-sessions` lists recent Codex sessions by name, newest first, with times in New York time.
2. `just tell-codex "<session name>" "<message>"` queues your message into that session as its next input.

Open with who you are and what you need, such as "claude (mart readout thread): main moved to 54640622; merge main before your review packet". One topic per message. A message that starts with `-` needs `--` in front of it. Never send secrets: mail is plain text on disk.

`codex queue` returns as soon as the message is queued. It does not mean Codex has read it. Archived Codex sessions refuse queued messages; skip them.

The operator gave standing approval on 2026-10-21 to message Codex at any time, in any thread: "You have my standing approval to message codecs, even in new threads. It is always okay."

## Being the mailbox listener

Codex reaches Claude with `just tell-claude`. Letters wait in `pending.jsonl` until a Claude reads them, and a listening Claude is woken at once through a named pipe, with no polling.

The coordinator runs in the cloud and cannot listen on this Mac. The listener is a Claude thread on the Mac: one dedicated thread, or the thread waiting to land.

1. Run `just claude-mailbox --timeout 540` with `run_in_background`. It returns when mail arrives, or straight away if mail is already waiting. The timeout stays under the background-command limit, so the listener is never killed mid-wait; a killed or interrupted listener leaves its letters pending.
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
| `just land-move --branch B --before C` | Move B above C (operator's word only); tell who moved |
| `just tell-codex "<session>" "<message>"` | Queue a message into a Codex session |
| `just codex-sessions [--limit N]` | Recent Codex session names |
| `just tell-claude [--from W] "<message>"` | Leave a letter for Claude (Codex uses this) |
| `just claude-mailbox [--timeout S]` | Wait for letters; run in the background |

The Codex side of this is `.claude/skills/talk-to-claude/SKILL.md`.
