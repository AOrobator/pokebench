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

## Multi-model review log

- Round 1 on `a1c2c76c9`, base `3b65eadfc`, diff SHA-256 `1ae2dd36aa5bc51494bdad6e5b4d64a17ce3a49bf497eb49fc6326a519caee63`. Claude BLOCKING on the missing in-battle delivery regression test. Accepted the test gap. The added test checks the real factory with a schema-valid summit encounter and rejects the wrong floor, missing ball, inactive battle and player-side Rayquaza. Mutating the position check from 1 to 0 failed the new assertion and restoring it passed all seven focused tests.
- Cursor Grok 4.5 and Grok 4.7 both returned an account usage-limit error. The operator explicitly waived Grok for this landing.

- Round 2 on `1cbcf5b68`, unchanged base `3b65eadfc`, diff SHA-256 `137b39cf75d7769a832d156d619703521f699324a5cae6514acbdfdbe8bde29a`. Claude and independent GPT both returned `VERDICT: LGTM`. The Grok waiver applies to this landing. No production changes since the full branch gates.
- Fast-forwarded local main to `1cbcf5b68` in the landing slot on November 8, 2026. The required post-merge `just test` is pending the relay's CPU START grant. Activation and gameplay have not been requested.

- Post-merge `just test` passed on main `752b6302a` (executable head `1cbcf5b68`) in the relay-granted window. Agent 2,970, viewer 1,242, environment 3,061, gateway 38. Coverage floors and no-I/O guard proofs passed. Receipt `runs/proofs/opus-rayquaza-lane/post-merge-just-test.log`. CPU RELEASE delivered.

## Lane phase 1 — Mauville Mach Bike complete

- The four switches and the `opus-rayquaza-lane` preset are on local main from `1cbcf5b68`. The preset still enables all four prompts and separate bike execution features. Phase 1 did not require a production change.
- **Decision probe.** `runs/probes/opus-mauville-mach-bike-stage1-retry-20261108` completed 32 independent stateless Opus 5.5 decisions. It used the recorded `6302` arrival turn 622 and post-heal turn 626 with eight draws per arm per case. Both arms chose the Pokémon Center on arrival (8/8 each). After healing the OFF arm chose the gym (8/8), and the ON arm chose Rydel's shop (8/8). The inputs differ by the production prompt. This is evidence for the two sampled states, with no execution or transfer claim. Samples SHA-256 `b9b39f431474c7b2eac60f270c36e5aa2f408b85fa3377c206e04c071d7c3711`. Reported usage USD 2.356012. The initial zero-sample attempt is preserved separately and reported USD 0.85872 after hitting its per-call threshold.
- **Checkpoint execution.** `2026-11-08T18-29-12_opus-mauville-bike_2248` ran a fresh Opus session on `1cbcf5b68`, loaded `6302/MAUVILLE_CITY` (SHA-1 `2123fd0a53a7f3077501727e519165e587966449`), and used the lane's feature vector. Opus healed, entered the bike shop at turn 6, acquired Mach Bike at turn 9 (seq 564), and manually registered it to SELECT at turn 19 (seq 751, owned `[259]`, registered `259`). The supervisor applied the planned stop, with terminal seq 757, 231.199 seconds, and gateway-reported USD 1.444099. Native proof is at `runs/launch-receipts/opus-mauville-mach-bike-stage2-20261108/native-bike-proof.json`, SHA-256 `919359d823baac8ab5bfb0edec42b8e2ef472bb7595b1d6a035d79dfb7b35be1`. The run stopped in the Bag. Post-registration prompt retirement is covered by the factory test. Automatic registration and auto-mount were outside this run's observed result.
- **Next discussion.** The next treatment is the Master Ball decision at AQUA HIDEOUT B1F. In `69d8`, native state seq 10641 at turn 235 is a free-field arrival at (29,2). On turns 236 and 237 Opus took (27,4) and then targeted (32,19), the main-route branch. Before sampling, inspect the exact delivered turn and verify the accessible first step of the Master Ball route. Score a legal action toward the correct branch, with item pickup reserved for a checkpoint execution check. No Master Ball probe was launched.

## Lane phase 2 — Master Ball first decision

- The frozen development study `opus-master-ball-route-32-20261108` used native settled state seq 10677 from run `2026-11-07T16-42-59_claude-opus-5-5_69d8`. The first Master Ball warp at (3,20) scored 23/32 with the existing prompt, 32/32 with the exact route, and 32/32 with the route and Rayquaza rationale. The 96 fresh draws cost USD 2.212334. The earlier 24-draw pilot is separate.
- The operator selected the exact-route wording. The existing Master Ball switch delivers the tested wording verbatim and retains its scope and retirement conditions. The probe measures the first action on one frozen snapshot. Checkpoint execution through pickup is unverified.
- RED: the focused prompt delivery test failed because the original note omitted the ordered panels.
- GREEN: all seven focused Opus lane tests, affected-package TypeScript, changed-file ESLint, explainer page validator, and diff whitespace check passed.

- The prelanding `just lint`, `just test` (including build), and `just verify-vendor` passed. Claude and GPT independently returned `VERDICT: LGTM` on base `d5f03c3a1`, head `8c1c39363`, diff SHA-256 `0ecc0b027257892386af96b3d5890f83008dcb43df2374544e4c98a49ff243dd`. Grok returned an account usage-limit error. The operator explicitly waived that lane for this prompt update.
- Fast-forwarded main to `8c1c39363` in the landing slot. Post-merge `just test` passed at that pin, including coverage and no-I/O proofs. Receipts are under `runs/proofs/opus-master-ball-route-landing/`. The updated explainer was inspected in headless Chromium at 375 and 1280 pixels. Gameplay pickup remains unverified.
