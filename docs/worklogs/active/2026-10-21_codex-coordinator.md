# Codex coordinator with a mailbox

Operator pick 2026-10-21 1:42 PM EDT (the operator: "the Codex coordinator with a mailbox"), after agent mail landed (df5a9ccc0). `codex queue` only reaches a Codex thread when its turn ends. Codex's own `send_message_to_thread` lands mid-turn (seen in today's rollouts: delegated messages arrive inside the receiver's running turn). So one Codex coordinator thread listens on a mailbox and forwards each letter to its Codex thread.

Scope: dev tooling only (`pokebench_env.agent_mail`, just recipes, skills). No harness behavior, so no feature switch.

Design:
- Letters may name a Codex thread (`to_thread`).
- `tell_codex` puts the letter in the `codex-coordinator` mailbox when a coordinator is listening there, and falls back to `codex queue` when none is (nothing saved, so no double delivery).
- Board notices to Codex entries go the same way.
- `just codex-mailbox` is the coordinator's listener. The new `codex-coordinator` skill (Codex side) says how to run the loop and forward with `send_message_to_thread`.
- The coordinator needs the operator's standing authorization, in its own thread, to message PokeBench Codex threads.

M1 RED: tests for listener-present routing, fallback with nothing saved, letter `to_thread` round trip and printing, board notices via the coordinator.
M2 GREEN: module, recipe, skills; gates.
M3 REVIEW/LAND: Claude, Grok, GPT lanes; land through the board.

## Progress
- RED: 5 new agent-mail tests fail (no CODEX_COORDINATOR, no to_thread, tell_codex signature); 40 existing pass.
- GREEN: Letter.to_thread; deliver(only_if_listening) shared by tell_claude and the coordinator route; reach_codex/tell_codex use the codex-coordinator mailbox when a listener holds it, else codex queue with nothing saved; board notices to Codex go the same way. `just codex-mailbox`; codex-coordinator skill (Codex side, linked under .agents/skills); talk-to-codex, talk-to-claude and CLAUDE.md updated. 45 agent-mail tests, module 100%.
- R1 packet (base 2e944834, head 1fece78c): Claude, Grok, GPT all BLOCKING.
  - All three: a coordinator leaving between pipe open and the wake write left the letter pending and also sent it by codex queue (double delivery). FIX: with only_if_listening, BrokenPipe returns True (the letter waits for the coordinator; no queue). Test with a real FIFO reader and a failing write.
  - GPT: letters were acknowledged before the coordinator forwarded them. FIX: `claude-mailbox --hold` prints JSON letters with a claim and keeps them claimed; `mailbox-done --claim N` acknowledges after forwarding; a dead forwarder's claim is handed out again (test simulates the crash).
  - GPT: multiline letters could not be split reliably. FIX: --hold output is JSON per letter (test with a newline and a prefix-shaped line).
  - GPT: the failure report put letter text on a shell command line. FIX: `tell-claude --stdin` plus a quoted heredoc in the skill (test with $(...) and backticks kept literal).
  - Tests: 48, module 100%.
- R2 packet (head 6056f3ed): Grok LGTM; Claude and GPT BLOCKING.
  - Accepted (Claude B2, GPT 1-2): the presence lease could strand letters when the coordinator stopped inside its window, and its file write was not atomic. FIX: reverted the presence commit (b9d525da); letters go to the coordinator only while it holds the pipe, else codex queue.
  - Accepted (Claude B1): board entries and talk-to-codex use session names, but send_message_to_thread takes a thread id. FIX: reach_codex resolves names to ids from ~/.codex/session_index.jsonl (newest session wins); an unknown name goes straight to codex queue, which takes names. Test: name, id, unknown name.
  - Accepted (GPT 3): talk-to-codex and docstrings still said board notices to Codex go by codex queue. Fixed.
  - Gates on 6056f3ed failed twice only on the pre-existing flaky serial-comparison "hung child" TS test (fix proposed as a separate session). 49 agent-mail tests, module 100%.
- R3 packet (head fe76717e; gates clean on try 2 after one flaky hung-child run): Grok LGTM; Claude and GPT BLOCKING.
  - Accepted (Claude, GPT 2): tests read the operator's live ~/.codex/session_index.jsonl. FIX: autouse fixture points CODEX_SESSION_INDEX at a missing tmp file; an unreadable index now means "no ids known" (falls back to codex queue) instead of raising.
  - Accepted (GPT 2): each moved Codex entry re-read and re-parsed the whole index. FIX: notify_moves reads it once per board change (test counts one read for three Codex notices, none when no Codex entry moves).
  - Accepted (GPT 1): a letter line equal to the heredoc delimiter would escape it. FIX: `tell-claude --file`; the skill writes the report with the file-editing tool, never through the shell (test with a delimiter line and $(...) kept literal).
  - 51 agent-mail tests, module 100%.
- 2:25 PM: The operator chose "land" after review round 3 (Grok LGTM; Claude/GPT R3 findings fixed). Review rounds stopped at the operator's two-round rule.
- 2:38 PM, operator instruction relayed by the Codex coordinator: no polling turn; the idle coordinator yields and is woken only when mail arrives. Verified first that `codex queue` into the idle coordinator thread starts a turn (queued 2:38:59 PM, reply "woke" 2:39 PM).
- Added `mailbox-watch` / `just codex-wake-watch <thread id>`: an LLM-free process that holds the coordinator's pipe (so letters route there), sleeps in select, and on mail queues one wake into the coordinator (marker `wake-sent` stops repeats until the coordinator runs `codex-mailbox`, which clears it; a wake older than 10 min, or a failed queue, is retried on the next letter). Skill rewritten: each wake turn runs `just codex-mailbox --timeout 1` until "No mail.", forwards, acknowledges, then ends the turn; no waiting loop.
- Live (watcher pid 743 from this worktree, coordinator redacted-id): letter at 2:41:21 PM → coordinator woke and replied "pong via watcher" by 2:41:57 PM; then two real coordinator-routed letters (8790 restart owner, to frame-rates redacted-id and button-lights redacted-id) reached both target rollouts by 2:43:02 PM.
- 58 agent-mail tests, module 100%.
