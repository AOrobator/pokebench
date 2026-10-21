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
- Own finding while fixing R1: between mailbox runs (while forwarding) the coordinator is not listening, so letters fell back to codex queue. FIX: each --hold run writes present-until (timeout + 120 s); while present, tell_codex leaves the letter for the coordinator; afterwards it falls back to codex queue. Tests: present, expired, unreadable presence, default wait. 50 tests, module 100%.
