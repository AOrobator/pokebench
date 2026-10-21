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
