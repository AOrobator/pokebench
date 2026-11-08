# Opus Rayquaza lane

Requested four narrowly scoped, default-OFF JIT decisions in a separate assisted lane. The shared control, general bundle and full Rayquaza guide recipes do not activate them. The checked-in plain boot preset is `experiments/presets/opus-rayquaza-lane.json`, selected through `POKEBENCH_PLAY_PRESET` on an authorized future Opus session launch.

The preset takes the recorded feature configuration and medium/32768 sampling from run `2026-11-07T02-24-52_claude-opus-5-5_6302` seq 0, with the original limits and sampling sourced from `runs/launch-receipts/opus55-control-4h-20261107/preset.json` (SHA-256 `b99ec0261aa1321ef3549ad107f36f4858d2f1839a2affc8a0d6d0491f06879a`). A resolved comparison against the recorded run flags found exactly the eight additions listed here. The historical harness pin was `5ad4882bc88fbaa38666cb1dde80f01f4b716174`. This is the same flag baseline on a newer source build. The changes are the four treatment flags, `bike-navigation-v1`, `bike-register-v1`, `bike-auto-mount-v1`, `rq-mach-dash-v1`, and a 24-hour wall cap. Give the same execution switches to a future matched control if estimating the four prompts' effect. The historical run differs in both source and execution flags.

| Switch | Due | Retires |
| --- | --- | --- |
| opus-rq-mach-bike-v1 | Free field in Mauville or the bike shop with known bike state | Mach Bike registered to SELECT |
| opus-rq-master-ball-v1 | Aqua Hideout B1F with known bag | Master Ball held, pickup flag, or submarine escape |
| opus-rq-catch-v1 | Native Sootopolis crisis milestone and Master Ball in bag | Rayquaza in party or encounter retired without a stored capture |
| opus-rq-moveset-v1 | Rain Badge and Rayquaza in party with a missing move and its item available | Confirmed moves or League challenge entry |

Map IDs checked against pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` in `data/maps/map_groups.json`. Reuses the guide's audited Master Ball coordinates and speedrun moveset. Context is appended at the final request seam and transition receipts use the existing `milestone_hint` event. No extra timeline lane or action tool was added. The capture prompt carries across the return trip and covers the encounter and PC overflow. Exact Sky Pillar inputs and League battle tactics are absent. The existing Mach Dash tool provides execution. Model route discovery and the complete assisted campaign are separate gates before a gameplay result can be claimed.

RED: the production `finalGuide` test observed only the original input and no Mach Bike guidance before the wiring change. Tests exercise registration, Master Ball retirement, capture and storage, move availability, and byte-identical OFF context. The viewer uses its existing knowledge-switch classification and feature-card allowlist.

## Verification

- `just test` passed with 2,969 agent, 1,242 viewer, 3,061 Python environment, and 38 Claude gateway tests. Coverage floors and no-I/O guard proofs passed. The first run exposed a history test with a hardcoded list of knowledge switches. The fixture now uses the shared classification set.
- `just lint` passed. The isolated Python environment used the installed native mGBA binding from the main checkout via a local symlink.
- The final preset passed a read-only comparison with the boot receipt. The focused recheck passed 150 agent and 179 viewer tests.
- All four Harness Config explainer links opened in an isolated headless browser at 1280, 1440, and 375 pixels. Screenshots were inspected and the preview links returned HTTP 200. The browser used a synthetic recorded run.
- Native Sky Pillar rehearsal used existing post-crisis fixture `runs/sky-pillar-test/sp1_second.state` (SHA-256 `6acffd1e1dbcf3a28c60919e7569d22530575338de1f02c4aa82016a6b3ba130`) with the lane's server switches and production game tools. Scripted inputs verified 2F (10,2), 3F (3,2), 4F (11,2), the intentional drop to the 3F pocket (7,4), the return via 4F (7,2) and 5F (3,2), and the summit landing (16,15). The initial summit-approach call omitted the required navigation citation and was refused before movement. The summit object was also outside the interaction readout at the landing tile. With the required citation, the production navigator reached (14,7). Facing north and pressing A started the native Rayquaza battle. The capture prompt now gives that approach tile on the summit.
- Independent multi-model review and landing are pending. No live Opus session was started. The scripted rehearsal used no provider tokens.
