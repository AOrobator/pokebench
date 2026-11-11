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
| `5f0f` (2026-11-04) | `deepseek/deepseek-v4.1-flash` | boot | `49aadfe76` | `current-control-24h-8k` | 20,000 turns, 24 h | **5 badges** (Balance Badge at turn 1,684, 7h 07m after the start). Ended `operator_abort` at 2,181 turns, 10h 0m. Its Fortree checkpoint started `ee2a`. | Not released yet. |
| `429f` (2026-10-25) | `gpt-6-astra` | boot | `aacff2371` | `gpt-6-astra-30m-diagnostic-probe` | 2,000 turns, 30 min at the start; raised to 20,000 turns, 12 h at turn 1,251 on the operator's instruction | **4 badges** (Heat Badge at turn 2,418, 10h 57m after the start). Ended `operator_abort` at 2,741 turns, 12h 32m. | Not released yet. |
| `9f4c` (2026-11-05) | `gpt-6-astra` | checkpoint at the Fortree Gym, 5 badges held | `165f79568` | `astra-fortree-gym-2h-regions-8k-20261105` | 20,000 turns, 2 h | **Feather Badge** (6th) at turn 69. Ended `budget` at 88 turns, 2h 0m. | Not released yet. |
| `3300` (2026-11-07) | `gpt-6.1-sol` | boot | `aef93554a` | `sol61-control-12h` | 20,000 turns, 12 h | **3 badges** (Dynamo Badge at turn 858). Ended `budget` at 862 turns, 12h 0m. | Not released yet. |
| `6302` (2026-11-07) | `claude-opus-5-5` | boot | `5ad4882bc` | `opus55-control-4h` | 20,000 turns, 4 h | **3 badges** (Dynamo Badge at turn 675). Ended `budget` at 848 turns, 4h 0m. First leg of a four-leg chain. | Not released yet. |
| `1121` (2026-11-07) | `claude-opus-5-5` | checkpoint at Meteor Falls from `6302`, 3 badges held | `5ad4882bc` | `opus55-6302-continuation` | 20,000 turns, 4 h | **Heat, Balance and Feather Badges** (Feather at turn 927). Ended `budget` at 1,133 turns, 5h 0m. Second leg. | Not released yet. |
| `69d8` (2026-11-07) | `claude-opus-5-5` | checkpoint at the Magma Hideout from `1121`, 6 badges held | `5ad4882bc` | `opus55-1121-continuation` | 20,000 turns, 4 h | **Mind Badge** (7th) at turn 503. Ended `budget` at 1,038 turns, 4h 0m. Third leg. | Not released yet. |
| `d718` (2026-11-07) | `claude-opus-5-5` | checkpoint at Sky Pillar from `69d8`, 7 badges held | `5ad4882bc` | `opus55-69d8-continuation` | 20,000 turns, 4 h | **Rain Badge** (8th) at turn 283. Ended `budget` at 1,214 turns, 4h 30m. Fourth leg; the chain reached 8 badges in 13h 05m of play, stitched at its checkpoints. | Not released yet. |
| `3bb0` (2026-11-08) **assisted** | Qwen3.6 35B-A3B (local) | boot | `d2d8c3791` | `rayquaza-lane-24h-v3-cook-bundle` | 20,000 turns, 24 h | **5 badges** (Balance Badge at turn 5,842). Ended `budget` at 7,015 turns, 24h 0m. | Not released yet. |
| `d41e` (2026-10-24) | Qwen3.6 35B-A3B (local) | main-menu save, fast text set | `aacff2371` | `bundle-v-control-2h-dryrun-cook-dry-run-control` | 20,000 turns, 24 h | **3 badges** (Dynamo Badge at turn 5,427). Ended `operator_abort` at 7,248 turns, 27h 25m. | Not released yet. |
| `6056` (2026-11-07) **assisted** | `qwen3.8-27b` (local) | boot | `c1d30ff68` | `rayquaza-lane-24h-v2-cook-bundle` | 20,000 turns, 24 h | **4 badges** (Knuckle Badge at turn 1,803). Ended `budget` at 2,378 turns, 24h 0m. | Not released yet. |
| `7da5` (2026-11-01) | `qwen3.8-27b` (local) | main-menu save, fast text set | `fe51cafc6` | `hyperqwen-bundle-24h-cook-bundle` | 20,000 turns, 24 h | **1 badge** (Stone Badge at turn 268). Ended `budget` at 1,330 turns, 24h 0m. | Not released yet. |
| `6bbd` (2026-10-24) | GLM-5.3 Flash UD-IQ4_XS (local) | main-menu save, fast text set | `aacff2371` | `glm53-flash-4h-dryrun-cook-solo-bundle-a-1-dry-run-bundle` | 20,000 turns, 7 days | **2 badges** (Dynamo Badge at turn 802). Ended `model_error` at 1,041 turns, 28h 6m. | Not released yet. |

Full run ids:

- `2026-11-10T15-37-43_opus-rayquaza-boot_67d7`
- `2026-11-10T13-52-15_opus-drake-continuation_b5a8`
- `2026-11-05T13-26-41_deepseek-deepseek-v4.1-flash_ee2a`
- `2026-11-07T00-01-56_deepseek-deepseek-v4.1-flash_37ca`
- `2026-11-02T15-53-23_deepseek-deepseek-v4.1-flash_80c8`
- `2026-11-04T16-25-02_deepseek-deepseek-v4.1-flash_5f0f`
- `2026-10-25T10-50-57_gpt-6-astra_429f`
- `2026-11-05T12-30-45_gpt-6-astra-fortree-gym_9f4c`
- `2026-11-07T01-55-08_gpt-6.1-sol_3300`
- `2026-11-07T02-24-52_claude-opus-5-5_6302`
- `2026-11-07T10-06-29_claude-opus-5-5_1121`
- `2026-11-07T16-42-59_claude-opus-5-5_69d8`
- `2026-11-07T21-23-08_claude-opus-5-5_d718`
- `2026-11-08T18-33-33_rayquaza-lane-qwen36_3bb0`
- `2026-10-24T19-31-52_qwen36-gpu1_d41e`
- `2026-11-07T00-28-59_rayquaza-lane-qwen_6056`
- `2026-11-01T01-37-02_hyperqwen-gpu0_7da5`
- `2026-10-24T19-37-24_glm53-mac_6bbd`

Notes:

- **Tokens and cost.** On subscription lanes the harness records token counts as 0, so token totals for the Opus runs are unknown from their events. For `67d7` the staged release takes them from the model gateway's session record: about 659M tokens, $780.55 at API list price, not billed per token (Claude Max plan). Unknown for the others.
- **`80c8` furthest milestone.** Its `run_end.furthest_milestone` says `GRANITE_CAVE_B1F`, but the run also recorded the Knuckle Badge and later milestones. The field ranks milestones its own way; the badge milestones above are the result.
- **`b5a8` start.** The recording names no checkpoint milestone. "Before Drake" comes from the save-state's name and from the Drake win at turn 7. The game-clear stop switch was not yet in its features, which is why it played past the clear.
- **Local model ids** were file paths on the serving machine; they are shortened here to the model name and quantization.
- **Model ids** are as the endpoint listed them. The DeepSeek runs used a hosted API through a gateway, not a local model.
- **Released** means a folder anyone can download and check with `just verify-release <folder>` and their own ROM. No run here is published yet.
