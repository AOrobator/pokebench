# Results ledger

Every row is read from the run's own recording: the `run_start` and `run_end` events and the milestone events in `runs/<run-id>/events.jsonl`. What the recording does not say is marked unknown. Badges count native badge milestones, including those already held at the start. Wall time is the harness's own `wall_ms`.

A run marked **assisted** is a custom lane: it had knowledge switches on (here the Rayquaza lane's Mach Bike, Master Ball, catch and moveset knowledge). It is listed with the rest but never pooled with unassisted runs.

| Run | Model | Start | Harness commit | Preset | Budget | Result | Evidence |
|---|---|---|---|---|---|---|---|
| `67d7` (2026-11-10) **assisted** | `claude-opus-5-5` | boot | `aaecbda17` | `opus-rayquaza-lane` | 20,000 turns, 24 h | **Hall of Fame** (game clear) at turn 4,119; 8 badges. Ended `completed` at 4,124 turns, 17h 16m. | Release staged and checked with `just verify-release`; not published yet. |
| `b5a8` (2026-11-10) **assisted** | `claude-opus-5-5` | checkpoint before Elite Four Drake, 8 badges held | `362f1078d` | `opus-rayquaza-lane` | 300 turns, 1 h | **Hall of Fame** (game clear) at turn 54. Ran on past the clear; ended by the operator (`operator_abort`) at 118 turns, 21m. The last leg of a checkpoint chain, not a single run. | Not released yet. |
| `ee2a` (2026-11-05) | `deepseek/deepseek-v4.1-flash` | checkpoint in Fortree City, 5 badges held | `605179d7a` | `current-control-32k-fortree-gate-turns-2h` | 20,000 turns, 2 h, extended by the operator to 6 h at turn 101 | **Feather Badge** (6th) at turn 86. Ended `operator_stop` at 592 turns, 4h 12m. | Not released yet. |
| `37ca` (2026-11-07) | `deepseek/deepseek-v4.1-flash` | boot | `25774e1f6` | `deepseek-boot-24h-cook-control` | 20,000 turns, 24 h | **5 badges** (Balance Badge at turn 1,499); furthest milestone Aqua Hideout. Ended `budget` at 2,778 turns, 24h 0m. | Not released yet. |
| `80c8` (2026-11-02) | `deepseek/deepseek-v4.1-flash` | boot | `b57154531` | `current-control-24h-8k` | 20,000 turns, 24 h | **2 badges**: Stone Badge at turn 223, 55m 13s after the start; Knuckle Badge at turn 572. Ended `operator_abort` at 875 turns, 4h 17m. | Not released yet. |

Full run ids:

- `2026-11-10T15-37-43_opus-rayquaza-boot_67d7`
- `2026-11-10T13-52-15_opus-drake-continuation_b5a8`
- `2026-11-05T13-26-41_deepseek-deepseek-v4.1-flash_ee2a`
- `2026-11-07T00-01-56_deepseek-deepseek-v4.1-flash_37ca`
- `2026-11-02T15-53-23_deepseek-deepseek-v4.1-flash_80c8`

Notes:

- **Tokens and cost.** On subscription lanes the harness records token counts as 0, so token totals for the Opus runs are unknown from their events. For `67d7` the staged release takes them from the model gateway's session record: about 659M tokens, $780.55 at API list price, not billed per token (Claude Max plan). Unknown for the others.
- **`80c8` furthest milestone.** Its `run_end.furthest_milestone` says `GRANITE_CAVE_B1F`, but the run also recorded the Knuckle Badge and later milestones. The field ranks milestones its own way; the badge milestones above are the result.
- **`b5a8` start.** The recording names no checkpoint milestone. "Before Drake" comes from the save-state's name and from the Drake win at turn 7. The game-clear stop switch was not yet in its features, which is why it played past the clear.
- **Model ids** are as the endpoint listed them. The DeepSeek runs used a hosted API through a gateway, not a local model.
- **Released** means a folder anyone can download and check with `just verify-release <folder>` and their own ROM. No run here is published yet.
