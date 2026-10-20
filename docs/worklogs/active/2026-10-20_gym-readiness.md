# Gym readiness readout

## Operator decision

2026-10-20 6:52 PM ET, the operator: "lgtm" to the proposal in http://127.0.0.1:8791/reports/roxanne-levels/index.html (6 runs reached the Rustboro gym with a lone TORCHIC Lv12-15; ROXANNE won all 6 battles; JOSH fought in all six, TOMMY and MARC only in b300). Build `gym-readiness-readout-v1`: bundle-only, default off, seen-only.

## Design

Agent-side readout block (like people-ledger-v1), on a gym map's field only (location ends with " GYM"), after the Location/Position lines:
- `Gym: <location>` plus ` · GYM LEADER <name>` once a leader (TRAINER_CLASS_LEADER 0x20) was battled on this map
- `Your party:` species, level, HP
- `<leader>'s POKéMON seen in battle this run:` each party slot she sent out, highest level seen, or `none yet`
- `Said on this map:` field pages printed on this map that name a type ("X-type"), quoted once each
- `Trainers on this map:` from heal-before-trainers facts when present: name from a battle, else sprite kind, beaten / battled, not beaten / not beaten
No ROM trainer parties, no advice, no level targets.

## M1

- [x] RED: a8f9 fixture (trimmed gym battle states and field pages, one full gym state after the guide talk): full block, before any leader battle, trainers list, off-gym/battle/unstarted null, slot levels, type page filter, annotate anchor, event mapping, wiring ON/OFF, registry
- [x] GREEN: `gym-readiness.ts` (GymReadiness, gymEvent, withGymReadiness) wired in `playGameTools` around the people ledger; registered last (observation, needs null, default off); registry churn redone on main 5c26dc62 after whiteout-healed-v1 landed (46 agent tests, legacy-features and open-goal-prompt. Wiring deletion in play-wiring turns the production factory test red; restored.
- [x] Explainer `docs/explainers/gym-readiness-readout-v1.html` (pages-check clean), FEATURE_EXPLAINERS + server test; pending `experiments/gym-readiness-readout-v1.json` (activation RUSTBORO_CITY_GYM); readiness row; bundle switch in bundle-v-control and bundle-cook-1h
- [x] Gates (on 5c26dc62): lint clean; agent 2988, viewer 1437, pytest 2998; coverage above 90 (agent 97/93/98/99, viewer 95/91/94/98)
- [x] Review: Claude and Grok LGTM. Round 2 (packet ddfa7987…): Claude and Grok `VERDICT: LGTM` (runs/reviews/gym-readiness/). Round 1 (packet 7a925b4b…): Grok LGTM; Claude BLOCKING: the trainer flag is set only by a win, so a trainer the player lost to (ROXANNE in a8f9) read "not battled" next to her seen POKéMON. Fixed: beaten / battled, not beaten (a battle this run showed the name) / not beaten; test covers ROXANNE lost-to; copy, explainer updated. Deferred: dropping "any others not seen yet" after a win.
- [x] features.ts slot (coordinator), rebased on 9a8283d4 (changed lines identical to the reviewed packet), landed ff-only at 146d0883; `just viewer-main` restarted 8790; explainer serves 200 on 8790 and 8791. Left: the experiment hypothesis still says "beaten or not battled".
