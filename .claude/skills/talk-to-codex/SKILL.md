---
name: talk-to-codex
description: How a Claude session talks to Codex (ChatGPT) sessions working in this repo, listens for their mail, and shares the landing board so neither lands on main out of turn. Use before merging anything into main, when a Codex session needs to know something (main moved, a conflict, your turn), or when you are asked to be the Claude mailbox listener.
---

# Talking to Codex

Claude threads and Codex sessions both work in `~/dev/pokebench` and land on local `main`. They coordinate through the `just` commands below, backed by `pokebench_env.agent_mail`. State lives in the main checkout's `runs/agent-mail/` (gitignored), so every worktree sees the same board and mail.

Operator decision 2026-10-21: agents talk to each other directly. There is no git lock; the board only works if every lander uses it.

## What the mailbox is for

Operator decision 2026-11-12: the mailbox carries Codex↔Claude letters and landing-board notices only.

- A cloud project thread reaches its Mac work through that thread's own Remote Control session. The operator's messages in the thread arrive there as the operator's own words, so approvals reach the session that needs them. Never route a thread's request through a branch mailbox.
- A Claude session on the Mac reaches another Claude session with SendMessage to its session name (ListAgents lists them), not by mail.
- `just tell-claude --to <branch>` refuses, with exit code 2, a branch no worktree has checked out: no session would ever read it. `POKEBENCH_AGENT_MAIL_STRICT_TO=0` turns the check off.
- One owner per request. The coordinator's Mac relay session acts only on asks addressed to the relay. When a thread's own Mac session owns a request, the relay does not also act on it; on 2026-11-11 a README screenshot ask was built twice because both did.
- Mailboxes of branches no worktree has checked out are archived, never deleted, with `just mail-archive --dry-run`, then `just mail-archive` (to `runs/agent-mail/archive/<UTC date>/`).

## Shared CPU windows

The Claude relay (the “Claude and Codex coordination” thread, reached via `just tell-claude`) grants heavy-CPU START/RELEASE windows. Do not start a full suite (`just test`, `just coverage`, `just lint`), full build or gate chain until it grants a window. Targeted single-file tests are always fine; do not disguise a full suite as many focused jobs. Pass the cheap checks in `execute-worklog` before requesting full gates, and inspect recipe prerequisites for hidden builds. Send RELEASE on completion, failure or cancellation; hold no window while fixing or awaiting review. A required post-merge check has priority over new branch gates. An explicitly granted quiet measurement window blocks heavy jobs until released. CPU coordination does not reserve the landing board or authorize gameplay/refreshes.

A gameplay clearance from the relay grants a resource window (endpoints, ports, lease, start time) and repeats the operator's own stop limits word for word. It never adds a stop condition. Never write "if none was given, set …". When the operator set no dollar cap or other extra stop, the clearance says "none set by the operator" and the launcher applies none. Turns and time follow "Only the operator ends a run" in `CLAUDE.md`: The operator's words, else a preset the operator named (marked preset-sourced), else hold the clearance until the operator answers. If the window cannot fit the operator's limits, say so and ask the operator; do not shrink the run to fit. Operator decision 2026-11-10, after a relay-invented $40 equivalent-spend stop ended Opus run 12bf at turn 248 on a Max subscription. See "Only the operator ends a run" in `CLAUDE.md`.

## Before you land on main

0. Get ready first: merge current `main` into your branch, pass the gates and get the review verdicts that `.claude/skills/execute-worklog/SKILL.md` requires. Number 1 has only 30 minutes, so never join to do this work.
1. `just land-join --who "claude: <thread title>" --branch <your branch>`.
2. Number 1 means you are landing now. Anything else means wait: from your worktree, run `just claude-mailbox --for --timeout 540` (a bare `--for`, or `--mine`, reads the branch checked out there) with `run_in_background` and stop. That is your own mailbox: board notices for your branch go there and nowhere else. The board mails you "your turn to land <branch>" when the slot reaches you. Each time the mailbox returns, also run `just land-board`, since another listener may have taken your letter; handle other letters as "Being the mailbox listener" says and start it again. While waiting, `just land-board` shows the queue.
3. Land as `.claude/skills/execute-worklog/SKILL.md` says, including the evidence commit. If `main` moved since your review, apply the upstream-impact/evidence-reuse rules in `execute-worklog`. Unchanged feature/unaffected contracts retain receipts; release the slot if correction, review or a prelanding full gate is needed, then prepare off-board and rejoin.
4. `just land-done --branch <your branch>`. That tells the next entry it is up: a Codex session the same way as `just tell-codex` (the Codex coordinator when it is listening, else `codex queue`), a Claude thread through its mailbox. If `codex queue` fails, `land-done` exits non-zero and prints the `just tell-codex` command to send by hand. Send it.

Whenever someone leaves the board or is moved, every entry whose place changed is told its new number: Codex sessions the same way as `just tell-codex`, Claude threads by mail. Relay those to the coordinator like any other letter.

`just land-move --branch B --before C` moves B to just above C and tells everyone whose place changed. Use it only when the operator says so, or the coordinator passes on the operator's words.

Number 1 holds the slot for 30 minutes from the moment it takes it (operator decision 2026-10-22). After that, if anyone is waiting, it is moved to the back and told why. Commits do not extend it. So run gates and reviews on a branch synced with current `main` before your turn; do not ask for a main hold. Use the slot only for the final sync/impact note, merge, the applicable post-main checks on main, evidence commit and `just land-done`. A holder alone on the board keeps the slot, but its 30 minutes still count from when it took it.

Never merge into main while someone else is number 1. Never remove someone else's entry; the keeper moves an overdue number 1 back.

## Asking Codex to do work: always through the Codex coordinator

Operator decision 2026-11-07 (the operator): "u need to crud ur skills so u spin up a codex coordinator chat if there isn't an active one", and "the coordinator doesn't do work at all, it should spin up threads to do work". This applies to every job you hand to Codex: a GPT review lane, a fix, an investigation.

1. Never send work to an ordinary Codex thread you picked from `just codex-sessions`. A queued letter there waits until that thread's turn ends, which may be never; on 2026-11-07 review packets sat for hours in "Compare Sol and Astra pricing" that way.
2. Check for an active coordinator first: `pgrep -lf mailbox-watch` shows its watcher with the coordinator's thread id (`just codex-wake-watch <coordinator thread id>`). Do not send a test letter: any letter to the coordinator is a job. When you send the job, `just tell-codex` prints "Delivered to the Codex coordinator"; "No Codex coordinator is listening" means it was not active after all, and the letter went to `codex queue` instead.
3. If none is active, start one. A Codex thread can only be started from the Codex app or the `codex` CLI. Claude may not run a terminal `codex`, and opening the app takes the operator's desktop focus. So ask the operator in one message to do this:
   - open a new Codex thread in `~/dev/pokebench`;
   - say in it, in their own words, that it is the Codex coordinator, may start Codex worker threads and may message any PokeBench Codex thread (the coordinator skill needs that authorization);
   - give you its thread id.
   Then start its watcher detached, per `.claude/skills/detached-long-lived-processes/SKILL.md`: `just codex-wake-watch <id>`. Send nothing until both are up.
4. Send the job to the coordinator thread by its id as `just codex-sessions` lists it: `just tell-codex "<coordinator id>" -- "JOB <job id>: <job>"`. Only an id that `~/.codex/session_index.jsonl` already knows goes through the coordinator's mailbox; an id or name it does not know goes straight to `codex queue`, even while the coordinator listens. A letter addressed to the coordinator itself is a job for it to hand out. The job id is yours to choose, unique and stable, such as `review-claude-route-summary-2c0e9d36a`; the coordinator titles the worker chat `JOB <job id>`, so it can be found. Write each job so a fresh thread can do it alone: what to do, read-only or not, the worktree, base and head, the packet and its SHA-256, the boundary and principles files, and how to answer. A worker answers with `just tell-claude --to <your branch> "<answer>"`, so listen on `just claude-mailbox --for <your branch>`.
5. One job per letter. For a GPT review lane, send one letter per branch. The coordinator returns a letter that holds several jobs instead of starting workers.
6. If `just tell-codex` exits nonzero, the job was not sent: check the coordinator id and its watcher, then send it again. If it exits zero but printed "No Codex coordinator is listening", the job went by `codex queue` into the coordinator thread as plain text; it is not lost. Do not send it again. The coordinator handles a queued `JOB <job id>:` message like a mailbox job, and the job id keeps it from being started twice. If no worker answers within an hour, tell the operator which job id is waiting.

## Telling a Codex session something

Plain notes to a Codex thread that is already doing its own work (main moved, your turn on the board, a conflict) still go straight to that thread:

1. `just codex-sessions` lists recent Codex sessions by name, newest first, with times in New York time.
2. `just tell-codex "<session name or id>" "<message>"`. A session name is turned into its thread id from `~/.codex/session_index.jsonl`. When the Codex coordinator thread is listening and the id is known, your letter goes to it and it forwards it into that session mid-turn (the command says "Delivered to the Codex coordinator"). Otherwise it falls back to `codex queue`, which the session reads only when its current turn ends.

Open with who you are and what you need, such as "claude (mart readout thread): main moved to 54640622; merge main before your review packet". One topic per message. A message that starts with `-` needs `--` in front of it. Never send secrets: mail is plain text on disk.

Neither route confirms Codex has read it; the Codex session answers with `just tell-claude` when it has. Archived Codex sessions refuse queued messages; skip them.

The operator gave standing approval on 2026-10-21 to message Codex at any time, in any thread: "You have my standing approval to message codecs, even in new threads. It is always okay."

## Being the mailbox listener

Codex reaches Claude with `just tell-claude`. Letters wait in `pending.jsonl` until a Claude reads them, and a listening Claude is woken at once through a named pipe, with no polling.

The coordinator runs in the cloud and cannot listen on this Mac. The listener is a Claude thread on the Mac: one dedicated thread, or the thread waiting to land.

Letters with no addressee (`just tell-claude` without `--to`) go to the shared relay mailbox. One thread listens there and relays; every thread waiting to land listens on its own mailbox with `--for <branch>`.

1. Run `just claude-mailbox --timeout 540` with `run_in_background` (the relay; add a bare `--for` in your worktree for your own branch's mailbox). It returns when mail arrives, or straight away if mail is already waiting. The timeout stays under the background-command limit, so the listener is never killed mid-wait; a killed or interrupted listener leaves its letters pending.
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
| `just tell-claude [--from W] [--to BRANCH] "<message>"` | Leave a letter for Claude: a checked-out branch (refused otherwise), or the relay |
| `just claude-mailbox [--for [BRANCH] \| --mine] [--timeout S]` | Wait for letters to a branch (bare `--for`/`--mine`: the one checked out here), or to the relay; run in the background |
| `just mail-archive [--dry-run]` | Archive mailboxes of branches no worktree has checked out |

The Codex side of this is `.claude/skills/talk-to-claude/SKILL.md`.
